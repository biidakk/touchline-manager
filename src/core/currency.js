// Money is kept in euros everywhere in the game; this only changes how it is
// shown. The user picks euros, pounds or the currency of the club he manages
// (game.settings.currency: 'club' (default), 'EUR' or 'GBP').
//
// Rates are fixed approximations (units per euro, autumn 2026). Iran uses the
// toman (10 rials), the unit prices are usually quoted in.

export const CURRENCIES = {
  EUR: { symbol: '€', rate: 1, after: true },
  GBP: { symbol: '£', rate: 0.86 },
  CZK: { symbol: 'Kč', rate: 24.5, after: true },
  PLN: { symbol: 'zł', rate: 4.25, after: true },
  DKK: { symbol: 'kr.', rate: 7.46, after: true },
  NOK: { symbol: 'kr', rate: 11.6, after: true },
  SEK: { symbol: 'kr', rate: 11.1, after: true },
  CHF: { symbol: 'CHF', rate: 0.94, after: true },
  TRY: { symbol: '₺', rate: 47 },
  ILS: { symbol: '₪', rate: 4.1 },
  HUF: { symbol: 'Ft', rate: 395, after: true },
  UAH: { symbol: '₴', rate: 47 },
  RSD: { symbol: 'din.', rate: 117, after: true },
  RON: { symbol: 'lei', rate: 5.05, after: true },
  IRT: { symbol: 'toman', rate: 120000, after: true },
};

const BY_NATION = {
  ENG: 'GBP', SCO: 'GBP', CZE: 'CZK', POL: 'PLN', DEN: 'DKK', NOR: 'NOK', SWE: 'SEK', SUI: 'CHF', TUR: 'TRY',
  ISR: 'ILS', HUN: 'HUF', UKR: 'UAH', SRB: 'RSD', ROU: 'RON', IRN: 'IRT',
};

export const nationCurrency = (nationId) => BY_NATION[nationId] || 'EUR';

// The currency in use: the setting, or the user's club's country.
export function currencyOf(game) {
  const set = game?.settings?.currency || 'club';
  if (set !== 'club' && CURRENCIES[set]) return set;
  const club = game?.clubs?.[game.userClubId];
  return nationCurrency(club?.nationId);
}

const cur = (game) => CURRENCIES[currencyOf(game)];
const place = (c, text) => (c.after ? `${text} ${c.symbol}` : `${c.symbol}${text}`);

// Euros -> the amount shown, and back (for typed prices and bids).
export const toShown = (game, eur) => eur * cur(game).rate;
export const toEuros = (game, shown) => shown / cur(game).rate;
export const currencySymbol = (game) => cur(game).symbol;

// 1234567 -> '£1,061,728' or '1,234,567 €'.
export function money(game, eur) {
  const c = cur(game);
  const v = Math.round(eur * c.rate);
  const text = Math.abs(v).toLocaleString('en-US');
  return (v < 0 ? '−' : '') + place(c, text);
}

// 1234567 -> '£1.06M', '1.23M €', '148B toman'.
export function moneyShort(game, eur) {
  const c = cur(game);
  const n = eur * c.rate;
  const a = Math.abs(n);
  let text;
  if (a >= 1e9) text = `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  else if (a >= 1e6) text = `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  else if (a >= 1e3) text = `${Math.round(n / 1e3)}k`;
  else text = `${Math.round(n)}`;
  return place(c, text);
}
