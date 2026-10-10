// Your own names for the world: names.json in the game folder (see the
// example in it) and in-game renames.
//
// names.json maps the game's original names to yours:
//   nations  { "England": "England" }
//   leagues  { "Premier Division": "..." }          (cups too)
//   clubs    { "Manchester Blue": "New name" } or { "Manchester Blue": { "name", "short", "stadium", "manager" } }
//   players  { "Harry Smith": "New Name" }          (every player with that name)
// Entries are matched on the original names, so the file can be applied again
// at every load and edited at any time.

import { initials } from './names.js';

const val = (x) => (typeof x === 'string' ? x.trim() : x);

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: '', last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) };
}

// Older worlds don't record original names: what they are called now is the original.
function ensureBase(game) {
  for (const n of Object.values(game.nations)) n.baseName = n.baseName || n.name;
  for (const c of Object.values(game.competitions)) c.baseName = c.baseName || c.name;
  for (const c of Object.values(game.clubs)) c.baseName = c.baseName || c.name;
}

export function setClubName(game, club, name, short) {
  if (name) {
    club.name = name;
    club.crest.initials = initials(name);
  }
  if (short) club.short = short;
}

export function setPlayerName(p, full) {
  const { first, last } = splitName(full);
  if (!last) return false;
  p.first = first;
  p.last = last;
  return true;
}

// Returns how many names were changed.
export function applyRenames(game, data) {
  if (!data || typeof data !== 'object') return 0;
  ensureBase(game);
  let n = 0;
  const nations = data.nations || {};
  for (const nat of Object.values(game.nations)) {
    const to = val(nations[nat.baseName]);
    if (typeof to === 'string' && to && to !== nat.name) {
      nat.name = to;
      n++;
      for (const t of Object.values(game.national?.teams || {})) {
        if (t.nationId === nat.id) t.name = t.short = t.level === 'u21' ? `${to} U21` : to;
      }
    }
  }
  const comps = { ...(data.leagues || {}), ...(data.cups || {}) };
  for (const c of Object.values(game.competitions)) {
    const to = val(comps[c.baseName]);
    if (typeof to === 'string' && to && to !== c.name) { c.name = to; n++; }
  }
  const clubs = data.clubs || {};
  for (const club of Object.values(game.clubs)) {
    let e = clubs[club.baseName];
    if (!e) continue;
    if (typeof e === 'string') e = { name: e };
    const before = `${club.name}|${club.short}|${club.stadium.name}|${club.manager?.name}`;
    setClubName(game, club, val(e.name), val(e.short));
    if (val(e.stadium)) club.stadium.name = val(e.stadium);
    if (val(e.manager) && club.manager) club.manager.name = val(e.manager);
    if (before !== `${club.name}|${club.short}|${club.stadium.name}|${club.manager?.name}`) n++;
  }
  const players = data.players || {};
  if (Object.keys(players).length) {
    for (const p of Object.values(game.players)) {
      const to = val(players[`${p.first} ${p.last}`]);
      if (typeof to === 'string' && to && setPlayerName(p, to)) n++;
    }
  }
  return n;
}
