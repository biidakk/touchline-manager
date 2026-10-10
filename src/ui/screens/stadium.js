// Stadium: capacity, crowds, demand and expansion.

import { EXPANSIONS, MAX_CAPACITY, expansionQuote, startExpansion, naturalCrowd } from '../../core/stadium.js';
import { demand, ticketPrice, costsPerYear } from '../../core/finance.js';
import { fmtDate } from '../../core/calendar.js';
import { stadiumArt } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, bindActions } from '../util.js';

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];

  function stats() {
    const home = Object.values(g.fixtures).filter((f) => f.homeId === club.id);
    const played = home.filter((f) => f.result);
    const avgCrowd = played.length ? played.reduce((a, f) => a + (f.result.attendance || 0), 0) / played.length : 0;
    const soldOut = played.filter((f) => (f.result.attendance || 0) >= club.stadium.capacity).length;
    // Average demand over this season's home games (played and still to come).
    const avgDemand = home.length ? home.reduce((a, f) => a + demand(g, f), 0) / home.length : naturalCrowd(club) * 0.9;
    return { avgCrowd, soldOut, played: played.length, homeGames: home.length || 19, avgDemand };
  }

  function draw() {
    const s = stats();
    const price = ticketPrice(g, club);
    const e = club.stadium.expansion;
    const options = EXPANSIONS.map((seats) => {
      const q = expansionQuote(club, seats);
      // Extra crowd per game: only the part of demand the current stands can't hold.
      const extraPerGame = Math.max(0, Math.min(q.seats, s.avgDemand - club.stadium.capacity));
      const extraIncome = extraPerGame * price * 19;
      const payback = extraIncome > 0 ? q.cost / extraIncome : Infinity;
      return `<tr><td><b>+${q.seats.toLocaleString('en-US')}</b> seats</td><td class="num">${fmtMoney(q.cost)}</td>
        <td class="num">${Math.round(q.days / 30)} months</td>
        <td class="num">${extraIncome > 0 ? `+${fmtMoney(extraIncome)} / season` : '<span class="dim">none at current demand</span>'}</td>
        <td class="num">${Number.isFinite(payback) ? `${payback.toFixed(1)} seasons` : '-'}</td>
        <td class="num"><button class="btn btn-small" data-action="build" data-seats="${seats}" ${e || !q.seats || q.cost > club.budget ? 'disabled' : ''}>Build</button></td></tr>`;
    }).join('');
    const progress = e ? Math.min(100, Math.round((100 * (g.day - e.start)) / (e.end - e.start))) : 0;

    root.innerHTML = `${clubTopbar(ctx, { title: 'Stadium' })}
    <div class="panel stadium-card" style="left:20px;top:92px;width:420px;height:540px">
      ${stadiumArt(club, 420, 250)}
      <div class="info" style="padding:14px 18px">
        <div style="font-size:22px;font-weight:900">${esc(club.stadium.name)}</div>
        <div class="fin-list" style="margin-top:10px;font-size:15px">
          <span>Capacity</span><b>${club.stadium.capacity.toLocaleString('en-US')}</b>
          <span>Ticket price</span><b>${price} €</b>
          <span>Average crowd</span><b>${s.avgCrowd ? Math.round(s.avgCrowd).toLocaleString('en-US') : '-'}</b>
          <span>Sold out</span><b>${s.soldOut} of ${s.played} home games</b>
          <span>Upkeep and costs / season</span><b>${fmtMoney(costsPerYear(g, club))}</b>
        </div>
      </div>
    </div>
    <div class="panel" style="left:456px;top:92px;width:804px;height:540px">
      <h2>Demand</h2>
      <p style="margin:0 0 6px">Fans who want to come to an average home game this season: <b>${Math.round(s.avgDemand).toLocaleString('en-US')}</b>
        <span class="muted">(capacity ${club.stadium.capacity.toLocaleString('en-US')})</span>.</p>
      <p class="hint" style="margin-top:0">Demand grows with reputation and results; big opponents and cup nights draw more. New seats only earn money while the stadium would otherwise sell out.</p>
      <h2 style="margin-top:18px">Expansion</h2>
      ${e ? `<div class="notice-inline">Under construction: <b>+${e.seats.toLocaleString('en-US')} seats</b>, ready on ${fmtDate(e.end)}.
        <div class="bar" style="margin-top:8px"><i style="width:${progress}%"></i><b>${progress}%</b></div></div>` : ''}
      <table class="data" style="margin-top:10px">
        <thead><tr><th>Expansion</th><th class="num">Cost</th><th class="num">Takes</th><th class="num">Extra ticket income</th><th class="num">Pays back in</th><th></th></tr></thead>
        <tbody>${options}</tbody>
      </table>
      <p class="hint">Cost is paid when building starts. The stadium stays open during construction. Maximum capacity ${MAX_CAPACITY.toLocaleString('en-US')}. Your money: <b>${fmtMoney(club.budget)}</b>.</p>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    build: async (el) => {
      const seats = Number(el.dataset.seats);
      const q = expansionQuote(club, seats);
      if (!(await ctx.confirm(`Build ${q.seats.toLocaleString('en-US')} new seats for ${q.cost.toLocaleString('en-US')} €? Ready in about ${Math.round(q.days / 30)} months.`, { ok: 'Build' }))) return;
      const r = startExpansion(g, club, seats);
      ctx.toast(r.message);
      await ctx.save({ silent: true });
      draw();
    },
    back: () => ctx.back(),
  });
  draw();
}
