// National teams (senior and U21): the Nations League, the Euro qualifiers
// and the finals (Euro and U21 Euro).
//
// Every European country with enough players has a senior and an U21 team.
// The season's internationals are played in five breaks of two Thursdays (no
// club plays on Thursdays). Before each break the best available players of
// each nationality are called up; the U21 team takes the best players aged 21
// or under who aren't in the senior squad. National teams are AI-managed
// (unless the user manages one, see nationaljob.js).
//
// The cycle, by the summer a season ends in:
// - Euro (16 teams) every four years (2028, 2032, ...), U21 Euro every odd
//   year (2027, 2029, ...). In that season the qualifiers are played in
//   groups of about six; the hosts qualify automatically.
// - The other seasons: the Nations League, groups of about five by strength
//   (League A the strongest), with a final between the League A group winners.
// The finals are played in June, after the club season: groups of four, then
// quarter-finals, semi-finals and the final (one match, extra time and
// penalties). The club season is only over when they are.

import { FORMATION_NAMES } from './data.js';
import { autoLineup, isAvailable } from './ai.js';
import { lineupSkill } from './ratings.js';
import { createMatch, runToEnd, winnerSide } from './engine.js';
import { newFixture, roundRobin, dayOf } from './calendar.js';
import { addNews } from './season.js';
import { matchLoad } from './training.js';
import { repairLineup } from './lineup.js';
import { nationalMatchRecords } from './records.js';
import { addMental } from './attributes.js';
import { Rng } from './rng.js';

export const NAT_IDS = { senior: 'NAT', u21: 'NAT21' };
export const TOURN_IDS = { senior: 'EURO', u21: 'EURO21' };
export const LEVELS = ['senior', 'u21'];
const SQUAD_SHAPE = { G: 3, D: 7, M: 7, F: 6 }; // 23 players
export const BREAK_WEEKS = [1, 2, 7, 8, 14, 15, 21, 22, 27, 28]; // weekend indices; matches on the following Thursday
const MIN_PLAYERS = 60; // a country needs this many players at clubs for a national team
const OUTSIDE_EUROPE = new Set(['IRN']);
// The real hosts where they are known; later ones are drawn.
const REAL_HOSTS = { senior: { 2028: 'ENG', 2032: 'ITA' }, u21: {} };

export const teamOf = (game, id) => game.clubs[id] || game.national?.teams[id];
export const isNational = (game, f) => game.competitions[f.compId]?.type === 'national';
export const teamIdOf = (nationId, level) => `NT-${nationId}${level === 'u21' ? '-21' : ''}`;
// The summer (year) a season's finals are played in, if that level has one.
export const tournamentYear = (level, seasonYear) => (level === 'senior' ? (seasonYear + 1) % 4 === 0 : (seasonYear + 1) % 2 === 1);
const tournamentLabel = (level, year) => `${level === 'senior' ? 'Euro' : 'U21 Euro'} ${year}`;

// Countries with a national team: the league countries in Europe, if enough of
// their players play at the world's clubs.
function eligibleNations(game) {
  const count = {};
  for (const club of Object.values(game.clubs)) {
    for (const id of club.squad) {
      const p = game.players[id];
      if (p) count[p.nationId] = (count[p.nationId] || 0) + 1;
    }
  }
  return Object.values(game.nations).filter((n) => !OUTSIDE_EUROPE.has(n.id)
    && (!n.foreign || n.leagueIds?.length) && (!n.foreign || (count[n.id] || 0) >= MIN_PLAYERS));
}

