// Club facilities with levels 1-6: the youth academy and the stadium's
// facilities (seats, catering, transport...).
//
// Every club is assumed to have the facilities its reputation suggests (AI
// clubs always do, so the world stays balanced). The user's club keeps its
// own levels: building above that standard pays off, falling below it
// (as the club grows) costs.
//  - Academy: better youngsters in the yearly intake (+2 potential per level
//    above standard, sometimes an extra one) and faster academy development.
//  - Stadium facilities: more fans want to come (+5% demand per level).
// Each level above standard adds upkeep.

import { addNews } from './season.js';
import { clamp } from './rng.js';
import { costScale } from './finance.js';
import { pay, stadiumMoney } from './stadium.js';
import { money } from './currency.js';

export const MAX_LEVEL = 6;
export const FACILITIES = {
  academy: {
    label: 'Youth academy',
    levels: ['', 'Basic', 'Adequate', 'Good', 'Very good', 'Excellent', 'World class'],
    effect: 'Better youngsters in the yearly intake and faster development in the academy.',
    cost: [0, 0, 150000, 350000, 800000, 1600000, 3000000],
  },
  ground: {
    label: 'Stadium facilities',
    levels: ['', 'Basic', 'Adequate', 'Good', 'Modern', 'Excellent', 'State of the art'],
    effect: 'Comfort, catering and access: more fans want to come to every home game.',
    cost: [0, 0, 250000, 600000, 1300000, 2500000, 4500000],
  },
};
export const FACILITY_KEYS = Object.keys(FACILITIES);

// The standard for a club of this reputation (15 -> 1 ... 90+ -> 6).
export const standardLevel = (club) => clamp(1 + Math.floor((club.reputation - 10) / 16), 1, MAX_LEVEL);

// The user's club keeps its own levels (set to the standard the first time).
export function facilitiesOf(game, club) {
  if (club.id !== game.userClubId) return Object.fromEntries(FACILITY_KEYS.map((k) => [k, standardLevel(club)]));
  if (!club.facilities) club.facilities = Object.fromEntries(FACILITY_KEYS.map((k) => [k, standardLevel(club)]));
  return club.facilities;
}
export const levelOf = (game, club, key) => facilitiesOf(game, club)[key];

// Levels above (+) or below (-) the club's standard; 0 for AI clubs.
export const facilityEdge = (game, club, key) => (club.id === game.userClubId ? levelOf(game, club, key) - standardLevel(club) : 0);

// Effects.
export const academyGrowth = (game, club) => 1 + 0.06 * facilityEdge(game, club, 'academy');
export const academyPotential = (game, club) => 2 * facilityEdge(game, club, 'academy');
export const groundDemand = (game, club) => clamp(1 + 0.05 * facilityEdge(game, club, 'ground'), 0.75, 1.3);

// Upgrading to the next level: cost scaled to the club's size; takes months.
export function upgradeQuote(game, club, key) {
  const to = levelOf(game, club, key) + 1;
  if (to > MAX_LEVEL) return null;
  return { key, to, cost: Math.round((FACILITIES[key].cost[to] * costScale(game, club)) / 10000) * 10000, days: 45 + 25 * to };
}

// Upkeep per season for the levels above standard.
export function facilitiesUpkeep(game, club) {
  if (club.id !== game.userClubId || !club.facilities) return 0;
  return FACILITY_KEYS.reduce((s, k) => s + Math.max(0, facilityEdge(game, club, k)) * 80000, 0) * costScale(game, club);
}

export function startUpgrade(game, club, key) {
  const f = facilitiesOf(game, club);
  if (f.work) return { ok: false, message: `The ${FACILITIES[f.work.key].label.toLowerCase()} is already being upgraded.` };
  const q = upgradeQuote(game, club, key);
  if (!q) return { ok: false, message: 'This is already the best there is.' };
  if (q.cost > stadiumMoney(club)) return { ok: false, message: 'You cannot afford this.' };
  pay(club, q.cost);
  f.work = { key, to: q.to, cost: q.cost, start: game.day, end: game.day + q.days };
  return { ok: true, message: `Work on the ${FACILITIES[key].label.toLowerCase()} has started (${money(game, q.cost)}).` };
}

// Daily: finish the upgrade when its time is up.
export function progressFacilities(game) {
  const club = game.clubs[game.userClubId];
  const w = club?.facilities?.work;
  if (!w || game.day < w.end) return;
  club.facilities[w.key] = w.to;
  club.facilities.work = null;
  addNews(game, `The upgraded ${FACILITIES[w.key].label.toLowerCase()} is ready: now ${FACILITIES[w.key].levels[w.to].toLowerCase()} (level ${w.to}).`, 'club');
}

// Club reputation, like the levels in the big management games.
export const CLUB_REP_LEVELS = [[80, 'Worldwide'], [65, 'Continental'], [48, 'National'], [32, 'Regional'], [0, 'Local']];
export const clubRepLevel = (rep) => CLUB_REP_LEVELS.find(([min]) => rep >= min)[1];
// 1-5 stars.
export const clubRepStars = (rep) => Math.max(1, Math.min(5, Math.round((rep - 20) / 14)));
