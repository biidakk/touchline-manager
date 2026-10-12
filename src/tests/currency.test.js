import { test, assert, assertEq } from './harness.js';
import { currencyOf, money, moneyShort, toShown, toEuros } from '../core/currency.js';

const fake = (nationId, currency) => ({ settings: currency ? { currency } : {}, userClubId: 'c', clubs: { c: { nationId } } });

test('money is shown in the chosen currency: the club\'s by default, or euros or pounds', () => {
  assertEq(currencyOf(fake('ENG')), 'GBP', 'English club');
  assertEq(currencyOf(fake('ESP')), 'EUR', 'Spanish club');
  assertEq(currencyOf(fake('CZE')), 'CZK', 'Czech club');
  assertEq(currencyOf(fake('CZE', 'GBP')), 'GBP', 'setting: pounds');
  assertEq(currencyOf(fake('ENG', 'EUR')), 'EUR', 'setting: euros');
  assertEq(currencyOf(null), 'EUR', 'no career yet');
  assertEq(money(fake('ESP'), 1234567), '1,234,567 €');
  assertEq(money(fake('ENG'), 1000000), '£860,000');
  assertEq(moneyShort(fake('ENG'), 2.5e6), '£2.15M');
  assertEq(moneyShort(fake('CZE'), 2e6), '49.0M Kč');
  assert(moneyShort(fake('IRN'), 4e6).endsWith('B toman'), 'Iran in billions of toman');
  assertEq(money(fake('ESP'), -5000), '−5,000 €', 'debts');
  // Typed amounts come back to the same euros.
  const g = fake('POL');
  assertEq(Math.round(toEuros(g, toShown(g, 3500000))), 3500000);
});
