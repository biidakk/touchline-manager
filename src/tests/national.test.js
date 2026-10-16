import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason, advanceIntl, createFixtureMatch, finishUserMatch, startDay, playUserMatchInstant } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { NAT_IDS, TOURN_IDS, nationalTable, nationalStats, runningTournament } from '../core/national.js';
import { runToEnd } from '../core/engine.js';
import { weekday, dayOf } from '../core/calendar.js';
import { serialize, deserialize } from '../core/save.js';

const w = generateWorld({ seed: 'nations-test' });
const g = startCareer(w, w.competitions['ENG-L1'].clubIds[1], 'Intl');
const T = (id) => g.national.teams[id].name;

test('25 national teams: the Nations League and the U21 Euro qualifiers, on Thursdays', () => {
  const teams = Object.values(g.national.teams);
  assertEq(teams.filter((t) => t.level === 'senior').length, 25, 'senior teams');
  assert(!g.national.teams['NT-IRN'], 'Iran plays in Asia');
  const nl = g.competitions[NAT_IDS.senior];
  assertEq(nl.format, 'league');
  assertEq(nl.groups.map((x) => x.ids.length).join(), '5,5,5,5,5', 'Nations League groups');
  assert(nl.groups[0].ids.includes('NT-ENG') || nl.groups[1].ids.includes('NT-ENG'), 'the strongest in League A');
  const q = g.competitions[NAT_IDS.u21];
  assertEq(q.format, 'qual');
  assert(q.host && !q.groups.some((x) => x.ids.includes(q.host)), 'the hosts play no qualifiers');
  assertEq(q.groups.map((x) => x.ids.length).join(), '6,6,6,6', 'qualifying groups');
  for (const comp of [nl, q]) {
    const fx = comp.fixtureIds.map((id) => g.fixtures[id]);
    assert(fx.every((f) => weekday(f.day) === 4), 'international not on a Thursday');
    for (const gr of comp.groups) {
      const n = gr.ids.length;
      const games = fx.filter((f) => gr.ids.includes(f.homeId));
      assertEq(games.length, n * (n - 1), `${gr.name}: everyone home and away`);
    }
  }
  const natDays = new Set(Object.values(g.fixtures).filter((f) => g.competitions[f.compId].type === 'national').map((f) => f.day));
  const clash = Object.values(g.fixtures).find((f) => g.competitions[f.compId].type !== 'national' && natDays.has(f.day));
  assert(!clash, `a club match on an international Thursday (${clash?.compId})`);
});

test('a season of internationals: call-ups, the Nations League final and the U21 Euro in June', () => {
  const user = g.clubs[g.userClubId];
  simulateRestOfSeason(g);
  assertEq(g.season.phase, 'over');
  assert(g.day > dayOf(2027, 6, 30), 'the season ends after the finals');
  const nl = g.competitions[NAT_IDS.senior];
  const final = g.fixtures[nl.finalId];
  assert(final && final.result && nl.winnerId === final.result.winner, 'Nations League final');
  assert(nl.groups.filter((x) => x.league === 'A').some((x) => nationalTable(g, nl, x.ids)[0].clubId === final.homeId), 'League A winners in the final');
  const t = g.competitions[TOURN_IDS.u21];
  assertEq(t.clubIds.length, 16, 'U21 Euro finalists');
  assert(t.clubIds.includes(g.competitions[NAT_IDS.u21].host), 'the hosts are there');
  assertEq(t.rounds.map((r) => r.name).join(), 'Quarter-finals,Semi-finals,Final');
  assert(t.winnerId && t.fixtureIds.every((id) => g.fixtures[id].result), 'U21 Euro played');
  const ko = t.rounds.flatMap((r) => r.fixtureIds).map((id) => g.fixtures[id]);
  assert(ko.every((f) => f.result.winner && (f.result.h !== f.result.a || f.result.pens)), 'knockouts have a winner');
  // Squads: right nationality and age, nobody in both.
  for (const team of Object.values(g.national.teams)) {
    for (const id of team.squad) {
      const p = g.players[id];
      if (!p) continue;
      assertEq(p.nationId, team.nationId, 'nationality');
      if (team.level === 'u21') assert(g.season.year - p.birthYear <= 21, 'U21 age');
    }
  }
  const stats = nationalStats(g, t.id).sort((a, b) => b.goals - a.goals);
  const goals = t.fixtureIds.reduce((a, id) => a + g.fixtures[id].result.h + g.fixtures[id].result.a, 0);
  info(`${nl.name}: ${T(nl.winnerId)} beat ${T(final.homeId === nl.winnerId ? final.awayId : final.homeId)} in the final; ${t.name} (hosts ${T(t.hostId)}): ${T(t.winnerId)}, ${(goals / t.fixtureIds.length).toFixed(2)} goals/game, top scorer ${g.players[stats[0].id].last} (${stats[0].goals}), assists recorded ${stats.reduce((a, s) => a + s.assists, 0)}`);
  assertBetween(goals / t.fixtureIds.length, 1.6, 3.6, 'goals per game at the finals');
  const tired = Object.entries(t.apps).filter(([, n]) => n >= 3).map(([id]) => id);
  assert(user.finance.season.months <= 10, `no wages for June and July before the season is settled (${user.finance.season.months} months)`);
  const winner = t.winnerId;
  const s = endSeason(g);
  assert(s.national.some((x) => x.compId === t.id && x.championId === winner), 'U21 Euro in the summary');
  assertEq(t.history[0].championId, winner);
  assert(s.national.some((x) => x.compId === nl.id), 'Nations League in the summary');
  assertEq(t.history.length, 1);
  assert(t.history[0].topScorer, 'top scorer recorded');
  const p = g.players[tired.find((id) => g.players[id])];
  assert(p && p.fatigue > 0, 'back from the finals a little tired');
});

