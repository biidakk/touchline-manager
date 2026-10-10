// Loans (both directions, user and AI) and B-team cooperation with a
// partner club.
//
// A loaned player moves into the borrower's squad (p.clubId = borrower) with
// p.loan = { parentId, fee, wageShare, academy, start }. The borrower pays
// `wageShare` of his wage, the parent the rest. All loans end at the end of
// the season and the player returns to his parent club (or its academy).

import { ageOf, playerValue } from './valuation.js';
import { addNews } from './season.js';
import { freeNumber } from './development.js';
import { repairLineup } from './lineup.js';
import { autoLineup } from './ai.js';
import { openWindow, willJoin } from './transfers.js';

export const isOnLoan = (p) => !!(p && p.loan);
export const loanFee = (game, p) => Math.max(10000, Math.round((playerValue(p, game.season.year) * 0.08) / 1000) * 1000);

function detachFrom(game, club, id) {
  club.squad = club.squad.filter((x) => x !== id);
  club.youth = (club.youth || []).filter((x) => x !== id);
  if (club.lineup) {
    club.lineup.slots = club.lineup.slots.map((x) => (x === id ? null : x));
    club.lineup.bench = club.lineup.bench.filter((x) => x !== id);
    for (const k of ['captainId', 'setPieceId', 'penaltyId']) if (club.lineup[k] === id) club.lineup[k] = null;
  }
  for (const k of ['A', 'B', 'C']) {
    const s = club.savedLineups?.[k];
    if (s) { s.slots = s.slots.map((x) => (x === id ? null : x)); s.bench = s.bench.filter((x) => x !== id); }
  }
}

function refreshLineup(game, club) {
  if (club.id === game.userClubId) club.lineup = repairLineup(game, club, club.lineup).lineup;
  else club.lineup = autoLineup(game, club);
}

export function startLoan(game, playerId, toClubId, { fee = 0, wageShare = 1 } = {}) {
  const p = game.players[playerId];
  const parent = game.clubs[p.clubId];
  const to = game.clubs[toClubId];
  const academy = (parent.youth || []).includes(playerId);
  detachFrom(game, parent, playerId);
  parent.budget += fee;
  parent.finance.season.transfersOut += fee;
  to.budget -= fee;
  to.finance.season.transfersIn += fee;
  p.loan = { parentId: parent.id, fee, wageShare, academy, start: game.day };
  p.loanListed = null;
  p.listed = false;
  p.clubId = to.id;
  if (to.id === game.userClubId) p.mood = null; // a new arrival: morale starts with a boost
  p.number = freeNumber(game, to);
  to.squad.push(playerId);
  refreshLineup(game, parent);
  refreshLineup(game, to);
  game.offers = (game.offers || []).filter((o) => o.playerId !== playerId);
  const t = { id: 't' + (game.ids.transfer = (game.ids.transfer || 0) + 1), day: game.day, playerId,
    playerName: `${p.first[0]}. ${p.last}`, fromId: parent.id, toId: to.id, fee, year: game.season.year, loan: true };
  game.transfers.unshift(t);
  if (game.transfers.length > 300) game.transfers.length = 300;
  return t;
}

export function endLoan(game, p) {
  if (!p.loan) return;
  const borrower = game.clubs[p.clubId];
  const parent = game.clubs[p.loan.parentId];
  detachFrom(game, borrower, p.id);
  p.clubId = parent.id;
  if (p.loan.academy) {
    p.number = 0;
    parent.youth = [...(parent.youth || []), p.id];
  } else {
    p.number = freeNumber(game, parent);
    parent.squad.push(p.id);
  }
  delete p.loan;
  refreshLineup(game, borrower);
  refreshLineup(game, parent);
}

// End of season: every loan ends.
export function returnLoans(game) {
  const back = [];
  for (const p of Object.values(game.players)) {
    if (!p.loan) continue;
    if (p.loan.parentId === game.userClubId) back.push(`${p.first} ${p.last}`);
    endLoan(game, p);
  }
  if (back.length) addNews(game, `Back from loan: ${back.join(', ')}.`, 'loan');
}

// Wage costs a club carries: its own squad and academy (its share for loanees
// it has borrowed) plus the part it still pays for players it has loaned out.
export function loanedOutBy(game, clubId) {
  return Object.values(game.players).filter((p) => p.loan && p.loan.parentId === clubId);
}

export function wageShareOf(p, clubId) {
  if (!p.loan) return 1;
  return p.loan.parentId === clubId ? 1 - p.loan.wageShare : p.loan.wageShare;
}

// ---- B-team cooperation ----

export function partnerCandidates(game) {
  const user = game.clubs[game.userClubId];
  return Object.values(game.clubs).filter((c) => c.id !== user.id && c.nationId === user.nationId
    && c.compId !== user.compId && c.reputation < user.reputation)
    .sort((a, b) => b.reputation - a.reputation);
}

export function setPartner(game, clubId) {
  const user = game.clubs[game.userClubId];
  const old = user.partnerId ? game.clubs[user.partnerId] : null;
  if (old) old.bTeamOf = null;
  user.partnerId = clubId || null;
  if (clubId) {
    game.clubs[clubId].bTeamOf = user.id;
    addNews(game, `B-team cooperation agreed with ${game.clubs[clubId].name}: loans to them are free and they pay the wages.`, 'loan');
  }
}

export const partnerOf = (game) => {
  const id = game.clubs[game.userClubId]?.partnerId;
  return id ? game.clubs[id] : null;
};

