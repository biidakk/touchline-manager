// A national team's own page (the hub tile with the flag): today's squad, the
// team's honours (World Cup, Euro, Nations League, real and in the career),
// the all-time top scorers, form, the next match and where it stands.

import { NAT_IDS, nationalTable, nationRanking, teamIdOf } from '../../core/national.js';
import { honours, allTimeScorers } from '../../core/nathistory.js';
import { fmtDate } from '../../core/calendar.js';
import { ageOf } from '../../core/valuation.js';
import { flag, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, scoreText } from '../components/report.js';
import { showPlayer } from '../components/playercard.js';
import { clubLink } from '../components/links.js';
import { esc, bindActions, fullName } from '../util.js';

const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th'}`;

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const user = g.clubs[g.userClubId];
  const nationId = params.nationId || user.nationId;
  const team = g.national.teams[teamIdOf(nationId, 'senior')];
  const nation = g.nations[nationId];
  const T = (id) => g.national.teams[id];

  function honourCard(title, won, extra, best, apps, note) {
    const all = [...won.map((y) => ({ y })), ...extra.map((y) => ({ y, career: true }))].sort((a, b) => a.y - b.y);
    const body = all.length
      ? `<div class="hon-count">${all.length}×</div><div class="hon-years">${all.map((w) => `<span class="${w.career ? 'career' : ''}">${w.y}</span>`).join(' ')}</div>${note ? `<div class="hon-note">${esc(note)}</div>` : ''}`
      : `<div class="hon-best">${esc(best || 'Not won yet')}</div>`;
    return `<div class="honour ${all.length ? 'won' : ''}"><div class="hon-ico">${icon('trophy')}</div><div class="hon-title">${title}</div>${body}
      ${apps != null ? `<div class="hon-apps">${apps} tournament${apps === 1 ? '' : 's'}</div>` : ''}</div>`;
  }

  function draw() {
    const h = honours(g, team);
    const squad = team.squad.map((id) => g.players[id]).filter(Boolean)
      .sort((a, b) => 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) || b.skill - a.skill);
    const scorers = allTimeScorers(g, team);
    const fx = Object.values(g.fixtures).filter((f) => f.homeId === team.id || f.awayId === team.id).sort((a, b) => a.day - b.day);
    const played = fx.filter((f) => f.result).slice(-5).reverse();
    const next = fx.find((f) => !f.result);
    const ranking = nationRanking(g);
    const rank = ranking.findIndex((r) => r.nationId === nationId) + 1;
    const comp = g.competitions[NAT_IDS.senior];
    const group = comp.groups?.find((gr) => gr.ids.includes(team.id));
    const pos = group ? nationalTable(g, comp, group.ids).findIndex((r) => r.clubId === team.id) + 1 : 0;
    const out = (f) => {
      const r = f.result;
      const us = f.homeId === team.id ? r.h : r.a;
      const them = f.homeId === team.id ? r.a : r.h;
      const res = r.winner && r.h === r.a ? (r.winner === team.id ? 'W' : 'L') : us > them ? 'W' : us < them ? 'L' : 'D';
      const opp = T(f.homeId === team.id ? f.awayId : f.homeId);
      return `<tr class="${r.events ? 'click' : ''}" ${r.events ? `data-action="report" data-id="${f.id}"` : ''}><td><span class="res-badge ${res}">${res}</span></td>
        <td>${flag(g.nations[opp.nationId].flag, 16)} ${esc(opp.name)} <span class="muted">(${f.homeId === team.id ? 'H' : 'A'})</span></td><td class="num"><b>${scoreText(f)}</b></td></tr>`;
    };
    const careerTitles = [
      ...h.euro.careerFinals.map((y) => `Euro ${y} runners-up`),
      ...h.u21.map((y) => `U21 Euro ${y} winners`),
    ];

    root.innerHTML = `${clubTopbar(ctx, { title: nation.name })}
    <div class="panel" style="left:20px;top:92px;width:560px;height:600px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${flag(nation.flag, 26)} Squad</h2>
        <span class="muted" style="font-size:13px">${team.squad.length ? `${squad.length} players · ${esc(team.tactics.formation)}` : 'Named before the first international break'}</span></div>
      <div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th class="c">Pos</th><th>Player</th><th class="num">Age</th><th class="phone-hide">Club</th><th class="num">Skill</th><th class="num">Caps</th><th class="num">Goals</th></tr></thead>
        <tbody>${squad.map((p) => `<tr class="click ${p.clubId === user.id ? 'me' : ''}" data-action="player" data-id="${p.id}"><td class="c">${p.pos}</td><td><b>${esc(fullName(p))}</b></td>
          <td class="num">${ageOf(p, g.season.year)}</td><td class="phone-hide">${g.clubs[p.clubId] ? clubLink(g, p.clubId, { crest: 16, short: true }) : ''}</td>
          <td class="num">${p.skill}</td><td class="num">${p.intl?.caps || 0}</td><td class="num">${p.intl?.goals || 0}</td></tr>`).join('')
          || '<tr><td colspan="7" class="dim">No squad yet.</td></tr>'}</tbody></table></div>
    </div>
    <div class="panel" style="left:596px;top:92px;width:664px;height:232px">
      <h2>Honours</h2>
      <div class="honours">
        ${honourCard('World Cup', h.worldCup.won, [], h.worldCup.best, h.worldCup.apps)}
        ${honourCard('Euro', h.euro.won, h.euro.career, h.euro.best, h.euro.apps, h.euro.note)}
        ${honourCard('Nations League', h.nationsLeague.won, h.nationsLeague.career, 'Not won yet', null)}
      </div>
      ${careerTitles.length ? `<div class="muted" style="font-size:13px;margin-top:6px">In your career: ${careerTitles.map(esc).join(' · ')}</div>` : ''}
    </div>
    <div class="panel" style="left:596px;top:338px;width:324px;height:296px;display:flex;flex-direction:column">
      <h2>All-time scorers</h2>
      <div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th class="num">#</th><th>Player</th><th class="num phone-hide">Caps</th><th class="num">Goals</th></tr></thead>
        <tbody>${scorers.map((s, i) => `<tr class="${s.id && g.players[s.id] ? 'click' : ''}" ${s.id && g.players[s.id] ? `data-action="player" data-id="${s.id}"` : ''}>
          <td class="num">${i + 1}.</td><td>${s.active ? '<b>' : ''}${esc(s.name)}${s.active ? '</b>' : ''}</td><td class="num phone-hide">${s.caps}</td><td class="num"><b>${s.goals}</b></td></tr>`).join('')
          || '<tr><td colspan="4" class="dim">No goals yet.</td></tr>'}</tbody></table></div>
      <p class="hint phone-hide" style="margin:6px 0 0">Bold: still playing. Goals in your career are added.</p>
    </div>
    <div class="panel" style="left:936px;top:338px;width:324px;height:296px;display:flex;flex-direction:column;gap:8px">
      <h2 style="margin:0">Form</h2>
      <div class="nation-facts">
        <div><b>${ord(rank)}</b> strongest of ${ranking.length}</div>
        <div>${esc(comp.name)}: <b>${group ? `${ord(pos)}, ${esc(group.name)}` : comp.host === team.id ? 'hosts' : '-'}</b></div>
        ${next ? `<div>Next: <b>${esc(T(next.homeId === team.id ? next.awayId : next.homeId).name)}</b>, ${fmtDate(next.day)}</div>` : ''}</div>
      <table class="data compact">${played.map(out).join('') || '<tr><td class="dim">No matches yet.</td></tr>'}</table>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:596px;top:648px;width:324px" data-action="all">All national teams</button>
    <button class="btn btn-blue" style="position:absolute;left:936px;top:648px;width:324px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    player: (el) => showPlayer(ctx, el.dataset.id),
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: 'International' }),
    all: () => ctx.go('national'),
    back: () => ctx.back(),
  });
  draw();
}
