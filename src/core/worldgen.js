// Seeded world generation: nations, leagues, cups, clubs and squads.

import { Rng, hashSeed, clamp } from './rng.js';
import { NATIONS, KIT_COLORS, KIT_PATTERNS, CREST_SHAPES, CREST_PATTERNS, SQUAD_TEMPLATE, GAME_VERSION,
  START_YEAR } from './data.js';
import { personName, townName, clubName, stadiumName, initials } from './names.js';
import { playerValue, playerWage } from './valuation.js';
import { autoLineup } from './ai.js';
import { splitSkill, heightFor } from './attributes.js';
import { rollPersonality } from './morale.js';
import { initUserStaff, defaultTraining } from './training.js';
import { initSeason, addNews } from './season.js';
import { createContinental } from './continental.js';
import { GUEST_NATIONS, GUEST_CLUBS, GUEST_COMP_ID, guestReputation } from './guests.js';
import { createNational } from './national.js';
import { initManager } from './board.js';
import { startNationalJobs } from './nationaljob.js';

export function nextId(game, kind, prefix) {
  return prefix + (game.ids[kind] = (game.ids[kind] || 0) + 1);
}

// Relative luminance check so kit colours aren't near-identical.
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function makeColors(rng) {
  const primary = rng.pick(KIT_COLORS);
  let secondary = rng.pick(KIT_COLORS);
  for (let i = 0; i < 20 && Math.abs(lum(primary) - lum(secondary)) < 0.3; i++) secondary = rng.pick(KIT_COLORS);
  return { primary, secondary, pattern: rng.pick(KIT_PATTERNS) };
}

export function emptyLedger() {
  return { tickets: 0, tvSponsors: 0, prizes: 0, transfersIn: 0, transfersOut: 0, wages: 0, costs: 0, construction: 0, scouting: 0, board: 0 };
}

const AGE_WEIGHTS = [[17, 2], [18, 4], [19, 5], [20, 6], [21, 7], [22, 8], [23, 9], [24, 9], [25, 9], [26, 9],
  [27, 8], [28, 8], [29, 7], [30, 6], [31, 5], [32, 4], [33, 3], [34, 2], [35, 1]];

export function makePlayer(game, rng, { nationId, pos, meanSkill, age, clubId }) {
  const year = game.season ? game.season.year : START_YEAR;
  const nat = game.nations[nationId];
  const { first, last } = personName(rng, nat.style);
  const ageAdj = age <= 19 ? -9 : age <= 21 ? -5 : age <= 23 ? -2 : age <= 30 ? 0 : age <= 32 ? -1 : -3;
  const skill = Math.round(clamp(rng.normal(meanSkill + ageAdj, 6.5), 18, 93));
  let gap;
  if (age <= 21) gap = rng.normal(12, 6) + (rng.chance(0.06) ? 10 : 0);
  else if (age <= 25) gap = rng.normal(5, 3);
  else if (age <= 28) gap = rng.normal(1.5, 1.5);
  else gap = 0;
  const potential = Math.round(clamp(skill + Math.max(0, gap), skill, 96));
  const p = {
    id: nextId(game, 'player', 'p'),
    first, last, nationId, pos,
    birthYear: year - age,
    skill, potential,
    form: rng.pick([-1, 0, 0, 0, 1]),
    energy: 100,
    injuryDays: 0, suspension: 0, yellows: 0,
    number: 0,
    clubId,
    contractEnd: year + rng.int(1, 4),
    listed: false,
    seasonStart: skill,
    stats: { season: { apps: 0, goals: 0, assists: 0, yellow: 0, red: 0 }, career: { apps: 0, goals: 0, assists: 0 } },
    retired: false,
  };
  splitSkill(p, rng);
  p.height = heightFor(pos, rng);
  // Own random stream, so adding personalities didn't change generated worlds.
  p.personality = rollPersonality(new Rng({ s: hashSeed(`${game.seed}:${p.id}`) }));
  p.xp = { tec: 0, phy: 0 };
  p.fatigue = 0;
  p.load = { acute: 1.5, chronic: 1.5 };
  p.seasonStart = p.skill;
  p.tecStart = p.tec;
  p.phyStart = p.phy;
  p.value = playerValue(p, year);
  p.wage = playerWage(p, year);
  return p;
}

