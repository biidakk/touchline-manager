import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, playUserMatchInstant, simulateRestOfSeason } from '../core/matchday.js';
import { moraleOf, moraleFactor, PERSONALITIES, promisePlayingTime, refuseRequest, expectedRoles, PROMISE_MATCHES } from '../core/morale.js';
import { contractTerms, renewContract } from '../core/transfers.js';
import { createMatch, runToEnd } from '../core/engine.js';
import { autoLineup } from '../core/ai.js';
import { youthIntake } from '../core/development.js';
import { assistantAdvice } from '../core/assistant.js';
import { serialize, deserialize } from '../core/save.js';
import { Rng } from '../core/rng.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Coach');
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// Plays the user's matches for `n` match days, calling `before(g)` ahead of each.
function playMatches(g, n, before = () => {}) {
  let played = 0;
  for (let i = 0; i < 400 && played < n && g.season.phase === 'season'; i++) {
    const f = startDay(g);
    if (!f) continue;
    before(g);
    playUserMatchInstant(g, f);
    played++;
  }
}
// Leaves a player out of the XI and the bench (a full bench of others, so
// the automatic lineup repair can't bring him back).
function dropFromTeam(g, club, id) {
  const l = club.lineup;
  const free = (x) => x !== id && !g.players[x].injuryDays && !g.players[x].suspension && !l.slots.includes(x) && !l.bench.includes(x);
  const i = l.slots.indexOf(id);
  if (i >= 0) {
    const sub = club.squad.filter(free).sort((a, b) => (g.players[b].pos === g.players[id].pos) - (g.players[a].pos === g.players[id].pos))[0];
    l.slots[i] = sub || null;
  }
  l.bench = l.bench.filter((x) => x !== id && !g.players[x].injuryDays && !g.players[x].suspension);
  for (const x of club.squad.filter(free)) if (l.bench.length < 7) l.bench.push(x);
}
// Puts a player in the XI in place of a team-mate in his position.
function startPlayer(g, club, id) {
  const l = club.lineup;
  const p = g.players[id];
  if (l.slots.includes(id) || p.injuryDays || p.suspension) return;
  const i = l.slots.findIndex((x) => x && g.players[x].pos === p.pos);
  if (i < 0) return;
  l.bench = l.bench.filter((x) => x !== id);
  l.slots[i] = id;
}

test('every player has a personality, the user squad a morale', () => {
  const g = career('pers');
  const ps = Object.values(g.players);
  for (const p of ps) assert(PERSONALITIES.includes(p.personality), 'personality');
  const share = (k) => ps.filter((p) => p.personality === k).length / ps.length;
  info(`Personalities: ${PERSONALITIES.map((k) => `${k} ${(share(k) * 100).toFixed(0)}%`).join(', ')}`);
  startDay(g);
  const club = g.clubs[g.userClubId];
  for (const id of club.squad) {
    const p = g.players[id];
    assert(p.mood, 'mood created');
    assertBetween(moraleOf(p), 40, 85, 'starting morale');
  }
});

test('a dropped starter gets unhappy and asks to leave; regulars stay content', () => {
  const g = career('benched');
  const club = g.clubs[g.userClubId];
  const roles = expectedRoles(g, club);
  const star = club.squad.map((id) => g.players[id]).filter((p) => roles[p.id] === 'starter' && p.pos !== 'G')[0];
  star.personality = 'ambitious';
  star.contractEnd = g.season.year + 3;
  const regular = club.lineup.slots.map((id) => g.players[id]).find((p) => p && p.id !== star.id && p.pos !== 'G');
  playMatches(g, 14, () => dropFromTeam(g, club, star.id));
  // A few more weeks without football.
  for (let i = 0; i < 45 && !star.mood.request; i++) { const f = startDay(g); if (f) { dropFromTeam(g, club, star.id); playUserMatchInstant(g, f); } }
  const parts = ['play', 'results', 'wage', 'status', 'events'].map((k) => `${k} ${Math.round(star.mood[k])}`).join(', ');
  info(`Dropped ambitious starter: morale ${moraleOf(star)} (${parts})${star.mood.request ? ', transfer request' : ''}; a regular starter: ${moraleOf(regular)}`);
  assert(moraleOf(star) < 35, 'the dropped starter should be unhappy');
  assert(star.mood.request, 'he should ask to leave');
  assert(moraleOf(regular) >= 50, 'a regular starter should be at least content');
  // Unhappy players won't talk about contracts.
  const r = renewContract(g, star.id, 2);
  assert(!r.ok, 'an unhappy player refuses a new contract');
  // Refusing the request makes it worse; a promise resets the request.
  const before = moraleOf(star);
  refuseRequest(g, star.id);
  assert(moraleOf(star) < before, 'refusing hurts');
});

