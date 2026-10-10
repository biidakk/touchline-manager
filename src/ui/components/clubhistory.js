// "Before the career": each club's real-world history and honours, from
// data/history/<nation>.json (one file per country, keyed by the club's
// original in-game name, so renamed clubs keep their history). The files are
// plain JSON so they can be checked and corrected by hand.

import { esc } from '../util.js';
import { icon } from './svg.js';

const cache = {}; // nationId -> data | null (missing) | Promise

export function historyFor(club) {
  const d = cache[club.nationId];
  if (!d || d instanceof Promise) return undefined; // not loaded yet
  return d[club.baseName || club.name] || null;
}

// Loads a country's file once; calls done() when it has arrived.
export function loadHistory(nationId, done) {
  if (cache[nationId] !== undefined) {
    if (cache[nationId] instanceof Promise) cache[nationId].then(done);
    return;
  }
  cache[nationId] = fetch(`data/history/${nationId}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => { cache[nationId] = d; done(); });
}

// "UEFA Cup 1973", "UEFA Cup 1976" -> "UEFA Cup ×2 (1973, 1976)"; other entries stay as they are.
function groupTrophies(list) {
  const groups = new Map();
  for (const item of list) {
    const m = /^(.*?)[\s,]+(\d{4}(?:\/\d{2,4})?)$/.exec(item.trim());
    const key = m ? m[1] : item;
    if (!groups.has(key)) groups.set(key, []);
    if (m) groups.get(key).push(m[2]);
  }
  return [...groups].map(([name, years]) => (years.length > 1 ? `${name} ×${years.length} (${years.join(', ')})` : years.length ? `${name} ${years[0]}` : name));
}

const count = (n, label) => (n ? `<b>${n}</b> ${label}` : '');

export function clubHistoryHtml(game, club) {
  const h = historyFor(club);
  if (h === undefined) return '<div class="empty">Loading…</div>';
  const inCareer = club.trophies || [];
  const careerHonours = Object.entries(inCareer.reduce((a, t) => ({ ...a, [t.name]: (a[t.name] || 0) + 1 }), {}))
    .map(([n, k]) => `${esc(n)} ×${k}`).join(', ');
  const since = game.manager?.startYear ?? game.history?.seasons?.[0]?.year ?? game.season.year;
  const right = `<div style="width:300px;flex:none">
      <h3 class="rec-h">Since ${since}/${String(since + 1).slice(2)} (your career)</h3>
      <div style="white-space:normal">${careerHonours || '<span class="dim">No trophies yet.</span>'}</div>
      <p class="hint" style="margin-top:10px">Seasons and club records from your career are on the Seasons and Records tabs.</p>
    </div>`;
  if (!h) {
    return `<div class="row" style="gap:20px;align-items:flex-start"><div style="flex:1" class="empty">No history on file for this club.</div>${right}</div>`;
  }
  const hon = h.honours || {};
  const lines = [count(hon.league, hon.league === 1 ? 'league title' : 'league titles'), count(hon.cup, hon.cup === 1 ? 'national cup' : 'national cups')]
    .filter(Boolean);
  return `<div class="row" style="gap:20px;align-items:flex-start">
    <div style="flex:1;min-width:0">
      <h3 class="rec-h">Before the career</h3>
      <p style="white-space:normal;line-height:1.45;margin:2px 0 10px">${esc(h.history || '')}</p>
      <div class="fin-list hist-facts" style="grid-template-columns:120px 1fr;margin-bottom:8px">
        ${h.founded ? `<span>Founded</span><b>${esc(String(h.founded))}</b>` : ''}
        ${h.nickname ? `<span>Nickname</span><b>${esc(h.nickname)}</b>` : ''}
        <span>Honours</span><b style="white-space:normal">${lines.join(' · ') || '<span class="dim">No major trophies</span>'}</b>
        ${hon.europe?.length ? `<span>In Europe</span><b style="white-space:normal">${groupTrophies(hon.europe).map(esc).join('<br>')}</b>` : ''}
        ${hon.other?.length ? `<span>Also</span><b style="white-space:normal">${hon.other.map(esc).join(' · ')}</b>` : ''}
      </div>
      ${h.best?.length ? `<h3 class="rec-h">Best achievements</h3>${h.best.map((b) => `<div class="row" style="gap:6px;padding:2px 0">${icon('trophy')}<span style="white-space:normal">${esc(b)}</span></div>`).join('')}` : ''}
      <p class="hint" style="margin-top:8px">Real-world history up to the 2024/25 season. Corrections: data/history/${club.nationId}.json.</p>
    </div>
    ${right}
  </div>`;
}
