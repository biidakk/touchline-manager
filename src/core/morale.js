// Personalities and morale.
//
// Every player has a personality. Players at the user's club also have a
// morale made of a few parts, each with a reason the player can explain:
//   play     playing time compared with what his place in the squad promises
//   results  how the team is doing
//   wage     his wage compared with what a player like him earns
//   status   club ambition, captaincy and league position
//   events   one-off moments: signing, new contract, promises, refused requests
// morale = personality base + the parts, 0..100. Play, results and events
// fade over time; wage and status are re-judged on the 1st of every month.
//
// Effects: a few % of match ability, development speed, contract talks,
// transfer requests; temperamental players pick up more cards.

import { Rng, clamp } from './rng.js';
import { FORMATIONS, ROLE_POS } from './data.js';
import { playerWage } from './valuation.js';
import { addNews, sortedTable } from './season.js';
import { DAY_MS } from './calendar.js';
import { mentalOf } from './attributes.js';

export const PERSONALITIES = ['professional', 'ambitious', 'loyal', 'temperamental', 'easygoing'];
export const PERSONALITY_LABEL = {
  professional: 'Professional', ambitious: 'Ambitious', loyal: 'Loyal', temperamental: 'Temperamental', easygoing: 'Easy-going',
};
export const PERSONALITY_INFO = {
  professional: 'Trains well (+10% development) and keeps his head when things go wrong.',
  ambitious: 'Wants to play every week and win things. Unhappy on the bench, at a club below his level or on a low wage.',
  loyal: 'Attached to his club. Rarely asks to leave and accepts a cheaper contract.',
  temperamental: 'Moods swing with results and playing time. Picks up more cards.',
  easygoing: 'Hardly bothered by the bench, but develops a little slower (-5%).',
};
const WEIGHT = { professional: 25, ambitious: 20, loyal: 20, temperamental: 15, easygoing: 20 };
const BASE = { professional: 65, ambitious: 60, loyal: 68, temperamental: 62, easygoing: 68 };
// How strongly each personality reacts to playing time and to results.
const PLAY_MULT = { professional: 1, ambitious: 1.5, loyal: 0.8, temperamental: 1.3, easygoing: 0.55 };
const RESULT_MULT = { professional: 0.8, ambitious: 1.2, loyal: 1, temperamental: 1.8, easygoing: 0.7 };
export const DEV_MULT = { professional: 1.1, ambitious: 1, loyal: 1, temperamental: 0.95, easygoing: 0.95 };

export const PROMISE_MATCHES = 8;
export const PROMISE_STARTS = 4;

export function rollPersonality(rng) {
  return rng.weighted(PERSONALITIES, (k) => WEIGHT[k]);
}

export const personalityOf = (p) => p.personality || 'professional';

export function moraleOf(p) {
  if (!p.mood) return BASE[personalityOf(p)];
  const m = p.mood;
  return Math.round(clamp(BASE[personalityOf(p)] + m.play + m.results + m.wage + m.status + m.events, 0, 100));
}

export const MORALE_LEVELS = [[85, 'Delighted', 'good'], [70, 'Happy', 'good'], [50, 'Content', ''], [35, 'Unsettled', 'warn'], [0, 'Unhappy', 'bad']];
export const moraleLevel = (v) => MORALE_LEVELS.find(([min]) => v >= min);

// Match ability: about -5% when miserable, +4% when delighted. Players
// outside the user's club are neutral.
export const moraleFactor = (p) => (p.mood ? 1 + (moraleOf(p) - 60) * 0.0012 : 1);
// Development speed.
export const moraleDevFactor = (p) => (p.mood ? 0.85 + 0.3 * moraleOf(p) / 100 : 1) * DEV_MULT[personalityOf(p)];

function freshMood(game, p, club, signed) {
  p.mood = { club: club.id, play: 0, results: 0, wage: 0, status: 0, events: signed ? 8 : 0, low: 0 };
  judgeMonthly(game, club, p);
}

