// U-19 league: the clubs of the league the user manages in, each with an
// U-19 side, play a simulated league on Sundays after the league weekends.
//
// The user's U-19 side is his academy plus first-team players he sends down
// (p.u19). Players are eligible when they are 19 or younger at the start of
// the season (season year - birth year <= 19), as in real youth leagues. The
// best eleven available play each match: their appearances (youthApps) count
// towards development like first-team games. The other clubs' U-19 sides are
// rated from the club's reputation; their matches are simple simulations.

import { Rng } from './rng.js';
import { roundRobin } from './calendar.js';
import { addNews, sortedTable } from './season.js';
import { unlock } from './achievements.js';

export const U19_MAX_AGE = 19;
const emptyRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

export const u19Eligible = (game, p) => !!p && game.season.year - p.birthYear <= U19_MAX_AGE && !p.loan && p.clubId === game.userClubId;

// Players in the user's U-19 side now: the academy and the first-team players sent down.
export function u19Squad(game) {
  const club = game.clubs[game.userClubId];
  if (!club) return [];
  const academy = (club.youth || []).map((id) => game.players[id]);
  const sent = club.squad.map((id) => game.players[id]).filter((p) => p.u19);
  return [...academy, ...sent].filter((p) => u19Eligible(game, p));
}

export function setU19(game, playerId, on) {
  const p = game.players[playerId];
  if (!p) return { ok: false, message: 'No such player.' };
  if (on && !u19Eligible(game, p)) return { ok: false, message: `${p.first} ${p.last} is too old for the U-19 side (19 or younger at the start of the season).` };
  if (on) p.u19 = true; else delete p.u19;
  return { ok: true, message: on ? `${p.first} ${p.last} will play for the U-19 side.` : `${p.first} ${p.last} is back with the first team only.` };
}

// The U-19 league of the user's league this season (made when needed, from
// the next Sunday on, so older saves and new jobs get one too).
export function ensureYouthLeague(game) {
  const club = game.clubs[game.userClubId];
  if (!club || game.season.phase !== 'season') return null;
  const comp = game.competitions[club.compId];
  if (!comp || comp.type !== 'league') return null;
  const yl = game.youthLeague;
  if (yl && yl.year === game.season.year && yl.compId === comp.id) return yl;
  if (yl && yl.year === game.season.year) return yl; // a mid-season job change: next season in the new league
  const rng = new Rng(game.rng);
  const sundays = (game.season.weekends || []).map((d) => d + 1).filter((d) => d > game.day);
  const rounds = roundRobin(comp.clubIds, rng);
  const R = Math.min(rounds.length, sundays.length);
  const fixtures = [];
  for (let i = 0; i < R; i++) {
    const day = sundays[Math.round((i * (sundays.length - 1)) / Math.max(1, R - 1))];
    for (const [h, a] of rounds[i]) fixtures.push({ day, round: i + 1, h, a, result: null });
  }
  game.youthLeague = {
    year: game.season.year, compId: comp.id, name: `${comp.name} U-19`, clubIds: comp.clubIds.slice(),
    table: Object.fromEntries(comp.clubIds.map((id) => [id, emptyRow()])), fixtures,
    history: yl?.history || [],
  };
  return game.youthLeague;
}

// A club's youth level: what its U-19 players are like (about 35-60).
// Calibrated on the academies' players: about 46 for a big English club, 34 for a Czech mid-table one.
const youthLevel = (game, club) => 12 + club.reputation * 0.42 + (game.nations[club.nationId]?.strength || 0) * 0.5;

// Strength of a U-19 side. The user's: his eligible players always play
// (they need the minutes), the rest of the eleven are youth-team players of
// the club's youth level.
function sideStrength(game, clubId, rng) {
  const club = game.clubs[clubId];
  if (clubId === game.userClubId) {
    const skills = pickEleven(game).map((p) => p.skill);
    while (skills.length < 11) skills.push(youthLevel(game, club) - 2);
    return skills.reduce((a, b) => a + b, 0) / skills.length + rng.normal(0, 1);
  }
  return youthLevel(game, club) + rng.normal(0, 2);
}

