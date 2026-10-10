// Save game (de)serialisation with versioned migrations. Storage itself
// (IndexedDB, file download) lives in the UI layer.

import { GAME_VERSION, NATIONS } from './data.js';
import { createContinental, CONTINENTAL_ID } from './continental.js';
import { createNational } from './national.js';
import { ensureAttributes } from './attributes.js';
import { initUserStaff, defaultTraining, staffPayScale, coachWage, refreshCoachPool, ROLES } from './training.js';
import { Rng } from './rng.js';
import { ensurePersonalities } from './morale.js';
import { ensureManager } from './board.js';
import { startNationalJobs } from './nationaljob.js';
import { makeManager } from './worldgen.js';

// Each entry upgrades a save from version `from` to `from + 1`.
const MIGRATIONS = {
  // v2 (milestone 3): teamwork, set-piece and penalty takers.
  1: (game) => {
    for (const c of Object.values(game.clubs)) {
      c.teamwork = c.teamwork ?? 60;
      if (c.lineup) { c.lineup.setPieceId = c.lineup.setPieceId ?? null; c.lineup.penaltyId = c.lineup.penaltyId ?? null; }
    }
    game.version = 2;
  },
  // v3 (milestone 7): nation strength stored in the world (it was missing, so
  // youth and signings ignored it and the countries drifted together).
  2: (game) => {
    for (const n of NATIONS) if (game.nations[n.id]) game.nations[n.id].strength = n.strength;
    game.version = 3;
  },
  // v4: the Continental Champions Cup. It starts with the career's next season.
  3: (game) => {
    if (!game.competitions[CONTINENTAL_ID]) createContinental(game);
    game.version = 4;
  },
  // v5: stadium expansion and scouting.
  4: (game) => {
    const user = game.clubs[game.userClubId];
    if (user && !user.scouting) user.scouting = { level: 1, assignments: [], reports: {} };
    game.version = 5;
  },
  // v6: national teams (senior and U21). They start with the career's next season.
  5: (game) => {
    if (!game.national) createNational(game);
    game.version = 6;
  },
  // v7: technical / physical ability, height, training and coaching staff.
  6: (game) => {
    const rng = new Rng({ s: 4242 });
    for (const p of Object.values(game.players)) ensureAttributes(p, rng);
    const user = game.clubs[game.userClubId];
    if (user && !user.staff) {
      user.training = user.training || defaultTraining();
      initUserStaff(game);
    }
    game.version = 7;
  },
  // v8: personalities and morale; physio, youth coach and assistant manager.
  7: (game) => {
    ensurePersonalities(game);
    if (game.clubs[game.userClubId]) initUserStaff(game);
    game.version = 8;
  },
  // v9: board confidence, manager reputation, sackings and the job market.
  8: (game) => {
    ensureManager(game);
    game.version = 9;
  },
  // v10: managing a national team.
  9: (game) => {
    if (game.national && !game.national.jobs) startNationalJobs(game);
    game.version = 10;
  },
  // v11: named managers at the AI clubs.
  10: (game) => {
    const vacant = new Set((game.jobs || []).map((j) => j.clubId));
    for (const c of Object.values(game.clubs)) {
      if (c.id !== game.userClubId && !c.manager && !vacant.has(c.id)) c.manager = makeManager(game, c.nationId, c.id);
    }
    game.version = 11;
  },
  // v12: coach wages scale with the club (they were the same at every club,
  // which put small clubs deep in debt).
  11: (game) => {
    const user = game.clubs[game.userClubId];
    if (user?.staff) {
      const scale = staffPayScale(game, user);
      for (const role of ROLES) {
        const c = user.staff[role];
        if (c) c.wage = coachWage(c.stars, role, scale);
      }
      refreshCoachPool(game);
    }
    game.version = 12;
  },
  // v13: club and national team records, per-club season rows with assists.
  // Records start now; this season's stats so far count for the player's
  // current club.
  12: (game) => {
    for (const p of Object.values(game.players)) {
      const s = p.stats.season;
      if (s.apps && p.clubId) p.spell = { clubId: p.clubId, apps: s.apps, goals: s.goals, assists: s.assists || 0, ratingSum: s.ratingSum || 0 };
      p.stats.career.assists = p.stats.career.assists ?? s.assists ?? 0;
    }
    game.version = 13;
  },
};

export function serialize(game) {
  return JSON.stringify({ format: 'touchline-save', savedAt: new Date().toISOString(), game });
}

export function deserialize(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!data || data.format !== 'touchline-save' || !data.game) throw new Error('This is not a Touchline save file.');
  const game = data.game;
  if (typeof game.version !== 'number' || game.version > GAME_VERSION) {
    throw new Error(`Unsupported save version ${game.version}.`);
  }
  while (game.version < GAME_VERSION) {
    const m = MIGRATIONS[game.version];
    if (!m) throw new Error(`No migration from save version ${game.version}.`);
    m(game);
  }
  for (const key of ['nations', 'competitions', 'clubs', 'players', 'fixtures', 'season']) {
    if (!game[key] || typeof game[key] !== 'object') throw new Error(`Save is missing "${key}".`);
  }
  return game;
}
