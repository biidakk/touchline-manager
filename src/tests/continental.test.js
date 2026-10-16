import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { CONTINENTAL_ID, CONTINENTAL_IDS, FIRST_SEASON, QUOTAS, FULL_SIZE, leagueTable, knockoutSize, matchesFor, continentalOf, PRIZES }
  from '../core/continental.js';
import { GUEST_FIRST_SEASON, GUEST_CLUBS } from '../core/guests.js';
import { countryRanking } from '../core/coefficients.js';
import { weekday } from '../core/calendar.js';
import { serialize, deserialize } from '../core/save.js';

const w = generateWorld({ seed: 'continental' });
const g = startCareer(w, w.competitions['ENG-L1'].clubIds[0], 'Euro');
const comps = () => CONTINENTAL_IDS.map((id) => g.competitions[id]);
const names = (c) => c.clubIds.map((id) => g.clubs[id].baseName);

test('first season: the clubs really in the 2026/27 league phases (36 each, guests included)', () => {
  const [cl] = comps();
  for (const c of comps()) {
    assertEq(c.clubIds.length, 36, `${c.id} size`);
    // The real line-up: the six original countries' clubs plus the rest (league clubs of the
    // newer countries and guests), all by their game names.
    const all = c.clubIds.map((id) => g.clubs[id].baseName).sort().join('|');
    assertEq(all, [...FIRST_SEASON[c.id], ...GUEST_FIRST_SEASON[c.id]].sort().join('|'), `${c.id} clubs`);
  }
  const all = comps().flatMap((c) => c.clubIds);
  assertEq(new Set(all).size, all.length, 'no club in two competitions');
  assertEq(g.clubs[continentalOf(g, cl.clubIds[0]).clubIds[0]].id, cl.clubIds[0]);
  info(`Champions Cup: ${names(cl).join(', ')}`);
});

test('league phase: different opponents, half at home, on Tuesdays and Thursdays, no double bookings', () => {
  for (const c of comps()) {
    const M = matchesFor(c.id, c.clubIds.length);
    assertEq(c.matches, M, `${c.id} matches`);
    const fx = Object.values(g.fixtures).filter((f) => f.compId === c.id && f.phase === 'league');
    assertEq(fx.length, (c.clubIds.length * M) / 2, `${c.id} fixtures`);
    for (const id of c.clubIds) {
      const mine = fx.filter((f) => f.homeId === id || f.awayId === id);
      assertEq(mine.length, M, `${g.clubs[id].name} matches`);
      assertEq(new Set(mine.map((f) => (f.homeId === id ? f.awayId : f.homeId))).size, M, 'opponents differ');
      assertEq(mine.filter((f) => f.homeId === id).length, M / 2, 'half at home');
    }
    const day = c.id === 'CCC' ? 2 : 4;
    assert(fx.every((f) => weekday(f.day) === day), `${c.id} not on its weekday`);
    const same = fx.filter((f) => g.clubs[f.homeId].nationId === g.clubs[f.awayId].nationId).length;
    info(`${c.name}: ${c.clubIds.length} clubs, ${M} matches each, ${new Set(fx.map((f) => f.day)).size} matchdays, ${same} same-country games, last ${knockoutSize(c.clubIds.length)} in the knockouts`);
  }
  const seen = new Set();
  for (const f of Object.values(g.fixtures)) {
    for (const c of [f.homeId, f.awayId]) {
      assert(!seen.has(c + '@' + f.day), 'double booking ' + c + '@' + f.day);
      seen.add(c + '@' + f.day);
    }
  }
});

