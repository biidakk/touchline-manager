import { test, assert, assertEq } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { autoLineup, slotSkill } from '../core/ai.js';
import { lineupSkill } from '../core/ratings.js';
import { placePlayer, reshapeLineup, repairLineup, locate, styleShares, saveLineupSlot, loadLineupSlot, roleTakers,
  BENCH_SIZE } from '../core/lineup.js';
import { FORMATION_NAMES, GAME_VERSION } from '../core/data.js';
import { advanceToUserMatch, playUserMatchInstant } from '../core/matchday.js';
import { createMatch, runToEnd, sideStrength } from '../core/engine.js';
import { serialize, deserialize } from '../core/save.js';

const world = generateWorld({ seed: 'lineup' });
const club = world.clubs[world.competitions['GER-L1'].clubIds[2]];
const base = autoLineup(world, club, '4-4-2');
const reserves = (l) => club.squad.filter((id) => !l.slots.includes(id) && !l.bench.includes(id));

function checkIntegrity(l) {
  const all = [...l.slots.filter(Boolean), ...l.bench];
  assertEq(new Set(all).size, all.length, 'player listed twice');
  assertEq(l.slots.length, 11, 'slot count');
  assert(l.bench.length <= BENCH_SIZE, 'bench too big');
  assert(all.every((id) => club.squad.includes(id)), 'player not in squad');
}

test('swapping two starters swaps their places', () => {
  const [a, b] = [base.slots[1], base.slots[9]];
  const l = placePlayer(base, a, { zone: 'slot', index: 9 });
  assertEq(l.slots[9], a);
  assertEq(l.slots[1], b);
  checkIntegrity(l);
});

test('a reserve dropped on a starter sends the starter to the reserves', () => {
  const r = reserves(base)[0];
  const starter = base.slots[5];
  const l = placePlayer(base, r, { zone: 'slot', index: 5 });
  assertEq(l.slots[5], r);
  assertEq(locate(l, starter).zone, 'reserve');
  checkIntegrity(l);
});

test('bench player and starter swap; dropping on the bench area adds a substitute', () => {
  const sub = base.bench[2];
  const starter = base.slots[3];
  let l = placePlayer(base, sub, { zone: 'slot', index: 3 });
  assertEq(l.slots[3], sub);
  assertEq(l.bench[2], starter);
  checkIntegrity(l);
  // Make room on the bench, then drop a reserve on the bench area.
  l = placePlayer(l, l.bench[0], { zone: 'reserve', index: -1 });
  const r = reserves(l)[0];
  l = placePlayer(l, r, { zone: 'bench', index: -1 });
  assert(l.bench.includes(r), 'reserve not added to the bench');
  checkIntegrity(l);
});

test('removing the captain from the XI clears the explicit captain', () => {
  const l0 = { ...base, captainId: base.slots[4] };
  const l = placePlayer(l0, base.slots[4], { zone: 'reserve', index: -1 });
  assertEq(l.captainId, null);
  assert(l.slots.includes(roleTakers(world, l).captainId), 'automatic captain should be a starter');
});

test('changing formation keeps the same XI and the keeper in goal', () => {
  let l = base;
  for (const f of FORMATION_NAMES) {
    const next = reshapeLineup(world, l, f);
    assertEq([...next.slots].sort().join(), [...l.slots].sort().join(), `${f}: XI changed`);
    assertEq(world.players[next.slots[0]].pos, 'G', `${f}: keeper`);
    l = next;
  }
});

test('repair replaces injured and suspended players, preferring the right position', () => {
  const l = { ...base, slots: base.slots.slice(), bench: base.bench.slice() };
  const injured = world.players[l.slots[2]];
  const suspendedSub = world.players[l.bench[1]];
  injured.injuryDays = 20;
  suspendedSub.suspension = 1;
  const { lineup, changes } = repairLineup(world, club, l);
  assert(!lineup.slots.includes(injured.id), 'injured player still starts');
  assert(!lineup.bench.includes(suspendedSub.id), 'suspended player on the bench');
  assertEq(changes.length, 1, 'changes');
  assertEq(world.players[lineup.slots[2]].pos, injured.pos, 'replacement position');
  assertEq(lineup.bench.length, BENCH_SIZE, 'bench refilled');
  injured.injuryDays = 0;
  suspendedSub.suspension = 0;
});

