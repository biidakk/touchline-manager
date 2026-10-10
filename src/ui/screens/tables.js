// League tables, round results and top scorers for every league.

import { sortedTable } from '../../core/season.js';
import { fmtDate } from '../../core/calendar.js';
import { crest, flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, scoreText } from '../components/report.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';
import { goldenShoeRace } from '../../core/records.js';

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const st = { compId: params.compId || g.clubs[g.userClubId].compId, view: 'table', round: null };

  const fixturesOf = (comp) => comp.fixtureIds.map((id) => g.fixtures[id]);
  function defaultRound(comp) {
    const played = fixturesOf(comp).filter((f) => f.result);
    return played.length ? Math.max(...played.map((f) => f.round)) : 1;
  }

  function tableView(comp) {
    const rows = sortedTable(g, comp);
    const n = rows.length;
    return `<div class="scroll" style="flex:1">
      <table class="data">
        <thead><tr><th class="num">#</th><th></th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Goals</th><th class="num">GD</th><th class="num">Pts</th><th class="c">Form</th></tr></thead>
        <tbody>${rows.map((r, i) => {
          const c = g.clubs[r.clubId];
          const cls = [r.clubId === g.userClubId ? 'me' : '', comp.promote && i < comp.promote ? 'promo' : '',
            comp.relegate && i >= n - comp.relegate ? 'releg' : ''].join(' ');
          return `<tr class="${cls}"><td class="num">${i + 1}.</td><td style="width:26px">${clubLink(g, c.id, { crest: 22, text: '' })}</td>
            <td><b>${clubLink(g, c.id)}</b></td><td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td>
            <td class="num">${r.l}</td><td class="num">${r.gf}:${r.ga}</td><td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td>
            <td class="num"><b>${r.pts}</b></td><td class="c">${r.form.slice(-5).map((x) => `<span class="${x === 'W' ? 'good' : x === 'L' ? 'bad' : ''}">${x}</span>`).join(' ')}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="row muted" style="font-size:12px;margin-top:8px;gap:18px">
        ${comp.promote ? '<span><span class="good">▌</span> Promotion</span>' : ''}
        ${comp.relegate ? '<span><span class="bad">▌</span> Relegation</span>' : ''}
      </div>`;
  }

  function resultsView(comp) {
    if (st.round === null) st.round = defaultRound(comp);
    const fx = fixturesOf(comp).filter((f) => f.round === st.round);
    return `<div class="row" style="justify-content:center;gap:14px;margin-bottom:10px">
        <button class="btn btn-small btn-blue" data-action="round" data-d="-1" ${st.round <= 1 ? 'disabled' : ''}>‹</button>
        <b style="min-width:220px;text-align:center">Round ${st.round} · ${fx.length ? fmtDate(fx[0].day) : ''}</b>
        <button class="btn btn-small btn-blue" data-action="round" data-d="1" ${st.round >= comp.rounds ? 'disabled' : ''}>›</button>
      </div>
      <div class="scroll" style="flex:1"><table class="data">${fx.map((f) => {
        const h = g.clubs[f.homeId];
        const a = g.clubs[f.awayId];
        const mine = f.homeId === g.userClubId || f.awayId === g.userClubId;
        const canReport = f.result && f.result.events;
        return `<tr class="${mine ? 'me' : ''} ${canReport ? 'click' : ''}" ${canReport ? `data-action="report" data-id="${f.id}"` : ''}>
          <td class="num" style="width:40%"><b>${clubLink(g, h.id)}</b> ${clubLink(g, h.id, { crest: 20, text: '' })}</td>
          <td class="c" style="width:90px"><b>${f.result ? scoreText(f) : '-'}</b></td>
          <td style="width:40%">${clubLink(g, a.id, { crest: 20, text: '' })}<b>${clubLink(g, a.id)}</b></td></tr>`;
      }).join('')}</table></div>`;
  }

  function scorersView(comp) {
    const ps = comp.clubIds.flatMap((id) => g.clubs[id].squad.map((p) => g.players[p]))
      .filter((p) => p.stats.season.goals > 0)
      .sort((a, b) => b.stats.season.goals - a.stats.season.goals || a.stats.season.apps - b.stats.season.apps)
      .slice(0, 25);
    if (!ps.length) return '<div class="empty">No goals scored yet.</div>';
    return `<div class="scroll" style="flex:1"><table class="data">
      <thead><tr><th class="num">#</th><th>Player</th><th></th><th>Club</th><th class="c">Pos</th><th class="num">Apps</th><th class="num">Assists</th><th class="num">Goals</th></tr></thead>
      <tbody>${ps.map((p, i) => `<tr class="click ${p.clubId === g.userClubId ? 'me' : ''}" data-action="player" data-id="${p.id}"><td class="num">${i + 1}.</td>
        <td><b>${esc(fullName(p))}</b></td><td>${flag(g.nations[p.nationId].flag, 18)}</td>
        <td>${clubLink(g, p.clubId)}</td><td class="c">${p.pos}</td><td class="num">${p.stats.season.apps}</td>
        <td class="num">${p.stats.season.assists}</td><td class="num"><b>${p.stats.season.goals}</b></td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  function historyView(comp) {
    if (!comp.history.length) return '<div class="empty">No completed seasons yet.</div>';
    const C = (id) => g.clubs[id];
    const a = (x, unit = '') => (x ? `${playerLink(g, x.playerId, { text: x.name })} <span class="muted">(${clubLink(g, x.clubId, { short: true })}${unit ? `, ${x.value}${unit}` : ''})</span>` : '-');
    return `<div class="scroll" style="flex:1"><table class="data">
      <thead><tr><th>Season</th><th>Champion</th><th class="num">Pts</th><th>Runner-up</th><th>Top scorer</th><th>Best player</th><th>Young player</th></tr></thead>
      <tbody>${comp.history.slice().reverse().map((h) => `<tr class="${h.championId === g.userClubId ? 'me' : ''}">
        <td>${h.year}/${String(h.year + 1).slice(2)}</td><td><b>${clubLink(g, h.championId, { crest: 18, text: h.table[0].name })}</b></td>
        <td class="num">${h.table[0].pts}</td><td>${clubLink(g, h.table[1].clubId, { text: h.table[1].name })}</td>
        <td>${a(h.awards.topScorer, ' g')}</td><td>${a(h.awards.bestPlayer)}</td><td>${a(h.awards.youngPlayer)}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }

  // World awards: the Ballon d'Or and the Golden Shoe, every season (top three each).
  function awardsView() {
    const list = (g.history.world || []).slice().reverse();
    const who = (e, value) => {
      const live = g.players[e.playerId];
      const name = `${flag(g.nations[e.nationId].flag, 16)} <b>${esc(e.name)}</b> <span class="muted">(${g.clubs[e.clubId] ? clubLink(g, e.clubId, { short: true }) : esc(e.clubName)}${value ? `, ${value}` : ''})</span>`;
      return live ? `<span class="click" data-action="player" data-id="${e.playerId}">${name}</span>` : name;
    };
    const race = goldenShoeRace(g).slice(0, 5);
    return `<div class="scroll" style="flex:1">
      <h3 class="rec-h">Golden Shoe race ${g.season.year}/${String(g.season.year + 1).slice(2)}</h3>
      <table class="data compact" style="margin-bottom:10px">${race.map((r, i) => `<tr class="click" data-action="player" data-id="${r.p.id}"><td class="num" style="width:22px">${i + 1}.</td>
        <td>${flag(g.nations[r.p.nationId].flag, 16)} <b>${esc(fullName(r.p))}</b> <span class="muted">${clubLink(g, r.p.clubId, { short: true })}</span></td>
        <td class="num">${r.p.stats.season.goals} goals × ${r.factor}</td><td class="num"><b>${r.points}</b> pts</td></tr>`).join('') || '<tr><td class="dim">No goals yet.</td></tr>'}</table>
      <h3 class="rec-h">Winners</h3>
      ${list.length ? `<table class="data compact"><thead><tr><th>Season</th><th>Ballon d'Or</th><th>2nd / 3rd</th><th>Golden Shoe</th></tr></thead>
        <tbody>${list.map((w) => `<tr><td>${w.year}/${String(w.year + 1).slice(2)}</td>
          <td>${w.ballonDor[0] ? who(w.ballonDor[0]) : '-'}</td>
          <td style="font-size:12.5px">${w.ballonDor.slice(1).map((e) => who(e)).join('<br>')}</td>
          <td>${w.goldenShoe[0] ? who(w.goldenShoe[0], `${w.goldenShoe[0].goals} goals, ${w.goldenShoe[0].points} pts`) : '-'}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty">The first awards are given at the end of this season.</div>'}
      <p class="hint">Ballon d'Or: the season's best player across all leagues (form, goals and assists, the league's level and the trophies won). Golden Shoe: most league goals, counted double in the big top flights (×1.5 in the Czech top flight).</p>
    </div>`;
  }

  function draw() {
    const comp = g.competitions[st.compId];
    const nations = Object.values(g.nations).filter((x) => x.leagueIds.length);
    const views = [['table', 'Table'], ['results', 'Results'], ['scorers', 'Top scorers'], ['history', 'History'], ['awards', "Ballon d'Or"]];
    const body = st.view === 'table' ? tableView(comp) : st.view === 'results' ? resultsView(comp)
      : st.view === 'scorers' ? scorersView(comp) : st.view === 'awards' ? awardsView() : historyView(comp);

    root.innerHTML = `${clubTopbar(ctx, { title: 'League tables' })}
    <div class="panel" style="left:20px;top:92px;width:282px;height:608px">
      ${nations.map((nat) => `<h2 class="row" style="margin-top:8px">${flag(nat.flag, 24)} ${esc(nat.name)}</h2>
        <ul class="menu-list" style="margin-bottom:12px">${nat.leagueIds.map((id) => `<li data-action="comp" data-id="${id}" style="${id === st.compId ? 'background:var(--row-me)' : ''}">${esc(g.competitions[id].name)}</li>`).join('')}</ul>`).join('')}
    </div>
    <div class="panel" style="left:320px;top:92px;width:940px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${st.view === 'awards' ? 'World awards' : esc(comp.name)} <span class="muted" style="font-size:14px">${g.season.year}/${String(g.season.year + 1).slice(2)}</span></h2>
        <div class="seg">${views.map(([k, l]) => `<button class="${st.view === k ? 'on' : ''}" data-action="view" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${body}
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    comp: (el) => { st.compId = el.dataset.id; st.round = null; draw(); },
    view: (el) => { st.view = el.dataset.v; draw(); },
    round: (el) => { st.round += Number(el.dataset.d); draw(); },
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: 'Match report' }),
    player: (el) => showPlayer(ctx, el.dataset.id),
    back: () => ctx.back(),
  });
  draw();
}
