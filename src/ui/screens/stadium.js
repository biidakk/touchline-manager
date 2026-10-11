// Stadium: the ground plan (stands), pitch quality, crowds and building work.

import { EXPANSIONS, MAX_CAPACITY, STANDS, expansionQuote, startExpansion, naturalCrowd, standsOf, missingStands,
  standQuote, startStand, pitchOf, pitchCost, improvePitch, PITCH_LABEL, stadiumMoney } from '../../core/stadium.js';
import { demand, ticketPrice, costsPerYear, TICKET_PLANS } from '../../core/finance.js';
import { fmtDate } from '../../core/calendar.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, bindActions } from '../util.js';

// Top-down plan of the ground: built stands in the club colour, missing ones
// dashed, the one under construction striped.
function groundPlan(club) {
  const have = new Set(standsOf(club));
  const building = club.stadium.expansion?.stand;
  const c = club.colors.primary;
  const R = {
    side: [60, 6, 240, 34], main: [60, 160, 240, 34], west: [6, 46, 44, 108], east: [310, 46, 44, 108],
    nw: [6, 6, 44, 34], ne: [310, 6, 44, 34], sw: [6, 160, 44, 34], se: [310, 160, 44, 34],
  };
  const label = { main: 'MAIN', side: 'SIDE', west: 'WEST', east: 'EAST' };
  const rects = STANDS.map((s) => {
    const [x, y, w, h] = R[s.key];
    const st = have.has(s.key) ? `fill="${c}" stroke="rgba(255,255,255,.7)"`
      : building === s.key ? 'fill="url(#bld)" stroke="#ffe066"' : 'fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.45)" stroke-dasharray="5 4"';
    const t = label[s.key] ? `<text x="${x + w / 2}" y="${y + h / 2 + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="${have.has(s.key) ? '#fff' : 'rgba(255,255,255,.55)'}"${s.key === 'west' || s.key === 'east' ? ` transform="rotate(-90 ${x + w / 2} ${y + h / 2})"` : ''}>${label[s.key]}</text>` : '';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" ${st} stroke-width="1.5"/>${t}`;
  }).join('');
  const q = pitchOf(club);
  const grass = q >= 8 ? '#2f9e3e' : q >= 5 ? '#4a9a3a' : q >= 3 ? '#7d8f3a' : '#8a7a40';
  return `<svg viewBox="0 0 360 200" width="100%" height="100%" aria-hidden="true">
    <defs><pattern id="bld" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#5a4a10"/><rect width="4" height="8" fill="#ffe066" opacity=".55"/></pattern></defs>
    ${rects}
    <rect x="58" y="46" width="244" height="108" rx="2" fill="${grass}"/>
    <g fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1.2"><rect x="64" y="51" width="232" height="98"/><line x1="180" y1="51" x2="180" y2="149"/><circle cx="180" cy="100" r="15"/>
      <rect x="64" y="78" width="26" height="44"/><rect x="270" y="78" width="26" height="44"/></g>
  </svg>`;
}

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
    return { avgCrowd, soldOut, played: played.length, avgDemand };
  }

  function draw() {
    const s = stats();
    const price = ticketPrice(g, club);
    const e = club.stadium.expansion;
    const money = stadiumMoney(club);
    const q = pitchOf(club);
    const earn = (seats) => Math.max(0, Math.min(seats, s.avgDemand - club.stadium.capacity)) * price * 19;
    const row = (label, quote, action, data) => {
      const extra = earn(quote.seats);
      return `<tr><td><b>${label}</b> <span class="muted">+${quote.seats.toLocaleString('en-US')}</span></td><td class="num">${fmtMoney(quote.cost)}</td>
        <td class="num">${Math.round(quote.days / 30)} mo</td>
        <td class="num">${extra > 0 ? `+${fmtMoney(extra)}` : '<span class="dim">-</span>'}</td>
        <td class="num"><button class="btn btn-small" data-action="${action}" ${data} ${e || !quote.seats || quote.cost > money ? 'disabled' : ''}>Build</button></td></tr>`;
    };
    const newStands = missingStands(club).map((st) => row(st.label, standQuote(club, st.key), 'stand', `data-k="${st.key}"`)).join('');
    const enlarge = EXPANSIONS.map((seats) => row('Enlarge all stands', expansionQuote(club, seats), 'build', `data-seats="${seats}"`)).join('');
    const progress = e ? Math.min(100, Math.round((100 * (g.day - e.start)) / (e.end - e.start))) : 0;
    const pitchOpts = Array.from({ length: 10 - q }, (_, i) => q + 1 + i)
      .map((to) => `<option value="${to}">${to}/10 ${PITCH_LABEL[to]} · ${fmtMoney(pitchCost(g, club, to))}</option>`).join('');

    root.innerHTML = `${clubTopbar(ctx, { title: 'Stadium' })}
    <div class="panel" style="left:20px;top:92px;width:440px;height:600px;display:flex;flex-direction:column">
      <h2>${esc(club.stadium.name)}</h2>
      <div style="height:200px">${groundPlan(club)}</div>
      <div class="fin-list" style="margin-top:10px">
        <span>Capacity</span><b>${club.stadium.capacity.toLocaleString('en-US')}</b>
        <span>Fans per home game</span><b>${Math.round(s.avgDemand).toLocaleString('en-US')}</b>
        <span>Average crowd</span><b>${s.avgCrowd ? Math.round(s.avgCrowd).toLocaleString('en-US') : '-'}</b>
        <span>Sold out</span><b>${s.soldOut} of ${s.played} home games</b>
        <span>Ticket price</span><b>${price} € (${(TICKET_PLANS[club.deals?.ticket] || TICKET_PLANS.normal).label.toLowerCase()})</b>
        <span>Upkeep and costs</span><b>${fmtMoney(costsPerYear(g, club))} / season</b>
      </div>
      <h2 style="margin-top:14px">Pitch</h2>
      <div class="row" style="gap:10px;align-items:center">
        <span class="pitch-q q${Math.ceil(q / 2.5)}">${q}/10</span><b>${PITCH_LABEL[q]}</b>
        ${q < 10 ? `<select class="field" id="pitchTo" style="flex:1;min-width:0">${pitchOpts}</select><button class="btn btn-small" data-action="pitch">Re-lay</button>` : '<span class="good">Nothing to improve</span>'}
      </div>
      <p class="hint phone-hide" style="margin-top:6px">Wears by a point every season (two after a hard winter). A poor pitch blunts technical football and causes more injuries.</p>
    </div>
    <div class="panel" style="left:476px;top:92px;width:784px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Building work</h2><span class="muted">Available: <b>${fmtMoney(money)}</b>${club.stadium.fund ? ` (incl. ${fmtMoney(club.stadium.fund)} from the board)` : ''}</span></div>
      ${e ? `<div class="notice-inline">Under construction: <b>${e.stand ? esc(STANDS.find((x) => x.key === e.stand).label) : 'bigger stands'}, +${e.seats.toLocaleString('en-US')} seats</b>, ready on ${fmtDate(e.end)}.
        <div class="bar" style="margin-top:8px"><i style="width:${progress}%"></i><b>${progress}%</b></div></div>` : ''}
      <div class="scroll" style="flex:1"><table class="data" style="margin-top:6px">
        <thead><tr><th>Project</th><th class="num">Cost</th><th class="num">Takes</th><th class="num">Extra tickets / season</th><th></th></tr></thead>
        <tbody>${newStands ? `<tr class="sep"><td colspan="5">New stands</td></tr>${newStands}` : ''}
          <tr class="sep"><td colspan="5">More seats</td></tr>${enlarge}</tbody>
      </table></div>
      <p class="hint phone-hide">One project at a time; the stadium stays open. Extra ticket income only comes while the stadium would otherwise sell out. Corners need both stands next to them. Maximum ${MAX_CAPACITY.toLocaleString('en-US')} seats.</p>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  async function confirmAndRun(text, run) {
    if (!(await ctx.confirm(text, { ok: 'Go ahead' }))) return;
    const r = run();
    ctx.toast(r.message);
    await ctx.save({ silent: true });
    draw();
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    build: (el) => {
      const q = expansionQuote(club, Number(el.dataset.seats));
      confirmAndRun(`Enlarge the stands by ${q.seats.toLocaleString('en-US')} seats for ${q.cost.toLocaleString('en-US')} €? Ready in about ${Math.round(q.days / 30)} months.`,
        () => startExpansion(g, club, Number(el.dataset.seats)));
    },
    stand: (el) => {
      const q = standQuote(club, el.dataset.k);
      confirmAndRun(`Build the ${q.label.toLowerCase()} (${q.seats.toLocaleString('en-US')} seats) for ${q.cost.toLocaleString('en-US')} €? Ready in about ${Math.round(q.days / 30)} months.`,
        () => startStand(g, club, el.dataset.k));
    },
    pitch: () => {
      const to = Number(root.querySelector('#pitchTo').value);
      confirmAndRun(`Re-lay the pitch to ${to}/10 (${PITCH_LABEL[to].toLowerCase()}) for ${pitchCost(g, club, to).toLocaleString('en-US')} €?`,
        () => improvePitch(g, club, to));
    },
    back: () => ctx.back(),
  });
  draw();
}
