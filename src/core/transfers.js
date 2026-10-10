// Transfer market: windows, asking prices, offers (user <-> AI), AI-to-AI
// deals and contracts.

import { Rng } from './rng.js';
import { dayOf } from './calendar.js';
import { playerValue, playerWage, ageOf } from './valuation.js';
import { addNews } from './season.js';
import { freeNumber } from './development.js';
import { repairLineup } from './lineup.js';
import { autoLineup } from './ai.js';
import { bigTransfer } from './newsfeed.js';
import { aiLoanOffers, acceptLoanOffer } from './loans.js';
import { contractMood, onContractSigned } from './morale.js';

// ---- windows ----

export function windows(game) {
  const y = game.season.year;
  return [
    { name: 'summer', open: game.season.start - 7, close: dayOf(y, 8, 31) },
    { name: 'winter', open: dayOf(y + 1, 1, 1), close: dayOf(y + 1, 1, 31) },
  ];
}

export function openWindow(game, day = game.day) {
  return windows(game).find((w) => day >= w.open && day <= w.close && game.season.phase === 'season') || null;
}

export function nextWindow(game) {
  return windows(game).find((w) => w.open > game.day) || null;
}

// ---- prices and wages ----

const isStarter = (game, club, id) => !!club.lineup && club.lineup.slots.includes(id);

// What an AI club asks for one of its players.
export function askingPrice(game, p) {
  const year = game.season.year;
  const club = game.clubs[p.clubId];
  let mult = 1.2;
  if (p.listed) mult = 1.0;
  else if (club && isStarter(game, club, p.id)) mult = 1.6;
  if (ageOf(p, year) <= 21 && p.potential - p.skill >= 10) mult += 0.25;
  if (p.contractEnd <= year + 1) mult *= 0.8; // contract running out
  const v = playerValue(p, year) * mult;
  return v >= 1e6 ? Math.round(v / 1e5) * 1e5 : Math.round(v / 1e4) * 1e4;
}

// Yearly wage a player asks to join (or stay at) a club.
export function wageDemand(game, p, club) {
  const base = Math.max(p.wage, playerWage(p, game.season.year));
  const seller = game.clubs[p.clubId];
  const bump = seller && seller.id !== club.id ? 1.15 : 1.08;
  return Math.round((base * bump) / 1000) * 1000;
}

// Does the player want to move to `club`? Stars don't drop far down.
export function willJoin(game, p, club) {
  const seller = game.clubs[p.clubId];
  if (!seller) return { ok: true };
  const level = 30 + club.reputation * 0.55;
  if (club.reputation < seller.reputation - 20 && p.skill > level + 10) {
    return { ok: false, reason: `${p.first} ${p.last} is not interested in joining a club of ${club.name}'s stature.` };
  }
  return { ok: true };
}

// ---- executing a transfer ----

export function executeTransfer(game, playerId, toClubId, fee, { years = 3, wage = null } = {}) {
  const p = game.players[playerId];
  const from = game.clubs[p.clubId];
  const to = game.clubs[toClubId];
  const year = game.season.year;
  from.squad = from.squad.filter((id) => id !== playerId);
  if (from.lineup) {
    from.lineup.slots = from.lineup.slots.map((id) => (id === playerId ? null : id));
    from.lineup.bench = from.lineup.bench.filter((id) => id !== playerId);
    for (const k of ['captainId', 'setPieceId', 'penaltyId']) if (from.lineup[k] === playerId) from.lineup[k] = null;
  }
  for (const k of ['A', 'B', 'C']) {
    const s = from.savedLineups?.[k];
    if (s) { s.slots = s.slots.map((id) => (id === playerId ? null : id)); s.bench = s.bench.filter((id) => id !== playerId); }
  }
  from.budget += fee;
  from.finance.season.transfersOut += fee;
  to.budget -= fee;
  to.finance.season.transfersIn += fee;
  p.clubId = to.id;
  if (to.id === game.userClubId) p.mood = null; // a new arrival: morale starts with a boost
  else if (from.id === game.userClubId) delete p.mood;
  p.listed = false;
  delete p.askingPrice;
  p.number = freeNumber(game, to);
  p.contractEnd = year + years;
  p.wage = wage ?? wageDemand(game, p, to);
  to.squad.push(playerId);
  if (to.id === game.userClubId && to.lineup) to.lineup = repairLineup(game, to, to.lineup).lineup;
  if (from.id === game.userClubId && from.lineup) from.lineup = repairLineup(game, from, from.lineup).lineup;
  const t = { id: 't' + (game.ids.transfer = (game.ids.transfer || 0) + 1), day: game.day, playerId, playerName: `${p.first[0]}. ${p.last}`,
    fromId: from.id, toId: to.id, fee, year };
  game.transfers.unshift(t);
  if (game.transfers.length > 300) game.transfers.length = 300;
  bigTransfer(game, t);
  game.offers = (game.offers || []).filter((o) => o.playerId !== playerId);
  return t;
}

