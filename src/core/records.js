// History and records, kept from the first season of the career:
//  - every player's season-by-season record, one row per club (a transfer or
//    loan mid-season starts a new row), with goals and assists;
//  - every club's and national team's records: all-time top scorers and
//    appearances, best single seasons, biggest wins (per competition type),
//    heaviest defeat and record crowd;
//  - the world awards: the Ballon d'Or (best player) and the Golden Shoe
//    (top scorer across all leagues, goals weighted by league strength).

import { addNews } from './season.js';

const KEEP = 30; // all-time list entries kept per team (current players are never dropped)
const KEEP_AI = 15; // other clubs: a shorter list keeps saves small in a big world
const fullName = (p) => `${p.first} ${p.last}`;
export const emptyRecords = () => ({ players: {}, seasons: [], wins: {}, defeat: null, crowd: null });
const recs = (team) => (team.records ||= emptyRecords());

// ---- player spells ----

// The player's running record at his current club this season.
export function spellFor(game, p, clubId) {
  if (!p.spell || p.spell.clubId !== clubId) {
    flushSpell(game, p);
    p.spell = { clubId, apps: 0, goals: 0, assists: 0, ratingSum: 0 };
  }
  return p.spell;
}

// Closes the spell: a history row for the player, totals for the club's records.
export function flushSpell(game, p) {
  const s = p.spell;
  if (!s) return;
  p.spell = null;
  if (!s.apps && !s.goals) return;
  const year = game.season.year;
  p.history = p.history || [];
  // [season, clubId, apps, goals, avg rating x10, assists]
  p.history.push([year, s.clubId, s.apps, s.goals, Math.round((s.apps ? s.ratingSum / s.apps : 0) * 10), s.assists]);
  if (p.history.length > 30) p.history.shift();
  const club = game.clubs[s.clubId];
  if (!club) return;
  const r = recs(club);
  const e = (r.players[p.id] ||= { name: fullName(p), pos: p.pos, apps: 0, goals: 0, assists: 0, from: year, to: year });
  e.name = fullName(p);
  e.apps += s.apps;
  e.goals += s.goals;
  e.assists += s.assists;
  e.to = year;
  if (s.goals) addSeasonRecord(r, { playerId: p.id, name: fullName(p), goals: s.goals, year });
}

function addSeasonRecord(r, entry) {
  r.seasons.push(entry);
  r.seasons.sort((a, b) => b.goals - a.goals || a.year - b.year);
  if (r.seasons.length > 10) r.seasons.length = 10;
}

// ---- match records ----

const bigger = (a, b) => !b || a.gf - a.ga > b.gf - b.ga || (a.gf - a.ga === b.gf - b.ga && a.gf > b.gf);
const heavier = (a, b) => !b || a.ga - a.gf > b.ga - b.gf || (a.ga - a.gf === b.ga - b.gf && a.ga > b.ga);

function recordResult(game, team, kind, entry) {
  const r = recs(team);
  if (entry.gf > entry.ga && bigger(entry, r.wins[kind])) r.wins[kind] = entry;
  if (entry.ga > entry.gf && heavier(entry, r.defeat)) r.defeat = { ...entry, kind };
}

// After every club match (all competitions, all clubs).
export function clubMatchRecords(game, f, comp) {
  const kind = comp.type === 'league' ? 'league' : comp.type === 'cup' ? 'cup' : 'continental';
  const { h, a } = f.result;
  const year = game.season.year;
  const home = game.clubs[f.homeId];
  const away = game.clubs[f.awayId];
  recordResult(game, home, kind, { gf: h, ga: a, opp: away.name, home: true, comp: comp.name, year });
  recordResult(game, away, kind, { gf: a, ga: h, opp: home.name, home: false, comp: comp.name, year });
  const n = f.result.attendance;
  const r = recs(home);
  if (n && (!r.crowd || n > r.crowd.n)) r.crowd = { n, opp: away.name, comp: comp.name, year };
}

// After every international: results, caps and goals for the team's records.
export function nationalMatchRecords(game, f, m, comp) {
  const year = game.season.year;
  const teams = [game.national.teams[f.homeId], game.national.teams[f.awayId]];
  const { h, a } = f.result;
  recordResult(game, teams[0], 'intl', { gf: h, ga: a, opp: teams[1].name, home: true, comp: comp.name, year });
  recordResult(game, teams[1], 'intl', { gf: a, ga: h, opp: teams[0].name, home: false, comp: comp.name, year });
  m.sides.forEach((side, i) => {
    const r = recs(teams[i]);
    const entry = (p) => (r.players[p.id] ||= { name: fullName(p), pos: p.pos, apps: 0, goals: 0, assists: 0, from: year, to: year });
    for (const id of side.played) {
      const p = game.players[id];
      if (!p) continue;
      const e = entry(p);
      e.apps++;
      e.to = year;
    }
    for (const g of f.result.goals.filter((x) => x.side === i)) {
      const p = game.players[g.playerId];
      if (p) entry(p).goals++;
    }
  });
}

// Season end: drops the tail of long all-time lists (never a current player).
export function pruneRecords(game) {
  const teams = [...Object.values(game.clubs), ...Object.values(game.national?.teams || {})];
  for (const t of teams) {
    const r = t.records;
    if (!r) continue;
    const ids = Object.keys(r.players);
    // The user's club and national teams keep the full lists.
    const n = t.id === game.userClubId || !game.clubs[t.id] ? KEEP : KEEP_AI;
    if (ids.length <= n * 2) continue;
    const keep = new Set([...(t.squad || []), ...(t.youth || [])]);
    const top = (key) => ids.slice().sort((x, y) => r.players[y][key] - r.players[x][key]).slice(0, n);
    for (const id of [...top('goals'), ...top('apps')]) keep.add(id);
    for (const id of ids) if (!keep.has(id)) delete r.players[id];
  }
}

