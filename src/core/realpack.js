// Real teams and players for personal use: a "real pack" (realpack.json in
// the game folder, or a file loaded on the New Career screen) replaces the
// clubs' near-real names with real ones and their generated squads with real
// players. The pack is never shipped with the game.
//
// Format (see README "Real teams and players"):
//   { "format": "touchline-realpack", "season": "2026/27",
//     "clubs": { "<in-game club name>": { "real", "short", "stadium", "manager",
//       "players": [ { "name", "pos": "G|D|M|F", "born", "nation", "rating",
//                      "height"?, "number"?, "potential"? } ] } } }
//
// Ratings are on a video-game style 40-95 scale. They are turned into game
// skills so that every club keeps the strength the game gives it (half, and
// within 6 points) while following the real differences between clubs (half),
// and the players' order inside each club stays as in the pack.

import { Rng, clamp, hashSeed } from './rng.js';
import { makePlayer } from './worldgen.js';
import { splitSkill, heightFor } from './attributes.js';
import { playerValue, playerWage } from './valuation.js';
import { setClubName } from './renames.js';
import { autoLineup } from './ai.js';

export const PACK_FORMAT = 'touchline-realpack';
const POS = new Set(['G', 'D', 'M', 'F']);

// Nations without a league in the game: they only supply players (no
// national team). [id, name, name style, flag]
const FOREIGN = [
  ['ARG', 'Argentina', 'spanish', 'htri', ['#74acdf', '#ffffff', '#74acdf'], '#f6b40e'],
  ['BRA', 'Brazil', 'spanish', 'hband', ['#009c3b', '#ffdf00'], '#002776'],
  ['POR', 'Portugal', 'spanish', 'vtri', ['#006600', '#ff0000', '#ff0000'], '#ffcc00'],
  ['NED', 'Netherlands', 'german', 'htri', ['#ae1c28', '#ffffff', '#21468b']],
  ['BEL', 'Belgium', 'french', 'vtri', ['#000000', '#fdda24', '#ef3340']],
  ['SUI', 'Switzerland', 'german', 'cross', ['#d52b1e', '#ffffff']],
  ['AUT', 'Austria', 'german', 'htri', ['#ed2939', '#ffffff', '#ed2939']],
  ['DEN', 'Denmark', 'nordic', 'nordic', ['#c8102e', '#ffffff', '#ffffff']],
  ['SWE', 'Sweden', 'nordic', 'nordic', ['#006aa7', '#fecc00', '#fecc00']],
  ['NOR', 'Norway', 'nordic', 'nordic', ['#ba0c2f', '#ffffff', '#00205b']],
  ['FIN', 'Finland', 'nordic', 'nordic', ['#ffffff', '#002f6c', '#002f6c']],
  ['ISL', 'Iceland', 'nordic', 'nordic', ['#02529c', '#ffffff', '#dc1e35']],
  ['SCO', 'Scotland', 'english', 'diag', ['#005eb8', '#ffffff', '#005eb8']],
  ['WAL', 'Wales', 'english', 'hbi', ['#ffffff', '#00b140'], '#c8102e'],
  ['NIR', 'Northern Ireland', 'english', 'cross', ['#ffffff', '#c8102e']],
  ['IRL', 'Republic of Ireland', 'english', 'vtri', ['#169b62', '#ffffff', '#ff883e']],
  ['POL', 'Poland', 'slavic', 'hbi', ['#ffffff', '#dc143c']],
  ['SVK', 'Slovakia', 'czech', 'htri', ['#ffffff', '#0b4ea2', '#ee1c25']],
  ['SVN', 'Slovenia', 'slavic', 'htri', ['#ffffff', '#005da4', '#ed1c24']],
  ['CRO', 'Croatia', 'slavic', 'htri', ['#ff0000', '#ffffff', '#171796']],
  ['SRB', 'Serbia', 'slavic', 'htri', ['#c6363c', '#0c4076', '#ffffff']],
  ['BIH', 'Bosnia and Herzegovina', 'slavic', 'diag', ['#002395', '#fecb00', '#002395']],
  ['MNE', 'Montenegro', 'slavic', 'hband', ['#c40308', '#c40308'], '#d4af3a'],
  ['MKD', 'North Macedonia', 'slavic', 'hband', ['#d20000', '#ffe600']],
  ['ALB', 'Albania', 'slavic', 'hband', ['#e41e20', '#e41e20'], '#000000'],
  ['KOS', 'Kosovo', 'slavic', 'hband', ['#244aa5', '#244aa5'], '#d0a650'],
  ['UKR', 'Ukraine', 'slavic', 'hbi', ['#0057b7', '#ffd700']],
  ['RUS', 'Russia', 'slavic', 'htri', ['#ffffff', '#0039a6', '#d52b1e']],
  ['BLR', 'Belarus', 'slavic', 'hbi', ['#c8313e', '#4aa657']],
  ['HUN', 'Hungary', 'slavic', 'htri', ['#ce2939', '#ffffff', '#477050']],
  ['ROU', 'Romania', 'romance', 'vtri', ['#002b7f', '#fcd116', '#ce1126']],
  ['BUL', 'Bulgaria', 'slavic', 'htri', ['#ffffff', '#00966e', '#d62612']],
  ['GRE', 'Greece', 'romance', 'hband', ['#0d5eaf', '#ffffff']],
  ['TUR', 'Turkey', 'west', 'hband', ['#e30a17', '#e30a17'], '#ffffff'],
  ['GEO', 'Georgia', 'slavic', 'cross', ['#ffffff', '#ff0000']],
  ['ARM', 'Armenia', 'slavic', 'htri', ['#d90012', '#0033a0', '#f2a800']],
  ['ISR', 'Israel', 'west', 'hband', ['#ffffff', '#0038b8']],
  ['LTU', 'Lithuania', 'slavic', 'htri', ['#fdb913', '#006a44', '#c1272d']],
  ['LVA', 'Latvia', 'slavic', 'hband', ['#9e3039', '#ffffff']],
  ['EST', 'Estonia', 'nordic', 'htri', ['#0072ce', '#000000', '#ffffff']],
  ['LUX', 'Luxembourg', 'french', 'htri', ['#ed2939', '#ffffff', '#00a1de']],
  ['URU', 'Uruguay', 'spanish', 'hband', ['#ffffff', '#0038a8'], '#fcd116'],
  ['COL', 'Colombia', 'spanish', 'htri', ['#fcd116', '#003893', '#ce1126']],
  ['ECU', 'Ecuador', 'spanish', 'htri', ['#ffdd00', '#034ea2', '#ed1c24']],
  ['PAR', 'Paraguay', 'spanish', 'htri', ['#d52b1e', '#ffffff', '#0038a8']],
  ['CHI', 'Chile', 'spanish', 'hbi', ['#ffffff', '#d52b1e'], '#0039a6'],
  ['PER', 'Peru', 'spanish', 'vtri', ['#d91023', '#ffffff', '#d91023']],
  ['VEN', 'Venezuela', 'spanish', 'htri', ['#ffcc00', '#00247d', '#cf142b']],
  ['MEX', 'Mexico', 'spanish', 'vtri', ['#006847', '#ffffff', '#ce1126']],
  ['USA', 'USA', 'anglo', 'hband', ['#b22234', '#ffffff'], '#3c3b6e'],
  ['CAN', 'Canada', 'anglo', 'vtri', ['#d80621', '#ffffff', '#d80621'], '#d80621'],
  ['JAM', 'Jamaica', 'anglo', 'diag', ['#009b3a', '#fed100', '#000000']],
  ['CRC', 'Costa Rica', 'spanish', 'hband', ['#002b7f', '#ce1126']],
  ['HON', 'Honduras', 'spanish', 'htri', ['#0073cf', '#ffffff', '#0073cf']],
  ['PAN', 'Panama', 'spanish', 'hbi', ['#ffffff', '#da121a']],
  ['MAR', 'Morocco', 'west', 'hband', ['#c1272d', '#c1272d'], '#006233'],
  ['ALG', 'Algeria', 'west', 'vtri', ['#006633', '#ffffff', '#ffffff'], '#d21034'],
  ['TUN', 'Tunisia', 'west', 'hband', ['#e70013', '#e70013'], '#ffffff'],
  ['EGY', 'Egypt', 'west', 'htri', ['#ce1126', '#ffffff', '#000000']],
  ['SEN', 'Senegal', 'west', 'vtri', ['#00853f', '#fdef42', '#e31b23']],
  ['MLI', 'Mali', 'west', 'vtri', ['#14b53a', '#fcd116', '#ce1126']],
  ['CIV', 'Ivory Coast', 'west', 'vtri', ['#f77f00', '#ffffff', '#009e60']],
  ['GHA', 'Ghana', 'west', 'htri', ['#ce1126', '#fcd116', '#006b3f']],
  ['NGA', 'Nigeria', 'west', 'vtri', ['#008751', '#ffffff', '#008751']],
  ['CMR', 'Cameroon', 'west', 'vtri', ['#007a5e', '#ce1126', '#fcd116']],
  ['GUI', 'Guinea', 'west', 'vtri', ['#ce1126', '#fcd116', '#009460']],
  ['BFA', 'Burkina Faso', 'west', 'hbi', ['#ef2b2d', '#009e49'], '#fcd116'],
  ['GAB', 'Gabon', 'west', 'htri', ['#009e60', '#fcd116', '#3a75c4']],
  ['COD', 'DR Congo', 'west', 'diag', ['#007fff', '#ce1021', '#007fff']],
  ['CGO', 'Congo', 'west', 'diag', ['#009543', '#fbde4a', '#dc241f']],
  ['ANG', 'Angola', 'west', 'hbi', ['#cc092f', '#000000'], '#ffcb00'],
  ['GAM', 'Gambia', 'west', 'htri', ['#ce1126', '#0c1c8c', '#3a7728']],
  ['TOG', 'Togo', 'west', 'htri', ['#006a4e', '#ffce00', '#006a4e']],
  ['BEN', 'Benin', 'west', 'hbi', ['#fcd116', '#e8112d']],
  ['ZAM', 'Zambia', 'west', 'hband', ['#198a00', '#198a00'], '#ef7d00'],
  ['ZIM', 'Zimbabwe', 'west', 'htri', ['#006400', '#ffd200', '#d40000']],
  ['RSA', 'South Africa', 'west', 'diag', ['#007a4d', '#ffb612', '#de3831']],
  ['CPV', 'Cape Verde', 'west', 'hband', ['#003893', '#ffffff']],
  ['GNB', 'Guinea-Bissau', 'west', 'hbi', ['#fcd116', '#009e49'], '#ce1126'],
  ['EQG', 'Equatorial Guinea', 'west', 'htri', ['#3e9a00', '#ffffff', '#e32118']],
  ['MAD', 'Madagascar', 'west', 'hbi', ['#fc3d32', '#007e3a']],
  ['COM', 'Comoros', 'west', 'htri', ['#ffc61e', '#3a75c4', '#ce1126']],
  ['JPN', 'Japan', 'anglo', 'hband', ['#ffffff', '#ffffff'], '#bc002d'],
  ['KOR', 'South Korea', 'anglo', 'hband', ['#ffffff', '#ffffff'], '#cd2e3a'],
  ['CHN', 'China', 'anglo', 'hband', ['#de2910', '#de2910'], '#ffde00'],
  ['IRN', 'Iran', 'west', 'htri', ['#239f40', '#ffffff', '#da0000']],
  ['IRQ', 'Iraq', 'west', 'htri', ['#ce1126', '#ffffff', '#000000']],
  ['KSA', 'Saudi Arabia', 'west', 'hband', ['#006c35', '#006c35'], '#ffffff'],
  ['UZB', 'Uzbekistan', 'west', 'htri', ['#0099b5', '#ffffff', '#1eb53a']],
  ['AUS', 'Australia', 'anglo', 'hband', ['#012169', '#012169'], '#ffffff'],
  ['NZL', 'New Zealand', 'anglo', 'hband', ['#012169', '#012169'], '#c8102e'],
  ['CYP', 'Cyprus', 'romance', 'hband', ['#ffffff', '#ffffff'], '#d57800'],
  ['MLT', 'Malta', 'romance', 'vtri', ['#ffffff', '#ffffff', '#cf142b']],
  ['FRO', 'Faroe Islands', 'nordic', 'nordic', ['#ffffff', '#0065bd', '#ef303e']],
  ['SUR', 'Suriname', 'anglo', 'htri', ['#377e3f', '#b40a2d', '#377e3f'], '#ecc81d'],
  ['CUW', 'Curaçao', 'anglo', 'hband', ['#002b7f', '#f9e814']],
  ['HAI', 'Haiti', 'french', 'hbi', ['#00209f', '#d21034']],
  ['MTQ', 'Martinique', 'french', 'diag', ['#00a650', '#e31b23', '#000000']],
  ['GLP', 'Guadeloupe', 'french', 'hband', ['#e31b23', '#e31b23'], '#fcd116'],
  ['GUF', 'French Guiana', 'french', 'diag', ['#00a650', '#fcd116', '#00a650']],
  ['CTA', 'Central African Republic', 'west', 'htri', ['#003082', '#ffffff', '#289728'], '#ffce00'],
  ['IDN', 'Indonesia', 'west', 'hbi', ['#ce1126', '#ffffff']],
  ['MTN', 'Mauritania', 'west', 'hband', ['#00a95c', '#00a95c'], '#ffd700'],
  ['TRI', 'Trinidad and Tobago', 'anglo', 'diag', ['#ce1126', '#000000', '#ce1126']],
  ['BDI', 'Burundi', 'west', 'diag', ['#ce1126', '#1eb53a', '#ce1126'], '#ffffff'],
  ['DOM', 'Dominican Republic', 'spanish', 'cross', ['#002d62', '#ffffff']],
  ['UGA', 'Uganda', 'west', 'htri', ['#000000', '#fcdc04', '#d90000']],
  ['SLE', 'Sierra Leone', 'west', 'htri', ['#1eb53a', '#ffffff', '#0072c6']],
  ['JOR', 'Jordan', 'west', 'htri', ['#000000', '#ffffff', '#007a3d'], '#ce1126'],
  ['PHI', 'Philippines', 'anglo', 'hbi', ['#0038a8', '#ce1126'], '#fcd116'],
  ['THA', 'Thailand', 'anglo', 'htri', ['#a51931', '#2d2a4a', '#a51931']],
  ['OTH', 'Other', 'west', 'hband', ['#8a96ad', '#c9d1e0']],
];

