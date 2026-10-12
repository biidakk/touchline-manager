// Cups: the national cups (knockout rounds) and the three continental
// competitions (league phase + knockout rounds), with past winners.

import { fmtDate } from '../../core/calendar.js';
import { groupTable, leagueTable, leagueZone } from '../../core/continental.js';
import { crest, flag, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, scoreText } from '../components/report.js';
import { esc, bindActions } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const cups = Object.values(g.competitions).filter((c) => c.type === 'cup' || c.type === 'continental');
  const st = { cupId: params.compId || g.nations[g.clubs[g.userClubId].nationId].cupId, round: null };
  const C = (id) => g.clubs[id];
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;
  const short = (name) => name.replace('Round of ', 'R').replace('Quarter-finals', 'QF').replace('Semi-finals', 'SF').replace('Round ', 'R');

  function tie(f) {
    const mine = f.homeId === g.userClubId || f.awayId === g.userClubId;
    const canReport = f.result && f.result.events;
    // Two-legged ties: the second leg decides, and both rows show who went through.
    const decider = f.leg === 1 ? g.fixtures[f.secondLegId] : f;
    const win = decider?.result ? decider.result.winner : null;
    const leg = f.leg ? `<div class="muted" style="font-size:11px">${f.leg === 1 ? '1st leg' : '2nd leg'} · ${fmtDate(f.day, false)}</div>` : '';
    return `<tr class="${mine ? 'me' : ''} ${canReport ? 'click' : ''} ${f.leg === 2 ? 'leg2' : ''}" ${canReport ? `data-action="report" data-id="${f.id}"` : ''}>
      <td class="num" style="width:40%"><span class="${win && win !== f.homeId ? 'dim' : ''}"><b>${clubLink(g, f.homeId)}</b></span> ${clubLink(g, f.homeId, { crest: 20, text: '' })}</td>
      <td class="c" style="width:190px"><b>${f.result ? scoreText(f) : '-'}</b>${leg}</td>
      <td style="width:40%">${clubLink(g, f.awayId, { crest: 20, text: '' })}<span class="${win && win !== f.awayId ? 'dim' : ''}"><b>${clubLink(g, f.awayId)}</b></span></td></tr>`;
  }

  // League phase: one table; the top go straight to the last K, the next K to the play-offs.
  function leagueView(cup) {
    const rows = leagueTable(g, cup);
    const K = cup.knockout;
    return `<table class="data compact"><thead><tr><th class="num">#</th><th></th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Goals</th><th class="num">Pts</th></tr></thead>
      <tbody>${rows.map((r, i) => {
        const z = leagueZone(cup, i + 1);
        return `<tr class="${r.clubId === g.userClubId ? 'me' : ''} ${z === 'direct' ? 'promo' : z === 'out' ? 'releg' : ''}">
        <td class="num">${i + 1}</td><td style="width:22px">${crest(C(r.clubId).crest, 18)}</td><td>${flag(g.nations[C(r.clubId).nationId].flag, 14)} ${clubLink(g, r.clubId)}</td>
        <td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf}:${r.ga}</td><td class="num"><b>${r.pts}</b></td></tr>`;
      }).join('')}</tbody></table>
      <p class="muted" style="font-size:12px;margin-top:6px"><span class="good">▌</span> Places 1-${K / 2} go straight to the ${esc(cup.rounds[1]?.name.toLowerCase() || 'knockouts')}.
        Places ${K / 2 + 1}-${Math.min(rows.length, K / 2 + K)} play the knockout play-offs${rows.length > K / 2 + K ? '; the rest are out' : ''}. Every club plays ${cup.matches} matches against different opponents.</p>`;
  }

  function groupsView(cup) {
    if (!cup.groups?.length && cup.clubIds.length) return leagueView(cup);
    if (!cup.groups?.length) return '<div class="empty">No clubs this season. The competition starts next season, with the clubs that qualify through their leagues and cups.</div>';
    return `<div class="groups-grid">${cup.groups.map((gr) => `<div>
      <h2 style="font-size:15px;margin:0 0 4px">Group ${gr.name}</h2>
      <table class="data compact"><thead><tr><th></th><th>Club</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Goals</th><th class="num">Pts</th></tr></thead>
      <tbody>${groupTable(g, gr).map((r, i) => `<tr class="${r.clubId === g.userClubId ? 'me' : ''} ${i < 2 ? 'promo' : ''}">
        <td style="width:22px">${crest(C(r.clubId).crest, 18)}</td><td>${flag(g.nations[C(r.clubId).nationId].flag, 14)} ${clubLink(g, r.clubId, { short: true })}</td>
        <td class="num">${r.p}</td><td class="num">${r.w}</td><td class="num">${r.d}</td><td class="num">${r.l}</td><td class="num">${r.gf}:${r.ga}</td><td class="num"><b>${r.pts}</b></td></tr>`).join('')}</tbody>
      </table></div>`).join('')}</div>
      <p class="muted" style="font-size:12px;margin-top:6px"><span class="good">▌</span> The top two of each group reach the quarter-finals.</p>`;
  }

  function draw() {
    const cup = g.competitions[st.cupId];
    const cont = cup.type === 'continental';
    const drawn = cup.rounds.map((r, i) => (r.drawn ? i : -1)).filter((i) => i >= 0);
    if (st.round === null || (st.round !== 'groups' && !cup.rounds[st.round]?.drawn)) {
      st.round = drawn.length ? drawn[drawn.length - 1] : cont ? 'groups' : 0;
    }
    const r = st.round === 'groups' ? null : cup.rounds[st.round];
    const legacy = !!cup.groups?.length;
    const title = r ? `${esc(r.name)} <span class="muted" style="font-size:14px">${fmtDate(r.day)}${r.day2 ? ` and ${fmtDate(r.day2)} (two legs)` : ''}</span>` : legacy ? 'Group stage' : 'League phase';

    root.innerHTML = `${clubTopbar(ctx, { title: cup.name })}
    <div class="panel" style="left:20px;top:92px;width:282px;height:600px">
      <ul class="menu-list">${cups.map((c) => `<li data-action="cup" data-id="${c.id}" style="${c.id === st.cupId ? 'background:var(--row-me)' : ''}">
        ${c.nationId ? flag(g.nations[c.nationId].flag, 22) : icon('star')} ${c.type === 'continental' && c.name.length > 18 ? `<span class="phone-hide">${esc(c.name)}</span><span class="phone-only">${esc(c.name.replace(/^Continental /, ''))}</span>` : esc(c.name)}</li>`).join('')}</ul>
      <h2 style="margin-top:18px">Past winners</h2>
      <div class="scroll" style="max-height:330px">${cup.history.slice().reverse().map((h) => `<div class="row" style="padding:3px 0;border-bottom:1px solid var(--row-line)">
        <span class="muted" style="width:62px">${y(h.year)}</span><b>${clubLink(g, h.winnerId, { crest: 18, short: true })}</b></div>`).join('') || '<div class="empty">First edition in progress.</div>'}</div>
    </div>
    <div class="panel" style="left:320px;top:92px;width:940px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${title}</h2>
        <div class="seg">${cont ? `<button class="${st.round === 'groups' ? 'on' : ''}" data-action="round" data-i="groups">${legacy ? 'Groups' : 'League'}</button>` : ''}${cup.rounds.map((x, i) => `<button class="${i === st.round ? 'on' : ''}" ${x.drawn ? '' : 'disabled'} data-action="round" data-i="${i}">${esc(short(x.name))}</button>`).join('')}</div>
      </div>
      ${cup.winnerId ? `<div class="banner good-bg" style="margin-bottom:10px">${clubLink(g, cup.winnerId)} won the ${cont ? esc(cup.name) : 'cup'}!</div>` : ''}
      <div class="scroll" style="flex:1">${r ? `<table class="data">${r.fixtureIds.map((id) => tie(g.fixtures[id])).join('')}</table>
        ${r.byes.length ? `<p class="muted" style="font-size:12.5px">Byes: ${r.byes.map((id) => clubLink(g, id, { short: true })).join(', ')}</p>` : ''}` : groupsView(cup)}</div>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    cup: (el) => { st.cupId = el.dataset.id; st.round = null; draw(); },
    round: (el) => { st.round = el.dataset.i === 'groups' ? 'groups' : Number(el.dataset.i); draw(); },
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: 'Match report' }),
    back: () => ctx.back(),
  });
  draw();
}
