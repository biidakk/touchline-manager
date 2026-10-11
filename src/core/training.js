// Training, coaching staff, fatigue and development (replaces the old
// monthly development ticks).
//
// Every day each player either plays (match day) or trains according to his
// plan: a focus (balanced / physical / technical / recovery) and an intensity
// (light / normal / hard). Following the fitness-fatigue model:
//  - training adds FATIGUE, which decays with a ~7-day time constant and caps
//    the energy a player can recover to (100 - fatigue);
//  - training adds slow DEVELOPMENT (XP into tec / phy), scaled by coach
//    quality, age, room to potential, playing time and how fresh he is;
//  - a 7-day vs 28-day WORKLOAD ratio raises injury risk on load spikes.
// High physical ability means less fatigue and faster recovery.

import { Rng, clamp } from './rng.js';
import { syncSkill, deriveSkill, markSkillChange } from './attributes.js';
import { playerValue } from './valuation.js';
import { addNews } from './season.js';
import { personName } from './names.js';
import { moraleDevFactor } from './morale.js';
import { expectedWageBill } from './finance.js';

export const ROLES = ['fitness', 'technical', 'goalkeeping', 'physio', 'youth', 'assistant'];
export const ROLE_LABEL = {
  fitness: 'Fitness coach', technical: 'Technical coach', goalkeeping: 'Goalkeeping coach',
  physio: 'Physio', youth: 'Youth coach', assistant: 'Assistant manager',
};
export const ROLE_INFO = {
  fitness: 'Physical training, recovery from training, fewer training injuries.',
  technical: 'Technical training.',
  goalkeeping: 'All goalkeeper training.',
  physio: 'Shorter injuries (−20% at 5★, +35% when vacant), faster recovery between matches.',
  youth: 'Academy development, the quality of the yearly youth intake and how precisely your staff judge potential.',
  assistant: 'Match advice on My Team, calmer dressing room (bad news hurts morale less), better pep talks, judging potential.',
};
export const ROLE_WAGE = { fitness: 1, technical: 1, goalkeeping: 1, physio: 0.7, youth: 0.7, assistant: 0.8 };
// By stars, per year, before scaling to the employing club (see staffPayScale).
export const COACH_WAGE = [0, 60000, 130000, 260000, 500000, 900000];
const ROLE_SUM = Object.values(ROLE_WAGE).reduce((a, b) => a + b, 0);
// A staff of the stars an AI club of the same standing has costs this share of
// the club's expected wage bill, so small clubs aren't crippled by staff wages.
const STAFF_SHARE = 0.08;
export const coachFactor = (stars) => (stars ? [0, 0.8, 0.9, 1.0, 1.12, 1.25][stars] : 0.7);
// Injury length multiplier by physio stars (0 = vacant).
export const physioDays = (game, club) => [1.35, 1.2, 1.1, 1.0, 0.9, 0.8][starsFor(game, club, 'physio')];

export const FOCI = ['balanced', 'physical', 'technical', 'recovery'];
export const FOCUS_LABEL = { balanced: 'Balanced', physical: 'Physical', technical: 'Technical', recovery: 'Recovery' };
export const INTENSITIES = ['light', 'normal', 'hard'];
export const INTENSITY_LABEL = { light: 'Light', normal: 'Normal', hard: 'Hard' };
export const INTENSITY = {
  light: { load: 1, fatigue: 0.25, gain: 0.6, risk: 0.5 },
  normal: { load: 2, fatigue: 0.7, gain: 1.0, risk: 1 },
  hard: { load: 3, fatigue: 2.0, gain: 1.4, risk: 2 },
};
const SHARE = {
  balanced: { tec: 0.5, phy: 0.5 },
  physical: { tec: 0.15, phy: 0.85 },
  technical: { tec: 0.85, phy: 0.15 },
  recovery: { tec: 0, phy: 0 },
};

const K = 0.055; // XP per training day at full rates (calibrated by the 20-season test: talented teenagers about +5 skill a season)
const FATIGUE_DECAY = Math.exp(-1 / 7);
const MATCH_FATIGUE = 3;
const MATCH_LOAD = 4;
const TRAINING_INJURY = 0.00025;

// ---- coaches ----

export const aiStars = (club) => (club.reputation >= 75 ? 4 : club.reputation >= 35 ? 3 : 2);

export function starsFor(game, club, role) {
  if (club.id === game.userClubId) return club.staff?.[role]?.stars || 0;
  return aiStars(club);
}

