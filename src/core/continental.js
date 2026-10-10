// Continental Champions Cup: the best clubs of all countries.
// 16 clubs (quotas by country strength) -> 4 groups of 4 (home and away,
// Tuesdays in autumn) -> quarter-finals (group winners at home), semi-finals
// and a final in spring. Quarter- and semi-finals are two-legged (aggregate,
// then extra time and penalties in the second leg); the final is one match.

import { newFixture, newTie, decidesTie, cupRoundName } from './calendar.js';
import { sortedTable, addNews } from './season.js';
import { payPrize } from './finance.js';
import { REAL_QUOTAS } from './realworld.js';

export const CONTINENTAL_ID = 'CCC';
// Places per country: the real-country world, or the old fictional one (older saves).
export const QUOTAS = REAL_QUOTAS;
const FICTIONAL_QUOTAS = { VAL: 6, SKA: 5, BRV: 5 };
export const quotasFor = (game) => (game.nations.ENG ? REAL_QUOTAS : FICTIONAL_QUOTAS);
const GROUP_NAMES = ['A', 'B', 'C', 'D'];
const emptyRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

export function createContinental(game) {
  game.competitions[CONTINENTAL_ID] = {
    id: CONTINENTAL_ID, type: 'continental', nationId: null, name: 'Continental Champions Cup',
    clubIds: [], groups: [], rounds: [], stage: 'groups', history: [],
  };
}

// Qualified clubs: the top of each top division last season (by reputation in
// the very first season).
export function qualifiers(game) {
  const out = [];
  for (const [nationId, n] of Object.entries(quotasFor(game))) {
    const nation = game.nations[nationId];
    if (!nation) continue;
    const top = game.competitions[nation.leagueIds[0]];
    const last = top.history.at(-1);
    let ids = last ? last.table.map((r) => r.clubId) : top.clubIds.slice().sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
    // A club relegated last season can't qualify (it isn't in the top division any more).
    ids = ids.filter((id) => game.clubs[id].compId === top.id);
    out.push(...ids.slice(0, n));
  }
  return out;
}

// Group draw: four pots by reputation, avoiding two clubs from one country in
// a group where possible.
function drawGroups(game, clubIds, rng) {
  const sorted = clubIds.slice().sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
  const pots = [0, 1, 2, 3].map((i) => sorted.slice(i * 4, i * 4 + 4));
  const nat = (id) => game.clubs[id].nationId;
  const clashes = (groups) => groups.reduce((s, gr) => s + gr.length - new Set(gr.map(nat)).size, 0);
  // Random draws, each club going to the open group with the fewest clubs from
  // its country; keep the draw with the fewest same-country pairings.
  let best = null;
  for (let attempt = 0; attempt < 300; attempt++) {
    const groups = GROUP_NAMES.map(() => []);
    pots.forEach((pot, k) => {
      for (const id of rng.shuffle(pot.slice())) {
        const open = rng.shuffle(groups.map((gr, gi) => gi).filter((gi) => groups[gi].length === k));
        open.sort((a, b) => groups[a].filter((x) => nat(x) === nat(id)).length - groups[b].filter((x) => nat(x) === nat(id)).length);
        groups[open[0]].push(id);
      }
    });
    const c = clashes(groups);
    if (!best || c < best.c) best = { groups, c };
    if (c === 0) break;
  }
  return best.groups;
}

// Tuesday dates: six group matchdays in autumn, knockouts in spring, kept
// clear of the national cup's midweek rounds.
function continentalDays(game, dates) {
  const W = dates.weekends.length;
  const cupWeeks = new Set();
  for (const c of Object.values(game.competitions)) {
    if (c.type === 'cup') {
      for (const r of c.rounds) for (const day of [r.day, r.day2]) if (day) cupWeeks.add(dates.weekends.findIndex((d) => d + 4 === day));
    }
  }
  const pick = (idx) => {
    let i = idx;
    while (cupWeeks.has(i) && i < W - 1) i++;
    cupWeeks.add(i);
    return dates.weekends[i] + 3;
  };
  const group = [4, 6, 8, 10, 12, 14].map(pick);
  // Quarter- and semi-finals over two legs, then the final.
  const knockout = [Math.round(W * 0.62), Math.round(W * 0.66), Math.round(W * 0.74), Math.round(W * 0.78), W - 3].map(pick);
  return { group, knockout };
}

