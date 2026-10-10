import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, playUserMatchInstant, simulateRestOfSeason, seasonComplete } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { confidence, boardReasons, takeJob, applyForJob, declineOffer, jobInterest, resign } from '../core/board.js';
import { syncSkill } from '../core/attributes.js';
import { ROLES } from '../core/training.js';
import { startAcademy } from '../core/development.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed, comp, idx) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Boss');
}

test('a new manager starts with the board\'s patience and a target', () => {
  const g = career('board1', 'ENG-L1', 2);
  const m = g.manager;
  assertEq(confidence(g), 62, 'start confidence (50 + time for a new manager)');
  assert(m.target && m.target.text, 'season target');
  assertBetween(m.reputation, 15, 75, 'manager reputation');
  assertEq(m.stints.length, 1, 'first club');
  assert(boardReasons(g).some((r) => r.v > 0), 'reason for the patience');
});

test('a normal season keeps the manager in his job', () => {
  const lines = [];
  let sacked = 0;
  for (const [seed, comp, idx] of [['board2', 'ENG-L1', 4], ['board3', 'GER-L1', 10], ['board4', 'CZE-L2', 8]]) {
    const g = career(seed, comp, idx);
    const target = g.manager.target.text;
    simulateRestOfSeason(g);
    if (g.manager.sacked) { sacked++; lines.push(`${seed}: sacked mid-season`); continue; }
    const s = endSeason(g);
    if (s.user.sacked) sacked++;
    lines.push(`${g.clubs[s.user.clubId].short} [${target.toLowerCase()}] ${s.user.pos}. -> confidence ${s.user.board.confidence}${s.user.sacked ? ' (sacked)' : ''}, reputation ${g.manager.reputation}`);
    if (s.user.board.met) assert(s.user.board.confidence >= 40, 'target met but the board is unhappy');
  }
  info(`Board after one season (auto lineups): ${lines.join('; ')}`);
  assert(sacked <= 1, 'too many sackings in normal seasons');
});

test('a hopeless team gets the manager sacked, and he finds a new club', () => {
  const g = career('board5', 'ENG-L1', 0);
  startAcademy(g);
  const old = g.clubs[g.userClubId];
  // Wreck the title favourites: the board still expects the title.
  for (const id of old.squad) {
    const p = g.players[id];
    p.tec = Math.max(10, p.tec - 30);
    p.phy = Math.max(10, p.phy - 30);
    syncSkill(p);
  }
  old.scouting.reports.someone = { year: g.season.year, lo: 50, hi: 60 };
  let ultimatum = false;
  let matches = 0;
  for (let i = 0; i < 400 && !seasonComplete(g) && !g.manager.sacked; i++) {
    const f = startDay(g);
    if (!f) continue;
    playUserMatchInstant(g, f);
    matches++;
    if (g.news.some((n) => n.kind === 'board' && n.text.includes('ultimatum'))) ultimatum = true;
  }
  const m = g.manager;
  assert(m.sacked, 'not sacked');
  info(`Sacked after ${matches} matches: ${m.sacked.why}; ${m.offers.length} offers: ${m.offers.map((o) => `${g.clubs[o.clubId].name} (${g.clubs[o.clubId].reputation})`).join(', ')}`);
  assert(ultimatum, 'no ultimatum before the sack');
  assertEq(m.stints[0].end, 'sacked');
  assert(m.offers.length >= 3, 'offers after the sack');
  assert(!declineOffer(g, m.offers[0].clubId).ok || m.offers.length >= 2, 'keeps an offer');

  const academy = old.youth.slice();
  const newId = m.offers[0].clubId;
  const r = takeJob(g, newId);
  assert(r.ok, r.message);
  const club = g.clubs[newId];
  assertEq(g.userClubId, newId);
  assert(!m.sacked, 'still sacked');
  // The old club is the AI's now.
  assert(!old.staff && !old.training && !old.scouting, 'old club keeps user staff');
  assertEq(old.youth.length, 0, 'old academy');
  for (const id of academy) assert(old.squad.includes(id) || !g.players[id], 'academy player left dangling');
  assert(academy.some((id) => old.squad.includes(id)), 'no academy player joined the first team');
  for (const id of old.squad) assert(!g.players[id].mood, 'old players keep a mood');
  // The new club is set up for the user; scouting knowledge travels with him.
  for (const role of ROLES) assert(club.staff[role], `no ${role}`);
  assert(club.youth.length > 0, 'new academy');
  assert(club.scouting.reports.someone, 'scouting reports lost');
  assertEq(confidence(g) >= 50, true, 'a fresh start');
  assertEq(m.stints.length, 2);
  // The season goes on and ends normally.
  simulateRestOfSeason(g);
  const s = endSeason(g);
  assertEq(s.user.clubId, newId);
  assertEq(m.history.at(-1).clubName, club.name);
  const back = deserialize(serialize(g));
  assertEq(back.userClubId, newId);
  assertEq(back.manager.stints.length, 2);
});

test('clubs approach managers of their level; applications depend on reputation', () => {
  assertEq(jobInterest(40, 70), 0, 'a big club ignores a small name');
  assert(jobInterest(60, 55) > jobInterest(60, 20), 'clubs of his level are keener');
  const g = career('board6', 'GER-L2', 6);
  const m = g.manager;
  const clubs = Object.values(g.clubs).filter((c) => c.id !== g.userClubId).sort((a, b) => b.reputation - a.reputation);
  const big = clubs[0];
  const small = clubs.at(-1);
  g.jobs.push({ clubId: big.id, day: g.day, expires: g.day + 30, why: 'test' }, { clubId: small.id, day: g.day, expires: g.day + 30, why: 'test' });
  m.reputation = 30;
  const r1 = applyForJob(g, big.id);
  assert(!r1.ok && r1.message.includes('experienced'), 'a top club hires an unknown');
  assert(!applyForJob(g, big.id).ok, 'applied twice');
  m.reputation = 70;
  // A well-known manager is (almost always) welcome at a small club.
  const r2 = applyForJob(g, small.id);
  info(`Applications: ${big.name} (${big.reputation}) -> "${r1.message}"; ${small.name} (${small.reputation}) -> "${r2.message}"`);
  if (r2.ok) {
    assert(m.offers.some((o) => o.clubId === small.id), 'offer recorded');
    assert(takeJob(g, small.id).ok, 'take the job');
    assertEq(g.userClubId, small.id);
  }
  // Resigning leaves the manager out of work with offers to choose from.
  const r3 = resign(g);
  assert(r3.ok, r3.message);
  assert(m.sacked && m.offers.length >= 3, 'offers after resigning');
});

test('old saves get a board and a career record', () => {
  const g = career('board7', 'CZE-L1', 3);
  delete g.manager.board;
  delete g.manager.stints;
  delete g.manager.offers;
  delete g.manager.reputation;
  delete g.manager.target;
  delete g.jobs;
  g.manager.history = [{ year: 2024, p: 30, w: 15, d: 8, l: 7, trophies: ['Cup'] }];
  g.version = 8;
  const back = deserialize(serialize(g));
  assert(back.manager.board, 'board');
  assertEq(back.manager.stints[0].w, 15, 'wins carried over');
  assert(Array.isArray(back.jobs), 'jobs');
  assertBetween(confidence(back), 40, 80, 'confidence');
});
