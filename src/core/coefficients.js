// Coefficients, in the spirit of UEFA's: points for European results, kept
// per season. They start from the real values (5 seasons up to 2025/26) and
// then grow from the game's own results.
//
// - Club points per season: 2 for a win, 1 for a draw in any of the three
//   competitions, a bonus for playing the league phase (Champions Cup 6,
//   Continental League 2, Conference 1) and 1 for every knockout round from
//   the round of 16 on.
// - Country points per season: the points of its clubs divided by the number
//   of clubs it entered. The ranking adds up the last five seasons.
// - Club coefficient: its own last five seasons, or 20 % of its country's if
//   that is more (a smaller club of a strong country is seeded higher).
//
// The country ranking decides how many places a country gets (ACCESS); the
// club coefficients seed the league-phase pots.

import { REAL_COUNTRY_POINTS, REAL_CLUB_POINTS, START_SEASONS } from './coefdata.js';

export const MATCH_POINTS = { win: 2, draw: 1 };
export const PHASE_BONUS = { CCC: 6, CEL: 2, CCL: 1 };
export const ROUND_BONUS = 1; // per knockout round reached from the round of 16

// Places in the league phases by country rank (1-based): [Champions Cup,
// Continental League, Conference]. Every column adds up to 36; countries
// without enough clubs pass their places down the ranking.
const ACCESS_ROWS = [
  [1, 4, [4, 2, 1]], [5, 5, [3, 2, 1]], [6, 6, [2, 2, 1]], [7, 10, [2, 1, 1]], [11, 17, [1, 1, 1]],
  [18, 25, [0, 1, 2]], [26, 28, [0, 1, 1]], [29, 30, [0, 1, 0]],
];
export function accessFor(rank) {
  const row = ACCESS_ROWS.find(([a, b]) => rank >= a && rank <= b);
  return row ? { CCC: row[2][0], CEL: row[2][1], CCL: row[2][2] } : { CCC: 0, CEL: 0, CCL: 0 };
}

// game.coefficients = { country: { ENG: { 2021: 18.5, ... } }, club: { clubId: { 2021: 21, ... } } }
export function ensureCoefficients(game) {
  if (game.coefficients) return game.coefficients;
  const co = { country: {}, club: {} };
  for (const [nationId, pts] of Object.entries(REAL_COUNTRY_POINTS)) {
    co.country[nationId] = Object.fromEntries(START_SEASONS.map((y, i) => [y, pts[i] ?? 0]));
  }
  const byName = new Map(Object.values(game.clubs).map((c) => [c.baseName || c.name, c.id]));
  for (const [name, pts] of Object.entries(REAL_CLUB_POINTS)) {
    const id = byName.get(name);
    if (id) co.club[id] = Object.fromEntries(START_SEASONS.map((y, i) => [y, pts[i] ?? 0]));
  }
  game.coefficients = co;
  return co;
}

// The five seasons that count before `year` starts (2027 -> 2022..2026).
const window5 = (year) => [year - 5, year - 4, year - 3, year - 2, year - 1];
const sum5 = (rec, year) => window5(year).reduce((a, y) => a + (rec?.[y] || 0), 0);

export function countryTotal(game, nationId, year = game.season.year) {
  return sum5(ensureCoefficients(game).country[nationId], year);
}

export function clubTotal(game, clubId, year = game.season.year) {
  const co = ensureCoefficients(game);
  const own = sum5(co.club[clubId], year);
  const nation = game.clubs[clubId]?.nationId;
  return Math.max(own, 0.2 * countryTotal(game, nation, year));
}

// Countries ranked for the season starting in `year`: [{ nationId, total, rank }].
export function countryRanking(game, year = game.season.year) {
  const co = ensureCoefficients(game);
  return Object.keys(co.country)
    .filter((id) => game.nations[id])
    .map((nationId) => ({ nationId, total: countryTotal(game, nationId, year) }))
    .sort((a, b) => b.total - a.total || a.nationId.localeCompare(b.nationId))
    .map((r, i) => ({ ...r, rank: i + 1, places: accessFor(i + 1) }));
}

