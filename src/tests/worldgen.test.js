import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { Rng } from '../core/rng.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { FORMATIONS, ROLE_POS } from '../core/data.js';
import { autoLineup } from '../core/ai.js';
import { weekday } from '../core/calendar.js';

const world = generateWorld({ seed: 'test-seed' });

test('rng is deterministic and in range', () => {
  const a = new Rng(42);
  const b = new Rng(42);
  for (let i = 0; i < 1000; i++) {
    const x = a.int(3, 9);
    assertEq(x, b.int(3, 9));
    assertBetween(x, 3, 9);
  }
  const c = new Rng(7);
  let sum = 0;
  for (let i = 0; i < 20000; i++) sum += c.next();
  assertBetween(sum / 20000, 0.48, 0.52, 'mean of next()');
});

test('same seed gives the same world, different seed a different one', () => {
  const again = generateWorld({ seed: 'test-seed' });
  assertEq(JSON.stringify(again), JSON.stringify(world), 'same seed:');
  const other = generateWorld({ seed: 'other-seed' });
  assert(JSON.stringify(other) !== JSON.stringify(world), 'different seed produced an identical world');
});

test('3+ countries, each with 2 tiers of 16-18 clubs and a cup', () => {
  const playable = Object.values(world.nations).filter((n) => n.leagueIds.length);
  assert(playable.length >= 3, 'fewer than 3 playable countries');
  for (const n of playable) {
    assertEq(n.leagueIds.length, 2, n.name + ' tiers:');
    let total = 0;
    for (const id of n.leagueIds) {
      const c = world.competitions[id];
      assertBetween(c.clubIds.length, 16, 18, c.name + ' size');
      assert(c.clubIds.length % 2 === 0, c.name + ' has an odd number of clubs');
      total += c.clubIds.length;
    }
    const cup = world.competitions[n.cupId];
    assertEq(cup.clubIds.length, total, n.name + ' cup entrants:');
  }
});

test('clubs have names, colours, stadiums, budgets and unique names', () => {
  const names = new Set();
  for (const c of Object.values(world.clubs)) {
    assert(c.name && !names.has(c.name), 'duplicate or empty club name ' + c.name);
    names.add(c.name);
    assert(c.colors.primary && c.colors.secondary, 'colours');
    assert(c.stadium.name && c.stadium.capacity >= 1000, 'stadium of ' + c.name);
    assert(c.budget > 0 && c.reputation > 0, 'budget/reputation of ' + c.name);
  }
});

test('squads: ~25 valid players with unique numbers', () => {
  for (const c of Object.values(world.clubs)) {
    assertBetween(c.squad.length, 22, 28, c.name + ' squad size');
    const nums = new Set();
    let gk = 0;
    for (const id of c.squad) {
      const p = world.players[id];
      assertEq(p.clubId, c.id, 'player club link');
      assert(['G', 'D', 'M', 'F'].includes(p.pos), 'position');
      assertBetween(world.season.year - p.birthYear, 16, 40, 'age');
      assertBetween(p.skill, 1, 99, 'skill');
      assert(p.potential >= p.skill, 'potential below skill');
      assertBetween(p.energy, 0, 100, 'energy');
      assert(world.nations[p.nationId], 'nationality');
      assert(!nums.has(p.number) && p.number > 0, 'squad number clash at ' + c.name);
      nums.add(p.number);
      if (p.pos === 'G') gk++;
    }
    assert(gk >= 2, c.name + ' has fewer than 2 goalkeepers');
  }
  info(`Players generated: ${Object.keys(world.players).length}`);
});

test('first tier is stronger than second tier in every country', () => {
  const avg = (comp) => {
    const ps = comp.clubIds.flatMap((id) => world.clubs[id].squad.map((p) => world.players[p].skill));
    return ps.reduce((a, b) => a + b, 0) / ps.length;
  };
  for (const n of Object.values(world.nations).filter((x) => x.leagueIds.length)) {
    const [t1, t2] = n.leagueIds.map((id) => world.competitions[id]);
    const a1 = avg(t1);
    const a2 = avg(t2);
    info(`${n.name}: tier 1 avg ${a1.toFixed(1)}, tier 2 avg ${a2.toFixed(1)}`);
    assert(a1 > a2 + 5, `${n.name}: tier 1 (${a1.toFixed(1)}) not clearly stronger than tier 2 (${a2.toFixed(1)})`);
  }
});

