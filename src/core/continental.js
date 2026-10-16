// Continental competitions: the Champions Cup (Tuesdays), the Continental
// League and the Continental Conference (Thursdays), in the current format:
//
// - League phase: one table. Every club plays 8 different opponents (6 in the
//   Conference; fewer if the competition is small), half at home, avoiding
//   clubs from its own country where possible. Autumn to early February.
// - Knockouts (two legs, the final one match): the top K/2 go straight to the
//   last K, the next K play the knockout play-offs (better seed at home in the
//   second leg); the rest are out. K is the biggest power of two up to 75 % of
//   the clubs (16 of 22-42, 8 of 11-21, 4 of 6-10).
//
// The world has six countries, so each competition holds the clubs those
// countries really send. In the first season (2026/27) the real league-phase
// clubs take part (matched by their game names); after that places come from
// the final tables and the national cups (CUP_WINNER_LEVEL).
//
// Older saves may still hold a Champions Cup with four groups of four for the
// season in progress; it is played out (comp.groups) and replaced next season.

import { newFixture, newTie, decidesTie, cupRoundName } from './calendar.js';
import { sortedTable, addNews } from './season.js';
import { payPrize } from './finance.js';
import { money } from './currency.js';
import { BREAK_WEEKS } from './national.js';
import { GUEST_COMP_ID, GUEST_FIRST_SEASON } from './guests.js';
import { countryRanking, clubTotal, ensureCoefficients } from './coefficients.js';

export const CONTINENTAL_ID = 'CCC';
export const CONTINENTAL_IDS = ['CCC', 'CEL', 'CCL'];
export const CONTINENTAL = {
  CCC: { level: 1, name: 'Continental Champions Cup', matches: 8, weekday: 3, rep: 3 },
  CEL: { level: 2, name: 'Continental League', matches: 8, weekday: 5, rep: 2 },
  CCL: { level: 3, name: 'Continental Conference', matches: 6, weekday: 5, rep: 1 },
};

// Prize money: UEFA's 2025/26 distribution (circular 32/2025) at a fifth of
// the real amounts, to fit the game's club finances (the value pillar is left
// out). start: paid at the first league-phase match; win/draw: per league-phase
// match; share: the ranking bonus (last place 1 share, first n shares);
// top8/top16: extra for those places; then for reaching each knockout round,
// and a bonus for the winners.
export const PRIZES = {
  CCC: { start: 3.724e6, win: 4.2e5, draw: 1.4e5, share: 5.5e4, top8: 4e5, top16: 2e5,
    playoff: 2e5, last16: 2.2e6, qf: 2.5e6, sf: 3e6, final: 3.7e6, winner: 1.3e6 },
  CEL: { start: 8.62e5, win: 9e4, draw: 3e4, share: 1.5e4, top8: 1.2e5, top16: 6e4,
    playoff: 6e4, last16: 3.5e5, qf: 5e5, sf: 8.4e5, final: 1.4e6, winner: 1.2e6 },
  CCL: { start: 6.34e5, win: 8e4, draw: 2.66e4, share: 5.6e3, top8: 8e4, top16: 4e4,
    playoff: 4e4, last16: 1.6e5, qf: 2.6e5, sf: 5e5, final: 8e5, winner: 6e5 },
};
const prizesOf = (comp) => PRIZES[comp.id] || PRIZES.CCC;
// Reaching knockout round k (0: the play-offs; the last one is the final).
function roundPrize(comp, k) {
  const P = prizesOf(comp);
  if (k === 0) return P.playoff;
  return [P.final, P.sf, P.qf, P.last16][comp.rounds.length - 1 - k] ?? P.last16;
}

