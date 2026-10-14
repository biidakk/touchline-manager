// Transfer market: search with filters, shortlist, selling (listed players and
// offers received) and transfer history.

import { searchPlayers, askingPrice, wageDemand, evaluateBid, buyPlayer, openWindow, nextWindow, acceptOffer, rejectOffer,
  unlistPlayer, willJoin, evaluateSwap, buySwap, swapWorth } from '../../core/transfers.js';
import { fmtDate } from '../../core/calendar.js';
import { ageOf } from '../../core/valuation.js';
import { crest, flag } from '../components/svg.js';
import { formArrow } from '../components/pitch.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, fmtMoneyShort, bindActions, fullName } from '../util.js';
import { toShown, toEuros, currencySymbol } from '../../core/currency.js';
import { negotiateContract } from '../contracts.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';
import { potText, potEstimate, scoutingOf, assignScout, cancelScout, setLevel, LEVELS, scoutingCost, attrText } from '../../core/scouting.js';
import { scoutStatus } from '../components/playercard.js';
import { loanFee, borrowPlayer, loanedOutBy, unlistForLoan } from '../../core/loans.js';

const PAGE = 60;

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const user = g.clubs[g.userClubId];
  g.shortlist = g.shortlist || [];
  const st = ctx.marketState || (ctx.marketState = {
    tab: params.tab || 'search', sel: null, sortKey: 'skill', sortDir: -1, page: 0,
    f: { pos: '', minAge: '', maxAge: '', minSkill: '', minPot: '', maxPrice: '', country: '', listed: false, name: '' },
  });
  if (params.tab) st.tab = params.tab;
  if (params.select) {
    // Opened from a player dialog: show him in the search with his details.
    const p = g.players[params.select];
    st.sel = params.select;
    st.f = { ...st.f, name: p ? p.last : '', pos: '', listed: false };
  }
  const year = g.season.year;
  const C = (id) => g.clubs[id];

  function windowInfo() {
    const w = openWindow(g);
    if (w) return `<span class="good">Transfer window open until ${fmtDate(w.close, false)}</span>`;
    const n = nextWindow(g);
    return `<span class="bad">Transfer window closed</span>${n ? ` <span class="muted">· opens ${fmtDate(n.open, false)}</span>` : ''}`;
  }

  const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

  function results() {
    const f = st.f;
    let list = searchPlayers(g, { pos: f.pos || undefined, minAge: num(f.minAge), maxAge: num(f.maxAge), minSkill: num(f.minSkill),
      maxPrice: num(f.maxPrice) ? toEuros(g, num(f.maxPrice) * 1e6) : undefined, country: f.country || undefined,
      listed: f.listed, name: f.name || undefined });
    // Potential filter works on what your scouts know (unscouted players are left out).
    if (num(f.minPot)) list = list.filter((x) => (potEstimate(g, x.p) ?? -1) >= num(f.minPot));
    const key = {
      skill: (x) => x.p.skill, pot: (x) => potEstimate(g, x.p) ?? -1, age: (x) => ageOf(x.p, year), price: (x) => x.price,
      height: (x) => x.p.height || 0,
      name: (x) => x.p.last, club: (x) => C(x.p.clubId).name, pos: (x) => 'GDMF'.indexOf(x.p.pos),
    }[st.sortKey];
    return list.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.sortDir;
    });
  }

  function playerRows(list) {
    return list.map(({ p, price }) => `<tr class="click ${st.sel === p.id ? 'sel' : ''}" data-action="pick" data-id="${p.id}">
      <td class="m-name"><b>${esc(fullName(p))}</b></td><td class="c">${p.pos}</td>
      <td class="num">${ageOf(p, year)}</td><td class="num">${p.height}</td><td>${flag(g.nations[p.nationId].flag, 18)}</td>
      <td>${clubLink(g, p.clubId, { crest: 18, short: true })}</td>
      <td class="num">${p.skill}</td><td class="num">${potText(g, p)}</td><td class="c">${formArrow(p.form)}</td>
      <td class="num">${p.listed ? '<span class="tag-listed" title="On the transfer list: his club wants to sell">LISTED</span> ' : ''}${willJoin(g, p, user).ok ? fmtMoneyShort(price) : `<span class="muted" title="He won't drop down to a club of your stature">won't</span>`}</td></tr>`).join('');
  }

  const head = (k, label, cls = '') => `<th class="${cls}" data-action="sort" data-k="${k}">${label}${st.sortKey === k ? (st.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`;

  function searchTab() {
    const f = st.f;
    const all = results();
    const pages = Math.max(1, Math.ceil(all.length / PAGE));
    st.page = Math.min(st.page, pages - 1);
    const list = all.slice(st.page * PAGE, st.page * PAGE + PAGE);
    const nations = Object.values(g.nations).filter((n) => n.leagueIds.length);
    return `<div class="filters">
        <div class="seg">${['', 'G', 'D', 'M', 'F'].map((p) => `<button class="${f.pos === p ? 'on' : ''}" data-action="fpos" data-v="${p}">${p || 'All'}</button>`).join('')}</div>
        <label>Age <input class="field small" data-f="minAge" value="${f.minAge}" placeholder="min"> - <input class="field small" data-f="maxAge" value="${f.maxAge}" placeholder="max"></label>
        <label>Skill ≥ <input class="field small" data-f="minSkill" value="${f.minSkill}"></label>
        <label title="Uses scout reports: unscouted players are left out">Pot ≥ <input class="field small" data-f="minPot" value="${f.minPot}" placeholder="scout"></label>
        <label>Price ≤ <input class="field small" data-f="maxPrice" value="${f.maxPrice}" placeholder="M ${esc(currencySymbol(g))}"></label>
        <select class="field" data-f="country" style="height:30px"><option value="">All countries</option>${nations.map((n) => `<option value="${n.id}" ${f.country === n.id ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select>
        <label><input type="checkbox" data-f="listed" ${f.listed ? 'checked' : ''}> Listed only</label>
        <input class="field" data-f="name" value="${esc(f.name)}" placeholder="Name" style="width:110px;height:30px">
      </div>
      <div class="scroll" style="flex:1"><table class="data sortable">
        <thead><tr>${head('name', 'Player')}${head('pos', 'Pos', 'c')}${head('age', 'Age', 'num')}${head('height', 'Ht', 'num')}<th>Nat</th>${head('club', 'Club')}${head('skill', 'Skill', 'num')}${head('pot', 'Pot', 'num')}<th class="c">Form</th>${head('price', 'Price', 'num')}</tr></thead>
        <tbody>${playerRows(list) || '<tr><td colspan="9" class="empty">No players match these filters.</td></tr>'}</tbody>
      </table></div>
      <div class="row" style="justify-content:space-between;margin-top:6px"><span class="muted">${all.length} players</span>
        <div class="row"><button class="btn btn-small btn-blue" data-action="page" data-d="-1" ${st.page ? '' : 'disabled'}>‹</button>
        <span>${st.page + 1} / ${pages}</span><button class="btn btn-small btn-blue" data-action="page" data-d="1" ${st.page < pages - 1 ? '' : 'disabled'}>›</button></div></div>`;
  }

  function shortlistTab() {
    const list = g.shortlist.map((id) => g.players[id]).filter((p) => p && p.clubId !== user.id).map((p) => ({ p, price: askingPrice(g, p) }));
    return `<div class="scroll" style="flex:1"><table class="data">
      <thead><tr><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th class="num">Ht</th><th>Nat</th><th>Club</th><th class="num">Skill</th><th class="num">Pot</th><th class="c">Form</th><th class="num">Price</th></tr></thead>
      <tbody>${playerRows(list) || '<tr><td colspan="9" class="empty">Your shortlist is empty. Add players from the search.</td></tr>'}</tbody></table></div>`;
  }

  function sellingTab() {
    const listed = user.squad.map((id) => g.players[id]).filter((p) => p.listed);
    const offers = (g.offers || []).filter((o) => g.players[o.playerId]);
    for (const o of offers) o.seen = true; // seen here: no pop-up needed
    return `<h2>Offers received</h2>
      <table class="data" style="margin-bottom:16px">${offers.map((o) => {
        const p = g.players[o.playerId];
        const kind = o.type === 'loan' ? `<span class="badge loan">LOAN</span> they pay ${Math.round(o.wageShare * 100)}% wage` : '<span class="badge list">BUY</span>';
        return `<tr><td><b>${clubLink(g, o.clubId, { crest: 20 })}</b></td><td>${kind}</td><td>for <b>${esc(fullName(p))}</b> (${p.pos}, ${p.skill})</td>
          <td class="num"><b>${fmtMoney(o.fee)}</b></td><td class="muted">value ${fmtMoneyShort(p.value)}</td><td class="muted">until ${fmtDate(o.expires, false)}</td>
          <td class="num"><button class="btn btn-small" data-action="accept" data-id="${o.id}">Accept</button>
          <button class="btn btn-small btn-blue" data-action="reject" data-id="${o.id}">Reject</button></td></tr>`;
      }).join('') || '<tr><td class="empty">No offers at the moment. List players to attract bids (only during a transfer window).</td></tr>'}</table>
      <h2>Your players on the transfer list</h2>
      <table class="data">${listed.map((p) => `<tr><td class="m-name"><b>${esc(fullName(p))}</b></td><td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td>
        <td class="num">${p.skill}/${potText(g, p)}</td><td class="num">asking <b>${fmtMoney(p.askingPrice)}</b></td><td class="muted">value ${fmtMoneyShort(p.value)}</td>
        <td class="num"><button class="btn btn-small btn-blue" data-action="unlist" data-id="${p.id}">Remove</button></td></tr>`).join('')
        || '<tr><td class="empty">Nobody listed. Use the player card in My Team to put a player on the transfer list.</td></tr>'}</table>
      <h2 style="margin-top:14px">Loans</h2>
      <table class="data">${[
        ...user.squad.map((id) => g.players[id]).filter((p) => p.loanListed).map((p) => `<tr><td class="m-name"><b>${esc(fullName(p))}</b></td><td>on the loan list</td><td></td>
          <td class="num"><button class="btn btn-small btn-blue" data-action="unlistloan" data-id="${p.id}">Remove</button></td></tr>`),
        ...loanedOutBy(g, user.id).map((p) => `<tr><td class="m-name"><b>${esc(fullName(p))}</b></td><td>loaned to ${clubLink(g, p.clubId, { crest: 18 })}</td>
          <td class="muted">${p.stats.season.apps} apps, skill ${p.skill} (${p.skill - p.seasonStart >= 0 ? '+' : ''}${p.skill - p.seasonStart})</td><td></td></tr>`),
        ...user.squad.map((id) => g.players[id]).filter((p) => p.loan).map((p) => `<tr><td class="m-name"><b>${esc(fullName(p))}</b></td><td>borrowed from ${clubLink(g, p.loan.parentId, { crest: 18 })}</td>
          <td class="muted">${p.stats.season.apps} apps · you pay ${Math.round(p.loan.wageShare * 100)}% of his wage</td><td></td></tr>`),
      ].join('') || '<tr><td class="empty">No loans. Loan players out from their card in My Team, or ask for a loan in the search.</td></tr>'}</table>`;
  }

  function historyTab() {
    const mine = g.transfers.filter((t) => t.fromId === user.id || t.toId === user.id);
    const row = (t) => `<tr><td class="muted">${fmtDate(t.day, false)}</td><td><b>${esc(t.playerName)}</b></td>
      <td>${clubLink(g, t.fromId, { crest: 18, short: true })}</td><td>›</td><td>${clubLink(g, t.toId, { crest: 18, short: true })}</td>
      <td class="num">${fmtMoney(t.fee)}</td></tr>`;
    return `<h2>Your club</h2><table class="data" style="margin-bottom:14px">${mine.map(row).join('') || '<tr><td class="empty">No transfers yet.</td></tr>'}</table>
      <h2>Latest transfers</h2><div class="scroll" style="flex:1"><table class="data">${g.transfers.slice(0, 80).map(row).join('')}</table></div>`;
  }

  function detail() {
    const p = st.sel ? g.players[st.sel] : null;
    if (!p || p.clubId === user.id) {
      return `<div class="panel" style="left:900px;top:92px;width:360px;height:540px"><h2>Player</h2>
        <p class="muted">Select a player to see his details and make an offer.</p>
        <div class="fin-list" style="margin-top:20px"><span>Money</span><b>${fmtMoney(user.budget)}</b>
        <span>Squad size</span><b>${user.squad.length}</b></div></div>`;
    }
    const club = C(p.clubId);
    const s = p.stats.season;
    const price = askingPrice(g, p);
    const wage = wageDemand(g, p, user);
    const short = g.shortlist.includes(p.id);
    return `<div class="panel deal-panel" style="left:900px;top:92px;width:360px;height:540px">
      <div class="row" style="justify-content:space-between"><span style="font-size:20px;font-weight:900">${esc(fullName(p))}</span>${flag(g.nations[p.nationId].flag, 26)}</div>
      <div class="row muted" style="margin:4px 0 12px">${clubLink(g, club.id, { crest: 22 })} · #${p.number}</div>
      <div class="fin-list">
        <span>Position · age</span><b>${{ G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }[p.pos]} · ${ageOf(p, year)}</b>
        <span>Skill / potential</span><b>${p.skill} / ${potText(g, p)} ${formArrow(p.form)}</b>
        <span>TEC · PHY · height</span><b>${attrText(g, p, 'tec')} · ${attrText(g, p, 'phy')} · ${p.height} cm</b>
        <span class="phone-hide">Scouting</span><b class="phone-hide">${scoutStatus(g, p)}</b>
        <span class="phone-hide">Season</span><b class="phone-hide">${s.apps} apps, ${s.goals} goals</b>
        <span>Contract until</span><b>${p.contractEnd}</b>
        <span class="phone-hide">Market value</span><b class="phone-hide">${fmtMoney(p.value)}</b>
        <span>Asking price</span><b>${fmtMoney(price)}</b>
        <span>Wage demand</span><b>${fmtMoney(wage)}</b>
        <span>Your money</span><b class="${user.budget < price ? 'bad' : ''}">${fmtMoney(user.budget)}</b>
      </div>
      <label class="lbl" style="margin-top:16px">Your offer (${esc(currencySymbol(g))})</label>
      <div class="row"><input class="field" id="bid" style="flex:1;min-width:0" value="${st.bid ?? Math.round(toShown(g, price))}">
        <select class="field" id="years">${[1, 2, 3, 4, 5].map((y) => `<option value="${y}" ${y === 3 ? 'selected' : ''}>${y} yr</option>`).join('')}</select></div>
      <div class="row" style="margin-top:6px"> <label class="lbl" style="margin:0 6px 0 0">Swap</label>
        <select class="field" id="swap" style="flex:1;min-width:0" title="Offer one of your players as part of the deal">
          <option value="">No player</option>
          ${user.squad.map((id) => g.players[id]).filter((x) => !x.loan).sort((a, b) => b.skill - a.skill)
            .map((x) => `<option value="${x.id}" ${st.swap === x.id ? 'selected' : ''}>${esc(x.last)} (${x.pos}, ${x.skill}) · worth ${fmtMoneyShort(swapWorth(g, x, C(p.clubId)))}</option>`).join('')}
        </select></div>
      ${st.msg ? `<div class="notice-inline">${esc(st.msg)}</div>` : ''}
      <div class="deal-btns">
        <button class="btn btn-small" data-action="offer" ${openWindow(g) ? '' : 'disabled'}>Make offer</button>
        <button class="btn btn-small btn-blue" data-action="scout">Scout</button>
        <button class="btn btn-small btn-blue ${short ? 'on' : ''}" data-action="short" title="${short ? 'Remove from shortlist' : 'Add to shortlist'}">${short ? 'Shortlisted ✓' : 'Shortlist +'}</button>
        <button class="btn btn-small btn-blue" data-action="askloan" ${openWindow(g) ? '' : 'disabled'} title="Ask for a loan: fee ${fmtMoney(loanFee(g, p))}">Loan · ${fmtMoneyShort(loanFee(g, p))}</button>
      </div>
    </div>`;
  }

  function scoutingTab() {
    const s = scoutingOf(g);
    const L = LEVELS[s.level];
    const reports = Object.entries(s.reports).map(([id, r]) => ({ p: g.players[id], r })).filter((x) => x.p)
      .sort((a, b) => b.r.high - a.r.high);
    return `<div class="row" style="gap:18px;align-items:flex-start">
      <div style="width:520px">
        <h2>Scouting staff</h2>
        <div class="seg">${LEVELS.map((l, i) => `<button class="${i === s.level ? 'on' : ''}" data-action="level" data-v="${i}">${l.name}</button>`).join('')}</div>
        <div class="fin-list" style="margin-top:10px">
          <span>Cost per season</span><b>${fmtMoney(scoutingCost(g, user, s.level))}</b>
          <span>Scouts (players at once)</span><b>${L.slots}</b>
          <span>Time per report</span><b>${L.days} days</b>
          <span>Precision</span><b>potential within a range of ${L.band}</b>
        </div>
        <p class="hint">Potential of players at other clubs shows "?" until scouted. Reports older than two seasons expire. Start a report with "Scout" on any player.</p>
      </div>
      <div style="flex:1">
        <h2>Scouts at work (${s.assignments.length}/${L.slots})</h2>
        <table class="data">${s.assignments.map((a) => {
          const p = g.players[a.playerId];
          if (!p) return '';
          return `<tr><td><b>${playerLink(g, p.id)}</b></td><td>${clubLink(g, p.clubId, { short: true })}</td><td class="muted">report ${fmtDate(a.end, false)}</td>
            <td class="num"><button class="btn btn-small btn-blue" data-action="unscout" data-id="${p.id}">Stop</button></td></tr>`;
        }).join('') || '<tr><td class="empty">No scouts out.</td></tr>'}</table>
      </div></div>
      <h2 style="margin-top:12px">Reports (${reports.length})</h2>
      <div class="scroll" style="flex:1"><table class="data">
        <thead><tr><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th>Club</th><th class="num">Skill</th><th class="num">Potential</th><th class="num">Price</th><th>Season</th></tr></thead>
        <tbody>${reports.map(({ p, r }) => `<tr class="click" data-action="pickreport" data-id="${p.id}"><td class="m-name"><b>${esc(fullName(p))}</b></td><td class="c">${p.pos}</td>
          <td class="num">${ageOf(p, year)}</td><td>${p.clubId ? clubLink(g, p.clubId, { short: true }) : '-'}</td><td class="num">${p.skill}</td>
          <td class="num"><b>${potText(g, p)}</b></td><td class="num">${p.clubId === user.id ? '-' : fmtMoneyShort(askingPrice(g, p))}</td>
          <td class="muted">${r.year}/${String(r.year + 1).slice(2)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No reports yet.</td></tr>'}</tbody>
      </table></div>`;
  }

  function draw() {
    const tabs = [['search', 'Search'], ['shortlist', `Shortlist (${g.shortlist.length})`], ['scouting', 'Scouting'],
      ['selling', `Selling (${(g.offers || []).length})`], ['history', 'History']];
    const body = { search: searchTab, shortlist: shortlistTab, scouting: scoutingTab, selling: sellingTab, history: historyTab }[st.tab]();
    root.innerHTML = `${clubTopbar(ctx, { title: 'Transfer market' })}
    <div class="panel" style="left:20px;top:92px;width:${st.tab === 'search' || st.tab === 'shortlist' ? 866 : 1240}px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><div class="seg">${tabs.map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="tab" data-v="${k}">${l}</button>`).join('')}</div>
        <div>${windowInfo()}</div></div>
      ${body}
    </div>
    ${st.tab === 'search' || st.tab === 'shortlist' ? detail() : ''}
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

    root.querySelectorAll('[data-f]').forEach((el) => {
      el.addEventListener('change', () => {
        st.f[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim();
        st.page = 0;
        draw();
      });
    });
    const bid = root.querySelector('#bid');
    if (bid) bid.addEventListener('input', () => { st.bid = bid.value; });
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    tab: (el) => { st.tab = el.dataset.v; st.msg = ''; draw(); },
    fpos: (el) => { st.f.pos = el.dataset.v; st.page = 0; draw(); },
    sort: (el) => {
      if (st.sortKey === el.dataset.k) st.sortDir *= -1;
      else { st.sortKey = el.dataset.k; st.sortDir = ['name', 'club', 'pos'].includes(el.dataset.k) ? 1 : -1; }
      draw();
    },
    page: (el) => { st.page += Number(el.dataset.d); draw(); },
    pick: (el) => { st.sel = el.dataset.id; st.bid = undefined; st.msg = ''; draw(); },
    short: () => {
      const i = g.shortlist.indexOf(st.sel);
      if (i >= 0) g.shortlist.splice(i, 1); else g.shortlist.push(st.sel);
      draw();
    },
    offer: async () => {
      // Typed in the shown currency; the game works in euros.
      const fee = Math.round(toEuros(g, Number(String(root.querySelector('#bid').value).replace(/[^0-9.]/g, ''))));
      const years = Number(root.querySelector('#years').value);
      if (!fee) { st.msg = 'Enter a fee.'; draw(); return; }
      const swapId = root.querySelector('#swap')?.value || '';
      st.swap = swapId;
      const r = swapId ? evaluateSwap(g, st.sel, fee, swapId) : evaluateBid(g, st.sel, fee);
      if (r.status === 'accepted') {
        const p = g.players[st.sel];
        // The fee is agreed; the player's contract is negotiated before anything is paid.
        const deal = await negotiateContract(ctx, p, user, years);
        if (!deal) { st.msg = `No contract with ${p.first} ${p.last}: the transfer is off.`; draw(); return; }
        if (swapId) buySwap(g, st.sel, fee, swapId, deal.years, deal.wage);
        else buyPlayer(g, st.sel, fee, deal.years, deal.wage);
        st.swap = '';
        g.shortlist = g.shortlist.filter((id) => id !== st.sel);
        st.sel = null;
        st.msg = '';
        await ctx.save({ silent: true });
        ctx.toast(`${p.first} ${p.last} signed!`);
      } else if (r.status === 'counter') {
        st.msg = `${r.message} (counter-offer)`;
        st.bid = Math.round(toShown(g, r.counter));
      } else {
        st.msg = r.message;
      }
      draw();
    },
    unlistloan: (el) => { unlistForLoan(g, el.dataset.id); draw(); },
    askloan: async () => {
      const p = g.players[st.sel];
      const k = await ctx.choose(`Ask ${C(p.clubId).name} to loan you ${p.first} ${p.last} until the end of the season? Loan fee ${fmtMoney(loanFee(g, p))}. How much of his wage (${fmtMoney(p.wage)} a year) will you pay?`,
        [{ key: '1', label: '100% of his wage' }, { key: '0.75', label: '75%' }, { key: '0.5', label: '50%' }]);
      if (!k) return;
      const option = await ctx.confirm(`Add an option to buy ${p.first} ${p.last} for ${fmtMoney(askingPrice(g, p))} at any time during the loan? The loan fee goes up by 25%.`,
        { ok: 'With option', cancel: 'Loan only' });
      const r = borrowPlayer(g, st.sel, Number(k), { option });
      st.msg = r.message;
      if (r.status === 'accepted') { st.sel = null; await ctx.save({ silent: true }); ctx.toast(r.message); }
      draw();
    },
    accept: async (el) => {
      const o = g.offers.find((x) => x.id === el.dataset.id);
      const p = g.players[o.playerId];
      const q = o.type === 'loan'
        ? `Loan ${p.first} ${p.last} to ${C(o.clubId).name} until the end of the season for ${fmtMoney(o.fee)}? They pay ${Math.round(o.wageShare * 100)}% of his wage.`
        : `Sell ${p.first} ${p.last} to ${C(o.clubId).name} for ${fmtMoney(o.fee)}?`;
      if (!(await ctx.confirm(q, { ok: o.type === 'loan' ? 'Loan him' : 'Sell' }))) return;
      if (!acceptOffer(g, o.id)) ctx.toast('The deal could not be completed.');
      else { await ctx.save({ silent: true }); ctx.toast(`${p.first} ${p.last} ${o.type === 'loan' ? 'loaned out' : 'sold'}`); }
      draw();
    },
    reject: (el) => { rejectOffer(g, el.dataset.id); draw(); },
    scout: () => { ctx.toast(assignScout(g, st.sel).message); draw(); },
    unscout: (el) => { cancelScout(g, el.dataset.id); draw(); },
    level: (el) => { setLevel(g, Number(el.dataset.v)); draw(); },
    pickreport: (el) => { st.sel = el.dataset.id; st.tab = 'search'; st.f = { ...st.f, name: g.players[el.dataset.id].last, pos: '', listed: false }; draw(); },
    unlist: (el) => { unlistPlayer(g, el.dataset.id); draw(); },
    back: () => { ctx.marketState = null; ctx.back(); },
  });
  draw();
}