// ---- the user buying ----

// Result: { status: 'accepted'|'counter'|'rejected', message, counter? }
export function evaluateBid(game, playerId, fee) {
  const p = game.players[playerId];
  const user = game.clubs[game.userClubId];
  if (!openWindow(game)) return { status: 'rejected', message: 'The transfer window is closed.' };
  if (p.clubId === user.id) return { status: 'rejected', message: 'He already plays for you.' };
  if (p.loan) return { status: 'rejected', message: 'He is on loan; he can only be bought from his own club after the loan.' };
  if (fee > user.budget) return { status: 'rejected', message: 'You cannot afford that fee.' };
  const will = willJoin(game, p, user);
  if (!will.ok) return { status: 'rejected', message: will.reason };
  const seller = game.clubs[p.clubId];
  const ask = askingPrice(game, p);
  const posCount = seller.squad.filter((id) => game.players[id].pos === p.pos).length;
  if (posCount <= (p.pos === 'G' ? 2 : 4)) return { status: 'rejected', message: `${seller.name} cannot spare a ${p.pos === 'G' ? 'goalkeeper' : 'player in that position'}.` };
  if (fee >= ask) return { status: 'accepted', message: `${seller.name} accept your offer.` };
  if (fee >= ask * 0.75) return { status: 'counter', counter: ask, message: `${seller.name} want ${ask.toLocaleString('en-US')} €.` };
  return { status: 'rejected', message: `${seller.name} reject the offer as far too low.` };
}

export function buyPlayer(game, playerId, fee, years = 3) {
  const user = game.clubs[game.userClubId];
  const p = game.players[playerId];
  const wage = wageDemand(game, p, user);
  const fromName = game.clubs[p.clubId].name;
  const t = executeTransfer(game, playerId, user.id, fee, { years, wage });
  addNews(game, `Signed: ${p.first} ${p.last} joins from ${fromName} for ${fee.toLocaleString('en-US')} €.`, 'transfer');
  return t;
}

// ---- the user selling ----

export function listPlayer(game, playerId, price) {
  const p = game.players[playerId];
  // Being put up for sale without asking hurts, loyal players most of all.
  if (p.mood && !p.mood.request && !p.listed) p.mood.events -= p.personality === 'loyal' ? 12 : p.personality === 'ambitious' ? 3 : 6;
  p.listed = true;
  p.askingPrice = Math.max(10000, Math.round(price / 1000) * 1000);
}

export function unlistPlayer(game, playerId) {
  const p = game.players[playerId];
  p.listed = false;
  delete p.askingPrice;
}

export function acceptOffer(game, offerId) {
  const o = (game.offers || []).find((x) => x.id === offerId);
  if (o && o.type === 'loan') return acceptLoanOffer(game, offerId);
  if (!o || !openWindow(game)) return false;
  const p = game.players[o.playerId];
  const buyer = game.clubs[o.clubId];
  if (!p || buyer.budget < o.fee || game.clubs[game.userClubId].squad.length <= 16) return false;
  executeTransfer(game, o.playerId, o.clubId, o.fee);
  addNews(game, `Sold: ${p.first} ${p.last} joins ${buyer.name} for ${o.fee.toLocaleString('en-US')} €.`, 'transfer');
  return true;
}

export function rejectOffer(game, offerId) {
  game.offers = (game.offers || []).filter((o) => o.id !== offerId);
}

// ---- contracts ----

// Personality changes the price (ambitious +10%, loyal -8%); unhappy players refuse.
export function contractTerms(game, p) {
  const age = ageOf(p, game.season.year);
  const mood = contractMood(game, p);
  return {
    wage: Math.round((wageDemand(game, p, game.clubs[p.clubId]) * (mood.wageMult || 1)) / 1000) * 1000,
    maxYears: age >= 32 ? 1 : age >= 30 ? 2 : 5,
    refuse: mood.ok ? null : mood.reason,
  };
}

export function renewContract(game, playerId, years) {
  const p = game.players[playerId];
  const t = contractTerms(game, p);
  if (t.refuse) return { ok: false, message: t.refuse };
  if (years > t.maxYears) return { ok: false, message: `At his age he only signs for ${t.maxYears} year${t.maxYears > 1 ? 's' : ''}.` };
  p.wage = t.wage;
  p.contractEnd = game.season.year + years;
  onContractSigned(p);
  return { ok: true, message: `${p.first} ${p.last} signs until ${p.contractEnd} for ${t.wage.toLocaleString('en-US')} € a year.` };
}

// ---- daily market activity ----

function clubLevel(game, club) {
  const xi = (club.lineup ? club.lineup.slots : club.squad).filter(Boolean).map((id) => game.players[id].skill);
  return xi.reduce((a, b) => a + b, 0) / Math.max(1, xi.length);
}

