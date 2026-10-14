import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { mentalOf, ageMental, addMental, MENTAL } from '../core/attributes.js';
import { leadershipCourse, courseOk, setFocus, trainingDay } from '../core/training.js';
import { roleTakers } from '../core/lineup.js';
import { createMatch, runToEnd } from '../core/engine.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Mind');
}
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

test('mental: personality, position and age shape the profile', () => {
  const g = career('mind1');
  const y = g.season.year;
  const ps = Object.values(g.players);
  const by = (pred, k) => avg(ps.filter(pred).map((p) => mentalOf(p, k, y)));
  const pro = by((p) => p.personality === 'professional', 'tw');
  const temp = by((p) => p.personality === 'temperamental', 'tw');
  const young = by((p) => y - p.birthYear <= 21, 'ldr');
  const old = by((p) => y - p.birthYear >= 30, 'ldr');
  const cre = { M: by((p) => p.pos === 'M', 'cre'), D: by((p) => p.pos === 'D', 'cre') };
  info(`Mental: teamwork professional ${pro.toFixed(1)} vs temperamental ${temp.toFixed(1)}; leadership <=21 ${young.toFixed(1)} vs 30+ ${old.toFixed(1)}; creativity M ${cre.M.toFixed(1)} vs D ${cre.D.toFixed(1)}`);
  assert(pro > temp + 10, 'professionals work for the team');
  assert(old > young + 15, 'leaders are older');
  assert(cre.M > cre.D + 8, 'midfielders are more creative');
  for (const k of MENTAL) assert(ps.every((p) => mentalOf(p, k, y) >= 1 && mentalOf(p, k, y) <= 99), k);
});

test('mental: grows with experience, captains grow as leaders, fades late', () => {
  const g = career('mind2');
  const y = g.season.year;
  const p = Object.values(g.players).find((x) => y - x.birthYear === 24);
  const q = { ...p, id: 'clone', mn: p.mn ? p.mn.slice() : null };
  mentalOf(p, 'ldr', y); q.mn = p.mn.slice();
  for (let i = 1; i <= 3; i++) { ageMental(p, y + i, { apps: 34, captain: true }); ageMental(q, y + i, { apps: 0 }); }
  info(`Three seasons at 25-27: captain and regular leadership +${(p.mn[3] - q.mn[3]).toFixed(1)} over a bench player; teamwork +${(p.mn[2] - q.mn[2]).toFixed(1)}`);
  assert(p.mn[3] > q.mn[3] + 6, 'captaincy builds leadership');
  assert(p.mn[2] > q.mn[2] + 3, 'playing builds teamwork');
  const vet = Object.values(g.players).find((x) => y - x.birthYear >= 34);
  const before = mentalOf(vet, 'pos', y);
  ageMental(vet, y + 1, { apps: 10 });
  assert(mentalOf(vet, 'pos', y + 1) <= before, 'veterans fade a little');
});

test('mental: the captain is the best leader; a leadership course', () => {
  const g = career('mind3');
  const club = g.clubs[g.userClubId];
  const y = g.season.year;
  club.lineup.captainId = null;
  const xi = club.lineup.slots.map((id) => g.players[id]).filter(Boolean);
  const cap = g.players[roleTakers(g, club.lineup).captainId];
  const top = Math.max(...xi.map((p) => mentalOf(p, 'ldr', y)));
  assert(mentalOf(cap, 'ldr', y) >= top - 12, 'a leader wears the armband');
  const p = xi.find((x) => y - x.birthYear >= 20);
  const l = mentalOf(p, 'ldr', y);
  club.budget = 1e9;
  assert(leadershipCourse(g, p).ok);
  assertEq(mentalOf(p, 'ldr', y), Math.min(99, l + 3));
  assert(!courseOk(g, p) && !leadershipCourse(g, p).ok, 'once a season');
});

test('mental: a creativity focus works slowly', () => {
  const g = career('mind4');
  const club = g.clubs[g.userClubId];
  const y = g.season.year;
  const p = club.squad.map((id) => g.players[id]).filter((x) => x.pos === 'M').sort((a, b) => a.birthYear - b.birthYear).pop();
  assert(setFocus(g, p, 'cre'));
  const c = mentalOf(p, 'cre', y);
  for (let d = 0; d < 200; d++) { g.day++; trainingDay(g); p.energy = 100; p.injuryDays = 0; }
  info(`Creativity focus, 200 days (age ${y - p.birthYear}): ${c} -> ${mentalOf(p, 'cre', y)}`);
  assert(mentalOf(p, 'cre', y) >= c + 2, 'more creative');
});

test('mental: creative players and good positioning win matches', () => {
  const g = career('mind5');
  const club = g.clubs[g.userClubId];
  const opp = g.clubs[g.competitions[club.compId].clubIds.find((id) => id !== club.id)];
  const xi = club.lineup.slots.map((id) => g.players[id]).filter(Boolean);
  const y = g.season.year;
  for (const p of xi) mentalOf(p, 'cre', y);
  const saved = xi.map((p) => p.mn.slice());
  const run = (delta) => {
    xi.forEach((p, i) => { p.mn = saved[i].slice(); for (const k of ['cre', 'pos', 'tw']) addMental(p, k, delta, y); });
    let gd = 0;
    for (let i = 0; i < 200; i++) {
      const m = runToEnd(g, createMatch(g, { id: null, homeId: club.id, awayId: opp.id, compId: club.compId }, { seed: 500 + i, keepEvents: false }));
      gd += m.sides[0].goals - m.sides[1].goals;
    }
    return gd / 200;
  };
  const sharp = run(15);
  const dull = run(-15);
  xi.forEach((p, i) => { p.mn = saved[i]; });
  info(`Goal difference per match: mentally strong XI ${sharp.toFixed(2)}, weak ${dull.toFixed(2)}`);
  assert(sharp > dull + 0.15, 'the mental side shows on the pitch');
});