test('knockouts: top places straight through, play-offs for the next, two legs, a one-match final', () => {
  simulateRestOfSeason(g);
  for (const c of comps()) {
    assert(c.winnerId && c.clubIds.includes(c.winnerId), `${c.id} has no winner`);
    const n = c.clubIds.length;
    const K = knockoutSize(n);
    assert(leagueTable(g, c).every((r) => r.p === c.matches), 'league phase incomplete');
    const order = leagueTable(g, c).map((r) => r.clubId);
    const po = c.rounds[0];
    const inPlayoff = po.fixtureIds.flatMap((id) => [g.fixtures[id].homeId, g.fixtures[id].awayId]);
    assert(order.slice(0, K / 2).every((id) => !inPlayoff.includes(id)), 'a top club played the play-offs');
    assertEq(new Set([...inPlayoff, ...po.byes]).size, Math.min(K, n - K / 2), 'play-off clubs');
    const next = c.rounds[1].fixtureIds.map((id) => g.fixtures[id]);
    assertEq(new Set(next.flatMap((f) => [f.homeId, f.awayId])).size, K, `${c.rounds[1].name} clubs`);
    assert(order.slice(0, K / 2).every((id) => next.some((f) => f.leg === 2 && f.homeId === id)), 'top clubs at home in the second leg');
    for (const r of c.rounds.slice(0, -1)) {
      const fx = r.fixtureIds.map((id) => g.fixtures[id]);
      assert(fx.filter((f) => f.leg === 2).every((f) => f.result.winner) && fx.filter((f) => f.leg === 1).every((f) => !f.result.winner), `${r.name}: legs`);
    }
    assertEq(c.rounds.at(-1).fixtureIds.length, 1, 'the final is one match');
    info(`${c.name} winner: ${g.clubs[c.winnerId].name}; rounds ${c.rounds.map((r) => r.name).join(', ')}`);
  }
});

test('prize money as UEFA pays it, at a fifth: starting fee, wins and draws, ranking, each round reached', () => {
  // Guest clubs earn only European prize money, so their books show it exactly.
  let checked = 0;
  for (const c of comps()) {
    const P = PRIZES[c.id];
    const order = leagueTable(g, c).map((r) => r.clubId);
    const K = c.knockout;
    const reach = (k) => (k === 0 ? P.playoff : [P.final, P.sf, P.qf, P.last16][c.rounds.length - 1 - k]);
    const inRound = (r, id) => r.byes.includes(id) || r.fixtureIds.some((x) => g.fixtures[x].homeId === id || g.fixtures[x].awayId === id);
    const expected = (id) => {
      let sum = P.start;
      for (const f of Object.values(g.fixtures)) {
        if (f.compId !== c.id || f.phase !== 'league' || (f.homeId !== id && f.awayId !== id)) continue;
        const { h, a } = f.result;
        if (h === a) sum += P.draw;
        else if ((h > a) === (f.homeId === id)) sum += P.win;
      }
      const i = order.indexOf(id);
      sum += P.share * (order.length - i) + (i < 8 ? P.top8 : i < 16 ? P.top16 : 0);
      if (i >= K / 2 && i < K / 2 + K) sum += reach(0);
      c.rounds.forEach((r, k) => { if (k > 0 && inRound(r, id)) sum += reach(k); });
      if (c.winnerId === id) sum += P.winner;
      return sum;
    };
    for (const id of c.clubIds.filter((x) => g.clubs[x].guest)) {
      assertBetween(g.clubs[id].finance.season.prizes, expected(id) - 1, expected(id) + 1, `${c.id} ${g.clubs[id].name}`);
      checked++;
    }
    info(`${c.name}: winner earns ${(expected(c.winnerId) / 1e6).toFixed(1)}M, last in the league phase ${(expected(order.at(-1)) / 1e6).toFixed(1)}M`);
  }
  assert(checked >= 10, `only ${checked} guest clubs checked`);
});

test('two-legged ties are decided on aggregate, then extra time and penalties', () => {
  const ties = Object.values(g.fixtures).filter((f) => f.leg === 2);
  assert(ties.length > 20, 'second legs');
  for (const f of ties) {
    const first = g.fixtures[f.firstLegId];
    assert(first.homeId === f.awayId && first.awayId === f.homeId, 'second leg at the other ground');
    assert(first.day < f.day, 'second leg before the first');
    const agg = { h: f.result.h + first.result.a, a: f.result.a + first.result.h };
    assertEq(`${f.result.agg.h}:${f.result.agg.a}`, `${agg.h}:${agg.a}`, 'aggregate');
    if (agg.h !== agg.a) assertEq(f.result.winner, agg.h > agg.a ? f.homeId : f.awayId, 'aggregate winner');
    else assert(f.result.pens, 'level on aggregate without penalties');
  }
});

