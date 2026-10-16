// Club finances: season to date, projections, deals and past seasons.

import { wageBill, tvSponsorsPerYear, costsPerYear, ticketPrice, TICKET_PLANS } from '../../core/finance.js';
import { staffWages } from '../../core/training.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { CURRENCIES, nationCurrency } from '../../core/currency.js';
import { esc, fmtMoney, bindActions } from '../util.js';

const incomeOf = (L) => L.tickets + L.tvSponsors + L.prizes + L.transfersOut + (L.board || 0);
const spendOf = (L) => L.wages + L.costs + L.transfersIn + (L.scouting || 0) + (L.construction || 0) + (L.staff || 0) + (L.tour || 0);

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const L = club.finance.season;
  const income = incomeOf(L);
  const spend = spendOf(L);
  const homeGames = Object.values(g.fixtures).filter((f) => f.homeId === club.id && f.result);
  const avgCrowd = homeGames.length ? Math.round(homeGames.reduce((a, f) => a + (f.result.attendance || 0), 0) / homeGames.length) : 0;
  const line = (label, v, cls = '') => `<span>${label}</span><b class="${cls}">${v >= 0 ? '' : '−'}${fmtMoney(Math.abs(v))}</b>`;
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;
  const sp = club.deals?.sponsor;
  const plan = TICKET_PLANS[club.deals?.ticket] || TICKET_PLANS.normal;

  root.innerHTML = `${clubTopbar(ctx, { title: 'Finances' })}
  <div class="panel" style="left:20px;top:92px;width:400px;height:600px">
    <h2>Season ${y(g.season.year)} to date</h2>
    <div class="fin-list" style="font-size:15px;row-gap:6px">
      ${line('Ticket income', L.tickets, 'good')}
      ${line('TV & sponsors', L.tvSponsors, 'good')}
      ${line('Prize money', L.prizes, 'good')}
      ${line('Players sold', L.transfersOut, 'good')}
      ${L.board ? line('From the board', L.board, 'good') : ''}
      ${line('Player wages', -L.wages, 'bad')}
      ${line('Staff wages', -(L.staff || 0), 'bad')}
      ${line('Season costs', -L.costs, 'bad')}
      ${line('Scouting', -(L.scouting || 0), 'bad')}
      ${line('Stadium & pitch', -(L.construction || 0), 'bad')}
      ${L.tour ? line('Pre-season tour', -L.tour, L.tour > 0 ? 'bad' : 'good') : ''}
      ${line('Players bought', -L.transfersIn, 'bad')}
      <span style="border-top:1px solid var(--row-line);padding-top:6px"><b>Balance</b></span>
      <b style="border-top:1px solid var(--row-line);padding-top:6px" class="${income - spend >= 0 ? 'good' : 'bad'}">${income - spend >= 0 ? '' : '−'}${fmtMoney(Math.abs(income - spend))}</b>
    </div>
    <div class="fin-list" style="font-size:15px;margin-top:18px">
      <span>Money</span><b class="${club.budget < 0 ? 'bad' : ''}">${fmtMoney(club.budget)}</b>
      ${club.stadium.fund ? `<span>Stadium fund</span><b>${fmtMoney(club.stadium.fund)}</b>` : ''}
    </div>
  </div>
  <div class="panel" style="left:436px;top:92px;width:400px;height:540px;display:flex;flex-direction:column">
    <h2>Per season (estimate)</h2>
    <div class="fin-list" style="font-size:14.5px;row-gap:6px">
      <span>Wage bill (incl. academy)</span><b>${fmtMoney(wageBill(g, club))}</b>
      <span>Staff wages</span><b>${fmtMoney(staffWages(club))}</b>
      <span>TV & sponsors</span><b>${fmtMoney(tvSponsorsPerYear(g, club))}</b>
      <span>Season costs</span><b>${fmtMoney(costsPerYear(g, club))}</b>
      <span>Stadium capacity</span><b>${club.stadium.capacity.toLocaleString('en-US')}</b>
      <span>Average home crowd</span><b>${avgCrowd ? avgCrowd.toLocaleString('en-US') : '-'}</b>
    </div>
    <h2 style="margin-top:14px">Deals</h2>
    <div class="fin-list" style="font-size:14.5px;row-gap:6px">
      <span>Ticket prices</span><b>${plan.label} · ${fmtMoney(ticketPrice(g, club))}</b>
      <span>Shirt sponsor</span><b>${sp ? esc(sp.name) : '<span class="dim">none</span>'}</b>
      ${sp ? `<span>Sponsor pays</span><b>${fmtMoney(sp.perYear)} / season</b><span>Contract</span><b>until ${y(sp.until)}</b>` : ''}
    </div>
    <p class="hint" style="margin-top:auto">Ticket prices are set each summer, a new sponsor is signed when the contract ends. TV money, wages and costs are paid monthly; league prize money at the end of the season; European prize money after every match and round.</p>
    <div class="row" style="gap:10px;margin:8px 0">
      <span class="muted">Show money in</span>
      <div class="seg small">${[['club', `Club's (${CURRENCIES[nationCurrency(club.nationId)].symbol})`], ['EUR', '€'], ['GBP', '£']].map(([k, l]) =>
        `<button class="${(g.settings.currency || 'club') === k ? 'on' : ''}" data-action="currency" data-v="${k}">${esc(l)}</button>`).join('')}</div>
    </div>
    <button class="btn btn-small btn-blue" data-action="stadium">Stadium &amp; pitch</button>
  </div>
  <div class="panel" style="left:852px;top:92px;width:408px;height:540px;display:flex;flex-direction:column">
    <h2>Past seasons</h2>
    <div class="scroll" style="flex:1"><table class="data">
      <thead><tr><th>Season</th><th class="num">Income</th><th class="num">Spending</th><th class="num">Result</th></tr></thead>
      <tbody>${club.finance.history.slice().reverse().map((h) => {
        const inc = incomeOf(h);
        const out = spendOf(h);
        return `<tr><td>${y(h.year)}</td><td class="num">${fmtMoney(inc)}</td><td class="num">${fmtMoney(out)}</td>
          <td class="num ${inc - out >= 0 ? 'good' : 'bad'}">${inc - out >= 0 ? '+' : '−'}${fmtMoney(Math.abs(inc - out))}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">No completed seasons yet.</td></tr>'}</tbody>
    </table></div>
  </div>
  <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

  bindTopbar(root, ctx);
  bindActions(root, {
    back: () => ctx.back(),
    stadium: () => ctx.go('stadium'),
    // Money is kept in euros; this only changes how it is shown (and typed).
    currency: (el) => { g.settings.currency = el.dataset.v; ctx.save({ silent: true }); ctx.render(); },
  });
}
