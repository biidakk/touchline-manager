// National teams (senior and U21) and the Nations Championship.
//
// All six nations play each other home and away each season, in five
// international breaks of two Thursdays (no club plays on Thursdays). Before
// each break the best available players of each nationality are called up;
// the U21 team takes the best players aged 21 or under who aren't in the
// senior squad. National teams are AI-managed.

import { FORMATION_NAMES } from './data.js';
import { autoLineup, isAvailable } from './ai.js';
import { lineupSkill } from './ratings.js';
import { createMatch, runToEnd } from './engine.js';
import { newFixture, roundRobin } from './calendar.js';
import { addNews } from './season.js';
import { matchLoad } from './training.js';
import { repairLineup } from './lineup.js';
import { nationalMatchRecords } from './records.js';

export const NAT_IDS = { senior: 'NAT', u21: 'NAT21' };
const SQUAD_SHAPE = { G: 3, D: 7, M: 7, F: 6 }; // 23 players
const BREAK_WEEKS = [1, 2, 7, 8, 14, 15, 21, 22, 27, 28]; // weekend indices; matches on the following Thursday

export const teamOf = (game, id) => game.clubs[id] || game.national?.teams[id];
export const isNational = (game, f) => game.competitions[f.compId]?.type === 'national';

export function createNational(game) {
  game.national = { teams: {} };
  for (const level of ['senior', 'u21']) {
    const compId = NAT_IDS[level];
    game.competitions[compId] = {
      id: compId, type: 'national', level, nationId: null,
      name: level === 'senior' ? 'Nations Championship' : 'U21 Nations Championship',
      clubIds: [], table: {}, fixtureIds: [], history: [],
    };
    for (const n of Object.values(game.nations)) {
      const id = `NT-${n.id}${level === 'u21' ? '-21' : ''}`;
      const name = level === 'senior' ? n.name : `${n.name} U21`;
      game.national.teams[id] = {
        id, nationId: n.id, level, national: true, name, short: name, compId,
        colors: n.kit ? { ...n.kit, pattern: 'plain' } : { primary: n.flag.colors[0], secondary: n.flag.colors[1], pattern: 'plain' },
        crest: { shape: 'shield', pattern: 'band', c1: n.kit?.primary || n.flag.colors[0], c2: n.kit?.secondary || n.flag.colors[1], initials: n.id },
        squad: [], lineup: null, tactics: { formation: '4-4-2', intent: 50, style: 'normal' }, teamwork: 55, window: -1,
      };
      game.competitions[compId].clubIds.push(id);
    }
  }
}

const emptyRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

export function initNational(game, dates, rng) {
  if (!game.national) return;
  const days = BREAK_WEEKS.filter((i) => i < dates.weekends.length).map((i) => dates.weekends[i] + 5);
  for (const compId of Object.values(NAT_IDS)) {
    const comp = game.competitions[compId];
    comp.table = {};
    comp.fixtureIds = [];
    for (const id of comp.clubIds) comp.table[id] = emptyRow();
    roundRobin(comp.clubIds, rng).forEach((pairs, k) => {
      if (k >= days.length) return;
      for (const [h, a] of pairs) {
        comp.fixtureIds.push(newFixture(game, compId, days[k], k + 1, h, a, { window: Math.floor(k / 2) }).id);
      }
    });
  }
  for (const t of Object.values(game.national.teams)) { t.squad = []; t.lineup = null; t.window = -1; }
}

// ---- call-ups ----

function pickSquad(game, candidates) {
  const byPos = { G: [], D: [], M: [], F: [] };
  for (const p of candidates.sort((a, b) => b.skill - a.skill)) byPos[p.pos].push(p);
  const squad = [];
  for (const [pos, n] of Object.entries(SQUAD_SHAPE)) squad.push(...byPos[pos].slice(0, n));
  // Short of a position? Fill with the best of the rest.
  for (const p of candidates) {
    if (squad.length >= 23) break;
    if (!squad.includes(p)) squad.push(p);
  }
  return squad.map((p) => p.id);
}