// Coaches ask wages in line with the club: a 3-star coach costs far less at a
// small second-division club than at a giant.
export const staffPayScale = (game, club) => (STAFF_SHARE * expectedWageBill(game, club)) / (ROLE_SUM * COACH_WAGE[aiStars(club)]);
export const coachWage = (stars, role, scale) => Math.max(1000, Math.round((COACH_WAGE[stars] * ROLE_WAGE[role] * scale) / 1000) * 1000);

function makeCoach(game, rng, role, stars, scale) {
  const nation = rng.pick(Object.values(game.nations).filter((n) => !n.foreign));
  const { first, last } = personName(rng, nation.style);
  return {
    id: 'k' + (game.ids.coach = (game.ids.coach || 0) + 1),
    name: `${first} ${last}`, nationId: nation.id, role, stars,
    wage: coachWage(stars, role, scale * rng.float(0.85, 1.15)),
    years: rng.int(1, 3),
  };
}

// A fresh pool of coaches looking for work (every summer, and when the user
// changes clubs), with wages for the user's club.
export function refreshCoachPool(game) {
  const rng = new Rng(game.rng);
  const club = game.clubs[game.userClubId];
  const scale = club ? staffPayScale(game, club) : 1;
  game.coachPool = [];
  game.coachPoolClubId = club?.id || null;
  for (const role of ROLES) {
    for (let i = 0; i < 5; i++) game.coachPool.push(makeCoach(game, rng, role, rng.weighted([1, 2, 3, 4, 5], (s) => [0, 3, 4, 4, 2, 1][s]), scale));
  }
}

// New career: staff matching the club's standing, plus default plans. On old
// saves it only fills roles that didn't exist yet.
export function initUserStaff(game) {
  const club = game.clubs[game.userClubId];
  const rng = new Rng(game.rng);
  const stars = aiStars(club);
  const scale = staffPayScale(game, club);
  club.staff = club.staff || {};
  for (const role of ROLES) {
    if (role in club.staff) continue;
    const c = makeCoach(game, rng, role, stars, scale);
    c.until = game.season.year + 1;
    club.staff[role] = c;
  }
  if (!club.training) club.training = defaultTraining();
  if (!game.coachPool || !game.coachPool.some((c) => c.role === 'assistant') || game.coachPoolClubId !== club.id) refreshCoachPool(game);
}

export const defaultTraining = () => ({
  groups: { all: { focus: 'balanced', intensity: 'normal' }, G: null, D: null, M: null, F: null },
  taper: true,
});

export function hireCoach(game, coachId) {
  const club = game.clubs[game.userClubId];
  const c = (game.coachPool || []).find((x) => x.id === coachId);
  if (!c) return { ok: false, message: 'That coach is no longer available.' };
  const old = club.staff?.[c.role];
  const fee = old ? severance(game, old) : 0;
  if (club.budget < fee) return { ok: false, message: 'You cannot afford to pay off the current coach.' };
  if (old) payOff(game, club, old, fee);
  game.coachPool = game.coachPool.filter((x) => x.id !== coachId);
  club.staff = club.staff || {};
  club.staff[c.role] = { ...c, until: game.season.year + c.years };
  addNews(game, `${c.name} (${'★'.repeat(c.stars)}) is our new ${ROLE_LABEL[c.role].toLowerCase()}.`, 'staff');
  return { ok: true, message: `${c.name} hired until ${game.season.year + c.years}.` };
}

// Paying off a coach costs half of his remaining wages.
export const severance = (game, c) => Math.round((c.wage * Math.max(0, c.until - game.season.year + 1) * 0.5) / 1000) * 1000;

function payOff(game, club, c, fee) {
  club.budget -= fee;
  club.finance.season.staff = (club.finance.season.staff || 0) + fee;
  club.staff[c.role] = null;
}

export function fireCoach(game, role) {
  const club = game.clubs[game.userClubId];
  const c = club.staff?.[role];
  if (!c) return { ok: false, message: 'No coach in that role.' };
  const fee = severance(game, c);
  payOff(game, club, c, fee);
  return { ok: true, message: `${c.name} has left (compensation ${fee.toLocaleString('en-US')} €).` };
}

export const staffWages = (club) => ROLES.reduce((s, r) => s + (club.staff?.[r]?.wage || 0), 0);

