// Player attributes: technical (tec), physical (phy) and height (cm).
// Overall skill is derived from tec and phy with position weights, so every
// system that reads `skill` keeps working.

import { Rng, clamp, hashSeed } from './rng.js';

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

// Aerial ability: strength, heading and height.
export const aerial = (p) => 0.45 * attrOf(p, 'str') + 0.25 * attrOf(p, 'hea') + 30 * heightFactor(p.height || 180);

// Gives an old player (from a save before attributes existed) tec, phy and height.
export function ensureAttributes(p, rng) {
  if (p.tec === undefined || p.phy === undefined) splitSkill(p, rng);
  if (!p.height) p.height = heightFor(p.pos, rng);
  if (!p.xp) p.xp = { tec: 0, phy: 0 };
  if (p.fatigue === undefined) p.fatigue = 0;
  if (!p.load) p.load = { acute: 1.5, chronic: 1.5 };
  if (p.tecStart === undefined) { p.tecStart = p.tec; p.phyStart = p.phy; }
}

// ---- detailed attributes ----
//
// Every player has twelve attributes. Technique (tec) and physique (phy) stay
// the core of a player: development, ageing, skill and value all run on them.
// The attributes are a personal profile around them, stored as offsets
// (p.at, in ATTRS order): attribute = tec (or phy) + offset. For the player's
// position the weighted offsets add up to zero, so the weighted average of his
// technical attributes is his technique (and the same for physique).
// The match engine uses single attributes where they matter: finishing for
// shots, heading and strength in the air, crossing for deliveries, pace for
// through-balls, stamina for tiring.

export const ATTRS = ['fin', 'hea', 'pas', 'cro', 'dri', 'tck', 'mar', 'pac', 'sta', 'str', 'ref', 'han'];
const IDX = Object.fromEntries(ATTRS.map((k, i) => [k, i]));
export const ATTR_LABEL = {
  fin: 'Finishing', hea: 'Heading', pas: 'Passing', cro: 'Crossing', dri: 'Dribbling', tck: 'Tackling', mar: 'Marking',
  pac: 'Pace', sta: 'Stamina', str: 'Strength', ref: 'Reflexes', han: 'Handling',
};
export const ATTR_SHORT = { fin: 'FIN', hea: 'HEA', pas: 'PAS', cro: 'CRO', dri: 'DRI', tck: 'TCK', mar: 'MAR', pac: 'PAC', sta: 'STA', str: 'STR', ref: 'REF', han: 'HAN' };
export const PHYSICAL = new Set(['pac', 'sta', 'str']);
export const groupOf = (k) => (PHYSICAL.has(k) ? 'phy' : 'tec');

// How much each attribute counts towards technique / physique, by position.
export const ATTR_WEIGHT = {
  G: { ref: 0.45, han: 0.35, pas: 0.2, str: 0.45, sta: 0.3, pac: 0.25 },
  D: { tck: 0.35, mar: 0.3, hea: 0.2, pas: 0.15, str: 0.4, pac: 0.3, sta: 0.3 },
  M: { pas: 0.35, dri: 0.2, tck: 0.15, fin: 0.1, cro: 0.1, mar: 0.1, sta: 0.45, pac: 0.3, str: 0.25 },
  F: { fin: 0.4, dri: 0.2, hea: 0.15, pas: 0.15, cro: 0.1, pac: 0.45, str: 0.3, sta: 0.25 },
};

