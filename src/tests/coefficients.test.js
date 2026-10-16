import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { countryRanking, accessFor, clubTotal, countryTotal, ensureCoefficients, seasonPoints, liveRanking } from '../core/coefficients.js';
import { CONTINENTAL_IDS, FULL_SIZE } from '../core/continental.js';
import { meetingsFor } from '../core/calendar.js';
import { EUROPE_NATIONS } from '../core/europe.js';
import { GUEST_CLUBS } from '../core/guests.js';
import { serialize, deserialize } from '../core/save.js';

const w = generateWorld({ seed: 'coef' });
const g = startCareer(w, w.competitions['ENG-L1'].clubIds[4], 'Coef');
g.manager.board.standing = 100;

test('access list: every competition has 36 places, the top countries most', () => {
  for (const [i, comp] of ['CCC', 'CEL', 'CCL'].entries()) {
    let sum = 0;
    for (let r = 1; r <= 60; r++) sum += Object.values(accessFor(r))[i];
    assertEq(sum, 36, `${comp} places`);
  }
  assertEq(accessFor(1).CCC, 4);
  assertEq(accessFor(17).CCC, 1, '17th still has a Champions Cup place');
  assertEq(accessFor(18).CCC, 0);
});

test('coefficients start from the real 2026 ranking; Iran 17th', () => {
  const r = countryRanking(g);
  assertEq(r.slice(0, 5).map((x) => x.nationId).join(), 'ENG,ITA,ESP,GER,FRA', 'top five');
  assertBetween(countryTotal(g, 'ENG'), 119.5, 119.55, 'England total');
  const iran = r.find((x) => x.nationId === 'IRN');
  if (g.nations.IRN) assertEq(iran?.rank, 17, 'Iran');
  const top = Object.values(g.clubs).sort((a, b) => clubTotal(g, b.id) - clubTotal(g, a.id))[0];
  info(`Top club coefficient: ${top.name} ${clubTotal(g, top.id).toFixed(3)}; ranking: ${r.slice(0, 26).map((x) => `${x.rank}.${x.nationId}`).join(' ')}`);
  // A small club of a strong country gets 20 % of its country's coefficient.
  const small = g.clubs[g.competitions['ENG-L2'].clubIds.at(-1)];
  assertBetween(clubTotal(g, small.id), 0.2 * countryTotal(g, 'ENG') - 0.01, 0.2 * countryTotal(g, 'ENG') + 0.01, 'country floor');
});

test('the new league countries: one division (Iran two), small leagues meet more often', () => {
  for (const n of EUROPE_NATIONS) {
    const nation = g.nations[n.id];
    assert(nation && nation.leagueIds.length === n.leagues.length, `${n.id} leagues`);
    assert(nation.foreign, `${n.id} has no national team`);
    const top = g.competitions[nation.leagueIds[0]];
    assertEq(top.relegate, n.leagues.length > 1 ? 3 : 0, `${n.id} relegation`);
    const games = top.fixtureIds.filter((id) => { const f = g.fixtures[id]; return f.homeId === top.clubIds[0] || f.awayId === top.clubIds[0]; }).length;
    assertEq(games, meetingsFor(top.clubIds.length) * (top.clubIds.length - 1), `${n.id} games per club`);
  }
  // League clubs of the new countries are never also guests (a guest from such a country is a club outside its league).
  const leagueClubs = new Set(EUROPE_NATIONS.flatMap((n) => n.clubs.flat().map((r) => r[0])));
  assert(!Object.values(g.clubs).some((c) => c.guest && leagueClubs.has(c.baseName)), 'a league club is also a guest');
  info(`${EUROPE_NATIONS.length} new league countries, ${Object.keys(g.clubs).length} clubs, ${Object.keys(g.players).length} players`);
});