// Creates the teams and competitions; on older saves it adds whatever is missing.
export function createNational(game) {
  game.national = game.national || { teams: {} };
  for (const level of LEVELS) {
    const compId = NAT_IDS[level];
    game.competitions[compId] = game.competitions[compId] || {
      id: compId, type: 'national', level, nationId: null,
      name: level === 'senior' ? 'Nations League' : 'U21 Nations League',
      clubIds: [], table: {}, fixtureIds: [], history: [],
    };
    const tid = TOURN_IDS[level];
    const baseName = level === 'senior' ? 'European Championship' : 'U21 European Championship';
    game.competitions[tid] = game.competitions[tid] || {
      id: tid, type: 'national', level, tournament: true, nationId: null, baseName, name: baseName,
      clubIds: [], table: {}, fixtureIds: [], groups: [], rounds: [], history: [],
    };
    for (const n of eligibleNations(game)) {
      const id = teamIdOf(n.id, level);
      if (!game.national.teams[id]) {
        const name = level === 'senior' ? n.name : `${n.name} U21`;
        game.national.teams[id] = {
          id, nationId: n.id, level, national: true, name, short: name, compId,
          colors: n.kit ? { ...n.kit, pattern: 'plain' } : { primary: n.flag.colors[0], secondary: n.flag.colors[1], pattern: 'plain' },
          crest: { shape: 'shield', pattern: 'band', c1: n.kit?.primary || n.flag.colors[0], c2: n.kit?.secondary || n.flag.colors[1], initials: n.id },
          squad: [], lineup: null, tactics: { formation: '4-4-2', intent: 50, style: 'normal' }, teamwork: 55, window: -1,
        };
      }
      const comp = game.competitions[compId];
      if (!comp.clubIds.includes(id)) comp.clubIds.push(id);
    }
  }
}

// Nations by the average skill of their 23 best first-team players.
export function nationRanking(game) {
  const by = {};
  for (const club of Object.values(game.clubs)) {
    for (const id of club.squad) {
      const p = game.players[id];
      if (p) (by[p.nationId] = by[p.nationId] || []).push(p.skill);
    }
  }
  const ids = [...new Set(Object.values(game.national.teams).map((t) => t.nationId))];
  return ids.map((id) => {
    const top = (by[id] || []).sort((a, b) => b - a).slice(0, 23);
    return { nationId: id, level: top.reduce((a, b) => a + b, 0) / Math.max(1, top.length) };
  }).sort((a, b) => b.level - a.level);
}

const emptyRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

// Splits a ranked list into n groups: pot k holds the k-th n teams, one per group.
function potDraw(ids, n, rng) {
  const groups = Array.from({ length: n }, () => []);
  for (let k = 0; k < ids.length; k += n) {
    const pot = rng.shuffle(ids.slice(k, k + n));
    // A short last pot goes to the smallest groups.
    const order = groups.map((g, i) => i).sort((a, b) => groups[a].length - groups[b].length || a - b);
    pot.forEach((id, j) => groups[pot.length < n ? order[j] : j].push(id));
  }
  return groups;
}

function pickHost(game, level, year, ids, rng) {
  const real = REAL_HOSTS[level][year] && teamIdOf(REAL_HOSTS[level][year], level);
  if (real && ids.includes(real)) return real;
  const last = game.competitions[TOURN_IDS[level]].history.at(-1)?.hostId;
  return rng.pick(ids.slice(0, 12).filter((id) => id !== last));
}

