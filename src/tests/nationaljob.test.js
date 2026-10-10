import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { advanceToUserMatch, playUserMatchInstant, simulateRestOfSeason, isUserFixture } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { isNational, nationalCandidates } from '../core/national.js';
import { nationalRanking, nationalRequirement, applyNational, acceptNational, resignNational, managedTeam } from '../core/nationaljob.js';
import { isAvailable } from '../core/ai.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions['ENG-L1'].clubIds[3], 'Coach');
}

test('federations want managers of their level; U21 jobs are easier', () => {
  const g = career('nat1');
  const ranking = nationalRanking(g);
  const top = `NT-${ranking[0].nationId}`;
  const bottom = `NT-${ranking.at(-1).nationId}`;
  assert(nationalRequirement(g, top) > nationalRequirement(g, bottom), 'strongest nation is not the hardest job');
  assert(nationalRequirement(g, `${top}-21`) < nationalRequirement(g, top), 'U21 job is not easier');
  assertEq(g.national.jobs.length, 2, 'two vacancies at the start');
  info(`Requirements: ${ranking.map((r) => `${r.nationId} ${nationalRequirement(g, `NT-${r.nationId}`)}/${nationalRequirement(g, `NT-${r.nationId}-21`)}`).join(', ')}; manager reputation ${g.manager.reputation}`);
  // An unknown manager is turned down by the top federation.
  g.national.jobs.push({ teamId: top, day: g.day, expires: g.day + 50 });
  g.manager.reputation = 20;
  assert(!applyNational(g, top).ok, 'unknown manager got the top job');
});

test('the national team manager picks the squad, sets the tactics and plays the matches', () => {
  const g = career('nat2');
  const ranking = nationalRanking(g);
  const teamId = `NT-${ranking[1].nationId}`;
  g.national.jobs.push({ teamId, day: g.day, expires: g.day + 300, offered: true });
  assert(acceptNational(g, teamId).ok, 'accept');
  const team = managedTeam(g);
  assertEq(team.id, teamId);
  // Pick a squad with a surprise: a fringe player who would never be called up.
  const cands = nationalCandidates(g, team).filter(isAvailable).sort((a, b) => b.skill - a.skill);
  const fringe = cands.filter((p) => p.pos === 'M').at(-1);
  team.picks = [...cands.slice(0, 22).map((p) => p.id).filter((id) => id !== fringe.id).slice(0, 22), fringe.id];
  team.tactics.formation = '3-5-2';
  team.tactics.style = 'passing';

  let natF = null;
  let clubMatches = 0;
  for (let i = 0; i < 60 && !natF; i++) {
    const f = advanceToUserMatch(g);
    if (!f) continue;
    if (isNational(g, f)) { natF = f; break; }
    playUserMatchInstant(g, f);
    clubMatches++;
  }
  assert(natF, 'the calendar never stopped for the international');
  assert(isUserFixture(g, natF) && !natF.result, 'the international was played without the manager');
  const m = playUserMatchInstant(g, natF);
  assert(natF.result, 'no result');
  const mine = natF.homeId === teamId ? 0 : 1;
  assertEq(m.sides[mine].formation, '3-5-2', 'formation');
  assert(team.squad.includes(fringe.id) || !isAvailable(fringe), 'the picked fringe player was not called up');
  assert(natF.result.lineups, 'no full report for the user\'s international');
  assertEq(g.manager.national.p, 1, 'record');
  info(`After ${clubMatches} club matches: ${g.national.teams[natF.homeId].name} ${natF.result.h}:${natF.result.a} ${g.national.teams[natF.awayId].name} (${team.squad.length} called up, fringe pick ${fringe.last} skill ${fringe.skill} included)`);

  // The season ends with the federation's verdict.
  simulateRestOfSeason(g);
  const s = endSeason(g);
  assert(s.nationalJob, 'no national verdict');
  info(`Nations Championship: ${s.nationalJob.teamName} ${s.nationalJob.pos}. (${s.nationalJob.verdict}); record ${JSON.stringify(g.manager.national || g.manager.natHistory.at(-1))}`);
  if (s.nationalJob.verdict === 'sacked') assert(!g.manager.national && g.manager.natHistory.length === 1, 'dismissal not recorded');
  else assertEq(g.manager.national.teamId, teamId);
  const back = deserialize(serialize(g));
  assertEq(back.manager.national?.teamId ?? null, g.manager.national?.teamId ?? null, 'save');
  if (g.manager.national) {
    assert(resignNational(g).ok, 'resign');
    assertEq(g.manager.natHistory.at(-1).end, 'resigned');
  }
});

test('saves from before national team jobs are upgraded', () => {
  const g = career('nat3');
  delete g.national.jobs;
  delete g.manager.national;
  delete g.manager.natHistory;
  g.version = 9;
  const back = deserialize(serialize(g));
  assert(Array.isArray(back.national.jobs) && back.national.jobs.length === 2, 'vacancies');
  assertEq(back.manager.national, null);
});