// ---- expected role ----

// The place a player can expect in the squad, from his rank among players in
// his position (by skill) against how many play there in the formation.
export function expectedRoles(game, club) {
  const formation = club.lineup?.formation || club.tactics?.formation || '4-4-2';
  const need = { G: 0, D: 0, M: 0, F: 0 };
  for (const [r] of FORMATIONS[formation] || []) need[ROLE_POS[r]]++;
  if (!need.G) Object.assign(need, { G: 1, D: 4, M: 4, F: 2 });
  const year = game.season.year;
  const roles = {};
  for (const pos of ['G', 'D', 'M', 'F']) {
    const ps = club.squad.map((id) => game.players[id]).filter((p) => p && p.pos === pos).sort((a, b) => b.skill - a.skill);
    ps.forEach((p, i) => {
      if (i < need[pos]) roles[p.id] = 'starter';
      else if (pos !== 'G' && i < Math.ceil(need[pos] * 1.6)) roles[p.id] = 'rotation';
      else roles[p.id] = year - p.birthYear <= 20 ? 'prospect' : 'backup';
    });
  }
  return roles;
}
export const ROLE_TEXT = { starter: 'Regular starter', rotation: 'Rotation player', backup: 'Squad player', prospect: 'Young prospect' };
const EXPECT = { starter: 0.75, rotation: 0.4, backup: 0.12, prospect: 0.1 };

// ---- staff hooks (assistant manager) ----

const assistantStars = (game, club) => (club.id === game.userClubId ? club.staff?.assistant?.stars || 0 : 3);
// A good assistant and a captain with leadership keep the dressing room calm:
// bad news hits softer.
function calm(game, club) {
  const cap = game.players[club.lineup?.captainId];
  const ldr = cap && cap.clubId === club.id ? mentalOf(cap, 'ldr', game.season.year) : 50;
  return (1.15 - 0.06 * assistantStars(game, club)) * (1.08 - 0.0016 * ldr);
}

// ---- after each user match ----

export function moraleAfterMatch(game, club, side, won, lost) {
  if (club.id !== game.userClubId) return;
  const roles = expectedRoles(game, club);
  const c = calm(game, club);
  const started = new Set(side.starters || side.played);
  for (const id of club.squad) {
    const p = game.players[id];
    if (!p) continue;
    if (!p.mood || p.mood.club !== club.id) freshMood(game, p, club, p.mood !== undefined);
    const pers = personalityOf(p);
    const m = p.mood;
    // Results.
    const r = won ? 1.6 : lost ? -1.6 : 0;
    m.results = clamp(m.results + r * RESULT_MULT[pers] * (r < 0 ? c : 1), -12, 8);
    // Playing time (injured and suspended players don't hold it against you).
    if (p.injuryDays > 0 && !side.played.includes(id)) continue;
    const playedV = started.has(id) ? 1 : side.played.includes(id) ? 0.5 : 0;
    let d = (playedV - EXPECT[roles[id] || 'backup']) * 6 * PLAY_MULT[pers];
    if (d < 0) d *= c;
    m.play = clamp(m.play + d, -42, 12);
    // A promise of playing time is being watched.
    if (m.promise) {
      m.promise.matches++;
      if (started.has(id)) m.promise.starts++;
      if (m.promise.starts >= PROMISE_STARTS) {
        m.events += 6;
        addNews(game, `${p.first} ${p.last} is pleased: you kept your promise of more playing time.`, 'player');
        delete m.promise;
      } else if (m.promise.matches >= PROMISE_MATCHES) {
        m.events -= 22;
        m.low = 30; // he asks to leave straight away
        addNews(game, `${p.first} ${p.last} is furious: you promised him more playing time and did not keep your word.`, 'player');
        delete m.promise;
      }
    }
  }
}

