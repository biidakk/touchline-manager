// Hall of Fame: the user's trophy cabinet, achievements and the legends of
// the clubs he has managed.

import { ACHIEVEMENTS } from '../../core/achievements.js';
import { icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, bindActions } from '../util.js';
import { clubLink } from '../components/links.js';

export function render(root, ctx) {
  const g = ctx.game;
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;

  function draw() {
    const trophies = g.history?.trophies || [];
    const byName = {};
    for (const t of trophies) (byName[t.name] = byName[t.name] || []).push(t);
    const cabinet = Object.entries(byName).sort((a, b) => b[1].length - a[1].length).map(([name, list]) => `<div class="fame-trophy">
        ${icon('trophy')}<div><b>${esc(name)} ×${list.length}</b><div class="muted" style="font-size:12.5px">${list.map((t) => `${y(t.year)} ${esc(t.clubName)}`).join(' · ')}</div></div></div>`).join('')
      || '<div class="empty">No trophies yet: the first one is waiting.</div>';
    const got = g.achievements || {};
    const done = ACHIEVEMENTS.filter((a) => got[a.id]).length;
    const ach = ACHIEVEMENTS.map((a) => {
      const u = got[a.id];
      return `<div class="fame-ach ${u ? 'on' : ''}" title="${esc(a.text)}"><b>${u ? '★' : '☆'} ${esc(a.title)}</b>
        <div class="muted" style="font-size:12px">${u ? `${y(u.year)}${u.club ? ` · ${esc(u.club)}` : ''}${u.note ? ` · ${esc(u.note)}` : ''}` : esc(a.text)}</div></div>`;
    }).join('');
    // Legends: the players with most games and goals for the clubs he managed.
    const clubIds = [...new Set([...(g.manager.history || []).map((h) => h.clubId), g.userClubId].filter((id) => g.clubs[id]))];
    const legends = [];
    for (const id of clubIds) {
      const r = g.clubs[id].records;
      for (const p of Object.values(r?.players || {})) legends.push({ ...p, clubId: id });
    }
    const top = (key) => legends.slice().sort((a, b) => b[key] - a[key]).slice(0, 8);
    const legendRows = (key, label) => top(key).map((p) => `<tr><td><b>${esc(p.name)}</b></td><td class="c">${p.pos}</td>
      <td>${clubLink(g, p.clubId, { crest: 16, short: true })}</td><td class="num"><b>${p[key]}</b> ${label}</td></tr>`).join('');

    root.innerHTML = `${clubTopbar(ctx, { title: 'Hall of Fame' })}
    <div class="panel" style="left:20px;top:92px;width:380px;height:540px;display:flex;flex-direction:column">
      <h2>Trophy cabinet (${trophies.length})</h2>
      <div class="scroll" style="flex:1">${cabinet}</div>
    </div>
    <div class="panel" style="left:416px;top:92px;width:440px;height:540px;display:flex;flex-direction:column">
      <h2>Achievements (${done}/${ACHIEVEMENTS.length})</h2>
      <div class="scroll fame-achs" style="flex:1">${ach}</div>
    </div>
    <div class="panel" style="left:872px;top:92px;width:388px;height:540px;display:flex;flex-direction:column">
      <h2>Legends of your clubs</h2>
      <div class="scroll" style="flex:1">
        <table class="data compact"><tbody>${legendRows('apps', 'games') || '<tr><td class="empty">No records yet.</td></tr>'}</tbody></table>
        <h2 style="margin-top:10px;font-size:15px">Top scorers</h2>
        <table class="data compact"><tbody>${legendRows('goals', 'goals')}</tbody></table>
      </div>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, { back: () => ctx.back() });
  draw();
}