// Squad numbers for the break: the first-choice keeper wears 1, then
// defenders, midfielders, forwards and the other keepers.
function numberSquad(game, team) {
  const ps = team.squad.map((id) => game.players[id]).filter(Boolean).sort((a, b) => b.skill - a.skill);
  const gks = ps.filter((p) => p.pos === 'G');
  const order = [...gks.slice(0, 1), ...['D', 'M', 'F'].flatMap((pos) => ps.filter((p) => p.pos === pos)), ...gks.slice(1)];
  team.numbers = Object.fromEntries(order.map((p, i) => [p.id, i + 1]));
}

function bestLineup(game, team) {
  let best = null;
  for (const f of FORMATION_NAMES) {
    const l = autoLineup(game, team, f);
    const s = lineupSkill(game, l) - (l.slots.filter(Boolean).length < 11 ? 50 : 0);
    if (!best || s > best.s) best = { s, l, f };
  }
  team.tactics.formation = best.f;
  team.lineup = best.l;
}

// The user's national team: his picks (still available and eligible) first,
// the rest filled automatically up to 23.
function userSquad(game, team, candidates) {
  const ok = new Map(candidates.map((p) => [p.id, p]));
  const picks = (team.picks || []).filter((id) => ok.has(id)).slice(0, 23);
  if (!picks.length) return pickSquad(game, candidates);
  const rest = pickSquad(game, candidates.filter((p) => !picks.includes(p.id))).filter((id) => !picks.includes(id));
  return [...picks, ...rest.slice(0, 23 - picks.length)];
}

const userTeamId = (game) => game.manager?.national?.teamId || null;

// Everyone eligible for a national team (available or not): seniors from
// first-team squads, U21s aged 21 or under (academies included).
export function nationalCandidates(game, team) {
  const year = game.season.year;
  const out = [];
  for (const club of Object.values(game.clubs)) {
    const ids = team.level === 'senior' ? club.squad : [...club.squad, ...(club.youth || [])];
    for (const id of ids) {
      const p = game.players[id];
      if (p && p.nationId === team.nationId && (team.level === 'senior' || year - p.birthYear <= 21)) out.push(p);
    }
  }
  return out;
}

// The 23 an AI coach would pick today.
export function suggestSquad(game, team) {
  return pickSquad(game, nationalCandidates(game, team).filter((p) => isAvailable(p)));
}

export function callUps(game, window) {
  const year = game.season.year;
  const pool = {};
  for (const club of Object.values(game.clubs)) {
    for (const id of [...club.squad, ...(club.youth || [])]) {
      const p = game.players[id];
      if (!p || !isAvailable(p)) continue;
      (pool[p.nationId] = pool[p.nationId] || []).push(p);
    }
  }
  const user = game.clubs[game.userClubId];
  const mine = { senior: [], u21: [] };
  for (const n of Object.values(game.nations)) {
    const all = pool[n.id] || [];
    const senior = game.national.teams[`NT-${n.id}`];
    const u21 = game.national.teams[`NT-${n.id}-21`];
    // Seniors come from first-team squads (academy players can only make the U21s).
    const seniorPool = all.filter((p) => game.clubs[p.clubId].squad.includes(p.id));
    senior.squad = senior.id === userTeamId(game) ? userSquad(game, senior, seniorPool) : pickSquad(game, seniorPool);
    const u21Pool = all.filter((p) => year - p.birthYear <= 21 && !senior.squad.includes(p.id));
    u21.squad = u21.id === userTeamId(game) ? userSquad(game, u21, u21Pool) : pickSquad(game, u21Pool);
    for (const [team, key] of [[senior, 'senior'], [u21, 'u21']]) {
      team.window = window;
      numberSquad(game, team);
      // The user's team plays his formation; the others pick their best.
      if (team.id === userTeamId(game)) team.lineup = autoLineup(game, team, team.tactics.formation);
      else bestLineup(game, team);
      if (user) {
        for (const id of team.squad) {
          if (game.players[id].clubId === user.id) mine[key].push(`${game.players[id].last} (${team.name})`);
        }
      }
    }
  }
  if (mine.senior.length || mine.u21.length) {
    const parts = [];
    if (mine.senior.length) parts.push(mine.senior.join(', '));
    if (mine.u21.length) parts.push(`U21: ${mine.u21.join(', ')}`);
    addNews(game, `International call-ups: ${parts.join('; ')}.`, 'national');
  }
}

