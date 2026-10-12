import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason, seasonComplete, advanceToUserMatch, playUserMatchInstant } from '../core/matchday.js';
import { sortedTable } from '../core/season.js';
import { lineupQuality } from '../core/ratings.js';
import { serialize, deserialize } from '../core/save.js';

function spearman(a, b) {
  const n = a.length;
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (a[i] - b[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

const world = generateWorld({ seed: 'season' });
const g = startCareer(world, world.competitions['ENG-L1'].clubIds[4], 'Sim');
const preQuality = {};
for (const c of Object.values(g.clubs)) preQuality[c.id] = lineupQuality(g, c);

test('CONTINUE stops on the user\'s match day with that match unplayed', () => {
  const f = advanceToUserMatch(g);
  assert(f && !f.result, 'expected an unplayed user fixture');
  assertEq(g.day, f.day, 'day');
  const others = Object.values(g.fixtures).filter((x) => x.day === f.day && x.id !== f.id);
  assert(others.every((x) => x.result), 'other fixtures that day should already be played');
  playUserMatchInstant(g, f);
  assert(f.result, 'user fixture played');
});

test('a whole season simulates: every fixture played, cups won, tables consistent', () => {
  const t0 = performance.now();
  simulateRestOfSeason(g);
  const ms = performance.now() - t0;
  assert(seasonComplete(g), 'season not complete');
  assertEq(g.season.phase, 'over');
  info(`Full season (${Object.keys(g.fixtures).length} matches) simulated in ${(ms / 1000).toFixed(1)} s`);

  for (const comp of Object.values(g.competitions)) {
    if (comp.type === 'national') continue; // tested in national.test.js
    if (comp.type === 'guest') continue; // guest clubs have no league
    if (comp.type === 'continental') {
      assert(comp.winnerId, 'continental cup has no winner');
      continue;
    }
    if (comp.type === 'cup') {
      assert(comp.winnerId && comp.clubIds.includes(comp.winnerId), comp.name + ' has no winner');
      info(`${comp.name} winner: ${g.clubs[comp.winnerId].name} (tier ${g.competitions[g.clubs[comp.winnerId].compId].tier})`);
      continue;
    }
    const rows = sortedTable(g, comp);
    const n = rows.length;
    let pts = 0, gf = 0, ga = 0, wins = 0, draws = 0;
    for (const r of rows) {
      assertEq(r.p, 2 * (n - 1), comp.name + ' games played:');
      assertEq(r.w + r.d + r.l, r.p, 'w+d+l');
      assertEq(r.pts, r.w * 3 + r.d, 'points');
      pts += r.pts; gf += r.gf; ga += r.ga; wins += r.w; draws += r.d;
    }
    assertEq(gf, ga, 'goals for/against');
    assertEq(draws % 2, 0, 'draws pair up');
    const games = n * (n - 1);
    const qualityRank = rows.map((r) => r.clubId).sort((a, b) => preQuality[b] - preQuality[a]);
    const rho = spearman(rows.map((r) => qualityRank.indexOf(r.clubId)), rows.map((_, i) => i));
    const champ = g.clubs[rows[0].clubId];
    info(`${comp.name}: champion ${champ.name} (${rows[0].pts} pts, quality rank ${qualityRank.indexOf(champ.id) + 1}), `
      + `${(gf / games).toFixed(2)} goals/game, quality-vs-finish rank correlation ${rho.toFixed(2)}`);
    assert(rho > 0.4, `${comp.name}: final table barely related to team quality (rho ${rho.toFixed(2)})`);
  }
});

test('season statistics are recorded on players', () => {
  const ps = Object.values(g.players);
  const goals = ps.reduce((s, p) => s + p.stats.season.goals, 0);
  // Club goals only: internationals count as caps and international goals instead.
  const fixtureGoals = Object.values(g.fixtures).filter((f) => g.competitions[f.compId].type !== 'national')
    .reduce((s, f) => s + f.result.h + f.result.a, 0);
  assertEq(goals, fixtureGoals, 'player goals vs fixture goals:');
  const top = ps.slice().sort((a, b) => b.stats.season.goals - a.stats.season.goals)[0];
  info(`Top scorer: ${top.first} ${top.last} (${g.clubs[top.clubId].name}) with ${top.stats.season.goals} goals`);
  assert(top.stats.season.goals >= 15 && top.stats.season.goals <= 45, 'top scorer tally looks unrealistic');
});

test('a finished season survives a save round-trip', () => {
  const text = serialize(g);
  info(`Save size after a full season: ${(text.length / 1024).toFixed(0)} KB`);
  assertEq(JSON.stringify(deserialize(text)), JSON.stringify(g));
});
