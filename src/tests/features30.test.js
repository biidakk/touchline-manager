import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { ATTRS, ATTR_WEIGHT, attrOf, makeProfile, groupOf, shiftAttr } from '../core/attributes.js';
import { setFocus, trainingDay } from '../core/training.js';
import { createMatch, runToEnd } from '../core/engine.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Attr');
}

// Weighted average of a player's attributes in one group for his position.
function groupMean(p, grp) {
  const W = ATTR_WEIGHT[p.pos];
  const ks = ATTRS.filter((k) => groupOf(k) === grp && W[k]);
  return ks.reduce((s, k) => s + W[k] * attrOf(p, k), 0) / ks.reduce((s, k) => s + W[k], 0);
}

test('attributes: a stable profile around technique and physique', () => {
  const g = career('attr1');
  const ps = Object.values(g.players).slice(0, 3000);
  let off = 0; let n = 0;
  for (const p of ps) {
    if (p.tec < 20 || p.tec > 80 || p.phy < 20 || p.phy > 80) continue; // away from the 1-99 limits
    off += Math.abs(groupMean(p, 'tec') - p.tec) + Math.abs(groupMean(p, 'phy') - p.phy);
    n++;
  }
  info(`Attributes: average gap between weighted attributes and tec/phy ${(off / n / 2).toFixed(2)} (n=${n})`);
  assert(off / n / 2 < 1, 'the weighted attributes match technique and physique');
  const p = ps[0];
  attrOf(p, 'fin');
  const a = p.at.slice();
  delete p.at;
  makeProfile(p);
  assertEq(JSON.stringify(p.at), JSON.stringify(a), 'the same profile again');
  const F = ps.filter((x) => x.pos === 'F');
  const D = ps.filter((x) => x.pos === 'D');
  const avg = (xs, k) => xs.reduce((s, x) => s + attrOf(x, k) - x.tec, 0) / xs.length;
  info(`Forwards finish ${avg(F, 'fin').toFixed(1)} vs tec, defenders ${avg(D, 'fin').toFixed(1)}; defenders tackle ${avg(D, 'tck').toFixed(1)}, forwards ${avg(F, 'tck').toFixed(1)}`);
  assert(avg(F, 'fin') > avg(D, 'fin') + 10, 'forwards finish better');
  assert(avg(D, 'tck') > avg(F, 'tck') + 10, 'defenders tackle better');
});

test('attributes: tall players head better, small ones are quicker', () => {
  const g = career('attr2');
  const ps = Object.values(g.players).filter((p) => p.pos === 'F');
  const tall = ps.filter((p) => p.height >= 188);
  const small = ps.filter((p) => p.height <= 176);
  const avg = (xs, k) => xs.reduce((s, x) => s + attrOf(x, k) - (groupOf(k) === 'phy' ? x.phy : x.tec), 0) / xs.length;
  assert(avg(tall, 'hea') > avg(small, 'hea') + 4, 'heading');
  assert(avg(small, 'pac') > avg(tall, 'pac') + 3, 'pace');
});

test('attributes: a training focus pulls one attribute ahead over a season', () => {
  const g = career('attr3');
  const club = g.clubs[g.userClubId];
  const p = club.squad.map((id) => g.players[id]).filter((x) => x.pos === 'F').sort((a, b) => a.birthYear - b.birthYear).pop();
  const q = club.squad.map((id) => g.players[id]).filter((x) => x.pos === 'F' && x !== p)[0];
  setFocus(g, p, 'fin');
  const fin0 = attrOf(p, 'fin') - p.tec;
  const qfin0 = attrOf(q, 'fin') - q.tec;
  for (let d = 0; d < 200; d++) { g.day++; trainingDay(g); for (const x of [p, q]) { x.energy = 100; x.injuryDays = 0; } }
  const gain = attrOf(p, 'fin') - p.tec - fin0;
  info(`Focus on finishing, 200 days (age ${g.season.year - p.birthYear}): finishing vs technique ${gain >= 0 ? '+' : ''}${gain}; without focus ${attrOf(q, 'fin') - q.tec - qfin0}`);
  assert(gain >= 2, 'finishing pulled ahead');
  assert(Math.abs(groupMean(p, 'tec') - p.tec) < 1.5, 'technique is still the weighted average');
});

test('attributes: pace fades first with age', () => {
  const g = career('attr4');
  const p = Object.values(g.players).find((x) => x.pos === 'M' && x.phy > 40 && x.phy < 70);
  const pac = attrOf(p, 'pac') - p.phy;
  const sta = attrOf(p, 'sta') - p.phy;
  shiftAttr(p, 'pac', -2);
  assert(attrOf(p, 'pac') - p.phy < pac, 'slower');
  assert(attrOf(p, 'sta') - p.phy >= sta, 'stamina holds');
});

test('attributes: finishing decides who scores', () => {
  const g = career('attr5');
  const club = g.clubs[g.userClubId];
  const opp = g.clubs[g.competitions[club.compId].clubIds.find((id) => id !== club.id)];
  const fwds = club.lineup.slots.map((id) => g.players[id]).filter((p) => p && p.pos === 'F');
  const run = (delta) => {
    for (const p of fwds) { makeProfile(p); shiftAttr(p, 'fin', delta); }
    let goals = 0;
    for (let i = 0; i < 150; i++) {
      const m = runToEnd(g, createMatch(g, { id: null, homeId: club.id, awayId: opp.id, compId: club.compId }, { seed: 1000 + i, keepEvents: false }));
      goals += m.events.filter((e) => e.type === 'goal' && fwds.some((p) => p.id === e.playerId)).length;
    }
    return goals;
  };
  const sharp = run(12);
  const blunt = run(-24);
  info(`Forwards' goals in 150 matches: sharp finishers ${sharp}, poor finishers ${blunt}`);
  assert(sharp > blunt * 1.15, 'better finishing, more goals');
});

test('attributes: saved and loaded, and old players get a profile', () => {
  const g = career('attr6');
  const p = Object.values(g.players)[5];
  attrOf(p, 'fin');
  const g2 = deserialize(serialize(g));
  assertEq(JSON.stringify(g2.players[p.id].at), JSON.stringify(p.at));
  const old = g2.players[Object.keys(g2.players)[9]];
  delete old.at;
  assert(attrOf(old, 'pac') >= 1 && old.at.length === ATTRS.length, 'made on first use');
});
