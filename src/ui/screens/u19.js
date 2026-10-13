// U-19 league of the user's league: the table, our results and fixtures, and
// the U-19 squad (academy plus first-team players sent down).

import { ensureYouthLeague, u19Table, u19Squad, u19Eligible, setU19, U19_MAX_AGE } from '../../core/youthleague.js';
import { fmtDate } from '../../core/calendar.js';
import { ageOf } from '../../core/valuation.js';
import { potText } from '../../core/scouting.js';
import { crest } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, bindActions, fullName } from '../util.js';
import { clubLink } from '../components/links.js';

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const year = g.season.year;

  function draw() {
    const yl = ensureYouthLeague(g);
    const inLeague = yl && yl.clubIds.includes(club.id);
    const table = u19Table(g);
    const mine = yl ? yl.fixtures.filter((f) => f.h === club.id || f.a === club.id) : [];
    const played = mine.filter((f) => f.result).slice(-6).reverse();
    const next = mine.filter((f) => !f.result).slice(0, 4);
    const squad = u19Squad(g).sort((a, b) => b.skill - a.skill);
    const eligibleFirst = club.squad.map((id) => g.players[id]).filter((p) => u19Eligible(g, p)).sort((a, b) => b.skill - a.skill);
    const res = (f) => {
      const home = f.h === club.id;
      const opp = home ? f.a : f.h;
      const r = f.result;
      const o = r ? ((home ? r.h - r.a : r.a - r.h) > 0 ? 'W' : r.h === r.a ? 'D' : 'L') : '';
      return `<tr><td class="muted">${fmtDate(f.day, false)}</td><td>${home ? 'H' : 'A'}</td><td>${clubLink(g, opp, { crest: 18, short: true })}</td>
        <td class="num"><b>${r ? `${r.h}:${r.a}` : '-'}</b></td><td class="c">${o ? `<span class="res-badge ${o}" style="width:20px;height:20px;font-size:11px">${o}</span>` : ''}</td></tr>`;
    };
    root.innerHTML = `${clubTopbar(ctx, { title: yl ? yl.name : 'U-19 league' })}
    <div class="panel" style="left:20px;top:92px;width:420px;height:540px;display:flex;flex-direction:column">
      <h2>Table</h2>
      <div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th class="num">#</th><th>Club</th><th class="num">P</th><th class="num phone-hide">GD</th><th class="num">Pts</th></tr></thead>
        <tbody>${table.map((r, i) => `<tr class="${r.clubId === club.id ? 'me' : ''}"><td class="num">${i + 1}.</td>
          <td>${crest(g.clubs[r.clubId].crest, 16)} ${esc(g.clubs[r.clubId].short)}</td><td class="num">${r.p}</td><td class="num phone-hide">${r.gf - r.ga}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')
          || '<tr><td class="empty" colspan="5">The U-19 league starts with the season.</td></tr>'}</tbody></table></div>
      ${yl?.history?.length ? `<div class="muted" style="font-size:12.5px;margin-top:6px">Last champions: ${yl.history.slice(-3).reverse().map((h) => `${h.year}/${String(h.year + 1).slice(2)} ${esc(g.clubs[h.championId]?.short || '?')}`).join(' · ')}</div>` : ''}
    </div>
    <div class="panel" style="left:456px;top:92px;width:380px;height:540px;display:flex;flex-direction:column">
      <h2>Our results</h2>
      ${inLeague ? `<table class="data compact">${played.map(res).join('') || '<tr><td class="empty">No matches yet.</td></tr>'}</table>
      <h2 style="margin-top:12px">Next</h2>
      <table class="data compact">${next.map(res).join('') || '<tr><td class="empty">Season finished.</td></tr>'}</table>`
        : '<p class="muted">Your club joins the U-19 league of its league from next season.</p>'}
      <p class="hint" style="margin-top:auto">U-19 matches are on Sundays. Players aged ${U19_MAX_AGE} or under at the start of the season can play: your academy, plus first-team players you send (they can still play for the first team). The best eleven fit players play; their U-19 games count towards their development.</p>
    </div>
    <div class="panel" style="left:852px;top:92px;width:408px;height:540px;display:flex;flex-direction:column">
      <h2>U-19 squad (${squad.length})</h2>
      <div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th class="num">Sk</th><th class="num phone-hide">Pot</th><th class="num">Apps</th><th class="num">Gls</th><th></th></tr></thead>
        <tbody>${[...squad, ...eligibleFirst.filter((p) => !p.u19)].map((p) => {
          const first = club.squad.includes(p.id);
          return `<tr class="${squad.includes(p) ? '' : 'dim'}"><td><b>${esc(fullName(p))}</b>${first ? ' <span class="muted" style="font-size:11px">1st</span>' : ''}</td>
            <td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td><td class="num">${p.skill}</td><td class="num phone-hide">${potText(g, p)}</td>
            <td class="num">${p.stats.season.youthApps || 0}</td><td class="num">${p.stats.season.youthGoals || 0}</td>
            <td class="num">${first ? `<button class="btn btn-small ${p.u19 ? '' : 'btn-blue'}" style="min-width:0;padding:0 8px" data-action="u19" data-id="${p.id}" title="${p.u19 ? 'Back to the first team only' : 'Send to the U-19 side'}">${p.u19 ? 'U-19 ✓' : 'U-19'}</button>` : ''}</td></tr>`;
        }).join('') || '<tr><td class="empty" colspan="8">No eligible players.</td></tr>'}</tbody></table></div>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    u19: (el) => { const p = g.players[el.dataset.id]; ctx.toast(setU19(g, p.id, !p.u19).message); draw(); },
    back: () => { ctx.save({ silent: true }); ctx.back(); },
  });
  draw();
}