function assignNumbers(game, club, rng) {
  const ps = club.squad.map((id) => game.players[id]);
  const by = (pos) => ps.filter((p) => p.pos === pos).sort((a, b) => b.skill - a.skill);
  const used = new Set();
  const give = (p, n) => { p.number = n; used.add(n); };
  const plan = { G: [1], D: [2, 3, 4, 5], M: [6, 8, 7, 10], F: [9, 11] };
  for (const pos of ['G', 'D', 'M', 'F']) {
    const list = by(pos);
    plan[pos].forEach((n, i) => list[i] && give(list[i], n));
  }
  const pool = rng.shuffle(Array.from({ length: 40 }, (_, i) => i + 12).filter((n) => !used.has(n)));
  for (const p of ps) if (!p.number) give(p, pool.pop());
}

function foreignNation(rng, homeId) {
  return rng.pick(NATIONS.filter((n) => n.id !== homeId)).id;
}

// AI clubs have a named manager (the user's club has the user).
export function makeManager(game, nationId, salt) {
  const nation = game.nations[nationId];
  const rng = new Rng({ s: hashSeed(`${game.seed}:mgr:${salt}`) });
  const { first, last } = personName(rng, nation.style);
  return { name: `${first} ${last}`, nationId };
}

// tpl (real-country world): [name, short, primary, secondary, pattern, stadium, capacity].
function makeClub(game, rng, nation, comp, rep, usedTowns, usedNames, tpl = null) {
  let name;
  let short;
  let colors;
  let stadiumTitle;
  let capacity;
  if (tpl) {
    [name, short] = tpl;
    colors = { primary: tpl[2], secondary: tpl[3], pattern: tpl[4] };
    stadiumTitle = tpl[5];
    capacity = tpl[6];
  } else {
    const town = townName(rng, nation.style, usedTowns);
    name = clubName(rng, nation.style, town);
    // Towns are unique per nation and every name template contains the town, so a
    // clash can only happen across nations.
    if (usedNames.has(name)) name = `${name} ${nation.adj}`;
    short = town;
    colors = makeColors(rng);
    stadiumTitle = stadiumName(rng, nation.style, town);
    capacity = Math.round((2000 + 600 * Math.exp(rep / 20) * rng.float(0.75, 1.25)) / 100) * 100;
  }
  usedNames.add(name);
  const club = {
    id: nextId(game, 'club', 'c'),
    name, short, baseName: name, nationId: nation.id, compId: comp.id,
    colors,
    crest: { shape: rng.pick(CREST_SHAPES), pattern: rng.pick(CREST_PATTERNS), c1: colors.primary,
      c2: colors.secondary, initials: initials(name) },
    stadium: { name: stadiumTitle, capacity, expansion: null },
    reputation: Math.round(rep),
    teamwork: rng.int(55, 75),
    budget: Math.round((1e5 * Math.exp(rep / 15) * rng.float(0.8, 1.2)) / 1000) * 1000,
    squad: [],
    tactics: { formation: rng.pick(['4-4-2', '4-4-2', '4-3-3', '4-5-1', '3-5-2', '5-3-2']), intent: 50,
      style: 'normal' },
    lineup: null,
    savedLineups: { A: null, B: null, C: null },
    finance: { season: emptyLedger(), history: [] },
    history: [],
    bTeamOf: null, // later: B-team cooperation
    scouting: null, // later: scouting network
  };
  game.clubs[club.id] = club;
  comp.clubIds.push(club.id);
  club.manager = makeManager(game, nation.id, club.id);

  const meanSkill = 30 + rep * 0.55 + nation.strength;
  for (const pos of SQUAD_TEMPLATE) {
    const age = rng.weighted(AGE_WEIGHTS, (w) => w[1])[0];
    const natId = rng.chance(0.18) ? foreignNation(rng, nation.id) : nation.id;
    const p = makePlayer(game, rng, { nationId: natId, pos, meanSkill, age, clubId: club.id });
    game.players[p.id] = p;
    club.squad.push(p.id);
  }
  assignNumbers(game, club, rng);
  return club;
}

