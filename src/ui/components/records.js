// History and records panels for a club or a national team (kept since the
// career began).

import { esc } from '../util.js';

const yr = (y) => `${y}/${String(y + 1).slice(2)}`;
const KIND = { league: 'League', cup: 'Cup', continental: 'Champions Cup', intl: 'Internationals' };

function result(e, withComp = false) {
  if (!e) return '<span class="dim">-</span>';
  return `<b>${e.gf}:${e.ga}</b> ${e.home ? 'vs' : 'at'} ${esc(e.opp)} <span class="muted">(${withComp ? `${esc(e.comp)}, ` : ''}${yr(e.year)})</span>`;
}

// Live records: the stored totals plus the current season's spells, so a
// scorer's goals count straight away.
function allTime(game, team, national) {
  const r = team.records || { players: {}, seasons: [] };
  const rows = {};
  for (const [id, e] of Object.entries(r.players)) rows[id] = { id, ...e };
  if (!national) {
    for (const id of [...team.squad, ...(team.youth || [])]) {
      const p = game.players[id];
      const s = p?.spell;
      if (!s || s.clubId !== team.id) continue;
      const e = (rows[id] ||= { id, name: `${p.first} ${p.last}`, pos: p.pos, apps: 0, goals: 0, assists: 0, from: game.season.year, to: game.season.year });
      rows[id] = { ...e, apps: e.apps + s.apps, goals: e.goals + s.goals, assists: e.assists + s.assists, to: game.season.year };
    }
  }
  return Object.values(rows);
}

function bestSeasons(game, team, national) {
  const list = (team.records?.seasons || []).slice();
  if (!national) {
    for (const id of team.squad) {
      const p = game.players[id];
      if (p?.spell?.clubId === team.id && p.spell.goals) list.push({ playerId: id, name: `${p.first} ${p.last}`, goals: p.spell.goals, year: game.season.year, now: true });
    }
  }
  return list.sort((a, b) => b.goals - a.goals || a.year - b.year).slice(0, 5);
}

// opts: { national } ; returns the inner HTML of a records view (two columns).
export function recordsHtml(game, team, { national = false } = {}) {
  const r = team.records || {};
  const players = allTime(game, team, national);
  const current = new Set(team.squad || []);
  const list = (key, label, unit) => {
    const top = players.filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key] || a.from - b.from).slice(0, 10);
    return `<h3 class="rec-h">${label}</h3><table class="data compact">${top.map((p, i) => `<tr class="${game.players[p.id] ? 'click' : ''}" ${game.players[p.id] ? `data-action="player" data-id="${p.id}"` : ''}>
      <td class="num" style="width:22px">${i + 1}.</td><td><b>${esc(p.name)}</b> <span class="muted">${p.pos || ''}</span>${current.has(p.id) ? ' <span class="good" title="In the current squad">●</span>' : ''}</td>
      <td class="muted">${p.from === p.to ? yr(p.from) : `${p.from}–${String(p.to + 1).slice(2)}`}</td><td class="num"><b>${p[key]}</b> ${unit}</td></tr>`).join('')
      || '<tr><td class="dim">None yet.</td></tr>'}</table>`;
  };
  const seasons = bestSeasons(game, team, national);
  const kinds = national ? ['intl'] : ['league', 'cup', 'continental'];
  // The national panel is narrow: one column there.
  return `<div class="row" style="gap:${national ? 4 : 18}px;align-items:${national ? 'stretch;flex-direction:column' : 'flex-start'}">
    <div style="flex:1;min-width:0">
      ${list('goals', national ? 'All-time top scorers' : 'All-time top scorers (best historic strikers)', 'goals')}
      ${list('apps', national ? 'Most caps' : 'Most appearances', national ? 'caps' : 'apps')}
    </div>
    <div style="flex:1;min-width:0">
      ${national ? '' : `<h3 class="rec-h" style="margin-top:0">Most goals in one season</h3><table class="data compact">${seasons.map((s) => `<tr class="${game.players[s.playerId] ? 'click' : ''}" ${game.players[s.playerId] ? `data-action="player" data-id="${s.playerId}"` : ''}>
        <td><b>${esc(s.name)}</b></td><td class="muted">${yr(s.year)}${s.now ? ' (so far)' : ''}</td><td class="num"><b>${s.goals}</b> goals</td></tr>`).join('') || '<tr><td class="dim">None yet.</td></tr>'}</table>`}
      <h3 class="rec-h">Biggest wins</h3><table class="data compact rec-wrap">${kinds.map((k) => `<tr><td style="width:110px">${KIND[k]}</td><td>${result(r.wins?.[k])}</td></tr>`).join('')}</table>
      <h3 class="rec-h">Heaviest defeat</h3><table class="data compact rec-wrap"><tr><td>${result(r.defeat, true)}</td></tr></table>
      ${national ? '' : `<h3 class="rec-h">Record crowd</h3><table class="data compact rec-wrap"><tr><td>${r.crowd ? `<b>${r.crowd.n.toLocaleString('en-US')}</b> vs ${esc(r.crowd.opp)} <span class="muted">(${yr(r.crowd.year)})</span>` : '<span class="dim">-</span>'}</td></tr></table>`}
      <p class="hint" style="margin-top:8px">Records are kept from the first season of your career.</p>
    </div>
  </div>`;
}

// Season-by-season table for a club.
export function clubSeasonsHtml(game, club) {
  const h = (club.history || []).slice().reverse();
  if (!h.length) return '<div class="empty">No completed seasons yet.</div>';
  return `<table class="data compact"><thead><tr><th>Season</th><th>League</th><th class="num">Pos</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Goals</th><th class="num">Pts</th><th>Cup</th></tr></thead>
    <tbody>${h.map((s) => `<tr><td>${yr(s.year)}</td><td>${esc(s.compName)}</td><td class="num"><b>${s.pos}.</b></td><td class="num">${s.p}</td><td class="num">${s.w}</td>
      <td class="num">${s.d}</td><td class="num">${s.l}</td><td class="num">${s.gf}:${s.ga}</td><td class="num">${s.pts}</td><td>${esc(s.cup || '-')}</td></tr>`).join('')}</tbody></table>`;
}
