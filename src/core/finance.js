// Club finances: gate receipts, TV & sponsors, wages, running costs, prizes.
// Income is scaled to a club's level so that a typical squad roughly breaks
// even; overspending on wages or transfers costs money.

import { clamp } from './rng.js';
import { playerWage } from './valuation.js';
import { addNews } from './season.js';
import { naturalCrowd } from './stadium.js';
import { scoutingCostPerYear } from './scouting.js';
import { wageShareOf, loanedOutBy } from './loans.js';
import { staffWages, expectedStaffWages } from './training.js';
import { groundDemand, facilitiesUpkeep } from './facilities.js';
import { money } from './currency.js';

export const clubLevel = (game, club) => 30 + club.reputation * 0.55 + (game.nations[club.nationId].strength || 0);

// Yearly wage bill of a typical squad at the club's level.
export function expectedWageBill(game, club) {
  const level = clubLevel(game, club);
  const typical = playerWage({ skill: level, potential: level, birthYear: game.season.year - 26, pos: 'M' }, game.season.year);
  // Calibrated against the wage level squads settle at after a few seasons
  // (stars, prospects and veterans mixed); see the finance and 20-season tests.
  return 25 * typical * 1.12;
}

// Prices for services that grow with the club (scouting): 1 at a club with a
// 6M wage bill.
export const costScale = (game, club) => clamp(expectedWageBill(game, club) / 6e6, 0.1, 3);

// TV money and sponsorship of a club at this level (AI clubs get this).
function baseTvSponsors(game, club) {
  const tier = game.competitions[club.compId].tier;
  return expectedWageBill(game, club) * (tier === 1 ? 0.92 : 0.82) + (tier === 1 ? 4e5 : 5e4);
}

// The main shirt sponsor's usual share of that; the user's club gets its
// sponsor's actual contract instead (see commercial.js).
export const SPONSOR_SHARE = 0.3;
export const sponsorBase = (game, club) => baseTvSponsors(game, club) * SPONSOR_SHARE;

export function tvSponsorsPerYear(game, club) {
  const s = club.deals?.sponsor;
  const base = baseTvSponsors(game, club);
  return s ? base * (1 - SPONSOR_SHARE) + s.perYear : base;
}

export const costsPerYear = (game, club) => expectedWageBill(game, club) * 0.12 + club.stadium.capacity * 20;

// Wages a club pays: its squad and academy (only its share for borrowed
// players) plus its remaining share for players it has loaned out.
// `loanedOut` (parentId -> wages still owed) can be passed in when computing
// many clubs at once, to avoid scanning every player for each club.
export function wageBill(game, club, loanedOut = null) {
  let s = 0;
  for (const id of [...club.squad, ...(club.youth || [])]) {
    const p = game.players[id];
    if (p) s += p.wage * wageShareOf(p, club.id);
  }
  if (loanedOut) s += loanedOut.get(club.id) || 0;
  else for (const p of loanedOutBy(game, club.id)) s += p.wage * (1 - p.loan.wageShare);
  return s;
}

export function loanedOutWages(game) {
  const map = new Map();
  for (const id in game.players) {
    const p = game.players[id];
    if (p.loan) map.set(p.loan.parentId, (map.get(p.loan.parentId) || 0) + p.wage * (1 - p.loan.wageShare));
  }
  return map;
}

// Priced from the club's level and its natural crowd (not the stadium size),
// so a season at a typical crowd brings in about half the expected wage bill.
// A bigger stadium then earns more only while demand fills it.
// Ticket prices are set each summer (user club): cheaper tickets fill more
// seats (and a full house lifts the team), dearer ones earn more per fan.
export const TICKET_PLANS = {
  low: { label: 'Low', price: 0.8, demand: 1.15 },
  normal: { label: 'Normal', price: 1, demand: 1 },
  high: { label: 'High', price: 1.3, demand: 0.82 },
};
const ticketPlan = (club) => TICKET_PLANS[club.deals?.ticket] || TICKET_PLANS.normal;

