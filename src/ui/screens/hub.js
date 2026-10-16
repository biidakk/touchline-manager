// Main hub, modelled on the reference layout.

import { upcomingForClub, sortedTable, leagueProgress, clubFixtures } from '../../core/season.js';
import { advanceToUserMatch, pendingUserFixture, nextUserFixture } from '../../core/matchday.js';
import { endSeason } from '../../core/seasonend.js';
import { confidence, confidenceLevel } from '../../core/board.js';
import { teamOf, runningTournament, TOURN_IDS, LEVELS } from '../../core/national.js';
import { decisionsDue } from '../../core/commercial.js';
import { tourDue } from '../../core/preseason.js';
import { continentalOf } from '../../core/continental.js';
import { matchReport, scoreText, outcomeFor, roundLabel } from '../components/report.js';
import { lineupQuality } from '../../core/ratings.js';
import { fmtDate } from '../../core/calendar.js';
import { crest, jersey, flag, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, fmtMoneyShort, fmt1, bindActions } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';
import { newOffers } from '../../core/transfers.js';
import { marketPopups } from '../offers.js';
import { contractReminder } from '../contracts.js';
import { takeAchievementQueue } from '../../core/achievements.js';
import { runQuickSim } from '../quicksim.js';
import { clubChecklist } from '../../core/assistant.js';
import { showTip, tipsOn, setTips } from '../tips.js';

// News filter tabs: each news kind belongs to one group; some kinds are marked as important.
const NEWS_TABS = [['all', 'All'], ['match', 'Games'], ['transfer', 'Deals'], ['squad', 'Squad'], ['club', 'Club']];
const NEWS_GROUP = {
  result: 'match', preview: 'match', league: 'match', cup: 'match', national: 'match',
  transfer: 'transfer', offer: 'transfer', loan: 'transfer', contract: 'transfer',
  injury: 'squad', player: 'squad', training: 'squad', youth: 'squad', staff: 'squad',
  board: 'club', club: 'club', job: 'club', info: 'club', achievement: 'club',
};
const IMPORTANT = new Set(['board', 'contract', 'injury', 'offer', 'job', 'achievement']);

const MENU = [
  ['team', 'My Team', 'myteam', 'My Team', 3],
  ['shirt', 'Other Teams', 'otherteams', 'Other Teams', 7],
  ['calendar', 'Season Schedule', 'schedule', 'Season Schedule', 2],
  ['career', 'My Career', 'career', 'My Career', 5],
  ['search', 'Search', 'search', 'Search', 7],
  ['cart', 'Transfer Market', 'market', 'search', 6],
  ['youth', 'Training', 'training', 'Training', 10],
  ['money', 'Finances', 'finances', 'Finances', 6],
  ['flag', 'National Teams', 'national', 'National Teams', 9],
];

