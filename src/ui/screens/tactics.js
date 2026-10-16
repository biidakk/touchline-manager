// Pre-match and in-match (half-time) tactics: both teams side by side.
// mode 'pre': edits the club lineup before kick-off.
// mode 'live': edits the running match (substitutions, positions, tactics).

import { PLAY_STYLES, PLAY_STYLE_LABELS, FORMATIONS } from '../../core/data.js';
import { slotSkill } from '../../core/ai.js';
import { potText } from '../../core/scouting.js';
import { placePlayer, roleTakers } from '../../core/lineup.js';
import { prepareLineup, createUserMatch } from '../../core/matchday.js';
import { isNational, prepareNational, teamOf } from '../../core/national.js';
import { makeSub, moveOnPitch, subIntoOpenSlot, displayMinute, runToEnd } from '../../core/engine.js';
import { lineupSkill, squadSummary } from '../../core/ratings.js';
import { fmtDate } from '../../core/calendar.js';
import { pitch, formArrow, battery } from '../components/pitch.js';
import { crest, jersey, icon } from '../components/svg.js';
import { roundLabel } from '../components/report.js';
import { finishMatch } from '../matchflow.js';
import { esc, fmtMoneyShort, bindActions } from '../util.js';

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const live = params.mode === 'live';
  const f = live ? g.fixtures[ctx.match.fixtureId] : g.fixtures[params.fixtureId];
  const national = isNational(g, f);
  const mineId = national ? g.manager.national?.teamId : g.userClubId;
  const userSide = f.homeId === mineId ? 0 : 1;
  const st = { sel: null }; // { side: 'slot'|'bench', index }

  if (!live) {
    if (national) prepareNational(g, f);
    else for (const id of [f.homeId, f.awayId]) prepareLineup(g, g.clubs[id]);
  }

  // Normalised view of one team for drawing.
  function team(i) {
    const club = teamOf(g, i === 0 ? f.homeId : f.awayId);
    if (live) {
      const s = ctx.match.m.sides[i];
      return { club, lineup: { formation: s.formation, slots: s.slots, bench: s.bench, captainId: s.captainId,
        setPieceId: s.setPieceId, penaltyId: s.penaltyId }, tactics: s.tactics, energy: s.energy, side: s };
    }
    return { club, lineup: club.lineup, tactics: club.tactics, energy: null, side: null };
  }

  function compare(t) {
    const l = t.lineup;
    const roles = roleTakers(g, l);
    const gkIdx = FORMATIONS[l.formation].findIndex(([r]) => r === 'GK');
    const gk = l.slots[gkIdx];
    return {
      captain: roles.captainId ? g.players[roles.captainId].skill : 0,
      setPieces: roles.setPieceId ? g.players[roles.setPieceId].skill : 0,
      teamwork: t.club.teamwork ?? 60,
      keeper: gk ? slotSkill(g.players[gk], 'G') : 0,
      roles,
    };
  }

  function bench(t, i) {
    const editable = i === userSide;
    return `<div class="bench-row">${t.lineup.bench.map((id, k) => {
      const p = g.players[id];
      const sel = editable && st.sel && st.sel.zone === 'bench' && st.sel.index === k;
      const e = t.energy ? t.energy[id] : p.energy;
      return `<div class="bshirt ${sel ? 'sel' : ''}" ${editable ? `data-pick="bench:${k}" draggable="true"` : ''} title="${esc(p.first + ' ' + p.last)}">
        <span class="posb">${p.pos}</span>${jersey({ colors: t.club.colors, number: t.club.numbers?.[id] ?? p.number, gk: p.pos === 'G', size: 40 })}
        <div class="pname">${esc(p.last)}</div><div class="pinfo">${p.skill}/${potText(g, p, { short: true })} ${formArrow(p.form)} ${battery(e)}</div></div>`;
    }).join('') || '<div class="dim" style="margin:auto">No substitutes left</div>'}</div>`;
  }

  function controls(t, i) {
    const editable = i === userSide;
    const dis = editable ? '' : 'disabled';
    return `<div class="tac-row"><span class="tac-label">Intent %:</span><div class="seg small">${Array.from({ length: 11 }, (_, k) => k * 10)
      .map((v) => `<button class="${t.tactics.intent === v ? 'on' : ''}" ${dis} data-action="intent" data-v="${v}">${v}</button>`).join('')}</div></div>
      <div class="tac-row"><span class="tac-label">Style:</span><div class="seg small styles">${PLAY_STYLES
      .map((s) => `<button class="${t.tactics.style === s ? 'on' : ''}" ${dis} data-action="style" data-v="${s}">${PLAY_STYLE_LABELS[s]}</button>`).join('')}</div></div>`;
  }

  // Second legs: the first-leg score, from this match's home side's view.
  function firstLegText() {
    const first = f.leg === 2 ? g.fixtures[f.firstLegId]?.result : null;
    return first ? ` · first leg ${first.a}:${first.h}` : '';
  }

  function draw() {
    const T = [team(0), team(1)];
    const C = T.map(compare);
    // Left number: the home side (left pitch), right: the away side; the better one is green.
    const tile = (key, label, info) => {
      const [a, b] = [C[0][key], C[1][key]];
      return `<div class="cmp" title="${info}"><span class="cmp-l">${label}</span><div class="cmp-v"><b class="${a > b ? 'good' : ''}">${a}</b><b class="${b > a ? 'good' : ''}">${b}</b></div></div>`;
    };
    const footer = (t) => {
      const s = squadSummary(g, t.club, t.lineup.slots.filter(Boolean));
      return `Avg ${lineupSkill(g, t.lineup).toFixed(1)} · ${fmtMoneyShort(s.value)} · ${s.age.toFixed(1)} yrs`;
    };
    const m = live ? ctx.match.m : null;
    const sel = (i) => (i === userSide && st.sel && st.sel.zone === 'slot' ? T[i].lineup.slots[st.sel.index] : null);
    const center = live
      ? `<div class="clock">${icon('history')} ${displayMinute(m)}.</div><div class="mini-score">${m.sides[0].goals} : ${m.sides[1].goals}</div>`
      : `<div class="clock" style="font-size:15px">${esc(g.competitions[f.compId].name)} · ${roundLabel(g, f)}<br><span class="muted">${fmtDate(f.day)}${firstLegText()}</span></div>`;
    const subsInfo = live ? `<div class="subs-left">Substitutions left: <b>${T[userSide].side.maxSubs - T[userSide].side.subsUsed}</b></div>` : '';
    const open = live ? Object.values(T[userSide].side.openSlots || {}) : [];
    const notice = open.length
      ? `<div class="notice">⚠ ${open.map((id) => esc(g.players[id].last)).join(', ')} injured: drag (or tap) a substitute onto the empty place${T[userSide].side.subsUsed >= T[userSide].side.maxSubs ? ' (no substitutions left: you play with fewer players)' : ''}.</div>`
      : '';

    root.innerHTML = `
    <div class="topbar match-top">
      ${crest(T[0].club.crest, 50)}<div class="title">${esc(T[0].club.name)}</div>
      <div class="spacer"></div>${center}<div class="spacer"></div>
      <div class="title">${esc(T[1].club.name)}</div>${crest(T[1].club.crest, 50)}
    </div>
    ${[0, 1].map((i) => `
      <div class="tac-pitch ${i === userSide ? 'mine' : ''}" style="left:${i === 0 ? 24 : 696}px" data-side="${i}">
        ${pitch({ game: g, lineup: T[i].lineup, colors: T[i].club.colors, numbers: T[i].club.numbers, selected: sel(i), roles: C[i].roles, editable: i === userSide,
          footer: footer(T[i]), energy: T[i].energy })}
      </div>
      <div class="tac-bench" style="left:${i === 0 ? 24 : 696}px">${bench(T[i], i)}</div>
      <div class="tac-ctl" style="left:${i === 0 ? 24 : 736}px">${controls(T[i], i)}</div>`).join('')}
    ${notice}
    <div class="cmp-col">
      <div class="cmp-head">Compare</div>
      ${tile('captain', 'Captain', 'Skill of each captain')}${tile('setPieces', 'Set pieces', 'Skill of each set-piece taker')}
      ${tile('teamwork', 'Teamwork', 'Teamwork: grows when the same players keep starting together')}${tile('keeper', 'Keeper', 'Skill of each goalkeeper')}
    </div>
    <div class="tac-actions">
      ${live ? `${subsInfo}<button class="btn" data-action="resume">Continue</button>`
        : `<button class="btn" data-action="kickoff">Kick off</button>
           <button class="btn btn-blue btn-small" data-action="instant">Instant result</button>
           <button class="btn btn-blue btn-small" data-action="editlineup">Edit lineup</button>`}
    </div>
    <div class="hint phone-hide" style="position:absolute;left:0;right:0;top:686px;text-align:center;pointer-events:none">${live
      ? 'Substitution: drag a substitute onto the player to replace (or click one, then the other). Drag between two players on the pitch to swap positions.'
      : 'Drag or click two of your players to swap them. Use Edit lineup for the full squad and formation.'}</div>`;
  }

  // A place on the user's pitch or bench under the event, as { zone, index }.
  function placeAt(e) {
    const shirt = e.target.closest('.tac-pitch.mine .pshirt');
    if (shirt) return { el: shirt, zone: 'slot', index: Number(shirt.dataset.slot) };
    const bshirt = e.target.closest('[data-pick]');
    if (bshirt) {
      const [zone, idx] = bshirt.dataset.pick.split(':');
      return { el: bshirt, zone, index: Number(idx) };
    }
    return null;
  }

  // Drag a substitute onto a player (or a player onto a substitute) to bring
  // him on; drag between two players on the pitch to swap their positions.
  let dragFrom = null;
  root.addEventListener('dragstart', (e) => {
    const p = placeAt(e);
    if (!p) return;
    dragFrom = { zone: p.zone, index: p.index };
    e.dataTransfer.setData('text/plain', `${p.zone}:${p.index}`);
    e.dataTransfer.effectAllowed = 'move';
  });
  root.addEventListener('dragover', (e) => {
    const p = placeAt(e);
    if (!p || !dragFrom) return;
    e.preventDefault();
    root.querySelectorAll('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
    p.el.classList.add('drop-hover');
  });
  root.addEventListener('drop', (e) => {
    const p = placeAt(e);
    if (!p || !dragFrom) return;
    e.preventDefault();
    const from = dragFrom;
    dragFrom = null;
    if (from.zone !== p.zone || from.index !== p.index) act(from, { zone: p.zone, index: p.index });
    st.sel = null;
    draw();
  });
  root.addEventListener('dragend', () => {
    dragFrom = null;
    root.querySelectorAll('.drop-hover').forEach((x) => x.classList.remove('drop-hover'));
  });

  // Clicks on the user's pitch / bench: select, then act on the second click.
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return;
    const p = placeAt(e);
    const target = p ? { zone: p.zone, index: p.index } : null;
    if (!target) return;
    if (!st.sel) {
      const t = team(userSide);
      const occupied = target.zone === 'slot' ? t.lineup.slots[target.index] : t.lineup.bench[target.index];
      if (occupied) st.sel = target;
      draw();
      return;
    }
    if (st.sel.zone === target.zone && st.sel.index === target.index) { st.sel = null; draw(); return; }
    act(st.sel, target);
    st.sel = null;
    draw();
  });

  function act(a, b) {
    if (live) {
      const { m } = ctx.match;
      const side = m.sides[userSide];
      if (a.zone === 'slot' && b.zone === 'slot') { moveOnPitch(m, userSide, a.index, b.index); return; }
      const benchSel = a.zone === 'bench' ? a : b.zone === 'bench' ? b : null;
      const slotSel = a.zone === 'slot' ? a : b.zone === 'slot' ? b : null;
      if (!benchSel || !slotSel) return;
      const outId = side.slots[slotSel.index];
      const inId = side.bench[benchSel.index];
      if (side.subsUsed >= side.maxSubs) { ctx.toast('No substitutions left'); return; }
      if (!outId) {
        if (side.openSlots && slotSel.index in side.openSlots) subIntoOpenSlot(g, m, userSide, slotSel.index, inId);
        else ctx.toast('A sent-off player cannot be replaced');
        return;
      }
      makeSub(g, m, userSide, outId, inId);
      return;
    }
    const club = team(userSide).club;
    const l = club.lineup;
    const pid = a.zone === 'slot' ? l.slots[a.index] : l.bench[a.index];
    club.lineup = placePlayer(l, pid, b);
  }

  const userTactics = () => team(userSide).tactics;
  bindActions(root, {
    intent: (el) => { userTactics().intent = Number(el.dataset.v); draw(); },
    style: (el) => { userTactics().style = el.dataset.v; draw(); },
    editlineup: () => ctx.go(national ? 'natteam' : 'myteam'),
    kickoff: () => {
      ctx.match = { fixtureId: f.id, m: createUserMatch(g, f), userSide, paused: false };
      ctx.go('match', {}, { replace: true });
    },
    instant: () => {
      const m = createUserMatch(g, f, { assistant: true });
      runToEnd(g, m);
      finishMatch(ctx, f, m);
    },
    resume: () => ctx.back(),
  });
  draw();
}