export const ticketPrice = (game, club, plan = ticketPlan(club)) => Math.max(3, Math.round(
  ((expectedWageBill(game, club) * 0.5) / (19 * naturalCrowd(club) * 0.8)) * plan.price));

// How many people want to come: the club's natural crowd, moved by form,
// the opponent and the competition.
export function demand(game, f) {
  const home = game.clubs[f.homeId];
  const away = game.clubs[f.awayId];
  const comp = game.competitions[f.compId];
  const row = game.competitions[home.compId].table[home.id];
  const form = row ? row.form.slice(-5).reduce((a, x) => a + (x === 'W' ? 0.02 : x === 'L' ? -0.015 : 0), 0) : 0;
  const fill = clamp(0.3 + home.reputation / 200 + (away.reputation - 50) / 400 + form
    + (comp.type === 'cup' ? 0.08 : comp.type === 'continental' ? [0.2, 0.12, 0.07][(comp.level || 1) - 1] : 0), 0.15, 1);
  return Math.round(naturalCrowd(home) * 1.25 * fill * ticketPlan(home).demand * groundDemand(game, home));
}

// Gate receipts for the home side of a fixture.
export function gate(game, f) {
  const home = game.clubs[f.homeId];
  const attendance = Math.min(home.stadium.capacity, demand(game, f));
  return { attendance, income: attendance * ticketPrice(game, home), soldOut: attendance >= home.stadium.capacity };
}

function book(club, key, amount) {
  club.budget += amount;
  club.finance.season[key] = (club.finance.season[key] || 0) + Math.abs(amount);
}

// One month of TV money, wages, running costs and scouting for every club.
// Running costs; for the user the generic staff share is replaced by the
// wages of the coaches actually employed.
function monthlyCosts(game, club) {
  if (club.id !== game.userClubId) { book(club, 'costs', -costsPerYear(game, club) / 12); return; }
  const base = costsPerYear(game, club);
  book(club, 'costs', -(Math.max(base * 0.3, base - expectedStaffWages(game, club)) + facilitiesUpkeep(game, club)) / 12);
  const staff = staffWages(club);
  if (staff) book(club, 'staff', -staff / 12);
}

export function monthlyFinances(game) {
  const loaned = loanedOutWages(game);
  for (const club of Object.values(game.clubs)) {
    if (club.guest) continue; // guest clubs: only European prize money and transfers move their money
    book(club, 'tvSponsors', tvSponsorsPerYear(game, club) / 12);
    book(club, 'wages', -wageBill(game, club, loaned) / 12);
    monthlyCosts(game, club);
    const scouting = scoutingCostPerYear(game, club);
    if (scouting) book(club, 'scouting', -scouting / 12);
    club.finance.season.months = (club.finance.season.months || 0) + 1;
  }
  const user = game.clubs[game.userClubId];
  if (user && user.budget < 0) addNews(game, `The club is ${money(game, -user.budget)} in debt. The board wants it fixed: sell players or cut wages.`, 'board');
}

// Pays the months not yet covered this season (called at season end).
export function settleSeason(game) {
  const loaned = loanedOutWages(game);
  for (const club of Object.values(game.clubs)) {
    if (club.guest) continue;
    const left = 12 - (club.finance.season.months || 0);
    for (let i = 0; i < left; i++) {
      book(club, 'tvSponsors', tvSponsorsPerYear(game, club) / 12);
      book(club, 'wages', -wageBill(game, club, loaned) / 12);
      monthlyCosts(game, club);
      const scouting = scoutingCostPerYear(game, club);
      if (scouting) book(club, 'scouting', -scouting / 12);
    }
    club.finance.season.months = 12;
  }
}

export const cupRoundPrize = (k) => 30000 * (k + 1);

export function receiveGate(game, f) {
  const g = gate(game, f);
  book(game.clubs[f.homeId], 'tickets', g.income);
  return g;
}

export function payPrize(club, amount) {
  book(club, 'prizes', amount);
}