export function render(root, ctx, params = {}) {
  const st = { newsLimit: 4, transferScope: 'all', transferPage: 0, newsFilter: 'all' };

  function draw() {
    const g = ctx.game;
    const club = g.clubs[g.userClubId];
    const conf = confidence(g);
    const [, confLabel, confCls] = confidenceLevel(conf);
    const offerCount = (g.manager.offers || []).length + (g.national?.jobs || []).filter((j) => j.offered).length;
    const nation = g.nations[club.nationId];
    const comp = g.competitions[club.compId];
    const cup = g.competitions[nation.cupId];

    // Upcoming fixtures
    const natId = g.manager.national?.teamId;
    const natItems = natId ? Object.values(g.fixtures).filter((f) => !f.result && (f.homeId === natId || f.awayId === natId))
      .map((f) => ({ fixture: f, day: f.day, compId: f.compId })) : [];
    const upcoming = [...upcomingForClub(g, club.id, 3), ...natItems].sort((a, b) => a.day - b.day).slice(0, 3).map((it) => {
      const c = g.competitions[it.compId];
      const f = it.fixture;
      let line3;
      let badge;
      if (f) {
        const me = c.type === 'national' ? natId : club.id;
        const home = f.homeId === me;
        const opp = teamOf(g, home ? f.awayId : f.homeId);
        line3 = c.type === 'national' ? `${esc(teamOf(g, me).name)} vs ${esc(opp.name)} (${home ? 'H' : 'A'})`
          : `${clubLink(g, opp.id)} (${home ? 'H' : 'A'})`;
        badge = c.type === 'national' ? crest(opp.crest, 40) : `<span class="lnk" data-club="${opp.id}">${crest(opp.crest, 40)}</span>`;
      } else {
        line3 = '<span class="dim">Opponent not drawn yet</span>';
        badge = `<span style="width:40px;display:inline-flex;justify-content:center">${icon('trophy')}</span>`;
      }
      const round = f ? roundLabel(g, f) : it.roundName;
      return `<div class="fixture">${badge}<div>
        <div class="t1">${esc(c.name)}</div>
        <div class="t2">${round} · ${fmtDate(it.day)}</div>
        <div class="t3">${line3}</div></div></div>`;
    }).join('');

    const last = clubFixtures(g, club.id).filter((f) => f.result).pop();
    let lastHtml = '';
    if (last) {
      const o = outcomeFor(g, last);
      const opp = g.clubs[last.homeId === club.id ? last.awayId : last.homeId];
      lastHtml = `<div class="fixture last-result" data-action="report" data-id="${last.id}">
        <span class="res-badge ${o}">${o}</span><div>
        <div class="t1">Last: ${esc(g.competitions[last.compId].name)}</div>
        <div class="t3">${clubLink(g, opp.id)} (${last.homeId === club.id ? 'H' : 'A'}) <b>${scoreText(last)}</b></div></div></div>`;
    }

    // News, filtered by kind; important items are marked.
    const shown = g.news.filter((n) => st.newsFilter === 'all' || NEWS_GROUP[n.kind] === st.newsFilter);
    const news = shown.slice(0, st.newsLimit).map((n) => `<div class="news-item ${IMPORTANT.has(n.kind) ? 'important' : ''}">
      <div class="txt" title="${esc(n.text)}">${linkClubsInText(g, n.text)}</div>
      <button class="x-btn" data-action="dismiss" data-id="${n.id}">x</button></div>`).join('');
    const moreNews = Math.max(0, shown.length - st.newsLimit);

    // Transfers ticker
    const inLeague = (id) => g.clubs[id].compId === club.compId;
    const allTransfers = g.transfers.filter((t) => st.transferScope === 'all' || inLeague(t.fromId) || inLeague(t.toId));
    // Phones (bigger text) show five transfers a page.
    const per = document.documentElement.classList.contains('phone') ? 5 : 10;
    const pageCount = Math.min(5, Math.ceil(allTransfers.length / per));
    const transfers = allTransfers.slice(st.transferPage * per, st.transferPage * per + per);

    // Season box
    const table = sortedTable(g, comp);
    const pos = table.findIndex((r) => r.clubId === club.id);
    const from = Math.max(0, Math.min(pos - 2, table.length - 5));
    const prog = leagueProgress(g, club.id);

    // The club's continental competition this season, else the Champions Cup.
    const cont = continentalOf(g, club.id) || g.competitions.CCC;
    const compTiles = [...nation.leagueIds.map((id) => g.competitions[id]), cup, ...(cont ? [cont] : [])].map((c) => `
      <div class="comp-tile" data-action="comp" data-id="${c.id}" title="${esc(c.name)}">
        ${icon(c.type === 'league' ? 'table' : c.type === 'continental' ? 'star' : 'trophy', 'ico big')}<span>${esc(c.name)}</span></div>`).join('');

    // This summer's international finals, once drawn: a tile of their own (in
    // place of All leagues), and Continue follows them after the club season.
    const finals = LEVELS.map((l) => g.competitions[TOURN_IDS[l]]).find((t) => t.year === g.season.year + 1 && t.groups.length);
    const toFinals = !!runningTournament(g) && !nextUserFixture(g) && !pendingUserFixture(g);
    const prepare = g.season.phase !== 'over' && !toFinals && (decisionsDue(g).any || tourDue(g));
    const simOk = g.season.phase !== 'over' && !prepare;
    const todo = clubChecklist(g);

    root.innerHTML = `${clubTopbar(ctx)}
    <div class="panel" style="left:20px;top:92px;width:282px;height:394px">
      <ul class="menu-list">
        ${MENU.map(([ic, label, screen, title, m]) => `<li data-action="menu" data-screen="${screen}" data-title="${title}" data-m="${m}">${icon(ic)}${label}${screen === 'career' && offerCount ? ` <span class="badge list" title="Job offers">${offerCount}</span>` : ''}</li>`).join('')}
        <li class="sep phone-hide" data-action="comp" data-id="${comp.id}">${icon('ball')}${esc(comp.name)}</li>
        <li class="phone-hide" data-action="comp" data-id="${cup.id}">${icon('trophy')}${esc(cup.name)}</li>
        ${cont ? `<li class="phone-hide" data-action="comp" data-id="${cont.id}">${icon('star')}${esc(cont.name)}${cont.clubIds.includes(club.id) ? '' : ' <span class="soon">not qualified</span>'}</li>` : ''}
      </ul>
    </div>
    <div class="panel comp-tiles" style="left:20px;top:500px;width:282px;height:200px;grid-template-columns:repeat(3,1fr)">
      ${compTiles}
      ${finals ? `<div class="comp-tile" data-action="comp" data-id="${finals.id}" title="${esc(finals.name)}">${icon('trophy', 'ico big')}<span>${esc(finals.name)}</span></div>`
        : `<div class="comp-tile" data-action="comp" data-id="" title="All leagues">${icon('flag', 'ico big')}<span>All leagues</span></div>`}
    </div>

    <div class="panel hub-fixtures" style="left:320px;top:92px;width:322px;height:608px;display:flex;flex-direction:column">${lastHtml}${upcoming || '<div class="empty">No fixtures left this season.</div>'}
      <button class="btn btn-small btn-blue" style="margin-top:auto" data-action="menu" data-screen="schedule" data-title="Season Schedule" data-m="2">Full schedule</button></div>

    <div class="panel" style="left:660px;top:92px;width:332px;height:282px;display:flex;flex-direction:column">
      <div class="panel-head" style="margin:0 0 4px"><h2>News</h2>
        <button class="btn btn-small ${todo.some((t) => t.tone === 'bad') ? '' : 'btn-blue'}" data-action="todo" title="Your assistant's list of things that need attention">To do${todo.length ? ` (${todo.length})` : ''}</button></div>
      <div class="seg full news-tabs">${NEWS_TABS.map(([k, l]) => `<button class="${st.newsFilter === k ? 'on' : ''}" data-action="newsfilter" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="scroll" style="flex:1;margin-top:6px">${news || '<div class="empty">No news here.</div>'}</div>
      <div class="row" style="justify-content:space-between;font-weight:800;margin-top:6px">
        <span style="cursor:pointer" data-action="clearnews">Clear all</span>
        <span style="cursor:pointer" data-action="morenews">${moreNews ? `+${moreNews} more` : ''}</span>
      </div>
    </div>

    <div class="panel" style="left:660px;top:388px;width:332px;height:312px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Transfers</h2>
        <div class="seg"><button class="${st.transferScope === 'all' ? 'on' : ''}" data-action="tscope" data-v="all">All</button><button class="${st.transferScope === 'league' ? 'on' : ''}" data-action="tscope" data-v="league">League</button></div>
      </div>
      <div style="flex:1;overflow:hidden">
      ${transfers.length ? `<table class="data compact">${transfers.map((t) => `<tr><td>${g.players[t.playerId] ? playerLink(g, t.playerId, { text: t.playerName }) : esc(t.playerName)}</td>
        <td class="c">${clubLink(g, t.fromId, { crest: 18, text: '' })} › ${clubLink(g, t.toId, { crest: 18, text: '' })}</td>
        <td class="num">${t.loan ? `<span class="badge loan">LOAN</span> ${t.fee ? fmtMoney(t.fee) : ''}` : fmtMoney(t.fee)}</td></tr>`).join('')}</table>`
        : '<div class="empty">No transfers yet this season.</div>'}
      </div>
      ${pageCount > 1 ? `<div class="pager"><div class="seg">${Array.from({ length: pageCount }, (_, i) => `<button class="${i === st.transferPage ? 'on' : ''}" data-action="tpage" data-p="${i}">${i * per + 1}-${i * per + per}</button>`).join('')}</div></div>` : ''}
    </div>

    <div class="panel" style="left:1010px;top:92px;width:250px;height:282px">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        ${crest(club.crest, 96)}
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">${flag(nation.flag, 40)}${jersey({ colors: club.colors, size: 48 })}</div>
      </div>
      <div class="kv" style="margin-top:8px">
        <span>League:</span><b class="row" style="gap:6px">${flag(nation.flag, 16)} ${comp.tier}. tier</b>
        <span>Quality:</span><b>${fmt1(lineupQuality(g, club))}</b>
        <span>Stadium:</span><b>${club.stadium.capacity.toLocaleString('en-US')}</b>
        <span>Money:</span><b class="${club.budget < 0 ? 'bad' : ''}">${fmtMoneyShort(club.budget)}</b>
        <span>Board:</span><b class="${confCls}" style="cursor:pointer" data-action="menu" data-screen="career" title="Board confidence: see My Career">${confLabel}<span class="phone-hide"> (${conf})</span></b>
      </div>
      ${g.season.phase === 'over' ? '<div class="banner good-bg" style="font-size:14px;margin-top:8px">Season over: press Continue</div>' : ''}
    </div>

    <div class="panel hub-season" style="left:1010px;top:388px;width:250px;height:240px">
      <h2>Season ${g.season.year}/${String(g.season.year + 1).slice(2)}</h2>
      <div class="row" style="justify-content:space-between;font-weight:800;font-size:13px;margin-bottom:6px">Season done:<div class="bar" style="width:92px"><i style="width:${prog.seasonPct}%"></i><b>${prog.seasonPct}%</b></div></div>
      <div class="row" style="justify-content:space-between;font-weight:800;font-size:13px">Points won:<div class="bar" style="width:92px"><i style="width:${prog.pointsPct}%"></i><b>${prog.pointsPct}%</b></div></div>
      <table class="data" style="margin-top:10px;cursor:pointer" data-action="comp" data-id="${comp.id}">
        ${table.slice(from, from + 5).map((r, i) => `<tr class="${r.clubId === club.id ? 'me' : ''} ${Math.abs(i - Math.min(3, Math.max(1, pos - from))) > 1 ? 'phone-hide' : ''}">
          <td style="width:24px">${from + i + 1}.</td><td>${clubLink(g, r.clubId, { short: true })}</td><td class="num">${r.pts} pts</td></tr>`).join('')}
      </table>
    </div>

    ${simOk ? `<button class="btn btn-blue" style="position:absolute;left:1030px;top:644px;width:62px;min-width:0;padding:0;height:48px;font-size:16px" data-action="sim" title="Quick sim: play ahead with instant results">Sim</button>` : ''}
    <button class="btn" style="position:absolute;left:${simOk ? 1100 : 1030}px;top:644px;width:${simOk ? 140 : 210}px;min-width:0;padding:0;height:48px;font-size:18px" data-action="continue">${prepare ? 'Prepare season' : toFinals ? esc(runningTournament(g).name) : 'Continue'}</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    menu: (el) => ctx.go(el.dataset.screen, el.dataset.screen === 'market' ? { tab: el.dataset.title }
      : { title: el.dataset.title, milestone: Number(el.dataset.m) }),
    comp: (el) => {
      const c = ctx.game.competitions[el.dataset.id];
      if (!c || c.type === 'league') ctx.go('tables', { compId: el.dataset.id || null });
      else if (c.type === 'national') ctx.go('euro', { compId: c.id });
      else ctx.go('cup', { compId: c.id });
    },
    dismiss: (el) => {
      ctx.game.news = ctx.game.news.filter((n) => n.id !== el.dataset.id);
      draw();
    },
    report: (el) => ctx.modal(matchReport(ctx.game, ctx.game.fixtures[el.dataset.id]), { title: 'Match report' }),
    clearnews: () => { ctx.game.news = st.newsFilter === 'all' ? [] : ctx.game.news.filter((n) => NEWS_GROUP[n.kind] !== st.newsFilter); draw(); },
    newsfilter: (el) => { st.newsFilter = el.dataset.v; st.newsLimit = 4; draw(); },
    morenews: () => { st.newsLimit += 4; draw(); },
    tscope: (el) => { st.transferScope = el.dataset.v; st.transferPage = 0; draw(); },
    tpage: (el) => { st.transferPage = Number(el.dataset.p); draw(); },
    todo: async () => {
      const items = clubChecklist(ctx.game);
      const tone = { bad: 'bad', warn: 'warn', info: '' };
      const html = items.length ? `<div class="todo-list">${items.map((t, i) => `<div class="todo-item" data-k="${i}">
          <span class="todo-dot ${tone[t.tone]}"></span><span style="flex:1">${esc(t.text)}</span><span class="muted">›</span></div>`).join('')}</div>`
        : '<p class="good">Nothing needs your attention right now.</p>';
      const k = await ctx.dialog(html, [
        { key: 'tips', label: tipsOn(ctx.game) ? 'Turn tips off' : 'Show tips again', blue: true },
        { key: 'close', label: 'Close' },
      ], { title: 'To do' });
      if (k === 'tips') {
        const on = !tipsOn(ctx.game);
        setTips(ctx.game, on);
        ctx.toast(on ? 'Tips are on: each screen explains itself the next time you open it.' : 'Tips are off.');
        return;
      }
      const t = items[Number(k)];
      if (t) ctx.go(t.screen, t.params || {});
    },
    sim: async (el) => {
      el.disabled = true;
      const sim = await runQuickSim(ctx);
      if (sim?.stop === 'sacked') {
        await ctx.confirm(`${ctx.game.manager.sacked.clubName} have sacked you ${ctx.game.manager.sacked.why}. Choose your next club from the offers.`, { ok: 'Find a new job', cancel: null });
        ctx.home('career');
        return;
      }
      ctx.home('hub', { seasonOver: ctx.game.season.phase === 'over' });
    },
    continue: async (el) => {
      const g = ctx.game;
      // The club season is done but the international finals are on: follow them.
      const finals = g.season.phase !== 'over' && runningTournament(g);
      if (finals && !nextUserFixture(g) && !pendingUserFixture(g)) { ctx.go('euro', { compId: finals.id }); return; }
      // Ticket prices (and a sponsor, when the old deal has run out) come first.
      if (g.season.phase !== 'over' && decisionsDue(g).any) { ctx.go('deals'); return; }
      if (g.season.phase !== 'over' && tourDue(g)) { ctx.go('preseason'); return; }
      el.disabled = true;
      if (g.season.phase === 'over') return finishSeason();
      // A match day already started (e.g. the page was reloaded at the pre-match screen) is resumed, not skipped.
      const f = pendingUserFixture(g) || advanceToUserMatch(g, { stopForOffers: true });
      await ctx.save({ silent: true });
      if (g.stopReason === 'offer' || g.stopReason === 'windowNews') {
        delete g.stopReason;
        draw();
        await marketPopups(ctx);
        await ctx.save({ silent: true });
        draw();
        return;
      }
      if (f && (newOffers(g).length || g.windowNews)) await marketPopups(ctx);
      if (f) ctx.go('tactics', { mode: 'pre', fixtureId: f.id });
      else if (g.stopReason === 'sacked') {
        delete g.stopReason;
        await ctx.confirm(`${g.manager.sacked.clubName} have sacked you ${g.manager.sacked.why}. Choose your next club from the offers.`, { ok: 'Find a new job', cancel: null });
        ctx.home('career');
      } else if (g.stopReason) {
        delete g.stopReason;
        draw();
        await ctx.confirm('The winter transfer window is open until 7 February. Clubs can make offers for your players again.', { ok: 'OK', cancel: null });
      } else finishSeason();
    },
  });

  // Rolls the world over to the next season and shows the review.
  async function finishSeason() {
    endSeason(ctx.game);
    await ctx.save({ silent: true });
    ctx.go('review');
  }

  // Out of work: the career screen (choosing a new club) is the only way on.
  if (ctx.game.manager.sacked) {
    ctx.home('career');
    return;
  }
  draw();
  // Offers that arrived while away (e.g. on a match day) pop up here, then the
  // reminder about expiring contracts (three league games before the end).
  (async () => {
    if (newOffers(ctx.game).length || ctx.game.windowNews) { await marketPopups(ctx); draw(); }
    const unlocked = takeAchievementQueue(ctx.game);
    if (unlocked.length) {
      await ctx.dialog(`<ul style="margin:0 0 0 18px;line-height:1.6">${unlocked.map((a) => `<li><b>${esc(a.title)}</b>${a.note ? ` · ${esc(a.note)}` : ''}<div class="muted" style="font-size:13px">${esc(a.text)}</div></li>`).join('')}</ul>`,
        [{ key: 'ok', label: 'Great', blue: true }, { key: 'fame', label: 'Hall of Fame' }], { title: unlocked.length > 1 ? 'Achievements unlocked' : 'Achievement unlocked' })
        .then((k) => { if (k === 'fame') ctx.go('fame'); });
      await ctx.save({ silent: true });
    }
    if (await contractReminder(ctx)) { await ctx.save({ silent: true }); ctx.go('myteam'); return; }
    await showTip(ctx, 'hub');
  })();
  if (params.seasonOver) ctx.toast('The season is over. Press Continue for the season review.');
}
