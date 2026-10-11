// End-of-season review (shown once the season has been rolled over).

import { crest, flag, icon } from '../components/svg.js';
import { potText } from '../../core/scouting.js';
import { decisionsDue } from '../../core/commercial.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, bindActions } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';

const ord = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

export function render(root, ctx) {
  const g = ctx.game;
  const s = g.lastSummary;
  const C = (id) => g.clubs[id];
  const comp = g.competitions[s.user.compId];
  const y = `${s.year}/${String(s.year + 1).slice(2)}`;
  const award = (a, unit) => (a ? `${playerLink(g, a.playerId, { text: a.name })} <span class="muted">(${C(a.clubId) ? clubLink(g, a.clubId, { short: true }) : ''}${unit ? `, ${a.value}${unit}` : ''})</span>` : '<span class="dim">-</span>');
  const clubList = (ids) => ids.map((id) => `<span class="row" style="gap:4px;display:inline-flex">${clubLink(g, id, { crest: 18, short: true })}</span>`).join(', ');

  const banner = (s.user.sacked ? '<div class="banner bad-bg">Sacked by the board</div>' : '')
    + (s.user.promoted ? '<div class="banner good-bg">PROMOTED!</div>'
      : s.user.relegated ? '<div class="banner bad-bg">Relegated</div>' : '');
  const sacked = !!g.manager.sacked;
  const offers = (g.manager.offers || []).length;
  const youth = s.youthUser.map((id) => g.players[id]).filter(Boolean);

  const nations = Object.values(g.nations).filter((n) => n.leagueIds.length);
  root.innerHTML = `${clubTopbar(ctx, { title: `Season ${y} review` })}
  <div class="panel" style="left:20px;top:92px;width:400px;height:600px;display:flex;flex-direction:column;gap:10px">
    <h2>Your season</h2>
    ${banner}
    <div style="font-size:30px;font-weight:900">${ord(s.user.pos)} <span style="font-size:16px;font-weight:600" class="muted">in the ${esc(comp.name)}</span></div>
    <div class="fin-list">
      <span>Points</span><b>${s.user.pts}</b>
      <span>${esc(g.competitions[g.nations[C(s.user.clubId).nationId].cupId].name)}</span><b>${esc(s.user.cup || '-')}</b>
      ${s.user.cont ? `<span>Champions Cup</span><b>${esc(s.user.cont)}</b>` : ''}
      <span>Prize money</span><b>${fmtMoney(s.user.prize)}</b>
      <span>Trophies</span><b>${s.user.trophies.length ? s.user.trophies.map(esc).join(', ') : '-'}</b>
      ${s.user.board ? `<span>Board target</span><b class="${s.user.board.met ? 'good' : 'bad'}" title="${esc(s.user.board.target)}">${s.user.board.met ? 'Met' : 'Missed'}</b>
      <span>Board confidence</span><b>${s.user.board.confidence}/100</b>` : ''}
      ${s.nationalJob ? `<span>${esc(s.nationalJob.teamName)}</span><b class="${s.nationalJob.verdict === 'sacked' ? 'bad' : s.nationalJob.verdict === 'champions' ? 'good' : ''}">${ord(s.nationalJob.pos)}${s.nationalJob.verdict === 'champions' ? ', champions' : s.nationalJob.verdict === 'sacked' ? ', dismissed' : ''}</b>` : ''}
      ${offers && !sacked ? `<span>Job offers</span><b class="warn">${offers} (see My Career)</b>` : ''}
    </div>
    <h2 style="margin-top:8px">Youth intake</h2>
    <div class="scroll" style="max-height:150px"><table class="data">${youth.map((p) => `<tr><td>${esc(p.first)} ${esc(p.last)}</td><td class="c">${p.pos}</td>
      <td class="num">${s.year + 1 - p.birthYear} yrs</td><td class="num">${p.skill}/<b>${potText(g, p)}</b></td></tr>`).join('') || '<tr><td class="dim">None</td></tr>'}</table></div>
    <h2 style="margin-top:8px">Retired</h2>
    <div class="muted" style="font-size:13.5px">${s.retiredUser.length ? s.retiredUser.map((r) => `${esc(r.name)} (${r.pos}, ${r.age})`).join(', ') : 'Nobody'}</div>
    ${s.releasedUser.length ? `<div class="muted" style="font-size:13px">Left the academy: ${s.releasedUser.map(esc).join(', ')}</div>` : ''}
  </div>
  <div class="panel scroll" style="left:436px;top:92px;width:824px;height:540px">
    ${s.world && (s.world.ballonDor[0] || s.world.goldenShoe[0]) ? `<h2 class="row">${icon('star')} World awards</h2>
      <table class="data" style="margin-bottom:14px">
        ${s.world.ballonDor[0] ? `<tr><td style="width:190px"><b>Ballon d'Or</b></td><td>${icon('trophy')}</td><td>${flag(g.nations[s.world.ballonDor[0].nationId].flag, 20)} <b>${esc(s.world.ballonDor[0].name)}</b>
          <span class="muted">(${esc(s.world.ballonDor[0].clubName)})</span></td><td class="muted">2nd ${esc(s.world.ballonDor[1]?.name || '-')} · 3rd ${esc(s.world.ballonDor[2]?.name || '-')}</td></tr>` : ''}
        ${s.world.goldenShoe[0] ? `<tr><td><b>Golden Shoe</b></td><td>${icon('trophy')}</td><td>${flag(g.nations[s.world.goldenShoe[0].nationId].flag, 20)} <b>${esc(s.world.goldenShoe[0].name)}</b>
          <span class="muted">(${esc(s.world.goldenShoe[0].clubName)})</span></td><td class="muted">${s.world.goldenShoe[0].goals} league goals, ${s.world.goldenShoe[0].points} points</td></tr>` : ''}
      </table>` : ''}
    ${s.continental ? `<h2 class="row">${icon('star')} ${esc(s.continental.name)}</h2>
      <table class="data" style="margin-bottom:14px"><tr><td style="width:190px"><b>Winner</b></td><td>${icon('trophy')}</td>
        <td><b>${clubLink(g, s.continental.winnerId, { crest: 20 })}</b>
        <span class="muted">(${esc(g.nations[C(s.continental.winnerId).nationId].name)})</span></td>
        <td class="muted">Final vs ${s.continental.runnerUpId ? clubLink(g, s.continental.runnerUpId) : '-'}</td></tr></table>` : ''}
    ${(s.national || []).length ? `<h2 class="row">${icon('flag')} National teams</h2>
      <table class="data" style="margin-bottom:14px">${s.national.map((x) => {
        const t = g.national.teams[x.championId];
        return `<tr><td style="width:190px"><b>${esc(x.name)}</b></td><td>${icon('trophy')}</td><td>${flag(g.nations[t.nationId].flag, 20)} <b>${esc(t.name)}</b></td></tr>`;
      }).join('')}</table>` : ''}
    ${nations.map((n) => {
      const ls = s.leagues.filter((l) => l.nationId === n.id);
      const cup = s.cups.find((c) => g.competitions[c.compId].nationId === n.id);
      return `<h2 class="row">${flag(n.flag, 24)} ${esc(n.name)}</h2>
      <table class="data" style="margin-bottom:14px">${ls.map((l) => `
        <tr><td style="width:190px"><b>${esc(l.name)}</b></td><td>${icon('trophy')} </td><td><b>${clubLink(g, l.championId, { crest: 20 })}</b></td>
          <td class="muted">${l.promoted.length ? `Up: ${clubList(l.promoted)}` : `Down: ${clubList(l.relegated)}`}</td></tr>
        <tr><td></td><td></td><td colspan="2" style="font-size:12.5px;white-space:normal">Top scorer ${award(l.topScorer, ' goals')} · Best player ${award(l.bestPlayer)} · Young player ${award(l.youngPlayer)}</td></tr>`).join('')}
        <tr><td><b>${esc(cup.name)}</b></td><td>${icon('trophy')}</td><td><b>${clubLink(g, cup.winnerId, { crest: 20 })}</b></td>
          <td class="muted">Final vs ${cup.runnerUpId ? clubLink(g, cup.runnerUpId) : '-'}</td></tr>
      </table>`;
    }).join('')}
  </div>
  <div style="position:absolute;left:436px;top:648px;width:824px;display:flex;gap:12px;justify-content:flex-end">
    ${sacked ? '<button class="btn" data-action="career">Find a new job</button>'
      : `<button class="btn btn-blue" data-action="youth">Youth academy</button>
    <button class="btn" data-action="hub">Start season ${s.year + 1}/${String(s.year + 2).slice(2)}</button>`}
  </div>`;

  bindTopbar(root, ctx);
  bindActions(root, {
    youth: () => ctx.go('youth'),
    hub: () => (decisionsDue(g).any ? ctx.home('deals', { then: 'hub' }) : ctx.home('hub')),
    career: () => ctx.home('career'),
  });
}
