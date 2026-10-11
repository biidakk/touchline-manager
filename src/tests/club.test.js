import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { sortedTable } from '../core/season.js';
import { standsOf, missingStands, standQuote, startStand, pitchOf, pitchCost, improvePitch, seasonEndPitches,
  pitchTechnique, pitchInjury, stadiumMoney } from '../core/stadium.js';
import { demand, ticketPrice, tvSponsorsPerYear, TICKET_PLANS } from '../core/finance.js';
import { decisionsDue, sponsorOffers, chooseTickets, signSponsor } from '../core/commercial.js';
import { askBoard, acceptBoardOffer, canAskBoard, confidence } from '../core/board.js';
import { serialize, deserialize } from '../core/save.js';
import { Rng } from '../core/rng.js';

function career(seed, comp = 'GER-L1', idx = 2) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds.at(idx), 'Builder');
}

test('stands: small grounds miss some, corners need both neighbours, a new stand adds seats', () => {
  const g = career('stands', 'CZE-L2', -1);
  const club = g.clubs[g.userClubId];
  const have = standsOf(club);
  assert(have.includes('main') && have.length < 8, `a small ground misses stands (${have.join(',')})`);
  for (const s of missingStands(club)) if (s.needs) assert(s.needs.every((k) => have.includes(k)), `${s.key} without neighbours`);
  const big = Object.values(g.clubs).sort((a, b) => b.stadium.capacity - a.stadium.capacity)[0];
  assertEq(standsOf(big).length, 8, 'the biggest grounds are complete');
  const key = missingStands(club)[0].key;
  const q = standQuote(club, key);
  club.budget = 1000;
  club.stadium.fund = q.cost - 500;
  assert(startStand(g, club, key).ok, 'the stadium fund counts');
  assertEq(club.stadium.fund, 0, 'the fund is spent first');
  assertEq(club.budget, 500);
  const cap = club.stadium.capacity;
  for (let i = 0; i <= q.days + 1; i++) startDay(g);
  assertEq(club.stadium.capacity, cap + q.seats, 'seats added');
  assert(standsOf(club).includes(key), 'the stand is part of the ground');
  info(`New ${q.label}: +${q.seats} seats for ${q.cost.toLocaleString('en-US')} €, ${q.days} days (ground was ${cap})`);
});

test('pitch: 1-10, costs money to improve, wears every season and matters in matches', () => {
  const g = career('pitch');
  const club = g.clubs[g.userClubId];
  const q = pitchOf(club);
  assertBetween(q, 3, 9, 'starting pitch');
  club.budget = 0;
  assert(!improvePitch(g, club, 10).ok, 'needs money');
  club.budget = 50e6;
  const cost = pitchCost(g, club, 10);
  assert(improvePitch(g, club, 10).ok);
  assertEq(club.stadium.pitch, 10);
  assertEq(club.budget, 50e6 - cost);
  seasonEndPitches(g, new Rng(5));
  assertBetween(club.stadium.pitch, 8, 9, 'wears by one or two');
  assert(pitchTechnique(2) < pitchTechnique(7) && pitchTechnique(10) > 1, 'technique');
  assert(pitchInjury(2) > pitchInjury(7) && pitchInjury(10) < 1, 'injuries');
  info(`Re-laying ${q} -> 10 costs ${cost.toLocaleString('en-US')} €`);
});

test('tickets and sponsor: chosen each summer, prices move demand, deals pay', () => {
  const g = career('deals');
  const club = g.clubs[g.userClubId];
  assert(decisionsDue(g).ticket && decisionsDue(g).sponsor, 'a new career has decisions to make');
  const f = Object.values(g.fixtures).find((x) => x.homeId === club.id);
  const d0 = demand(g, f);
  const p0 = ticketPrice(g, club);
  chooseTickets(g, 'high');
  assert(ticketPrice(g, club) > p0 && demand(g, f) < d0, 'high prices: dearer, fewer fans');
  chooseTickets(g, 'low');
  assert(ticketPrice(g, club) < p0 && demand(g, f) > d0, 'low prices: cheaper, more fans');
  const offers = sponsorOffers(g);
  assertEq(offers.map((o) => o.years).join(','), '1,3,5');
  assert(offers[0].perYear > offers[2].perYear, 'short deals pay more per season');
  assert(offers[2].bonus > 0 && offers[0].bonus === 0, 'long deals come with a bonus');
  const before = club.budget;
  signSponsor(g, 2);
  assertEq(club.budget, before + offers[2].bonus, 'signing bonus paid');
  assert(!decisionsDue(g).any, 'nothing left to decide');
  const tv = tvSponsorsPerYear(g, club);
  club.deals.sponsor.perYear += 100000;
  assertEq(Math.round(tvSponsorsPerYear(g, club) - tv), 100000, 'the sponsor contract is paid');
  const back = deserialize(serialize(g));
  assertEq(JSON.stringify(back.clubs[club.id].deals), JSON.stringify(club.deals), 'deals survive saving');
  simulateRestOfSeason(g);
  endSeason(g);
  assert(decisionsDue(g).ticket && !decisionsDue(g).sponsor, 'next summer: new prices, the 5-year deal runs on');
  info(`Sponsors: ${offers.map((o) => `${o.years}y ${o.perYear.toLocaleString('en-US')} (+${o.bonus.toLocaleString('en-US')})`).join(' / ')}; tickets ${Object.keys(TICKET_PLANS).map((k) => ticketPrice(g, club, TICKET_PLANS[k])).join('/')} €`);
});

test('asking the board for money: once a season, sometimes for a promise that can cost the job', () => {
  const g = career('askboard', 'ENG-L1', 10);
  const club = g.clubs[g.userClubId];
  g.manager.board.standing = 5;
  const r = askBoard(g, 'transfers', 'medium');
  assert(r.ok, r.message);
  assert(!canAskBoard(g).ok, 'only once a season');
  assert(!askBoard(g, 'stadium', 'small').ok, 'a second request is refused');
  info(`Confidence ${confidence(g)}: ${r.message}`);
  // A promise the team doesn't keep gets the manager sacked.
  const g2 = career('askboard2', 'ENG-L1', 12);
  g2.manager.board.standing = -10;
  const r2 = askBoard(g2, 'stadium', 'large');
  if (r2.offer.verdict === 'promise') {
    const fund = g2.clubs[g2.userClubId].stadium.fund || 0;
    acceptBoardOffer(g2);
    assertEq(stadiumMoney(g2.clubs[g2.userClubId]) - g2.clubs[g2.userClubId].budget, fund + r2.offer.amount, 'stadium money set aside');
    assertEq(g2.manager.target.maxPos, r2.offer.maxPos, 'the promise becomes the target');
  }
  g2.manager.board.standing = 30;
  simulateRestOfSeason(g2);
  const comp = g2.competitions[g2.clubs[g2.userClubId].compId];
  const pos = sortedTable(g2, comp).findIndex((x) => x.clubId === g2.userClubId) + 1;
  g2.manager.board.pledge = { year: g2.season.year, maxPos: Math.max(1, pos - 1) };
  const s = endSeason(g2);
  assert(pos === 1 || s.user.sacked, 'a broken promise means the sack');
  assertEq(club.id, g.userClubId);
});
