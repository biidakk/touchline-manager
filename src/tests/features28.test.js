import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { quickSim, simEndDay } from '../core/quicksim.js';
import { advanceToUserMatch, pendingUserFixture } from '../core/matchday.js';
import { youthIntake, setYouthPlan, youthEffortCost, startAcademy } from '../core/development.js';
import { clubChecklist } from '../core/assistant.js';
import { Rng } from '../core/rng.js';
import { serialize } from '../core/save.js';
import * as storage from '../ui/storage.js';
import * as slots from '../ui/slots.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  const g = startCareer(w, w.competitions[comp].clubIds[idx], 'Sim');
  g.manager.board.standing = 100;
  return g;
}

// Skip the pre-season decisions and tour so the calendar runs.
function ready(g) {
  const club = g.clubs[g.userClubId];
  club.deals = { ...(club.deals || {}), ticketYear: g.season.year, sponsor: { until: g.season.year + 5 } };
  club.tour = { year: g.season.year };
}

test('quick sim: "next match" plays exactly one user match', () => {
  const g = career('qs1');
  ready(g);
  const sim = quickSim(g, { until: 'match', stopForOffers: false });
  assertEq(sim.results.length, 1, 'one match');
  assertEq(sim.stop, 'done');
  const f = g.fixtures[sim.results[0].fixtureId];
  assert(f.result, 'the fixture has a result');
  assert(!pendingUserFixture(g), 'nothing left half-played');
});

test('quick sim: a week stops after seven days; a started match day is played first', () => {
  const g = career('qs2');
  ready(g);
  const f = advanceToUserMatch(g);
  assert(f && pendingUserFixture(g) === f, 'a match day has started');
  const day = g.day;
  const sim = quickSim(g, { until: 'week', stopForOffers: false });
  assert(f.result, 'the started match was played');
  assertEq(sim.results[0].fixtureId, f.id);
  assertEq(g.day, day + 7, 'a week on');
});

test('quick sim: the end of the month and the winter window', () => {
  const g = career('qs3');
  ready(g);
  const end = simEndDay(g, 'month');
  const d = new Date((end + 1) * 86400000);
  assertEq(d.getUTCDate(), 1, 'the day after the end is the 1st');
  const sim = quickSim(g, { until: 'month', stopForOffers: false });
  assert(g.day <= end && (sim.stop !== 'done' || g.day === end), `stopped on ${g.day}, end ${end}`);
});

test('quick sim: the whole season, with the assistant picking the team', () => {
  const g = career('qs4');
  ready(g);
  let guard = 0;
  let sim;
  const all = [];
  do {
    sim = quickSim(g, { until: 'season', autoPick: true, stopForOffers: false });
    all.push(...sim.results);
  } while (sim.stop === 'window' && guard++ < 3);
  assert(['seasonOver', 'sacked'].includes(sim.stop), `stop: ${sim.stop}`);
  if (sim.stop === 'seasonOver') assertEq(g.season.phase, 'over');
  const club = g.clubs[g.userClubId];
  const played = Object.values(g.fixtures).filter((f) => f.result && g.competitions[f.compId].type === 'league'
    && (f.homeId === club.id || f.awayId === club.id)).length;
  info(`Quick sim season: ${all.length} matches (${played} league), ${all.filter((r) => r.o === 'W').length} wins, stop ${sim.stop}`);
  assert(played >= 30, 'the league season was played');
  assert(club.lineup.slots.every(Boolean), 'a full XI');
});

test('quick sim: stops for an offer when asked', () => {
  const g = career('qs5');
  ready(g);
  let stopped = null;
  for (let i = 0; i < 6 && !stopped; i++) {
    const sim = quickSim(g, { until: 'season' });
    if (sim.stop === 'offer') stopped = sim;
    if (sim.stop === 'seasonOver' || sim.stop === 'sacked') break;
    for (const o of g.offers) o.seen = true;
  }
  if (stopped) assert(g.offers.some((o) => o.day === g.day), 'an offer arrived today');
  info(`Quick sim offer stop: ${stopped ? 'yes' : 'no offers this run'}`);
});