test('the Euro: qualifiers without the hosts, then the finals in June', () => {
  const q = g.competitions[NAT_IDS.senior];
  assertEq(q.format, 'qual', 'Euro 2028 qualifiers in 2027/28');
  assertEq(q.host, 'NT-ENG', 'England host Euro 2028');
  assertEq(q.groups.length, 4);
  const u21 = g.competitions[NAT_IDS.u21];
  assertEq(u21.format, 'league', 'the U21 Nations League');
  // Play on to the draw, then into the finals day by day, watching one match.
  simulateUntil(() => runningTournament(g)?.level === 'senior');
  const t = g.competitions[TOURN_IDS.senior];
  assertEq(t.name, 'Euro 2028');
  assertEq(t.groups[0].ids[0], 'NT-ENG', 'the hosts head group A');
  for (const gr of q.groups) {
    const rows = nationalTable(g, q, gr.ids);
    assert(rows.slice(0, 2).every((r) => t.clubIds.includes(r.clubId)), `the top two of ${gr.name} qualify`);
  }
  simulateUntil(() => !Object.values(g.fixtures).some((f) => !f.result && g.competitions[f.compId].type !== 'national'));
  const first = t.fixtureIds.map((id) => g.fixtures[id]).sort((a, b) => a.day - b.day)[0];
  const watch = t.fixtureIds.map((id) => g.fixtures[id]).find((f) => f.day === first.day && f.id !== first.id) || first;
  const f = advanceIntl(g, t.id, { watchId: watch.id });
  assertEq(f?.id, watch.id, 'the match to watch waits');
  assertEq(g.day, watch.day);
  assert(t.fixtureIds.map((id) => g.fixtures[id]).filter((x) => x.day === g.day && x.id !== f.id).every((x) => x.result), 'the rest of the day is played');
  const m = runToEnd(g, createFixtureMatch(g, f, { homeAI: true, awayAI: true }));
  finishUserMatch(g, f, m);
  g.watchId = null;
  assert(f.result.events?.length, 'a full report for the watched match');
  assertEq(f.neutral, f.homeId !== t.hostId, 'neutral ground except for the hosts');
  // Watching the next one, the app is closed mid-match: it is played out.
  const next = t.fixtureIds.map((id) => g.fixtures[id]).filter((x) => !x.result).sort((a, b) => a.day - b.day)[0];
  assertEq(advanceIntl(g, t.id, { watchId: next.id })?.id, next.id);
  advanceIntl(g, t.id);
  assert(next.result && !g.watchId, 'an abandoned match is played out');
  // Match day by match day to the final.
  for (let i = 0; i < 20 && !t.winnerId; i++) advanceIntl(g, t.id);
  assert(t.winnerId, 'Euro 2028 decided');
  assertEq(g.season.phase, 'over');
  info(`Euro 2028: ${T(t.winnerId)} win, ${T(t.runnerUpId)} runners-up; groups ${t.groups.map((x) => x.ids.map(T).join('/')).join(' | ')}`);
  const s = endSeason(g);
  assertEq(s.national[0].compId, t.id, 'the Euro first in the review');
  assertEq(g.competitions[NAT_IDS.senior].format, 'league', 'back to the Nations League');
  assertEq(g.competitions[NAT_IDS.u21].format, 'qual', 'U21 Euro 2029 qualifiers');
});

// Plays on day by day (the user's matches instantly) until done().
function simulateUntil(done) {
  for (let guard = 0; guard < 500 && !done(); guard++) {
    const f = startDay(g);
    if (f) playUserMatchInstant(g, f);
  }
  assert(done(), 'never got there');
}

test('an old save gets the new national teams and plays this season to the end', () => {
  const old = generateWorld({ seed: 'old-nat' });
  // A save from v16: six national teams and a 6-team championship.
  for (const id of Object.keys(old.national.teams)) {
    if (!['ENG', 'ESP', 'ITA', 'GER', 'FRA', 'CZE'].includes(old.national.teams[id].nationId)) delete old.national.teams[id];
  }
  for (const id of Object.values(NAT_IDS)) {
    const c = old.competitions[id];
    for (const f of c.fixtureIds) delete old.fixtures[f];
    Object.assign(c, { clubIds: Object.keys(old.national.teams).filter((x) => old.national.teams[x].level === c.level), fixtureIds: [], groups: undefined, format: undefined, table: {} });
    for (const t of c.clubIds) c.table[t] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
  }
  for (const id of Object.values(TOURN_IDS)) delete old.competitions[id];
  old.version = 16;
  const m = deserialize(serialize(old));
  assertEq(Object.values(m.national.teams).filter((t) => t.level === 'senior').length, 25, 'teams added');
  assert(m.competitions.EURO && m.competitions.EURO21, 'finals added');
  startCareer(m, m.competitions['GER-L1'].clubIds[0], 'Old');
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over');
  endSeason(m);
  assertEq(m.competitions.NAT.format, 'qual', 'Euro 2028 qualifiers from the new season');
  assertEq(m.competitions.NAT.groups.length, 4);
  assertEq(m.competitions.NAT21.groups.length, 5, 'the U21 Nations League');
});
