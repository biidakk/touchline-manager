// Player development during the season (monthly ticks), and the yearly
// squad turnover: retirements, youth intake and AI squad maintenance.

import { Rng, clamp } from './rng.js';
import { playerValue, playerWage } from './valuation.js';
import { makePlayer } from './worldgen.js';
import { addNews } from './season.js';
import { splitSkill } from './attributes.js';
import { starsFor, aiStars } from './training.js';

export const TICKS_PER_SEASON = 9; // 1st of Sep, Oct, ..., May

// Expected skill change over a whole season for a player of `age`, before
// the potential gap and playing time are applied.
export function seasonRate(age) {
  if (age <= 19) return 6;
  if (age <= 21) return 5;
  if (age <= 23) return 3;
  if (age <= 25) return 1.5;
  if (age <= 29) return 0.3;
  if (age <= 31) return -1;
  if (age <= 33) return -2.5;
  return -4;
}

// One monthly development tick for every player.
export function developPlayers(game) {
  const rng = new Rng(game.rng);
  const year = game.season.year;
  for (const club of Object.values(game.clubs)) {
    const comp = game.competitions[club.compId];
    const teamPlayed = Math.max(1, comp.table[club.id]?.p || 0);
    for (const id of [...club.squad, ...(club.youth || [])]) {
      const p = game.players[id];
      const age = year - p.birthYear;
      const rate = seasonRate(age);
      let delta;
      if (rate > 0) {
        const gap = p.potential - p.skill;
        const gapFactor = clamp(gap / 8, 0, 1);
        const playRatio = clamp(p.stats.season.apps / teamPlayed, 0, 1);
        const playFactor = 0.8 + 0.5 * playRatio; // regular starters develop ~1.6x faster than reserves
        delta = ((rate * gapFactor * playFactor) / TICKS_PER_SEASON) * (1 + 0.1 * (p.form || 0));
      } else {
        delta = rate / TICKS_PER_SEASON;
      }
      // Probabilistic rounding keeps the season total right while each tick is 0 or ±1.
      let step = Math.trunc(delta);
      const frac = Math.abs(delta - step);
      if (rng.next() < frac) step += Math.sign(delta);
      if (rng.next() < 0.04) step += rng.chance(0.5) ? 1 : -1; // good and bad months
      if (!step) continue;
      const before = p.skill;
      p.skill = clamp(p.skill + step, 10, rate > 0 ? Math.max(p.skill, p.potential) : 99);
      if (age >= 30 && p.potential > p.skill) p.potential = Math.max(p.skill, p.potential - 1);
      if (p.potential < p.skill) p.potential = p.skill;
      p.value = playerValue(p, year);
      if (club.id === game.userClubId && p.skill > before && p.skill - p.seasonStart >= 4 && p.devNews !== year) {
        p.devNews = year;
        addNews(game, `${p.first} ${p.last} is developing fast: skill ${p.skill} (+${p.skill - p.seasonStart} this season).`, 'player');
      }
    }
  }
}

// Chance that a player retires at the end of the season.
export function retireChance(p, age) {
  if (age >= 38) return 0.95;
  if (age >= 37) return 0.75;
  if (age >= 36) return 0.55;
  if (age >= 35) return 0.35;
  if (age >= 34) return 0.18;
  if (age >= 33) return 0.08;
  if (age >= 31 && p.skill < 35) return 0.3;
  return 0;
}

const YOUTH_POS = [['G', 1], ['D', 3], ['M', 3], ['F', 2]];

// New youth players for a club: 3-6 per season, potential tied to reputation.
// AI clubs put them straight into the squad; the user's go to the academy
// (club.youth) until promoted.
export function youthIntake(game, club, rng, toAcademy = false) {
  const nation = game.nations[club.nationId];
  // The user's youth coach, compared with what a club of this standing has:
  // each star more or less moves the intake's potential by 2.5.
  const isUser = club.id === game.userClubId;
  const coachEdge = isUser ? starsFor(game, club, 'youth') - aiStars(club) : 0;
  const n = (toAcademy ? rng.int(3, 6) : rng.int(2, 5)) + (isUser && coachEdge >= 1 && rng.chance(0.5) ? 1 : 0);
  const made = [];
  for (let i = 0; i < n; i++) {
    const pos = rng.weighted(YOUTH_POS, (x) => x[1])[0];
    const natId = rng.chance(0.9) ? nation.id : rng.pick(Object.keys(game.nations));
    const p = makePlayer(game, rng, { nationId: natId, pos, meanSkill: 40, age: rng.int(16, 17), clubId: club.id });
    // Potential centred a little below the club's level: clubs keep their best
    // youngsters and release the rest, so the ones who stay end up around it.
    // (Centring it higher makes the whole world inflate over the years.)
    const level = 30 + club.reputation * 0.55 + (game.nations[club.nationId].strength || 0);
    p.potential = Math.round(clamp(rng.normal(level - 5 + 2.5 * coachEdge, 7), 30, 95));
    p.skill = Math.round(clamp(p.potential - rng.normal(22, 5), 15, p.potential));
    splitSkill(p, rng);
    p.seasonStart = p.skill;
    p.tecStart = p.tec;
    p.phyStart = p.phy;
    p.contractEnd = game.season.year + 3;
    p.value = playerValue(p, game.season.year);
    p.wage = playerWage(p, game.season.year);
    p.youth = game.season.year;
    game.players[p.id] = p;
    if (toAcademy) {
      p.number = 0;
      club.youth = [...(club.youth || []), p.id];
    } else {
      p.number = freeNumber(game, club);
      club.squad.push(p.id);
    }
    made.push(p.id);
  }
  return made;
}