// ---- playing ----

// Squads for the break and lineups for this match. The user's lineup is kept
// (with injured or departed players replaced); the others are re-picked.
export function prepareNational(game, f) {
  const home = game.national.teams[f.homeId];
  const away = game.national.teams[f.awayId];
  if (home.window !== f.window || away.window !== f.window) callUps(game, f.window);
  for (const t of [home, away]) {
    // Drop anyone who has left football since the call-up.
    t.squad = t.squad.filter((id) => game.players[id]);
    if (t.id === userTeamId(game)) t.lineup = repairLineup(game, t, t.lineup).lineup;
    else t.lineup = autoLineup(game, t, t.tactics.formation);
  }
  return [home, away];
}

// The user's picks changed during a break: the squad follows at once.
export function refreshUserSquad(game) {
  const team = game.national?.teams[userTeamId(game)];
  if (!team || team.window < 0) return;
  const year = game.season.year;
  const all = [];
  for (const club of Object.values(game.clubs)) {
    for (const id of [...club.squad, ...(club.youth || [])]) {
      const p = game.players[id];
      if (p && p.nationId === team.nationId && isAvailable(p)) all.push(p);
    }
  }
  const senior = game.national.teams[`NT-${team.nationId}`];
  const u21 = game.national.teams[`NT-${team.nationId}-21`];
  if (team === senior) {
    senior.squad = userSquad(game, senior, all.filter((p) => game.clubs[p.clubId].squad.includes(p.id)));
    // Nobody plays for both teams on the same night.
    if (u21.squad.some((id) => senior.squad.includes(id))) {
      u21.squad = pickSquad(game, all.filter((p) => year - p.birthYear <= 21 && !senior.squad.includes(p.id)));
      numberSquad(game, u21);
      bestLineup(game, u21);
    }
  } else {
    u21.squad = userSquad(game, u21, all.filter((p) => year - p.birthYear <= 21 && !senior.squad.includes(p.id)));
  }
  numberSquad(game, team);
  team.lineup = autoLineup(game, team, team.tactics.formation);
}

export function playNationalFixture(game, f) {
  const [home, away] = prepareNational(game, f);
  const m = runToEnd(game, createMatch(game, f, { homeClub: home, awayClub: away, keepEvents: false }));
  applyNationalResult(game, f, m);
  return m;
}