test('league fixtures form a valid double round robin on Saturdays', () => {
  for (const comp of Object.values(world.competitions).filter((c) => c.type === 'league')) {
    const fx = comp.fixtureIds.map((id) => world.fixtures[id]);
    const n = comp.clubIds.length;
    assertEq(fx.length, n * (n - 1), comp.name + ' fixture count:');
    const pairs = new Set();
    const perRound = {};
    for (const f of fx) {
      const key = f.homeId + '>' + f.awayId;
      assert(!pairs.has(key), 'duplicate fixture ' + key);
      pairs.add(key);
      assertEq(weekday(f.day), 6, 'league match not on a Saturday:');
      perRound[f.round] = perRound[f.round] || new Set();
      assert(!perRound[f.round].has(f.homeId) && !perRound[f.round].has(f.awayId), 'club plays twice in a round');
      perRound[f.round].add(f.homeId).add(f.awayId);
    }
    for (const a of comp.clubIds) {
      for (const b of comp.clubIds) if (a !== b) assert(pairs.has(a + '>' + b), 'missing fixture');
    }
  }
});

test('cup: first round draw covers every club and leaves a power of two', () => {
  for (const cup of Object.values(world.competitions).filter((c) => c.type === 'cup')) {
    const r0 = cup.rounds[0];
    assert(r0.drawn, 'first round not drawn');
    const playing = r0.fixtureIds.flatMap((id) => [world.fixtures[id].homeId, world.fixtures[id].awayId]);
    const all = new Set([...playing, ...r0.byes]);
    assertEq(all.size, cup.clubIds.length, cup.name + ' entrants:');
    assertEq(playing.length + r0.byes.length, cup.clubIds.length, 'club appears twice');
    const advancing = r0.fixtureIds.length + r0.byes.length;
    assertEq(advancing & (advancing - 1), 0, `${cup.name}: ${advancing} advancing is not a power of two;`);
    for (const id of r0.fixtureIds) {
      const f = world.fixtures[id];
      const tier = (c) => world.competitions[world.clubs[c].compId].tier;
      assert(tier(f.homeId) >= tier(f.awayId), 'higher-tier club drawn at home against a lower-tier club');
    }
    const days = cup.rounds.map((r) => r.day);
    assert(days.every((d, i) => i === 0 || d > days[i - 1]), 'cup rounds out of order');
  }
});

test('no club has two matches on the same day', () => {
  const seen = new Set();
  for (const f of Object.values(world.fixtures)) {
    for (const c of [f.homeId, f.awayId]) {
      const key = c + '@' + f.day;
      assert(!seen.has(key), 'double booking ' + key);
      seen.add(key);
    }
  }
});

test('auto lineup fills every formation with 11 distinct players and one GK', () => {
  const club = Object.values(world.clubs)[3];
  for (const name of Object.keys(FORMATIONS)) {
    const l = autoLineup(world, club, name);
    assertEq(l.slots.length, 11, name);
    assertEq(new Set(l.slots).size, 11, name + ' distinct:');
    l.slots.forEach((id, i) => {
      assert(club.squad.includes(id), 'player not in squad');
      if (ROLE_POS[FORMATIONS[name][i][0]] === 'G') assertEq(world.players[id].pos, 'G', 'GK slot:');
    });
    assert(l.bench.length >= 5 && l.bench.every((id) => !l.slots.includes(id)), 'bench');
    assert(l.slots.includes(l.captainId), 'captain not in XI');
  }
});

test('starting a career sets the club and adds news', () => {
  const g = generateWorld({ seed: 'career' });
  const clubId = g.competitions['GER-L2'].clubIds[0];
  startCareer(g, clubId, 'Tester');
  assertEq(g.userClubId, clubId);
  assertEq(g.manager.name, 'Tester');
  assert(g.news.length >= 2, 'news');
});
