// Talking to a player about his morale, and the assistant manager's advice.

import { moraleOf, moraleLevel, moraleReasons, personalityOf, PERSONALITY_LABEL, PERSONALITY_INFO, expectedRoles, ROLE_TEXT,
  promisePlayingTime, refuseRequest, encourage, squadMorale, PROMISE_MATCHES, PROMISE_STARTS } from '../../core/morale.js';
import { listPlayer } from '../../core/transfers.js';
import { assistantAdvice } from '../../core/assistant.js';
import { moraleBadge } from './playercard.js';
import { esc } from '../util.js';

// Opens a modal whose buttons carry data-ta="<key>"; resolves with the key clicked (or null).
async function modalWithActions(ctx, html, title) {
  let action = null;
  const done = ctx.modal(`<div data-talk>${html}</div>`, { title });
  const node = document.querySelector('[data-talk]');
  node.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ta]');
    if (!b) return;
    action = b.dataset.ta;
    node.closest('.modal-bg').querySelector('[data-close]').click();
  });
  await done;
  return action;
}

export async function talkTo(ctx, playerId) {
  const g = ctx.game;
  const p = g.players[playerId];
  if (!p) return;
  const club = g.clubs[g.userClubId];
  const m = p.mood;
  const v = moraleOf(p);
  const pers = personalityOf(p);
  const role = expectedRoles(g, club)[p.id];
  const reasons = moraleReasons(g, p);
  const status = m?.request ? `<p class="bad" style="margin:10px 0 0">${esc(p.last)} has asked to leave the club.</p>`
    : m?.promise ? `<p class="muted" style="margin:10px 0 0">You promised him playing time: ${m.promise.starts} of ${PROMISE_STARTS} starts in ${m.promise.matches} of ${PROMISE_MATCHES} matches.</p>` : '';
  const btn = (key, label, title = '') => `<button class="btn btn-small btn-blue" data-ta="${key}" title="${esc(title)}">${label}</button>`;
  const html = `
    <div class="fin-list" style="grid-template-columns:150px 1fr">
      <span>Morale</span><b>${moraleBadge(p)}</b>
      <span>Personality</span><b>${PERSONALITY_LABEL[pers]}</b>
      <span>His place in the squad</span><b>${ROLE_TEXT[role] || '-'}</b>
    </div>
    <p class="muted" style="margin:8px 0 0;white-space:normal">${PERSONALITY_INFO[pers]}</p>
    <h2 style="margin:14px 0 4px;font-size:15px">What's on his mind</h2>
    <ul class="advice">${reasons.length ? reasons.map((r) => `<li class="${r.v > 0 ? 'good' : 'warn'}">${r.text} (${r.v > 0 ? '+' : ''}${r.v})</li>`).join('')
      : '<li class="info">Nothing in particular.</li>'}</ul>
    ${status}
    <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
      ${btn('encourage', 'Encourage him', 'A short talk: a small boost, once a month')}
      ${!m?.promise && (m?.request || v < 60) ? btn('promise', 'Promise playing time', `He expects ${PROMISE_STARTS} starts in the next ${PROMISE_MATCHES} matches. Breaking it makes things much worse.`) : ''}
      ${m?.request ? btn('list', 'Put him up for sale', 'Accept his request: transfer list at his market value') : ''}
      ${m?.request ? btn('refuse', 'Refuse the request', 'He stays, but he will not like it') : ''}
    </div>`;
  const a = await modalWithActions(ctx, html, `${p.first} ${p.last}`);
  let r = null;
  if (a === 'encourage') r = encourage(g, p.id);
  else if (a === 'promise') r = promisePlayingTime(g, p.id);
  else if (a === 'refuse') r = refuseRequest(g, p.id);
  else if (a === 'list') {
    listPlayer(g, p.id, p.value);
    r = { message: `${p.last} is on the transfer list at ${p.value.toLocaleString('en-US')} €.` };
  }
  if (r) ctx.toast(r.message);
}

export async function showAdvice(ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const adv = assistantAdvice(g);
  const sm = Math.round(squadMorale(g, club));
  const html = `
    <p class="muted" style="margin:0 0 8px">${adv.name ? `${esc(adv.name)} ${'★'.repeat(adv.stars)}` : 'No assistant manager'} · squad morale
      <b class="${moraleLevel(sm)[2]}">${moraleLevel(sm)[1]} (${sm})</b></p>
    <ul class="advice">${adv.items.map((i) => `<li class="${i.tone}">${esc(i.text)}</li>`).join('')}</ul>
    ${adv.stars && adv.stars < 5 ? `<p class="hint" style="margin-top:10px">A better assistant notices more: ${adv.stars < 2 ? 'better players left out, ' : ''}${adv.stars < 3 ? 'unhappy players and workload, ' : ''}${adv.stars < 4 ? 'the next opponent, ' : ''}tactics for the match.</p>` : ''}`;
  await ctx.modal(html, { title: 'Assistant manager' });
}
