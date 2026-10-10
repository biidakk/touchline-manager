import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, playUserMatchInstant, simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { executeTransfer } from '../core/transfers.js';
import { markSkillChange, tickSkillMarks } from '../core/attributes.js';
import { welcomeByFederations, nationalRequirement } from '../core/nationaljob.js';
import { resign } from '../core/board.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed, comp = 'ENG-L1', idx = 4) {
  const w = generateWorld({ seed });
  const g = startCareer(w, w.competitions[comp].clubIds[idx], 'Historian');
  g.manager.board.standing = 100; // keep the job: these tests are about records
  return g;
}

function playDays(g, n) {
  for (let i = 0; i < n; i++) {
    const f = startDay(g);
    if (f) playUserMatchInstant(g, f);
  }
}

test('a skill change stays marked for the club\'s next two matches', () => {
  const g = career('marks');
  const club = g.clubs[g.userClubId];
  const p = g.players[club.squad[0]];
  p.skill += 1;
  markSkillChange(p, p.skill - 1);
  assertEq(p.chg.dir, 1, 'marked up');
  tickSkillMarks(g, club);
  assertEq(p.chg.n, 1, 'one match later');
  tickSkillMarks(g, club);
  assert(!p.chg, 'gone after two matches');
  markSkillChange(p, p.skill + 1);
  assertEq(p.chg.dir, -1, 'marked down');
  // Matches tick the marks (training may add new ones along the way).
  const marked = () => club.squad.filter((id) => g.players[id].chg).length;
  const games = () => Object.values(g.fixtures).filter((f) => f.result && (f.homeId === club.id || f.awayId === club.id)).length;
  let seen = 0;
  for (let i = 0; i < 60 && games() < 3; i++) { playDays(g, 1); seen = Math.max(seen, marked()); }
  assert(seen > 0, 'training never changed anyone\'s skill');
  info(`Skill marks: up to ${seen} players of ${club.squad.length} marked at once over the first matches`);
});

test('players keep a row per club per season, with goals and assists; clubs keep records', () => {
  const g = career('records');
  playDays(g, 120);
  // Move a regular scorer mid-season: his season splits into two rows.
  const scorer = Object.values(g.players).filter((p) => p.clubId && p.clubId !== g.userClubId && p.spell?.goals >= 2 && !p.loan)
    .sort((a, b) => b.spell.goals - a.spell.goals)[0];
  assert(scorer, 'no scorer found');
  const oldClub = scorer.clubId;
  const buyer = Object.values(g.clubs).find((c) => c.id !== oldClub && c.id !== g.userClubId && c.nationId !== g.clubs[oldClub].nationId);
  const goalsBefore = scorer.spell.goals;
  executeTransfer(g, scorer.id, buyer.id, 1e6, { years: 3 });
  simulateRestOfSeason(g);
  const year = g.season.year;
  endSeason(g);
  const rows = scorer.history.filter((h) => h[0] === year);
  if (g.players[scorer.id]) {
    assertEq(rows[0][1], oldClub, 'first spell at the old club');
    assertEq(rows[0][3], goalsBefore, 'goals at the old club');
    assert(rows.length === 1 || rows[1][1] === buyer.id, 'second spell at the new club');
    assertEq(rows[0].length, 6, 'row has assists');
  }
  const club = g.clubs[oldClub];
  const rec = club.records;
  assert(rec && Object.keys(rec.players).length >= 15, 'all-time list');
  assert(rec.players[scorer.id].goals >= goalsBefore, 'the departed scorer stays in the club records');
  assert(rec.seasons.length && rec.seasons[0].goals >= 1, 'best season');
  assert(rec.wins.league && rec.wins.league.gf > rec.wins.league.ga, 'biggest league win');
  assert(rec.crowd && rec.crowd.n > 0, 'record crowd');
  const top = Object.values(rec.players).sort((a, b) => b.goals - a.goals)[0];
  info(`${club.name}: top scorer ${top.name} ${top.goals}, best season ${rec.seasons[0].name} ${rec.seasons[0].goals}, biggest win ${rec.wins.league.gf}:${rec.wins.league.ga} vs ${rec.wins.league.opp}, crowd ${rec.crowd.n}`);
  // Total assists add up across all players.
  const assists = Object.values(g.players).reduce((a, p) => a + (p.history || []).filter((h) => h[0] === year).reduce((x, h) => x + h[5], 0), 0);
  assert(assists > 1000, 'assists recorded');

  // National teams.
  const eng = g.national.teams['NT-ENG'];
  assert(eng.records && Object.values(eng.records.players).some((p) => p.goals > 0), 'national scorers');
  assert(eng.records.wins.intl || eng.records.defeat, 'national results');

  // World awards.
  const w = g.history.world.at(-1);
  assertEq(w.year, year);
  assertEq(w.ballonDor.length, 3, 'Ballon d\'Or podium');
  assertEq(w.goldenShoe.length, 3, 'Golden Shoe podium');
  assert(w.goldenShoe[0].points >= w.goldenShoe[1].points, 'Golden Shoe order');
  const winner = g.players[w.ballonDor[0].playerId];
  if (winner) assert(winner.awards.some((a) => a.name === "Ballon d'Or" && a.year === year), 'award on the player');
  info(`Ballon d'Or ${year}: ${w.ballonDor.map((e) => `${e.name} (${e.clubName}, ${e.pos}, ${e.goals}g ${e.assists}a, avg ${e.avg})`).join(' · ')}; Golden Shoe: ${w.goldenShoe.map((e) => `${e.name} ${e.goals}g/${e.points}pts`).join(', ')}`);

  // Everything survives a save.
  const back = deserialize(serialize(g));
  assertEq(JSON.stringify(back.clubs[oldClub].records), JSON.stringify(rec));
  assertEq(back.history.world.length, 1);
});

test('national teams approach a club manager only when he is doing well, or out of work', () => {
  const g = career('natoffers');
  g.manager.board.standing = 0; // a new manager, nothing proven yet
  assert(!welcomeByFederations(g), 'an unproven manager in a job is approached');
  g.manager.board.standing = 20;
  assert(welcomeByFederations(g), 'a manager whose board is delighted is not approached');
  g.manager.board.standing = 0;
  // Out of work: open vacancies may call at once.
  g.manager.reputation = 90;
  g.national.jobs = Object.keys(g.national.teams).map((teamId) => ({ teamId, day: g.day, expires: g.day + 100 }));
  assert(nationalRequirement(g, 'NT-CZE') <= 90, 'requirement');
  assert(resign(g).ok, 'resign');
  assert(welcomeByFederations(g), 'out of work and not welcome');
  const offered = g.national.jobs.filter((j) => j.offered).length;
  assert(offered >= 1, 'no federation called the out-of-work manager');
  info(`After resigning: ${offered} of ${g.national.jobs.length} national vacancies made an offer`);
});

test('old saves get records from now on, with this season\'s stats kept', () => {
  const g = career('oldrec');
  playDays(g, 60);
  const p = Object.values(g.players).find((x) => x.spell?.apps >= 3);
  // Make it look like a v12 save: no spells, no records.
  for (const x of Object.values(g.players)) { delete x.spell; delete x.stats.career.assists; }
  for (const c of Object.values(g.clubs)) delete c.records;
  g.version = 12;
  const m = deserialize(serialize(g));
  const q = m.players[p.id];
  assertEq(q.spell.apps, q.stats.season.apps, 'season so far becomes the first spell');
  assertEq(q.spell.clubId, q.clubId);
  assertBetween(q.stats.career.assists, 0, 1000, 'career assists');
});
