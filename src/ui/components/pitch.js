// Vertical half pitch (attack upwards) with shirts for a lineup.

import { FORMATIONS, ROLE_POS } from '../../core/data.js';
import { slotSkill } from '../../core/ai.js';
import { jersey } from './svg.js';
import { esc } from '../util.js';

export function formArrow(form) {
  const f = form || 0;
  const map = { 2: ['⇈', 'good'], 1: ['↑', 'good'], 0: ['–', 'muted'], '-1': ['↓', 'bad'], '-2': ['⇊', 'bad'] };
  const [ch, cls] = map[f] || map[0];
  return `<span class="form ${cls}">${ch}</span>`;
}

// Skill, green after a recent rise and red after a drop (for two matches).
export function skillMark(p, value = p.skill) {
  if (!p.chg) return String(value);
  const up = p.chg.dir > 0;
  return `<span class="${up ? 'sk-up' : 'sk-down'}" title="Skill just went ${up ? 'up' : 'down'}">${value}${up ? '▲' : '▼'}</span>`;
}

export function battery(energy) {
  const e = Math.round(energy ?? 100);
  const cls = e >= 80 ? '' : e >= 60 ? 'mid' : 'low';
  return `<span class="batt ${cls}"><i style="width:${e}%"></i><b>${e}</b></span>`;
}

const LINES = `<svg class="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".35" vector-effect="non-scaling-stroke">
    <rect x="1" y="0.5" width="98" height="99"/>
    <path d="M38 0.5 A12 14 0 0 0 62 0.5"/>
    <rect x="22" y="79" width="56" height="20.5"/>
    <rect x="37" y="92.5" width="26" height="7"/>
    <path d="M40 79 A10 8 0 0 1 60 79"/>
  </g>
  <circle cx="50" cy="0.5" r=".7" fill="rgba(255,255,255,.7)"/>
  <circle cx="50" cy="87" r=".5" fill="rgba(255,255,255,.7)"/>
</svg>`;

// opts: { game, lineup, colors, editable, selected, roles: {captainId}, footer, numbers }
// numbers: shirt numbers by player id (national teams), else the club number.
export function pitch({ game, lineup, colors, editable = false, selected = null, roles = {}, footer = '', energy = null, numbers = null }) {
  const slots = FORMATIONS[lineup.formation];
  const shirts = slots.map(([role, x, y], i) => {
    const id = lineup.slots[i];
    // Formation y runs 15..93; squeeze it so the top and bottom shirts stay readable.
    const style = `left:${x}%;top:${10 + y * 0.8}%`;
    if (!id) {
      return `<div class="pshirt empty" style="${style}" data-slot="${i}"><div class="ring">${role}</div></div>`;
    }
    const p = game.players[id];
    const unavailable = p.injuryDays > 0 || p.suspension > 0;
    const e = energy ? energy[id] : p.energy;
    const oop = p.pos !== ROLE_POS[role];
    const title = oop
      ? `${p.first} ${p.last}: ${p.pos} playing as ${role}, out of position (skill ${p.skill} → ${slotSkill(p, ROLE_POS[role])})`
      : `${p.first} ${p.last} (${role})`;
    return `<div class="pshirt ${selected === id ? 'sel' : ''} ${unavailable ? 'unavail' : ''} ${oop ? 'oop' : ''}" style="${style}" data-slot="${i}"
        data-pid="${id}" ${editable ? 'draggable="true"' : ''} title="${esc(title)}">
      ${roles.captainId === id ? '<span class="cap">C</span>' : ''}
      ${oop ? '<span class="oop-flag">!</span>' : ''}
      ${jersey({ colors, number: numbers?.[id] ?? p.number, gk: role === 'GK', size: 46 })}
      <div class="pname">${esc(p.last)}</div>
      <div class="pinfo">${oop ? `<span class="oop-skill">${slotSkill(p, ROLE_POS[role])}</span>` : skillMark(p)} ${formArrow(p.form)} ${battery(e)}</div>
    </div>`;
  }).join('');
  return `<div class="pitch">${LINES}${shirts}${footer ? `<div class="pitch-foot">${footer}</div>` : ''}</div>`;
}
