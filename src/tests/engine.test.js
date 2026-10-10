import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld } from '../core/worldgen.js';
import { createMatch, runToEnd, winnerSide, step } from '../core/engine.js';
import { autoLineup } from '../core/ai.js';
import { lineupQuality } from '../core/ratings.js';
import { Rng } from '../core/rng.js';

const world = generateWorld({ seed: 'engine' });
for (const c of Object.values(world.clubs)) c.lineup = autoLineup(world, c);
const leagues = Object.values(world.competitions).filter((c) => c.type === 'league');

function randomPairs(n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const comp = rng.pick(leagues);
    const h = rng.pick(comp.clubIds);
    let a = rng.pick(comp.clubIds);
    while (a === h) a = rng.pick(comp.clubIds);
    out.push({ homeId: h, awayId: a });
  }
  return out;
}

test('same seed gives the same match', () => {
  const f = { homeId: leagues[0].clubIds[0], awayId: leagues[0].clubIds[1] };
  const a = runToEnd(world, createMatch(world, f, { seed: 99 }));
  const b = runToEnd(world, createMatch(world, f, { seed: 99 }));
  assertEq(JSON.stringify(a.events), JSON.stringify(b.events));
});

test('calibration: goals, home advantage, cards and injuries look realistic', () => {
  const rng = new Rng(1234);
  const N = 4000;
  let goals = 0, hw = 0, dr = 0, aw = 0, nil = 0, yellow = 0, red = 0, inj = 0, shots = 0, subs = 0;
  let strongGames = 0, strongWins = 0, strongLosses = 0;
  const scores = {};
  randomPairs(N, rng).forEach((f, i) => {
    const m = runToEnd(world, createMatch(world, f, { seed: i + 1, keepEvents: true }));
    const [h, a] = m.sides;
    goals += h.goals + a.goals;
    if (h.goals > a.goals) hw++; else if (h.goals < a.goals) aw++; else dr++;
    if (h.goals + a.goals === 0) nil++;
    const key = `${Math.min(h.goals, 5)}-${Math.min(a.goals, 5)}`;
    scores[key] = (scores[key] || 0) + 1;
    yellow += h.stats.yellow + a.stats.yellow;
    red += h.stats.red + a.stats.red;
    inj += h.injured.length + a.injured.length;
    shots += h.stats.shots + a.stats.shots;
    subs += h.subsUsed + a.subsUsed;
    const qh = lineupQuality(world, world.clubs[f.homeId]);
    const qa = lineupQuality(world, world.clubs[f.awayId]);
    if (Math.abs(qh - qa) >= 6) {
      strongGames++;
      const strongSide = qh > qa ? 0 : 1;
      const w = winnerSide(m);
      if (w === strongSide) strongWins++;
      else if (w === 1 - strongSide) strongLosses++;
    }
  });
  const pct = (x) => (100 * x / N).toFixed(1) + '%';
  info(`Engine over ${N} matches: ${(goals / N).toFixed(2)} goals/game, home ${pct(hw)}, draw ${pct(dr)}, away ${pct(aw)}, 0-0 ${pct(nil)}`);
  info(`  shots/game ${(shots / N).toFixed(1)}, yellow ${(yellow / N).toFixed(2)}, red ${(red / N).toFixed(3)}, injuries ${(inj / N).toFixed(2)}, subs ${(subs / N).toFixed(1)} per game`);
  info(`  stronger side (quality gap >= 6, ${strongGames} games): won ${(100 * strongWins / strongGames).toFixed(1)}%, lost ${(100 * strongLosses / strongGames).toFixed(1)}%`);
  const top = Object.entries(scores).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${(100 * v / N).toFixed(1)}%`);
  info(`  most common scores: ${top.join(', ')}`);
  assertBetween(goals / N, 2.45, 3.0, 'goals per game');
  assertBetween(hw / N, 0.40, 0.50, 'home win share');
  assertBetween(dr / N, 0.215, 0.31, 'draw share');
  assertBetween(aw / N, 0.24, 0.35, 'away win share');
  assertBetween(nil / N, 0.04, 0.12, '0-0 share');
  assertBetween(yellow / N, 2.5, 5, 'yellow cards per game');
  assertBetween(red / N, 0.04, 0.3, 'red cards per game');
  assertBetween(inj / N, 0.05, 0.45, 'injuries per game');
  assert(strongWins / strongGames >= 0.58, 'stronger teams should win clearly more often');
  assert(strongLosses / strongGames <= 0.22, 'stronger teams lose too often');
});

test('higher attacking intent creates more chances at both ends', () => {
  const comp = leagues[0];
  let base = [0, 0];
  let attack = [0, 0];
  for (let i = 0; i < 400; i++) {
    const f = { homeId: comp.clubIds[i % 9], awayId: comp.clubIds[9 + (i % 9)] };
    const m1 = runToEnd(world, createMatch(world, f, { seed: 5000 + i, homeTactics: { intent: 50, style: 'normal' } }));
    const m2 = runToEnd(world, createMatch(world, f, { seed: 5000 + i, homeTactics: { intent: 90, style: 'normal' } }));
    base = [base[0] + m1.sides[0].stats.shots, base[1] + m1.sides[1].stats.shots];
    attack = [attack[0] + m2.sides[0].stats.shots, attack[1] + m2.sides[1].stats.shots];
  }
  info(`Intent 50 -> 90: own shots ${base[0]} -> ${attack[0]}, conceded shots ${base[1]} -> ${attack[1]}`);
  assert(attack[0] > base[0] * 1.1, 'own chances should rise');
  assert(attack[1] > base[1] * 1.05, 'conceded chances should rise');
});

test('cup ties always produce a winner (extra time and penalties)', () => {
  const rng = new Rng(77);
  let et = 0, pens = 0;
  const N = 600;
  randomPairs(N, rng).forEach((f, i) => {
    const m = runToEnd(world, createMatch(world, f, { seed: 9000 + i, needsWinner: true }));
    assert(winnerSide(m) !== null, 'cup tie without a winner');
    if (m.extraTime) et++;
    if (m.pens) {
      pens++;
      assert(m.pens.h !== m.pens.a, 'shootout ended level');
    }
  });
  info(`Cup ties: extra time ${(100 * et / N).toFixed(1)}%, penalties ${(100 * pens / N).toFixed(1)}%`);
  assertBetween(et / N, 0.15, 0.32, 'extra-time share');
});

test('every minute: 7-11 distinct players per side, at most 5 subs', () => {
  const rng = new Rng(3);
  randomPairs(800, rng).forEach((f, i) => {
    const m = createMatch(world, f, { seed: 20000 + i });
    while (!m.finished) {
      step(world, m);
      for (const s of m.sides) {
        const ids = s.slots.filter(Boolean);
        assertBetween(ids.length, 7, 11, 'players on pitch');
        assertEq(new Set(ids).size, ids.length, 'duplicate player on pitch');
        assert(s.subsUsed <= s.maxSubs, 'too many subs');
      }
    }
  });
});