// The staff cost already built into every club's running costs (AI clubs have
// no individual coaches); the user pays his real staff instead.
export const expectedStaffWages = (game, club) => STAFF_SHARE * expectedWageBill(game, club);

// End of season: contracts run out, a new pool of coaches appears.
export function seasonEndStaff(game, nextYear) {
  const club = game.clubs[game.userClubId];
  for (const role of ROLES) {
    const c = club?.staff?.[role];
    if (c && c.until < nextYear) {
      addNews(game, `${c.name}'s contract as ${ROLE_LABEL[role].toLowerCase()} has ended. Hire a replacement on the Training screen.`, 'staff');
      club.staff[role] = null;
    }
  }
  refreshCoachPool(game);
}

// ---- plans ----

export function planFor(game, club, p) {
  if (club.id !== game.userClubId) return { focus: 'balanced', intensity: 'normal' };
  const t = club.training || defaultTraining();
  return p.train || t.groups[p.pos] || t.groups.all;
}

// ---- daily routine ----

const ageCurve = {
  tec: (a) => (a <= 19 ? 1 : a <= 21 ? 0.85 : a <= 23 ? 0.55 : a <= 25 ? 0.3 : a <= 28 ? 0.1 : 0),
  phy: (a) => (a <= 21 ? 0.9 : a <= 23 ? 0.6 : a <= 25 ? 0.35 : a <= 28 ? 0.12 : 0),
};
// Yearly decline from age 30: mostly physical.
const decline = {
  phy: (a) => (a <= 29 ? 0 : a <= 31 ? 2.5 : a <= 33 ? 5.5 : 8),
  tec: (a) => (a <= 31 ? 0 : a <= 33 ? 0.8 : 1.8),
};
export const acwrRisk = (p) => {
  const r = p.load ? p.load.acute / Math.max(0.6, p.load.chronic) : 1;
  return r <= 1.3 ? 1 : r <= 1.5 ? 1.25 : r <= 1.8 ? 1.5 : 2;
};
export const acwr = (p) => (p.load ? p.load.acute / Math.max(0.6, p.load.chronic) : 1);

function gainAttr(p, attr, amount) {
  p.xp[attr] += amount;
  let changed = false;
  while (p.xp[attr] >= 1) {
    const next = { tec: p.tec, phy: p.phy, [attr]: p[attr] + 1 };
    if (deriveSkill(p.pos, next.tec, next.phy) > p.potential) { p.xp[attr] = 0.99; break; }
    p[attr] = Math.min(99, p[attr] + 1);
    p.xp[attr] -= 1;
    changed = true;
  }
  while (p.xp[attr] <= -1) {
    p[attr] = Math.max(10, p[attr] - 1);
    p.xp[attr] += 1;
    changed = true;
  }
  return changed;
}

