import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { NAT_IDS, nationalTable, nationalScorers } from '../core/national.js';
import { weekday } from '../core/calendar.js';
import { serialize, deserialize } from '../core/save.js';

const w = generateWorld({ seed: 'nations-test' });
const g = startCareer(w, w.competitions['ENG-L1'].clubIds[1], 'Intl');

test('senior and U21 Nations Championships: 6 teams, home and away, on Thursdays', () => {
  for (const compId of Object.values(NAT_IDS)) {
    const comp = g.competitions[compId];
    assertEq(comp.clubIds.length, 6, `${comp.name} teams`);
    const fx = comp.fixtureIds.map((id) => g.fixtures[id]);
    assertEq(fx.length, 30, `${comp.name} fixtures`);
    assert(fx.every((f) => weekday(f.day) === 4), 'international not on a Thursday');
    const pairs = new Set(fx.map((f) => f.homeId + '>' + f.awayId));
    assertEq(pairs.size, 30, 'every pairing home and away');
  }
  // The Continental League and Conference play on Thursdays too, but never in international weeks.
  const natDays = new Set(Object.values(g.fixtures).filter((f) => g.competitions[f.compId].type === 'national').map((f) => f.day));
  const clash = Object.values(g.fixtures).find((f) => g.competitions[f.compId].type !== 'national' && natDays.has(f.day));
  assert(!clash, `a club match on an international Thursday (${clash?.compId})`);
});

test('a season of internationals: call-ups, caps, tables and champions', () => {
  simulateRestOfSeason(g);
  const senior = g.competitions[NAT_IDS.senior];
  const u21 = g.competitions[NAT_IDS.u21];
  for (const comp of [senior, u21]) {
    assert(comp.fixtureIds.every((id) => g.fixtures[id].result), `${comp.name} unplayed fixtures`);
    const rows = nationalTable(g, comp);
    assert(rows.every((r) => r.p === 10), 'each team plays 10');
  }
  // Squads: right nationality and age, nobody in both.
  for (const t of Object.values(g.national.teams)) {
    assertBetween(t.squad.length, 11, 23, `${t.name} squad size`);
    for (const id of t.squad) {
      const p = g.players[id];
      if (!p) continue;
      assertEq(p.nationId, t.nationId, 'nationality');
      if (t.level === 'u21') assert(g.season.year - p.birthYear <= 21, 'U21 age');
    }
  }
  const sen = g.national.teams['NT-ENG'];
  const young = g.national.teams['NT-ENG-21'];
  assert(!sen.squad.some((id) => young.squad.includes(id)), 'a player in both senior and U21 squads');
  const caps = Object.values(g.players).reduce((a, p) => a + (p.intl ? p.intl.caps : 0), 0);
  const apps = senior.fixtureIds.length * 2 * 11;
  assertBetween(caps, apps, apps * 1.5, 'caps (starters plus substitutes)');
  const goals = senior.fixtureIds.reduce((a, id) => a + g.fixtures[id].result.h + g.fixtures[id].result.a, 0);
  const top = nationalScorers(g, NAT_IDS.senior)[0];
  info(`Nations Championship: ${g.national.teams[nationalTable(g, senior)[0].clubId].name} top, ${(goals / senior.fixtureIds.length).toFixed(2)} goals/game, top scorer ${g.players[top.id].last} (${top.goals}); U21 winner ${g.national.teams[nationalTable(g, u21)[0].clubId].name}`);
  const s = endSeason(g);
  assertEq(s.national.length, 2, 'both championships recorded');
  assertEq(senior.history.length, 1);
  assertEq(senior.fixtureIds.length, 30, 'next season scheduled');
});

test('an old save gets national teams from its next season', () => {
  const old = generateWorld({ seed: 'old-nat' });
  delete old.national;
  for (const id of Object.values(NAT_IDS)) {
    for (const f of old.competitions[id].fixtureIds) delete old.fixtures[f];
    delete old.competitions[id];
  }
  old.version = 5;
  const m = deserialize(serialize(old));
  assert(m.national && m.competitions.NAT, 'created by the migration');
  startCareer(m, m.competitions['GER-L1'].clubIds[0], 'Old');
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over');
  endSeason(m);
  assertEq(m.competitions.NAT.fixtureIds.length, 30, 'scheduled for the new season');
});
