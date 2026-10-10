// Placeholder for screens that later milestones will add.

import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, bindActions } from '../util.js';

export function render(root, ctx, params = {}) {
  root.innerHTML = `${clubTopbar(ctx, { title: params.title || 'Coming soon' })}
  <div class="panel soon-box">
    <h2>${esc(params.title || 'Coming soon')}</h2>
    <p>This screen is planned for milestone ${params.milestone || '?'}.</p>
    <button class="btn btn-blue" data-action="back">Back</button>
  </div>`;
  bindTopbar(root, ctx);
  bindActions(root, { back: () => ctx.back() });
}
