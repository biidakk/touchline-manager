// "My Team": squad list, pitch with drag-and-drop lineup, formation, roles,
// intent, style, saved lineups A/B/C, finances and stadium.

import { FORMATION_NAMES, PLAY_STYLES, PLAY_STYLE_LABELS } from '../../core/data.js';
import { autoLineup, slotSkill } from '../../core/ai.js';
import { placePlayer, reshapeLineup, locate, roleTakers, styleShares, saveLineupSlot, loadLineupSlot, BENCH_SIZE,
  slotPositions, repairLineup } from '../../core/lineup.js';
import { releasePlayer } from '../../core/development.js';
import { listPlayer, unlistPlayer, contractTerms, renewContract, openWindow, expiringContracts, leagueGamesLeft } from '../../core/transfers.js';
import { partnerOf, loanToPartner, listForLoan, unlistForLoan, loanSuitors, loanToClub, exerciseOption } from '../../core/loans.js';
import { squadSummary, lineupSkill } from '../../core/ratings.js';
import { ageOf } from '../../core/valuation.js';
import { potText, potEstimate } from '../../core/scouting.js';
import { pitch, formArrow, battery, skillMark } from '../components/pitch.js';
import { flag, icon, stadiumArt } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, fmtMoneyShort, bindActions, fullName } from '../util.js';
import { toShown, toEuros } from '../../core/currency.js';
import { moraleOf, moraleLevel, personalityOf, PERSONALITY_LABEL } from '../../core/morale.js';
import { moraleBadge, showPlayer } from '../components/playercard.js';
import { talkTo, showAdvice } from '../components/talk.js';