test('a broken promise is worse than none; a kept one helps', () => {
  const g = career('promise');
  const club = g.clubs[g.userClubId];
  const roles = expectedRoles(g, club);
  const [a, b] = club.squad.map((id) => g.players[id])
    .filter((p) => p.pos !== 'G' && (roles[p.id] === 'rotation' || roles[p.id] === 'backup')).slice(0, 2);
  playMatches(g, 1);
  assert(promisePlayingTime(g, a.id).ok && promisePlayingTime(g, b.id).ok, 'promises made');
  // Keep the promise to a (start him), break it for b (leave him out).
  playMatches(g, PROMISE_MATCHES, () => {
    dropFromTeam(g, club, b.id);
    startPlayer(g, club, a.id);
  });
  info(`Promise kept: morale ${moraleOf(a)}; promise broken: ${moraleOf(b)}${b.mood.low >= 21 ? ' (asks to leave)' : ''}`);
  assert(moraleOf(a) > moraleOf(b) + 10, 'keeping a promise should beat breaking one');
  assert(!b.mood.promise && !a.mood.promise, 'promises resolved');
});

test('morale changes match strength by a few percent', () => {
  assertEq(moraleFactor({}), 1, 'players without a mood are neutral');
  const g = generateWorld({ seed: 'mood-engine' });
  const comp = g.competitions['ENG-L1'];
  const [home, away] = [g.clubs[comp.clubIds[5]], g.clubs[comp.clubIds[6]]];
  home.lineup = autoLineup(g, home);
  away.lineup = autoLineup(g, away);
  const run = (events) => {
    for (const id of home.squad) g.players[id].mood = { club: home.id, play: 0, results: 0, wage: 0, status: 0, events, low: 0 };
    let gd = 0;
    for (let i = 0; i < 400; i++) {
      const m = runToEnd(g, createMatch(g, { homeId: home.id, awayId: away.id }, { seed: 5000 + i }));
      gd += m.sides[0].goals - m.sides[1].goals;
    }
    return gd / 400;
  };
  const low = run(-45);
  const high = run(30);
  for (const id of home.squad) delete g.players[id].mood;
  info(`Goal difference per match: unhappy squad ${low.toFixed(2)}, delighted squad ${high.toFixed(2)}`);
  assert(high > low + 0.1, 'a happy squad should do better');
});

test('personality: loyal players sign cheaper, temperamental ones collect more cards', () => {
  const g = career('pers-contract');
  const p = g.players[g.clubs[g.userClubId].squad[3]];
  p.personality = 'loyal';
  const loyal = contractTerms(g, p).wage;
  p.personality = 'ambitious';
  const ambitious = contractTerms(g, p).wage;
  assert(ambitious > loyal * 1.1, `ambitious ${ambitious} vs loyal ${loyal}`);

  const w = generateWorld({ seed: 'cards' });
  const comp = w.competitions['ENG-L1'];
  const [home, away] = [w.clubs[comp.clubIds[2]], w.clubs[comp.clubIds[3]]];
  home.lineup = autoLineup(w, home);
  away.lineup = autoLineup(w, away);
  const xi = home.lineup.slots.filter((id) => w.players[id].pos !== 'G');
  xi.forEach((id, i) => { w.players[id].personality = i % 2 ? 'temperamental' : 'professional'; });
  const cards = { temperamental: 0, professional: 0 };
  for (let i = 0; i < 400; i++) {
    const m = runToEnd(w, createMatch(w, { homeId: home.id, awayId: away.id }, { seed: 7000 + i }));
    for (const e of m.events) if ((e.type === 'yellow' || e.type === 'red') && e.side === 0 && xi.includes(e.playerId)) cards[w.players[e.playerId].personality]++;
  }
  info(`Cards in 400 matches: temperamental players ${cards.temperamental}, professional ${cards.professional}`);
  assert(cards.temperamental > cards.professional * 1.25,'temperamental players should pick up more cards');
});