export function initContinental(game, dates, rng) {
  const comp = game.competitions[CONTINENTAL_ID];
  if (!comp) return;
  comp.clubIds = qualifiers(game);
  delete comp.winnerId;
  comp.stage = 'groups';
  const days = continentalDays(game, dates);
  comp.groups = drawGroups(game, comp.clubIds, rng).map((ids, gi) => {
    const table = {};
    for (const id of ids) table[id] = emptyRow();
    // Double round robin for four teams: six matchdays.
    const [a, b, c, d] = ids;
    const pairs = [[[a, b], [c, d]], [[a, c], [d, b]], [[d, a], [b, c]]];
    const all = [...pairs, ...pairs.map((md) => md.map(([h, aw]) => [aw, h]))];
    const fixtureIds = [];
    all.forEach((md, k) => {
      for (const [h, aw] of md) {
        fixtureIds.push(newFixture(game, CONTINENTAL_ID, days.group[k], k + 1, h, aw, { group: gi }).id);
      }
    });
    return { name: GROUP_NAMES[gi], clubIds: ids, table, fixtureIds };
  });
  const [qf1, qf2, sf1, sf2, final] = days.knockout;
  comp.rounds = [[qf1, qf2], [sf1, sf2], [final]].map(([day, day2], k) => ({ name: cupRoundName(k, 3), day, ...(day2 ? { day2 } : {}),
    fixtureIds: [], byes: [], drawn: false }));
  comp.alive = [];
}

export const groupTable = (game, group) => sortedTable(game, { table: group.table });

// How far a club got: 'Winner', a knockout round name, 'Group stage', or null.
export function continentalResult(game, comp, clubId) {
  if (!comp.clubIds.includes(clubId)) return null;
  if (comp.winnerId === clubId) return 'Winner';
  let reached = 'Group stage';
  comp.rounds.forEach((r) => {
    if (r.fixtureIds.some((id) => game.fixtures[id] && (game.fixtures[id].homeId === clubId || game.fixtures[id].awayId === clubId))) reached = r.name;
  });
  return reached;
}

// End of season: history, trophy, and each participant's result.
export function closeContinental(game, year) {
  const comp = game.competitions[CONTINENTAL_ID];
  if (!comp || !comp.clubIds.length || !comp.winnerId) return null;
  const final = comp.rounds.at(-1).fixtureIds.map((id) => game.fixtures[id])[0];
  const runnerUpId = final ? (final.result.winner === final.homeId ? final.awayId : final.homeId) : null;
  comp.history.push({ year, winnerId: comp.winnerId, runnerUpId, clubIds: comp.clubIds.slice() });
  const winner = game.clubs[comp.winnerId];
  winner.trophies = [...(winner.trophies || []), { year, compId: comp.id, name: comp.name }];
  for (const id of comp.clubIds) {
    const h = game.clubs[id].history.at(-1);
    if (h && h.year === year) h.cont = continentalResult(game, comp, id);
  }
  return { compId: comp.id, name: comp.name, winnerId: comp.winnerId, runnerUpId };
}

