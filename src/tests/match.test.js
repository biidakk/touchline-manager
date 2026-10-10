import { test, assert, assertEq } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { step, runToEnd, makeSub, moveOnPitch, subIntoOpenSlot } from '../core/engine.js';
import { advanceToUserMatch, pendingUserFixture, createUserMatch, finishUserMatch } from '../core/matchday.js';

function setup(seed) {
  const g = generateWorld({ seed });
  startCareer(g, g.competitions['CZE-L1'].clubIds[3], 'Live');
  const f = advanceToUserMatch(g);
  return { g, f, side: f.homeId === g.userClubId ? 0 : 1 };
}

test('the user\'s side makes no automatic tactical substitutions', () => {
  for (let k = 0; k < 15; k++) {
    const { g, f, side } = setup('live' + k);
    const m = runToEnd(g, createUserMatch(g, f));
    const subs = m.events.filter((e) => e.type === 'sub' && e.side === side);
    assert(subs.every((e) => e.reason !== 'tactical'), 'AI made a tactical sub for the user');
  }
});

test('with the assistant in charge the user\'s side does substitute', () => {
  let subs = 0;
  for (let k = 0; k < 10; k++) {
    const { g, f, side } = setup('assist' + k);
    const m = runToEnd(g, createUserMatch(g, f, { assistant: true }));
    subs += m.sides[side].subsUsed;
  }
  assert(subs > 20, `only ${subs} subs in 10 matches`);
});

test('half-time substitutions and position swaps work and respect the limit', () => {
  const { g, f, side } = setup('ht');
  const m = createUserMatch(g, f);
  while (m.period !== 'HT') step(g, m);
  const s = m.sides[side];
  const before = s.slots.slice();
  // Two occupied outfield places (an injury may have left one open).
  const [x, y] = s.slots.map((id, k) => (id && k > 0 ? k : -1)).filter((k) => k > 0);
  assert(moveOnPitch(m, side, x, y), 'swap failed');
  assertEq(s.slots[x], before[y]);
  assertEq(s.slots[y], before[x]);
  let made = 0;
  for (let i = 1; i <= 10 && s.bench.length; i++) {
    const outId = s.slots[i];
    if (!outId) continue;
    if (makeSub(g, m, side, outId, s.bench[0])) made++;
  }
  assertEq(made, Math.min(5, made), 'made');
  assertEq(s.subsUsed, made);
  assert(s.subsUsed <= 5, 'more than 5 subs');
  const off = s.subbedOff[0];
  assert(!s.bench.includes(off) && !s.slots.includes(off), 'a substituted player came back');
  // Change intent at half-time, then finish.
  s.tactics.intent = 90;
  runToEnd(g, m);
  finishUserMatch(g, f, m);
  assert(f.result && pendingUserFixture(g) === null, 'fixture should be played');
  for (const id of s.played) assert(g.players[id].stats.season.apps === 1, 'appearance not recorded');
});

test('an injury on the user\'s side leaves the place open until the user brings on a substitute', () => {
  let checked = 0;
  for (let k = 0; k < 120 && checked < 3; k++) {
    const { g, f, side } = setup('inj' + k);
    const m = createUserMatch(g, f);
    while (!m.finished && !(m.userInjury && m.userInjury.side === side)) step(g, m);
    if (m.finished) continue;
    const { slot, playerId } = m.userInjury;
    const s = m.sides[side];
    assertEq(s.slots[slot], null, 'injured player should leave the pitch');
    const sub = s.bench.find((id) => g.players[id].pos !== 'G');
    const used = s.subsUsed;
    if (used < s.maxSubs) {
      assert(subIntoOpenSlot(g, m, side, slot, sub), 'sub into the open place failed');
      assertEq(s.slots[slot], sub);
      assertEq(s.subsUsed, used + 1);
      const ev = m.events.filter((e) => e.type === 'sub').pop();
      assertEq(ev.otherId, playerId, 'sub event should name the injured player');
      assert(!subIntoOpenSlot(g, m, side, slot, s.bench[0]), 'place filled twice');
    }
    checked++;
  }
  assert(checked > 0, 'no user injury found in 120 matches');
});

test('a live match stepped minute by minute equals the instant result for the same seed', () => {
  const { g, f } = setup('same');
  const a = createUserMatch(g, f, { assistant: true });
  const b = JSON.parse(JSON.stringify(a));
  runToEnd(g, a);
  while (!b.finished) step(g, b);
  assertEq(JSON.stringify(a.events), JSON.stringify(b.events));
});

test('the pending user fixture is found after a reload-style restart', () => {
  const { g, f } = setup('pending');
  const again = JSON.parse(JSON.stringify(g));
  assertEq(pendingUserFixture(again).id, f.id);
});
