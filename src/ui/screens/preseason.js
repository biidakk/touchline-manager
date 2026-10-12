// Pre-season tour: three options with different costs and effects on morale
// and teamwork, each with three friendlies against foreign clubs of a similar
// level. Shown after the season preparations.

import { TOURS, tourMoney, tourOpponents, chooseTour, tourDue } from '../../core/preseason.js';
import { crest, flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoneyShort, bindActions } from '../util.js';

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const st = { pick: null };
  if (!tourDue(g)) { ctx.home('hub'); return; }
  const tours = TOURS.map((t) => ({ t, money: tourMoney(g, club, t), opps: tourOpponents(g, t.key).map((id) => g.clubs[id]) }));
  const stars = (n, max) => '★'.repeat(Math.max(1, Math.round((n / max) * 5))).padEnd(5, '☆');

  function draw() {
    const cards = tours.map(({ t, money, opps }) => {
      const net = money.cost - money.fees;
      return `<button class="deal-card tour-card ${st.pick === t.key ? 'on' : ''}" data-action="pick" data-k="${t.key}">
        <div class="deal-t">${esc(t.name)}</div>
        <div class="deal-l">in ${esc(t.place)}</div>
        <div class="deal-big">${net >= 0 ? fmtMoneyShort(net) : `+${fmtMoneyShort(-net)}`}</div>
        <div class="deal-l">${money.fees ? `costs ${fmtMoneyShort(money.cost)}, appearance fees ${fmtMoneyShort(money.fees)}` : 'cost'}</div>
        <div class="deal-l">Morale <b class="stars">${stars(t.morale, 9)}</b> · Teamwork <b class="stars">${stars(t.teamwork, 10)}</b></div>
        <div class="tour-opps">${opps.map((c) => `<div>${crest(c.crest, 20)} ${esc(c.name)} ${flag(g.nations[c.nationId].flag, 16)}</div>`).join('')}</div>
        <div class="deal-s">${esc(t.text)}</div></button>`;
    }).join('');
    root.innerHTML = `${clubTopbar(ctx, { title: 'Pre-season tour' })}
    <div class="panel" style="left:20px;top:92px;width:1240px;height:540px">
      <h2>Where do you take the squad before the season? Three friendlies against foreign clubs of your level.</h2>
      <div class="deal-row">${cards}</div>
    </div>
    <button class="btn" style="position:absolute;left:1010px;top:644px;width:250px;height:50px" data-action="done" ${st.pick ? '' : 'disabled'}>${st.pick ? 'Book the tour' : 'Choose first'}</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    pick: (el) => { st.pick = el.dataset.k; draw(); },
    done: async () => {
      const r = chooseTour(g, st.pick);
      ctx.toast(r.message);
      await ctx.save({ silent: true });
      ctx.home('hub');
    },
  });
  draw();
}