// ---- monthly judgement: wage and status ----

function clubLevel(game, club) {
  const xi = (club.lineup ? club.lineup.slots : club.squad).filter(Boolean).map((id) => game.players[id]?.skill || 0);
  return xi.reduce((a, b) => a + b, 0) / Math.max(1, xi.length);
}

function judgeMonthly(game, club, p, ctx = {}) {
  const pers = personalityOf(p);
  const year = game.season.year;
  const age = year - p.birthYear;
  const m = p.mood;
  // Wage against the going rate.
  const ratio = p.wage / Math.max(1, playerWage(p, year));
  const wageMult = pers === 'ambitious' ? 1.5 : pers === 'loyal' || pers === 'easygoing' ? 0.6 : 1;
  m.wage = (ratio < 0.7 ? -9 : ratio < 0.85 ? -4 : ratio > 1.25 ? 4 : ratio > 1.1 ? 2 : 0) * (ratio < 0.85 ? wageMult : 1);
  // Status: club ambition, captaincy, league position.
  const level = ctx.level ?? clubLevel(game, club);
  let s = 0;
  if (p.skill >= level + 7 && age >= 21 && age <= 30) s -= pers === 'ambitious' ? 10 : pers === 'loyal' ? 0 : 3;
  if (club.lineup?.captainId === p.id) s += 4;
  if (ctx.rank != null) {
    if (ctx.rank <= 3) s += 3;
    else if (ctx.rank > ctx.size - 3) s -= pers === 'ambitious' ? 5 : 3;
  }
  if (p.loanListed && pers === 'loyal') s -= 2;
  m.status = s;
}

// ---- daily: fading, transfer requests, monthly judgement ----

export function moraleDay(game) {
  const club = game.clubs[game.userClubId];
  if (!club) return;
  const date = new Date(game.day * DAY_MS);
  const monthly = date.getUTCDate() === 1;
  let ctx = null;
  if (monthly) {
    const comp = game.competitions[club.compId];
    const table = comp?.table ? sortedTable(game, comp) : [];
    const rank = table.findIndex((r) => r.clubId === club.id) + 1;
    ctx = { level: clubLevel(game, club), rank: rank && game.season.phase === 'season' && table.some((r) => r.p >= 5) ? rank : null, size: table.length };
  }
  for (const id of club.squad) {
    const p = game.players[id];
    if (!p) continue;
    if (!p.mood || p.mood.club !== club.id) freshMood(game, p, club, p.mood !== undefined);
    const m = p.mood;
    m.play *= 0.98;
    m.results *= 0.97;
    m.events *= 0.99;
    if (monthly) judgeMonthly(game, club, p, ctx);
    // Long unhappiness leads to a transfer request.
    const v = moraleOf(p);
    const limit = personalityOf(p) === 'loyal' ? 22 : 35; // three weeks "Unhappy" (loyal: much worse)
    m.low = v < limit ? m.low + 1 : Math.max(0, m.low - 2);
    if (m.low >= 21 && !m.request && !p.listed && !p.loan && !m.promise && club.squad.length > 16) {
      m.request = game.day;
      addNews(game, `${p.first} ${p.last} has handed in a transfer request (${moraleReasons(game, p)[0]?.text.toLowerCase() || 'he is unhappy'}). Talk to him from his player card.`, 'player');
    }
    if (m.request && p.listed) {
      delete m.request;
      m.events += 10;
      m.low = 0;
    }
  }
}

// Players leaving the user's club lose their mood; youth promoted get one.
export function clearMood(p) { delete p.mood; }

// ---- the user's options ----