export const ACADEMY_MAX_AGE = 19;

// A new career starts with a first academy intake.
export function startAcademy(game) {
  const club = game.clubs[game.userClubId];
  if (!(club.youth || []).length) youthIntake(game, club, new Rng(game.rng), true);
}

// Moves an academy player into the first-team squad.
export function promoteYouth(game, club, id) {
  if (!(club.youth || []).includes(id)) return false;
  club.youth = club.youth.filter((x) => x !== id);
  game.players[id].number = freeNumber(game, club);
  club.squad.push(id);
  return true;
}

// Releases a player (first team or academy); he leaves the game world.
export function releasePlayer(game, club, id) {
  const inSquad = club.squad.includes(id);
  const inYouth = (club.youth || []).includes(id);
  if (!inSquad && !inYouth) return false;
  if (game.players[id].loan) return false; // a borrowed player belongs to his own club
  if (inSquad && club.squad.length <= 16) return false;
  club.squad = club.squad.filter((x) => x !== id);
  club.youth = (club.youth || []).filter((x) => x !== id);
  if (club.lineup) {
    club.lineup.slots = club.lineup.slots.map((x) => (x === id ? null : x));
    club.lineup.bench = club.lineup.bench.filter((x) => x !== id);
    for (const k of ['captainId', 'setPieceId', 'penaltyId']) if (club.lineup[k] === id) club.lineup[k] = null;
  }
  delete game.players[id];
  return true;
}

export function freeNumber(game, club) {
  const used = new Set(club.squad.map((id) => game.players[id].number));
  for (let n = 2; n < 99; n++) if (!used.has(n) && n !== 1 && n !== 12) return n;
  return 99;
}

// AI clubs keep a workable squad: 22-26 players with three keepers.
export function maintainAiSquad(game, club, rng) {
  const year = game.season.year;
  const P = (id) => game.players[id];
  const keep = (p) => p.skill + Math.max(0, p.potential - p.skill) * (year - p.birthYear <= 21 ? 0.6 : 0.2);
  const released = [];
  while (club.squad.length > 26) {
    const byPos = (pos) => club.squad.filter((id) => P(id).pos === pos).length;
    const cands = club.squad.filter((id) => byPos(P(id).pos) > (P(id).pos === 'G' ? 3 : 6));
    const worst = (cands.length ? cands : club.squad).slice().sort((a, b) => keep(P(a)) - keep(P(b)))[0];
    club.squad = club.squad.filter((id) => id !== worst);
    released.push(worst);
  }
  const meanSkill = 30 + club.reputation * 0.55 + (game.nations[club.nationId].strength || 0);
  const need = (pos, min) => {
    while (club.squad.filter((id) => P(id).pos === pos).length < min) addSigning(pos);
  };
  function addSigning(pos) {
    const p = makePlayer(game, rng, { nationId: club.nationId, pos, meanSkill, age: rng.int(22, 29), clubId: club.id });
    p.number = freeNumber(game, club);
    game.players[p.id] = p;
    club.squad.push(p.id);
  }
  need('G', 3);
  need('D', 7);
  need('M', 7);
  need('F', 4);
  while (club.squad.length < 22) addSigning(rng.pick(['D', 'M', 'F']));
  return released;
}

// The user's squad is the user's business, but it must stay playable.
export function ensureUserSquad(game, club, rng) {
  const P = (id) => game.players[id];
  const meanSkill = 20 + club.reputation * 0.5;
  const add = (pos) => {
    const p = makePlayer(game, rng, { nationId: club.nationId, pos, meanSkill, age: rng.int(24, 31), clubId: club.id });
    p.number = freeNumber(game, club);
    game.players[p.id] = p;
    club.squad.push(p.id);
    addNews(game, `With the squad short of players, ${p.first} ${p.last} (${pos}) has joined on a free transfer.`, 'club');
  };
  while (club.squad.filter((id) => P(id).pos === 'G').length < 2) add('G');
  while (club.squad.length < 18) add(rng.pick(['D', 'M', 'F']));
}
