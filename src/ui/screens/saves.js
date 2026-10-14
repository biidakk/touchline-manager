// Load career: the three save slots in this browser, with their backups.

import * as slots from '../slots.js';
import { fmtDate } from '../../core/calendar.js';
import { crest } from '../components/svg.js';
import { esc, bindActions } from '../util.js';

const season = (y) => (y === '' || y == null ? '' : `${y}/${String(Number(y) + 1).slice(2)}`);
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

export function render(root, ctx) {
  let meta = null;

  function card(n) {
    const m = meta[n];
    if (!m) {
      return `<div class="panel save-slot" style="left:${24 + (n - 1) * 416}px;top:92px;width:400px;height:604px">
        <h2>Slot ${n}</h2><div class="empty" style="margin-top:120px">Empty slot</div>
        <div class="save-actions"><button class="btn btn-small" data-action="new" data-n="${n}">New career here</button></div></div>`;
    }
    const backups = (m.backups || []).map((b, i) => `<tr><td>${b.club !== m.club ? `${esc(b.club)}<br>` : ''}${b.day ? fmtDate(b.day, false) : season(b.year)}</td>
      <td class="num"><button class="btn btn-small btn-blue" data-action="restore" data-n="${n}" data-i="${i}">Restore</button></td></tr>`).join('');
    return `<div class="panel save-slot" style="left:${24 + (n - 1) * 416}px;top:92px;width:400px;height:604px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Slot ${n}</h2>${meta.last === n ? '<span class="badge">LAST PLAYED</span>' : ''}</div>
      <div class="row" style="gap:12px;margin:6px 0 10px">${m.crest ? crest(m.crest, 64) : ''}
        <div><div class="big">${esc(m.club)}</div><div class="muted">${esc(m.manager || '')}</div></div></div>
      <div class="kv"><span>Season:</span><b>${season(m.year)}</b><span>Date:</span><b>${m.day ? fmtDate(m.day) : ''}</b>
        ${m.savedAt ? `<span>Saved:</span><b>${esc(when(m.savedAt))}</b>` : ''}</div>
      <div class="save-actions"><button class="btn" data-action="load" data-n="${n}">Load</button></div>
      <h3 style="margin:14px 0 4px">Backups</h3>
      <div class="scroll" style="flex:1">${backups ? `<table class="data compact">${backups}</table>`
        : '<div class="muted" style="font-size:13px">A backup is kept every week of game time (the last two).</div>'}</div>
      <div class="row" style="gap:8px;justify-content:flex-end">
        <button class="btn btn-small btn-blue" data-action="export" data-n="${n}">Export</button>
        <button class="btn btn-small btn-blue" data-action="delete" data-n="${n}">Delete</button></div>
    </div>`;
  }

  function draw() {
    root.innerHTML = `<div class="topbar"><div class="title">Load career</div><div class="spacer"></div>
      <button class="top-action" data-action="back">Back</button></div>
      ${meta ? slots.SLOTS.map(card).join('') : '<div class="empty" style="position:absolute;top:300px;width:100%">Reading saves…</div>'}`;
  }

  const fail = (e) => ctx.confirm(e.message, { cancel: null });
  bindActions(root, {
    back: () => ctx.home('title'),
    load: (el) => ctx.load(Number(el.dataset.n)).catch(fail),
    new: (el) => ctx.go('newgame', { slot: Number(el.dataset.n) }),
    export: (el) => ctx.exportSlot(Number(el.dataset.n)).catch(fail),
    restore: async (el) => {
      const n = Number(el.dataset.n);
      const b = meta[n].backups[Number(el.dataset.i)];
      if (!(await ctx.confirm(`Go back to the backup from ${b.day ? fmtDate(b.day, false) : 'earlier'}? The current save of slot ${n} is kept as a backup.`, { ok: 'Restore' }))) return;
      ctx.loadBackup(n, Number(el.dataset.i)).catch(fail);
    },
    delete: async (el) => {
      const n = Number(el.dataset.n);
      if (!(await ctx.confirm(`Delete the career in slot ${n} (${meta[n].club}) and its backups? This can't be undone.`, { ok: 'Delete' }))) return;
      await slots.deleteSlot(n);
      meta = await slots.listSlots();
      draw();
    },
  });

  draw();
  slots.listSlots().then((m) => { meta = m; draw(); }).catch(fail);
}
