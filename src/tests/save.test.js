import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { serialize, deserialize } from '../core/save.js';
import { Rng } from '../core/rng.js';

test('save round-trip preserves the whole game', () => {
  const g = startCareer(generateWorld({ seed: 'save' }), 'c1', 'Saver');
  const text = serialize(g);
  const back = deserialize(text);
  assertEq(JSON.stringify(back), JSON.stringify(g));
  info(`Save size at season start: ${(text.length / 1024).toFixed(0)} KB`);
});

test('rng continues identically after a save round-trip', () => {
  const g = generateWorld({ seed: 'rng' });
  const back = deserialize(serialize(g));
  const a = new Rng(g.rng);
  const b = new Rng(back.rng);
  for (let i = 0; i < 50; i++) assertEq(a.next(), b.next());
});

test('invalid save files are rejected with a clear message', () => {
  const bad = ['not json', '{}', JSON.stringify({ format: 'touchline-save', game: { version: 999 } })];
  for (const text of bad) {
    let threw = false;
    try { deserialize(text); } catch (e) { threw = true; assert(e.message.length > 5, 'empty error'); }
    assert(threw, 'accepted bad save: ' + text.slice(0, 30));
  }
});