// The usual profile of a position (before normalising), and some player types.
const BASE = {
  G: { ref: 4, han: 4, pas: -4, fin: -35, hea: -18, cro: -30, dri: -25, tck: -28, mar: -15, pac: -6, sta: 0, str: 3 },
  D: { tck: 4, mar: 4, hea: 3, pas: 0, cro: -5, dri: -7, fin: -15, ref: -45, han: -45, pac: -2, sta: 0, str: 3 },
  M: { pas: 4, dri: 2, tck: -2, fin: -3, cro: 0, mar: -3, hea: -7, ref: -45, han: -45, pac: 0, sta: 3, str: -3 },
  F: { fin: 4, dri: 3, hea: 0, pas: -2, cro: -4, tck: -20, mar: -18, ref: -45, han: -45, pac: 3, sta: -2, str: 0 },
};
const TYPES = {
  D: [[0.3, { cro: 9, pac: 6, dri: 4, hea: -5, str: -4 }], [0.2, { pas: 7, dri: 3, tck: -2 }]],
  M: [[0.3, { cro: 9, dri: 6, pac: 6, tck: -6, mar: -4 }], [0.25, { tck: 8, mar: 6, str: 4, fin: -5, dri: -4 }], [0.15, { fin: 7, dri: 4, mar: -5 }]],
  F: [[0.25, { hea: 9, str: 8, pac: -6, dri: -4 }], [0.25, { fin: 7, pac: 3, pas: -3 }], [0.2, { pac: 10, dri: 5, str: -6, hea: -4 }]],
  G: [[0.3, { pas: 8 }]],
};

// Keeps the weighted offsets of each group at zero for the player's position.
export function normalizeProfile(p) {
  const W = ATTR_WEIGHT[p.pos];
  for (const grp of ['tec', 'phy']) {
    const keys = ATTRS.filter((k) => groupOf(k) === grp && W[k]);
    const sw = keys.reduce((s, k) => s + W[k], 0);
    const mean = keys.reduce((s, k) => s + W[k] * p.at[IDX[k]], 0) / sw;
    for (const k of ATTRS) if (groupOf(k) === grp) p.at[IDX[k]] = clamp(Math.round((p.at[IDX[k]] - mean) * 10) / 10, -60, 30);
  }
}

// A profile of its own for every player, from a seed of his own (so making
// one never changes the world's random numbers).
export function makeProfile(p) {
  const rng = new Rng({ s: hashSeed(`${p.id}:${p.birthYear}:${p.last}`) });
  const base = BASE[p.pos];
  const off = Object.fromEntries(ATTRS.map((k) => [k, base[k] + rng.normal(0, 5)]));
  let roll = rng.next();
  for (const [share, mods] of TYPES[p.pos]) {
    if (roll < share) { for (const [k, v] of Object.entries(mods)) off[k] += v; break; }
    roll -= share;
  }
  const h = (p.height || 180) - 180;
  off.hea += 0.35 * h;
  off.str += 0.3 * h;
  off.pac -= 0.25 * h;
  off.dri -= 0.2 * h;
  p.at = ATTRS.map((k) => Math.round(off[k]));
  normalizeProfile(p);
  p.at = p.at.map((v) => Math.round(v));
  return p.at;
}

export function attrOf(p, k) {
  if (!p.at) makeProfile(p);
  const base = PHYSICAL.has(k) ? (p.phy ?? p.skill) : (p.tec ?? p.skill);
  return Math.round(clamp(base + p.at[IDX[k]], 1, 99));
}
export const attrsOf = (p) => Object.fromEntries(ATTRS.map((k) => [k, attrOf(p, k)]));

// The attributes that matter for a position (shown first), the rest after.
export const keyAttrs = (pos) => ATTRS.filter((k) => ATTR_WEIGHT[pos][k]);

// Moves the profile towards one attribute by `amount` points (training focus,
// ageing); the other attributes of its group give way so technique and
// physique stay the same.
export function shiftAttr(p, k, amount) {
  if (!p.at) makeProfile(p);
  const i = IDX[k];
  const before = p.at[i];
  p.at[i] = clamp(p.at[i] + amount, -60, 30);
  if (p.at[i] === before) return false;
  if (ATTR_WEIGHT[p.pos][k]) normalizeProfile(p);
  return true;
}

// Rounded offsets for the save (normalising leaves tenths).
export const tidyProfile = (p) => { if (p.at) p.at = p.at.map((v) => Math.round(v * 10) / 10); };

