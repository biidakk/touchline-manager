import { test, assert, assertEq, assertBetween } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startAcademy, promoteYouth, releasePlayer, seasonRate, ACADEMY_MAX_AGE, TICKS_PER_SEASON } from '../core/development.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { DAY_MS } from '../core/calendar.js';

const world = generateWorld({ seed: 'academy' });
const g = startCareer(world, world.competitions['CZE-L2'].clubIds[2], 'Youth');
startAcademy(g);
const club = g.clubs[g.userClubId];

test('a new career starts with an academy that is separate from the squad', () => {
  assertBetween(club.youth.length, 3, 6, 'academy size');
  for (const id of club.youth) {
    assert(!club.squad.includes(id), 'academy player in the first-team squad');
    assertBetween(g.season.year - g.players[id].birthYear, 16, 17, 'age');
  }
});

test('promoting and releasing players', () => {
  const id = club.youth[0];
  assert(promoteYouth(g, club, id), 'promote failed');
  assert(club.squad.includes(id) && !club.youth.includes(id), 'not moved');
  assert(g.players[id].number > 0, 'no shirt number');
  const starter = club.lineup.slots[4];
  assert(releasePlayer(g, club, starter), 'release failed');
  assert(!g.players[starter] && !club.squad.includes(starter) && !club.lineup.slots.includes(starter), 'released player still referenced');
});

test('development ticks happen once a month during the season', () => {
  let ticks = 0;
  for (let d = g.season.start + 1; d <= g.season.end; d++) if (new Date(d * DAY_MS).getUTCDate() === 1) ticks++;
  assertEq(ticks, TICKS_PER_SEASON);
  assert(seasonRate(18) > seasonRate(24) && seasonRate(24) > seasonRate(28) && seasonRate(34) < 0, 'age curve');
});

test('academy players who are too old leave at the end of the season', () => {
  const old = club.youth[0];
  g.players[old].birthYear = g.season.year - ACADEMY_MAX_AGE; // turns 20 next season
  simulateRestOfSeason(g);
  const s = endSeason(g);
  assert(!g.players[old], 'over-age academy player should have left');
  assertEq(s.releasedUser.length, 1, 'released list');
  assertBetween(s.youthUser.length, 3, 6, 'new intake');
  assert(s.youthUser.every((id) => club.youth.includes(id)), 'intake should go to the academy');
});
