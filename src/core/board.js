// The manager's career: board confidence, sackings, manager reputation and
// the job market.
//
// The board's confidence (0..100) is made of parts, each with a reason the
// board can explain:
//   standing  trust built (or lost) in earlier seasons; a new manager gets time
//   results   recent results against what the club's standing expects
//   table     league position against the season's target (counts more as
//             the season goes on)
//   finance   debt
// confidence = 50 + the parts. Below 30 the board issues an ultimatum; below
// 20 (after 8 league matches) the manager is sacked. At the end of the season
// the board judges the whole season.
//
// AI clubs that do badly sack their (unnamed) managers too. Their vacancies
// are listed on the career screen; clubs may approach the user, and the user
// can apply. Taking a job hands the old club over to the AI.

import { Rng, clamp, hashSeed } from './rng.js';
import { addNews, sortedTable } from './season.js';
import { boardTarget, makeManager } from './worldgen.js';
import { expectedWageBill } from './finance.js';
import { autoLineup } from './ai.js';
import { freeNumber, startAcademy } from './development.js';
import { initUserStaff, defaultTraining } from './training.js';
import { DAY_MS } from './calendar.js';
import { nationalOffersWhenFree } from './nationaljob.js';

export const SACK_AT = 20;
export const ULTIMATUM_AT = 30;
const HONEYMOON = 12;
const OFFER_DAYS = 14;
const VACANCY_DAYS = 30;

export const CONFIDENCE_LEVELS = [[75, 'Delighted', 'good'], [55, 'Satisfied', 'good'], [40, 'Patient', ''],
  [ULTIMATUM_AT, 'Concerned', 'warn'], [0, 'Losing patience', 'bad']];
export const confidenceLevel = (v) => CONFIDENCE_LEVELS.find(([min]) => v >= min);

export const REPUTATION_LEVELS = [[80, 'World class'], [65, 'Renowned'], [50, 'Respected'], [35, 'Established'],
  [20, 'Promising'], [0, 'Unknown']];
export const reputationLevel = (v) => REPUTATION_LEVELS.find(([min]) => v >= min)[1];

// Board decisions use their own random stream so they don't shift the world's.
const rngFor = (game, tag) => new Rng({ s: hashSeed(`${game.seed}:board:${tag}:${game.day}`) });

const targetFor = (game, club) => ({ ...boardTarget(game, club), clubId: club.id, year: game.season.year });

function openStint(game, club) {
  game.manager.stints.push({ clubId: club.id, clubName: club.name, from: game.season.year, fromDay: game.day,
    to: null, p: 0, w: 0, d: 0, l: 0, end: null });
}

function closeStint(game, end) {
  const s = game.manager.stints.at(-1);
  if (s && s.to == null) { s.to = game.season.year; s.end = end; }
}

// A new career (or an old save): reputation from the first club, the
// board's patience and the first stint.
export function initManager(game, club, { standing = HONEYMOON } = {}) {
  const m = game.manager;
  m.reputation = m.reputation ?? clamp(Math.round(club.reputation - 10), 15, 75);
  m.board = { standing, results: 0, table: 0, finance: 0, warned: false, inheritedDebt: Math.max(0, -club.budget) };
  m.target = targetFor(game, club);
  m.offers = m.offers || [];
  m.stints = m.stints || [];
  m.sacked = m.sacked || null;
  game.jobs = game.jobs || [];
  if (!m.stints.length || m.stints.at(-1).clubId !== club.id || m.stints.at(-1).to != null) openStint(game, club);
}

export function confidence(game) {
  const b = game.manager.board;
  if (!b) return 50;
  return Math.round(clamp(50 + b.standing + b.results + b.table + b.finance, 0, 100));
}

