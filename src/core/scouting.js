// Scouting: the potential of players at other clubs is hidden until a scout
// has watched them (for your own players you see your staff's estimate).
// Better scouting staff report faster, more precisely and on more players at
// once, at a higher yearly cost.

import { Rng, hashSeed } from './rng.js';
import { addNews } from './season.js';
import { PERSONALITY_LABEL } from './morale.js';
import { costScale } from './finance.js';

export const LEVELS = [
  { name: 'None', cost: 0, slots: 1, days: 21, band: 8 },
  { name: 'Basic', cost: 200000, slots: 2, days: 14, band: 5 },
  { name: 'Good', cost: 500000, slots: 3, days: 10, band: 3 },
  { name: 'Excellent', cost: 1200000, slots: 4, days: 7, band: 1 },
];

export function scoutingOf(game) {
  const club = game.clubs[game.userClubId];
  if (!club.scouting) club.scouting = { level: 1, assignments: [], reports: {} };
  return club.scouting;
}

// How wide the staff's estimate of an own player's potential is, by the
// stars of the better of the youth coach and the assistant (0 = both vacant).
export const OWN_BAND = [8, 7, 6, 5, 4, 3];

// Own players (and the academy): the coaches' estimate, a range that always
// contains the true potential. Where it sits in the range is fixed per player
// and season, so it doesn't jump between screens.
function ownEstimate(game, club, p) {
  const stars = Math.max(club.staff?.youth?.stars || 0, club.staff?.assistant?.stars || 0);
  const band = OWN_BAND[stars];
  const off = hashSeed(`${p.id}:${game.season?.year}`) % (band + 1);
  const low = Math.max(1, p.potential - off);
  return { low, high: Math.max(p.potential, Math.min(99, low + band)), own: true };
}

// What the user knows about a player's potential: a { low, high } range
// (own players: the staff's estimate; others: a scout report), or null.
// Without a user club (tests, world generation) it is exact.
export function knownPotential(game, p) {
  if (!p) return null;
  const club = game.clubs[game.userClubId];
  if (!club) return { exact: p.potential };
  if (p.clubId === club.id || (club.youth || []).includes(p.id)) return ownEstimate(game, club, p);
  const r = club.scouting?.reports?.[p.id];
  return r ? { low: r.low, high: r.high, year: r.year } : null;
}

// `short`: one number for tight spots (shirts on the pitch): "~" and the
// middle of the range.
export function potText(game, p, { short = false } = {}) {
  const k = knownPotential(game, p);
  if (!k) return '?';
  if (k.exact !== undefined) return String(k.exact);
  if (k.low === k.high) return String(k.low);
  return short ? `~${Math.round((k.low + k.high) / 2)}` : `${k.low}-${k.high}`;
}

// Technical / physical ability as the user knows it: exact for own players,
// a scouted range, or "?".
export function attrText(game, p, attr) {
  if (!p) return '?';
  const club = game.clubs[game.userClubId];
  const val = p[attr] ?? p.skill;
  if (!club || p.clubId === club.id) return String(val);
  const r = club.scouting?.reports?.[p.id]?.[attr];
  if (!r) return '?';
  return r[0] === r[1] ? String(r[0]) : `${r[0]}-${r[1]}`;
}

// Personality: known for own players and scouted ones.
export function personalityText(game, p) {
  const club = game.clubs[game.userClubId];
  if (!p || !p.personality) return '?';
  if (p.clubId === club?.id || club?.scouting?.reports?.[p.id] || (club?.youth || []).includes(p.id)) return PERSONALITY_LABEL[p.personality];
  return '?';
}

// A sortable / filterable number: exact, the middle of the scouted range, or null.
export function potEstimate(game, p) {
  const k = knownPotential(game, p);
  if (!k) return null;
  return k.exact !== undefined ? k.exact : (k.low + k.high) / 2;
}

export function setLevel(game, level) {
  scoutingOf(game).level = Math.max(0, Math.min(LEVELS.length - 1, level));
}

export function assignScout(game, playerId) {
  const s = scoutingOf(game);
  const L = LEVELS[s.level];
  const p = game.players[playerId];
  if (!p || p.clubId === game.userClubId) return { ok: false, message: 'He is your own player.' };
  if (s.assignments.some((a) => a.playerId === playerId)) return { ok: false, message: 'A scout is already watching him.' };
  if (s.assignments.length >= L.slots) return { ok: false, message: `All ${L.slots} scout${L.slots > 1 ? 's are' : ' is'} busy.` };
  s.assignments.push({ playerId, start: game.day, end: game.day + L.days });
  return { ok: true, message: `A scout will report on ${p.first} ${p.last} in ${L.days} days.` };
}

export function cancelScout(game, playerId) {
  const s = scoutingOf(game);
  s.assignments = s.assignments.filter((a) => a.playerId !== playerId);
}

// Daily: finished assignments become reports.
export function progressScouting(game) {
  const club = game.clubs[game.userClubId];
  if (!club || !club.scouting) return;
  const s = club.scouting;
  const rng = new Rng(game.rng);
  const band = LEVELS[s.level].band;
  for (const a of s.assignments.slice()) {
    if (game.day < a.end) continue;
    s.assignments = s.assignments.filter((x) => x !== a);
    const p = game.players[a.playerId];
    if (!p) continue;
    // Each range always contains the true value; its position within the range is random.
    const range = (v, floor = 1) => {
      const lo = Math.max(floor, v - rng.int(0, band));
      return [lo, Math.max(Math.min(99, lo + band), v)];
    };
    const [low, high] = range(p.potential, p.skill);
    s.reports[p.id] = { low, high, tec: range(p.tec ?? p.skill), phy: range(p.phy ?? p.skill), year: game.season.year, day: game.day };
    addNews(game, `Scout report: ${p.first} ${p.last} (${game.clubs[p.clubId]?.short || 'free'}) has a potential of ${potText(game, p)}.`, 'scout');
  }
}

// The list prices in LEVELS are for a club with a 6M wage bill; smaller clubs pay less.
export const scoutingCost = (game, club, level) => Math.round((LEVELS[level].cost * costScale(game, club)) / 1000) * 1000;
export const scoutingCostPerYear = (game, club) => (club.id === game.userClubId && club.scouting ? scoutingCost(game, club, club.scouting.level) : 0);

// End of season: potentials can change, so reports older than two seasons are dropped.
export function ageReports(game) {
  const club = game.clubs[game.userClubId];
  if (!club?.scouting) return;
  for (const [id, r] of Object.entries(club.scouting.reports)) {
    if (!game.players[id] || game.season.year - r.year >= 2) delete club.scouting.reports[id];
  }
}
