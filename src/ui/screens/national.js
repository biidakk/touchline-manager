// National teams: this season's Nations League or Euro qualifiers (senior /
// U21) by group, results, squads, top scorers and past winners; the finals
// have their own screen (euro.js). National teams are AI-managed.

import { NAT_IDS, TOURN_IDS, nationalTable, nationalScorers } from '../../core/national.js';
import { fmtDate } from '../../core/calendar.js';
import { ageOf } from '../../core/valuation.js';
import { flag, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, scoreText } from '../components/report.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName } from '../util.js';
import { clubLink } from '../components/links.js';
import { recordsHtml } from '../components/records.js';

export function render(root, ctx) {
  const g = ctx.game;
  const user = g.clubs[g.userClubId];
  const managed = g.manager.national ? g.national.teams[g.manager.national.teamId] : null;
  const T = (id) => g.national.teams[id];
  const hasTeam = (nationId) => !!T(`NT-${nationId}`);
  const st = managed ? { level: managed.level, nationId: managed.nationId, tab: 'squad', group: null }
    : { level: 'senior', nationId: hasTeam(user.nationId) ? user.nationId : T(g.competitions.NAT.clubIds[0]).nationId, tab: 'squad', group: null };
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;
  const nations = [...new Set(Object.values(g.national.teams).map((t) => t.nationId))].map((id) => g.nations[id])
    .sort((a, b) => a.name.localeCompare(b.name));

  function draw() {
    const comp = g.competitions[NAT_IDS[st.level]];
    const t = g.competitions[TOURN_IDS[st.level]];
    const teamId = `NT-${st.nationId}${st.level === 'u21' ? '-21' : ''}`;
    const team = T(teamId);
    const groups = comp.groups?.length ? comp.groups : [{ name: comp.name, ids: comp.clubIds.filter((id) => comp.table[id]) }];
    // The chosen group, else the selected nation's (the hosts play none: the first).
    const gi = st.group ?? Math.max(0, groups.findIndex((gr) => gr.ids.includes(teamId)));
    const group = groups[Math.min(gi, groups.length - 1)];
    const rows = nationalTable(g, comp, group.ids);
    const fx = comp.fixtureIds.map((id) => g.fixtures[id])
      .filter((f) => f && (group.ids.includes(f.homeId) || f.knockout)).sort((a, b) => a.day - b.day);
    const squad = team.squad.map((id) => g.players[id]).filter(Boolean)
      .sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.skill - a.skill);
    const scorers = nationalScorers(g, comp.id).slice(0, 5);
    const byRound = {};
    for (const f of fx) (byRound[f.knockout ? 'Final' : `Matchday ${f.round}`] = byRound[f.knockout ? 'Final' : `Matchday ${f.round}`] || []).push(f);
    const caps = (p) => (p.intl ? (st.level === 'senior' ? `${p.intl.caps} / ${p.intl.goals}` : `${p.intl.u21Caps} / ${p.intl.u21Goals}`) : '0 / 0');
    const isMine = (id) => (managed ? id === managed.id : T(id).nationId === user.nationId);
    // Qualifiers: places that go to the finals (the top two for sure, a third maybe).
    const zone = (i) => (comp.format === 'qual' ? (i < 2 ? 'eu-q' : i === 2 ? 'eu-maybe' : '') : '');
    const champs = [
      ...t.history.map((h) => ({ year: h.year, label: t.baseName === 'European Championship' ? `Euro ${h.year}` : `U21 Euro ${h.year}`, id: h.championId, big: true })),
      ...comp.history.filter((h) => h.championId).map((h) => ({ year: h.year + 1, label: h.name || comp.name, id: h.championId })),
    ].sort((a, b) => b.year - a.year || b.big - a.big);
    const host = comp.host ? `<div class="muted" style="font-size:12.5px;margin:-2px 0 6px">${esc(T(comp.host).name)} qualify as hosts of ${esc(t.name)}.</div>` : '';
    const finalsBtn = t.groups.length && t.year === g.season.year + 1;

    root.innerHTML = `${clubTopbar(ctx, { title: 'National teams' })}
    <div class="panel" style="left:20px;top:92px;width:380px;height:600px;display:flex;flex-direction:column">
      <div class="seg" style="flex-shrink:0">${[['senior', 'Senior'], ['u21', 'Under 21']].map(([k, l]) => `<button class="${st.level === k ? 'on' : ''}" data-action="level" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="scroll" style="flex:1;margin-top:4px">
      <h2 style="margin:8px 0 4px">${esc(comp.name)}</h2>
      ${host}
      ${groups.length > 1 ? `<select class="field" id="group" style="height:32px;margin-bottom:6px">${groups.map((gr, i) => `<option value="${i}" ${gr === group ? 'selected' : ''}>${esc(gr.name)}</option>`).join('')}</select>` : ''}
      <table class="data"><thead><tr><th></th><th>Team</th><th class="num">P</th><th class="num phone-hide">W</th><th class="num phone-hide">D</th><th class="num phone-hide">L</th><th class="num">Goals</th><th class="num">Pts</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr class="click ${isMine(r.clubId) ? 'me' : ''}" data-action="nation" data-v="${T(r.clubId).nationId}">
          <td class="${zone(i)}">${i + 1}.</td><td>${flag(g.nations[T(r.clubId).nationId].flag, 20)} ${esc(T(r.clubId).name)}</td><td class="num">${r.p}</td><td class="num phone-hide">${r.w}</td>
          <td class="num phone-hide">${r.d}</td><td class="num phone-hide">${r.l}</td><td class="num">${r.gf}:${r.ga}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</tbody></table>
      <h2 style="margin:12px 0 4px;font-size:15px">Top scorers</h2>
      <table class="data compact">${scorers.map((s) => {
        const p = g.players[s.id];
        return p ? `<tr class="click" data-action="player" data-id="${p.id}"><td>${flag(g.nations[p.nationId].flag, 16)} ${esc(fullName(p))}</td><td class="muted">${g.clubs[p.clubId] ? clubLink(g, p.clubId, { short: true }) : ''}</td><td class="num"><b>${s.goals}</b></td></tr>` : '';
      }).join('') || '<tr><td class="dim">No goals yet.</td></tr>'}</table>
      <h2 style="margin:12px 0 4px;font-size:15px">Past winners</h2>
      <div>${champs.map((c) => `<div class="row" style="padding:2px 0">
        <span class="muted" style="width:120px">${esc(c.label)}</span>${flag(g.nations[T(c.id).nationId].flag, 18)} <b>${c.big ? icon('trophy') : ''}${esc(T(c.id).name)}</b></div>`).join('') || '<div class="dim">First editions in progress.</div>'}</div>
      </div>
    </div>
    <div class="panel scroll" style="left:416px;top:92px;width:360px;height:540px">
      <h2>${esc(groups.length > 1 ? group.name : 'Results and fixtures')}</h2>
      ${Object.entries(byRound).map(([round, list]) => `<div class="muted" style="font-size:12px;margin-top:8px">${esc(round)} · ${fmtDate(list[0].day)}</div>
        <table class="data compact">${list.map((f) => `<tr class="${f.result?.events ? 'click' : ''} ${isMine(f.homeId) || isMine(f.awayId) ? 'me' : ''}" ${f.result?.events ? `data-action="report" data-id="${f.id}"` : ''}>
          <td class="num" style="width:40%">${esc(T(f.homeId).name)}</td><td class="c" style="width:70px"><b>${f.result ? scoreText(f) : '-'}</b></td>
          <td style="width:40%">${esc(T(f.awayId).name)}</td></tr>`).join('')}</table>`).join('') || '<div class="empty">No fixtures.</div>'}
    </div>
    <div class="panel" style="left:792px;top:92px;width:468px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${flag(g.nations[st.nationId].flag, 22)} ${esc(team.name)}</h2>
        <select class="field" id="nation" style="height:30px;max-width:190px">${nations.map((n) => `<option value="${n.id}" ${n.id === st.nationId ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select></div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <span class="muted" style="font-size:12.5px">${st.tab === 'records' ? 'Records since your career began' : team.squad.length ? `Latest squad · ${team.tactics.formation}` : 'Squad named before the first break.'}</span>
        <div class="seg">${[['squad', 'Squad'], ['records', 'Records']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="tab" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${st.tab === 'records' ? `<div class="scroll" style="flex:1">${recordsHtml(g, team, { national: true })}</div>` : `<div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th class="c">Pos</th><th>Player</th><th class="num">Age</th><th>Club</th><th class="num">Skill</th><th class="num">Caps / goals</th></tr></thead>
        <tbody>${squad.map((p) => `<tr class="click ${p.clubId === user.id ? 'me' : ''}" data-action="player" data-id="${p.id}"><td class="c">${p.pos}</td><td><b>${esc(fullName(p))}</b></td>
          <td class="num">${ageOf(p, g.season.year)}</td><td>${g.clubs[p.clubId] ? clubLink(g, p.clubId, { crest: 16, short: true }) : ''}</td>
          <td class="num">${p.skill}</td><td class="num">${caps(p)}</td></tr>`).join('')}</tbody>
      </table></div>`}
      <p class="hint">${team.id === managed?.id ? 'You are the head coach of this team.' : 'National teams are run by their own coaches; vacancies are listed under My Career → Jobs.'} Your club's players are highlighted. Internationals are on Thursdays during five breaks a season; the finals are in June.</p>
    </div>
    ${managed ? `<button class="btn" style="position:absolute;left:416px;top:648px;width:240px" data-action="manage">Manage ${esc(managed.name)}</button>` : ''}
    <button class="btn btn-blue" style="position:absolute;left:792px;top:648px;width:240px" data-action="finals">${icon('trophy')} ${esc(finalsBtn ? t.name : 'Euro finals')}</button>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

    root.querySelector('#nation').addEventListener('change', (e) => { st.nationId = e.target.value; st.group = null; draw(); });
    root.querySelector('#group')?.addEventListener('change', (e) => { st.group = Number(e.target.value); draw(); });
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    level: (el) => { st.level = el.dataset.v; st.group = null; draw(); },
    tab: (el) => { st.tab = el.dataset.v; draw(); },
    nation: (el) => { st.nationId = el.dataset.v; draw(); },
    player: (el) => showPlayer(ctx, el.dataset.id),
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: 'International' }),
    manage: () => ctx.go('natteam'),
    finals: () => ctx.go('euro', { compId: TOURN_IDS[st.level] }),
    back: () => ctx.back(),
  });
  draw();
}