// League position against the target; early in the season it counts less.
function tableScore(game, club) {
  const comp = game.competitions[club.compId];
  const rows = sortedTable(game, comp);
  const pos = rows.findIndex((r) => r.clubId === club.id) + 1;
  const played = rows[pos - 1]?.p || 0;
  let t = game.manager.target;
  if (!t || t.clubId !== club.id) t = game.manager.target = targetFor(game, club);
  const gap = t.maxPos - pos;
  const v = gap >= 0 ? Math.min(12, 2 + gap * 1.5) : Math.max(-35, gap * 3.5);
  const w = played ? clamp(0.2 + played / ((comp.clubIds.length - 1) * 2), 0, 1) : 0;
  return { v: v * w, pos, gap, played };
}

// The share of points a club of the user's standing is expected to take.
function expectedScore(game, club, opp, home) {
  return clamp(0.5 + (club.reputation - opp.reputation) / 50 + (home ? 0.07 : -0.07), 0.1, 0.9);
}

export function boardAfterMatch(game, f) {
  const m = game.manager;
  const b = m.board;
  if (!b) return;
  const club = game.clubs[game.userClubId];
  const home = f.homeId === club.id;
  const opp = game.clubs[home ? f.awayId : f.homeId];
  const gf = home ? f.result.h : f.result.a;
  const ga = home ? f.result.a : f.result.h;
  const score = gf > ga ? 1 : gf < ga ? 0 : 0.5;
  const comp = game.competitions[f.compId];
  let d = (score - expectedScore(game, club, opp, home)) * 5 * (comp.type === 'league' ? 1 : 0.7);
  // Knocked out of the cup by a much smaller club.
  if (comp.type === 'cup' && f.result.winner && f.result.winner !== club.id && opp.reputation < club.reputation - 12) d -= 3;
  b.results = clamp(b.results * 0.9 + d, -20, 15);
  if (comp.type === 'league') b.table = tableScore(game, club).v;
  const s = m.stints.at(-1);
  if (s && s.clubId === club.id) {
    s.p++;
    if (score === 1) s.w++; else if (score === 0) s.l++; else s.d++;
  }
  checkSack(game);
}

function checkSack(game) {
  const m = game.manager;
  const b = m.board;
  if (m.sacked || game.season.phase !== 'season') return;
  const club = game.clubs[game.userClubId];
  const t = tableScore(game, club);
  if (t.played < 8 || (m.stints.at(-1)?.p ?? 99) < 8) return;
  const c = confidence(game);
  // The board always warns once before it acts.
  if (c < SACK_AT && b.warned) {
    sack(game, `after a poor run (${t.pos}. in the league, the target was to ${m.target.text.toLowerCase()})`);
    return;
  }
  if (c < ULTIMATUM_AT && !b.warned) {
    b.warned = true;
    addNews(game, 'The board has issued an ultimatum: results must improve quickly, or you will be sacked.', 'board');
  } else if (c >= ULTIMATUM_AT + 10) b.warned = false;
}

function sack(game, why, reason = 'sacked') {
  const m = game.manager;
  const club = game.clubs[game.userClubId];
  m.reputation = clamp(m.reputation - (reason === 'sacked' ? 6 : 2), 1, 100);
  m.sacked = { clubId: club.id, clubName: club.name, day: game.day, reason, why };
  closeStint(game, reason);
  addNews(game, reason === 'sacked' ? `${m.name} has been sacked by ${club.name} ${why}.` : `${m.name} has resigned as manager of ${club.name}.`, 'board');
  emergencyOffers(game);
  nationalOffersWhenFree(game);
}

export function resign(game) {
  const m = game.manager;
  if (m.sacked) return { ok: false, message: 'You are not employed.' };
  if (pendingMatch(game)) return { ok: false, message: 'Play today\'s match first.' };
  sack(game, '', 'resigned');
  return { ok: true, message: 'You have resigned. Choose your next club.' };
}