// ---- mental attributes ----
//
// Creativity, positioning, teamwork and leadership (p.mn, absolute values).
// They are not part of skill: they are a player's extra strengths and
// weaknesses. They grow with age and experience rather than in training
// (creativity and positioning can be a training focus), peak around 30 and
// fade only a little late in a career.
//  - Creativity: midfielders' and forwards' chance creation.
//  - Positioning: defending (defenders, midfielders) and keepers' saves.
//  - Teamwork: how well the XI plays together.
//  - Leadership: what the captain is worth, on the pitch and in the dressing room.

export const MENTAL = ['cre', 'pos', 'tw', 'ldr'];
const MI = { cre: 0, pos: 1, tw: 2, ldr: 3 };
export const MENTAL_LABEL = { cre: 'Creativity', pos: 'Positioning', tw: 'Teamwork', ldr: 'Leadership' };
export const isMental = (k) => k in MI;
// What a position needs most (shown bright on the player card).
export const MENTAL_KEY = { G: ['pos', 'ldr'], D: ['pos', 'tw'], M: ['cre', 'tw'], F: ['cre'] };

const MENTAL_POS = { G: { cre: -18, pos: 6 }, D: { cre: -8, pos: 6 }, M: { cre: 5, pos: 0 }, F: { cre: 4, pos: -8 } };
const MENTAL_PERS = {
  professional: { tw: 8, ldr: 5 }, loyal: { tw: 4, ldr: 4 }, ambitious: { tw: -2, ldr: 4, cre: 2 },
  temperamental: { tw: -10, ldr: -4, cre: 3 }, easygoing: { tw: 1, ldr: -6 },
};

export function makeMental(p, year) {
  const rng = new Rng({ s: hashSeed(`${p.id}:mental:${p.last}`) });
  const age = year - p.birthYear;
  const exp = clamp(age - 24, -7, 9);
  const per = MENTAL_PERS[p.personality] || {};
  const pos = MENTAL_POS[p.pos];
  const base = 0.55 * p.skill + 22;
  p.mn = [
    base + pos.cre + (per.cre || 0) + 0.6 * exp + rng.normal(0, 9),
    base + pos.pos + 1.2 * exp + rng.normal(0, 8),
    base - 4 + (per.tw || 0) + 0.5 * exp + rng.normal(0, 9),
    0.4 * p.skill + 22 + (per.ldr || 0) + 2 * exp + rng.normal(0, 11),
  ].map((v) => Math.round(clamp(v, 5, 97)));
  return p.mn;
}

// year: the current season (players without mental attributes get theirs on first use).
export function mentalOf(p, k, year) {
  if (!p.mn) makeMental(p, year);
  return Math.round(p.mn[MI[k]]);
}

export function addMental(p, k, amount, year) {
  if (!p.mn) makeMental(p, year);
  p.mn[MI[k]] = Math.round(clamp(p.mn[MI[k]] + amount, 1, 99) * 10) / 10;
}

// One season of growing up (or older), at the end of the season.
// apps: league appearances this season; captain: he led the team.
export function ageMental(p, year, { apps = 0, captain = false, mentors = false } = {}) {
  if (!p.mn) makeMental(p, year);
  const age = year - p.birthYear;
  const play = Math.min(1, apps / 30);
  const add = (k, v) => addMental(p, k, v, year);
  add('cre', age <= 23 ? 1.2 + play : age <= 28 ? 0.5 + 0.5 * play : age <= 32 ? 0 : -0.8);
  add('pos', age <= 23 ? 1.5 + play : age <= 30 ? 0.8 + 0.7 * play : age <= 33 ? 0.3 : -0.8);
  add('tw', age <= 31 ? 0.3 + 1.5 * play : age <= 34 ? 0.3 * play : -0.5);
  add('ldr', age < 22 ? 0.3 : age <= 33 ? 0.6 + 0.8 * play + (captain ? 2 : 0) : 0.3 * play + (captain ? 1 : 0));
  // Young players learn from the leaders around them.
  if (mentors && age <= 21) { add('tw', 1); add('pos', 0.5); }
}
