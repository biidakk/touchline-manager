// Small formatting and DOM helpers for the UI layer.

import { money, moneyShort } from '../core/currency.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Money (kept in euros) in the currency the player chose (core/currency.js).
// The app tells this module which career is loaded before each screen draws.
let moneyGame = null;
export const setMoneyGame = (game) => { moneyGame = game; };
export const fmtMoney = (n) => money(moneyGame, n);
export const fmtMoneyShort = (n) => moneyShort(moneyGame, n);

export const fmt1 = (n) => n.toFixed(1);

// Wires every [data-action] element inside root to handlers[action](el, event).
export function bindActions(root, handlers) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (fn) fn(el, e);
  });
}

export const playerName = (p) => `${p.first[0]}. ${p.last}`;
export const fullName = (p) => `${p.first} ${p.last}`;