// Places per country after the first season, close to what the six countries
// had in 2026/27 (22 + 14 + 6). The national cup winner takes the first
// Continental League place of its country unless it already plays in the
// Champions Cup (that place then goes to the next club in the table).
export const QUOTAS = {
  CCC: { ENG: 5, ESP: 5, ITA: 4, GER: 4, FRA: 3, CZE: 1 },
  CEL: { ENG: 3, ESP: 2, ITA: 2, GER: 2, FRA: 3, CZE: 2 },
  CCL: { ENG: 1, ESP: 1, ITA: 1, GER: 1, FRA: 1, CZE: 1 },
};
const FICTIONAL_QUOTAS = { CCC: { VAL: 6, SKA: 5, BRV: 5 }, CEL: { VAL: 3, SKA: 3, BRV: 2 }, CCL: { VAL: 2, SKA: 2, BRV: 2 } };
export const quotasFor = (game, id = CONTINENTAL_ID) => (game.nations.ENG ? QUOTAS : FICTIONAL_QUOTAS)[id];

// 2026/27 league phases: the clubs of the six countries, by their game names
// (club.baseName, which the real-teams file and renames keep).
export const FIRST_SEASON = {
  CCC: ['North London Gunners', 'Manchester Blue', 'Manchester Red', 'Aston Claret', 'Merseyside Red',
    'Barcelona Blaugrana', 'Madrid Blancos', 'Villarreal Submarino', 'Atlético Madrileño', 'Betis Sevilla',
    'Milano Nerazzurri', 'Napoli Partenopei', 'Roma Giallorossi', 'Como Lariani',
    'München Rot', 'Dortmund Borussen', 'Leipzig Rasenball', 'Stuttgart Schwaben',
    'Paris Rouge et Bleu', 'Lens Sang et Or', 'Lille Dogues', 'SK Praha Eden'],
  CEL: ['South London Eagles', 'Bournemouth Cherries', 'Wearside Reds', 'Donostia Txuri-Urdin', 'Vigo Celestes',
    'Milano Rossoneri', 'Torino Bianconeri', 'Hoffenheim Kraichgauer', 'Leverkusen Werkself',
    'Marseille Olympiens', 'Rennes Rouge et Noir', 'Lyon Gones', 'AC Praha Letná', 'FC Plzeň'],
  CCL: ['Brighton Seagulls', 'Getafe Azulones', 'Bergamo Orobici', 'Freiburg Breisgauer', 'Monaco Monégasques', 'FK Jablonec'],
};

const emptyRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });
const shortName = (id) => ({ CCC: 'Champions Cup', CEL: 'Continental League', CCL: 'Conference' })[id];

export const isContinental = (c) => c?.type === 'continental';
export const continentalComps = (game) => CONTINENTAL_IDS.map((id) => game.competitions[id]).filter(Boolean);
// The continental competition a club plays in this season (or null).
export const continentalOf = (game, clubId) => continentalComps(game).find((c) => c.clubIds.includes(clubId)) || null;

export function createContinental(game) {
  for (const id of CONTINENTAL_IDS) {
    if (game.competitions[id]) continue;
    const d = CONTINENTAL[id];
    game.competitions[id] = { id, type: 'continental', level: d.level, nationId: null, name: d.name, baseName: d.name,
      format: 'league', clubIds: [], table: {}, rounds: [], stage: 'league', history: [] };
  }
}

// ---- qualification ----

function firstSeason(game) {
  return Object.values(game.nations).filter((n) => n.leagueIds.length)
    .every((n) => !game.competitions[n.leagueIds[0]].history.length);
}

export const FULL_SIZE = 36;