// Names the research may use for the same country.
const ALIASES = {
  'england': 'ENG', 'spain': 'ESP', 'italy': 'ITA', 'germany': 'GER', 'france': 'FRA', 'czech republic': 'CZE',
  'czechia': 'CZE', 'côte d\'ivoire': 'CIV', "cote d'ivoire": 'CIV', 'korea republic': 'KOR', 'republic of korea': 'KOR',
  'ireland': 'IRL', 'united states': 'USA', 'united states of america': 'USA', 'bosnia-herzegovina': 'BIH', 'bosnia': 'BIH',
  'congo dr': 'COD', 'democratic republic of the congo': 'COD', 'dr congo': 'COD', 'republic of the congo': 'CGO',
  'türkiye': 'TUR', 'turkiye': 'TUR', 'cabo verde': 'CPV', 'macedonia': 'MKD', 'the gambia': 'GAM', 'holland': 'NED',
  'great britain': 'ENG', 'united kingdom': 'ENG', 'ir iran': 'IRN', 'curacao': 'CUW',
};

const NAME_TO_ID = Object.fromEntries([
  ...FOREIGN.map((f) => [f[1].toLowerCase(), f[0]]), ...Object.entries(ALIASES)]);

// The game nation for a country name, adding a players-only nation if needed.
export function nationFor(game, name) {
  const key = String(name || '').trim().toLowerCase();
  const own = Object.values(game.nations).find((n) => !n.foreign && (n.baseName || n.name).toLowerCase() === key);
  if (own) return own.id;
  const id = NAME_TO_ID[key] || 'OTH';
  if (!game.nations[id]) {
    const f = FOREIGN.find((x) => x[0] === id);
    if (!f) return nationFor(game, 'Other');
    game.nations[id] = { id, name: f[1], baseName: f[1], adj: f[1], style: f[2], flag: { layout: f[3], colors: f[4], ...(f[5] ? { emblem: f[5] } : {}) },
      kit: null, strength: 0, leagueIds: [], cupId: null, nationalTeam: null, foreign: true };
  }
  return id;
}

