// Shared top bar for club screens.

import { crest, flag, icon } from './svg.js';
import { esc } from '../util.js';
import { hasTip, showTip } from '../tips.js';

export function clubTopbar(ctx, { title = null, actions = true, center = '' } = {}) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const comp = g.competitions[club.compId];
  const nation = g.nations[club.nationId];
  return `<div class="topbar">
    ${crest(club.crest, 52)}
    <div>
      <div class="title">${esc(title || club.name)}</div>
      <div class="sub">${flag(nation.flag, 18)} ${esc(nation.name)}, ${esc(comp.name)}</div>
    </div>
    ${center}
    <div class="spacer"></div>
    ${hasTip(ctx.current?.name) ? '<button class="top-action top-help" data-top="help" title="What is on this screen?">?</button>' : ''}
    ${actions ? `
    <button class="top-action" data-top="save" title="Save to this browser">${icon('save')}Save</button>
    <button class="top-action" data-top="export" title="Download a save file">${icon('export')}Export</button>
    <button class="top-action" data-top="import" title="Load a save file">${icon('import')}Import</button>
    <button class="top-action" data-top="quit">${icon('power')}Quit</button>` : ''}
  </div>`;
}

export function bindTopbar(root, ctx) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-top]');
    if (!b) return;
    const a = b.dataset.top;
    if (a === 'help') showTip(ctx, ctx.current.name, { force: true });
    else if (a === 'save') ctx.save();
    else if (a === 'export') ctx.exportSave();
    else if (a === 'import') ctx.importSave();
    else if (a === 'quit') ctx.quit();
  });
}
