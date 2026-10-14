// The club editor: name, short name, stadium, kit and crest, with a live
// preview. Works on any club (yours from My Team, others from Other Teams).

import { setClubName } from '../../core/renames.js';
import { KIT_PATTERNS, CREST_SHAPES, CREST_PATTERNS } from '../../core/data.js';
import { initials } from '../../core/names.js';
import { crest, jersey } from './svg.js';
import { esc } from '../util.js';

const uniq = (xs) => [...new Set(xs)];
const LABEL = (s) => s[0].toUpperCase() + s.slice(1);
const options = (list, cur) => uniq(list).map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${LABEL(v)}</option>`).join('');
function hex(v, fallback) {
  const s = String(v || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return '#' + [...s.slice(1)].map((x) => x + x).join('');
  return fallback;
}

function preview(v, club) {
  const name = (v.name || club.name).trim();
  return `${crest({ shape: v.shape, pattern: v.cpattern, c1: v.c1, c2: v.c2, initials: initials(name) || club.crest.initials }, 72)}
    ${jersey({ colors: { primary: v.primary, secondary: v.secondary, pattern: v.kpattern }, number: 10, size: 64 })}`;
}

// Resolves true when the club was changed.
export async function editClub(ctx, club) {
  const k = club.colors;
  const c = club.crest;
  const v0 = { name: club.name, primary: k.primary, secondary: k.secondary, kpattern: k.pattern, shape: c.shape, cpattern: c.pattern, c1: c.c1, c2: c.c2 };
  const html = `<div class="edit-preview">${preview(v0, club)}</div>
    <div class="edit-grid">
      <label class="lbl">Name</label><input class="field" name="name" value="${esc(club.name)}" maxlength="40">
      <label class="lbl">Short name</label><input class="field" name="short" value="${esc(club.short)}" maxlength="14">
      <label class="lbl">Stadium</label><input class="field" name="stadium" value="${esc(club.stadium.name || '')}" maxlength="40">
      <label class="lbl">Kit</label><div class="row" style="gap:8px"><input type="color" name="primary" value="${hex(k.primary, '#c8102e')}">
        <input type="color" name="secondary" value="${hex(k.secondary, '#f4f4f4')}"><select class="field" name="kpattern" style="flex:1">${options(KIT_PATTERNS, k.pattern)}</select></div>
      <label class="lbl">Crest</label><div class="row" style="gap:8px"><input type="color" name="c1" value="${hex(c.c1, '#c8102e')}">
        <input type="color" name="c2" value="${hex(c.c2, '#f4f4f4')}"><select class="field" name="shape" style="flex:1">${options(CREST_SHAPES, c.shape)}</select>
        <select class="field" name="cpattern" style="flex:1">${options(CREST_PATTERNS, c.pattern)}</select></div>
    </div>`;
  const pending = ctx.form(html, [{ key: 'cancel', label: 'Cancel', blue: true }, { key: 'save', label: 'Save' }], { title: `Edit ${club.name}` });
  // Live preview: the dialog is on the stage now.
  const bg = [...document.querySelectorAll('.modal-bg')].at(-1);
  const read = () => Object.fromEntries([...bg.querySelectorAll('[name]')].map((el) => [el.name, el.value]));
  bg.addEventListener('input', () => { bg.querySelector('.edit-preview').innerHTML = preview(read(), club); });
  const { key, values: v } = await pending;
  if (key !== 'save') return false;
  const name = v.name.trim();
  setClubName(ctx.game, club, name && name !== club.name ? name : null, v.short.trim() || null);
  if (v.stadium.trim()) club.stadium.name = v.stadium.trim();
  club.colors = { ...k, primary: hex(v.primary, k.primary), secondary: hex(v.secondary, k.secondary), pattern: v.kpattern };
  club.crest = { ...c, shape: v.shape, pattern: v.cpattern, c1: hex(v.c1, c.c1), c2: hex(v.c2, c.c2) };
  return true;
}