// Called at the end of every day: group stage done -> quarter-final draw,
// knockout round done -> next round or winner.
export function checkContinental(game, rng) {
  const comp = game.competitions[CONTINENTAL_ID];
  if (!comp || comp.winnerId || !comp.clubIds.length) return;
  const user = game.userClubId;
  if (comp.stage === 'groups') {
    const fx = comp.groups.flatMap((gr) => gr.fixtureIds.map((id) => game.fixtures[id]));
    if (fx.some((f) => !f.result)) return;
    comp.stage = 'knockout';
    const standings = comp.groups.map((gr) => groupTable(game, gr).map((r) => r.clubId));
    for (const s of standings) { payPrize(game.clubs[s[0]], 4e5); payPrize(game.clubs[s[1]], 2e5); }
    // A1-B2, B1-A2, C1-D2, D1-C2; group winners at home (in the second leg
    // when the round has two legs).
    const ties = [[0, 1], [1, 0], [2, 3], [3, 2]].map(([w, r]) => [standings[w][0], standings[r][1]]);
    const round = comp.rounds[0];
    round.fixtureIds = koFixtures(game, round, 1, 0, ties.map(([w, r]) => (round.day2 ? [r, w] : [w, r])));
    round.drawn = true;
    comp.alive = ties.flat();
    const mine = ties.find((t) => t.includes(user));
    if (mine) {
      const opp = game.clubs[mine[0] === user ? mine[1] : mine[0]].name;
      addNews(game, round.day2
        ? `${comp.name} quarter-final: we play ${opp} over two legs, ${mine[0] === user ? 'second leg at home' : 'first leg at home'}.`
        : `${comp.name} quarter-final: we play ${opp} ${mine[0] === user ? 'at home' : 'away'}.`, 'cup');
    }
    else if (comp.clubIds.includes(user)) addNews(game, `We are out of the ${comp.name} after the group stage.`, 'cup');
    return;
  }
  const k = comp.rounds.findIndex((r) => r.drawn && !r.done);
  if (k < 0) return;
  const round = comp.rounds[k];
  const fixtures = round.fixtureIds.map((id) => game.fixtures[id]);
  if (fixtures.some((f) => !f.result)) return;
  round.done = true;
  const decided = fixtures.filter(decidesTie);
  comp.alive = decided.map((f) => f.result.winner);
  for (const id of comp.alive) payPrize(game.clubs[id], [5e5, 8e5, 2e6][k]);
  const userTie = decided.find((f) => f.homeId === user || f.awayId === user);
  if (userTie && userTie.result.winner !== user) addNews(game, `We are out of the ${comp.name} (${round.name}).`, 'cup');
  if (k === comp.rounds.length - 1) {
    comp.winnerId = comp.alive[0];
    comp.stage = 'done';
    game.clubs[comp.winnerId].reputation = Math.min(95, game.clubs[comp.winnerId].reputation + 3);
    addNews(game, `${game.clubs[comp.winnerId].name} win the ${comp.name}!`, 'cup');
    return;
  }
  const next = comp.rounds[k + 1];
  const pool = rng.shuffle(comp.alive.slice());
  const pairs = [];
  for (let i = 0; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
  next.fixtureIds = koFixtures(game, next, k + 2, k + 1, pairs);
  next.drawn = true;
  const mine = next.fixtureIds.map((id) => game.fixtures[id]).find((f) => f.homeId === user || f.awayId === user);
  if (mine) {
    addNews(game, `${comp.name} ${next.name.toLowerCase()} draw: ${game.clubs[mine.homeId === user ? mine.awayId : mine.homeId].name}${mine.leg ? `, first leg ${mine.homeId === user ? 'at home' : 'away'}` : ''}.`, 'cup');
  }
}

// Fixtures for a knockout round: two legs if the round has a second date.
function koFixtures(game, round, roundNo, cupRound, pairs) {
  return pairs.flatMap(([h, a]) => (round.day2
    ? newTie(game, CONTINENTAL_ID, round.day, round.day2, roundNo, h, a, { cupRound }).map((f) => f.id)
    : [newFixture(game, CONTINENTAL_ID, round.day, roundNo, h, a, { cupRound, knockout: true }).id]));
}

// Group-stage results update the group table.
export function applyContinentalResult(game, f) {
  if (f.group === undefined) return;
  const comp = game.competitions[CONTINENTAL_ID];
  const t = comp.groups[f.group].table;
  const rh = t[f.homeId];
  const ra = t[f.awayId];
  const { h, a } = f.result;
  rh.p++; ra.p++;
  rh.gf += h; rh.ga += a; ra.gf += a; ra.ga += h;
  const rec = (r, x) => { r.form.push(x); if (r.form.length > 6) r.form.shift(); };
  if (h > a) { rh.w++; ra.l++; rh.pts += 3; rec(rh, 'W'); rec(ra, 'L'); }
  else if (h < a) { ra.w++; rh.l++; ra.pts += 3; rec(rh, 'L'); rec(ra, 'W'); }
  else { rh.d++; ra.d++; rh.pts++; ra.pts++; rec(rh, 'D'); rec(ra, 'D'); }
  // Group-stage win bonus.
  if (h !== a) payPrize(game.clubs[h > a ? f.homeId : f.awayId], 1e5);
}
