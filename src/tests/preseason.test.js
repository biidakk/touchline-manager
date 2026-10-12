import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { advanceToUserMatch, playUserMatchInstant, startDay, simulateRestOfSeason } from '../core/matchday.js';
import { openWindow, listPlayer, newOffers, windows } from '../core/transfers.js';
import { TOURS, FRIENDLY_DAYS, tourDue, tourMoney, tourOpponents, chooseTour, isFriendly } from '../core/preseason.js';
import { clubLevel } from '../core/finance.js';
import { endSeason } from '../core/seasonend.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed, comp = 'CZE-L1', idx = 0) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Tour');
}

test('pre-season: two weeks, three tours with different costs, morale and teamwork', () => {
  const g = career('tours');
  const user = g.clubs[g.userClubId];
  assertEq(g.day, g.season.start - 14, 'two weeks before the first league match');
  assert(openWindow(g), 'the summer window is open in pre-season');
  assert(tourDue(g), 'a tour can be chosen');
  const money = TOURS.map((t) => tourMoney(g, user, t));
  assert(money[0].cost < money[1].cost && money[1].cost < money[2].cost, `costs ${money.map((m) => m.cost)}`);
  assert(TOURS[0].teamwork > TOURS[1].teamwork && TOURS[1].morale > TOURS[0].morale, 'camp builds the team, the coast lifts morale');
  for (const t of TOURS) {
    const opps = tourOpponents(g, t.key).map((id) => g.clubs[id]);
    assertEq(opps.length, 3, `${t.key} opponents`);
    for (const c of opps) {
      assert(c.nationId !== user.nationId, `${c.name} is not foreign`);
      assertBetween(clubLevel(g, c) - clubLevel(g, user) - t.level, -12, 12, `${c.name} level`);
    }
  }
  const before = { budget: user.budget, tw: user.teamwork };
  const r = chooseTour(g, 'camp');
  assert(r.ok, r.message);
  assert(!tourDue(g), 'only one tour a season');
  assertEq(user.budget, before.budget - money[0].cost + money[0].fees, 'paid');
  assertEq(user.teamwork, Math.min(100, before.tw + TOURS[0].teamwork), 'teamwork');
  const fx = user.tour.fixtureIds.map((id) => g.fixtures[id]);
  assertEq(fx.map((f) => g.season.start - f.day).join(), FRIENDLY_DAYS.join(), 'friendly days');
  assert(!chooseTour(g, 'coast').ok, 'no second tour');
});

test('friendlies are played like matches but count for nothing', () => {
  const g = career('friendly');
  const user = g.clubs[g.userClubId];
  chooseTour(g, 'coast');
  const table = JSON.stringify(g.competitions[user.compId].table);
  const apps = user.squad.reduce((a, id) => a + g.players[id].stats.season.apps, 0);
  let played = 0;
  for (let i = 0; i < 3; i++) {
    const f = advanceToUserMatch(g);
    assert(f && isFriendly(g, f), `match ${i + 1} should be a friendly`);
    playUserMatchInstant(g, f);
    assert(f.result && f.result.friendly, 'result stored');
    played++;
  }
  assertEq(played, 3);
  assertEq(JSON.stringify(g.competitions[user.compId].table), table, 'table untouched');
  assertEq(user.squad.reduce((a, id) => a + g.players[id].stats.season.apps, 0), apps, 'no appearances counted');
  const next = advanceToUserMatch(g);
  assert(next && !isFriendly(g, next), 'then the season starts');
  assert(next.day >= g.season.start, 'first competitive match on or after the start');
  // The season still completes, and the save round-trips.
  playUserMatchInstant(g, next);
  const back = deserialize(serialize(g));
  assertEq(back.competitions.FRIENDLY.type, 'friendly');
  simulateRestOfSeason(g);
  endSeason(g);
  assert(tourDue(g), 'a new tour next summer');
});

test('no offers for the user during the friendlies; the window closing is announced and clears offers', () => {
  const g = career('quiet');
  const user = g.clubs[g.userClubId];
  chooseTour(g, 'world');
  for (const id of user.squad.filter((x) => !user.lineup.slots.includes(x)).slice(0, 5)) listPlayer(g, id, Math.round(g.players[id].value * 0.6));
  while (g.day < g.season.start - 3) {
    const f = startDay(g);
    if (f) playUserMatchInstant(g, f);
    assertEq((g.offers || []).length, 0, `offer on day ${g.season.start - g.day} before the start`);
  }
  const close = windows(g).find((w) => w.name === 'summer').close;
  let offers = 0;
  while (g.day < close) {
    const f = startDay(g);
    if (f) playUserMatchInstant(g, f);
    offers = Math.max(offers, (g.offers || []).length);
  }
  info(`Offers for 5 listed players during the summer window: up to ${offers} at once`);
  const f = startDay(g);
  if (f) playUserMatchInstant(g, f);
  assertEq(g.windowNews?.name, 'summer', 'closing announced');
  assertEq((g.offers || []).length, 0, 'offers lapse');
  assertEq(newOffers(g).length, 0, 'nothing to show');
});

test('CONTINUE stops for offers at most once a week', () => {
  const g = career('weekly', 'ENG-L1', 8);
  const user = g.clubs[g.userClubId];
  for (const id of user.squad.filter((x) => !user.lineup.slots.includes(x)).slice(0, 6)) listPlayer(g, id, Math.round(g.players[id].value * 0.5));
  const stops = [];
  while (g.day < windows(g)[0].close) {
    const f = advanceToUserMatch(g, { stopForOffers: true });
    if (g.stopReason === 'offer') stops.push(g.day);
    delete g.stopReason;
    for (const o of newOffers(g)) o.seen = true;
    if (f) playUserMatchInstant(g, f);
  }
  for (let i = 1; i < stops.length; i++) assert(stops[i] - stops[i - 1] >= 7, `stops ${stops[i - 1]} and ${stops[i]} too close`);
  info(`Offer stops in the summer window: ${stops.length}`);
});