export function promisePlayingTime(game, playerId) {
  const p = game.players[playerId];
  const m = p?.mood;
  if (!m) return { ok: false, message: 'He has nothing to discuss.' };
  if (m.promise) return { ok: false, message: 'You have already promised him more playing time.' };
  if (m.promised === game.season.year) return { ok: false, message: 'He no longer believes your promises this season.' };
  m.promise = { matches: 0, starts: 0 };
  m.promised = game.season.year;
  m.events += 12;
  m.low = 0;
  delete m.request;
  return { ok: true, message: `${p.last} accepts: he expects to start ${PROMISE_STARTS} of the next ${PROMISE_MATCHES} matches.` };
}

export function refuseRequest(game, playerId) {
  const p = game.players[playerId];
  const m = p?.mood;
  if (!m?.request) return { ok: false, message: 'He has not asked to leave.' };
  delete m.request;
  m.events -= personalityOf(p) === 'temperamental' ? 16 : 10;
  m.low = 0;
  const club = game.clubs[game.userClubId];
  if (personalityOf(p) === 'temperamental') club.teamwork = Math.max(30, (club.teamwork ?? 60) - 3);
  return { ok: true, message: `${p.last} is told he is staying. He is not happy about it.` };
}

// A short pep talk: helps a little, once a month per player.
export function encourage(game, playerId) {
  const p = game.players[playerId];
  const m = p?.mood;
  if (!m) return { ok: false, message: 'He has nothing to discuss.' };
  const month = Math.floor(game.day / 30);
  if (m.talked === month) return { ok: false, message: 'You spoke to him recently.' };
  m.talked = month;
  const club = game.clubs[game.userClubId];
  const gain = 2 + assistantStars(game, club) * 0.6 + (personalityOf(p) === 'temperamental' ? 2 : 0);
  m.events += gain;
  return { ok: true, message: `${p.last} appreciates the talk (morale +${Math.round(gain)}).` };
}

// Contract talks: unhappy players won't sign; personality changes the price.
export function contractMood(game, p) {
  if (p.mood && moraleOf(p) < 35) return { ok: false, reason: `${p.first} ${p.last} is unhappy and refuses to discuss a new contract.` };
  const pers = personalityOf(p);
  return { ok: true, wageMult: pers === 'ambitious' ? 1.1 : pers === 'loyal' ? 0.92 : 1 };
}

export function onContractSigned(p) {
  if (p.mood) p.mood.events += 6;
}

// The reasons behind a player's mood, biggest first.
export function moraleReasons(game, p) {
  if (!p.mood) return [];
  const m = p.mood;
  const out = [];
  const add = (v, pos, neg) => { if (Math.abs(v) >= 1.5) out.push({ v: Math.round(v), text: v > 0 ? pos : neg }); };
  add(m.play, 'Happy with his playing time', 'Wants more playing time');
  add(m.results, 'Enjoying the results', 'Frustrated by the results');
  add(m.wage, 'Well paid', 'Feels underpaid');
  add(m.status, 'Proud of his role and the club', 'Feels the club lacks ambition');
  add(m.events, 'Recent good news', 'Still upset about a recent decision');
  return out.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
}

export function squadMorale(game, club) {
  const ps = club.squad.map((id) => game.players[id]).filter(Boolean);
  return ps.length ? ps.reduce((s, p) => s + moraleOf(p), 0) / ps.length : 60;
}

// New season: results and promises start over; feelings fade a lot.
export function seasonEndMorale(game) {
  const club = game.clubs[game.userClubId];
  for (const id of club?.squad || []) {
    const m = game.players[id]?.mood;
    if (!m) continue;
    m.results = 0;
    m.play *= 0.4;
    m.events *= 0.5;
    delete m.promise;
  }
}

// Migration / new careers: personalities for everyone, moods for the user's squad.
export function ensurePersonalities(game, seed = 777) {
  const rng = new Rng({ s: seed });
  for (const p of Object.values(game.players)) if (!p.personality) p.personality = rollPersonality(rng);
  const club = game.clubs[game.userClubId];
  for (const id of club?.squad || []) {
    const p = game.players[id];
    if (p && !p.mood) freshMood(game, p, club, false);
  }
}