export function initNational(game, dates, rng) {
  if (!game.national) return;
  const year = game.season.year;
  const days = BREAK_WEEKS.filter((i) => i < dates.weekends.length).map((i) => dates.weekends[i] + 5);
  const ranking = nationRanking(game);
  for (const level of LEVELS) {
    const comp = game.competitions[NAT_IDS[level]];
    const t = game.competitions[TOURN_IDS[level]];
    const ids = ranking.map((r) => teamIdOf(r.nationId, level)).filter((id) => game.national.teams[id]);
    Object.assign(comp, { clubIds: ids, table: {}, fixtureIds: [], groups: [], finalId: null, winnerId: null, stageDone: false, host: null });
    if (t.year !== year + 1) {
      Object.assign(t, { name: t.baseName, clubIds: [], table: {}, fixtureIds: [], groups: [], rounds: [], winnerId: null,
        runnerUpId: null, active: false, apps: {}, year: null, hostId: null });
    }
    if (tournamentYear(level, year)) {
      comp.format = 'qual';
      comp.name = `${tournamentLabel(level, year + 1)} qualifiers`;
      const host = pickHost(game, level, year + 1, ids, rng);
      comp.host = host;
      Object.assign(t, { year: year + 1, hostId: host, name: tournamentLabel(level, year + 1) });
      const field = ids.filter((id) => id !== host);
      comp.groups = potDraw(field, Math.max(1, Math.ceil(field.length / 6)), rng)
        .map((g, i) => ({ name: `Group ${'ABCDEFGHIJ'[i]}`, ids: g }));
    } else {
      comp.format = 'league';
      comp.name = level === 'senior' ? 'Nations League' : 'U21 Nations League';
      // Groups of about five by strength; two groups make a league (A, B, C...).
      const n = Math.max(1, Math.ceil(ids.length / 5));
      const sizes = Array.from({ length: n }, (_, i) => Math.floor(ids.length / n) + (i < ids.length % n ? 1 : 0));
      let at = 0;
      const chunks = sizes.map((s) => ids.slice(at, (at += s)));
      for (let i = 0; i < n; i += 2) {
        const league = 'ABCDEF'[i / 2];
        if (i + 1 < n) {
          // The league's teams snake into its two groups.
          const both = [...chunks[i], ...chunks[i + 1]];
          const g = [[], []];
          both.forEach((id, k) => g[[0, 1, 1, 0][k % 4]].push(id));
          comp.groups.push({ name: `League ${league} · Group 1`, league, ids: g[0] }, { name: `League ${league} · Group 2`, league, ids: g[1] });
        } else comp.groups.push({ name: `League ${league}`, league, ids: chunks[i] });
      }
    }
    comp.groups.forEach((g, gi) => {
      for (const id of g.ids) comp.table[id] = emptyRow();
      roundRobin(g.ids, rng).forEach((pairs, k) => {
        if (k >= days.length) return;
        for (const [h, a] of pairs) {
          comp.fixtureIds.push(newFixture(game, comp.id, days[k], k + 1, h, a, { window: Math.floor(k / 2), group: gi }).id);
        }
      });
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
  const nations = [...new Set(Object.values(game.national.teams).map((t) => t.nationId))];
  for (const nationId of nations) {
    const all = pool[nationId] || [];
    const senior = game.national.teams[teamIdOf(nationId, 'senior')];
    const u21 = game.national.teams[teamIdOf(nationId, 'u21')];
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
      if (user && playsIn(game, team.id, window)) {
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

// Does this team have a match in this break (or finals)?
function playsIn(game, teamId, window) {
  const team = game.national.teams[teamId];
  const ids = [NAT_IDS[team.level], TOURN_IDS[team.level]].flatMap((c) => game.competitions[c].fixtureIds);
  return ids.some((id) => {
    const f = game.fixtures[id];
    return f && !f.result && f.window === window && (f.homeId === teamId || f.awayId === teamId);
  });
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

// Options for an international's match: knockouts need a winner; the finals
// are on neutral ground (except for the hosts, who always play at home).
// Internationals are cagier than club football, the finals most of all.
export const nationalMatchOpts = (f) => ({ needsWinner: !!f.knockout, neutral: !!f.neutral, tempo: f.window === 'T' || f.window === 'F' ? 0.84 : 0.9 });

// The user's picks changed during a break: the squad follows at once.
export function refreshUserSquad(game) {
  const team = game.national?.teams[userTeamId(game)];
  if (!team || team.window === -1) return;
  const year = game.season.year;
  const all = [];
  for (const club of Object.values(game.clubs)) {
    for (const id of [...club.squad, ...(club.youth || [])]) {
      const p = game.players[id];
      if (p && p.nationId === team.nationId && isAvailable(p)) all.push(p);
    }
  }
  const senior = game.national.teams[teamIdOf(team.nationId, 'senior')];
  const u21 = game.national.teams[teamIdOf(team.nationId, 'u21')];
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
  const m = runToEnd(game, createMatch(game, f, { homeClub: home, awayClub: away, keepEvents: false, ...nationalMatchOpts(f) }));
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
      added: e.added, penalty: e.penalty || undefined, assist: e.assistId || undefined })),
    cards: evs.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => ({ side: e.side, playerId: e.playerId,
      minute: e.minute, red: e.type === 'red' })),
  };
  if (f.knockout) {
    f.result.et = !!m.extraTime;
    f.result.pens = m.pens ? { h: m.pens.h, a: m.pens.a } : null;
    f.result.winner = winnerSide(m) === 1 ? f.awayId : f.homeId;
  }
  const mine = f.homeId === userTeamId(game) || f.awayId === userTeamId(game);
  if (mine || f.id === game.watchId) {
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
      if (comp.tournament) comp.apps[id] = (comp.apps[id] || 0) + 1;
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
  if (!f.knockout && rh && ra) {
    rh.p++; ra.p++;
    rh.gf += h; rh.ga += a; ra.gf += a; ra.ga += h;
    const rec = (r, x) => { r.form.push(x); if (r.form.length > 6) r.form.shift(); };
    if (h > a) { rh.w++; ra.l++; rh.pts += 3; rec(rh, 'W'); rec(ra, 'L'); }
    else if (h < a) { ra.w++; rh.l++; ra.pts += 3; rec(rh, 'L'); rec(ra, 'W'); }
    else { rh.d++; ra.d++; rh.pts++; ra.pts++; rec(rh, 'D'); rec(ra, 'D'); }
  }
  // Your country's senior results (and your own team's) make the news.
  if (user) {
    const mineId = teamIdOf(user.nationId, 'senior');
    if (mine || (senior && (f.homeId === mineId || f.awayId === mineId))) {
      const extra = f.result.pens ? ` (${f.result.pens.h}:${f.result.pens.a} on penalties)` : f.result.et ? ' (after extra time)' : '';
      addNews(game, `${comp.tournament ? comp.name : 'International'}: ${game.national.teams[f.homeId].name} ${h}:${a} ${game.national.teams[f.awayId].name}${extra}.`, 'national');
    }
  }
}

// A competition's table, or one group's (ids).
export function nationalTable(game, comp, ids = null) {
  return Object.entries(comp.table)
    .filter(([clubId]) => !ids || ids.includes(clubId))
    .map(([clubId, r]) => ({ clubId, ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf
      || game.national.teams[a.clubId].name.localeCompare(game.national.teams[b.clubId].name));
}

// The group a team plays in (or null).
export const groupOf = (comp, teamId) => (comp.groups || []).find((g) => g.ids.includes(teamId)) || null;

// ---- after each day: finals and knockout rounds ----

const groupFixtures = (game, comp) => comp.fixtureIds.map((id) => game.fixtures[id]).filter((f) => f && !f.knockout);

export function checkNational(game) {
  if (!game.national) return;
  const rng = new Rng(game.rng);
  for (const level of LEVELS) {
    const comp = game.competitions[NAT_IDS[level]];
    if (comp.format && !comp.stageDone) {
      const fx = groupFixtures(game, comp);
      if (fx.length && fx.every((f) => f.result)) {
        comp.stageDone = true;
        if (comp.format === 'league') scheduleLeagueFinal(game, comp);
        else scheduleFinals(game, comp, rng);
      }
    }
    if (comp.finalId && !comp.winnerId && game.fixtures[comp.finalId]?.result) {
      comp.winnerId = game.fixtures[comp.finalId].result.winner;
      addNews(game, `${game.national.teams[comp.winnerId].name} win the ${comp.name}!`, 'national');
    }
    progressTournament(game, game.competitions[TOURN_IDS[level]]);
  }
}

// The Nations League final: League A's group winners, in June.
function scheduleLeagueFinal(game, comp) {
  const a = comp.groups.filter((g) => g.league === 'A');
  const teams = a.length >= 2 ? a.map((g) => nationalTable(game, comp, g.ids)[0].clubId)
    : nationalTable(game, comp, a[0]?.ids || comp.clubIds).slice(0, 2).map((r) => r.clubId);
  if (teams.length < 2) return;
  const day = dayOf(game.season.year + 1, 6, 7);
  const f = newFixture(game, comp.id, day, 99, teams[0], teams[1], { knockout: true, neutral: true, window: 'F', stage: 'Final' });
  comp.fixtureIds.push(f.id);
  comp.finalId = f.id;
  const T = (id) => game.national.teams[id].name;
  addNews(game, `${comp.name} final on 7 June: ${T(teams[0])} vs ${T(teams[1])}.`, 'national');
}

// Who goes to the finals: the top of each group, then the best of the next
// places (points, goal difference and goals per match) to fill the slots.
export function qualifiersOf(game, comp, slots) {
  const tables = comp.groups.map((g) => nationalTable(game, comp, g.ids));
  const per = (r, k) => r[k] / Math.max(1, r.p);
  const out = [];
  for (let pos = 0; out.length < slots; pos++) {
    const tier = tables.map((rows) => rows[pos]).filter(Boolean);
    if (!tier.length) break;
    if (out.length + tier.length <= slots) out.push(...tier.map((r) => r.clubId));
    else {
      tier.sort((a, b) => per(b, 'pts') - per(a, 'pts') || per(b, 'gd') - per(a, 'gd') || per(b, 'gf') - per(a, 'gf'));
      out.push(...tier.slice(0, slots - out.length).map((r) => r.clubId));
    }
  }
  return out;
}

// June: groups on the 11th-20th (half the groups a day later), knockouts after.
function finalsDays(year, size) {
  const d = (m, day) => dayOf(year, m, day);
  return {
    groups: [d(6, 11), d(6, 15), d(6, 19)],
    ko: size === 16 ? [[d(6, 24), d(6, 25)], [d(6, 28), d(6, 29)], [d(7, 3), d(7, 3)]] : [[d(6, 24), d(6, 25)], [d(6, 29), d(6, 29)]],
  };
}

// A finals match: the hosts are always at home; everyone else on neutral ground.
function finalsFixture(game, t, day, round, a, b, extra) {
  const [h, w] = b === t.hostId ? [b, a] : [a, b];
  const f = newFixture(game, t.id, day, round, h, w, { window: 'T', neutral: h !== t.hostId, ...extra });
  t.fixtureIds.push(f.id);
  return f;
}

// The qualifiers are over: the draw for the finals.
function scheduleFinals(game, comp, rng) {
  const t = game.competitions[TOURN_IDS[comp.level]];
  const teams = comp.groups.reduce((n, g) => n + g.ids.length, 0) + 1;
  const size = teams >= 20 ? 16 : 8;
  const qualified = qualifiersOf(game, comp, size - 1);
  const field = [comp.host, ...qualified];
  const order = nationRanking(game).map((r) => teamIdOf(r.nationId, comp.level)).filter((id) => qualified.includes(id));
  const nG = size / 4;
  // The hosts head group A; the rest are drawn from pots by strength.
  const groups = Array.from({ length: nG }, (_, i) => (i === 0 ? [comp.host] : []));
  const pots = [order.slice(0, nG - 1)];
  for (let k = nG - 1; k < order.length; k += nG) pots.push(order.slice(k, k + nG));
  pots.forEach((pot, k) => {
    const ids = rng.shuffle(pot.slice());
    const free = groups.map((g, i) => i).filter((i) => groups[i].length === k);
    ids.forEach((id, j) => groups[free[j % free.length]].push(id));
  });
  Object.assign(t, { clubIds: field, table: {}, fixtureIds: [], rounds: [], winnerId: null, runnerUpId: null, active: true, apps: {}, size,
    groups: groups.map((ids, i) => ({ name: `Group ${'ABCD'[i]}`, ids })) });
  const days = finalsDays(t.year, size);
  t.groups.forEach((g, gi) => {
    for (const id of g.ids) t.table[id] = emptyRow();
    const [a, b, c, d] = g.ids;
    const late = gi >= nG / 2 ? 1 : 0;
    [[[a, b], [c, d]], [[a, c], [d, b]], [[d, a], [b, c]]].forEach((pairs, md) => {
      for (const [x, y] of pairs) if (x && y) finalsFixture(game, t, days.groups[md] + late, md + 1, x, y, { group: gi });
    });
  });
  const T = (id) => game.national.teams[id].name;
  addNews(game, `${t.name} draw: ${t.groups.map((g) => `${g.name}: ${g.ids.map(T).join(', ')}`).join('; ')}.`, 'national');
  const user = game.clubs[game.userClubId];
  if (user && comp.level === 'senior') {
    const mineId = teamIdOf(user.nationId, 'senior');
    if (comp.clubIds.includes(mineId)) {
      addNews(game, field.includes(mineId) ? `${T(mineId)} are going to ${t.name}${mineId === t.hostId ? ' as hosts' : ''}.` : `${T(mineId)} have failed to qualify for ${t.name}.`, 'national');
    }
  }
}

const ROUND_NAMES = { 4: 'Quarter-finals', 2: 'Semi-finals', 1: 'Final' };

function addRound(game, t, pairs) {
  const k = t.rounds.length;
  const name = ROUND_NAMES[pairs.length];
  const [d1, d2] = finalsDays(t.year, t.size).ko[k];
  const round = { name, fixtureIds: [] };
  pairs.forEach(([a, b], i) => {
    const day = i < pairs.length / 2 ? d1 : d2;
    round.fixtureIds.push(finalsFixture(game, t, day, 10 + k, a, b, { knockout: true, stage: name }).id);
  });
  t.rounds.push(round);
}

function progressTournament(game, t) {
  if (!t.active || t.winnerId) return;
  const T = (id) => game.national.teams[id].name;
  if (!t.rounds.length) {
    const fx = groupFixtures(game, t);
    if (!fx.length || fx.some((f) => !f.result)) return;
    const tables = t.groups.map((g) => nationalTable(game, t, g.ids));
    const W = (gi, pos) => tables[gi][pos].clubId;
    const pairs = t.groups.length === 4
      ? [[W(0, 0), W(1, 1)], [W(2, 0), W(3, 1)], [W(1, 0), W(0, 1)], [W(3, 0), W(2, 1)]]
      : [[W(0, 0), W(1, 1)], [W(1, 0), W(0, 1)]];
    addRound(game, t, pairs);
    addNews(game, `${t.name}: the group stage is over. ${t.rounds[0].name}: ${pairs.map(([a, b]) => `${T(a)} v ${T(b)}`).join(', ')}.`, 'national');
    return;
  }
  const fx = t.rounds.at(-1).fixtureIds.map((id) => game.fixtures[id]);
  if (fx.some((f) => !f.result)) return;
  const winners = fx.map((f) => f.result.winner);
  if (winners.length === 1) {
    const f = fx[0];
    t.winnerId = winners[0];
    t.runnerUpId = f.homeId === t.winnerId ? f.awayId : f.homeId;
    t.active = false;
    addNews(game, `${T(t.winnerId)} win ${t.name}! They beat ${T(t.runnerUpId)} ${f.homeId === t.winnerId ? `${f.result.h}:${f.result.a}` : `${f.result.a}:${f.result.h}`} in the final${f.result.pens ? ' on penalties' : f.result.et ? ' after extra time' : ''}.`, 'national');
    return;
  }
  const pairs = [];
  for (let i = 0; i < winners.length; i += 2) pairs.push([winners[i], winners[i + 1]]);
  addRound(game, t, pairs);
}

// A finals tournament still to be played this season (or null).
export function runningTournament(game) {
  if (!game.national) return null;
  return LEVELS.map((l) => game.competitions[TOURN_IDS[l]]).find((t) => t.active && t.year === game.season.year + 1) || null;
}

// ---- statistics and season end ----

// Goals and assists in a competition, best first.
export function nationalStats(game, compId) {
  const comp = game.competitions[compId];
  const s = {};
  const row = (id) => (s[id] = s[id] || { id, goals: 0, assists: 0 });
  for (const id of comp.fixtureIds) {
    const f = game.fixtures[id];
    if (!f?.result) continue;
    for (const g of f.result.goals) {
      row(g.playerId).goals++;
      if (g.assist) row(g.assist).assists++;
    }
  }
  return Object.values(s);
}

export function nationalScorers(game, compId) {
  return nationalStats(game, compId).filter((r) => r.goals).sort((a, b) => b.goals - a.goals || a.assists - b.assists)
    .map(({ id, goals }) => ({ id, goals }));
}

const playerEntry = (game, top, key) => {
  const p = top ? game.players[top.id] : null;
  return p ? { name: `${p.first} ${p.last}`, nationId: p.nationId, [key]: top[key] } : null;
};

export function closeNational(game, year) {
  if (!game.national) return [];
  const out = [];
  for (const level of LEVELS) {
    const comp = game.competitions[NAT_IDS[level]];
    const t = game.competitions[TOURN_IDS[level]];
    // The finals first: they are the bigger title.
    if (t.year === year + 1 && t.winnerId) {
      const stats = nationalStats(game, t.id);
      const top = stats.slice().sort((a, b) => b.goals - a.goals || b.assists - a.assists)[0];
      const topA = stats.slice().sort((a, b) => b.assists - a.assists || b.goals - a.goals)[0];
      t.history.push({ year: t.year, championId: t.winnerId, runnerUpId: t.runnerUpId, hostId: t.hostId,
        topScorer: playerEntry(game, top, 'goals'), topAssists: playerEntry(game, topA, 'assists') });
      out.push({ compId: t.id, name: t.name, championId: t.winnerId, level });
      finalsEffects(game, t);
      t.active = false;
    }
    if (!comp.fixtureIds.length) continue;
    const top = nationalScorers(game, comp.id)[0];
    const entry = { year, format: comp.format || 'championship', name: comp.name, topScorer: playerEntry(game, top, 'goals') };
    if (comp.format === 'qual') {
      entry.qualified = t.year === year + 1 ? t.clubIds.slice() : [];
    } else {
      // The Nations League final (older saves: the table's top).
      const rows = nationalTable(game, comp);
      entry.championId = comp.winnerId || rows[0].clubId;
      if (!comp.format) entry.table = rows.map((r) => ({ teamId: r.clubId, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: r.pts }));
      out.push({ compId: comp.id, name: comp.name, championId: entry.championId, level });
      addNews(game, `${game.national.teams[entry.championId].name} win the ${comp.name}.`, 'national');
    }
    comp.history.push(entry);
  }
  return out;
}

// The finals leave their mark: players who played grow as team players (the
// winners as leaders too) and start pre-season a little tired.
function finalsEffects(game, t) {
  const year = game.season.year;
  const winners = new Set(game.national.teams[t.winnerId].squad);
  for (const [id, apps] of Object.entries(t.apps || {})) {
    const p = game.players[id];
    if (!p) continue;
    if (apps >= 2) addMental(p, 'tw', 1, year);
    if (winners.has(id)) addMental(p, 'ldr', 1, year);
    if (apps >= 3) p.finalsTired = true;
  }
}
