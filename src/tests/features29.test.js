import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { extendCoach, extendQuote, COACH_MAX_YEARS, seasonEndStaff } from '../core/training.js';
import { facilitiesOf, standardLevel, upgradeQuote, startUpgrade, progressFacilities, groundDemand, facilitiesUpkeep,
  clubRepLevel, MAX_LEVEL } from '../core/facilities.js';
import { demand } from '../core/finance.js';
import { youthIntake } from '../core/development.js';
import { clubChecklist } from '../core/assistant.js';
import { dayOf } from '../core/calendar.js';
import { Rng } from '../core/rng.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Fac');
}

test('staff: extending a contract, capped three seasons ahead, with a raise', () => {
  const g = career('staff29');
  const club = g.clubs[g.userClubId];
  const c = club.staff.fitness;
  const wage = c.wage;
  const until = c.until;
  const r = extendCoach(g, 'fitness', 1);
  assert(r.ok, r.message);
  assertEq(c.until, until + 1);
  assert(c.wage > wage, 'a raise');
  extendCoach(g, 'fitness', 2);
  assertEq(c.until, g.season.year + COACH_MAX_YEARS, 'capped');
  assertEq(extendQuote(g, c, 1).added, 0);
  assert(!extendCoach(g, 'fitness', 1).ok, 'no further');
  seasonEndStaff(g, g.season.year + 1);
  assert(club.staff.fitness, 'an extended coach stays at the end of the season');
});

test('staff: the to-do list warns about staff contracts ending this summer', () => {
  const g = career('staff29b');
  const club = g.clubs[g.userClubId];
  club.staff.physio.until = g.season.year;
  g.day = dayOf(g.season.year + 1, 2, 1);
  assert(clubChecklist(g).some((t) => t.screen === 'training' && /ending this summer/.test(t.text)), 'warned');
});

test('facilities: levels start at the standard; upgrades take time and money', () => {
  const g = career('fac29');
  const club = g.clubs[g.userClubId];
  const f = facilitiesOf(g, club);
  assertEq(f.ground, standardLevel(club));
  assertEq(groundDemand(g, club), 1, 'standard: no effect');
  assertEq(facilitiesUpkeep(g, club), 0);
  club.budget = 1e9;
  const q = upgradeQuote(g, club, 'ground');
  const money = club.budget;
  const before = demand(g, Object.values(g.fixtures).find((x) => x.homeId === club.id));
  assert(startUpgrade(g, club, 'ground').ok);
  assertEq(club.budget, money - q.cost);
  assert(!startUpgrade(g, club, 'academy').ok, 'one upgrade at a time');
  g.day = f.work.end;
  progressFacilities(g);
  assertEq(f.ground, q.to);
  assert(!f.work);
  const after = demand(g, Object.values(g.fixtures).find((x) => x.homeId === club.id));
  info(`Facilities: ground ${q.to - 1} -> ${q.to} for ${q.cost}, demand ${before} -> ${after}, upkeep ${Math.round(facilitiesUpkeep(g, club))}`);
  assert(after > before, 'more fans');
  assert(facilitiesUpkeep(g, club) > 0, 'upkeep above standard');
  f.ground = MAX_LEVEL;
  assertEq(upgradeQuote(g, club, 'ground'), null, 'top level');
});

test('facilities: a better academy brings better youngsters', () => {
  const g = career('fac29b');
  const club = g.clubs[g.userClubId];
  const avg = (level) => {
    facilitiesOf(g, club).academy = level;
    let sum = 0; let n = 0;
    for (let i = 0; i < 30; i++) {
      club.youth = [];
      const ids = youthIntake(g, club, new Rng({ s: 500 + i }), true);
      for (const id of ids) { sum += g.players[id].potential; n++; delete g.players[id]; }
    }
    return { pot: sum / n, n };
  };
  const std = standardLevel(club);
  const low = avg(Math.max(1, std - 1));
  const high = avg(MAX_LEVEL);
  info(`Academy: level ${Math.max(1, std - 1)} pot ${low.pot.toFixed(1)} (${low.n}), level ${MAX_LEVEL} pot ${high.pot.toFixed(1)} (${high.n})`);
  assert(high.pot > low.pot + 3, 'higher potential');
});

test('club reputation levels', () => {
  assertEq(clubRepLevel(90), 'Worldwide');
  assertEq(clubRepLevel(70), 'Continental');
  assertEq(clubRepLevel(50), 'National');
  assertEq(clubRepLevel(40), 'Regional');
  assertEq(clubRepLevel(15), 'Local');
});
