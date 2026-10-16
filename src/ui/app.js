// App shell: stage scaling, screen router, save/load, toasts and dialogs.

import * as storage from './storage.js';
import * as slots from './slots.js';
import { serialize, deserialize } from '../core/save.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startAcademy } from '../core/development.js';
import { applyRenames } from '../core/renames.js';
import { checkPack } from '../core/realpack.js';
import * as title from './screens/title.js';
import * as newgame from './screens/newgame.js';
import * as hub from './screens/hub.js';
import * as tables from './screens/tables.js';
import * as soon from './screens/soon.js';
import * as schedule from './screens/schedule.js';
import * as myteam from './screens/myteam.js';
import * as tactics from './screens/tactics.js';
import * as match from './screens/match.js';
import * as review from './screens/review.js';
import * as youth from './screens/youth.js';
import * as career from './screens/career.js';
import * as cup from './screens/cup.js';
import * as market from './screens/market.js';
import * as finances from './screens/finances.js';
import * as otherteams from './screens/otherteams.js';
import * as search from './screens/search.js';
import * as stadium from './screens/stadium.js';
import * as national from './screens/national.js';
import * as euro from './screens/euro.js';
import * as training from './screens/training.js';
import * as natteam from './screens/natteam.js';
import * as deals from './screens/deals.js';
import * as preseason from './screens/preseason.js';
import * as rankings from './screens/rankings.js';
import * as u19 from './screens/u19.js';
import * as fame from './screens/fame.js';
import * as saves from './screens/saves.js';
import { esc, setMoneyGame } from './util.js';
import { showPlayer } from './components/playercard.js';
import { showTip } from './tips.js';

const SCREENS = { title, newgame, hub, euro, tables, soon, schedule, myteam, tactics, match, review, youth, career, cup, market,
  finances, otherteams, search, stadium, national, training, natteam, deals, preseason, rankings, u19, fame, saves };
const PACK_KEY = 'realpack';

const stage = document.getElementById('stage');
const rootRef = { el: document.getElementById('screen') };

// Scales the 1280×720 stage to the window. Small screens (phones) use every
// pixel; larger ones keep a thin margin.
function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const s = Math.min(w / 1280, h / 720) * (h < 600 ? 1 : 0.98);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  // Phones (the stage ends up at about half size): bigger text.
  document.documentElement.classList.toggle('phone', s < 0.7 && Math.min(screen.width, screen.height) < 600);
}
window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(fit, 200));
fit();

let toastTimer = 0;