// Out of work: a few clubs a little below the manager's level are always
// interested, so the career goes on.
function emergencyOffers(game) {
  const m = game.manager;
  const rng = rngFor(game, 'sacked');
  const have = new Set(m.offers.map((o) => o.clubId));
  const aim = m.reputation - 3;
  const pool = Object.values(game.clubs).filter((c) => c.id !== m.sacked.clubId && !have.has(c.id))
    .sort((a, b) => Math.abs(a.reputation - aim) - Math.abs(b.reputation - aim)).slice(0, 10);
  for (const o of m.offers) o.expires = Math.max(o.expires, game.day + 3650);
  while (m.offers.length < 3 && pool.length) {
    const c = pool.splice(rng.int(0, pool.length - 1), 1)[0];
    m.offers.push({ clubId: c.id, day: game.day, expires: game.day + 3650 });
    if (!game.jobs.some((j) => j.clubId === c.id)) game.jobs.push({ clubId: c.id, day: game.day, expires: game.day + 3650, why: 'looking for a manager' });
  }
}

// ---- the job market ----

// How keen a club is on the user, from his reputation against theirs.
export function jobInterest(mgrRep, clubRep) {
  const diff = mgrRep - clubRep;
  if (diff < -15) return 0;
  return clamp(0.45 - Math.abs(diff - 5) * 0.025, 0.05, 0.45);
}

function openVacancy(game, club, why, rng, expires = game.day + VACANCY_DAYS) {
  const m = game.manager;
  if (club.id === game.userClubId || game.jobs.some((j) => j.clubId === club.id)) return;
  game.jobs.push({ clubId: club.id, day: game.day, expires, why });
  const gone = club.manager?.name;
  club.manager = null; // a caretaker until someone is appointed
  const user = game.clubs[game.userClubId];
  const offered = rng.chance(jobInterest(m.reputation, club.reputation));
  if (offered) {
    m.offers.push({ clubId: club.id, day: game.day, expires: m.sacked ? game.day + 3650 : game.day + OFFER_DAYS });
    addNews(game, `Job offer: ${club.name} (${game.competitions[club.compId].name}) want you as their new manager. See My Career.`, 'job');
  } else if (club.nationId === user.nationId) {
    const moved = why === 'who has moved on';
    addNews(game, gone
      ? (moved ? `${gone} has left ${club.name}.` : `${club.name} have sacked ${gone} ${why}.`)
      : `${club.name} have parted company with their manager ${why}.`, 'job');
  }
}

// A vacancy nobody (the user) took: the club appoints someone.
function appointManager(game, clubId) {
  const club = game.clubs[clubId];
  if (!club || clubId === game.userClubId || club.manager) return;
  club.manager = makeManager(game, club.nationId, `${clubId}:${game.day}`);
  if (club.nationId === game.clubs[game.userClubId]?.nationId) {
    addNews(game, `${club.name} have appointed ${club.manager.name} as their new manager.`, 'job');
  }
}

export function applyForJob(game, clubId) {
  const m = game.manager;
  const job = game.jobs.find((j) => j.clubId === clubId);
  const club = game.clubs[clubId];
  if (!job || !club) return { ok: false, message: 'That job is no longer available.' };
  if (m.offers.some((o) => o.clubId === clubId)) return { ok: false, message: `${club.name} have already offered you the job.` };
  if (job.applied) return { ok: false, message: `You have already applied to ${club.name}.` };
  job.applied = true;
  const diff = m.reputation - club.reputation;
  const chance = diff >= 0 ? 0.8 : diff >= -6 ? 0.5 : diff >= -12 ? 0.2 : 0;
  if (!rngFor(game, `apply:${clubId}`).chance(chance)) {
    return { ok: false, message: chance ? `${club.name} have chosen another candidate.` : `${club.name} are looking for a more experienced manager.` };
  }
  m.offers.push({ clubId, day: game.day, expires: m.sacked ? game.day + 3650 : game.day + OFFER_DAYS });
  return { ok: true, message: `${club.name} offer you the job.` };
}

