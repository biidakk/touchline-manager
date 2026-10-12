// "My Career": manager record, board confidence, job offers and vacancies,
// trophies and season-by-season history. When the manager is out of work it
// is the only way forward: pick a club from the offers.

import { crest, flag, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { confidence, confidenceLevel, boardReasons, reputationLevel, takeJob, applyForJob, declineOffer, resign,
  canAskBoard, askBoard, acceptBoardOffer, declineBoardOffer, askAmount, MONEY_ASKS,
  SACK_AT, ULTIMATUM_AT } from '../../core/board.js';
import { boardTarget } from '../../core/worldgen.js';
import { nationalRanking, nationalRequirement, applyNational, declineNational, acceptNational, resignNational, welcomeByFederations } from '../../core/nationaljob.js';
import { nationalTable } from '../../core/national.js';
import { sortedTable } from '../../core/season.js';
import { fmtDate } from '../../core/calendar.js';
import { esc, bindActions, fmtMoney } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';

const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;
const END = { sacked: 'sacked', resigned: 'resigned', left: 'moved on' };

export function render(root, ctx) {
  const st = { tab: 'seasons' };

  function jobRow(g, clubId, kind) {
    const c = g.clubs[clubId];
    const comp = g.competitions[c.compId];
    const pos = sortedTable(g, comp).findIndex((r) => r.clubId === c.id) + 1;
    const job = g.jobs.find((j) => j.clubId === clubId);
    const buttons = kind === 'offer'
      ? `<button class="btn btn-small" data-action="accept" data-id="${c.id}">Accept</button>
         <button class="btn btn-small btn-blue" data-action="decline" data-id="${c.id}">Decline</button>`
      : job?.applied ? '<span class="dim">Applied</span>' : `<button class="btn btn-small btn-blue" data-action="apply" data-id="${c.id}">Apply</button>`;
    const expects = boardTarget(g, c).text;
    return `<div class="job-row">${clubLink(g, c.id, { crest: 30, text: '' })}
      <div class="job-txt" title="${esc(`${c.name}, ${comp.name}, ${pos}. place, reputation ${c.reputation}. Board expects: ${expects.toLowerCase()}.`)}"><b>${clubLink(g, c.id)}</b>
        <div class="muted">${esc(comp.name)} · ${pos}. · reputation ${c.reputation}</div>
        <div class="dim">Board expects: ${esc(expects.toLowerCase())}</div></div>
      <div class="job-btns">${buttons}</div></div>`;
  }

  function natRow(g, job, ranking) {
    const t = g.national.teams[job.teamId];
    const req = nationalRequirement(g, job.teamId, ranking);
    const comp = g.competitions[t.compId];
    const pos = nationalTable(g, comp).findIndex((r) => r.clubId === t.id) + 1;
    const buttons = job.offered
      ? `<button class="btn btn-small" data-action="nataccept" data-id="${t.id}">Accept</button>
         <button class="btn btn-small btn-blue" data-action="natdecline" data-id="${t.id}">Decline</button>`
      : job.applied ? '<span class="dim">Applied</span>' : `<button class="btn btn-small btn-blue" data-action="natapply" data-id="${t.id}">Apply</button>`;
    return `<div class="job-row">${flag(g.nations[t.nationId].flag, 30)}
      <div class="job-txt"><b>${esc(t.name)}</b>${job.offered ? ' <span class="good" style="font-size:12px">offer</span>' : ''}
        <div class="muted">${esc(comp.name)}${pos && comp.table[t.id]?.p ? ` · ${pos}.` : ''} · wants reputation ${req}+</div>
        <div class="dim">Head coach, alongside your club job</div></div>
      <div class="job-btns">${buttons}</div></div>`;
  }

  function draw() {
    const g = ctx.game;
    const m = g.manager;
    const club = g.clubs[g.userClubId];
    const h = m.history || [];
    const stints = m.stints || [];
    const tot = stints.reduce((a, s) => ({ p: a.p + s.p, w: a.w + s.w, d: a.d + s.d, l: a.l + s.l }), { p: 0, w: 0, d: 0, l: 0 });
    const trophies = g.history.trophies || [];
    const best = h.slice().sort((a, b) => a.tier - b.tier || a.pos - b.pos)[0];
    const sacked = m.sacked;
    const conf = confidence(g);
    const [, confLabel, confCls] = confidenceLevel(conf);
    const offers = (m.offers || []).filter((o) => g.clubs[o.clubId]);
    const offerIds = new Set(offers.map((o) => o.clubId));
    const vacancies = (g.jobs || []).filter((j) => !offerIds.has(j.clubId) && j.clubId !== g.userClubId && g.clubs[j.clubId])
      .sort((a, b) => g.clubs[b.clubId].reputation - g.clubs[a.clubId].reputation);
    const ranking = nationalRanking(g);
    const natJobs = (g.national?.jobs || []).slice().sort((a, b) => !!b.offered - !!a.offered);
    const natTeam = m.national;

    const boardHtml = sacked
      ? `<div class="banner bad-bg" style="font-size:18px">${sacked.reason === 'resigned' ? 'You resigned' : 'Sacked'}</div>
        <p style="margin:12px 0 6px">${sacked.reason === 'resigned'
          ? `You left ${esc(sacked.clubName)} on ${fmtDate(sacked.day)}.`
          : `${esc(sacked.clubName)} sacked you on ${fmtDate(sacked.day)} ${esc(sacked.why)}.`}</p>
        <p class="muted">Choose your next club from the offers on the right. More clubs may call while you wait; you can also apply for vacancies.</p>`
      : `<div class="row" style="justify-content:space-between;align-items:baseline">
          <span style="font-size:15px;font-weight:800">Confidence</span>
          <span class="${confCls}" style="font-size:20px;font-weight:900">${confLabel} (${conf})</span></div>
        <div class="bar conf-bar" style="margin:6px 0 4px"><i style="width:${conf}%;${conf < ULTIMATUM_AT ? 'background:linear-gradient(180deg,#e05050,#b8312f)' : ''}"></i>
          <span class="mark" style="left:${SACK_AT}%" title="Sacking line"></span></div>
        <div class="muted" style="font-size:13px">Target: <b>${esc(m.target?.text || '-')}</b>${m.target?.pledge ? ' <span class="warn">(your promise to the board: miss it and you are sacked)</span>' : ''}</div>
        <ul class="advice" style="margin-top:8px">${boardReasons(g).map((r) => `<li class="${r.v > 0 ? 'good' : 'bad'}">${r.v > 0 ? '+' : ''}${r.v} ${esc(r.text)}</li>`).join('')
          || '<li class="dim">Nothing to report yet.</li>'}</ul>
        ${conf < ULTIMATUM_AT ? '<div class="bad" style="font-size:13px;font-weight:800;margin-top:6px">The board has run out of patience: improve quickly or you will be sacked.</div>' : ''}`;

    const seasonsHtml = `<table class="data">
      <thead><tr><th>Season</th><th>Club</th><th>League</th><th class="num">Pos</th><th class="num">P</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Goals</th><th class="num">Pts</th><th>Cup</th><th>Champions Cup</th><th>Board</th><th>Trophies</th></tr></thead>
      <tbody>${h.slice().reverse().map((s) => `<tr><td>${y(s.year)}</td><td>${esc(s.clubName)}</td><td>${esc(s.compName)}</td>
        <td class="num"><b>${s.pos}.</b></td><td class="num">${s.p}</td><td class="num">${s.w}</td><td class="num">${s.d}</td><td class="num">${s.l}</td>
        <td class="num">${s.gf}:${s.ga}</td><td class="num">${s.pts}</td><td>${esc(s.cup || '-')}</td><td>${esc(s.cont || '-')}</td>
        <td>${s.board ? `<span class="${s.board.met ? 'good' : 'bad'}" title="Target: ${esc(s.board.target)}">${s.board.met ? 'Target met' : 'Missed'}</span>` : '-'}</td>
        <td>${s.trophies.map(esc).join(', ')}</td></tr>`).join('')
        || '<tr><td colspan="14" class="empty">Your first season is still in progress.</td></tr>'}</tbody></table>`;
    const clubsHtml = `<table class="data">
      <thead><tr><th>Club</th><th>From</th><th>To</th><th class="num">Matches</th><th class="num">W</th><th class="num">D</th><th class="num">L</th><th class="num">Win %</th><th>Left</th></tr></thead>
      <tbody>${stints.slice().reverse().map((s) => `<tr><td>${g.clubs[s.clubId] ? crest(g.clubs[s.clubId].crest, 18) : ''} ${esc(s.clubName)}</td>
        <td>${y(s.from)}</td><td>${s.to == null ? '<span class="good">current</span>' : y(s.to)}</td>
        <td class="num">${s.p}</td><td class="num">${s.w}</td><td class="num">${s.d}</td><td class="num">${s.l}</td>
        <td class="num">${s.p ? Math.round((100 * s.w) / s.p) : 0}%</td><td>${s.end ? END[s.end] : '-'}</td></tr>`).join('')}</tbody></table>`;

    root.innerHTML = `${clubTopbar(ctx, { title: 'My career' })}
    <div class="panel" style="left:20px;top:92px;width:340px;height:600px;display:flex;flex-direction:column">
      <div class="row" style="gap:14px">${crest(club.crest, 64)}<div><div style="font-size:22px;font-weight:900">${esc(m.name)}</div>
        <div class="muted">${sacked ? '<span class="bad">Out of work</span>' : `Manager of ${esc(club.name)}`}</div></div></div>
      <div class="fin-list" style="margin-top:14px">
        <span>Reputation</span><b>${reputationLevel(m.reputation ?? 0)} (${m.reputation ?? '-'})</b>
        <span>National team</span><b>${natTeam ? `<button class="linkbtn" data-action="natteam">${esc(natTeam.name)}</button> (${natTeam.w}-${natTeam.d}-${natTeam.l})
          <button class="btn btn-small btn-blue" style="margin-left:6px;height:22px;padding:0 8px" data-action="natresign" title="Step down as head coach">Resign</button>` : '-'}</b>
        <span>Career started</span><b>${y(m.startYear ?? g.season.year)}</b>
        <span>Seasons completed</span><b>${h.length}</b>
        <span>Clubs</span><b>${new Set(stints.map((s) => s.clubId)).size}</b>
        <span>Matches (all competitions)</span><b>${tot.p}</b>
        <span>Won / drawn / lost</span><b>${tot.w} / ${tot.d} / ${tot.l}</b>
        <span>Win rate</span><b>${tot.p ? Math.round((100 * tot.w) / tot.p) : 0}%</b>
        <span>Best finish</span><b>${best ? `${best.pos}. in ${esc(best.compName)} (${y(best.year)})` : '-'}</b>
      </div>
      ${sacked ? '' : `<button class="btn btn-small btn-blue" style="margin-top:10px" data-action="clubrecords" title="${esc(club.name)}: season by season and club records">Club history &amp; records</button>`}
      <h2 style="margin-top:12px">Trophies (${trophies.length})</h2>
      <div class="scroll" style="flex:1">${trophies.length
        ? trophies.slice().reverse().map((t) => `<div class="row" style="padding:4px 0;border-bottom:1px solid var(--row-line)">${icon('trophy')}<b>${esc(t.name)}</b><span class="muted" style="margin-left:auto">${y(t.year)}</span></div>`).join('')
        : '<div class="empty">No trophies yet.</div>'}</div>
    </div>
    <div class="panel" style="left:376px;top:92px;width:420px;height:300px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Board</h2>${sacked ? '' : `<div class="row" style="gap:6px">
        <button class="btn btn-small" data-action="askmoney" title="Ask the board for extra money (once a season)" ${m.board?.askedYear === g.season.year ? 'disabled' : ''}>Ask for money</button>
        <button class="btn btn-small btn-blue" data-action="resign" title="Leave the club and look for another job">Resign</button></div>`}</div>
      <div style="flex:1;overflow:hidden">${boardHtml}</div>
    </div>
    <div class="panel" style="left:812px;top:92px;width:448px;height:300px;display:flex;flex-direction:column">
      <h2>${sacked ? 'Choose your next club' : 'Jobs'}</h2>
      <div class="scroll" style="flex:1">
        ${offers.length ? `<div class="job-head">Offers to you</div>${offers.map((o) => jobRow(g, o.clubId, 'offer')).join('')}` : ''}
        <div class="job-head">Vacancies</div>
        ${vacancies.map((j) => jobRow(g, j.clubId, 'vacancy')).join('') || '<div class="empty" style="padding:8px 0">No clubs are looking for a manager right now.</div>'}
        <div class="job-head">National teams</div>
        ${welcomeByFederations(g) ? '' : '<div class="dim" style="font-size:12px;padding:2px 0 4px">Federations only approach you while your club is doing well (or you are out of work). You can still apply.</div>'}
        ${natJobs.map((j) => natRow(g, j, ranking)).join('') || '<div class="empty" style="padding:8px 0">No national team is looking for a coach.</div>'}
      </div>
    </div>
    <div class="panel" style="left:376px;top:408px;width:884px;height:226px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${st.tab === 'seasons' ? 'Season by season' : 'Clubs managed'}</h2>
        <div class="seg"><button class="${st.tab === 'seasons' ? 'on' : ''}" data-action="tab" data-v="seasons">Seasons</button><button class="${st.tab === 'clubs' ? 'on' : ''}" data-action="tab" data-v="clubs">Clubs</button></div></div>
      <div class="scroll" style="flex:1">${st.tab === 'seasons' ? seasonsHtml : clubsHtml}</div>
    </div>
    ${sacked ? '' : '<button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>'}`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    back: () => ctx.back(),
    tab: (el) => { st.tab = el.dataset.v; draw(); },
    accept: async (el) => {
      const g = ctx.game;
      const c = g.clubs[el.dataset.id];
      const leaving = g.manager.sacked ? '' : ` You will leave ${g.clubs[g.userClubId].name}.`;
      if (!(await ctx.confirm(`Become the manager of ${c.name}?${leaving}`, { ok: 'Take the job', cancel: 'Not yet' }))) return;
      const r = takeJob(g, c.id);
      if (!r.ok) { ctx.toast(r.message); return; }
      await ctx.save({ silent: true });
      ctx.home('hub');
      ctx.toast(r.message);
    },
    natteam: () => ctx.go('natteam'),
    clubrecords: () => ctx.go('otherteams', { clubId: ctx.game.userClubId, tab: 'records' }),
    natresign: async () => {
      const g = ctx.game;
      if (!(await ctx.confirm(`Step down as head coach of ${g.manager.national.name}? You keep your club job.`, { ok: 'Resign', cancel: 'Stay' }))) return;
      const r = resignNational(g);
      ctx.toast(r.message);
      if (r.ok) await ctx.save({ silent: true });
      draw();
    },
    natapply: (el) => { ctx.toast(applyNational(ctx.game, el.dataset.id).message); draw(); },
    natdecline: (el) => { ctx.toast(declineNational(ctx.game, el.dataset.id).message); draw(); },
    nataccept: async (el) => {
      const g = ctx.game;
      const t = g.national.teams[el.dataset.id];
      const leaving = g.manager.national ? ` You will leave ${g.manager.national.name}.` : '';
      if (!(await ctx.confirm(`Become head coach of ${t.name}, alongside your club job?${leaving}`, { ok: 'Take the job', cancel: 'Not yet' }))) return;
      const r = acceptNational(g, t.id);
      ctx.toast(r.message);
      if (r.ok) await ctx.save({ silent: true });
      draw();
    },
    decline: (el) => { ctx.toast(declineOffer(ctx.game, el.dataset.id).message); draw(); },
    apply: (el) => { ctx.toast(applyForJob(ctx.game, el.dataset.id).message); draw(); },
    askmoney: async () => {
      const g = ctx.game;
      const can = canAskBoard(g);
      if (!can.ok) { ctx.toast(can.message); return; }
      const purpose = await ctx.choose('What do you want extra money for? You can ask the board once a season.', [
        { key: 'transfers', label: 'Transfers: more money to buy players' },
        { key: 'stadium', label: 'The stadium: new stands, more seats, a better pitch' }]);
      if (!purpose) return;
      const size = await ctx.choose('How much? The more you ask for, the less likely the board says yes, and the more it may ask of you in return.',
        MONEY_ASKS.map((a) => ({ key: a.key, label: `${a.label}: ${fmtMoney(askAmount(g, a.key))}` })));
      if (!size) return;
      const r = askBoard(g, purpose, size);
      if (!r.ok) { ctx.toast(r.message); return; }
      if (r.offer.verdict === 'no') await ctx.confirm(r.message, { ok: 'OK', cancel: null });
      else if (await ctx.confirm(r.message, r.offer.verdict === 'promise' ? { ok: 'I promise', cancel: 'No, thanks' } : { ok: 'Take the money', cancel: 'No, thanks' })) {
        ctx.toast(acceptBoardOffer(g).message);
      } else declineBoardOffer(g);
      await ctx.save({ silent: true });
      draw();
    },
    resign: async () => {
      const g = ctx.game;
      if (!(await ctx.confirm(`Resign as manager of ${g.clubs[g.userClubId].name}? Your reputation suffers a little, and you will have to choose a new club from the offers you get.`,
        { ok: 'Resign', cancel: 'Stay' }))) return;
      const r = resign(g);
      ctx.toast(r.message);
      if (r.ok) await ctx.save({ silent: true });
      draw();
    },
  });
  draw();
}