test('season end records all three, and next season places come from the tables and cups', () => {
  const winners = comps().map((c) => c.winnerId);
  const s = endSeason(g);
  assertEq(s.continentals.length, 3, 'three finals');
  assertEq(s.continental.winnerId, winners[0], 'Champions Cup first');
  comps().forEach((c, i) => {
    assertEq(c.history.length, 1);
    assert(g.clubs[winners[i]].trophies.some((t) => t.compId === c.id), `${c.id} trophy`);
  });
  const ger = g.competitions['GER-L1'].history.at(-1).table.map((r) => r.clubId).filter((id) => g.clubs[id].compId === 'GER-L1');
  const inCl = g.competitions.CCC.clubIds.filter((id) => g.clubs[id].nationId === 'GER');
  assertEq(inCl.slice().sort().join(), ger.slice(0, inCl.length).sort().join(), 'Champions Cup from the top of the table');
  const cupWinner = g.competitions[g.nations.GER.cupId].history.at(-1).winnerId;
  assert(g.competitions.CCC.clubIds.includes(cupWinner) || g.competitions.CEL.clubIds.includes(cupWinner), 'cup winner in Europe');
  // Places by the country ranking: every country with enough clubs gets at least its share.
  for (const { nationId, places } of countryRanking(g)) {
    if (!g.nations[nationId].leagueIds.length) continue;
    for (const id of CONTINENTAL_IDS) {
      const have = g.competitions[id].clubIds.filter((x) => g.clubs[x].nationId === nationId).length;
      assert(have >= places[id], `${nationId} ${id}: ${have} of ${places[id]} places`);
    }
  }
  for (const id of CONTINENTAL_IDS) assertEq(g.competitions[id].clubIds.length, FULL_SIZE, `${id} size`);
  const all = comps().flatMap((c) => c.clubIds);
  assertEq(new Set(all).size, all.length, 'no club in two competitions');
});

test('an old save with the group-stage Champions Cup plays it out, then switches to the new format', () => {
  const old = generateWorld({ seed: 'old-groups' });
  startCareer(old, old.competitions['ITA-L1'].clubIds[2], 'Old');
  // Rebuild the competition as an older version had it: four groups of four.
  for (const id of CONTINENTAL_IDS) {
    for (const f of Object.values(old.fixtures)) if (f.compId === id) delete old.fixtures[f.id];
    if (id !== CONTINENTAL_ID) delete old.competitions[id];
  }
  const cc = old.competitions[CONTINENTAL_ID];
  const ids = cc.clubIds.slice(0, 16);
  const day0 = old.season.weekends[4] + 3;
  cc.groups = [0, 1, 2, 3].map((gi) => {
    const club4 = ids.slice(gi * 4, gi * 4 + 4);
    const table = Object.fromEntries(club4.map((id) => [id, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] }]));
    const fixtureIds = [];
    // Six matchdays, each club once per matchday (a round robin, then the return games).
    const rounds = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
    [...rounds, ...rounds.map((r) => r.map(([x, y]) => [y, x]))].forEach((pairs, md) => {
      for (const [a, b] of pairs) {
        const id = 'fx' + gi + a + b;
        old.fixtures[id] = { id, compId: CONTINENTAL_ID, day: old.season.weekends[4 + 2 * md] + 3, round: md + 1, homeId: club4[a], awayId: club4[b], result: null, group: gi };
        fixtureIds.push(id);
      }
    });
    return { name: 'ABCD'[gi], clubIds: club4, table, fixtureIds };
  });
  cc.clubIds = ids;
  cc.stage = 'groups';
  delete cc.format;
  cc.rounds = [['Quarter-finals', 0.62, 0.66], ['Semi-finals', 0.74, 0.78], ['Final', 0.92]].map(([name, a, b]) => ({ name,
    day: old.season.weekends[Math.round(old.season.weekends.length * a)] + 3, ...(b < 0.9 ? { day2: old.season.weekends[Math.round(old.season.weekends.length * b)] + 3 } : {}),
    fixtureIds: [], byes: [], drawn: false }));
  assert(day0 > old.day, 'groups ahead');
  old.version = 13;
  const m = deserialize(serialize(old));
  assert(m.competitions.CEL && m.competitions.CCL, 'new competitions added');
  m.manager.board.standing = 100;
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over', 'season should finish');
  assert(m.competitions[CONTINENTAL_ID].winnerId, 'old-format Champions Cup won');
  endSeason(m);
  const c = m.competitions[CONTINENTAL_ID];
  assert(!c.groups.length && c.clubIds.length === 36 && Object.keys(c.table).length === 36, 'new format next season');
});

