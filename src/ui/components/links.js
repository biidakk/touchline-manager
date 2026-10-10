// Clickable names: a club name or crest opens that club on Other Teams, a
// player name opens his card. The click itself is handled once, in app.js,
// for every screen and dialog.

import { esc } from '../util.js';
import { crest } from './svg.js';

// opts: { short: use the short name, crest: crest size in px (0 = none), text: custom label }
export function clubLink(game, clubId, opts = {}) {
  const c = game.clubs[clubId];
  if (!c) return esc(opts.text ?? '');
  const label = esc(opts.text ?? (opts.short ? c.short : c.name));
  const badge = opts.crest ? `${crest(c.crest, opts.crest)} ` : '';
  return `<span class="lnk" data-club="${c.id}" title="${esc(c.name)}">${badge}${label}</span>`;
}

// opts: { text: custom label (default "First Last"), short: "F. Last" }
export function playerLink(game, playerId, opts = {}) {
  const p = game.players[playerId];
  if (!p) return esc(opts.text ?? '');
  const label = esc(opts.text ?? (opts.short ? `${p.first[0]}. ${p.last}` : `${p.first} ${p.last}`));
  return `<span class="lnk" data-player="${p.id}">${label}</span>`;
}

// Turns club names inside a sentence (news items) into links. Longest names
// first, so "Manchester Red" is not cut down to a shorter club's name.
let nameCache = null;
export function linkClubsInText(game, text) {
  const clubs = Object.values(game.clubs);
  const sig = clubs.map((c) => c.name).join('|'); // renames change the names
  if (!nameCache || nameCache.game !== game || nameCache.sig !== sig) {
    const byName = new Map(clubs.map((c) => [c.name, c.id]));
    const names = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    nameCache = { game, sig, byName, re: new RegExp(`(${names.join('|')})`) };
  }
  // split() with a capturing group alternates plain text and club names.
  return String(text).split(nameCache.re).map((part, i) => (i % 2
    ? `<span class="lnk" data-club="${nameCache.byName.get(part)}">${esc(part)}</span>`
    : esc(part))).join('');
}