// Clubs for all three competitions: { CCC: [...], CEL: [...], CCL: [...] }.
export function qualifiers(game, rng) {
  const byName = new Map(Object.values(game.clubs).map((c) => [c.baseName || c.name, c.id]));
  if (firstSeason(game) && game.nations.ENG) {
    // The real 2026/27 league phases: clubs of the league countries and the guests.
    const real = Object.fromEntries(CONTINENTAL_IDS.map((id) => [id,
      [...FIRST_SEASON[id], ...(GUEST_FIRST_SEASON[id] || [])].map((n) => byName.get(n)).filter(Boolean)]));
    // A renamed or missing club (an unusual world) falls back to the rankings.
    const want = (id) => FIRST_SEASON[id].length + (game.competitions[GUEST_COMP_ID] ? (GUEST_FIRST_SEASON[id] || []).length : 0);
    if (CONTINENTAL_IDS.every((id) => real[id].length === want(id))) return real;
  }
  if (game.nations.ENG) return rankedQualifiers(game, rng);
  // Older fictional worlds: fixed places per country.
  const out = { CCC: [], CEL: [], CCL: [] };
  const nations = new Set(CONTINENTAL_IDS.flatMap((id) => Object.keys(quotasFor(game, id))));
  for (const nationId of nations) {
    const nation = game.nations[nationId];
    if (!nation) continue;
    const ids = tableOrder(game, nation);
    const cupWinner = game.competitions[nation.cupId]?.history.at(-1)?.winnerId;
    const taken = new Set();
    const take = (n) => { const got = ids.filter((id) => !taken.has(id)).slice(0, n); got.forEach((id) => taken.add(id)); return got; };
    out.CCC.push(...take(quotasFor(game, 'CCC')[nationId] || 0));
    let el = quotasFor(game, 'CEL')[nationId] || 0;
    if (el && cupWinner && game.clubs[cupWinner] && !taken.has(cupWinner)) { out.CEL.push(cupWinner); taken.add(cupWinner); el--; }
    out.CEL.push(...take(el));
    out.CCL.push(...take(quotasFor(game, 'CCL')[nationId] || 0));
  }
  return out;
}

// A league country's top division in last season's finishing order (by
// reputation before the first season); relegated clubs can't qualify.
function tableOrder(game, nation) {
  const top = game.competitions[nation.leagueIds[0]];
  const last = top.history.at(-1);
  const ids = last ? last.table.map((r) => r.clubId) : top.clubIds.slice().sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
  return ids.filter((id) => game.clubs[id]?.compId === top.id);
}

// Real-country worlds: places by the country ranking (coefficients.js).
// League countries send their clubs in table order (the cup winner takes the
// first Continental League place if it isn't in the Champions Cup); guest
// countries their strongest guest clubs, with a little luck each season.
// Places a country can't fill go to the others, best-ranked first.
function rankedQualifiers(game, rng) {
  const out = { CCC: [], CEL: [], CCL: [] };
  const taken = new Set();
  const guests = game.competitions[GUEST_COMP_ID]?.clubIds || [];
  const luck = new Map(guests.map((id) => [id, game.clubs[id].reputation + rng.normal(0, 4)]));
  const ranking = countryRanking(game);
  const orders = new Map(ranking.map(({ nationId }) => {
    const nation = game.nations[nationId];
    const ids = nation.leagueIds.length ? tableOrder(game, nation)
      : guests.filter((id) => game.clubs[id].nationId === nationId).sort((a, b) => luck.get(b) - luck.get(a));
    return [nationId, ids];
  }));
  const next = (nationId) => (orders.get(nationId) || []).find((id) => !taken.has(id));
  const put = (comp, id) => { out[comp].push(id); taken.add(id); };
  for (const { nationId, places } of ranking) {
    const nation = game.nations[nationId];
    for (let i = 0; i < places.CCC; i++) { const id = next(nationId); if (id) put('CCC', id); }
    let el = places.CEL;
    const cupWinner = game.competitions[nation.cupId]?.history.at(-1)?.winnerId;
    if (el && cupWinner && game.clubs[cupWinner] && !taken.has(cupWinner)) { put('CEL', cupWinner); el--; }
    for (let i = 0; i < el; i++) { const id = next(nationId); if (id) put('CEL', id); }
    for (let i = 0; i < places.CCL; i++) { const id = next(nationId); if (id) put('CCL', id); }
  }
  // Unfilled places: one more club from each country in ranking order, round after round.
  for (const comp of CONTINENTAL_IDS) {
    let progress = true;
    while (out[comp].length < FULL_SIZE && progress) {
      progress = false;
      for (const { nationId } of ranking) {
        if (out[comp].length >= FULL_SIZE) break;
        const id = next(nationId);
        if (id) { put(comp, id); progress = true; }
      }
    }
  }
  return out;
}