// One day for every player at every club. Call before the day's matches.
export function trainingDay(game) {
  const rng = new Rng(game.rng);
  const year = game.season.year;
  const today = new Set();
  const tomorrow = new Set();
  for (const f of Object.values(game.fixtures)) {
    if (f.result) continue;
    if (f.day === game.day) { today.add(f.homeId); today.add(f.awayId); }
    else if (f.day === game.day + 1) { tomorrow.add(f.homeId); tomorrow.add(f.awayId); }
  }
  const user = game.userClubId;
  for (const club of Object.values(game.clubs)) {
    const matchDay = today.has(club.id);
    const fit = starsFor(game, club, 'fitness');
    const coach = { tec: coachFactor(starsFor(game, club, 'technical')), phy: coachFactor(fit), gk: coachFactor(starsFor(game, club, 'goalkeeping')) };
    const youthCoach = coachFactor(starsFor(game, club, 'youth'));
    const physio = starsFor(game, club, 'physio');
    const physioRec = 0.91 + 0.03 * physio;
    const injDays = physioDays(game, club);
    const teamPlayed = Math.max(1, game.competitions[club.compId]?.table?.[club.id]?.p || 0);
    const taper = club.id !== user || (club.training?.taper ?? true);
    const academy = new Set(club.youth || []);
    const ids = [...club.squad, ...academy];
    for (const id of ids) {
      const p = game.players[id];
      if (!p) continue;
      if (!p.xp) p.xp = { tec: 0, phy: 0 };
      if (!p.load) p.load = { acute: 1.5, chronic: 1.5 };
      const age = year - p.birthYear;
      const injured = p.injuryDays > 0;
      if (injured) p.injuryDays--;
      let plan = planFor(game, club, p);
      let load = 0;
      let train = !matchDay && !injured;
      if (train && taper && tomorrow.has(club.id) && plan.focus !== 'recovery') plan = { focus: plan.focus, intensity: 'light' };
      if (plan.focus === 'recovery') train = false;
      const I = INTENSITY[plan.intensity] || INTENSITY.normal;

      // Fatigue (fast) and energy recovery towards 100 - fatigue.
      const phyF = 1.25 - p.phy / 200;
      const coachFit = 1.15 - 0.05 * (fit || 1);
      p.fatigue = (p.fatigue || 0) * (plan.focus === 'recovery' || injured ? 0.75 : FATIGUE_DECAY);
      if (train) {
        p.fatigue += I.fatigue * phyF * coachFit * 7.5 * (1 - FATIGUE_DECAY);
        load = I.load;
      }
      p.fatigue = clamp(p.fatigue, 0, 40);
      const ageF = age >= 33 ? 0.75 : age >= 30 ? 0.85 : 1;
      const rec = 9 * (0.75 + p.phy / 200) * ageF * physioRec;
      const cap = 100 - p.fatigue;
      p.energy = Math.min(cap, (p.energy ?? 100) + rec);

      // Workload: 7-day and 28-day averages.
      p.load.acute += (load - p.load.acute) / 7;
      p.load.chronic += (load - p.load.chronic) / 28;

      // Training injuries (more likely on hard days and load spikes).
      if (train && rng.next() < TRAINING_INJURY * I.risk * acwrRisk(p) * (1.1 - 0.04 * (fit || 1)) * (p.phy < 50 ? 1.15 : 1)) {
        const days = Math.max(2, Math.round(rng.int(3, 21) * injDays));
        p.injuryDays = Math.max(p.injuryDays, days);
        if (club.id === user) addNews(game, `${p.first} ${p.last} was injured in training and will be out for ${days} days.`, 'injury');
        continue;
      }

      // Development.
      const before = p.skill;
      let changed = false;
      if (train) {
        const share = SHARE[plan.focus];
        const gap = clamp((p.potential - p.skill) / 8, 0, 1);
        const playF = 0.8 + 0.5 * clamp(p.stats.season.apps / teamPlayed, 0, 1);
        const fresh = p.energy / 100;
        const mind = moraleDevFactor(p);
        for (const attr of ['tec', 'phy']) {
          // The academy is run by the youth coach.
          const cf = academy.has(id) ? youthCoach : p.pos === 'G' ? coach.gk : coach[attr];
          const xp = K * share[attr] * I.gain * cf * ageCurve[attr](age) * gap * playF * fresh * mind * (1 + 0.1 * (p.form || 0));
          if (xp > 0 && gainAttr(p, attr, xp)) changed = true;
        }
      }
      // Ageing: decline from 30, mainly physical. Physical training slows it.
      for (const attr of ['phy', 'tec']) {
        const d = decline[attr](age);
        if (!d) continue;
        const keep = train && attr === 'phy' ? SHARE[plan.focus].phy * I.gain * coach.phy * 0.4 : 0;
        if (gainAttr(p, attr, -(d / 300) * (1 - Math.min(0.8, keep)))) changed = true;
      }
      // Good and bad spells.
      if (rng.next() < 0.0012) { if (gainAttr(p, rng.chance(0.5) ? 'tec' : 'phy', rng.chance(0.5) ? 1 : -1)) changed = true; }

      if (changed) {
        syncSkill(p);
        markSkillChange(p, before);
        if (p.skill < before && age >= 30) p.potential = Math.max(p.skill, p.potential - (before - p.skill));
        if (p.potential < p.skill) p.potential = p.skill;
        p.value = playerValue(p, year);
        if (club.id === user && p.skill > before && p.skill - p.seasonStart >= 4 && p.devNews !== year) {
          p.devNews = year;
          addNews(game, `${p.first} ${p.last} is developing fast: skill ${p.skill} (+${p.skill - p.seasonStart} this season).`, 'player');
        }
      }
    }
  }
}

// After a match: playing is a heavy load.
export function matchLoad(p) {
  p.fatigue = clamp((p.fatigue || 0) + MATCH_FATIGUE, 0, 40);
  if (!p.load) p.load = { acute: 1.5, chronic: 1.5 };
  p.load.acute += (MATCH_LOAD - p.load.acute) / 7;
  p.load.chronic += (MATCH_LOAD - p.load.chronic) / 28;
}
