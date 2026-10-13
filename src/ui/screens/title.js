import { jersey } from '../components/svg.js';
import { bindActions } from '../util.js';
import { KIT_COLORS, KIT_PATTERNS } from '../../core/data.js';

export function render(root, ctx) {
  const kits = Array.from({ length: 7 }, (_, i) => jersey({
    colors: {
      primary: KIT_COLORS[(i * 4) % KIT_COLORS.length],
      secondary: KIT_COLORS[(i * 4 + 9) % KIT_COLORS.length],
      pattern: KIT_PATTERNS[i % KIT_PATTERNS.length],
    },
    number: [1, 4, 6, 8, 10, 9, 11][i],
    gk: i === 0,
    size: 64,
  })).join('');

  root.innerHTML = `<div class="title-screen">
    <div class="logo">Touchline Manager<small>FOOTBALL MANAGEMENT</small></div>
    <div class="title-kits">${kits}</div>
    <div class="title-menu">
      <button class="btn" data-action="continue" id="btn-continue" disabled>Continue career</button>
      <button class="btn btn-blue" data-action="new">New career</button>
      <button class="btn btn-blue" data-action="import">Import save file</button>
    </div>
    <div class="version">v2.7</div>
  </div>`;

  ctx.hasSave().then((has) => {
    const b = root.querySelector('#btn-continue');
    if (b) b.disabled = !has;
  });

  bindActions(root, {
    continue: async () => {
      try { await ctx.load(); } catch (e) { ctx.confirm(e.message, { cancel: null }); }
    },
    new: async () => {
      if (await ctx.hasSave() && !(await ctx.confirm(
        'Starting a new career will replace your saved career in this browser once you start. Export it first if you want to keep it.',
        { ok: 'Continue', cancel: 'Cancel' }))) return;
      ctx.go('newgame');
    },
    import: () => ctx.importSave(),
  });
}