export function declineOffer(game, clubId) {
  const m = game.manager;
  if (m.sacked && m.offers.length <= 1) return { ok: false, message: 'Keep at least one offer while you are out of work.' };
  m.offers = m.offers.filter((o) => o.clubId !== clubId);
  return { ok: true, message: `You turned down ${game.clubs[clubId].name}.` };
}

const pendingMatch = (game) => Object.values(game.fixtures).some((f) => f.day === game.day && !f.result
  && (f.homeId === game.userClubId || f.awayId === game.userClubId));

// The old club goes to the AI: the academy joins its squad, the user's staff,
// plans and moods go. Scouting knowledge stays with the manager.
function leaveClub(game, club) {
  // The best academy prospects join the first team (up to 30 players); the rest leave.
  const academy = (club.youth || []).map((id) => game.players[id]).filter(Boolean).sort((a, b) => b.potential - a.potential);
  for (const p of academy) {
    if (club.squad.length < 30) {
      p.number = freeNumber(game, club);
      club.squad.push(p.id);
    } else delete game.players[p.id];
  }
  club.youth = [];
  for (const p of Object.values(game.players)) {
    if (p.loan && p.loan.parentId === club.id) p.loan.academy = false;
  }
  for (const id of club.squad) {
    const p = game.players[id];
    delete p.mood;
    delete p.train;
    p.loanListed = null;
    p.listed = false;
  }
  if (club.partnerId) {
    if (game.clubs[club.partnerId]) game.clubs[club.partnerId].bTeamOf = null;
    club.partnerId = null;
  }
  const reports = club.scouting?.reports || {};
  delete club.staff;
  delete club.training;
  delete club.scouting;
  club.lineup = autoLineup(game, club);
  club.manager = makeManager(game, club.nationId, `${club.id}:${game.day}`);
  game.offers = [];
  return reports;
}

function joinClub(game, club, reports) {
  const m = game.manager;
  game.userClubId = club.id;
  club.manager = null;
  club.scouting = { level: 1, assignments: [], reports };
  club.training = defaultTraining();
  delete club.staff;
  initUserStaff(game);
  club.youth = club.youth || [];
  startAcademy(game);
  m.target = targetFor(game, club);
  // Taking over mid-season, the manager is judged from where he found the team.
  const now = tableScore(game, club);
  if (now.played && now.pos > m.target.maxPos) m.target = { ...m.target, text: `Improve on ${now.pos}. place`, maxPos: now.pos };
  m.board = { standing: HONEYMOON, results: 0, table: 0, finance: 0, warned: false, inheritedDebt: Math.max(0, -club.budget) };
  m.board.table = tableScore(game, club).v;
  openStint(game, club);
}

export function takeJob(game, clubId) {
  const m = game.manager;
  const club = game.clubs[clubId];
  if (!club || !m.offers.some((o) => o.clubId === clubId)) return { ok: false, message: 'There is no offer from that club.' };
  if (pendingMatch(game)) return { ok: false, message: 'Play today\'s match first.' };
  const old = game.clubs[game.userClubId];
  if (!m.sacked) {
    closeStint(game, 'left');
    addNews(game, `${old.name} are looking for a new manager after ${m.name} left for ${club.name}.`, 'job');
  }
  const reports = leaveClub(game, old);
  joinClub(game, club, reports);
  m.offers = [];
  m.sacked = null;
  game.jobs = game.jobs.filter((j) => j.clubId !== clubId);
  addNews(game, `${m.name} has been appointed manager of ${club.name}. The board expects you to: ${m.target.text.toLowerCase()}.`, 'board');
  return { ok: true, message: `You are the new manager of ${club.name}.` };
}

// ---- daily and monthly ----

