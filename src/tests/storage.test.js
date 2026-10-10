import { test, assertEq } from './harness.js';
import * as storage from '../ui/storage.js';
import { generateWorld } from '../core/worldgen.js';
import { serialize, deserialize } from '../core/save.js';

// Fail with the step name instead of hanging forever.
const step = (name, promise, ms = 4000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out during: ${name}`)), ms)),
]);

test('IndexedDB save and load round-trip', async () => {
  const g = generateWorld({ seed: 'idb' });
  await step('put', storage.put('test-slot', serialize(g)));
  const back = deserialize(await step('get', storage.get('test-slot')));
  assertEq(JSON.stringify(back), JSON.stringify(g));
  await step('remove', storage.remove('test-slot'));
  assertEq(await step('get after delete', storage.get('test-slot')), undefined, 'after delete:');
});