// ---- the league phase ----

// Matches per club: the competition's number, at most one fewer than the
// other clubs, and even (half home, half away).
export const matchesFor = (id, n) => Math.max(2, Math.min(CONTINENTAL[id].matches, n - 1) & ~1);
// Clubs going through: the last K of the knockouts (direct: top K/2).
export const knockoutSize = (n) => 2 ** Math.floor(Math.log2(Math.max(2, n * 0.75)));

// Opponents: the clubs stand in a circle and each plays the clubs at M/2
// distances, at home against the one ahead and away against the one behind,
// which gives everyone M different opponents. The circle is a random order
// with as few same-country pairings as can be found.
//
// Matchdays: the pairings at one distance k form cycles; when they have an even
// length, alternate pairings make two matchdays on which every club plays
// once, so M matches take exactly M matchdays (36 clubs: distances 1, 2, 3, 5...).
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
function leagueSchedule(game, ids, M, rng) {
  const n = ids.length;
  const nat = (id) => game.clubs[id].nationId;
  const even = [];
  for (let k = 1; k < n / 2 && even.length < M / 2; k++) if ((n / gcd(n, k)) % 2 === 0) even.push(k);
  const exact = even.length === M / 2;
  const dists = exact ? even : Array.from({ length: M / 2 }, (_, i) => i + 1);
  // Seeding (real-country worlds): four pots by club coefficient, alternating
  // round the circle, so the clubs at the chosen distances come from other pots.
  const seeded = game.coefficients && n % 4 === 0;
  const pots = seeded ? (() => {
    const order = ids.slice().sort((x, y) => clubTotal(game, y) - clubTotal(game, x));
    return [0, 1, 2, 3].map((k) => order.slice((k * n) / 4, ((k + 1) * n) / 4));
  })() : null;
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    let ring;
    if (pots) {
      const shuffled = pots.map((pot) => rng.shuffle(pot.slice()));
      ring = ids.map((_, i) => shuffled[i % 4][Math.floor(i / 4)]);
    } else ring = rng.shuffle(ids.slice());
    let clashes = 0;
    for (const k of dists) for (let i = 0; i < n; i++) if (nat(ring[i]) === nat(ring[(i + k) % n])) clashes++;
    if (!best || clashes < best.clashes) best = { ring, clashes };
    if (!clashes) break;
  }
  const { ring } = best;
  if (!exact) {
    const pairs = dists.flatMap((k) => ring.map((a, i) => [a, ring[(i + k) % n]]));
    return matchdays(pairs, rng, M);
  }
  const days = [];
  for (const k of dists) {
    const A = [];
    const B = [];
    const c = gcd(n, k);
    for (let s0 = 0; s0 < c; s0++) {
      for (let j = 0, i = s0; j < n / c; j++, i = (i + k) % n) (j % 2 ? B : A).push([ring[i], ring[(i + k) % n]]);
    }
    days.push(A, B);
  }
  return rng.shuffle(days);
}

// Matchdays for any pairing list: each pairing on the first matchday both
// clubs are free; several orders are tried and the shortest kept.
function matchdays(pairs, rng, M) {
  let best = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const days = [];
    for (const p of rng.shuffle(pairs.slice())) {
      let d = days.findIndex((md) => !md.busy.has(p[0]) && !md.busy.has(p[1]));
      if (d < 0) { days.push({ busy: new Set(), pairs: [] }); d = days.length - 1; }
      days[d].busy.add(p[0]).add(p[1]);
      days[d].pairs.push(p);
    }
    if (!best || days.length < best.length) best = days;
    if (best.length <= M) break;
  }
  return best.map((md) => md.pairs);
}

