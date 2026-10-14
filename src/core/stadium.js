// Stadium: stands, expansion, pitch quality and crowd demand.
//
// Crowds are limited by demand, not just seats: a club's "natural" crowd
// depends on its reputation, and form, opponent and competition move it up or
// down. Extra seats only pay off while the stadium sells out.
//
// A ground has up to eight stands: main and side stand along the touchlines,
// two ends behind the goals and four corners (a corner needs both stands next
// to it). Smaller grounds miss some; a missing stand can be built. Enlarging
// the existing stands adds seats all round.
//
// The pitch has a quality from 1 to 10. It wears down every season; a poor
// pitch blunts technical play and causes more injuries for both teams.

import { addNews } from './season.js';
import { hashSeed, clamp } from './rng.js';
import { costScale } from './finance.js';

export const MAX_CAPACITY = 90000;
export const EXPANSIONS = [2000, 5000, 10000];

// share: the stand's part of a complete ground's seats. needs: the stands a
// corner joins.
export const STANDS = [
  { key: 'main', label: 'Main stand', share: 0.3 },
  { key: 'side', label: 'Side stand', share: 0.24 },
  { key: 'west', label: 'West end', share: 0.15 },
  { key: 'east', label: 'East end', share: 0.15 },
  { key: 'nw', label: 'Corner (side / west)', share: 0.04, needs: ['side', 'west'] },
  { key: 'ne', label: 'Corner (side / east)', share: 0.04, needs: ['side', 'east'] },
  { key: 'sw', label: 'Corner (main / west)', share: 0.04, needs: ['main', 'west'] },
  { key: 'se', label: 'Corner (main / east)', share: 0.04, needs: ['main', 'east'] },
];
const STAND = Object.fromEntries(STANDS.map((s) => [s.key, s]));

// The crowd a club of this reputation typically draws (same curve worldgen uses for stadium sizes).
export const naturalCrowd = (club) => 2000 + 600 * Math.exp(club.reputation / 20);

// Building cost per seat grows with stadium size (bigger stands are pricier).
export const costPerSeat = (club) => Math.round(700 + club.stadium.capacity * 0.01);

// The stands a ground has. Older saves and AI clubs get a layout that fits
// their size (fixed per club), stored the first time it's needed.
export function standsOf(club) {
  const st = club.stadium;
  if (st.stands) return st.stands;
  const cap = st.capacity;
  const h = hashSeed(club.id);
  let s;
  if (cap < 5000) s = ['main', h % 2 ? 'side' : 'west'];
  else if (cap < 12000) s = ['main', 'side', 'west', ...(h % 2 ? ['east'] : [])];
  else if (cap < 25000) s = ['main', 'side', 'west', 'east', ...['sw', 'se', 'nw'].slice(0, h % 3)];
  else if (cap < 45000) s = ['main', 'side', 'west', 'east', 'sw', 'se', ...(h % 2 ? ['nw', 'ne'] : [])];
  else s = STANDS.map((x) => x.key);
  st.stands = s;
  return s;
}

const builtShare = (club) => standsOf(club).reduce((a, k) => a + STAND[k].share, 0);

// Stands that could be built now (missing, and for corners both neighbours there).
export function missingStands(club) {
  const have = standsOf(club);
  return STANDS.filter((s) => !have.includes(s.key) && (!s.needs || s.needs.every((k) => have.includes(k))));
}

export function expansionQuote(club, seats) {
  const capped = Math.max(0, Math.min(seats, MAX_CAPACITY - club.stadium.capacity));
  return {
    seats: capped,
    cost: Math.round((capped * costPerSeat(club)) / 1000) * 1000,
    days: Math.round(60 + capped / 50), // ~3 months for 2,000 seats, ~9 months for 10,000
  };
}

// A new stand is built to match the rest of the ground (its share of the
// seats a complete ground of this size would have); building from scratch
// costs a little more per seat than adding to a stand.
export function standQuote(club, key) {
  const s = STAND[key];
  const full = club.stadium.capacity / builtShare(club);
  const seats = Math.max(200, Math.min(MAX_CAPACITY - club.stadium.capacity, Math.round((full * s.share) / 100) * 100));
  return { stand: key, label: s.label, seats, cost: Math.round((seats * costPerSeat(club) * 1.2) / 1000) * 1000, days: Math.round(90 + seats / 40) };
}

// Money the board gave for the stadium is spent first.
export function pay(club, cost) {
  const fund = Math.min(club.stadium.fund || 0, cost);
  club.stadium.fund = (club.stadium.fund || 0) - fund;
  club.budget -= cost - fund;
  club.finance.season.construction = (club.finance.season.construction || 0) + cost;
}
export const stadiumMoney = (club) => club.budget + (club.stadium.fund || 0);