test('a season of results updates the coefficients and the places', () => {
  const before = countryTotal(g, 'ENG', g.season.year + 1);
  simulateRestOfSeason(g);
  const year = g.season.year;
  // The live view during the season matches what the season end records.
  const live = seasonPoints(g);
  const next = liveRanking(g);
  endSeason(g);
  const co = ensureCoefficients(g);
  for (const n of Object.keys(live.country)) assertEq(co.country[n][year], live.country[n], `${n} live points`);
  assertEq(next.map((r) => r.nationId).join(), countryRanking(g).map((r) => r.nationId).join(), 'next season as it stood');
  assert(Object.keys(co.country).every((n) => co.country[n][year] !== undefined), 'every country has a score for the season');
  assert(co.country.ENG[year] > 0, 'England scored');
  assert(countryTotal(g, 'ENG') !== before || co.country.ENG[year] === co.country.ENG[year - 5], 'total moved on a season');
  for (const id of CONTINENTAL_IDS) assertEq(g.competitions[id].clubIds.length, FULL_SIZE, `${id} full`);
  const all = CONTINENTAL_IDS.flatMap((id) => g.competitions[id].clubIds);
  assertEq(new Set(all).size, all.length, 'no club twice');
  const byNation = {};
  for (const id of g.competitions.CCC.clubIds) byNation[g.clubs[id].nationId] = (byNation[g.clubs[id].nationId] || 0) + 1;
  info(`Champions Cup ${year + 1}: ${Object.entries(byNation).map(([n, k]) => `${n} ${k}`).join(', ')}`);
  info(`Ranking after ${year}/${year + 1}: ${countryRanking(g).slice(0, 20).map((x) => `${x.nationId} ${x.total.toFixed(1)}`).join(', ')}`);
});

test('an older save (version 15) gets the new league countries; its guests join their leagues', () => {
  const old = generateWorld({ seed: 'v15' });
  startCareer(old, old.competitions['ESP-L1'].clubIds[6], 'Old');
  const guestNames = new Set(GUEST_CLUBS.map((r) => r[0]));
  const kept = {};
  // Rebuild a version 15 world: no league countries beyond the six; their European clubs were guests.
  for (const n of EUROPE_NATIONS) {
    const nation = old.nations[n.id];
    for (const compId of [...nation.leagueIds, nation.cupId]) {
      for (const id of old.competitions[compId].clubIds) {
        const c = old.clubs[id];
        if (!c || c.compId !== compId && compId === nation.cupId) continue;
        if (guestNames.has(c.baseName)) {
          c.guest = true;
          c.compId = 'GUEST';
          old.competitions.GUEST.clubIds.push(c.id);
          kept[c.id] = c.squad.length;
        } else {
          for (const pid of c.squad) delete old.players[pid];
          delete old.clubs[id];
        }
      }
      delete old.competitions[compId];
    }
    nation.leagueIds = [];
    nation.cupId = null;
  }
  for (const f of Object.values(old.fixtures)) {
    const gone = (id) => !old.clubs[id] && !old.national?.teams[id];
    if (!old.competitions[f.compId] || gone(f.homeId) || gone(f.awayId)) delete old.fixtures[f.id];
  }
  for (const c of Object.values(old.competitions)) if (c.clubIds) c.clubIds = c.clubIds.filter((id) => old.clubs[id] || old.national?.teams[id]);
  delete old.coefficients;
  old.version = 15;
  const m = deserialize(serialize(old));
  for (const n of EUROPE_NATIONS) {
    assertEq(m.nations[n.id].leagueIds.length, n.leagues.length, `${n.id} leagues back`);
    n.leagues.forEach((_, t) => assertEq(m.competitions[`${n.id}-L${t + 1}`].clubIds.length, n.clubs[t].length, `${n.id}-L${t + 1} clubs`));
  }
  for (const [id, size] of Object.entries(kept)) {
    assert(!m.clubs[id].guest && m.clubs[id].compId !== 'GUEST', `${m.clubs[id].name} joined its league`);
    assertEq(m.clubs[id].squad.length, size, 'squad kept');
  }
  m.manager.board.standing = 100;
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over', 'the season finishes');
  endSeason(m);
  const por = m.competitions['POR-L1'];
  assert(por.fixtureIds.length > 0, 'the new leagues play from the next season');
  info(`Migrated: ${Object.keys(kept).length} guests joined their leagues`);
});