const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  if (!club.lineup) club.lineup = autoLineup(g, club);
  const st = { tab: 'tactics', sel: null, sortKey: 'pos', sortDir: 1 };
  const P = (id) => g.players[id];
  const year = g.season.year;

  function parseTarget(s) {
    if (!s) return null;
    if (s === 'reserve') return { zone: 'reserve', index: -1 };
    const [zone, idx] = s.split(':');
    return { zone, index: Number(idx) };
  }

  // Contracts running out: flagged from seven league games before the end (worked out once a day).
  let expiring = { day: -1, ids: new Set(), left: 0 };
  const expiringIds = () => {
    if (expiring.day !== g.day) expiring = { day: g.day, ids: new Set(expiringContracts(g, club.id).map((p) => p.id)), left: leagueGamesLeft(g, club.id) };
    return expiring;
  };
  const contractBadge = (p) => (expiringIds().ids.has(p.id)
    ? `<span class="badge contract" title="Contract ends after this season (${expiring.left} league game${expiring.left === 1 ? '' : 's'} left): offer a new one on the player card">${icon('contract', 'ico-badge')}</span>` : '');

  function badges(p, roles) {
    let b = '';
    if (roles.captainId === p.id) b += '<span class="badge C">C</span>';
    if (p.injuryDays > 0) b += `<span class="badge inj" title="Injured for ${p.injuryDays} days">+${p.injuryDays}d</span>`;
    if (p.suspension > 0) b += `<span class="badge sus" title="Suspended for ${p.suspension} match(es)">S${p.suspension}</span>`;
    if (p.listed) b += '<span class="badge list">$</span>';
    if (p.loanListed) b += '<span class="badge list" title="On the loan list">L?</span>';
    if (p.loan) b += `<span class="badge loan" title="On loan from ${esc(g.clubs[p.loan.parentId].name)}">L</span>`;
    if (p.mood?.request) b += '<span class="badge inj" title="Has asked to leave">!</span>';
    else {
      const v = moraleOf(p);
      if (v < 50) b += `<span class="mood-dot ${v < 35 ? 'bad' : 'warn'}" title="${moraleLevel(v)[1]} (${v})"></span>`;
    }
    return b;
  }

  function squadRows(l, roles) {
    const reserves = club.squad.filter((id) => !l.slots.includes(id) && !l.bench.includes(id))
      .sort((a, b) => POS_ORDER[P(a).pos] - POS_ORDER[P(b).pos] || P(b).skill - P(a).skill);
    const slotPos = slotPositions(l.formation);
    const row = (id, drop) => {
      const p = P(id);
      const un = p.injuryDays > 0 || p.suspension > 0;
      const si = drop.startsWith('slot:') ? Number(drop.slice(5)) : -1;
      const oop = si >= 0 && p.pos !== slotPos[si];
      const skillCell = oop
        ? `<span class="oop-skill" title="Out of position (plays as ${slotPos[si]}): ${p.skill} → ${slotSkill(p, slotPos[si])}">${slotSkill(p, slotPos[si])}</span>`
        : skillMark(p);
      return `<tr data-pid="${id}" data-drop="${drop}" draggable="true" class="${st.sel === id ? 'sel' : ''} ${un ? 'unavail' : ''}">
        <td class="num">${p.number}</td><td>${contractBadge(p)}<b>${esc(fullName(p))}</b>${badges(p, roles)}</td><td class="c">${oop ? `<span class="oop-skill">${slotPos[si]}</span>` : p.pos}</td>
        <td class="num">${ageOf(p, year)}</td><td>${flag(g.nations[p.nationId].flag, 20)}</td>
        <td class="num">${skillCell}</td><td class="num">${potText(g, p, { short: true })}</td><td class="c">${formArrow(p.form)}</td>
        <td class="num">${Math.round(p.energy)}%</td></tr>`;
    };
    return [
      ...l.slots.map((id, i) => (id ? row(id, `slot:${i}`) : '')),
      `<tr class="sep" data-drop="bench:-1"><td colspan="9">Substitutes (${l.bench.length}/${BENCH_SIZE})</td></tr>`,
      ...l.bench.map((id, i) => row(id, `bench:${i}`)),
      '<tr class="sep" data-drop="reserve"><td colspan="9">Reserves</td></tr>',
      ...reserves.map((id) => row(id, 'reserve')),
    ].join('');
  }

  function playerCard(p, roles) {
    const inXI = club.lineup.slots.includes(p.id);
    const status = p.injuryDays > 0 ? `<span class="bad">Injured, ${p.injuryDays} days</span>`
      : p.suspension > 0 ? `<span class="bad">Suspended, ${p.suspension} match(es)</span>` : '<span class="good">Available</span>';
    const roleBtn = (key, label) => `<button class="btn btn-small btn-blue ${club.lineup[key] === p.id || (!club.lineup[key] && roles[key] === p.id) ? 'on' : ''}"
      data-action="role" data-key="${key}" ${inXI ? '' : 'disabled'}>${label}</button>`;
    // It takes the whole column under the money panel (the club buttons come back when it is closed),
    // so the bigger phone text never pushes its buttons over anything else.
    return `<div class="panel player-card" style="left:984px;top:290px;width:280px;height:414px;padding:10px 14px;overflow-y:auto">
      <div class="row" style="justify-content:space-between"><span class="big">${p.number}. ${esc(p.last)}</span>
        <span class="row" style="gap:8px">${flag(g.nations[p.nationId].flag, 26)}<button class="btn btn-small btn-blue" style="min-width:0;padding:0 10px" data-action="deselect" title="Close">✕</button></span></div>
      <div class="muted">${esc(p.first)} · ${{ G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }[p.pos]} · ${ageOf(p, year)} years</div>
      <div class="fin-list" style="margin-top:6px;grid-template-columns:auto 1fr">
        <span>Skill / potential</span><b>${p.skill} / ${potText(g, p)} ${formArrow(p.form)}</b>
        <span class="phone-hide">TEC · PHY · height</span><b class="phone-hide">${p.tec} · ${p.phy} · ${p.height} cm</b>
        <span>Morale</span><b><button class="linkbtn" data-action="talk" title="Talk to him">${moraleBadge(p, true)}</button></b>
        <span>Value · wage</span><b>${fmtMoneyShort(p.value)} · ${fmtMoneyShort(p.wage)}</b>
        <span>Contract · status</span><b>${p.contractEnd}${contractBadge(p)} · ${status}</b>
      </div>
      <div class="roles">${roleBtn('captainId', 'Captain')}${roleBtn('setPieceId', 'Set pieces')}${roleBtn('penaltyId', 'Penalties')}</div>
      ${p.loan ? `<div class="muted" style="margin-top:8px;font-size:13px">On loan from <b>${esc(g.clubs[p.loan.parentId].name)}</b> until the end of the season (you pay ${Math.round(p.loan.wageShare * 100)}% of his wage).</div>
        ${p.loan.option ? `<button class="btn btn-small" style="margin-top:6px" data-action="option">Buy him for ${fmtMoneyShort(p.loan.option)} (option)</button>` : ''}`
        : `<div class="roles four" style="margin-top:6px">
        <button class="btn btn-small btn-blue" data-action="list" title="Put on the transfer list / take off">${p.listed ? 'Unlist' : 'Sell…'}</button>
        <button class="btn btn-small btn-blue ${p.loanListed ? 'on' : ''}" data-action="loan" title="Loan him out">Loan…</button>
        <button class="btn btn-small btn-blue ${p.contractEnd <= year ? 'on' : ''}" data-action="contract" title="Offer a new contract">Contract…</button>
        <button class="btn btn-small btn-blue" data-action="release">Release</button>
      </div>`}
      ${p.listed ? `<div class="muted" style="margin-top:8px;font-size:13px">On the transfer list at ${fmtMoneyShort(p.askingPrice)}. Offers pop up when they arrive.</div>` : ''}
      ${p.loanListed ? '<div class="muted" style="margin-top:8px;font-size:13px">On the loan list. Loan offers pop up when they arrive.</div>' : ''}
    </div>`;
  }

  function tacticsView() {
    const l = club.lineup;
    const roles = roleTakers(g, l);
    const xi = l.slots.filter(Boolean);
    const sum = squadSummary(g, club, xi);
    const shares = styleShares(g, l);
    const num = (id) => (id ? P(id).number : '-');
    const sel = st.sel ? P(st.sel) : null;
    const missing = 11 - xi.length;
    const slotPos = slotPositions(l.formation);
    const oopCount = l.slots.filter((id, i) => id && P(id).pos !== slotPos[i]).length;
    const warn = missing ? `⚠ ${missing} empty place${missing > 1 ? 's' : ''}`
      : oopCount ? `⚠ ${oopCount} player${oopCount > 1 ? 's' : ''} out of position (−30% skill, −75% in or out of goal)` : '';
    const ledger = club.finance.season;
    const all = squadSummary(g, club);

    return `
    <div class="panel scroll" style="left:16px;top:84px;width:384px;height:620px;padding:8px 6px">
      <table class="data squad-table">
        <colgroup><col class="c-no" style="width:28px"><col><col style="width:22px"><col class="c-age" style="width:34px"><col class="c-nat" style="width:32px"><col class="c-sk" style="width:30px"><col class="c-pot" style="width:32px"><col class="c-form" style="width:20px"><col class="c-en" style="width:46px"></colgroup>
        <thead><tr><th class="num">No</th><th>Player</th><th class="c">P</th><th class="num">Age</th><th>Nat</th><th class="num">Sk</th><th class="num">Pot</th><th class="c">F</th><th class="num">En</th></tr></thead>
        <tbody>${squadRows(l, roles)}</tbody>
      </table>
    </div>

    <div style="position:absolute;left:412px;top:84px;width:560px;height:432px">
      ${pitch({ game: g, lineup: l, colors: club.colors, editable: true, selected: st.sel, roles,
        footer: `Avg ${lineupSkill(g, l).toFixed(1)} · ${fmtMoneyShort(sum.value)} · ${sum.age.toFixed(1)} yrs` })}
      <div class="row" style="position:absolute;left:8px;top:8px;z-index:3">
        <select class="field" id="formation" style="height:30px;font-weight:800">${FORMATION_NAMES.map((f) => `<option ${f === l.formation ? 'selected' : ''}>${f}</option>`).join('')}</select>
        <button class="btn btn-small btn-blue" data-action="auto" title="Pick the best available XI">Auto pick</button>
        <button class="btn btn-small btn-blue" data-action="advice" title="Ask your assistant manager">Assistant</button>
      </div>
      ${warn ? `<div style="position:absolute;left:10px;bottom:8px;font-weight:800;color:#ffe066;z-index:3">${warn}</div>` : ''}
    </div>

    <div class="slots-abc" style="position:absolute;left:412px;top:530px">
      ${['A', 'B', 'C'].map((k) => `<div class="slot-abc">
        <button class="key ${club.savedLineups[k] ? 'saved' : ''}" data-action="loadslot" data-k="${k}" ${club.savedLineups[k] ? '' : 'disabled'} title="Load lineup ${k}">${k}</button>
        <div class="mini"><button data-action="saveslot" data-k="${k}" title="Save current lineup as ${k}">↓</button>
        <button data-action="delslot" data-k="${k}" title="Delete lineup ${k}" ${club.savedLineups[k] ? '' : 'disabled'}>x</button></div></div>`).join('')}
    </div>

    <div style="position:absolute;left:484px;top:530px;width:488px">
      <div class="tiles">
        <div title="Captain">${icon('flag')}<span>${num(roles.captainId)}</span><span class="lbl">Cap-<br>tain</span></div>
        <div title="Set-piece taker">${icon('ball')}<span>${num(roles.setPieceId)}</span><span class="lbl">Set<br>pieces</span></div>
        <div title="Penalty taker">${icon('trophy')}<span>${num(roles.penaltyId)}</span><span class="lbl">Pen-<br>alties</span></div>
        <div title="Teamwork: rises when the same players keep starting together">${icon('team')}<span>${club.teamwork ?? 60}</span><span class="lbl">Team-<br>work</span></div>
      </div>
      <div class="ctl-label" style="margin-top:10px">Attacking intent %</div>
      <div class="seg full">${Array.from({ length: 11 }, (_, i) => i * 10).map((v) => `<button class="${club.tactics.intent === v ? 'on' : ''}" data-action="intent" data-v="${v}">${v}</button>`).join('')}</div>
      <div class="seg full" style="margin-top:12px">${PLAY_STYLES.map((s) => `<button class="${club.tactics.style === s ? 'on' : ''}" data-action="style" data-v="${s}">${PLAY_STYLE_LABELS[s]}</button>`).join('')}</div>
      <div class="seg-caption"><span></span><span>${shares.passing}%</span><span>${shares.crosses}%</span><span>${shares.through}%</span></div>
    </div>

    <div class="panel" style="left:984px;top:84px;width:280px;height:196px">
      <div class="fin-list">
        <span>Money</span><b>${fmtMoneyShort(club.budget)}</b>
        <span>Wage bill</span><b>${fmtMoneyShort(all.wages)}</b>
        <span>Squad value</span><b>${fmtMoneyShort(all.value)}</b>
        <span class="phone-hide">Ticket income</span><b class="phone-hide">${fmtMoney(ledger.tickets)}</b>
        <span class="phone-hide">TV & sponsors</span><b class="phone-hide">${fmtMoney(ledger.tvSponsors)}</b>
        <span class="phone-hide">Prize money</span><b class="phone-hide">${fmtMoney(ledger.prizes)}</b>
        <span class="phone-hide">Wages paid</span><b class="phone-hide">${fmtMoney(-ledger.wages)}</b>
        <span>Transfers in / out</span><b>${fmtMoneyShort(-ledger.transfersIn)} / ${fmtMoneyShort(ledger.transfersOut)}</b>
      </div>
    </div>
    ${sel ? playerCard(sel, roles) : `<div class="panel stadium-card" style="left:984px;top:300px;width:280px;height:234px">
      <button class="btn btn-small" style="position:absolute;right:8px;top:8px;min-width:0" data-action="stadium">Stadium</button>
      ${stadiumArt(club, 280, 168)}
      <div class="info"><div class="fin-list"><span>Stadium</span><b>${esc(club.stadium.name)}</b>
        <span>Capacity</span><b>${club.stadium.capacity.toLocaleString('en-US')} seats</b></div></div></div>`}

    ${sel ? '' : `<div class="myteam-actions" style="position:absolute;left:1010px;top:546px;width:228px;display:flex;flex-direction:column;gap:6px">
      <button class="btn btn-blue" data-action="youth">Youth (${(club.youth || []).length})</button>
      <button class="btn btn-blue" data-action="market">Transfers</button>
      <button class="btn btn-blue" data-action="training">Training</button>
      <button class="btn btn-blue" data-action="back">Back</button>
    </div>`}
    <div class="hint phone-hide" style="position:absolute;left:412px;top:699px;width:560px;text-align:center">Drag or click two players to swap them. Double-click a player for his career.</div>`;
  }

  const COLS = [
    ['number', 'No', (p) => p.number, 'num'], ['name', 'Player', (p) => p.last], ['pos', 'Pos', (p) => POS_ORDER[p.pos] * 100 - p.skill, 'c'],
    ['age', 'Age', (p) => ageOf(p, year), 'num'], ['nat', 'Nat', (p) => p.nationId], ['skill', 'Skill', (p) => p.skill, 'num'],
    ['pot', 'Pot', (p) => potEstimate(g, p) ?? 0, 'num'], ['tec', 'TEC', (p) => p.tec, 'num'], ['phy', 'PHY', (p) => p.phy, 'num'],
    ['height', 'Ht', (p) => p.height, 'num'], ['dev', '+/-', (p) => p.skill - (p.seasonStart ?? p.skill), 'num'],
    ['form', 'Form', (p) => p.form, 'c'], ['energy', 'Energy', (p) => p.energy, 'num'],
    ['morale', 'Morale', (p) => moraleOf(p), 'num'], ['pers', 'Personality', (p) => personalityOf(p)],
    ['value', 'Value', (p) => p.value, 'num'], ['wage', 'Wage', (p) => p.wage, 'num'], ['contract', 'Contract', (p) => p.contractEnd, 'num'],
    ['apps', 'Apps', (p) => p.stats.season.apps, 'num'], ['goals', 'Goals', (p) => p.stats.season.goals, 'num'],
    ['assists', 'Ast', (p) => p.stats.season.assists, 'num'],
    ['rating', 'Avg', (p) => (p.stats.season.apps ? p.stats.season.ratingSum / p.stats.season.apps : 0), 'num'],
    ['cards', 'YC/RC', (p) => p.stats.season.yellow + 3 * p.stats.season.red, 'num'],
  ];

  function detailView() {
    const col = COLS.find((c) => c[0] === st.sortKey);
    const ps = club.squad.map(P).sort((a, b) => {
      const x = col[2](a);
      const y = col[2](b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.sortDir;
    });
    const roles = roleTakers(g, club.lineup);
    const cell = (p, key) => {
      const s = p.stats.season;
      switch (key) {
        case 'name': return `${contractBadge(p)}<b>${esc(fullName(p))}</b>${badges(p, roles)}`;
        case 'pos': return p.pos;
        case 'age': return ageOf(p, year);
        case 'nat': return flag(g.nations[p.nationId].flag, 20);
        case 'skill': return skillMark(p);
        case 'pot': return potText(g, p);
        case 'dev': {
          const d = p.skill - (p.seasonStart ?? p.skill);
          return d > 0 ? `<span class="good">+${d}</span>` : d < 0 ? `<span class="bad">${d}</span>` : '0';
        }
        case 'form': return formArrow(p.form);
        case 'energy': return battery(p.energy);
        case 'morale': { const v = moraleOf(p); return `<span class="${moraleLevel(v)[2]}" title="${moraleLevel(v)[1]}">${v}</span>${p.mood?.request ? ' <span class="badge inj" title="Has asked to leave">!</span>' : ''}`; }
        case 'pers': return PERSONALITY_LABEL[personalityOf(p)];
        case 'value': return fmtMoneyShort(p.value);
        case 'wage': return fmtMoneyShort(p.wage);
        case 'contract': return p.contractEnd;
        case 'apps': return s.apps;
        case 'goals': return s.goals;
        case 'assists': return s.assists;
        case 'rating': return s.apps ? (s.ratingSum / s.apps).toFixed(2) : '-';
        case 'cards': return `${s.yellow}/${s.red}`;
        default: return p[key];
      }
    };
    return `<div class="panel" style="left:16px;top:84px;width:1248px;height:560px;display:flex;flex-direction:column">
      <div class="scroll" style="flex:1"><table class="data sortable">
        <thead><tr>${COLS.map(([k, label, , cls]) => `<th class="${cls || ''}" data-action="sort" data-k="${k}">${label}${st.sortKey === k ? (st.sortDir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
        <tbody>${ps.map((p) => `<tr class="click ${locate(club.lineup, p.id).zone === 'slot' ? '' : 'dim'}" data-pid="${p.id}" title="Double-click for his career history">${COLS.map(([k, , , cls]) => `<td class="${cls || ''}">${cell(p, k)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></div>
      <button class="btn btn-blue" style="position:absolute;left:1054px;top:656px;width:210px" data-action="back">Back</button>`;
  }

  function draw() {
    const tabs = `<div class="tabs seg">${[['tactics', 'Tactics'], ['detail', 'Detail']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="tab" data-v="${k}">${l}</button>`).join('')}</div>`;
    root.innerHTML = clubTopbar(ctx, { center: tabs }) + (st.tab === 'tactics' ? tacticsView() : detailView());
    const sel = root.querySelector('#formation');
    if (sel) {
      sel.addEventListener('change', (e) => {
        club.tactics.formation = e.target.value;
        club.lineup = reshapeLineup(g, club.lineup, e.target.value);
        draw();
      });
    }
  }

  function moveTo(pid, target) {
    if (!target) return;
    club.lineup = placePlayer(club.lineup, pid, target);
    st.sel = null;
    draw();
  }

  // Click: select a player; a second click on another player or place swaps them.
  let lastClick = null;
  root.addEventListener('click', (e) => {
    if (st.tab !== 'tactics') return;
    const el = e.target.closest('[data-pid], .pshirt.empty, tr.sep');
    if (!el || e.target.closest('[data-action]')) return;
    const pid = el.dataset.pid || null;
    // A double-click opens the player's card. Each click redraws the list, so
    // the browser's own dblclick never arrives here: time the clicks instead.
    const now = performance.now();
    if (pid && lastClick && lastClick.pid === pid && now - lastClick.t < 400) {
      lastClick = null;
      st.sel = null;
      draw();
      showPlayer(ctx, pid).then(() => draw());
      return;
    }
    lastClick = pid ? { pid, t: now } : null;
    const target = parseTarget(el.dataset.drop || (el.dataset.slot !== undefined ? `slot:${el.dataset.slot}` : null));
    if (!st.sel) {
      if (pid) { st.sel = pid; draw(); }
      return;
    }
    if (pid === st.sel) { st.sel = null; draw(); return; }
    const from = locate(club.lineup, st.sel);
    if (pid && target.zone === 'reserve' && from.zone === 'reserve') { st.sel = pid; draw(); return; }
    moveTo(st.sel, target);
  });

  // Detail table: a plain double-click opens the player's card (the tactics
  // view handles it in the click handler above).
  root.addEventListener('dblclick', (e) => {
    if (st.tab === 'tactics') return;
    const el = e.target.closest('[data-pid]');
    if (!el || e.target.closest('[data-action]')) return;
    st.sel = null;
    showPlayer(ctx, el.dataset.pid).then(() => draw());
  });

  // Drag and drop.
  let dragId = null;
  root.addEventListener('dragstart', (e) => {
    const el = e.target.closest('[data-pid]');
    if (!el) return;
    dragId = el.dataset.pid;
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = 'move';
  });
  const dropEl = (e) => e.target.closest('[data-drop], .pshirt');
  root.addEventListener('dragover', (e) => {
    const el = dropEl(e);
    if (!el || !dragId) return;
    e.preventDefault();
    root.querySelectorAll('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
    el.classList.add('drop-hover');
  });
  root.addEventListener('dragleave', (e) => {
    const el = dropEl(e);
    if (el) el.classList.remove('drop-hover');
  });
  root.addEventListener('drop', (e) => {
    const el = dropEl(e);
    if (!el || !dragId) return;
    e.preventDefault();
    const target = parseTarget(el.dataset.drop || `slot:${el.dataset.slot}`);
    const id = dragId;
    dragId = null;
    moveTo(id, target);
  });
  root.addEventListener('dragend', () => { dragId = null; });

  bindTopbar(root, ctx);
  bindActions(root, {
    tab: (el) => { st.tab = el.dataset.v; st.sel = null; draw(); },
    auto: () => { club.lineup = autoLineup(g, club, club.lineup.formation); st.sel = null; draw(); },
    intent: (el) => { club.tactics.intent = Number(el.dataset.v); draw(); },
    style: (el) => { club.tactics.style = el.dataset.v; draw(); },
    role: (el) => {
      const key = el.dataset.key;
      club.lineup[key] = club.lineup[key] === st.sel ? null : st.sel;
      draw();
    },
    saveslot: (el) => { saveLineupSlot(club, el.dataset.k, club.lineup); ctx.toast(`Lineup ${el.dataset.k} saved`); draw(); },
    loadslot: (el) => {
      const l = loadLineupSlot(g, club, el.dataset.k);
      if (l) { club.lineup = l; st.sel = null; ctx.toast(`Lineup ${el.dataset.k} loaded`); draw(); }
    },
    delslot: (el) => { club.savedLineups[el.dataset.k] = null; draw(); },
    sort: (el) => {
      if (st.sortKey === el.dataset.k) st.sortDir *= -1;
      else { st.sortKey = el.dataset.k; st.sortDir = ['name', 'pos', 'nat', 'number'].includes(el.dataset.k) ? 1 : -1; }
      draw();
    },
    soon: (el) => ctx.go('soon', { title: el.dataset.title, milestone: Number(el.dataset.m) }),
    youth: () => ctx.go('youth'),
    stadium: () => ctx.go('stadium'),
    training: () => ctx.go('training'),
    talk: async () => { await talkTo(ctx, st.sel); draw(); },
    advice: () => showAdvice(ctx),
    deselect: () => { st.sel = null; draw(); },
    option: async () => {
      const p = P(st.sel);
      if (!(await ctx.confirm(`Take up the option: buy ${p.first} ${p.last} from ${g.clubs[p.loan.parentId].name} for ${fmtMoney(p.loan.option)}?`, { ok: 'Buy him' }))) return;
      const r = exerciseOption(g, p.id);
      ctx.toast(r.message);
      if (r.ok) await ctx.save({ silent: true });
      draw();
    },
    loan: async () => {
      const p = P(st.sel);
      const partner = partnerOf(g);
      const suitors = loanSuitors(g, p.id);
      const inWindow = openWindow(g);
      const options = [];
      if (partner) options.push({ key: 'partner', label: `Send to your B-team partner ${partner.name} (free, they pay his wage)` });
      if (suitors.length) options.push({ key: 'clubs', label: `Choose a club now (${suitors.length} interested)` });
      options.push(p.loanListed ? { key: 'unlist', label: 'Take him off the loan list' }
        : { key: 'list', label: 'Put him on the loan list and wait for offers' });
      const notes = [
        partner ? '' : 'You have no B-team partner yet: pick one on the Youth screen and you can send players there for free.',
        inWindow ? (suitors.length ? '' : 'No club of his level wants him right now.') : 'Loans can only be agreed during a transfer window; offers for listed players come when it opens.',
      ].filter(Boolean).join(' ');
      const k = await ctx.choose(`Loan ${p.first} ${p.last} out until the end of the season?${notes ? ` ${notes}` : ''}`, options);
      if (k === 'partner') {
        const r = loanToPartner(g, p.id);
        ctx.toast(r.message);
        if (r.ok) st.sel = null;
      } else if (k === 'clubs') {
        const c = await ctx.choose(`Clubs ready to take ${p.first} ${p.last} on loan:`, suitors.map((s) => ({ key: s.clubId,
          label: `${g.clubs[s.clubId].name} (${g.competitions[g.clubs[s.clubId].compId].name}) · ${s.starter ? 'would start' : 'squad player'} · ${fmtMoneyShort(s.fee)}, they pay ${Math.round(s.wageShare * 100)}% of his wage` })));
        if (c) {
          const r = loanToClub(g, p.id, c);
          ctx.toast(r.message);
          if (r.ok) { st.sel = null; await ctx.save({ silent: true }); }
        }
      } else if (k === 'list') { listForLoan(g, p.id); ctx.toast(`${p.last} is on the loan list`); }
      else if (k === 'unlist') unlistForLoan(g, p.id);
      draw();
    },
    market: () => ctx.go('market', { tab: 'search' }),
    list: async () => {
      const p = P(st.sel);
      if (p.listed) { unlistPlayer(g, p.id); draw(); return; }
      const v = await ctx.prompt(`Asking price for ${p.first} ${p.last} (market value ${fmtMoney(p.value)}). Clubs make offers during transfer windows; each one pops up so you can accept or reject it.`,
        String(Math.round(toShown(g, p.value))), { ok: 'List for sale' });
      if (v === null) return;
      const price = toEuros(g, Number(String(v).replace(/[^0-9.]/g, ''))); // typed in the shown currency
      if (price > 0) { listPlayer(g, p.id, price); ctx.toast(`${p.last} is on the transfer list`); }
      draw();
    },
    contract: async () => {
      const p = P(st.sel);
      const t = contractTerms(g, p);
      const v = await ctx.prompt(`${p.first} ${p.last} (contract until ${p.contractEnd}) asks ${fmtMoney(t.wage)} a year (now ${fmtMoney(p.wage)}). How many years (1-${t.maxYears})?`,
        String(Math.min(3, t.maxYears)), { ok: 'Offer contract' });
      if (v === null) return;
      const r = renewContract(g, p.id, Math.max(1, Math.round(Number(v) || 1)));
      expiring.day = -1; // the contract icon goes at once
      ctx.toast(r.message);
      draw();
    },
    release: async () => {
      const p = P(st.sel);
      if (club.squad.length <= 16) { ctx.toast('The squad is too small to release anyone'); return; }
      if (!(await ctx.confirm(`Release ${p.first} ${p.last}? He leaves the club for nothing. (To get a fee, use Sell instead.)`, { ok: 'Release' }))) return;
      releasePlayer(g, club, st.sel);
      st.sel = null;
      club.lineup = repairLineup(g, club, club.lineup).lineup;
      draw();
    },
    back: () => { ctx.save({ silent: true }); ctx.back(); },
  });
  draw();
}
