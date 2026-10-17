// Live 2D match view: score, clock, moving shirts, events, commentary,
// pause, speed, tactics/substitutions at any time, and instant result.

import { FORMATIONS, ROLE_POS } from '../../core/data.js';
import { step, runToEnd, displayMinute } from '../../core/engine.js';
import { crest, jersey, icon } from '../components/svg.js';
import { commentary } from '../components/commentary.js';
import { battery } from '../components/pitch.js';
import { MatchAnim } from '../components/matchanim.js';
import { finishMatch } from '../matchflow.js';
import { teamOf } from '../../core/national.js';
import { esc, bindActions, playerName } from '../util.js';
import { roundLabel } from '../components/report.js';
import { photoUrl, stadiumFor } from '../backgrounds.js';

// Real milliseconds per match minute at each speed.
const MINUTE_MS = { 1: 2000, 2: 1000, 4: 400 };

const LINES = `<svg class="mpitch-lines" viewBox="0 0 105 68" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" stroke="rgba(255,255,255,.85)" stroke-width=".35">
    <rect x="1" y="1" width="103" height="66"/><line x1="52.5" y1="1" x2="52.5" y2="67"/>
    <circle cx="52.5" cy="34" r="9.15"/><circle cx="52.5" cy="34" r=".5" fill="#fff"/>
    <rect x="1" y="13.8" width="16.5" height="40.3"/><rect x="87.5" y="13.8" width="16.5" height="40.3"/>
    <rect x="1" y="24.8" width="5.5" height="18.3"/><rect x="98.5" y="24.8" width="5.5" height="18.3"/>
    <rect x="-1" y="30.3" width="2" height="7.3" stroke-width=".5"/><rect x="104" y="30.3" width="2" height="7.3" stroke-width=".5"/>
    <circle cx="12" cy="34" r=".5" fill="#fff"/><circle cx="93" cy="34" r=".5" fill="#fff"/>
  </g></svg>`;