// Midweek dates (Tuesday or Thursday after a league weekend), clear of the
// national cups' midweek rounds and the international weeks. The league
// phase is spread over autumn and winter; the knockout dates follow it in
// order (each round strictly after the one before), the final last.
function continentalDates(game, dates, id, leagueDays, koRounds) {
  const W = dates.weekends.length;
  const off = CONTINENTAL[id].weekday;
  const cupWeeks = new Set();
  for (const c of Object.values(game.competitions)) {
    if (c.type === 'cup') {
      for (const r of c.rounds) for (const day of [r.day, r.day2]) if (day) cupWeeks.add(dates.weekends.findIndex((d) => d + 4 === day));
    }
  }
  const need = leagueDays + 2 * (koRounds - 1) + 1;
  const weeks = (ok) => Array.from({ length: W }, (_, i) => i).filter((i) => i >= 2 && ok(i));
  // Free weeks; if there are too few, cup weeks first, then international weeks are used too.
  let pool = weeks((i) => !cupWeeks.has(i) && !BREAK_WEEKS.includes(i));
  if (pool.length < need) pool = weeks((i) => !BREAK_WEEKS.includes(i));
  if (pool.length < need) pool = weeks(() => true);
  // n evenly spread, strictly increasing picks from a list (needs list.length >= n).
  const spread = (list, n) => (n <= 1 ? [list.at(-1)] : Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]));
  const koCount = need - leagueDays;
  const league = spread(pool.slice(0, pool.length - koCount), leagueDays);
  const ko = spread(pool.slice(pool.indexOf(league.at(-1)) + 1), koCount);
  const day = (w) => dates.weekends[w] + off;
  const rounds = [];
  for (let r = 0; r < koRounds - 1; r++) rounds.push([day(ko[2 * r]), day(ko[2 * r + 1])]);
  rounds.push([day(ko.at(-1))]);
  return { league: league.map(day), ko: rounds };
}

export function initContinental(game, dates, rng) {
  if (!game.competitions[CONTINENTAL_ID]) return;
  createContinental(game);
  if (game.nations.ENG) ensureCoefficients(game);
  const q = qualifiers(game, rng);
  for (const id of CONTINENTAL_IDS) {
    const comp = game.competitions[id];
    comp.clubIds = q[id] || [];
    comp.format = 'league';
    comp.groups = [];
    delete comp.winnerId;
    comp.stage = 'league';
    comp.table = {};
    comp.rounds = [];
    comp.alive = [];
    comp.startPaid = [];
    const n = comp.clubIds.length;
    if (n < 4) { comp.clubIds = []; continue; }
    for (const cid of comp.clubIds) comp.table[cid] = emptyRow();
    const M = matchesFor(id, n);
    const mds = leagueSchedule(game, comp.clubIds, M, rng);
    const K = knockoutSize(n);
    // Rounds: the play-offs, then the last K down to the final.
    const koNames = ['Knockout play-offs', ...Array.from({ length: Math.log2(K) }, (_, k) => cupRoundName(k, Math.log2(K)))];
    const days = continentalDates(game, dates, id, mds.length, koNames.length);
    mds.forEach((pairs, k) => {
      for (const [h, a] of pairs) newFixture(game, id, days.league[k], k + 1, h, a, { phase: 'league' });
    });
    comp.matches = M;
    comp.knockout = K;
    comp.rounds = koNames.map((name, k) => ({ name, day: days.ko[k][0], ...(days.ko[k][1] ? { day2: days.ko[k][1] } : {}),
      fixtureIds: [], byes: [], drawn: false }));
  }
}