const ctx = {
  game: null,
  current: null,
  stack: [],

  go(name, params = {}, { replace = false } = {}) {
    if (this.current && !replace) this.stack.push(this.current);
    this.current = { name, params };
    this.render();
  },

  // Navigate to a screen and forget the history (e.g. back to the hub).
  home(name = 'hub', params = {}) {
    this.stack = [];
    this.current = { name, params };
    this.render();
  },

  back() {
    this.current = this.stack.pop() || { name: this.game ? 'hub' : 'title', params: {} };
    this.render();
  },

  render() {
    // A fresh element drops the listeners bound by the previous screen.
    const fresh = rootRef.el.cloneNode(false);
    rootRef.el.replaceWith(fresh);
    rootRef.el = fresh;
    // A screen may return a cleanup function (e.g. to stop the live match clock).
    if (this.cleanup) this.cleanup();
    setMoneyGame(this.game);
    this.cleanup = SCREENS[this.current.name].render(fresh, this, this.current.params) || null;
    // First-season tips (the hub shows its own after its pop-ups).
    const name = this.current.name;
    if (this.game && name !== 'hub') setTimeout(() => { if (this.current?.name === name) showTip(this, name); }, 250);
  },

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  },

  confirm(message, { ok = 'OK', cancel = 'Cancel' } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="panel modal"><p>${esc(message)}</p><div class="actions">
        ${cancel ? `<button class="btn btn-small btn-blue" data-r="0">${esc(cancel)}</button>` : ''}
        <button class="btn btn-small" data-r="1">${esc(ok)}</button></div></div>`;
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (!b) return;
        bg.remove();
        resolve(b.dataset.r === '1');
      });
      stage.appendChild(bg);
    });
  },

  // Offers a few choices; resolves to the chosen key, or null when cancelled.
  // options: [{ key, label }]. html: the message is already HTML.
  choose(message, options, { html = false } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="panel modal"><p>${html ? message : esc(message)}</p>
        <div style="display:flex;flex-direction:column;gap:8px">${options.map((o) => `<button class="btn btn-small" data-k="${esc(o.key)}">${esc(o.label)}</button>`).join('')}</div>
        <div class="actions"><button class="btn btn-small btn-blue" data-k="">Cancel</button></div></div>`;
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        bg.remove();
        resolve(b.dataset.k || null);
      });
      stage.appendChild(bg);
    });
  },

  // Asks for a value; resolves to the text entered, or null when cancelled.
  prompt(message, value = '', { ok = 'OK' } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="panel modal"><p>${esc(message)}</p>
        <input class="field" style="width:100%" value="${esc(value)}">
        <div class="actions"><button class="btn btn-small btn-blue" data-r="0">Cancel</button>
        <button class="btn btn-small" data-r="1">${esc(ok)}</button></div></div>`;
      const input = bg.querySelector('input');
      const done = (yes) => { bg.remove(); resolve(yes ? input.value : null); };
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-r]');
        if (b) done(b.dataset.r === '1');
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
      stage.appendChild(bg);
      input.focus();
      input.select();
    });
  },

  // Shows HTML in a large dialog; resolves when it's closed.
  modal(html, { title = '', button = 'Close' } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="panel modal wide">${title ? `<h2>${esc(title)}</h2>` : ''}
        <div class="modal-body">${html}</div>
        <div class="actions"><button class="btn btn-small" data-close>${esc(button)}</button></div></div>`;
      bg.addEventListener('click', (e) => {
        if (!e.target.closest('[data-close]')) return;
        bg.remove();
        resolve();
      });
      stage.appendChild(bg);
    });
  },

  // A centred dialog with HTML content and its own buttons; resolves to the
  // chosen button's key. buttons: [{ key, label, blue? }]
  dialog(html, buttons, { title = '' } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="panel modal">${title ? `<h2>${esc(title)}</h2>` : ''}<div>${html}</div>
        <div class="actions">${buttons.map((b) => `<button class="btn btn-small ${b.blue ? 'btn-blue' : ''}" data-k="${esc(b.key)}">${esc(b.label)}</button>`).join('')}</div></div>`;
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        bg.remove();
        resolve(b.dataset.k);
      });
      stage.appendChild(bg);
    });
  },

  // Like dialog, with form fields: resolves to { key, values } where values
  // holds every input/select of the dialog by its name.
  form(html, buttons, { title = '' } = {}) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="panel modal">${title ? `<h2>${esc(title)}</h2>` : ''}<div>${html}</div>
        <div class="actions">${buttons.map((b) => `<button class="btn btn-small ${b.blue ? 'btn-blue' : ''}" data-k="${esc(b.key)}">${esc(b.label)}</button>`).join('')}</div></div>`;
      bg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]');
        if (!b) return;
        const values = Object.fromEntries([...bg.querySelectorAll('[name]')].map((el) => [el.name, el.value]));
        bg.remove();
        resolve({ key: b.dataset.k, values });
      });
      stage.appendChild(bg);
      bg.querySelector('input')?.focus();
    });
  },

  // The save slot of the career being played (see slots.js).
  slot: null,

  async hasSave() {
    try {
      const meta = await slots.listSlots();
      return slots.SLOTS.some((n) => meta[n]);
    } catch { return false; }
  },

  async save({ silent = false, backup = false } = {}) {
    // The ?dev=1 shortcut plays a throwaway career and must never overwrite the real save.
    if (this.dev) { if (!silent) this.toast('Dev mode: not saved'); return; }
    try {
      if (!this.slot) this.slot = slots.freeSlot(await slots.listSlots()) || 1;
      await slots.writeSlot(this.slot, this.game, serialize(this.game), { force: backup });
      if (!silent) this.toast(`Game saved (slot ${this.slot})`);
    } catch (e) {
      console.error(e);
      this.toast('Saving failed: ' + e.message);
    }
  },

  // Loads slot n (default: the slot saved last).
  async load(n) {
    if (!n) {
      const meta = await slots.listSlots();
      n = meta.last && meta[meta.last] ? meta.last : slots.SLOTS.find((x) => meta[x]);
    }
    const text = n && await slots.readSlot(n);
    if (!text) throw new Error('No saved career found.');
    this.open(deserialize(text), n);
  },

  // A backup of slot n: it becomes the slot's career, and the save it
  // replaces is kept as the newest backup.
  async loadBackup(n, i) {
    const text = await slots.readBackup(n, i);
    if (!text) throw new Error('That backup is missing.');
    this.open(deserialize(text), n);
    await this.save({ silent: true, backup: true });
  },

  open(game, n) {
    this.game = game;
    this.slot = n;
    startAcademy(this.game); // careers from before milestone 5 get their first academy intake
    this.applyNames();
    this.home('hub');
  },

  // names.json in the game folder: the player's own names (see renames.js).
  renames: null,
  async loadNames() {
    try {
      const r = await fetch('names.json', { cache: 'no-store' });
      this.renames = r.ok ? await r.json() : null;
    } catch (e) {
      console.warn('names.json could not be read:', e.message);
      this.renames = null;
      this.namesError = 'names.json could not be read (check the file for typos).';
    }
  },
  // Real teams and players (core/realpack.js): a file loaded on the New
  // Career screen (kept in this browser), else realpack.json in the game folder.
  realPack: null,
  realPackSource: null,
  async loadRealPack() {
    this.realPack = null;
    this.realPackSource = null;
    try {
      const text = await storage.get(PACK_KEY);
      if (text) { this.realPack = JSON.parse(text); this.realPackSource = 'browser'; return; }
    } catch (e) { console.warn('stored real-teams file unreadable:', e.message); }
    try {
      const r = await fetch('realpack.json', { cache: 'no-store' });
      if (r.ok) { this.realPack = await r.json(); this.realPackSource = 'folder'; }
    } catch { /* no file: the game stays fictional */ }
  },
  async storeRealPack(text) {
    const pack = JSON.parse(text);
    const problems = checkPack(pack);
    if (problems.length) throw new Error(problems[0]);
    await storage.put(PACK_KEY, text);
    this.realPack = pack;
    this.realPackSource = 'browser';
    return pack;
  },
  // The locked copy on the website (realpack.enc, made by tools/make_realpack.py):
  // decrypted with the code from the shared link (#rp=CODE) or typed in.
  async unlockRealPack(code) {
    if (!crypto?.subtle) throw new Error('Unlocking needs the https:// web address of the game.');
    const r = await fetch('realpack.enc', { cache: 'no-store' });
    if (!r.ok) throw new Error('There are no locked real teams on this site.');
    const box = await r.json();
    const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const norm = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(norm), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(box.salt), iterations: box.iter, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(box.iv) }, key, bytes(box.data));
    } catch {
      throw new Error('That code is not right.');
    }
    return this.storeRealPack(new TextDecoder().decode(plain));
  },
  async forgetRealPack() {
    await storage.remove(PACK_KEY);
    await this.loadRealPack();
  },

  applyNames(game = this.game) {
    if (game && this.renames) applyRenames(game, this.renames);
  },

  exportSave() {
    const g = this.game;
    const club = g.clubs[g.userClubId];
    const name = `touchline-${club.short.toLowerCase()}-${g.season.year}.json`.replace(/[^a-z0-9.-]/g, '');
    storage.downloadText(name, serialize(g));
    this.toast('Save file exported');
  },

  // A save file into a slot: the first free one, or one the user picks to replace.
  async importSave() {
    const text = await storage.pickFile();
    if (!text) return;
    try {
      const game = deserialize(text);
      const n = await this.pickSlot('Import into which slot? The career in it will be replaced (its last save is kept as a backup).');
      if (!n) return;
      this.open(game, n);
      await this.save({ silent: true });
      this.toast(`Career imported into slot ${n}`);
    } catch (e) {
      await this.confirm(`Import failed: ${e.message}`, { cancel: null });
    }
  },

  // A free slot, else the one the user chooses to replace (null: cancelled).
  async pickSlot(question) {
    const meta = await slots.listSlots();
    const free = slots.freeSlot(meta);
    if (free) return free;
    const k = await this.choose(question, slots.SLOTS.map((n) => ({ key: String(n),
      label: `Slot ${n}: ${meta[n].club}, ${meta[n].year}/${String(Number(meta[n].year) + 1).slice(2)}` })));
    return k ? Number(k) : null;
  },

  async exportSlot(n) {
    const text = await slots.readSlot(n);
    if (!text) return;
    const g = deserialize(text);
    const club = g.clubs[g.userClubId];
    const name = `touchline-${(club?.short || 'career').toLowerCase()}-${g.season.year}.json`.replace(/[^a-z0-9.-]/g, '');
    storage.downloadText(name, text);
    this.toast('Save file exported');
  },

  async quit() {
    if (await this.confirm('Return to the title screen? Unsaved progress since your last save will be lost.',
      { ok: 'Quit', cancel: 'Stay' })) {
      this.game = null;
      this.slot = null;
      this.home('title');
    }
  },
};