function build(game, club, q) {
  if (club.stadium.expansion) return { ok: false, message: 'Construction is already under way.' };
  if (!q.seats) return { ok: false, message: 'The stadium cannot get any bigger.' };
  if (q.cost > stadiumMoney(club)) return { ok: false, message: 'You cannot afford this.' };
  pay(club, q.cost);
  club.stadium.expansion = { seats: q.seats, cost: q.cost, start: game.day, end: game.day + q.days, stand: q.stand || null };
  return { ok: true, message: q.stand ? `Work on the new ${q.label.toLowerCase()} has started.` : `Construction of ${q.seats.toLocaleString('en-US')} new seats has started.` };
}

export const startExpansion = (game, club, seats) => build(game, club, expansionQuote(club, seats));

export function startStand(game, club, key) {
  if (!missingStands(club).some((s) => s.key === key)) return { ok: false, message: 'That stand cannot be built.' };
  return build(game, club, standQuote(club, key));
}

// Daily: finish constructions whose time is up.
export function progressConstruction(game) {
  for (const club of Object.values(game.clubs)) {
    const e = club.stadium.expansion;
    if (!e || game.day < e.end) continue;
    club.stadium.capacity += e.seats;
    if (e.stand) standsOf(club).push(e.stand);
    club.stadium.expansion = null;
    if (club.id === game.userClubId) {
      addNews(game, `${e.stand ? `The new ${STAND[e.stand].label.toLowerCase()} is open` : 'The new stands are open'}: ${club.stadium.name} now holds ${club.stadium.capacity.toLocaleString('en-US')} spectators.`, 'club');
    } else if (club.compId === game.clubs[game.userClubId]?.compId) {
      addNews(game, `${club.name} have expanded their stadium to ${club.stadium.capacity.toLocaleString('en-US')} seats.`, 'club');
    }
  }
}

// ---- the pitch ----

export const PITCH_LABEL = ['', 'Ruined', 'Terrible', 'Very poor', 'Poor', 'Average', 'Decent', 'Good', 'Very good', 'Excellent', 'Perfect'];

export function pitchOf(club) {
  if (club.stadium.pitch == null) club.stadium.pitch = clamp(Math.round(4 + club.reputation / 25 + (hashSeed(`${club.id}:pitch`) % 3)), 3, 9);
  return club.stadium.pitch;
}

// Re-laying costs more the better the pitch gets (scaled to the club's size).
export function pitchCost(game, club, to) {
  let c = 0;
  for (let k = pitchOf(club) + 1; k <= to; k++) c += 30000 * (k <= 6 ? 1 : k <= 8 ? 1.6 : 2.5);
  return Math.round((c * costScale(game, club)) / 1000) * 1000;
}

export function improvePitch(game, club, to) {
  const from = pitchOf(club);
  if (to <= from || to > 10) return { ok: false, message: 'Choose a better pitch than the current one.' };
  const cost = pitchCost(game, club, to);
  if (cost > stadiumMoney(club)) return { ok: false, message: 'You cannot afford this.' };
  pay(club, cost);
  club.stadium.pitch = to;
  return { ok: true, message: `The groundsmen have re-laid the pitch: quality ${to}/10 (${PITCH_LABEL[to].toLowerCase()}).` };
}

// How the pitch changes a match: technique counts for less on a poor pitch
// (more on a perfect one), and injuries are more likely.
export const pitchTechnique = (q) => 1 + 0.008 * (q - 7);
export const pitchInjury = (q) => clamp(1 + 0.07 * (7 - q), 0.8, 1.5);

// End of season: every pitch wears by a point (two after a hard winter).
// AI clubs re-lay theirs when it gets poor and they have the money.
export function seasonEndPitches(game, rng) {
  for (const club of Object.values(game.clubs)) {
    const q = Math.max(1, pitchOf(club) - (rng.chance(0.25) ? 2 : 1));
    club.stadium.pitch = q;
    if (club.id === game.userClubId) {
      if (q <= 4) addNews(game, `The pitch at ${club.stadium.name} is in a ${PITCH_LABEL[q].toLowerCase()} state (${q}/10). Re-lay it from the Stadium screen.`, 'club');
      continue;
    }
    const target = clamp(Math.round(5 + club.reputation / 25), 5, 9);
    if (q < target - 1 && pitchCost(game, club, target) * 4 < club.budget) improvePitch(game, club, target);
  }
}

// End of season: rich AI clubs with crowds bigger than their stadium build.
export function aiExpansions(game, rng) {
  for (const club of Object.values(game.clubs)) {
    if (club.id === game.userClubId || club.guest || club.stadium.expansion) continue;
    if (naturalCrowd(club) < club.stadium.capacity * 1.1) continue;
    const seats = rng.pick(EXPANSIONS);
    const q = expansionQuote(club, seats);
    if (q.seats && q.cost * 3 < club.budget && rng.chance(0.5)) startExpansion(game, club, seats);
  }
}