// Send a first-team or academy player to the partner club (free, partner pays wages).
export function loanToPartner(game, playerId) {
  const partner = partnerOf(game);
  if (!partner) return { ok: false, message: 'You have no partner club.' };
  if (!openWindow(game)) return { ok: false, message: 'Loans can only be agreed during a transfer window.' };
  const user = game.clubs[game.userClubId];
  const p = game.players[playerId];
  if (!p || p.loan || p.clubId !== user.id) return { ok: false, message: 'He cannot be loaned out.' };
  if (user.squad.includes(playerId) && user.squad.length <= 18) return { ok: false, message: 'Your squad is too small to loan him out.' };
  startLoan(game, playerId, partner.id, { fee: 0, wageShare: 1 });
  addNews(game, `${p.first} ${p.last} joins partner club ${partner.name} on loan until the end of the season.`, 'loan');
  return { ok: true, message: `${p.first} ${p.last} is on loan at ${partner.name}.` };
}

// ---- the user borrowing from an AI club ----

export function evaluateLoanRequest(game, playerId, wageShare) {
  const p = game.players[playerId];
  const user = game.clubs[game.userClubId];
  if (!openWindow(game)) return { status: 'rejected', message: 'Loans can only be agreed during a transfer window.' };
  if (!p || p.clubId === user.id) return { status: 'rejected', message: 'He already plays for you.' };
  if (p.loan) return { status: 'rejected', message: 'He is already on loan.' };
  const owner = game.clubs[p.clubId];
  const fee = loanFee(game, p);
  if (fee > user.budget) return { status: 'rejected', message: 'You cannot afford the loan fee.' };
  const will = willJoin(game, p, user);
  if (!will.ok) return { status: 'rejected', message: will.reason };
  const starter = owner.lineup && owner.lineup.slots.includes(p.id);
  if (starter) return { status: 'rejected', message: `${owner.name} won't loan out a regular starter.` };
  if (owner.squad.length <= 20) return { status: 'rejected', message: `${owner.name} need him for squad depth.` };
  const young = ageOf(p, game.season.year) <= 22;
  const needShare = young ? 0.5 : 0.75;
  if (wageShare < needShare) return { status: 'rejected', message: `${owner.name} want you to pay at least ${needShare * 100}% of his wage.` };
  return { status: 'accepted', fee, message: `${owner.name} agree to loan him for ${fee.toLocaleString('en-US')} € and ${Math.round(wageShare * 100)}% of his wage.` };
}

export function borrowPlayer(game, playerId, wageShare) {
  const r = evaluateLoanRequest(game, playerId, wageShare);
  if (r.status !== 'accepted') return r;
  const p = game.players[playerId];
  const from = game.clubs[p.clubId].name;
  startLoan(game, playerId, game.userClubId, { fee: r.fee, wageShare });
  addNews(game, `On loan: ${p.first} ${p.last} joins from ${from} until the end of the season.`, 'loan');
  return { status: 'accepted', message: `${p.first} ${p.last} joins on loan.` };
}

// ---- the user loaning out to AI clubs ----

export function listForLoan(game, playerId) {
  const p = game.players[playerId];
  p.loanListed = { since: game.day };
}
export function unlistForLoan(game, playerId) { game.players[playerId].loanListed = null; }

function clubLevel(game, club) {
  const xi = (club.lineup ? club.lineup.slots : club.squad).filter(Boolean).map((id) => game.players[id].skill);
  return xi.reduce((a, b) => a + b, 0) / Math.max(1, xi.length);
}

// AI clubs approach the user for loans: players on the loan list, and young
// players who aren't playing.
export function aiLoanOffers(game, rng) {
  const user = game.clubs[game.userClubId];
  if (!user) return;
  const played = Math.max(1, game.competitions[user.compId].table[user.id]?.p || 0);
  const others = Object.values(game.clubs).filter((c) => c.id !== user.id && c.id !== user.partnerId);
  for (const id of user.squad) {
    const p = game.players[id];
    if (p.loan || (game.offers || []).some((o) => o.playerId === id)) continue;
    const young = ageOf(p, game.season.year) <= 22;
    const benchwarmer = young && p.stats.season.apps / played < 0.3;
    const chance = p.loanListed ? 0.15 : benchwarmer ? 0.012 : 0;
    if (!chance || !rng.chance(chance)) continue;
    const buyers = others.filter((c) => p.skill >= clubLevel(game, c) - 4 && p.skill <= clubLevel(game, c) + 8 && c.budget > 0);
    if (!buyers.length) continue;
    const club = rng.pick(buyers);
    const fee = Math.round((loanFee(game, p) * rng.float(0.5, 1.2)) / 1000) * 1000;
    const wageShare = rng.pick([0.5, 0.75, 1]);
    game.offers = game.offers || [];
    game.offers.push({ id: 'o' + (game.ids.offer = (game.ids.offer || 0) + 1), type: 'loan', playerId: id, clubId: club.id,
      fee, wageShare, day: game.day, expires: game.day + 7 });
    addNews(game, `Loan offer: ${club.name} want ${p.first} ${p.last} on loan (${fee.toLocaleString('en-US')} €, they pay ${wageShare * 100}% of his wage).`, 'offer');
  }
}

export function acceptLoanOffer(game, offerId) {
  const o = (game.offers || []).find((x) => x.id === offerId);
  if (!o || !openWindow(game)) return false;
  const p = game.players[o.playerId];
  if (!p || p.clubId !== game.userClubId || game.clubs[game.userClubId].squad.length <= 18) return false;
  startLoan(game, o.playerId, o.clubId, { fee: o.fee, wageShare: o.wageShare });
  addNews(game, `${p.first} ${p.last} joins ${game.clubs[o.clubId].name} on loan until the end of the season.`, 'loan');
  return true;
}
