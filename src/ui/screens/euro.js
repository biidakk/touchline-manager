// The international finals (Euro and U21 Euro): groups, knockouts, top
// scorers and past winners, with the next match day: watch any match live,
// play the day with instant results or simulate to the end of the tournament.

import { TOURN_IDS, NAT_IDS, LEVELS, nationalTable, nationalStats, runningTournament, tournamentYear } from '../../core/national.js';
import { advanceIntl, createFixtureMatch } from '../../core/matchday.js';
import { fmtDate } from '../../core/calendar.js';
import { flag, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, scoreText } from '../components/report.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName } from '../util.js';
import { clubLink } from '../components/links.js';

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const user = g.clubs[g.userClubId];
  const current = (id) => g.competitions[id].year === g.season.year + 1 && g.competitions[id].groups.length;
  const st = {
    compId: params.compId || runningTournament(g)?.id || LEVELS.map((l) => TOURN_IDS[l]).find(current) || TOURN_IDS.senior,
    tab: params.tab || 'groups',
  };
  const T = (id) => g.national.teams[id];
  const mineIds = new Set([`NT-${user.nationId}`, `NT-${user.nationId}-21`, g.manager.national?.teamId].filter(Boolean));
  const tname = (id) => `${flag(g.nations[T(id).nationId].flag, 20)} <span class="eu-tn">${esc(T(id).name)}</span>`;

  // The next summer with finals at this level.
  function nextFinals(level) {
    let y = g.season.year;
    while (!tournamentYear(level, y)) y++;
    return y + 1;
  }

  function groupsHtml(t) {
    return `<div class="eu-groups">${t.groups.map((gr) => `<div class="eu-group"><h3>${esc(gr.name)}</h3>
      <table class="data compact"><thead><tr><th></th><th>Team</th><th class="num">P</th><th class="num phone-hide">W</th><th class="num phone-hide">D</th><th class="num phone-hide">L</th><th class="num">GD</th><th class="num">Pts</th></tr></thead>
      <tbody>${nationalTable(g, t, gr.ids).map((r, i) => `<tr class="${mineIds.has(r.clubId) ? 'me' : ''}">
        <td class="${i < 2 ? 'eu-q' : ''}">${i + 1}</td><td>${tname(r.clubId)}</td><td class="num">${r.p}</td>
        <td class="num phone-hide">${r.w}</td><td class="num phone-hide">${r.d}</td><td class="num phone-hide">${r.l}</td>
        <td class="num">${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</tbody></table></div>`).join('')}</div>
      <p class="hint">The top two of each group go through to the ${t.groups.length === 4 ? 'quarter-finals' : 'semi-finals'}.</p>`;
  }

  // One knockout match: both teams, the score, the winner in bold.
  function koBox(f, label) {
    if (!f) return `<div class="eu-ko-box tbd"><div>${esc(label)}</div></div>`;
    const r = f.result;
    const row = (id, goals) => `<div class="eu-ko-row ${r && r.winner !== id ? 'dim' : ''} ${mineIds.has(id) ? 'mine' : ''}"><span>${tname(id)}</span><b>${r ? goals : ''}</b></div>`;
    const note = r ? (r.pens ? `pens ${r.pens.h}:${r.pens.a}` : r.et ? 'a.e.t.' : '') : fmtDate(f.day, false);
    return `<div class="eu-ko-box ${r?.events ? 'click' : ''}" ${r?.events ? `data-action="report" data-id="${f.id}"` : ''}>
      ${row(f.homeId, r?.h)}${row(f.awayId, r?.a)}<div class="eu-ko-note">${esc(note)}</div></div>`;
  }

  function knockoutsHtml(t) {
    const names = t.groups.length === 4 ? ['Quarter-finals', 'Semi-finals', 'Final'] : ['Semi-finals', 'Final'];
    const L = 'ABCD';
    const firstLabels = t.groups.length === 4
      ? ['Winner A v Runner-up B', 'Winner C v Runner-up D', 'Winner B v Runner-up A', 'Winner D v Runner-up C']
      : [`Winner ${L[0]} v Runner-up ${L[1]}`, `Winner ${L[1]} v Runner-up ${L[0]}`];
    return `<div class="eu-ko">${names.map((name, k) => {
      const round = t.rounds[k];
      const n = firstLabels.length >> k;
      const boxes = Array.from({ length: n }, (_, i) => koBox(round ? g.fixtures[round.fixtureIds[i]] : null, k === 0 ? firstLabels[i] : 'To be decided'));
      return `<div class="eu-ko-col"><h3>${name}</h3><div class="eu-ko-list">${boxes.join('')}</div></div>`;
    }).join('')}</div>
    ${t.winnerId ? `<div class="banner good-bg eu-champ">${icon('trophy')} ${tname(t.winnerId)} win ${esc(t.name)}</div>` : ''}`;
  }

  function statsHtml(t) {
    const stats = nationalStats(g, t.id);
    const list = (key, other) => stats.filter((s) => s[key]).sort((a, b) => b[key] - a[key] || b[other] - a[other]).slice(0, 10)
      .map((s) => {
        const p = g.players[s.id];
        if (!p) return '';
        return `<tr class="click ${p.clubId === user.id ? 'me' : ''}" data-action="player" data-id="${p.id}"><td>${flag(g.nations[p.nationId].flag, 16)} <b>${esc(fullName(p))}</b></td>
          <td class="muted phone-hide">${g.clubs[p.clubId] ? clubLink(g, p.clubId, { short: true }) : ''}</td><td class="num"><b>${s[key]}</b></td><td class="num muted">${s[other]}</td></tr>`;
      }).join('') || '<tr><td class="dim">None yet.</td></tr>';
    return `<div class="eu-stats"><div><h3>Top scorers</h3><table class="data compact"><thead><tr><th>Player</th><th class="phone-hide">Club</th><th class="num">Goals</th><th class="num">Ast</th></tr></thead>${list('goals', 'assists')}</table></div>
      <div><h3>Most assists</h3><table class="data compact"><thead><tr><th>Player</th><th class="phone-hide">Club</th><th class="num">Ast</th><th class="num">Goals</th></tr></thead>${list('assists', 'goals')}</table></div></div>`;
  }

  function historyHtml(t) {
    const rows = t.history.slice().reverse();
    if (!rows.length) return `<div class="empty">The first ${esc(t.baseName)} of your career is in ${nextFinals(t.level)}.</div>`;
    return `<table class="data compact"><thead><tr><th>Year</th><th>Winners</th><th>Final</th><th class="phone-hide">Hosts</th><th>Top scorer</th></tr></thead>
      ${rows.map((h) => `<tr><td>${h.year}</td><td><b>${tname(h.championId)}</b></td><td>${h.runnerUpId ? tname(h.runnerUpId) : '-'}</td>
        <td class="phone-hide">${h.hostId ? tname(h.hostId) : '-'}</td>
        <td>${h.topScorer ? `${esc(h.topScorer.name)} (${h.topScorer.goals})` : '-'}</td></tr>`).join('')}</table>`;
  }

  function draw() {
    const t = g.competitions[st.compId];
    const live = current(st.compId);
    const qual = g.competitions[NAT_IDS[t.level]];
    const pending = live ? t.fixtureIds.map((id) => g.fixtures[id]).filter((f) => !f.result) : [];
    const day = pending.length ? Math.min(...pending.map((f) => f.day)) : null;
    const today = pending.filter((f) => f.day === day).sort((a, b) => (a.group ?? 9) - (b.group ?? 9));
    const stage = today[0] ? (today[0].stage || `Group stage, matchday ${today[0].round}`) : '';
    const myTeam = g.manager.national?.teamId;
    const title = live ? t.name : `${t.baseName}`;
    const tabs = live ? [['groups', 'Groups'], ['ko', 'Knockouts'], ['stats', 'Scorers'], ['history', 'History']] : [['history', 'History']];
    if (!tabs.some(([k]) => k === st.tab)) st.tab = tabs[0][0];
    const notYet = !live ? `<div class="notice" style="margin-bottom:10px">${tournamentYear(t.level, g.season.year) && qual.format === 'qual'
      ? `The ${esc(qual.name)} are under way (see National teams). The finals are drawn when they end in March and played in June ${g.season.year + 1}.`
      : `The next ${esc(t.baseName)} is in ${nextFinals(t.level)}. Its qualifiers are played in the season before.`}</div>` : '';

    root.innerHTML = `${clubTopbar(ctx, { title: live ? `${t.name}${t.hostId ? ` · hosts ${T(t.hostId).name}` : ''}` : 'International finals' })}
    <div class="panel" style="left:20px;top:92px;width:776px;height:600px;display:flex;flex-direction:column">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <div class="seg">${LEVELS.map((l) => `<button class="${t.level === l ? 'on' : ''}" data-action="level" data-v="${TOURN_IDS[l]}">${l === 'senior' ? 'Euro' : 'U21 Euro'}</button>`).join('')}</div>
        <div class="seg">${tabs.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="tab" data-v="${k}">${l}</button>`).join('')}</div>
      </div>
      <h2 style="margin:0 0 8px">${esc(title)}</h2>
      ${notYet}
      <div class="scroll" style="flex:1">${st.tab === 'groups' ? groupsHtml(t) : st.tab === 'ko' ? knockoutsHtml(t) : st.tab === 'stats' ? statsHtml(t) : historyHtml(t)}</div>
    </div>
    <div class="panel" style="left:812px;top:92px;width:448px;height:540px;display:flex;flex-direction:column">
      ${live && day ? `<h2 style="margin-bottom:2px">Next: ${fmtDate(day)}</h2><div class="muted" style="margin-bottom:8px">${esc(stage)}</div>
        <div class="scroll" style="flex:1"><table class="data eu-day">${today.map((f) => `<tr class="${mineIds.has(f.homeId) || mineIds.has(f.awayId) ? 'me' : ''}">
          <td>${tname(f.homeId)}<br>${tname(f.awayId)}</td>
          <td class="c" style="width:120px">${f.homeId === myTeam || f.awayId === myTeam ? '<b>Your match</b>'
            : `<button class="btn btn-small" data-action="watch" data-id="${f.id}" title="Watch this match live">${icon('eye')}Watch</button>`}</td></tr>`).join('')}</table></div>
        <p class="hint">Watch any match live, or play the day with instant results.</p>`
        : live && t.winnerId ? `<h2>${icon('trophy')} ${esc(t.name)}</h2><div class="banner good-bg" style="font-size:18px">${tname(t.winnerId)} are the champions</div>
          ${(() => { const f = g.fixtures[t.rounds.at(-1).fixtureIds[0]]; return `<p>Final: ${esc(T(f.homeId).name)} ${scoreText(f)} ${esc(T(f.awayId).name)}</p>`; })()}
          <p class="hint">${g.season.phase === 'over' ? 'The season is over. Continue for the season review.' : ''}</p>`
        : `<h2>Match days</h2><div class="empty">${live ? 'Waiting for the next round.' : 'No finals this season.'}</div>`}
    </div>
    ${live && day ? `<button class="btn btn-blue" style="position:absolute;left:812px;top:648px;width:200px" data-action="sim" title="Instant results to the final">Sim to end</button>
      <button class="btn" style="position:absolute;left:1028px;top:648px;width:232px" data-action="play">Play match day</button>`
      : `<button class="btn" style="position:absolute;left:1028px;top:648px;width:232px" data-action="back">${g.season.phase === 'over' ? 'Continue' : 'Back'}</button>`}`;
  }

  // Plays on; the user's own match (as national coach) or the one to watch
  // takes over the screen.
  async function advance(watchId = null) {
    const f = advanceIntl(g, st.compId, { watchId });
    await ctx.save({ silent: true });
    if (f && f.id === watchId) {
      const m = createFixtureMatch(g, f, { homeAI: true, awayAI: true });
      ctx.match = { fixtureId: f.id, m, userSide: null, spectator: true, back: { name: 'euro', params: { compId: st.compId, tab: st.tab } }, paused: false };
      ctx.go('match', {}, { replace: true });
      return true;
    }
    if (f) { ctx.go('tactics', { mode: 'pre', fixtureId: f.id }); return true; }
    return false;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    level: (el) => { st.compId = el.dataset.v; draw(); },
    tab: (el) => { st.tab = el.dataset.v; draw(); },
    player: (el) => showPlayer(ctx, el.dataset.id),
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: g.competitions[st.compId].name }),
    watch: async (el) => { if (!(await advance(el.dataset.id))) draw(); },
    play: async (el) => {
      el.disabled = true;
      if (!(await advance())) draw();
    },
    sim: async (el) => {
      el.disabled = true;
      const t = g.competitions[st.compId];
      for (let i = 0; i < 20 && !t.winnerId; i++) {
        const before = g.day;
        if (await advance()) return;
        if (g.day === before) break;
      }
      draw();
    },
    back: () => (g.season.phase === 'over' ? ctx.home('hub', { seasonOver: true }) : ctx.back()),
  });
  draw();
}