export function applyNationalResult(game, f, m) {
  const comp = game.competitions[f.compId];
  const [hs, as] = m.sides;
  const evs = m.events;
  f.result = {
    h: hs.goals,
    a: as.goals,
    goals: evs.filter((e) => e.type === 'goal').map((e) => ({ side: e.side, playerId: e.playerId, minute: e.minute,
      added: e.added, penalty: e.penalty || undefined })),
    cards: evs.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => ({ side: e.side, playerId: e.playerId,
      minute: e.minute, red: e.type === 'red' })),
  };
  const mine = f.homeId === userTeamId(game) || f.awayId === userTeamId(game);
  if (mine) {
    f.result.stats = [hs.stats, as.stats];
    f.result.events = evs.filter((e) => e.type !== 'kickoff');
    f.result.lineups = m.sides.map((s) => ({ formation: s.formation, played: s.played, ratings: s.rating }));
  }
  const senior = comp.level === 'senior';
  const user = game.clubs[game.userClubId];
  m.sides.forEach((side, i) => {
    for (const id of side.played) {
      const p = game.players[id];
      p.intl = p.intl || { caps: 0, goals: 0, u21Caps: 0, u21Goals: 0 };
      if (senior) p.intl.caps++; else p.intl.u21Caps++;
      p.energy = Math.round(side.energy[id]);
      matchLoad(p);
    }
    for (const g of f.result.goals.filter((x) => x.side === i)) {
      const p = game.players[g.playerId];
      if (senior) p.intl.goals++; else p.intl.u21Goals++;
      if (user && p.clubId === user.id) addNews(game, `${p.first} ${p.last} scored for ${game.national.teams[side.clubId].name}.`, 'national');
    }
    for (const inj of side.injured) {
      const p = game.players[inj.id];
      p.injuryDays = Math.max(p.injuryDays, inj.days);
      if (user && p.clubId === user.id) addNews(game, `${p.first} ${p.last} was injured on international duty: out for ${inj.days} days.`, 'injury');
    }
  });
  nationalMatchRecords(game, f, m, comp);
  const rh = comp.table[f.homeId];
  const ra = comp.table[f.awayId];
  const { h, a } = f.result;
  rh.p++; ra.p++;
  rh.gf += h; rh.ga += a; ra.gf += a; ra.ga += h;
  const rec = (r, x) => { r.form.push(x); if (r.form.length > 6) r.form.shift(); };
  if (h > a) { rh.w++; ra.l++; rh.pts += 3; rec(rh, 'W'); rec(ra, 'L'); }
  else if (h < a) { ra.w++; rh.l++; ra.pts += 3; rec(rh, 'L'); rec(ra, 'W'); }
  else { rh.d++; ra.d++; rh.pts++; ra.pts++; rec(rh, 'D'); rec(ra, 'D'); }
  // Your country's senior results (and your own team's) make the news.
  if (user) {
    const mineId = `NT-${user.nationId}`;
    if (mine || (senior && (f.homeId === mineId || f.awayId === mineId))) {
      addNews(game, `International: ${game.national.teams[f.homeId].name} ${h}:${a} ${game.national.teams[f.awayId].name}.`, 'national');
    }
  }
}

export function nationalTable(game, comp) {
  return Object.entries(comp.table)
    .map(([clubId, r]) => ({ clubId, ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf
      || game.national.teams[a.clubId].name.localeCompare(game.national.teams[b.clubId].name));
}

// ---- season end ----

export function nationalScorers(game, compId) {
  const comp = game.competitions[compId];
  const counts = {};
  for (const id of comp.fixtureIds) {
    const f = game.fixtures[id];
    if (!f?.result) continue;
    for (const g of f.result.goals) counts[g.playerId] = (counts[g.playerId] || 0) + 1;
  }
  return Object.entries(counts).map(([id, goals]) => ({ id, goals })).sort((a, b) => b.goals - a.goals);
}

export function closeNational(game, year) {
  if (!game.national) return [];
  const out = [];
  for (const compId of Object.values(NAT_IDS)) {
    const comp = game.competitions[compId];
    if (!comp.fixtureIds.length) continue;
    const rows = nationalTable(game, comp);
    const top = nationalScorers(game, compId)[0];
    const p = top ? game.players[top.id] : null;
    const entry = {
      year, championId: rows[0].clubId,
      table: rows.map((r) => ({ teamId: r.clubId, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: r.pts })),
      topScorer: p ? { name: `${p.first} ${p.last}`, nationId: p.nationId, goals: top.goals } : null,
    };
    comp.history.push(entry);
    out.push({ compId, name: comp.name, championId: entry.championId });
    addNews(game, `${game.national.teams[entry.championId].name} win the ${comp.name}.`, 'national');
  }
  return out;
}
