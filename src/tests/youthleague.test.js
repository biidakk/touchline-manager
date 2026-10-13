import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startAcademy } from '../core/development.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { ensureYouthLeague, u19Table, u19Squad, setU19, u19Eligible } from '../core/youthleague.js';
import { ageOf } from '../core/valuation.js';

test('U-19 league: the user\'s league, Sundays, academy players play and develop, eligibility at 19', () => {
  const w = generateWorld({ seed: 'u19' });
  const g = startCareer(w, w.competitions['ENG-L1'].clubIds[7], 'Youth');
  startAcademy(g);
  g.manager.board.standing = 100;
  const user = g.clubs[g.userClubId];
  const yl = ensureYouthLeague(g);
  assert(yl, 'created');
  assertEq(yl.clubIds.length, g.competitions[user.compId].clubIds.length, 'every club of the league');
  const n = yl.clubIds.length;
  assertEq(yl.fixtures.length, n * (n - 1), 'double round robin');
  assert(yl.fixtures.every((f) => new Date(f.day * 86400000).getUTCDay() === 0), 'on Sundays');
  // A 25-year-old can't go down; a teenager can.
  const old = user.squad.map((id) => g.players[id]).find((p) => ageOf(p, g.season.year) >= 25);
  assert(!setU19(g, old.id, true).ok, 'too old');
  const young = user.squad.map((id) => g.players[id]).find((p) => u19Eligible(g, p));
  if (young) assert(setU19(g, young.id, true).ok, 'a teenager can');
  const squad = u19Squad(g);
  assert(squad.length >= 3, `U-19 squad ${squad.length}`);
  simulateRestOfSeason(g);
  assert(yl.fixtures.every((f) => f.result), 'all played');
  const t = u19Table(g);
  assertEq(t.reduce((a, r) => a + r.p, 0), n * (n - 1) * 2, 'table games');
  assert(yl.championId, 'a champion');
  const apps = squad.reduce((a, p) => a + (p.stats.season.youthApps || 0), 0);
  assert(apps > 0, 'the U-19 players played');
  const pos = t.findIndex((r) => r.clubId === user.id) + 1;
  info(`U-19: ${squad.length} players, ${apps} appearances; we finished ${pos}. of ${n}; champions ${g.clubs[yl.championId].name}`);
});
