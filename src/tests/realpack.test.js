import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { applyRealPack, checkPack } from '../core/realpack.js';
import { serialize, deserialize } from '../core/save.js';

// A made-up pack: three clubs with invented players (and one with too few).
function samplePack() {
  const squad = (tag, base, nations) => ['G', 'G', 'D', 'D', 'D', 'D', 'D', 'D', 'D', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'F', 'F', 'F', 'F']
    .map((pos, i) => ({ name: `${tag} Player${i}`, pos, born: 1994 + (i % 12), nation: nations[i % nations.length], rating: base - i * 0.6, height: 170 + i, number: i + 1 }));
  return {
    format: 'touchline-realpack', season: '2026/27',
    clubs: {
      'Manchester Blue': { real: 'Test City', short: 'Test C', stadium: 'Test Arena', manager: 'Coach One', players: squad('Ci', 88, ['England', 'Brazil', 'Norway']) },
      'Burnley Clarets': { real: 'Test Burn', stadium: 'Burn Park', manager: 'Coach Two', players: squad('Bu', 70, ['England', 'Ivory Coast']) },
      'FC Plzeň': { real: 'Test Plzen', manager: 'Coach Three', players: squad('Pl', 66, ['Czech Republic', 'Slovakia', 'Atlantis']) },
      'Leeds Whites': { real: 'Test Leeds', players: [{ name: 'Only One', pos: 'G', rating: 70 }] },
      'No Such Club': { real: 'Nobody', players: [] },
    },
  };
}

test('real pack: clubs renamed, squads replaced, ratings ordered, foreign nations without national teams', () => {
  assert(checkPack({}).length && !checkPack(samplePack()).length, 'format check');
  const g = generateWorld({ seed: 'realpack' });
  const teams = Object.keys(g.national.teams).length;
  const r = applyRealPack(g, samplePack());
  assertEq(r.players, 60, 'three full squads');
  assert(r.skipped.some((s) => s.startsWith('Leeds Whites')) && r.skipped.includes('No Such Club'), 'small squads and unknown clubs are reported');
  const city = Object.values(g.clubs).find((c) => c.baseName === 'Manchester Blue');
  assertEq(city.name, 'Test City');
  assertEq(city.short, 'Test C');
  assertEq(city.stadium.name, 'Test Arena');
  assertEq(city.manager.name, 'Coach One');
  assertEq(city.squad.length, 20);
  const ps = city.squad.map((id) => g.players[id]);
  assert(ps.every((p) => p.first && p.last.startsWith('Player')), 'names');
  const outfield = ps.filter((p) => p.pos !== 'G');
  assert(outfield[0].skill >= outfield.at(-1).skill + 5, 'better rating, better skill');
  const bra = g.nations.BRA;
  assert(bra && bra.foreign && ps.some((p) => p.nationId === 'BRA'), 'Brazil exists as a players-only nation');
  assert(g.nations.OTH, 'unknown countries become "Other"');
  assertEq(Object.keys(g.national.teams).length, teams, 'no national teams for players-only nations');
  const leeds = Object.values(g.clubs).find((c) => c.baseName === 'Leeds Whites');
  assertEq(leeds.name, 'Test Leeds', 'a club without a usable squad still gets its name');
  assert(leeds.squad.length >= 20, 'and keeps its generated squad');
  const burn = Object.values(g.clubs).find((c) => c.baseName === 'Burnley Clarets');
  const avg = (c) => c.squad.map((id) => g.players[id].skill).sort((a, b) => b - a).slice(0, 14).reduce((a, b) => a + b, 0) / 14;
  assert(avg(city) > avg(burn) + 8, 'a top club stays far stronger than a second-division one');
  info(`Top-14 averages: ${city.name} ${avg(city).toFixed(1)}, ${burn.name} ${avg(burn).toFixed(1)}`);
});

test('real pack: a career with real players plays a season and saves', () => {
  const g = generateWorld({ seed: 'realpack2' });
  applyRealPack(g, samplePack());
  const club = Object.values(g.clubs).find((c) => c.baseName === 'Burnley Clarets');
  startCareer(g, club.id, 'Tester');
  simulateRestOfSeason(g);
  const s = endSeason(g);
  assert(s.year === 2026, 'season ended');
  const back = deserialize(serialize(g));
  assert(back.nations.BRA?.foreign, 'players-only nations survive saving');
  assert(Object.values(back.players).some((p) => p.last === 'Player0'), 'real players survive saving');
});