export function boardDay(game) {
  const m = game.manager;
  if (!m.board || !game.clubs[game.userClubId]) return;
  m.offers = m.offers.filter((o) => o.expires >= game.day);
  for (const j of game.jobs) if (j.expires < game.day) appointManager(game, j.clubId);
  game.jobs = game.jobs.filter((j) => j.expires >= game.day);
  const date = new Date(game.day * DAY_MS);
  if (date.getUTCDate() !== 1 || game.season.phase !== 'season') return;
  // Debt worries the board, and it can act on it straight away.
  const club = game.clubs[game.userClubId];
  const debt = newDebt(game, club);
  m.board.finance = debt > 0 ? -clamp((debt / expectedWageBill(game, club)) * 40, 2, 20) : 0;
  checkSack(game);
}

// Debt beyond what the manager inherited when he took over (the board expects
// that to be paid off gradually: it halves every season).
const newDebt = (game, club) => Math.max(0, -club.budget - (game.manager.board.inheritedDebt || 0));

// AI boards judge their manager after every league match, so a sacking can
// come at any point of the season: well below target after 8+ matches, about
// a 3% chance per match (the same rate as 12% a month).
export function aiBoardAfterMatch(game, f) {
  const comp = game.competitions[f.compId];
  if (comp.type !== 'league' || game.season.phase !== 'season') return;
  let rows = null;
  for (const id of [f.homeId, f.awayId]) {
    const c = game.clubs[id];
    if (id === game.userClubId || c.sackedYear === game.season.year) continue;
    rows = rows || sortedTable(game, comp);
    const i = rows.findIndex((r) => r.clubId === id);
    if (rows[i].p < 8 || boardTarget(game, c).maxPos - (i + 1) > -5) continue;
    const rng = rngFor(game, `ai:${id}`);
    if (rng.chance(0.031)) {
      c.sackedYear = game.season.year;
      openVacancy(game, c, `after a poor run (${i + 1}. in the ${comp.name})`, rng);
    }
  }
}

// ---- end of season ----

const TROPHY_REP = { league1: 8, league2: 3, cup: 3, continental: 10 };

// Called in endSeason before reputations, promotion and relegation change.
// Returns the AI clubs that will look for a new manager in the summer.
export function seasonEndBoard(game, summary, finalTables, trophies) {
  const m = game.manager;
  const b = m.board;
  const club = game.clubs[game.userClubId];
  const comp = game.competitions[club.compId];
  const rows = finalTables[comp.id];
  const pos = summary.user.pos;
  const t = m.target?.clubId === club.id ? m.target : targetFor(game, club);
  const gap = t.maxPos - pos;
  const relegated = !!comp.relegate && pos > rows.length - comp.relegate;
  const promoted = !!comp.promote && pos <= comp.promote;
  const expectedDown = t.maxPos >= rows.length - (comp.relegate || 0); // the target was to avoid relegation
  let score = gap >= 0 ? 6 + Math.min(10, gap * 1.5) : Math.max(-30, gap * 4);
  let rep = clamp(gap * 0.7, -6, 6) + (club.reputation - m.reputation) * 0.08;
  for (const tr of trophies) {
    const c = game.competitions[tr.compId];
    const key = c.type === 'league' ? `league${c.tier}` : c.type;
    score += c.type === 'league' && c.tier === 1 ? 10 : 6;
    rep += TROPHY_REP[key] || 3;
  }
  if (promoted) { score += 6; rep += 4; }
  if (relegated) { score -= expectedDown ? 6 : 15; rep -= 5; }
  if (newDebt(game, club) > 0) score -= 5;
  b.inheritedDebt = Math.min(Math.max(0, -club.budget), (b.inheritedDebt || 0) * 0.5);
  b.standing = clamp(b.standing * 0.5 + score, -25, 30);
  b.table = 0;
  b.results *= 0.5; // the season as a whole counts now, not the last few weeks
  m.reputation = clamp(Math.round(m.reputation + rep), 1, 100);
  const conf = confidence(game);
  const met = gap >= 0;
  summary.user.board = { target: t.text, met, confidence: conf };
  if (conf < SACK_AT || (relegated && !expectedDown && conf < 45)) {
    sack(game, `after finishing ${pos}. (the target was to ${t.text.toLowerCase()})`);
    summary.user.sacked = true;
  } else {
    addNews(game, met
      ? `The board is ${gap >= 3 || trophies.length ? 'delighted' : 'satisfied'} with the season: ${pos}. place (target: ${t.text.toLowerCase()}).`
      : `The board is disappointed: ${pos}. place missed the target (${t.text.toLowerCase()}). Confidence ${conf}/100.`, 'board');
  }

  // AI clubs judge their managers too.
  const rng = rngFor(game, 'summer');
  const leaving = [];
  for (const [compId, table] of Object.entries(finalTables)) {
    const lc = game.competitions[compId];
    table.forEach((r, i) => {
      const c = game.clubs[r.clubId];
      if (c.id === game.userClubId) return;
      const ct = boardTarget(game, c);
      const g = ct.maxPos - (i + 1);
      const down = !!lc.relegate && i + 1 > table.length - lc.relegate && ct.maxPos < table.length - lc.relegate;
      const p = down ? 0.65 : g <= -5 ? 0.45 : g <= -3 ? 0.2 : 0.04;
      if (rng.chance(p)) leaving.push({ clubId: c.id, why: down ? 'after relegation' : g < 0 ? `after finishing ${i + 1}.` : 'who has moved on' });
    });
  }
  return leaving;
}

