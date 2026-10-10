// Small formatting and DOM helpers for the UI layer.

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const fmtMoney = (n) => `${Math.round(n).toLocaleString('en-US')} €`;

export function fmtMoneyShort(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M €`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}k €`;
  return `${Math.round(n)} €`;
}

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