export const leagueTable = (game, comp) => sortedTable(game, { table: comp.table });
// Older saves: a group table.
export const groupTable = (game, group) => sortedTable(game, { table: group.table });

// Where the league phase sends a position (1-based): 'direct', 'playoff' or 'out'.
export function leagueZone(comp, pos) {
  const K = comp.knockout || 16;
  if (pos <= K / 2) return 'direct';
  if (pos <= K / 2 + K) return 'playoff';
  return 'out';
}

// How far a club got: 'Winner', a knockout round name, 'League phase', or null.
export function continentalResult(game, comp, clubId) {
  if (!comp.clubIds.includes(clubId)) return null;
  if (comp.winnerId === clubId) return 'Winner';
  let reached = comp.groups?.length ? 'Group stage' : 'League phase';
  comp.rounds.forEach((r) => {
    if (r.byes.includes(clubId) || r.fixtureIds.some((id) => game.fixtures[id] && (game.fixtures[id].homeId === clubId || game.fixtures[id].awayId === clubId))) reached = r.name;
  });
  return reached;
}

// End of season: history, trophies, and each participant's result. Returns
// the competitions decided this season (Champions Cup first).
export function closeContinentals(game, year) {
  const out = [];
  for (const comp of continentalComps(game)) {
    if (!comp.clubIds.length || !comp.winnerId) continue;
    const final = comp.rounds.at(-1).fixtureIds.map((id) => game.fixtures[id])[0];
    const runnerUpId = final ? (final.result.winner === final.homeId ? final.awayId : final.homeId) : null;
    comp.history.push({ year, winnerId: comp.winnerId, runnerUpId, clubIds: comp.clubIds.slice() });
    const winner = game.clubs[comp.winnerId];
    winner.trophies = [...(winner.trophies || []), { year, compId: comp.id, name: comp.name }];
    for (const id of comp.clubIds) {
      const h = game.clubs[id].history.at(-1);
      if (h && h.year === year) h.cont = `${shortName(comp.id)}: ${continentalResult(game, comp, id)}`;
    }
    out.push({ compId: comp.id, name: comp.name, level: comp.level || 1, winnerId: comp.winnerId, runnerUpId });
  }
  return out;
}

// ---- after every day ----

export function checkContinental(game, rng) {
  for (const comp of continentalComps(game)) {
    if (comp.winnerId || !comp.clubIds.length) continue;
    if (comp.groups?.length) checkGroups(game, comp, rng);
    else checkLeague(game, comp, rng);
  }
}

function userNews(game, comp, ties, round) {
  const user = game.userClubId;
  const mine = ties.find((t) => t.includes(user));
  if (!mine) return false;
  const opp = game.clubs[mine[0] === user ? mine[1] : mine[0]].name;
  addNews(game, round.day2
    ? `${comp.name} ${round.name.toLowerCase()}: we play ${opp} over two legs, ${mine[1] === user ? 'second leg at home' : 'first leg at home'}.`
    : `${comp.name} ${round.name.toLowerCase()}: we play ${opp} ${mine[0] === user ? 'at home' : 'away'}.`, 'cup');
  return true;
}