// After the new season has been set up: last season's vacancies close, the
// summer's open (until two weeks into the season).
export function newSeasonBoard(game, leaving) {
  const m = game.manager;
  const club = game.clubs[game.userClubId];
  const rng = rngFor(game, 'vacancies');
  const keep = m.sacked ? m.offers : [];
  m.offers = keep;
  for (const j of game.jobs) if (!keep.some((o) => o.clubId === j.clubId)) appointManager(game, j.clubId);
  game.jobs = game.jobs.filter((j) => keep.some((o) => o.clubId === j.clubId));
  for (const c of Object.values(game.clubs)) delete c.sackedYear;
  for (const l of leaving) openVacancy(game, game.clubs[l.clubId], l.why, rng, game.season.start + 14);
  m.target = targetFor(game, club);
  m.board.warned = false;
}

// Why the board feels the way it does, biggest first.
export function boardReasons(game) {
  const m = game.manager;
  const b = m.board;
  if (!b) return [];
  const club = game.clubs[game.userClubId];
  const t = tableScore(game, club);
  const first = m.stints.at(-1)?.from === game.season.year;
  const out = [];
  const add = (v, pos, neg) => { if (Math.abs(v) >= 1.5) out.push({ v: Math.round(v), text: v > 0 ? pos : neg }); };
  add(b.standing, first ? 'You are new here: the board gives you time' : 'Trust earned in earlier seasons', 'Earlier seasons disappointed the board');
  add(b.results, 'Recent results are better than expected', 'Recent results are worse than expected');
  add(b.table, `League position (${t.pos}.) meets the target`, `League position (${t.pos}.) is below the target`);
  add(b.finance, '', 'The club is in debt');
  return out.sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
}

// Migration for older saves.
export function ensureManager(game) {
  const club = game.clubs[game.userClubId];
  if (!club || game.manager.board) return;
  const h = game.manager.history || [];
  initManager(game, club, { standing: h.length ? 8 : HONEYMOON });
  const s = game.manager.stints[0];
  s.from = game.manager.startYear ?? game.season.year;
  for (const r of h) { s.p += r.p; s.w += r.w; s.d += r.d; s.l += r.l; }
  game.manager.reputation = clamp(Math.round(game.manager.reputation + h.reduce((a, r) => a + (r.trophies?.length || 0) * 3, 0)), 1, 100);
}
