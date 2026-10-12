import { test, assertEq, info } from './harness.js';
import * as storage from '../ui/storage.js';
import { generateWorld } from '../core/worldgen.js';
import { serialize, deserialize } from '../core/save.js';

// Fail with the step name instead of hanging forever.
const step = (name, promise, ms = 4000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out during: ${name}`)), ms)),
]);

test('IndexedDB save and load round-trip (compressed; old plain entries still load)', async () => {
  const g = generateWorld({ seed: 'idb' });
  const text = serialize(g);
  await step('put', storage.put('test-slot', text), 20000);
  const loaded = await step('get', storage.get('test-slot'), 20000);
  assertEq(loaded, text, 'text back unchanged');
  assertEq(deserialize(loaded).seed, g.seed);
  info(`Save: ${(text.length / 1024).toFixed(0)} KB of text`);
  // An entry written by an older version (a plain string) still loads.
  await step('put plain', new Promise((resolve, reject) => {
    const req = indexedDB.open('touchline-manager', 1);
    req.onsuccess = () => {
      const t = req.result.transaction('saves', 'readwrite');
      t.objectStore('saves').put('{"plain":true}', 'test-plain');
      t.oncomplete = () => { req.result.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  }));
  assertEq(await step('get plain', storage.get('test-plain')), '{"plain":true}', 'old plain entry');
  await step('remove plain', storage.remove('test-plain'));
  await step('remove', storage.remove('test-slot'));
  assertEq(await step('get after delete', storage.get('test-slot')), undefined, 'after delete:');
});
