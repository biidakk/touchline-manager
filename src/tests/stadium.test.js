import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { expansionQuote, startExpansion, naturalCrowd } from '../core/stadium.js';
import { gate, demand } from '../core/finance.js';
import { knownPotential, potText, assignScout, setLevel, scoutingOf, scoutingCost, LEVELS } from '../core/scouting.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed, comp = 'GER-L1', idx = 2) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Builder');
}

test('stadium expansion costs money, takes time and adds seats', () => {
  const g = career('stadium');
  const club = g.clubs[g.userClubId];
  club.budget = 1000;
  assert(!startExpansion(g, club, 5000).ok, 'should be unaffordable');
  club.budget = 100e6;
  const cap = club.stadium.capacity;
  const q = expansionQuote(club, 5000);
  const r = startExpansion(g, club, 5000);
  assert(r.ok, r.message);
  assertEq(club.budget, 100e6 - q.cost, 'paid up front');
  assertEq(club.finance.season.construction, q.cost, 'ledger');
  assert(!startExpansion(g, club, 2000).ok, 'only one construction at a time');
  for (let i = 0; i < q.days - 1; i++) startDay(g);
  assertEq(club.stadium.capacity, cap, 'finished too early');
  startDay(g);
  startDay(g);
  assertEq(club.stadium.capacity, cap + 5000, 'capacity after construction');
  assertEq(club.stadium.expansion, null);
  info(`Expansion: +5,000 seats for ${(q.cost / 1e6).toFixed(1)}M €, ${q.days} days`);
});

test('crowds are limited by demand: extra seats pay only while the stadium sells out', () => {
  const g = career('crowd');
  const club = g.clubs[g.userClubId];
  const f = Object.values(g.fixtures).find((x) => x.homeId === club.id);
  const want = demand(g, f);
  club.stadium.capacity = Math.round(want * 0.5);
  const small = gate(g, f);
  assert(small.soldOut && small.attendance === club.stadium.capacity, 'a small stadium should sell out');
  club.stadium.capacity = want * 3;
  const big = gate(g, f);
  assertEq(big.attendance, want, 'a huge stadium is capped by demand');
  assert(big.income > small.income, 'more seats earn more while demand is there');
  info(`Natural crowd ${Math.round(naturalCrowd(club))}, demand for this game ${want}`);
});

test('scouting: potential is hidden until a scout reports a range containing it', () => {
  const g = career('scout');
  const own = g.players[g.clubs[g.userClubId].squad[0]];
  const ok = knownPotential(g, own);
  assert(ok.low <= own.potential && ok.high >= own.potential, 'the staff estimate contains the true potential');
  assertEq(potText(g, own), potText(g, own), 'the estimate is stable');
  assert(ok.high - ok.low >= 3, 'own players are an estimate, not exact');
  const target = Object.values(g.players).find((p) => p.clubId !== g.userClubId && p.potential - p.skill > 5);
  assertEq(potText(g, target), '?', 'unknown player');
  setLevel(g, 2);
  const r = assignScout(g, target.id);
  assert(r.ok, r.message);
  for (let i = 0; i <= LEVELS[2].days; i++) startDay(g);
  const k = knownPotential(g, target);
  assert(k && k.low <= target.potential && k.high >= target.potential, 'range must contain the true potential');
  assertBetween(k.high - k.low, 0, LEVELS[2].band, 'range width');
  info(`Scout report: true potential ${target.potential}, reported ${potText(g, target)}`);
  // Slot limit
  setLevel(g, 0);
  const others = Object.values(g.players).filter((p) => p.clubId !== g.userClubId).slice(0, 3);
  assert(assignScout(g, others[0].id).ok, 'first assignment');
  assert(!assignScout(g, others[1].id).ok, 'level 0 has one scout');
});

test('scouting costs money each month and reports survive saving', () => {
  const g = career('scoutcost');
  setLevel(g, 3);
  const p = Object.values(g.players).find((x) => x.clubId !== g.userClubId);
  assignScout(g, p.id);
  const cost = scoutingCost(g, g.clubs[g.userClubId], 3); // scaled to the club, from the season's start
  assert(cost > 0 && cost !== LEVELS[3].cost, 'scouting priced for the club');
  simulateRestOfSeason(g);
  endSeason(g);
  const h = g.clubs[g.userClubId].finance.history.at(-1);
  assertBetween(h.scouting, cost * 0.98, cost * 1.02, 'a full year of scouting');
  const back = deserialize(serialize(g));
  assertEq(JSON.stringify(scoutingOf(back)), JSON.stringify(scoutingOf(g)));
});