// Problems that make a pack unusable (an empty list means it's fine).
export function checkPack(pack) {
  if (!pack || typeof pack !== 'object') return ['The file is not a real-teams file.'];
  if (pack.format !== PACK_FORMAT) return ['This is not a Touchline real-teams file (format "touchline-realpack").'];
  if (!pack.clubs || typeof pack.clubs !== 'object' || !Object.keys(pack.clubs).length) return ['The file has no clubs.'];
  return [];
}

const top = (xs, n) => xs.slice().sort((a, b) => b - a).slice(0, n);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function usablePlayers(list) {
  return (list || []).filter((e) => e && typeof e.name === 'string' && e.name.trim() && POS.has(e.pos) && Number.isFinite(Number(e.rating)));
}

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  return parts.length === 1 ? { first: '', last: parts[0] } : { first: parts.slice(0, -1).join(' '), last: parts.at(-1) };
}

// Applies a pack to a freshly generated world (before the career starts).
// Returns { clubs, players, skipped } for the New Career screen.
export function applyRealPack(game, pack) {
  if (checkPack(pack).length) return { clubs: 0, players: 0, skipped: [] };
  const year = game.season.year;
  const rng = new Rng({ s: hashSeed(`${game.seed}:realpack`) });
  const byBase = new Map(Object.values(game.clubs).map((c) => [c.baseName || c.name, c]));
  const jobs = [];
  const skipped = [];
  for (const [name, e] of Object.entries(pack.clubs)) {
    const club = byBase.get(name);
    if (!club || !e) { skipped.push(name); continue; }
    const players = usablePlayers(e.players);
    const enough = players.length >= 16 && players.filter((p) => p.pos === 'G').length >= 2;
    const target = mean(top(club.squad.map((id) => game.players[id].skill), 14));
    const rating = mean(top(players.map((p) => Number(p.rating)), 14));
    jobs.push({ club, e, players: enough ? players : null, target, rating });
    if (!enough) skipped.push(`${name} (squad too small, names only)`);
  }

  // Ratings to skills: a straight line fitted over all clubs (real
  // differences between clubs), averaged with each club's own level in the
  // game (keeps the game's balance).
  const fit = jobs.filter((j) => j.players);
  let a = 0;
  let b = 1;
  if (fit.length >= 3) {
    const mx = mean(fit.map((j) => j.rating));
    const my = mean(fit.map((j) => j.target));
    const sxx = fit.reduce((s, j) => s + (j.rating - mx) ** 2, 0);
    b = sxx ? clamp(fit.reduce((s, j) => s + (j.rating - mx) * (j.target - my), 0) / sxx, 0.5, 1.6) : 1;
    a = my - b * mx;
  } else if (fit.length) a = mean(fit.map((j) => j.target - j.rating));

  // Guest clubs (European competitions only): real names, generated squads.
  for (const [name, real] of Object.entries(pack.guests || {})) {
    const club = byBase.get(name);
    if (club?.guest && typeof real === 'string' && real.trim()) setClubName(game, club, real.trim(), real.trim().length <= 14 ? real.trim() : null);
  }

  let count = 0;
  for (const { club, e, players, target, rating } of jobs) {
    if (typeof e.real === 'string' && e.real.trim()) setClubName(game, club, e.real.trim(), typeof e.short === 'string' && e.short.trim() ? e.short.trim().slice(0, 14) : null);
    if (typeof e.stadium === 'string' && e.stadium.trim()) club.stadium.name = e.stadium.trim();
    if (typeof e.manager === 'string' && e.manager.trim() && club.manager) club.manager.name = e.manager.trim();
    if (!players) continue;
    for (const id of club.squad) delete game.players[id];
    club.squad = [];
    const used = new Set();
    for (const r of players) {
      // The club's level: halfway between the fitted line and its level in the
      // game, but never more than 6 away from the game's (a real fourth-tier side
      // in a second division would otherwise be hopeless).
      const level = clamp(0.5 * (a + b * rating) + 0.5 * target, target - 6, target + 6);
      const toSkill = (v) => level + (v - rating) * (0.5 * b + 0.5);
      const born = Number(r.born);
      const age = Number.isFinite(born) && born > 1950 ? clamp(year - born, 15, 45) : 25;
      const nationId = nationFor(game, r.nation);
      const p = makePlayer(game, rng, { nationId, pos: r.pos, meanSkill: 60, age, clubId: club.id });
      Object.assign(p, splitName(r.name));
      p.skill = Math.round(clamp(toSkill(Number(r.rating)), 18, 95));
      const pot = Number(r.potential);
      if (Number.isFinite(pot) && pot > Number(r.rating) && age <= 25) p.potential = Math.round(clamp(toSkill(pot), p.skill, 97));
      else {
        const gap = age <= 21 ? rng.normal(10, 5) : age <= 25 ? rng.normal(4, 3) : age <= 28 ? rng.normal(1, 1) : 0;
        p.potential = Math.round(clamp(p.skill + Math.max(0, gap), p.skill, 96));
      }
      splitSkill(p, rng);
      const h = Number(r.height);
      p.height = Number.isFinite(h) && h >= 150 && h <= 210 ? Math.round(h) : heightFor(p.pos, rng);
      const n = Number(r.number);
      if (Number.isInteger(n) && n >= 1 && n <= 99 && !used.has(n)) { p.number = n; used.add(n); } else p.number = 0;
      p.seasonStart = p.skill;
      p.tecStart = p.tec;
      p.phyStart = p.phy;
      p.value = playerValue(p, year);
      p.wage = playerWage(p, year);
      game.players[p.id] = p;
      club.squad.push(p.id);
      count++;
    }
    // Players without a (free) number get the lowest free ones from 12.
    let next = 12;
    for (const id of club.squad) {
      const p = game.players[id];
      if (p.number) continue;
      while (used.has(next)) next++;
      p.number = next;
      used.add(next);
    }
    club.lineup = autoLineup(game, club);
    club.savedLineups = { A: null, B: null, C: null };
  }
  // Real league and cup names ({ "Premier Division": "Premier League" }).
  const comps = { ...(pack.leagues || {}), ...(pack.cups || {}) };
  for (const c of Object.values(game.competitions)) {
    const to = comps[c.baseName || c.name];
    if (typeof to === 'string' && to.trim()) { c.baseName = c.baseName || c.name; c.name = to.trim(); }
  }
  game.realPack = { season: pack.season || null, clubs: jobs.length, players: count };
  return { clubs: jobs.length, players: count, skipped };
}