// Guest countries and clubs (see guests.js). They use their own random
// numbers, so the rest of a seeded world is the same with or without them.
export function addGuests(game) {
  if (game.competitions[GUEST_COMP_ID]) return;
  const rng = new Rng({ s: hashSeed(`${game.seed}:guests`) });
  // Countries with a league of their own keep their entry; their clubs play
  // through the league, except a guest club that isn't in it (e.g. a cup winner
  // from a lower division in the first season).
  const league = (id) => !!game.nations[id]?.leagueIds.length;
  for (const n of GUEST_NATIONS) {
    if (league(n.id)) continue;
    const have = game.nations[n.id];
    // A players-only nation from a real-teams file keeps its entry and becomes a guest country.
    if (have) Object.assign(have, { style: n.style, strength: n.strength, foreign: true, guest: true });
    else {
      game.nations[n.id] = { id: n.id, name: n.name, baseName: n.name, adj: n.adj, style: n.style, flag: n.flag, kit: null,
        strength: n.strength, leagueIds: [], cupId: null, nationalTeam: null, foreign: true, guest: true };
    }
  }
  const comp = { id: GUEST_COMP_ID, type: 'guest', nationId: null, name: 'Guest clubs', baseName: 'Guest clubs',
    clubIds: [], table: {}, history: [] };
  game.competitions[comp.id] = comp;
  const usedNames = new Set(Object.values(game.clubs).map((c) => c.name));
  const inLeague = new Set(Object.values(game.clubs).map((c) => c.baseName || c.name));
  for (const [name, short, nationId, level, primary, secondary, pattern, stadium, capacity] of GUEST_CLUBS) {
    if (inLeague.has(name)) continue;
    const n = GUEST_NATIONS.find((x) => x.id === nationId);
    const club = makeClub(game, rng, n, comp, guestReputation(level, n.strength), new Set(), usedNames,
      [name, short, primary, secondary, pattern, stadium, capacity]);
    club.guest = true;
    club.lineup = autoLineup(game, club);
  }
}

export const isGuest = (club) => !!club?.guest;

