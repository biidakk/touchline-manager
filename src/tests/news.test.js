import { test, assert, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { advanceToUserMatch, playUserMatchInstant } from '../core/matchday.js';

test('the news feed covers previews, results, leaders and the board', () => {
  const w = generateWorld({ seed: 'news' });
  const g = startCareer(w, w.competitions['ENG-L1'].clubIds[3], 'Reader');
  const seen = {};
  const all = [];
  const record = () => {
    for (const n of g.news) {
      if (seen[n.id]) continue;
      seen[n.id] = true;
      all.push(n);
    }
  };
  // Play into the new year (the board verdict comes on 1 January).
  const leaders = new Set();
  for (let i = 0; i < 40; i++) {
    const f = advanceToUserMatch(g);
    record();
    const lid = g.competitions[g.clubs[g.userClubId].compId].leaderId;
    if (lid) leaders.add(lid);
    if (f) playUserMatchInstant(g, f);
    record();
    if (g.stopReason) delete g.stopReason;
    if (g.day > g.season.start + 160) break;
  }
  const kinds = all.reduce((a, n) => ({ ...a, [n.kind]: (a[n.kind] || 0) + 1 }), {});
  info(`News items by kind over half a season: ${JSON.stringify(kinds)}`);
  for (const k of ['preview', 'result', 'league', 'board']) assert(kinds[k] > 0, `no "${k}" news`);
  // Only expect leader news if the leadership actually changed hands.
  if (leaders.size > 1) assert(all.some((n) => /top of the/.test(n.text)), 'no league-leader news');
  assert(all.length < 600, 'news feed too noisy');
});