function checkLeague(game, comp, rng) {
  const d = CONTINENTAL[comp.id];
  const user = game.userClubId;
  if (comp.stage === 'league') {
    const fx = Object.values(game.fixtures).filter((f) => f.compId === comp.id && f.phase === 'league');
    if (!fx.length || fx.some((f) => !f.result)) return;
    comp.stage = 'knockout';
    const order = leagueTable(game, comp).map((r) => r.clubId);
    const K = comp.knockout;
    const direct = order.slice(0, K / 2);
    const playoff = order.slice(K / 2, K / 2 + K);
    // Ranking bonus, the top-16 extras and reaching the knockouts.
    const P = prizesOf(comp);
    order.forEach((id, i) => payPrize(game.clubs[id], P.share * (order.length - i) + (i < 8 ? P.top8 : i < 16 ? P.top16 : 0)));
    for (const id of direct) payPrize(game.clubs[id], roundPrize(comp, 1));
    for (const id of playoff) payPrize(game.clubs[id], roundPrize(comp, 0));
    // Fewer play-off clubs than places: the best of them go through without playing.
    const byes = playoff.slice(0, Math.max(0, K - playoff.length));
    const rest = playoff.slice(byes.length);
    // Better seed against worse, at home in the second leg: [first-leg home, second-leg home].
    const ties = [];
    for (let i = 0; i < rest.length / 2; i++) ties.push([rest[rest.length - 1 - i], rest[i]]);
    const round = comp.rounds[0];
    round.fixtureIds = koFixtures(game, comp.id, round, 0, ties);
    round.byes = byes;
    round.seeded = direct;
    round.drawn = true;
    comp.alive = [...direct, ...byes, ...ties.flat()];
    if (!userNews(game, comp, ties, round)) {
      if (direct.includes(user)) addNews(game, `${comp.name}: we finished in the top ${K / 2} of the league phase and go straight to the ${comp.rounds[1].name.toLowerCase()}.`, 'cup');
      else if (byes.includes(user)) addNews(game, `${comp.name}: we go through to the ${comp.rounds[1].name.toLowerCase()} without a play-off.`, 'cup');
      else if (comp.clubIds.includes(user)) addNews(game, `We are out of the ${comp.name} after the league phase.`, 'cup');
    }
    return;
  }
  const k = comp.rounds.findIndex((r) => r.drawn && !r.done);
  if (k < 0) return;
  const round = comp.rounds[k];
  const fixtures = round.fixtureIds.map((id) => game.fixtures[id]);
  if (fixtures.some((f) => !f.result)) return;
  round.done = true;
  const winners = fixtures.filter(decidesTie).map((f) => f.result.winner);
  const userTie = fixtures.filter(decidesTie).find((f) => f.homeId === user || f.awayId === user);
  if (userTie && userTie.result.winner !== user) addNews(game, `We are out of the ${comp.name} (${round.name}).`, 'cup');
  if (k === comp.rounds.length - 1) payPrize(game.clubs[winners[0]], prizesOf(comp).winner);
  // Play-off winners: the last K (the byes were paid with the play-off clubs, and get that round's money too).
  else for (const id of [...winners, ...(k === 0 ? round.byes : [])]) payPrize(game.clubs[id], roundPrize(comp, k + 1));
  if (k === comp.rounds.length - 1) {
    comp.winnerId = winners[0];
    comp.alive = winners;
    comp.stage = 'done';
    game.clubs[comp.winnerId].reputation = Math.min(95, game.clubs[comp.winnerId].reputation + d.rep);
    addNews(game, `${game.clubs[comp.winnerId].name} win the ${comp.name}!`, 'cup');
    return;
  }
  const next = comp.rounds[k + 1];
  let ties;
  if (k === 0) {
    // The league phase's top clubs (at home in the second leg) against the play-off winners and byes, drawn.
    const through = rng.shuffle([...round.byes, ...winners]);
    ties = round.seeded.map((s, i) => [through[i], s]);
  } else {
    const pool = rng.shuffle(winners.slice());
    ties = [];
    for (let i = 0; i + 1 < pool.length; i += 2) ties.push([pool[i], pool[i + 1]]);
  }
  next.fixtureIds = koFixtures(game, comp.id, next, k + 1, ties);
  next.drawn = true;
  comp.alive = ties.flat();
  userNews(game, comp, ties, next);
}

// Fixtures for a knockout round: two legs if the round has a second date.
function koFixtures(game, compId, round, cupRound, pairs) {
  return pairs.flatMap(([h, a]) => (round.day2
    ? newTie(game, compId, round.day, round.day2, cupRound + 1, h, a, { cupRound }).map((f) => f.id)
    : [newFixture(game, compId, round.day, cupRound + 1, h, a, { cupRound, knockout: true }).id]));
}