// Older saves: the league countries added since (europe.js). A guest club of
// such a country joins its league with its squad and history; the other clubs
// are made new. The leagues and cups are scheduled from the next season (the
// current season's calendar is already fixed).
export function addLeagueCountries(game) {
  const rng = new Rng({ s: hashSeed(`${game.seed}:leagues`) });
  const usedNames = new Set(Object.values(game.clubs).map((c) => c.name));
  const byBase = new Map(Object.values(game.clubs).map((c) => [c.baseName || c.name, c]));
  const guests = game.competitions[GUEST_COMP_ID];
  for (const n of NATIONS.filter((x) => x.leagues && x.foreign)) {
    if (game.nations[n.id]?.leagueIds.length) continue;
    const nation = game.nations[n.id] || (game.nations[n.id] = { id: n.id, name: n.name, baseName: n.name, adj: n.adj, flag: n.flag, kit: null });
    Object.assign(nation, { style: n.style, strength: n.strength, leagueIds: [], cupId: null, nationalTeam: null, foreign: true });
    delete nation.guest;
    const cup = { id: `${n.id}-CUP`, type: 'cup', nationId: n.id, name: n.cup, baseName: n.cup, clubIds: [], rounds: [], alive: [], history: [] };
    n.leagues.forEach((leagueName, t) => {
      const comp = { id: `${n.id}-L${t + 1}`, type: 'league', nationId: n.id, tier: t + 1, name: leagueName, baseName: leagueName,
        clubIds: [], table: {}, fixtureIds: [], promote: t === 1 ? 3 : 0, relegate: t === 0 && n.leagues.length > 1 ? 3 : 0, history: [] };
      game.competitions[comp.id] = comp;
      nation.leagueIds.push(comp.id);
      for (const tpl of n.clubs[t]) {
        let club = byBase.get(tpl[0]);
        if (club?.guest) {
          // The guest becomes a league club.
          delete club.guest;
          if (guests) guests.clubIds = guests.clubIds.filter((id) => id !== club.id);
          club.compId = comp.id;
          comp.clubIds.push(club.id);
        } else {
          club = makeClub(game, rng, n, comp, guestReputation(tpl[7], n.strength), new Set(), usedNames, tpl);
          club.lineup = autoLineup(game, club);
        }
        comp.table[club.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
        cup.clubIds.push(club.id);
      }
    });
    game.competitions[cup.id] = cup;
    nation.cupId = cup.id;
    // Guest clubs of this country that aren't in its league stay guests.
  }
}

export function generateWorld({ seed = Date.now(), managerName = 'Manager' } = {}) {
  const rng = new Rng({ s: hashSeed(String(seed)) });
  const game = {
    version: GAME_VERSION,
    seed: String(seed),
    rng: rng.state,
    ids: {},
    day: 0,
    season: { year: START_YEAR },
    userClubId: null,
    manager: { name: managerName },
    settings: { matchSpeed: 2 },
    nations: {}, competitions: {}, clubs: {}, players: {}, fixtures: {},
    news: [], transfers: [],
    history: { seasons: [], trophies: [] },
  };

  for (const n of NATIONS) {
    game.nations[n.id] = { id: n.id, name: n.name, baseName: n.name, adj: n.adj, style: n.style, flag: n.flag,
      kit: n.kit || null, strength: n.strength, leagueIds: [], cupId: null, nationalTeam: null, ...(n.foreign ? { foreign: true } : {}) };
  }

  const usedNames = new Set();
  for (const n of NATIONS.filter((x) => x.leagues)) {
    const nation = game.nations[n.id];
    const usedTowns = new Set();
    const cup = { id: `${n.id}-CUP`, type: 'cup', nationId: n.id, name: n.cup, baseName: n.cup, clubIds: [], rounds: [],
      alive: [], history: [] };
    n.leagues.forEach((leagueName, t) => {
      const size = n.clubs ? n.clubs[t].length : n.sizes[t];
      const comp = { id: `${n.id}-L${t + 1}`, type: 'league', nationId: n.id, tier: t + 1, name: leagueName, baseName: leagueName,
        clubIds: [], table: {}, fixtureIds: [], promote: t === 1 ? 3 : 0, relegate: t === 0 && n.leagues.length > 1 ? 3 : 0, history: [] };
      game.competitions[comp.id] = comp;
      nation.leagueIds.push(comp.id);
      for (let i = 0; i < size; i++) {
        // Real-country leagues set their own level; the old fictional ones used a fixed one plus strength.
        const top = n.top ? n.top[t] : (t === 0 ? 88 : 58) + n.strength;
        const spread = t === 0 ? 28 : 26;
        // Countries from europe.js give each club's level (its researched squad strength).
        const level = n.clubs?.[t]?.[i]?.[7];
        const rep = level ? guestReputation(level, n.strength) : clamp(top - (i * spread) / (size - 1) + rng.normal(0, 3), 20, 95);
        const club = makeClub(game, rng, n, comp, rep, usedTowns, usedNames, n.clubs ? n.clubs[t][i] : null);
        cup.clubIds.push(club.id);
      }
    });
    game.competitions[cup.id] = cup;
    nation.cupId = cup.id;
  }

  // Real-country worlds: clubs from other countries for the European competitions.
  if (game.nations.ENG) addGuests(game);
  createContinental(game);
  createNational(game);
  initSeason(game, START_YEAR);
  for (const club of Object.values(game.clubs)) club.lineup = autoLineup(game, club);
  return game;
}

// Board target from the club's reputation rank within its league:
// { text, maxPos } where maxPos is the worst finish that meets it.
export function boardTarget(game, club) {
  const comp = game.competitions[club.compId];
  const rank = comp.clubIds.map((id) => game.clubs[id]).sort((a, b) => b.reputation - a.reputation)
    .findIndex((c) => c.id === club.id) + 1;
  const n = comp.clubIds.length;
  const safe = n - (comp.relegate || 3);
  // The clubs expected to finish in the bottom three are only asked not to finish last.
  const bottom = { text: 'Avoid finishing bottom', maxPos: n - 1 };
  if (comp.tier === 1) {
    // Only one club can win it, so the two favourites are asked to challenge (top three).
    if (rank <= 2) return { text: 'Challenge for the title', maxPos: 3 };
    if (rank <= 5) return { text: 'Finish in the top five', maxPos: 5 };
    if (rank <= n - 6) return { text: 'A comfortable mid-table finish', maxPos: n - 5 };
    return rank <= safe ? { text: 'Avoid relegation', maxPos: safe } : bottom;
  }
  if (rank <= 3) return { text: 'Win promotion', maxPos: comp.promote || 3 };
  if (rank <= 6) return { text: 'Challenge for the promotion places', maxPos: 6 };
  if (rank <= 9) return { text: 'A top-half finish', maxPos: Math.floor(n / 2) };
  return rank <= safe ? { text: comp.relegate ? 'Avoid relegation' : 'Stay out of the bottom three', maxPos: safe } : bottom;
}

export const boardExpectation = (game, club) => boardTarget(game, club).text;

export function startCareer(game, clubId, managerName) {
  game.userClubId = clubId;
  game.clubs[clubId].scouting = { level: 1, assignments: [], reports: {} };
  game.clubs[clubId].training = defaultTraining();
  initUserStaff(game);
  if (managerName) game.manager.name = managerName;
  game.manager.startYear = game.season.year;
  const club = game.clubs[clubId];
  const replaced = club.manager?.name;
  club.manager = null; // the user manages it
  initManager(game, club);
  startNationalJobs(game);
  const comp = game.competitions[club.compId];
  addNews(game, `The board expects you to: ${boardExpectation(game, club).toLowerCase()}.`, 'board');
  addNews(game, `${game.manager.name} has been appointed manager of ${club.name}${replaced ? `, replacing ${replaced}` : ''}.`, 'club');
  addNews(game, `The ${comp.name} season kicks off this weekend.`, 'league');
  return game;
}