test('youth plan: focus, region and extra effort shape the intake', () => {
  const g = career('youthplan');
  const club = g.clubs[g.userClubId];
  const count = (plan) => {
    let n = 0; let gk = 0; let foreign = 0;
    for (let i = 0; i < 40; i++) {
      club.youth = [];
      setYouthPlan(club, plan);
      const ids = youthIntake(g, club, new Rng({ s: 1000 + i }), true);
      n += ids.length;
      gk += ids.filter((id) => g.players[id].pos === 'G').length;
      foreign += ids.filter((id) => g.players[id].nationId !== club.nationId).length;
      for (const id of ids) delete g.players[id];
    }
    return { n, gk, foreign };
  };
  const base = count({ focus: 'any', region: 'home', effort: 'normal' });
  const keepers = count({ focus: 'G', region: 'home', effort: 'normal' });
  const abroad = count({ focus: 'any', region: 'abroad', effort: 'normal' });
  const budget = club.budget;
  const extra = count({ focus: 'any', region: 'home', effort: 'extra' });
  info(`Youth plan: ${base.n} players (${base.gk} G, ${base.foreign} foreign); G focus ${keepers.gk} G; abroad ${abroad.foreign} foreign; extra ${extra.n}`);
  assert(keepers.gk > base.gk * 2, 'many more keepers');
  assert(abroad.foreign > base.foreign * 2, 'many more foreigners');
  assertEq(extra.n, base.n + 40, 'one more youngster each year');
  assertEq(club.budget, budget - 40 * youthEffortCost(g, club), 'extra effort is paid for');
});

test('assistant checklist: empty places, debt and the academy deadline', () => {
  const g = career('todo');
  startAcademy(g);
  const club = g.clubs[g.userClubId];
  club.lineup.slots[3] = null;
  club.budget = -1e6;
  const items = clubChecklist(g);
  assert(items.some((t) => t.screen === 'myteam' && /empty place/.test(t.text)), 'empty place');
  assert(items.some((t) => t.screen === 'finances'), 'debt');
  const p = g.players[club.youth[0]];
  p.birthYear = g.season.year - 19;
  assert(clubChecklist(g).some((t) => t.screen === 'youth'), 'academy deadline');
});

test('save slots: weekly backups, two kept, restore and delete', async () => {
  slots.setNamespace('test-');
  try { await slotsTest(); } finally { slots.setNamespace(''); }
});

async function slotsTest() {
  for (const n of slots.SLOTS) await slots.deleteSlot(n);
  const g = career('slots');
  await slots.writeSlot(2, g, serialize(g));
  let meta = await slots.listSlots();
  assertEq(meta[2].club, g.clubs[g.userClubId].name);
  assertEq(meta[2].backups.length, 0, 'nothing to back up yet');
  assertEq(meta.last, 2);
  assertEq(slots.freeSlot(meta), 1);
  g.day += 3;
  await slots.writeSlot(2, g, serialize(g));
  meta = await slots.listSlots();
  assertEq(meta[2].backups.length, 1, 'the first save becomes the first backup');
  const firstDay = meta[2].backups[0].day;
  g.day += 3;
  await slots.writeSlot(2, g, serialize(g));
  meta = await slots.listSlots();
  assertEq(meta[2].backups.length, 1, 'no new backup within a week');
  g.day += 8;
  await slots.writeSlot(2, g, serialize(g));
  g.day += 8;
  await slots.writeSlot(2, g, serialize(g));
  meta = await slots.listSlots();
  assertEq(meta[2].backups.length, 2, 'two backups kept');
  assert(meta[2].backups[0].day > meta[2].backups[1].day, 'newest first');
  assert(meta[2].backups[1].day > firstDay, 'the oldest dropped');
  const back = JSON.parse(await slots.readBackup(2, 1));
  assertEq(back.game.day, meta[2].backups[1].day, 'the backup holds that save');
  await slots.deleteSlot(2);
  meta = await slots.listSlots();
  assert(!meta[2], 'slot deleted');
  assertEq(await storage.get(slots.backupKey(2, 0)), undefined, 'backups deleted');
}