// The best eleven fit players (a goalkeeper first).
export function pickEleven(game) {
  const ps = u19Squad(game).filter((p) => p.injuryDays <= 0 && (p.energy ?? 100) >= 60).sort((a, b) => b.skill - a.skill);
  const gk = ps.find((p) => p.pos === 'G');
  const rest = ps.filter((p) => p !== gk).slice(0, gk ? 10 : 11);
  return gk ? [gk, ...rest] : rest;
}

function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= rng.next(); } while (p > L && k < 12);
  return k - 1;
}

const GOAL_WEIGHT = { G: 0, D: 1, M: 3, F: 6 };

function playMatch(game, f, rng) {
  const sh = sideStrength(game, f.h, rng);
  const sa = sideStrength(game, f.a, rng);
  const h = poisson(rng, 1.45 * Math.exp((sh - sa) / 16) + 0.1);
  const a = poisson(rng, 1.15 * Math.exp((sa - sh) / 16));
  f.result = { h, a };
  const t = game.youthLeague.table;
  const rh = t[f.h];
  const ra = t[f.a];
  rh.p++; ra.p++; rh.gf += h; rh.ga += a; ra.gf += a; ra.ga += h;
  const rec = (r, x) => { r.form.push(x); if (r.form.length > 6) r.form.shift(); };
  if (h > a) { rh.w++; ra.l++; rh.pts += 3; rec(rh, 'W'); rec(ra, 'L'); }
  else if (h < a) { ra.w++; rh.l++; ra.pts += 3; rec(rh, 'L'); rec(ra, 'W'); }
  else { rh.d++; ra.d++; rh.pts++; ra.pts++; rec(rh, 'D'); rec(ra, 'D'); }
  const user = game.userClubId;
  if (f.h !== user && f.a !== user) return;
  // The user's players: appearances, goals, a little tiredness.
  const xi = pickEleven(game);
  const ours = f.h === user ? h : a;
  const scorers = [];
  for (let k = 0; k < ours && xi.length; k++) {
    const p = rng.weighted(xi, (x) => GOAL_WEIGHT[x.pos] + 0.2);
    scorers.push(p);
  }
  for (const p of xi) {
    const st = p.stats.season;
    st.youthApps = (st.youthApps || 0) + 1;
    p.energy = Math.max(0, (p.energy ?? 100) - 15);
  }
  for (const p of scorers) p.stats.season.youthGoals = (p.stats.season.youthGoals || 0) + 1;
  f.scorers = scorers.map((p) => p.id);
  const opp = game.clubs[f.h === user ? f.a : f.h];
  const o = ours > (f.h === user ? a : h) ? 'win' : ours < (f.h === user ? a : h) ? 'defeat' : 'draw';
  const names = {};
  for (const p of scorers) names[p.last] = (names[p.last] || 0) + 1;
  const goalText = Object.entries(names).map(([n, c]) => (c > 1 ? `${n} ${c}` : n)).join(', ');
  addNews(game, `U-19 ${o}: ${game.clubs[f.h].name} ${h}:${a} ${game.clubs[f.a].name}${goalText ? ` (${goalText})` : ''}.`, 'youth');
}

// Daily: today's U-19 matches; the champions at the last round.
export function youthLeagueDay(game) {
  const yl = ensureYouthLeague(game);
  if (!yl) return;
  const today = yl.fixtures.filter((f) => f.day === game.day && !f.result);
  if (!today.length) return;
  const rng = new Rng(game.rng);
  for (const f of today) playMatch(game, f, rng);
  if (yl.fixtures.every((f) => f.result) && !yl.championId) {
    const top = u19Table(game)[0];
    yl.championId = top.clubId;
    yl.history.push({ year: yl.year, championId: top.clubId });
    if (yl.history.length > 30) yl.history.shift();
    const mine = top.clubId === game.userClubId;
    addNews(game, mine ? `Our U-19 side are ${yl.name} champions!` : `${game.clubs[top.clubId].name} win the ${yl.name}.`, 'youth');
    if (mine) unlock(game, 'u19', yl.name);
  }
}

export const u19Table = (game) => (game.youthLeague ? sortedTable(game, { table: game.youthLeague.table }) : []);
