import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { serialize, deserialize } from '../core/save.js';
import { takeJob, confidence } from '../core/board.js';

const SEASONS = 20;
const world = generateWorld({ seed: 'career20' });
const g = startCareer(world, world.competitions['GER-L2'].clubIds[5], 'Long');
const sizes = Object.fromEntries(Object.values(g.competitions).map((c) => [c.id, c.clubIds.length]));
const startBudget = Object.fromEntries(Object.values(g.clubs).map((c) => [c.id, c.budget]));
const leagueNations = () => Object.values(g.nations).filter((n) => n.leagueIds.length);
const avgSkill = (compId) => {
  const ps = g.competitions[compId].clubIds.flatMap((id) => g.clubs[id].squad.map((p) => g.players[p].skill));
  return ps.reduce((a, b) => a + b, 0) / ps.length;
};
const start = {};
for (const n of leagueNations()) for (const id of n.leagueIds) start[id] = avgSkill(id);

const log = [];
const moves = [];
let devYoung = [];
let devOld = [];
let totalTime = 0;

test(`a ${SEASONS}-season career runs and the world stays healthy`, () => {
  for (let s = 0; s < SEASONS; s++) {
    const year = g.season.year;
    // Development check subjects for this season.
    const young = Object.values(g.players).filter((p) => year - p.birthYear <= 19 && p.potential - p.skill >= 15);
    const old = Object.values(g.players).filter((p) => year - p.birthYear >= 33);
    const before = new Map([...young, ...old].map((p) => [p.id, p.skill]));
    const t0 = performance.now();
    simulateRestOfSeason(g);
    // Sacked mid-season: take the first offer and carry on.
    while (g.manager.sacked) {
      moves.push(`${year}: sacked by ${g.manager.sacked.clubName}`);
      assert(takeJob(g, g.manager.offers[0].clubId).ok, 'could not take a job after the sack');
      simulateRestOfSeason(g);
    }
    const summary = endSeason(g);
    if (g.manager.sacked) {
      moves.push(`${year}: sacked by ${g.manager.sacked.clubName} at season end`);
      assert(takeJob(g, g.manager.offers[0].clubId).ok, 'could not take a job after the sack');
    }
    totalTime += performance.now() - t0;
    const gain = (list) => list.filter((p) => g.players[p.id]).map((p) => g.players[p.id].skill - before.get(p.id));
    devYoung = devYoung.concat(gain(young));
    devOld = devOld.concat(gain(old));

    // Structure checks every season.
    const seen = new Set();
    for (const n of leagueNations()) {
      for (const id of n.leagueIds) {
        const c = g.competitions[id];
        assertEq(c.clubIds.length, sizes[id], `${c.name} size:`);
        for (const cid of c.clubIds) {
          assert(!seen.has(cid), 'club in two leagues');
          seen.add(cid);
          assertEq(g.clubs[cid].compId, id, 'club compId');
        }
      }
    }
    assertEq(seen.size, Object.values(g.clubs).filter((c) => !c.guest).length, 'every club in a league');
    for (const club of Object.values(g.clubs)) {
      const min = club.id === g.userClubId ? 18 : 22;
      assertBetween(club.squad.length, min, 34, `${club.name} squad size`);
      for (const id of club.squad) assert(g.players[id] && g.players[id].clubId === club.id, 'dangling squad entry');
      for (const id of [...club.lineup.slots, ...club.lineup.bench]) assert(!id || club.squad.includes(id), 'lineup player not in squad');
    }
    const ps = Object.values(g.players);
    const avgAge = ps.reduce((a, p) => a + (g.season.year - p.birthYear), 0) / ps.length;
    const line = `${year}: players ${ps.length}, avg age ${avgAge.toFixed(1)}, `
      + leagueNations().map((n) => `${n.id} ${n.leagueIds.map((id) => avgSkill(id).toFixed(1)).join('/')}`).join(', ')
      + `, user ${summary.user.pos}. ${summary.user.promoted ? '(promoted)' : summary.user.relegated ? '(relegated)' : ''}`;
    log.push(line);
    if (s % 4 === 3 || s === 0) info('  ' + line);
    assertBetween(ps.length, 22 * Object.keys(g.clubs).length, 34 * Object.keys(g.clubs).length, 'player count');
    assertBetween(avgAge, 23, 29, 'average age');
  }
  // The countries keep their character: England's top league stays clearly stronger than the Czech one.
  const val = avgSkill('ENG-L1');
  const brv = avgSkill('CZE-L1');
  info(`Top-league gap after ${SEASONS} seasons: England ${val.toFixed(1)} vs Czech Republic ${brv.toFixed(1)} (start ${start['ENG-L1'].toFixed(1)} vs ${start['CZE-L1'].toFixed(1)})`);
  assert(val - brv >= 3, 'the countries have drifted together');
  for (const [id, s0] of Object.entries(start)) {
    const s1 = avgSkill(id);
    assert(Math.abs(s1 - s0) <= 7, `${g.competitions[id].name}: average skill drifted from ${s0.toFixed(1)} to ${s1.toFixed(1)}`);
  }
  info(`${SEASONS} seasons simulated in ${(totalTime / 1000).toFixed(1)} s`);
  // Club money neither explodes nor collapses over a long career.
  const ratios = Object.values(g.clubs).filter((c) => c.id !== g.userClubId)
    .map((c) => c.budget / startBudget[c.id]).sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)];
  const broke = ratios.filter((r) => r < 0).length;
  info(`Club budgets after ${SEASONS} seasons: median ${median.toFixed(2)}x the start, ${broke} clubs in debt, transfers ${g.transfers.length}+ recorded`);
  assertBetween(median, 0.3, 6, 'median budget ratio');
  assert(broke <= 25, 'too many AI clubs in debt');
});

test('players develop at the planned rates', () => {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  info(`Development per season: talented players aged <=19: ${mean(devYoung).toFixed(2)} (n=${devYoung.length}); aged 33+: ${mean(devOld).toFixed(2)} (n=${devOld.length})`);
  assertBetween(mean(devYoung), 3, 8, 'young talent growth');
  assertBetween(mean(devOld), -5, -1, 'veteran decline');
});

test('career history, trophies and records are kept', () => {
  assertEq(g.manager.history.length, SEASONS, 'manager seasons');
  const user = g.clubs[g.userClubId];
  assertEq(user.history.length, SEASONS, 'club history');
  for (const c of Object.values(g.competitions).filter((x) => x.type !== 'guest' && x.type !== 'friendly')) assertEq(c.history.length, SEASONS, `${c.name} history`);
  const won = g.manager.history.reduce((a, h) => a + h.trophies.length, 0);
  assertEq(g.history.trophies.length, won, 'trophies list');
  info(`User club: ${user.name}; trophies ${won}; finishes: ${g.manager.history.map((h) => `${h.tier}.${h.pos}`).join(' ')}`);
  info(`Manager reputation ${g.manager.reputation}, board confidence ${confidence(g)}; ${moves.length ? moves.join('; ') : 'never sacked'}; clubs: ${g.manager.stints.map((s) => s.clubName).join(', ')}`);
});

test(`a ${SEASONS}-season save stays small and loads`, () => {
  const text = serialize(g);
  info(`Save size after ${SEASONS} seasons: ${(text.length / 1024).toFixed(0)} KB`);
  // The text of a 20-season save in a 26-country world; IndexedDB stores it gzip-compressed (a few MB).
  assert(text.length < 32 * 1024 * 1024, 'save too large');
  assertEq(deserialize(text).season.year, g.season.year);
});