test('style shares add up to 100', () => {
  const s = styleShares(world, base);
  assertEq(s.passing + s.crosses + s.through, 100);
});

test('saved lineup slots store tactics and drop players who left', () => {
  club.tactics.intent = 70;
  club.tactics.style = 'crosses';
  saveLineupSlot(club, 'B', base);
  club.tactics.intent = 40;
  const leaver = base.slots[7];
  club.squad = club.squad.filter((id) => id !== leaver);
  const l = loadLineupSlot(world, club, 'B');
  assertEq(club.tactics.intent, 70);
  assertEq(club.tactics.style, 'crosses');
  assert(!l.slots.includes(leaver) && l.slots.every(Boolean), 'leaver should be replaced');
  club.squad.push(leaver);
});

test('the user\'s lineup choices survive match days', () => {
  const g = startCareer(generateWorld({ seed: 'keep' }), 'c5', 'Keeper');
  const c = g.clubs['c5'];
  // Swap the best outfield player for a reserve on purpose.
  const best = c.lineup.slots.filter((id) => g.players[id].pos !== 'G')
    .sort((a, b) => g.players[b].skill - g.players[a].skill)[0];
  const reserve = c.squad.find((id) => !c.lineup.slots.includes(id) && !c.lineup.bench.includes(id)
    && g.players[id].pos !== 'G');
  c.lineup = placePlayer(c.lineup, reserve, { zone: 'slot', index: c.lineup.slots.indexOf(best) });
  const f = advanceToUserMatch(g);
  playUserMatchInstant(g, f);
  assert(!c.lineup.slots.includes(best), 'the engine put the dropped player back');
  assert(c.lineup.slots.includes(reserve) || g.players[reserve].injuryDays > 0 || g.players[reserve].suspension > 0,
    'the chosen reserve was removed');
});

test('the chosen penalty taker takes the penalties', () => {
  const l = autoLineup(world, club, '4-4-2');
  const taker = l.slots.find((id) => world.players[id].pos === 'D');
  l.penaltyId = taker;
  club.lineup = l;
  const other = world.competitions['GER-L1'].clubIds[5];
  let pens = 0;
  for (let i = 0; i < 300 && pens < 5; i++) {
    const m = runToEnd(world, createMatch(world, { homeId: club.id, awayId: other }, { seed: 700 + i, homeAI: false }));
    for (const e of m.events.filter((x) => x.side === 0 && x.type === 'goal' && x.penalty)) {
      assertEq(e.playerId, taker, 'penalty scorer');
      pens++;
    }
  }
  assert(pens > 0, 'no penalties scored in 300 matches');
});

test('players out of their natural position lose 30% of their skill', () => {
  const l = autoLineup(world, club, '4-4-2');
  const striker = l.slots[9];
  const defender = l.slots[1];
  assertEq(slotSkill(world.players[striker], 'F'), world.players[striker].skill, 'natural position');
  assertEq(slotSkill(world.players[striker], 'D'), Math.round(world.players[striker].skill * 0.7), 'out of position');
  assertEq(slotSkill(world.players[striker], 'G'), Math.round(world.players[striker].skill * 0.25), 'outfield player in goal');
  assertEq(slotSkill(world.players[l.slots[0]], 'D'), Math.round(world.players[l.slots[0]].skill * 0.25), 'keeper outfield');
  // Swap a striker and a defender: the engine's defence and attack both drop.
  const swapped = placePlayer(l, striker, { zone: 'slot', index: 1 });
  assertEq(swapped.slots[9], defender);
  const strength = (lineup) => sideStrength(world, createMatch(world, { homeId: club.id, awayId: club.id },
    { seed: 1, homeLineup: lineup, awayLineup: l }).sides[0]);
  const before = strength(l);
  const after = strength(swapped);
  assert(after.def < before.def && after.att < before.att, 'out-of-position players should weaken the team');
  assert(lineupSkill(world, swapped) < lineupSkill(world, l), 'average effective skill should drop');
});

test('a version 1 save is migrated', () => {
  const g = generateWorld({ seed: 'old' });
  g.version = 1;
  for (const c of Object.values(g.clubs)) delete c.teamwork;
  const back = deserialize(serialize(g));
  assertEq(back.version, GAME_VERSION);
  assert(Object.values(back.nations).every((n) => typeof n.strength === 'number'), 'nation strength restored');
  assert(Object.values(back.clubs).every((c) => c.teamwork === 60), 'teamwork default');
});