export function render(root, ctx) {
  const g = ctx.game;
  const M = ctx.match;
  const m = M.m;
  const f = g.fixtures[M.fixtureId];
  const clubs = [teamOf(g, f.homeId), teamOf(g, f.awayId)];
  if (!M.anim) M.anim = new MatchAnim(g, m, FORMATIONS);
  const anim = M.anim;
  let timer = null;
  let caption = M.caption || 'The players are ready.';
  M.paused = false;
  // Before kick-off, as in the old CSM: the stadium, both teams and the venue.
  const splash = m.period === 'PRE' && !M.kickedOff;
  function kickoffHtml() {
    const comp = g.competitions[f.compId];
    const ground = !f.neutral && g.clubs[f.homeId]?.stadium;
    const venue = ground ? `${esc(ground.name)} · ${ground.capacity.toLocaleString('en-US')} seats` : f.neutral ? 'Neutral ground' : '';
    const side = (i) => `<div class="ko-team">${crest(clubs[i].crest, 150)}<b>${esc(clubs[i].name)}</b></div>`;
    return `<div class="kickoff" id="kickoff" data-action="kickoff" style="background-image:url(${photoUrl(stadiumFor(f.id))})">
      <div class="ko-comp">${esc(comp?.name || '')}<span>${esc(comp ? roundLabel(g, f) : '')}</span></div>
      <div class="ko-teams">${side(0)}<div class="ko-vs">VS</div>${side(1)}</div>
      ${venue ? `<div class="ko-venue">${icon('stadium')} ${venue}</div>` : ''}
      <div class="ko-hint">Tap to start</div>
    </div>`;
  }

  root.innerHTML = `
  <div class="match-head">
    <div class="mh-name left">${esc(clubs[0].name)}</div>
    <div class="mh-crest">${crest(clubs[0].crest, 112)}</div>
    <div class="mh-score" id="s0">0</div><div class="mh-score" id="s1">0</div>
    <div class="mh-crest">${crest(clubs[1].crest, 112)}</div>
    <div class="mh-name right">${esc(clubs[1].name)}</div>
  </div>
  <div class="mclock">${icon('history')} <span id="clock"></span></div>
  <div class="mevents left" id="ev0"></div>
  <div class="mevents right" id="ev1"></div>
  <div class="mpitch" id="mpitch">${LINES}<div id="players"></div>
    <div class="mball" id="ball"></div><div class="carrier" id="carrier"></div>
    <div class="goal-flash" id="flash">GOAL!</div>
    <div class="mcaption">${icon('ball')}<span id="caption"></span></div>
  </div>
  <div class="mbuttons">
    <button class="btn btn-blue btn-small" data-action="lineups">Lineups</button>
    <button class="btn btn-blue btn-small" data-action="pause" id="pause">Pause</button>
    ${M.spectator ? '' : '<button class="btn btn-small" data-action="tactics" title="Substitutions, positions, intent and style">Tactics &amp; subs</button>'}
    <div class="seg" id="speed">${[1, 2, 4].map((s) => `<button data-action="speed" data-v="${s}">${s}×</button>`).join('')}</div>
    <button class="btn btn-blue btn-small" data-action="instant">Instant result</button>
  </div>${splash ? kickoffHtml() : ''}`;

  const $ = (id) => root.querySelector('#' + id);
  const shirts = new Map();
  const speed = () => g.settings.matchSpeed || 2;

  // Draws the players and ball for the animation's current state.
  function drawPitch(dur) {
    const pos = anim.shape(true);
    const live = new Set();
    m.sides.forEach((side, i) => {
      side.slots.forEach((id, slot) => {
        if (!id) return;
        const key = `${i}-${id}`;
        live.add(key);
        let el = shirts.get(key);
        if (!el) {
          el = document.createElement('div');
          el.className = 'mshirt';
          $('players').appendChild(el);
          shirts.set(key, el);
        }
        const gk = ROLE_POS[side.slotRoles[slot]] === 'G';
        if (el.dataset.gk !== String(gk)) {
          el.innerHTML = jersey({ colors: clubs[i].colors, number: clubs[i].numbers?.[id] ?? g.players[id].number, gk, size: 42 });
          el.dataset.gk = String(gk);
        }
        const p = pos.get(key);
        el.style.transition = `left ${dur}ms ease-in-out, top ${dur}ms ease-in-out`;
        el.style.left = `${p.x}%`;
        el.style.top = `${p.y}%`;
      });
    });
    for (const [key, el] of shirts) if (!live.has(key)) { el.remove(); shirts.delete(key); }
    const ball = $('ball');
    ball.style.transition = `left ${dur * 0.85}ms linear, top ${dur * 0.85}ms linear`;
    ball.style.left = `${anim.ball.x}%`;
    ball.style.top = `${anim.ball.y}%`;
    const h = anim.holder;
    const label = $('carrier');
    if (h && pos.get(`${h.side}-${h.id}`)) {
      const p = pos.get(`${h.side}-${h.id}`);
      label.textContent = g.players[h.id].last.toUpperCase();
      label.style.transition = `left ${dur}ms ease-in-out, top ${dur}ms ease-in-out`;
      label.style.left = `${p.x}%`;
      label.style.top = `calc(${p.y}% + 22px)`;
    } else label.textContent = '';
  }

  function eventList(i) {
    const minute = (e) => (e.added ? `${e.minute}+${e.added}` : e.minute);
    return m.events.filter((e) => e.side === i && ['goal', 'yellow', 'red'].includes(e.type)).map((e) => {
      const mark = e.type === 'goal' ? '⚽' : `<span class="card ${e.type === 'red' ? 'red' : 'yellow'}"></span>`;
      return `<div class="mev"><span>${minute(e)}.</span> ${esc(g.players[e.playerId].last)}${e.penalty ? ' (P)' : ''} ${mark}</div>`;
    }).join('');
  }

  function drawInfo() {
    $('s0').textContent = m.sides[0].goals;
    $('s1').textContent = m.sides[1].goals;
    const label = m.period === 'HT' ? 'HT' : m.period === 'FT' ? 'FT' : m.period === 'PRE' ? '0' : displayMinute(m);
    $('clock').textContent = m.agg ? `${label}. · agg ${m.sides[0].goals + m.agg[0]}:${m.sides[1].goals + m.agg[1]}` : `${label}.`;
    $('ev0').innerHTML = eventList(0);
    $('ev1').innerHTML = eventList(1);
    $('caption').textContent = caption;
    $('pause').textContent = M.paused ? 'Resume' : 'Pause';
    root.querySelectorAll('#speed button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === speed()));
  }

  function later(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  }

  // One engine minute, then its planned steps one after another.
  function tick() {
    if (M.paused) return;
    const evs = step(g, m);
    const T = MINUTE_MS[speed()];
    const steps = anim.plan(evs, Math.max(1, Math.min(5, Math.round(T / 400))));
    // Events shown by a step get their text at that step; the rest (cards,
    // injuries, substitutions, whistles) are announced at a short stoppage.
    const shown = new Set(steps.map((s) => s.ev).filter(Boolean));
    const texts = evs.filter((e) => !shown.has(e)).map((e) => commentary(g, m, e)).filter(Boolean);
    const breakTime = evs.some((e) => e.type === 'half' || e.type === 'fulltime90');
    const userInjury = m.userInjury && m.userInjury.side === M.userSide;
    if (userInjury) m.userInjury = null;
    let i = 0;
    let sticky = 0;
    const per = Math.max(140, T / Math.max(1, steps.length));
    if (texts.length && !steps.some((s) => s.kind === 'stoppage')) {
      const last = steps[steps.length - 1];
      steps.push({ kind: 'stoppage', ball: last ? { ...last.ball } : { ...anim.ball },
        holder: last ? last.holder : anim.holder, sp: null, hold: true });
    }

    const next = () => {
      if (M.paused) return;
      if (i < steps.length) {
        const s = steps[i++];
        anim.apply(s);
        if (s.kind === 'goal') {
          $('flash').classList.add('show');
          setTimeout(() => $('flash') && $('flash').classList.remove('show'), 1600);
        }
        // Event texts appear when they happen on the pitch and stay for one more step;
        // otherwise the caption names the player on the ball.
        const text = s.ev ? commentary(g, m, s.ev) : s.kind === 'stoppage' && texts.length ? texts.join(' ') : null;
        if (text) { caption = text; sticky = s.sp ? 2 : 1; }
        else if (sticky > 0) sticky--;
        else if (anim.holder) caption = `${playerName(g.players[anim.holder.id])} (${clubs[anim.holder.side].short})`;
        drawPitch(per);
        drawInfo();
        later(next, per + (s.kind === 'goal' ? 1400 : s.hold ? 400 : 0) + (s.sp ? 300 : 0));
        return;
      }
      M.caption = caption;
      drawInfo();
      if (m.finished) { later(() => finishMatch(ctx, f, m), 1500); return; }
      if (breakTime) {
        later(() => { anim.reset(); ctx.go('tactics', { mode: 'live' }); }, 1300);
        return;
      }
      if (userInjury) {
        later(() => { M.paused = true; ctx.go('tactics', { mode: 'live' }); }, 600);
        return;
      }
      later(tick, steps.length ? 0 : T);
    };
    next();
  }

  function lineupsHtml() {
    const col = (i) => {
      const s = m.sides[i];
      const row = (id, on) => {
        const p = g.players[id];
        return `<tr class="${on ? '' : 'dim'}"><td>${clubs[i].numbers?.[id] ?? p.number}</td><td>${esc(playerName(p))}</td><td class="c">${p.pos}</td>
          <td>${battery(s.energy[id])}</td><td class="num">${s.rating[id] !== undefined ? s.rating[id].toFixed(1) : '-'}</td></tr>`;
      };
      return `<div><h2>${esc(clubs[i].short)}</h2><table class="data">${s.slots.filter(Boolean).map((id) => row(id, true)).join('')}
        ${s.bench.map((id) => row(id, false)).join('')}</table></div>`;
    };
    const [a, b] = m.sides.map((s) => s.stats);
    const pt = a.poss + b.poss || 1;
    const stats = [['Possession', `${Math.round((100 * a.poss) / pt)}%`, `${Math.round((100 * b.poss) / pt)}%`],
      ['Shots', a.shots, b.shots], ['On target', a.onTarget, b.onTarget], ['Corners', a.corners, b.corners],
      ['Fouls', a.fouls, b.fouls]];
    return `<table class="data report-stats">${stats.map(([k, x, y]) => `<tr><td class="num"><b>${x}</b></td><td class="c muted">${k}</td><td><b>${y}</b></td></tr>`).join('')}</table>
      <div class="report-cols">${col(0)}${col(1)}</div>`;
  }

  bindActions(root, {
    kickoff: () => {
      if (M.kickedOff) return;
      M.kickedOff = true;
      $('kickoff')?.classList.add('out');
      setTimeout(() => $('kickoff')?.remove(), 400);
      later(tick, 500);
    },
    pause: () => { M.paused = !M.paused; if (!M.paused) later(tick, 50); drawInfo(); },
    speed: (el) => { g.settings.matchSpeed = Number(el.dataset.v); drawInfo(); },
    lineups: async () => {
      const was = M.paused;
      M.paused = true;
      clearTimeout(timer);
      await ctx.modal(lineupsHtml(), { title: `${displayMinute(m)}. minute` });
      M.paused = was;
      if (!M.paused) later(tick, 50);
      drawInfo();
    },
    tactics: () => { M.paused = true; clearTimeout(timer); ctx.go('tactics', { mode: 'live' }); },
    instant: () => {
      clearTimeout(timer);
      M.paused = true;
      if (M.userSide != null) m.sides[M.userSide].ai = true; // the assistant takes over for the rest of the match
      runToEnd(g, m);
      finishMatch(ctx, f, m);
    },
  });

  drawPitch(0);
  drawInfo();
  if (m.finished) finishMatch(ctx, f, m);
  else if (splash) setTimeout(() => { if (root.isConnected && $('kickoff')) $('kickoff').click(); }, 2600);
  else later(tick, m.period === 'PRE' ? 400 : 200);
  return () => clearTimeout(timer);
}