test('an old save without the competition is migrated and plays a normal season', () => {
  const old = generateWorld({ seed: 'old-cc' });
  for (const id of CONTINENTAL_IDS) delete old.competitions[id];
  for (const f of Object.values(old.fixtures)) if (CONTINENTAL_IDS.includes(f.compId)) delete old.fixtures[f.id];
  old.version = 3;
  const m = deserialize(serialize(old));
  assert(m.competitions[CONTINENTAL_ID], 'competition added');
  startCareer(m, m.competitions['CZE-L1'].clubIds[0], 'Old');
  m.manager.board.standing = 100; // a patient board: a sacking would stop the simulated season
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over', 'season should finish without a continental cup');
  endSeason(m);
  assertEq(m.competitions[CONTINENTAL_ID].clubIds.length, 36, 'starts the following season');
});

test('guest clubs: added to older saves, only in Europe, never a job, no national teams, real names from a pack', () => {
  const old = generateWorld({ seed: 'old-guests' });
  // A version 14 save had no guests.
  for (const c of Object.values(old.clubs).filter((x) => x.guest)) {
    for (const id of c.squad) delete old.players[id];
    delete old.clubs[c.id];
  }
  for (const n of Object.values(old.nations).filter((x) => x.guest)) delete old.nations[n.id];
  delete old.competitions.GUEST;
  for (const id of CONTINENTAL_IDS) old.competitions[id].clubIds = old.competitions[id].clubIds.filter((x) => old.clubs[x]);
  for (const f of Object.values(old.fixtures)) if (!old.clubs[f.homeId] && !old.national?.teams[f.homeId] || !old.clubs[f.awayId] && !old.national?.teams[f.awayId]) delete old.fixtures[f.id];
  old.version = 14;
  const m = deserialize(serialize(old));
  const guests = Object.values(m.clubs).filter((c) => c.guest);
  const leagueNames = new Set(Object.values(m.clubs).filter((c) => !c.guest).map((c) => c.baseName));
  const expected = GUEST_CLUBS.filter((r) => !leagueNames.has(r[0])).length;
  assertEq(guests.length, expected, 'guest clubs added (countries without a league)');
  for (const c of guests) {
    assertEq(c.compId, 'GUEST');
    assert(m.nations[c.nationId].foreign && !m.competitions[c.compId].table[c.id], `${c.name}: no league and no national team`);
    assert(c.squad.length >= 20 && c.lineup, `${c.name} squad`);
  }
  assert(!Object.keys(m.national.teams).some((id) => m.nations[id.replace(/^NT-/, '').replace(/-21$/, '')]?.guest), 'no national teams for guest countries');
  const big = guests.slice().sort((a, b) => b.reputation - a.reputation)[0];
  const gib = guests.find((c) => c.baseName === 'Gibraltar Imps');
  assert(big.reputation > gib.reputation + 15, 'big and small guests');
});