test('a good physio shortens injuries, a youth coach improves the intake', () => {
  const g = career('physio');
  const club = g.clubs[g.userClubId];
  const opp = g.clubs[g.competitions[club.compId].clubIds.find((id) => id !== club.id)];
  opp.lineup = autoLineup(g, opp);
  const days = (stars) => {
    club.staff.physio = stars ? { ...(club.staff.physio || {}), stars } : null;
    const out = [];
    for (let i = 0; i < 1500; i++) {
      const m = runToEnd(g, createMatch(g, { homeId: club.id, awayId: opp.id }, { seed: 300 + i }));
      out.push(...m.sides[0].injured.map((x) => x.days));
    }
    return mean(out);
  };
  const none = days(0);
  const best = days(5);
  info(`Average injury: no physio ${none.toFixed(1)} days, 5-star physio ${best.toFixed(1)} days`);
  assert(best < none * 0.7, 'a top physio should cut injury time');

  const intake = (stars) => {
    club.staff.youth = stars ? { stars } : null;
    const rng = new Rng({ s: 99 });
    const pots = [];
    for (let i = 0; i < 40; i++) {
      for (const id of youthIntake(g, club, rng, true)) { pots.push(g.players[id].potential); delete g.players[id]; }
      club.youth = [];
    }
    return mean(pots);
  };
  const weak = intake(0);
  const strong = intake(5);
  info(`Youth intake potential: no youth coach ${weak.toFixed(1)}, 5-star youth coach ${strong.toFixed(1)}`);
  assert(strong > weak + 6, 'a top youth coach should bring better youngsters');
});

test('the assistant manager gives more advice with more stars', () => {
  const g = career('assistant');
  const club = g.clubs[g.userClubId];
  startDay(g);
  club.staff.assistant = null;
  const none = assistantAdvice(g);
  assertEq(none.items.length, 1, 'no assistant: one hint');
  const starter = g.players[club.lineup.slots[3]];
  starter.energy = 60;
  club.staff.assistant = { name: 'Test', stars: 1 };
  const one = assistantAdvice(g);
  assert(one.items.some((i) => i.text.includes(starter.last) && i.text.includes('tired')), 'spots a tired starter');
  club.staff.assistant.stars = 5;
  const five = assistantAdvice(g);
  assert(five.items.some((i) => i.text.includes('key player')), 'scouts the next opponent');
  assert(five.items.some((i) => i.text.includes('attacking intent')), 'suggests an intent');
  info(`Assistant advice: 1 star ${one.items.length} items, 5 stars ${five.items.length} items`);
});

test('morale over a normal season stays reasonable', () => {
  const g = career('mood-season', 'ENG-L1', 9);
  const club = g.clubs[g.userClubId];
  const requests = new Set();
  const samples = [];
  for (let i = 0; i < 400 && g.season.phase === 'season'; i++) {
    const f = startDay(g);
    if (f) {
      club.lineup = autoLineup(g, club, club.lineup.formation);
      playUserMatchInstant(g, f);
      samples.push(mean(club.squad.map((id) => moraleOf(g.players[id]))));
    }
    for (const id of club.squad) if (g.players[id].mood?.request) requests.add(id);
  }
  const ps = club.squad.map((id) => g.players[id]);
  info(`Season with auto pick: average squad morale ${mean(samples).toFixed(1)}, end ${mean(ps.map(moraleOf)).toFixed(1)}; unhappy now ${ps.filter((p) => moraleOf(p) < 35).length}; transfer requests ${requests.size}`);
  assertBetween(mean(samples), 50, 78, 'average morale');
  assert(requests.size <= 5, 'only a few transfer requests in a normal season');
});

test('old saves get personalities and the new staff', () => {
  const old = career('old-mood');
  for (const p of Object.values(old.players)) { delete p.personality; delete p.mood; }
  const club = old.clubs[old.userClubId];
  for (const r of ['physio', 'youth', 'assistant']) delete club.staff[r];
  old.version = 7;
  const m = deserialize(serialize(old));
  assert(Object.values(m.players).every((p) => p.personality), 'personalities');
  const staff = m.clubs[m.userClubId].staff;
  assert(staff.physio && staff.youth && staff.assistant, 'new staff');
  assert(staff.fitness.id === club.staff.fitness.id, 'existing staff kept');
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over', 'a migrated career plays on');
});
