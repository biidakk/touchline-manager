// Season preparations: ticket prices for the season and, when the old
// contract has run out, a new shirt sponsor. Shown before the first match of
// a season (and after taking over a club).

import { decisionsDue, sponsorOffers, chooseTickets, signSponsor, dealsOf } from '../../core/commercial.js';
import { TICKET_PLANS, ticketPrice, demand } from '../../core/finance.js';
import { naturalCrowd } from '../../core/stadium.js';
import { jersey } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, fmtMoneyShort, bindActions } from '../util.js';

const PLAN_TEXT = {
  low: 'More fans come, a fuller stadium lifts the team a little. Less money per ticket.',
  normal: 'The usual prices for a club of your size.',
  high: 'More money per ticket, but fewer fans come unless you sell out anyway.',
};

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const due = decisionsDue(g);
  const st = { ticket: due.ticket ? null : dealsOf(club).ticket, sponsor: null };
  const offers = due.sponsor ? sponsorOffers(g) : [];
  const y = (yr) => `${yr}/${String(yr + 1).slice(2)}`;

  function draw() {
    // The season's league home games at each price: demand without the
    // current price plan, then with this one, capped by the seats.
    const cur = TICKET_PLANS[dealsOf(club).ticket] || TICKET_PLANS.normal;
    const home = Object.values(g.fixtures).filter((f) => f.homeId === club.id && f.compId === club.compId);
    const base = home.length ? home.map((f) => demand(g, f) / cur.demand) : [naturalCrowd(club) * 0.8];
    const tickets = Object.entries(TICKET_PLANS).map(([k, plan]) => {
      const crowds = base.map((d) => Math.min(club.stadium.capacity, Math.round(d * plan.demand)));
      const c = Math.round(crowds.reduce((a, x) => a + x, 0) / crowds.length);
      const sold = crowds.filter((x) => x >= club.stadium.capacity).length;
      const price = ticketPrice(g, club, plan);
      return `<button class="deal-card ${st.ticket === k ? 'on' : ''}" data-action="ticket" data-k="${k}">
        <div class="deal-t">${plan.label} prices</div>
        <div class="deal-big">${price} €</div>
        <div class="deal-l">About <b>${c.toLocaleString('en-US')}</b> fans a game${sold ? ` (${sold} sell-outs)` : ''}</div>
        <div class="deal-l">League tickets: <b>~${fmtMoneyShort(c * price * (home.length || 19))}</b> a season</div>
        <div class="deal-s">${PLAN_TEXT[k]}</div></button>`;
    }).join('');
    const sp = club.deals?.sponsor;
    const sponsors = due.sponsor ? offers.map((o, i) => `<button class="deal-card ${st.sponsor === i ? 'on' : ''}" data-action="sponsor" data-i="${i}">
        <div class="deal-t">${esc(o.name)}</div>
        <div class="deal-big">${fmtMoney(o.perYear)}</div>
        <div class="deal-l">a season for <b>${o.years} ${o.years > 1 ? 'seasons' : 'season'}</b> (to ${y(g.season.year + o.years - 1)})</div>
        <div class="deal-l">${o.bonus ? `Signing bonus: <b>${fmtMoney(o.bonus)}</b>` : 'No signing bonus'}</div>
        <div class="deal-s">${o.years === 1 ? 'Most per season; a new deal next summer.' : o.years === 3 ? 'The middle way.' : 'Least per season, but the money is safe for five seasons.'}</div></button>`).join('')
      : `<div class="deal-current">${jersey({ colors: club.colors, size: 70 })}<div><div class="deal-t">${esc(sp.name)}</div>
        <div class="deal-l">${fmtMoney(sp.perYear)} a season until ${y(sp.until)}</div></div></div>`;
    const ready = st.ticket && (!due.sponsor || st.sponsor !== null);

    root.innerHTML = `${clubTopbar(ctx, { title: 'Season preparations' })}
    <div class="panel" style="left:20px;top:92px;width:1240px;height:262px">
      <h2>Ticket prices ${y(g.season.year)}</h2>
      <div class="deal-row">${tickets}</div>
    </div>
    <div class="panel" style="left:20px;top:368px;width:1240px;height:262px">
      <h2>${due.sponsor ? 'Main shirt sponsor: choose an offer' : 'Main shirt sponsor'}</h2>
      <div class="deal-row">${sponsors}</div>
    </div>
    <button class="btn" style="position:absolute;left:1010px;top:644px;width:250px;height:50px" data-action="done" ${ready ? '' : 'disabled'}>${ready ? 'Confirm' : 'Choose first'}</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    ticket: (el) => { st.ticket = el.dataset.k; draw(); },
    sponsor: (el) => { st.sponsor = Number(el.dataset.i); draw(); },
    done: async () => {
      chooseTickets(g, st.ticket);
      if (due.sponsor) ctx.toast(signSponsor(g, st.sponsor).message);
      await ctx.save({ silent: true });
      if (params.then) ctx.home(params.then); else ctx.back();
    },
  });
  draw();
}
