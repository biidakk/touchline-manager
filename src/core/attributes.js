// Player attributes: technical (tec), physical (phy) and height (cm).
// Overall skill is derived from tec and phy with position weights, so every
// system that reads `skill` keeps working.

import { clamp } from './rng.js';

// Share of technical ability in the overall rating, by position.
export const TEC_WEIGHT = { G: 0.45, D: 0.4, M: 0.65, F: 0.55 };

export const deriveSkill = (pos, tec, phy) => Math.round(TEC_WEIGHT[pos] * tec + (1 - TEC_WEIGHT[pos]) * phy);

export function syncSkill(p) {
  p.skill = deriveSkill(p.pos, p.tec, p.phy);
  return p.skill;
}

// A skill change stays visible (green up, red down) for the player's club's
// next two matches; see tickSkillMarks.
export const SKILL_MARK_MATCHES = 2;
export function markSkillChange(p, before) {
  if (p.skill !== before) p.chg = { dir: p.skill > before ? 1 : -1, n: SKILL_MARK_MATCHES };
}
export function tickSkillMarks(game, club) {
  for (const id of [...club.squad, ...(club.youth || [])]) {
    const p = game.players[id];
    if (p?.chg && --p.chg.n <= 0) delete p.chg;
  }
}

// Splits an overall skill into tec and phy around a random profile so the
// weighted value stays the same (technical playmakers, physical stoppers...).
export function splitSkill(p, rng) {
  const w = TEC_WEIGHT[p.pos];
  const r = rng.normal(0, 7);
  p.tec = Math.round(clamp(p.skill + r * (1 - w), 10, 99));
  p.phy = Math.round(clamp(p.skill - r * w, 10, 99));
  syncSkill(p);
  if (p.potential < p.skill) p.potential = p.skill;
}

const HEIGHT = { G: [190, 4], D: [185, 5.5], M: [178, 6], F: [182, 6] };

export function heightFor(pos, rng) {
  const [mean, sd] = HEIGHT[pos];
  return Math.round(clamp(rng.normal(mean, sd), 160, 204));
}

// 0 at 165 cm .. 1 at 200 cm
export const heightFactor = (h) => clamp((h - 165) / 35, 0, 1);

// Aerial ability: jumping and strength, heading technique, and height.
export const aerial = (p) => 0.45 * p.phy + 0.25 * p.tec + 30 * heightFactor(p.height || 180);

// Gives an old player (from a save before attributes existed) tec, phy and height.
export function ensureAttributes(p, rng) {
  if (p.tec === undefined || p.phy === undefined) splitSkill(p, rng);
  if (!p.height) p.height = heightFor(p.pos, rng);
  if (!p.xp) p.xp = { tec: 0, phy: 0 };
  if (p.fatigue === undefined) p.fatigue = 0;
  if (!p.load) p.load = { acute: 1.5, chronic: 1.5 };
  if (p.tecStart === undefined) { p.tecStart = p.tec; p.phyStart = p.phy; }
}
