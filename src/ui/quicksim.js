// The hub's Sim button: choose how far to go, watch the days go by, then a
// summary of the results and whatever stopped the run.

import { SIM_TARGETS, windowTargetLabel, startSim, simDay } from '../core/quicksim.js';
import { sortedTable } from '../core/season.js';
import { fmtDate } from '../core/calendar.js';
import { marketPopups } from './offers.js';
import { esc } from './util.js';

const STOP_NOTE = {
  offer: 'Stopped: an offer has arrived for one of your players.',
  windowNews: 'Stopped: the transfer window has closed.',
  window: 'Stopped: the winter transfer window is open until 7 February.',
  sacked: 'Stopped: you have been sacked.',
  seasonOver: 'The season is over.',
};

// Resolves to { until, autoPick } or null.
async function askPlan(ctx) {
  const g = ctx.game;
  const opts = SIM_TARGETS.map(([k, label]) => [k, k === 'window' ? windowTargetLabel(g) : label]).filter(([, l]) => l);
  const last = g.simPrefs || { until: 'match', autoPick: false };
  const html = `<p>Play ahead with instant results. Your assistant makes the changes during matches.</p>
    <div style="display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;margin-top:8px">
      <label class="lbl" style="white-space:nowrap">How far</label>
      <select class="field" name="until">${opts.map(([k, l]) => `<option value="${k}" ${k === last.until ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <label class="lbl">Team</label>
      <select class="field" name="pick">
        <option value="keep" ${last.autoPick ? '' : 'selected'}>Keep my lineup (injured and suspended players are replaced)</option>
        <option value="auto" ${last.autoPick ? 'selected' : ''}>Assistant picks the best fresh XI each match</option>
      </select>
    </div>
    <p class="muted" style="font-size:13px;margin-top:10px">The run stops early for offers for your players, the winter window and the end of the season.</p>`;
  const { key, values } = await ctx.form(html, [{ key: 'cancel', label: 'Cancel', blue: true }, { key: 'go', label: 'Sim' }], { title: 'Quick sim' });
  if (key !== 'go') return null;
  g.simPrefs = { until: values.until, autoPick: values.pick === 'auto' };
  return g.simPrefs;
}

function overlay(ctx) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="panel modal"><h2>Simulating…</h2><p class="sim-status big">Starting</p><p class="muted sim-games"></p>
    <div class="actions"><button class="btn btn-small btn-blue" data-stop>Stop</button></div></div>`;
  document.getElementById('stage').appendChild(bg);
  return bg;
}

function summaryHtml(g, sim) {
  const club = g.clubs[g.userClubId];
  const rows = sim.results.map((r) => `<tr><td><span class="res-badge ${r.o}">${r.o}</span></td>
    <td>${esc(g.competitions[r.compId]?.name || '')}</td><td>${esc(r.oppName)} (${r.home ? 'H' : 'A'})</td><td class="num"><b>${r.gf}-${r.ga}</b></td></tr>`).join('');
  const w = sim.results.filter((r) => r.o === 'W').length;
  const d = sim.results.filter((r) => r.o === 'D').length;
  const l = sim.results.filter((r) => r.o === 'L').length;
  let pos = '';
  const comp = club && g.competitions[club.compId];
  if (comp?.table) {
    const i = sortedTable(g, comp).findIndex((r) => r.clubId === club.id);
    if (i >= 0) pos = `<p>${esc(comp.name)}: <b>${i + 1}.</b></p>`;
  }
  return `<p>${sim.days} day${sim.days === 1 ? '' : 's'} played, now ${fmtDate(g.day)}.${sim.results.length ? ` Results: <b>${w}W ${d}D ${l}L</b>.` : ' No matches.'}</p>
    ${pos}
    ${rows ? `<div class="scroll" style="max-height:260px"><table class="data compact">${rows}</table></div>` : ''}
    ${STOP_NOTE[sim.stop] ? `<p class="good" style="margin-top:8px"><b>${esc(STOP_NOTE[sim.stop])}</b></p>` : ''}`;
}

// The whole run. Returns the sim, or null when cancelled.
export async function runQuickSim(ctx) {
  const plan = await askPlan(ctx);
  if (!plan) return null;
  const g = ctx.game;
  const sim = startSim(g, { until: plan.until, autoPick: plan.autoPick });
  const ui = overlay(ctx);
  let stopped = false;
  ui.querySelector('[data-stop]').addEventListener('click', () => { stopped = true; });
  const status = ui.querySelector('.sim-status');
  const games = ui.querySelector('.sim-games');
  try {
    while (!stopped && simDay(g, sim)) {
      status.textContent = fmtDate(g.day);
      games.textContent = sim.results.length ? `${sim.results.length} match${sim.results.length === 1 ? '' : 'es'} played` : '';
      // Let the screen update between days.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    ui.remove();
  }
  if (stopped && !sim.stop) sim.stop = 'user';
  await ctx.save({ silent: true });
  await ctx.modal(summaryHtml(g, sim), { title: 'Quick sim', button: 'Continue' });
  if (sim.stop === 'offer' || sim.stop === 'windowNews') {
    await marketPopups(ctx);
    await ctx.save({ silent: true });
  }
  return sim;
}
