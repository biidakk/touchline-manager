import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { applyRenames, setPlayerName } from '../core/renames.js';
import { serialize, deserialize } from '../core/save.js';

test('the real-country world: six countries, two divisions each, named managers', () => {
  const g = generateWorld({ seed: 'real' });
  // Countries with leagues (the guest countries of the European competitions have none).
  const nations = Object.values(g.nations).filter((n) => n.leagueIds.length && !n.foreign);
  assertEq(nations.map((n) => n.id).join(), 'ENG,ESP,ITA,GER,FRA,CZE');
  for (const n of nations) assertEq(n.leagueIds.length, 2, `${n.name} divisions`);
  assert(Object.values(g.clubs).every((c) => c.manager && c.manager.name.includes(' ')), 'club without a manager');
  const top = (id) => g.clubs[g.competitions[id].clubIds[0]];
  info(`Examples: ${['ENG-L1', 'ESP-L1', 'ITA-L1', 'GER-L1', 'FRA-L1', 'CZE-L1'].map((id) => `${top(id).name} (${top(id).stadium.name}, manager ${top(id).manager.name})`).join('; ')}`);
  const userClub = g.competitions['ENG-L2'].clubIds[3];
  startCareer(g, userClub, 'Me');
  assertEq(g.clubs[userClub].manager, null, 'the user replaces the manager');
});

test('names.json renames nations, leagues, clubs, stadiums, managers and players', () => {
  const g = generateWorld({ seed: 'real' });
  const club = g.clubs[g.competitions['ENG-L1'].clubIds[0]];
  const p = g.players[club.squad[0]];
  const oldPlayer = `${p.first} ${p.last}`;
  const data = {
    nations: { England: 'Albion' },
    leagues: { 'Premier Division': 'Top Flight' },
    clubs: { [club.baseName]: { name: 'Sky Blue City', short: 'Sky Blues', stadium: 'Etihad Park', manager: 'Pep Example' } },
    players: { [oldPlayer]: 'Ada Lovelace' },
  };
  const n = applyRenames(g, data);
  assert(n >= 4, 'changes counted');
  assertEq(g.nations.ENG.name, 'Albion');
  assertEq(g.national.teams['NT-ENG-21'].name, 'Albion U21');
  assertEq(g.competitions['ENG-L1'].name, 'Top Flight');
  assertEq(club.name, 'Sky Blue City');
  assertEq(club.short, 'Sky Blues');
  assertEq(club.crest.initials, 'SBC');
  assertEq(club.stadium.name, 'Etihad Park');
  assertEq(club.manager.name, 'Pep Example');
  assert(p.first === 'Ada' && p.last === 'Lovelace', 'player renamed');
  // Applying again changes nothing; the original names stay the keys.
  assertEq(applyRenames(g, data), 0, 'second pass');
  assertEq(club.baseName, 'Manchester Blue');
  assert(setPlayerName(p, 'Jan van der Berg') && p.first === 'Jan van der' && p.last === 'Berg', 'multi-word names');
  // Renames survive a save.
  assertEq(deserialize(serialize(g)).clubs[club.id].name, 'Sky Blue City');
});
