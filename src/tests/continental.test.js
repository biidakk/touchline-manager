import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { CONTINENTAL_ID, QUOTAS, groupTable } from '../core/continental.js';
import { weekday } from '../core/calendar.js';
import { serialize, deserialize } from '../core/save.js';

const w = generateWorld({ seed: 'continental' });
const g = startCareer(w, w.competitions['ENG-L1'].clubIds[0], 'Euro');
const cc = () => g.competitions[CONTINENTAL_ID];

test('16 clubs qualify by country quota and are drawn into 4 groups of 4', () => {
  const c = cc();
  assertEq(c.clubIds.length, 16);
  for (const [nat, n] of Object.entries(QUOTAS)) {
    assertEq(c.clubIds.filter((id) => g.clubs[id].nationId === nat).length, n, `${nat} quota:`);
    assert(c.clubIds.every((id) => g.competitions[g.clubs[id].compId].tier === 1), 'only top-division clubs');
  }
  assertEq(c.groups.length, 4);
  const all = c.groups.flatMap((gr) => gr.clubIds);
  assertEq(new Set(all).size, 16, 'every club in exactly one group');
  const clashes = c.groups.reduce((a, gr) => a + gr.clubIds.length - new Set(gr.clubIds.map((id) => g.clubs[id].nationId)).size, 0);
  info(`Continental groups: ${c.groups.map((gr) => gr.name + ': ' + gr.clubIds.map((id) => g.clubs[id].short).join(', ')).join(' | ')}`);
  assert(clashes <= 4, 'too many same-country clubs in groups');
});

test('group games are on Tuesdays and no club has two matches on a day', () => {
  const fx = Object.values(g.fixtures).filter((f) => f.compId === CONTINENTAL_ID);
  assertEq(fx.length, 4 * 12, 'group fixtures');
  assert(fx.every((f) => weekday(f.day) === 2), 'continental match not on a Tuesday');
  const seen = new Set();
  for (const f of Object.values(g.fixtures)) {
    for (const c of [f.homeId, f.awayId]) {
      const key = c + '@' + f.day;
      assert(!seen.has(key), 'double booking ' + key);
      seen.add(key);
    }
  }
});

test('the competition runs to a winner and pays prize money', () => {
  const before = Object.fromEntries(cc().clubIds.map((id) => [id, g.clubs[id].finance.season.prizes]));
  simulateRestOfSeason(g);
  const c = cc();
  assert(c.winnerId && c.clubIds.includes(c.winnerId), 'no winner');
  for (const gr of c.groups) assert(groupTable(g, gr).every((r) => r.p === 6), 'group games missing');
  const qf = c.rounds[0].fixtureIds.map((id) => g.fixtures[id]);
  assertEq(qf.length, 8, 'quarter-finals: four ties over two legs');
  assert(qf.filter((f) => f.leg === 2).every((f) => f.result && f.result.winner), 'knockout tie without a winner');
  assert(qf.filter((f) => f.leg === 1).every((f) => f.result && !f.result.winner), 'a first leg decided a tie');
  assertEq(c.rounds[2].fixtureIds.length, 1, 'the final is one match');
  const paid = c.clubIds.filter((id) => g.clubs[id].finance.season.prizes > before[id]).length;
  assertBetween(paid, 8, 16, 'clubs paid continental prizes');
  info(`Continental winner: ${g.clubs[c.winnerId].name} (${g.nations[g.clubs[c.winnerId].nationId].name})`);
});

test('two-legged ties are decided on aggregate, then extra time and penalties', () => {
  const ties = Object.values(g.fixtures).filter((f) => f.leg === 2);
  // Continental QF + SF (4 + 2) and the national cup semi-finals (2 each).
  assertEq(ties.length, 6 + 2 * Object.values(g.nations).filter((n) => n.cupId).length, 'second legs');
  let et = 0;
  let pens = 0;
  let awayWins = 0;
  for (const f of ties) {
    const first = g.fixtures[f.firstLegId];
    assert(first.homeId === f.awayId && first.awayId === f.homeId, 'second leg at the other ground');
    assert(first.day < f.day, 'second leg before the first');
    const agg = { h: f.result.h + first.result.a, a: f.result.a + first.result.h };
    assertEq(`${f.result.agg.h}:${f.result.agg.a}`, `${agg.h}:${agg.a}`, 'aggregate');
    if (agg.h !== agg.a) assertEq(f.result.winner, agg.h > agg.a ? f.homeId : f.awayId, 'aggregate winner');
    else assert(f.result.pens, 'level on aggregate without penalties');
    if (f.result.et) et++;
    if (f.result.pens) pens++;
    if (f.result.winner === f.homeId && f.result.h < f.result.a) awayWins++;
  }
  info(`Two-legged ties: ${ties.length}, extra time ${et}, penalties ${pens}, went through despite losing the 2nd leg ${awayWins}`);
  // No club ever has two matches on one day.
  const seen = new Set();
  for (const f of Object.values(g.fixtures)) {
    for (const c of [f.homeId, f.awayId]) {
      assert(!seen.has(c + '@' + f.day), 'double booking');
      seen.add(c + '@' + f.day);
    }
  }
});

test('season end records it, and next season qualifies from the final tables', () => {
  const winner = cc().winnerId;
  const s = endSeason(g);
  assertEq(s.continental.winnerId, winner);
  assertEq(cc().history.length, 1);
  assert(g.clubs[winner].trophies.some((t) => t.compId === CONTINENTAL_ID), 'trophy');
  const last = g.competitions['GER-L1'].history.at(-1).table.map((r) => r.clubId);
  const gerQualified = cc().clubIds.filter((id) => g.clubs[id].nationId === 'GER');
  assertEq(gerQualified.slice().sort().join(), last.slice(0, QUOTAS.GER).sort().join(), 'qualified from the table');
  assertEq(Object.values(g.fixtures).filter((f) => f.compId === CONTINENTAL_ID).length, 48, 'new group stage scheduled');
});

test('an old save without the competition is migrated and plays a normal season', () => {
  const old = generateWorld({ seed: 'old-cc' });
  delete old.competitions[CONTINENTAL_ID];
  for (const f of Object.values(old.fixtures)) if (f.compId === CONTINENTAL_ID) delete old.fixtures[f.id];
  old.version = 3;
  const m = deserialize(serialize(old));
  assert(m.competitions[CONTINENTAL_ID], 'competition added');
  startCareer(m, m.competitions['CZE-L1'].clubIds[0], 'Old');
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over', 'season should finish without a continental cup');
  endSeason(m);
  assertEq(m.competitions[CONTINENTAL_ID].clubIds.length, 16, 'starts the following season');
});