// ---- world awards ----

// League strength for the Golden Shoe: goals in the big top flights count double.
export function shoeFactor(game, comp) {
  if (comp.tier !== 1) return 1;
  return (game.nations[comp.nationId].strength ?? 0) >= 0 ? 2 : 1.5;
}

// The current Golden Shoe standings: [{ p, points, factor }].
export function goldenShoeRace(game) {
  const out = [];
  for (const comp of Object.values(game.competitions).filter((c) => c.type === 'league')) {
    const factor = shoeFactor(game, comp);
    for (const clubId of comp.clubIds) {
      for (const id of game.clubs[clubId].squad) {
        const p = game.players[id];
        if (p?.stats.season.goals) out.push({ p, points: p.stats.season.goals * factor, factor });
      }
    }
  }
  return out.sort((a, b) => b.points - a.points || a.p.stats.season.apps - b.p.stats.season.apps);
}

const POS_GOAL = { G: 0, D: 1.6, M: 1.2, F: 1 };

// Ballon d'Or score: form over the season, goals and assists (weighted by
// position), ability, the level of the league, and the trophies won.
function ballonScore(game, p, ctx) {
  const s = p.stats.season;
  const avg = s.ratingSum / s.apps;
  const comp = game.competitions[game.clubs[p.clubId].compId];
  const strength = game.nations[comp.nationId].strength ?? 0;
  let score = (avg - 6) * 25 + s.goals * POS_GOAL[p.pos] + s.assists * 0.7 + p.skill * 0.6;
  score += comp.tier === 1 ? 10 + strength * 2 : -15;
  if (ctx.leagueChamps.has(p.clubId)) score += comp.tier === 1 ? 8 : 2;
  if (ctx.cupWinners.has(p.clubId)) score += 3;
  if (p.clubId === ctx.contWinner) score += 14;
  else if (p.clubId === ctx.contRunnerUp) score += 5;
  if (ctx.natChampSquad.has(p.id)) score += 6;
  return score;
}

const entryOf = (game, p, extra) => ({ playerId: p.id, name: fullName(p), clubId: p.clubId, clubName: game.clubs[p.clubId]?.name || '',
  nationId: p.nationId, pos: p.pos, goals: p.stats.season.goals, assists: p.stats.season.assists, ...extra });

// Called at season end after the leagues, cups, Champions Cup and Nations
// Championship are decided, before season stats are reset.
export function worldAwards(game, summary) {
  const year = game.season.year;
  const leagues = Object.values(game.competitions).filter((c) => c.type === 'league');
  const cont = summary.continental;
  const natSenior = (summary.national || []).find((x) => game.competitions[x.compId]?.level === 'senior');
  const ctx = {
    leagueChamps: new Set(summary.leagues.map((l) => l.championId)),
    cupWinners: new Set(summary.cups.map((c) => c.winnerId)),
    contWinner: cont?.winnerId, contRunnerUp: cont?.runnerUpId,
    natChampSquad: new Set(natSenior ? game.national.teams[natSenior.championId].squad : []),
  };
  const ballon = [];
  for (const comp of leagues) {
    const rounds = (comp.clubIds.length - 1) * 2;
    for (const clubId of comp.clubIds) {
      for (const id of game.clubs[clubId].squad) {
        const p = game.players[id];
        if (p?.stats.season.apps >= rounds * 0.5) ballon.push({ p, score: ballonScore(game, p, ctx) });
      }
    }
  }
  ballon.sort((a, b) => b.score - a.score);
  const shoe = goldenShoeRace(game);
  const avgOf = (p) => Math.round((p.stats.season.ratingSum / p.stats.season.apps) * 100) / 100;
  const out = {
    year,
    ballonDor: ballon.slice(0, 3).map((x) => entryOf(game, x.p, { avg: avgOf(x.p), score: Math.round(x.score) })),
    goldenShoe: shoe.slice(0, 3).map((x) => entryOf(game, x.p, { points: x.points, factor: x.factor })),
  };
  game.history.world = game.history.world || [];
  game.history.world.push(out);
  const award = (e, name) => {
    const p = game.players[e.playerId];
    if (p) p.awards = [...(p.awards || []), { year, name }];
  };
  if (out.ballonDor[0]) {
    award(out.ballonDor[0], "Ballon d'Or");
    addNews(game, `${out.ballonDor[0].name} (${out.ballonDor[0].clubName}) wins the Ballon d'Or.`, 'player');
  }
  if (out.goldenShoe[0]) {
    award(out.goldenShoe[0], 'Golden Shoe');
    addNews(game, `${out.goldenShoe[0].name} (${out.goldenShoe[0].clubName}) wins the Golden Shoe with ${out.goldenShoe[0].goals} league goals.`, 'player');
  }
  return out;
}

// League awards also go on the players' records.
export function noteLeagueAwards(game, comp, awards) {
  const year = game.season.year;
  for (const [key, label] of [['topScorer', 'top scorer'], ['bestPlayer', 'player of the season'], ['youngPlayer', 'young player of the season']]) {
    const a = awards[key];
    const p = a && game.players[a.playerId];
    if (p) p.awards = [...(p.awards || []), { year, name: `${comp.name} ${label}` }];
  }
}