// Clickable names (components/links.js), in every screen and dialog: a club
// opens its page on Other Teams, a player his card. Runs before the screens'
// own click handlers, so a name inside a clickable row opens the name.
stage.addEventListener('click', (e) => {
  const el = e.target.closest('[data-club], [data-player]');
  if (!el || !ctx.game) return;
  e.stopPropagation();
  e.preventDefault();
  if (el.dataset.player) {
    if (ctx.game.players[el.dataset.player]) showPlayer(ctx, el.dataset.player);
    return;
  }
  const clubId = el.dataset.club;
  if (!ctx.game.clubs[clubId]) return;
  // Close any open dialogs first (letting them resolve normally).
  for (const bg of [...stage.querySelectorAll('.modal-bg')].reverse()) {
    const close = bg.querySelector('[data-close]');
    if (close) close.click(); else bg.remove();
  }
  ctx.go('otherteams', { clubId });
}, true);

// Developer shortcut for automated checks: ?dev=1[&seed=..][&screen=..]
const qs = new URLSearchParams(location.search);
await ctx.loadNames();
await ctx.loadRealPack();
// A shared link ending in #rp=CODE unlocks the real teams once; the code
// leaves the address bar afterwards.
const linkCode = /[#&]rp=([A-Za-z0-9-]+)/.exec(location.hash)?.[1];
if (linkCode) {
  history.replaceState(null, '', location.pathname + location.search);
  if (!ctx.realPack) {
    try {
      const pack = await ctx.unlockRealPack(linkCode);
      setTimeout(() => ctx.toast(`Real teams unlocked (${Object.keys(pack.clubs).length} clubs). Start a new career to play with them.`), 600);
    } catch (e) {
      setTimeout(() => ctx.toast(`Real teams: ${e.message}`), 600);
    }
  }
}
if (qs.get('dev')) {
  ctx.dev = true;
  const g = generateWorld({ seed: qs.get('seed') || 'dev', managerName: 'Dev' });
  ctx.applyNames(g);
  ctx.game = startCareer(g, g.competitions['ENG-L1'].clubIds[0]);
  startAcademy(ctx.game);
  ctx.home(qs.get('screen') || 'hub');
} else {
  ctx.home('title');
  if (ctx.namesError) ctx.toast(ctx.namesError);
}
document.documentElement.dataset.ready = '1';
window.__ctx = ctx;
