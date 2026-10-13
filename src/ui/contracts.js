// Contract talks with a new signing (after his club accepts the bid), and the
// end-of-season reminder about expiring contracts.

import { contractWish, respondToContract, expiringContracts, CONTRACT_REMIND_GAMES } from '../core/transfers.js';
import { toShown, toEuros, currencySymbol } from '../core/currency.js';
import { ageOf } from '../core/valuation.js';
import { esc, fmtMoney, fullName } from './util.js';

// Resolves to { wage, years } once he signs, or null if the talks fail.
export async function negotiateContract(ctx, p, club, years) {
  const g = ctx.game;
  const wish = contractWish(g, p, club);
  const neg = { patience: wish.patience };
  let note = `${esc(club.name)} have agreed the fee with his club. Now ${esc(p.first)} ${esc(p.last)} has to agree his contract.`;
  let wage = wish.wage;
  // Start from a length he wants (young players long, veterans short).
  let len = Math.min(Math.max(years, wish.years[0]), wish.years[1]);
  const lengths = wish.years[0] === wish.years[1] ? `${wish.years[0]} year${wish.years[0] > 1 ? 's' : ''}` : `${wish.years[0]}-${wish.years[1]} years`;
  for (;;) {
    const html = `<p>${note}</p>
      <div class="fin-list" style="grid-template-columns:auto 1fr;margin:8px 0 12px">
        <span>Age</span><b>${ageOf(p, g.season.year)}</b>
        <span>Wage now</span><b>${fmtMoney(p.wage)} a year</b>
        <span>He asks</span><b>${fmtMoney(wage)} a year</b>
        <span>He wants</span><b>${lengths}</b>
      </div>
      <div class="row" style="gap:10px">
        <label class="lbl">Wage a year (${esc(currencySymbol(g))})</label>
        <input class="field" name="wage" style="flex:1" value="${Math.round(toShown(g, wage) / 1000) * 1000}">
        <select class="field" name="years">${[1, 2, 3, 4, 5].map((y) => `<option value="${y}" ${y === len ? 'selected' : ''}>${y} yr</option>`).join('')}</select>
      </div>
      <p class="muted" style="font-size:13px;margin-top:8px">Offer less and he may ask again, but his patience runs out after a few tries (faster with low offers).</p>`;
    const { key, values } = await ctx.form(html, [
      { key: 'walk', label: 'Walk away', blue: true },
      { key: 'offer', label: 'Offer contract' },
    ], { title: `Contract: ${fullName(p)}` });
    if (key !== 'offer') return null;
    const offered = Math.round(toEuros(g, Number(String(values.wage).replace(/[^0-9.]/g, '')) || 0) / 1000) * 1000;
    len = Number(values.years) || len;
    const r = respondToContract(g, p, club, neg, { wage: offered, years: len });
    if (r.status === 'accepted') { ctx.toast(r.message); return { wage: offered, years: len }; }
    if (r.status === 'walked') { await ctx.confirm(r.message, { ok: 'OK', cancel: null }); return null; }
    note = esc(r.message);
    wage = r.wage;
  }
}

// Three league games before the end: a reminder listing the contracts that
// run out, once a season. Resolves true if the user wants to go to My Team.
export async function contractReminder(ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  if (!club || club.contractReminder === g.season.year) return false;
  const list = expiringContracts(g, club.id, CONTRACT_REMIND_GAMES);
  if (!list.length) return false;
  club.contractReminder = g.season.year;
  const names = list.slice().sort((a, b) => b.skill - a.skill)
    .map((p) => `<li><b>${esc(fullName(p))}</b> (${p.pos}, ${ageOf(p, g.season.year)}, skill ${p.skill})</li>`).join('');
  const k = await ctx.dialog(`<p>Three league games left. These contracts run out at the end of the season; unless you offer new ones (player card → Contract…), the players leave for free:</p>
    <ul style="margin:8px 0 0 18px;line-height:1.5">${names}</ul>`,
  [{ key: 'later', label: 'Later', blue: true }, { key: 'team', label: 'Go to My Team' }], { title: 'Expiring contracts' });
  return k === 'team';
}
