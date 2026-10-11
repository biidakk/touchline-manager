// National teams: Nations Championship (senior / U21) tables, results,
// squads and top scorers. National teams are AI-managed.

import { NAT_IDS, nationalTable, nationalScorers } from '../../core/national.js';
import { fmtDate } from '../../core/calendar.js';
import { ageOf } from '../../core/valuation.js';
import { crest, flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, scoreText } from '../components/report.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';
import { recordsHtml } from '../components/records.js';

export function render(root, ctx) {
  const g = ctx.game;
  const user = g.clubs[g.userClubId];
  const managed = g.manager.national ? g.national.teams[g.manager.national.teamId] : null;
  const st = managed ? { level: managed.level, nationId: managed.nationId, tab: 'squad' } : { level: 'senior', nationId: user.nationId, tab: 'squad' };
  const T = (id) => g.national.teams[id];
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;

  function draw() {
    const comp = g.competitions[NAT_IDS[st.level]];
    const rows = nationalTable(g, comp);
    const fx = comp.fixtureIds.map((id) => g.fixtures[id]).sort((a, b) => a.day - b.day);
    const teamId = `NT-${st.nationId}${st.level === 'u21' ? '-21' : ''}`;
    const team = T(teamId);
    const squad = team.squad.map((id) => g.players[id]).filter(Boolean)
      .sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.skill - a.skill);
    const scorers = nationalScorers(g, comp.id).slice(0, 5);
    const byRound = {};
    for (const f of fx) (byRound[f.round] = byRound[f.round] || []).push(f);
    const caps = (p) => (p.intl ? (st.level === 'senior' ? `${p.intl.caps} / ${p.intl.goals}` : `${p.intl.u21Caps} / ${p.intl.u21Goals}`) : '0 / 0');

    root.innerHTML = `${clubTopbar(ctx, { title: 'National teams' })}
    <div class="panel" style="left:20px;top:92px;width:380px;height:600px;display:flex;flex-direction:column">
      <div class="seg">${[['senior', 'Senior'], ['u21', 'Under 21']].map(([k, l]) => `<button class="${st.level === k ? 'on' : ''}" data-action="level" data-v="${k}">${l}</button>`).join('')}</div>
      <h2 style="margin:12px 0 6px">${esc(comp.name)}</h2>
      <table class="data"><thead><tr><th></th><th>Team</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num phone-hide">Goals</th><th class="num">Pts</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="click ${(managed ? r.clubId === managed.id : T(r.clubId).nationId === user.nationId) ? 'me' : ''}" data-action="nation" data-v="${T(r.clubId).nationId}">
          <td>${i + 1}.</td><td>${flag(g.nations[T(r.clubId).nationId].flag, 20)} ${esc(T(r.clubId).name)}</td><td class="num">${r.p}</td><td class="num">${r.w}</td>
          <td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num phone-hide">${r.gf}:${r.ga}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>
      <h2 style="margin:14px 0 4px;font-size:15px">Top scorers</h2>
      <table class="data compact">${scorers.map((s) => {
        const p = g.players[s.id];
        return p ? `<tr class="click" data-action="player" data-id="${p.id}"><td>${flag(g.nations[p.nationId].flag, 16)} ${esc(fullName(p))}</td><td class="muted">${g.clubs[p.clubId] ? clubLink(g, p.clubId, { short: true }) : ''}</td><td class="num"><b>${s.goals}</b></td></tr>` : '';
      }).join('') || '<tr><td class="dim">No goals yet.</td></tr>'}</table>
      <h2 style="margin:14px 0 4px;font-size:15px">Past champions</h2>
      <div class="scroll" style="flex:1">${comp.history.slice().reverse().map((h) => `<div class="row" style="padding:2px 0">
        <span class="muted" style="width:62px">${y(h.year)}</span>${flag(g.nations[T(h.championId).nationId].flag, 18)} <b>${esc(T(h.championId).name)}</b></div>`).join('') || '<div class="dim">First edition in progress.</div>'}</div>
    </div>
    <div class="panel scroll" style="left:416px;top:92px;width:360px;height:540px">
      <h2>Results and fixtures</h2>
      ${Object.entries(byRound).map(([round, list]) => `<div class="muted" style="font-size:12px;margin-top:8px">Matchday ${round} · ${fmtDate(list[0].day)}</div>
        <table class="data compact">${list.map((f) => `<tr class="${f.result ? 'click' : ''}" ${f.result ? `data-action="report" data-id="${f.id}"` : ''}>
          <td class="num" style="width:40%">${esc(T(f.homeId).name)}</td><td class="c" style="width:60px"><b>${f.result ? scoreText(f) : '-'}</b></td>
          <td style="width:40%">${esc(T(f.awayId).name)}</td></tr>`).join('')}</table>`).join('')}
    </div>
    <div class="panel" style="left:792px;top:92px;width:468px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${flag(g.nations[st.nationId].flag, 22)} ${esc(team.name)}</h2>
        <select class="field" id="nation" style="height:30px">${Object.values(g.nations).filter((n) => !n.foreign).map((n) => `<option value="${n.id}" ${n.id === st.nationId ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <span class="muted" style="font-size:12.5px">${st.tab === 'records' ? 'Records since your career began' : team.squad.length ? `Latest squad · ${team.tactics.formation}` : 'Squad named before the first break.'}</span>
        <div class="seg">${[['squad', 'Squad'], ['records', 'Records']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="tab" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${st.tab === 'records' ? `<div class="scroll" style="flex:1">${recordsHtml(g, team, { national: true })}</div>` : `<div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th class="c">Pos</th><th>Player</th><th class="num">Age</th><th>Club</th><th class="num">Skill</th><th class="num">Caps / goals</th></tr></thead>
        <tbody>${squad.map((p) => `<tr class="click ${p.clubId === user.id ? 'me' : ''}" data-action="player" data-id="${p.id}"><td class="c">${p.pos}</td><td><b>${esc(fullName(p))}</b></td>
          <td class="num">${ageOf(p, g.season.year)}</td><td>${g.clubs[p.clubId] ? clubLink(g, p.clubId, { crest: 16, short: true }) : ''}</td>
          <td class="num">${p.skill}</td><td class="num">${caps(p)}</td></tr>`).join('')}</tbody>
      </table></div>`}
      <p class="hint">${team.id === managed?.id ? 'You are the head coach of this team.' : 'National teams are run by their own coaches; vacancies are listed under My Career → Jobs.'} Your club's players are highlighted. Internationals are on Thursdays during five breaks a season.</p>
    </div>
    ${managed ? `<button class="btn" style="position:absolute;left:792px;top:648px;width:240px" data-action="manage">Manage ${esc(managed.name)}</button>` : ''}
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

    root.querySelector('#nation').addEventListener('change', (e) => { st.nationId = e.target.value; draw(); });
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    level: (el) => { st.level = el.dataset.v; draw(); },
    tab: (el) => { st.tab = el.dataset.v; draw(); },
    nation: (el) => { st.nationId = el.dataset.v; draw(); },
    player: (el) => showPlayer(ctx, el.dataset.id),
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: 'International' }),
    manage: () => ctx.go('natteam'),
    back: () => ctx.back(),
  });
  draw();
}
