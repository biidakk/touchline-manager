// Stadium expansion and crowd demand.
//
// Crowds are limited by demand, not just seats: a club's "natural" crowd
// depends on its reputation, and form, opponent and competition move it up or
// down. Extra seats only pay off while the stadium sells out.

import { addNews } from './season.js';

export const MAX_CAPACITY = 90000;
export const EXPANSIONS = [2000, 5000, 10000];

// The crowd a club of this reputation typically draws (same curve worldgen uses for stadium sizes).
export const naturalCrowd = (club) => 2000 + 600 * Math.exp(club.reputation / 20);

// Building cost per seat grows with stadium size (bigger stands are pricier).
export const costPerSeat = (club) => Math.round(700 + club.stadium.capacity * 0.01);

export function expansionQuote(club, seats) {
  const capped = Math.max(0, Math.min(seats, MAX_CAPACITY - club.stadium.capacity));
  return {
    seats: capped,
    cost: Math.round((capped * costPerSeat(club)) / 1000) * 1000,
    days: Math.round(60 + capped / 50), // ~3 months for 2,000 seats, ~9 months for 10,000
  };
}

export function startExpansion(game, club, seats) {
  if (club.stadium.expansion) return { ok: false, message: 'Construction is already under way.' };
  const q = expansionQuote(club, seats);
  if (!q.seats) return { ok: false, message: 'The stadium cannot get any bigger.' };
  if (q.cost > club.budget) return { ok: false, message: 'You cannot afford this expansion.' };
  club.budget -= q.cost;
  club.finance.season.construction = (club.finance.season.construction || 0) + q.cost;
  club.stadium.expansion = { seats: q.seats, cost: q.cost, start: game.day, end: game.day + q.days };
  return { ok: true, message: `Construction of ${q.seats.toLocaleString('en-US')} new seats has started.` };
}

// Daily: finish constructions whose time is up.
export function progressConstruction(game) {
  for (const club of Object.values(game.clubs)) {
    const e = club.stadium.expansion;
    if (!e || game.day < e.end) continue;
    club.stadium.capacity += e.seats;
    club.stadium.expansion = null;
    if (club.id === game.userClubId) {
      addNews(game, `The new stands are open: ${club.stadium.name} now holds ${club.stadium.capacity.toLocaleString('en-US')} spectators.`, 'club');
    } else if (club.compId === game.clubs[game.userClubId]?.compId) {
      addNews(game, `${club.name} have expanded their stadium to ${club.stadium.capacity.toLocaleString('en-US')} seats.`, 'club');
    }
  }
}

// End of season: rich AI clubs with crowds bigger than their stadium build.
export function aiExpansions(game, rng) {
  for (const club of Object.values(game.clubs)) {
    if (club.id === game.userClubId || club.stadium.expansion) continue;
    if (naturalCrowd(club) < club.stadium.capacity * 1.1) continue;
    const seats = rng.pick(EXPANSIONS);
    const q = expansionQuote(club, seats);
    if (q.seats && q.cost * 3 < club.budget && rng.chance(0.5)) startExpansion(game, club, seats);
  }
}