// Points of the season just played, from the competitions' fixtures and rounds.
// Called at the end of the season, before the competitions are reset.
export function recordSeason(game, year, comps) {
  const co = ensureCoefficients(game);
  const { clubPts, country } = seasonPoints(game, comps);
  for (const [id, p] of Object.entries(clubPts)) (co.club[id] = co.club[id] || {})[year] = p;
  for (const [n, v] of Object.entries(country)) (co.country[n] = co.country[n] || {})[year] = v;
  // Countries with no club in Europe this season score 0 for it.
  for (const n of Object.keys(co.country)) if (co.country[n][year] === undefined) co.country[n][year] = 0;
  // Keep six seasons of club history (five count, one to show the change).
  for (const rec of Object.values(co.club)) for (const y of Object.keys(rec)) if (Number(y) < year - 6) delete rec[y];
  for (const rec of Object.values(co.country)) for (const y of Object.keys(rec)) if (Number(y) < year - 9) delete rec[y];
}

// The season in progress (or just played): club points and country scores so
// far, from the competitions' fixtures and rounds.
export function seasonPoints(game, comps = ['CCC', 'CEL', 'CCL'].map((id) => game.competitions[id]).filter(Boolean)) {
  const clubPts = {};
  const entered = {};
  const add = (id, p) => { clubPts[id] = (clubPts[id] || 0) + p; };
  for (const comp of comps) {
    if (!comp.clubIds?.length) continue;
    for (const id of comp.clubIds) {
      add(id, PHASE_BONUS[comp.id] || 0);
      const n = game.clubs[id]?.nationId;
      if (n) entered[n] = (entered[n] || 0) + 1;
    }
    for (const f of Object.values(game.fixtures)) {
      if (f.compId !== comp.id || !f.result) continue;
      const { h, a } = f.result;
      // Matches decided on penalties count as draws, as UEFA counts them.
      if (h > a) add(f.homeId, MATCH_POINTS.win);
      else if (a > h) add(f.awayId, MATCH_POINTS.win);
      else { add(f.homeId, MATCH_POINTS.draw); add(f.awayId, MATCH_POINTS.draw); }
    }
    // Knockout rounds reached from the round of 16 (the round after the play-offs).
    (comp.rounds || []).forEach((r, k) => {
      if (k === 0 && comp.format === 'league') return;
      const ids = new Set([...(r.byes || []), ...(r.fixtureIds || []).flatMap((fid) => {
        const f = game.fixtures[fid];
        return f ? [f.homeId, f.awayId] : [];
      })]);
      for (const id of ids) add(id, ROUND_BONUS);
    });
  }
  const byCountry = {};
  for (const [id, p] of Object.entries(clubPts)) {
    const n = game.clubs[id]?.nationId;
    if (n) byCountry[n] = (byCountry[n] || 0) + p;
  }
  const country = {};
  for (const n of Object.keys(entered)) country[n] = Math.round((byCountry[n] / entered[n]) * 1000) / 1000;
  return { clubPts, country };
}

// Next season's country ranking as things stand: the last four seasons plus
// this season's points so far.
export function liveRanking(game) {
  const co = ensureCoefficients(game);
  const year = game.season.year;
  const { country } = seasonPoints(game);
  return Object.keys(co.country)
    .filter((id) => game.nations[id])
    .map((nationId) => {
      const rec = co.country[nationId];
      const total = [year - 4, year - 3, year - 2, year - 1].reduce((a, y) => a + (rec?.[y] || 0), 0) + (country[nationId] || 0);
      return { nationId, total };
    })
    .sort((a, b) => b.total - a.total || a.nationId.localeCompare(b.nationId))
    .map((r, i) => ({ ...r, rank: i + 1, places: accessFor(i + 1) }));
}
