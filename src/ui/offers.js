// Pop-ups for bids and loan offers that have just arrived for the user's
// players: accept, reject (a keen club may come back with more) or decide
// later on the Transfer Market's Selling tab.

import { newOffers, acceptOffer, rejectOffer, SELL_ON } from '../core/transfers.js';
import { ageOf } from '../core/valuation.js';
import { fmtDate } from '../core/calendar.js';
import { crest } from './components/svg.js';
import { esc, fmtMoney, fmtMoneyShort, fullName } from './util.js';

function offerHtml(g, o) {
  const p = g.players[o.playerId];
  const club = g.clubs[o.clubId];
  const comp = g.competitions[club.compId];
  const loan = o.type === 'loan';
  const what = loan
    ? `want <b>${esc(fullName(p))}</b> on loan until the end of the season`
    : o.raises ? `come back with a better bid for <b>${esc(fullName(p))}</b>` : `make a bid for <b>${esc(fullName(p))}</b>`;
  return `<div class="row" style="gap:14px;align-items:center;margin-bottom:10px">${crest(club.crest, 54)}
      <div><div class="big">${esc(club.name)}</div><div class="muted">${esc(comp?.name || '')}</div></div></div>
    <p>${esc(club.name)} ${what} (${p.pos}, ${ageOf(p, g.season.year)} years, skill ${p.skill}).</p>
    <div class="fin-list" style="grid-template-columns:auto 1fr">
      <span>${loan ? 'Loan fee' : 'Fee'}</span><b>${fmtMoney(o.fee)}${o.previous ? ` <span class="muted">(was ${fmtMoneyShort(o.previous)})</span>` : ''}</b>
      ${loan ? `<span>His wage</span><b>they pay ${Math.round(o.wageShare * 100)}%</b>` : ''}
      <span>Market value</span><b>${fmtMoneyShort(p.value)}</b>
      ${p.listed ? `<span>Your asking price</span><b>${fmtMoneyShort(p.askingPrice)}</b>` : ''}
      <span>Valid until</span><b>${fmtDate(o.expires, false)}</b>
    </div>`;
}

// A window that has just shut is announced first (its offers are gone),
// then any offers not seen yet.
export async function marketPopups(ctx) {
  const g = ctx.game;
  const news = g.windowNews;
  if (news) {
    delete g.windowNews;
    await ctx.confirm(news.name === 'summer'
      ? 'The summer transfer window has closed. No more offers until it opens again on 27 December.'
      : 'The winter transfer window has closed. No more offers until the summer.', { ok: 'OK', cancel: null });
  }
  return reviewOffers(ctx);
}

// Shows every offer not seen yet, one after another. Returns true if a player left.
export async function reviewOffers(ctx) {
  const g = ctx.game;
  let changed = false;
  for (const o of newOffers(g)) {
    o.seen = true;
    if (!g.offers.includes(o)) continue; // gone after an earlier answer (the player was sold)
    const p = g.players[o.playerId];
    const loan = o.type === 'loan';
    const k = await ctx.dialog(offerHtml(g, o), [
      { key: 'later', label: 'Decide later', blue: true },
      { key: 'reject', label: 'Reject', blue: true },
      ...(loan ? [] : [{ key: 'sellon', label: `${fmtMoneyShort(o.fee * (1 - SELL_ON.discount))} + ${Math.round(SELL_ON.pct * 100)}% sell-on` }]),
      { key: 'accept', label: loan ? 'Loan him' : `Sell for ${fmtMoneyShort(o.fee)}` },
    ], { title: loan ? 'Loan offer' : 'Transfer offer' });
    if (k === 'accept' || k === 'sellon') {
      if (acceptOffer(g, o.id, { sellOn: k === 'sellon' })) { changed = true; ctx.toast(`${p.first} ${p.last} ${loan ? 'loaned out' : 'sold'}`); }
      else ctx.toast('The deal could not be completed.');
    } else if (k === 'reject') rejectOffer(g, o.id);
  }
  if (changed) await ctx.save({ silent: true });
  return changed;
}
