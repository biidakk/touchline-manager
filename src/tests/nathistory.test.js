import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { NAT_HISTORY, honours, allTimeScorers } from '../core/nathistory.js';

test('national team history: all-time caps and goals, real titles and scorers joined with the career', () => {
  const w = generateWorld({ seed: 'nat-history' });
  const g = startCareer(w, w.competitions['CZE-L1'].clubIds[0], 'Hist');
  simulateRestOfSeason(g);
  const team = g.national.teams['NT-CZE'];
  // Every senior goal and cap of the season is in the team's own book.
  const fx = Object.values(g.fixtures).filter((f) => f.result && g.competitions[f.compId].level === 'senior'
    && (f.homeId === team.id || f.awayId === team.id));
  const goals = fx.reduce((a, f) => a + f.result.goals.filter((x) => (x.side === 0 ? f.homeId : f.awayId) === team.id).length, 0);
  const book = Object.values(team.allTime);
  assertEq(book.reduce((a, e) => a + e.goals, 0), goals, 'goals in the all-time book');
  assert(book.every((e) => e.caps > 0 && e.name), 'caps and names kept');
  // A real record holder who also plays in the game: the goals are added up.
  const [id, e] = Object.entries(team.allTime).sort((a, b) => b[1].goals - a[1].goals)[0];
  const saved = NAT_HISTORY.CZE;
  NAT_HISTORY.CZE = { euro: { won: [1976] }, scorers: [{ name: 'Old Legend', goals: 55, caps: 91, active: false }, { name: e.name, goals: 20, caps: 40, active: true }] };
  try {
    const rows = allTimeScorers(g, team);
    assertEq(rows[0].name, 'Old Legend');
    const me = rows.find((r) => r.name === e.name);
    assertEq(me.goals, 20 + e.goals, 'real goals plus career goals');
    assertEq(me.id, id);
    // The player retires: he stays in the list.
    delete g.players[id];
    assert(allTimeScorers(g, team).some((r) => r.name === e.name && !r.active), 'retired players stay');
    assertEq(honours(g, team).euro.won.join(), '1976');
  } finally {
    if (saved) NAT_HISTORY.CZE = saved; else delete NAT_HISTORY.CZE;
  }
  info(`Czech Republic: ${fx.length} senior internationals, ${goals} goals, top scorer this season ${e.name} (${e.goals})`);
});
