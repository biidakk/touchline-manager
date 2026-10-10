// Club finances: season to date, projections and past seasons.

import { wageBill, tvSponsorsPerYear, costsPerYear, ticketPrice } from '../../core/finance.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { fmtMoney, bindActions } from '../util.js';

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const L = club.finance.season;
  const income = L.tickets + L.tvSponsors + L.prizes + L.transfersOut;
  const spend = L.wages + L.costs + L.transfersIn + (L.scouting || 0) + (L.construction || 0);
  const homeGames = Object.values(g.fixtures).filter((f) => f.homeId === club.id && f.result);
  const avgCrowd = homeGames.length ? Math.round(homeGames.reduce((a, f) => a + (f.result.attendance || 0), 0) / homeGames.length) : 0;
  const line = (label, v, cls = '') => `<span>${label}</span><b class="${cls}">${v >= 0 ? '' : '−'}${fmtMoney(Math.abs(v))}</b>`;
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;

  root.innerHTML = `${clubTopbar(ctx, { title: 'Finances' })}
  <div class="panel" style="left:20px;top:92px;width:400px;height:600px">
    <h2>Season ${y(g.season.year)} to date</h2>
    <div class="fin-list" style="font-size:15px;row-gap:7px">
      ${line('Ticket income', L.tickets, 'good')}
      ${line('TV & sponsors', L.tvSponsors, 'good')}
      ${line('Prize money', L.prizes, 'good')}
      ${line('Players sold', L.transfersOut, 'good')}
      ${line('Player wages', -L.wages, 'bad')}
      ${line('Season costs', -L.costs, 'bad')}
      ${line('Scouting', -(L.scouting || 0), 'bad')}
      ${line('Stadium construction', -(L.construction || 0), 'bad')}
      ${line('Players bought', -L.transfersIn, 'bad')}
      <span style="border-top:1px solid var(--row-line);padding-top:6px"><b>Balance</b></span>
      <b style="border-top:1px solid var(--row-line);padding-top:6px" class="${income - spend >= 0 ? 'good' : 'bad'}">${income - spend >= 0 ? '' : '−'}${fmtMoney(Math.abs(income - spend))}</b>
    </div>
    <div class="fin-list" style="font-size:15px;margin-top:22px">
      <span>Money</span><b class="${club.budget < 0 ? 'bad' : ''}">${fmtMoney(club.budget)}</b>
    </div>
  </div>
  <div class="panel" style="left:436px;top:92px;width:400px;height:300px">
    <h2>Per season (estimate)</h2>
    <div class="fin-list" style="font-size:14.5px;row-gap:7px">
      <span>Wage bill (incl. academy)</span><b>${fmtMoney(wageBill(g, club))}</b>
      <span>TV & sponsors</span><b>${fmtMoney(tvSponsorsPerYear(g, club))}</b>
      <span>Season costs</span><b>${fmtMoney(costsPerYear(g, club))}</b>
      <span>Ticket price</span><b>${ticketPrice(g, club)} €</b>
      <span>Stadium capacity</span><b>${club.stadium.capacity.toLocaleString('en-US')}</b>
      <span>Average home crowd</span><b>${avgCrowd ? avgCrowd.toLocaleString('en-US') : '-'}</b>
    </div>
    <p class="hint">TV money, wages and costs are paid monthly. League prize money is paid at the end of the season.</p>
    <button class="btn btn-small btn-blue" data-action="stadium">Stadium &amp; expansion</button>
  </div>
  <div class="panel" style="left:852px;top:92px;width:408px;height:540px;display:flex;flex-direction:column">
    <h2>Past seasons</h2>
    <div class="scroll" style="flex:1"><table class="data">
      <thead><tr><th>Season</th><th class="num">Income</th><th class="num">Spending</th><th class="num">Result</th></tr></thead>
      <tbody>${club.finance.history.slice().reverse().map((h) => {
        const inc = h.tickets + h.tvSponsors + h.prizes + h.transfersOut;
        const out = h.wages + h.costs + h.transfersIn + (h.scouting || 0) + (h.construction || 0);
        return `<tr><td>${y(h.year)}</td><td class="num">${fmtMoney(inc)}</td><td class="num">${fmtMoney(out)}</td>
          <td class="num ${inc - out >= 0 ? 'good' : 'bad'}">${inc - out >= 0 ? '+' : '−'}${fmtMoney(Math.abs(inc - out))}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">No completed seasons yet.</td></tr>'}</tbody>
    </table></div>
  </div>
  <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

  bindTopbar(root, ctx);
  bindActions(root, { back: () => ctx.back(), stadium: () => ctx.go('stadium') });
}