// AI clubs make offers for the user's listed players (and now and then for unlisted good ones).
function aiOffersForUser(game, rng) {
  const user = game.clubs[game.userClubId];
  game.offers = (game.offers || []).filter((o) => o.expires >= game.day && game.players[o.playerId]?.clubId === user.id);
  const others = Object.values(game.clubs).filter((c) => c.id !== user.id);
  for (const id of user.squad) {
    const p = game.players[id];
    if (p.loan) continue; // borrowed players aren't ours to sell
    // Word gets around when a player wants to leave: more bids, lower ones.
    const wantsOut = !!p.mood?.request;
    const chance = p.listed ? 0.12 : wantsOut ? 0.06 : 0.006;
    if (!rng.chance(chance) || game.offers.some((o) => o.playerId === id)) continue;
    const price = p.listed ? p.askingPrice : playerValue(p, game.season.year) * (wantsOut ? rng.float(0.85, 1.15) : rng.float(1.1, 1.5));
    const fee = Math.round((price * rng.float(p.listed ? 0.75 : 1, p.listed ? 1.05 : 1)) / 1000) * 1000;
    const buyers = others.filter((c) => c.budget > fee * 1.5 && p.skill >= clubLevel(game, c) - 3 && p.skill <= clubLevel(game, c) + 12);
    if (!buyers.length) continue;
    const buyer = rng.pick(buyers);
    const offer = { id: 'o' + (game.ids.offer = (game.ids.offer || 0) + 1), playerId: id, clubId: buyer.id, fee, day: game.day, expires: game.day + 7 };
    game.offers.push(offer);
    addNews(game, `Offer: ${buyer.name} bid ${fee.toLocaleString('en-US')} € for ${p.first} ${p.last} (valid 7 days).`, 'offer');
  }
}

// AI clubs buy from each other: mostly players who improve their XI from
// clubs of similar or lower standing.
function aiDeals(game, rng) {
  const clubs = Object.values(game.clubs).filter((c) => c.id !== game.userClubId);
  const all = clubs.flatMap((c) => c.squad.map((id) => game.players[id])).filter((p) => !p.loan);
  const deals = rng.int(1, 4); // attempts per window day; many find nothing suitable
  for (let k = 0; k < deals; k++) {
    const buyer = rng.weighted(clubs, (c) => Math.sqrt(Math.max(0, c.budget)));
    const level = clubLevel(game, buyer);
    const sample = [];
    for (let i = 0; i < 250; i++) {
      const p = rng.pick(all);
      if (!p || p.clubId === buyer.id || !game.players[p.id]) continue;
      const seller = game.clubs[p.clubId];
      if (!seller.squad.includes(p.id) || seller.squad.length <= 20) continue;
      if (p.skill < level + 1 || p.skill > level + 9 || ageOf(p, game.season.year) > 31) continue;
      if (seller.reputation > buyer.reputation + 8) continue;
      if (seller.nationId !== buyer.nationId) {
        // Players move abroad only to an equal or stronger country.
        if (rng.chance(0.7) || game.nations[buyer.nationId].strength < game.nations[seller.nationId].strength) continue;
      }
      // Clubs only shortlist players they can afford.
      if (askingPrice(game, p) > buyer.budget * 0.35) continue;
      sample.push(p);
    }
    if (!sample.length) continue;
    const p = rng.pick(sample);
    const fee = askingPrice(game, p);
    const seller = game.clubs[p.clubId];
    executeTransfer(game, p.id, buyer.id, fee, { years: rng.int(2, 4) });
    seller.lineup = autoLineup(game, seller);
    buyer.lineup = autoLineup(game, buyer);
  }
}

export function dailyMarket(game) {
  if (!openWindow(game)) { game.offers = (game.offers || []).filter((o) => o.expires >= game.day); return; }
  const rng = new Rng(game.rng);
  aiDeals(game, rng);
  aiOffersForUser(game, rng);
  aiLoanOffers(game, rng);
}

// ---- search ----

export function searchPlayers(game, f = {}) {
  const year = game.season.year;
  const out = [];
  for (const p of Object.values(game.players)) {
    if (!p.clubId || p.clubId === game.userClubId) continue;
    const club = game.clubs[p.clubId];
    if (!club.squad.includes(p.id) || p.loan) continue; // academy and loaned players aren't for sale
    const age = year - p.birthYear;
    if (f.pos && p.pos !== f.pos) continue;
    if (f.minAge && age < f.minAge) continue;
    if (f.maxAge && age > f.maxAge) continue;
    if (f.minSkill && p.skill < f.minSkill) continue;
    if (f.minPot && p.potential < f.minPot) continue;
    if (f.nationId && p.nationId !== f.nationId) continue;
    if (f.country && club.nationId !== f.country) continue;
    if (f.compId && club.compId !== f.compId) continue;
    if (f.listed && !p.listed) continue;
    if (f.name && !`${p.first} ${p.last}`.toLowerCase().includes(f.name.toLowerCase())) continue;
    const price = askingPrice(game, p);
    if (f.maxPrice && price > f.maxPrice) continue;
    out.push({ p, price });
  }
  return out;
}
