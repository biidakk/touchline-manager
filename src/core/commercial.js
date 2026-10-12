// Season decisions for the user's club: ticket prices (every summer) and the
// main shirt sponsor (when the contract has run out).
//
// Sponsors offer three contracts: a short one pays the most per season, a
// long one less but locks the money in (useful before a hard season) and
// comes with a signing bonus. Amounts follow the club's level when signed.

import { Rng, hashSeed } from './rng.js';
import { TICKET_PLANS, sponsorBase } from './finance.js';
import { addNews } from './season.js';
import { money } from './currency.js';

export const SPONSOR_TERMS = [
  { years: 1, factor: 1.15, bonus: 0 },
  { years: 3, factor: 1.0, bonus: 0.1 },
  { years: 5, factor: 0.9, bonus: 0.3 },
];

const SPONSOR_NAMES = ['Northwind Logistics', 'Bluepeak Energy', 'Castellan Insurance', 'Orbis Telecom', 'Harbour Bank',
  'Vantage Motors', 'Silverline Airways', 'Kestrel Beverages', 'Meridian Foods', 'Atlas Construction', 'Lumen Electronics',
  'Granite Breweries', 'Polar Water', 'Summit Bet', 'Redwood Timber', 'Nova Pharma', 'Crestway Hotels', 'Pioneer Steel',
  'Zephyr Mobile', 'Evergreen Dairy', 'Ironbridge Tools', 'Sapphire Cosmetics', 'Falcon Express', 'Tidewater Shipping'];

export function dealsOf(club) {
  if (!club.deals) club.deals = { ticket: 'normal', ticketYear: null, sponsor: null };
  return club.deals;
}

// What still has to be decided before the user's next match.
export function decisionsDue(game) {
  const club = game.clubs[game.userClubId];
  if (!club || game.manager?.sacked) return { ticket: false, sponsor: false, any: false };
  const d = dealsOf(club);
  const ticket = d.ticketYear !== game.season.year;
  const sponsor = !d.sponsor || d.sponsor.until < game.season.year;
  return { ticket, sponsor, any: ticket || sponsor };
}

// Three offers from different companies, fixed for the club and the season.
export function sponsorOffers(game) {
  const club = game.clubs[game.userClubId];
  const rng = new Rng({ s: hashSeed(`${game.seed}:sponsor:${club.id}:${game.season.year}`) });
  const names = rng.shuffle(SPONSOR_NAMES.slice());
  const base = sponsorBase(game, club);
  return SPONSOR_TERMS.map((t, i) => {
    const perYear = Math.round((base * t.factor * rng.float(0.94, 1.06)) / 5000) * 5000;
    return { name: names[i], years: t.years, perYear, bonus: Math.round((perYear * t.bonus) / 5000) * 5000 };
  });
}

export function chooseTickets(game, plan) {
  if (!TICKET_PLANS[plan]) return { ok: false, message: 'Unknown ticket price.' };
  const d = dealsOf(game.clubs[game.userClubId]);
  d.ticket = plan;
  d.ticketYear = game.season.year;
  return { ok: true, message: `Ticket prices for the season: ${TICKET_PLANS[plan].label.toLowerCase()}.` };
}

export function signSponsor(game, index) {
  const club = game.clubs[game.userClubId];
  const o = sponsorOffers(game)[index];
  if (!o) return { ok: false, message: 'That offer is not available.' };
  const d = dealsOf(club);
  d.sponsor = { name: o.name, perYear: o.perYear, from: game.season.year, until: game.season.year + o.years - 1 };
  if (o.bonus) {
    club.budget += o.bonus;
    club.finance.season.tvSponsors = (club.finance.season.tvSponsors || 0) + o.bonus;
  }
  addNews(game, `${club.name} have signed a ${o.years}-year shirt deal with ${o.name}: ${money(game, o.perYear)} a season${o.bonus ? ` plus ${money(game, o.bonus)} on signing` : ''}.`, 'club');
  return { ok: true, message: `${o.name} is your new shirt sponsor.` };
}

// A club the user takes over keeps no deals from before: new decisions.
export function clearDeals(club) {
  delete club.deals;
}