// League-phase and (older saves) group results update the table.
export function applyContinentalResult(game, f) {
  const comp = game.competitions[f.compId];
  let t = null;
  if (f.phase === 'league') t = comp.table;
  else if (f.group !== undefined) t = comp.groups[f.group].table;
  if (!t) return;
  const rh = t[f.homeId];
  const ra = t[f.awayId];
  const { h, a } = f.result;
  rh.p++; ra.p++;
  rh.gf += h; rh.ga += a; ra.gf += a; ra.ga += h;
  const rec = (r, x) => { r.form.push(x); if (r.form.length > 6) r.form.shift(); };
  if (h > a) { rh.w++; ra.l++; rh.pts += 3; rec(rh, 'W'); rec(ra, 'L'); }
  else if (h < a) { ra.w++; rh.l++; ra.pts += 3; rec(rh, 'L'); rec(ra, 'W'); }
  else { rh.d++; ra.d++; rh.pts++; ra.pts++; rec(rh, 'D'); rec(ra, 'D'); }
  const P = prizesOf(comp);
  // The starting fee, with each club's first league-phase match.
  if (f.phase === 'league') {
    comp.startPaid = comp.startPaid || [];
    for (const id of [f.homeId, f.awayId]) {
      if (comp.startPaid.includes(id)) continue;
      comp.startPaid.push(id);
      payPrize(game.clubs[id], P.start);
      if (id === game.userClubId) addNews(game, `${comp.name}: the club receives ${money(game, P.start)} for taking part, plus ${money(game, P.win)} for every win and ${money(game, P.draw)} for every draw.`, 'club');
    }
  }
  if (h !== a) payPrize(game.clubs[h > a ? f.homeId : f.awayId], P.win);
  else { payPrize(game.clubs[f.homeId], P.draw); payPrize(game.clubs[f.awayId], P.draw); }
}

// ---- older saves: four groups of four, then quarter-finals ----

function checkGroups(game, comp, rng) {
  const user = game.userClubId;
  if (comp.stage === 'groups') {
    const fx = comp.groups.flatMap((gr) => gr.fixtureIds.map((id) => game.fixtures[id]));
    if (fx.some((f) => !f.result)) return;
    comp.stage = 'knockout';
    const standings = comp.groups.map((gr) => groupTable(game, gr).map((r) => r.clubId));
    for (const s of standings) { payPrize(game.clubs[s[0]], 4e5); payPrize(game.clubs[s[1]], 2e5); }
    const ties = [[0, 1], [1, 0], [2, 3], [3, 2]].map(([w, r]) => [standings[w][0], standings[r][1]]);
    const round = comp.rounds[0];
    round.fixtureIds = koFixtures(game, comp.id, round, 0, ties.map(([w, r]) => (round.day2 ? [r, w] : [w, r])));
    round.drawn = true;
    comp.alive = ties.flat();
    if (!ties.some((t) => t.includes(user)) && comp.clubIds.includes(user)) addNews(game, `We are out of the ${comp.name} after the group stage.`, 'cup');
    return;
  }
  const k = comp.rounds.findIndex((r) => r.drawn && !r.done);
  if (k < 0) return;
  const round = comp.rounds[k];
  const fixtures = round.fixtureIds.map((id) => game.fixtures[id]);
  if (fixtures.some((f) => !f.result)) return;
  round.done = true;
  comp.alive = fixtures.filter(decidesTie).map((f) => f.result.winner);
  for (const id of comp.alive) payPrize(game.clubs[id], [5e5, 8e5, 2e6][k]);
  const userTie = fixtures.filter(decidesTie).find((f) => f.homeId === user || f.awayId === user);
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
  next.fixtureIds = koFixtures(game, comp.id, next, k + 1, pairs);
  next.drawn = true;
}
