import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { simulateRestOfSeason, startDay, playUserMatchInstant } from '../core/matchday.js';
import { deriveSkill } from '../core/attributes.js';
import { acwrRisk, hireCoach, refreshCoachPool, trainingDay } from '../core/training.js';
import { createMatch, runToEnd } from '../core/engine.js';
import { autoLineup } from '../core/ai.js';
import { assignScout, setLevel, attrText, LEVELS } from '../core/scouting.js';
import { serialize, deserialize } from '../core/save.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Coach');
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

test('players have technical and physical ability and a height; skill follows from them', () => {
  const g = generateWorld({ seed: 'attrs' });
  const ps = Object.values(g.players);
  for (const p of ps) {
    assertEq(p.skill, deriveSkill(p.pos, p.tec, p.phy), 'derived skill');
    assert(p.potential >= p.skill, 'potential');
    assertBetween(p.height, 160, 204, 'height');
  }
  const h = (pos) => mean(ps.filter((p) => p.pos === pos).map((p) => p.height));
  info(`Average height: GK ${h('G').toFixed(1)}, D ${h('D').toFixed(1)}, M ${h('M').toFixed(1)}, F ${h('F').toFixed(1)} cm`);
  assert(h('G') > h('D') && h('D') > h('M'), 'keepers tallest, midfielders shortest');
});

// The same career three times, differing only in training intensity.
function seasonWith(intensity, focus = 'balanced', stars = null) {
  const g = career('intensity');
  const club = g.clubs[g.userClubId];
  club.training.groups.all = { focus, intensity };
  if (stars !== null) for (const r of ['fitness', 'technical', 'goalkeeping']) club.staff[r].stars = stars;
  const young = club.squad.map((id) => g.players[id]).filter((p) => g.season.year - p.birthYear <= 21);
  const start = new Map(young.map((p) => [p.id, { skill: p.skill, tec: p.tec, phy: p.phy }]));
  const energy = [];
  for (let i = 0; i < 400 && g.season.phase === 'season'; i++) {
    const f = startDay(g);
    if (!f) continue;
    // Energy of the squad at kick-off (before the match drains it).
    energy.push(mean(club.squad.map((id) => g.players[id]).filter((p) => !p.injuryDays).map((p) => p.energy)));
    playUserMatchInstant(g, f);
  }
  const alive = young.filter((p) => g.players[p.id]);
  return {
    gain: mean(alive.map((p) => p.skill - start.get(p.id).skill)),
    phyGain: mean(alive.map((p) => p.phy - start.get(p.id).phy)),
    energy: mean(energy),
  };
}

test('training intensity: harder means faster development but tired players', () => {
  const light = seasonWith('light');
  const normal = seasonWith('normal');
  const hard = seasonWith('hard');
  info(`Young players over a season: light +${light.gain.toFixed(2)} (match energy ${light.energy.toFixed(0)}), normal +${normal.gain.toFixed(2)} (${normal.energy.toFixed(0)}), hard +${hard.gain.toFixed(2)} (${hard.energy.toFixed(0)})`);
  assert(hard.gain > normal.gain && normal.gain > light.gain, 'development should rise with intensity');
  assert(hard.energy < normal.energy - 3 && normal.energy <= light.energy, 'harder training should leave players more tired');
});

test('physical focus builds physique, coaches matter', () => {
  const phys = seasonWith('normal', 'physical');
  const tech = seasonWith('normal', 'technical');
  assert(phys.phyGain > tech.phyGain + 0.5, `physical focus +${phys.phyGain.toFixed(2)} vs technical focus +${tech.phyGain.toFixed(2)}`);
  const poor = seasonWith('normal', 'balanced', 1);
  const great = seasonWith('normal', 'balanced', 5);
  info(`Coach quality: 1-star staff +${poor.gain.toFixed(2)}, 5-star staff +${great.gain.toFixed(2)} for young players`);
  assert(great.gain > poor.gain * 1.2, '5-star coaches should develop players clearly faster');
});

test('a fit, physical player recovers faster than a weak one', () => {
  const g = career('recovery');
  const club = g.clubs[g.userClubId];
  const [a, b] = club.squad.slice(0, 2).map((id) => g.players[id]);
  a.phy = 90; b.phy = 40; a.energy = b.energy = 50; a.fatigue = b.fatigue = 0; a.injuryDays = b.injuryDays = 0;
  a.birthYear = b.birthYear = g.season.year - 25;
  club.training.groups.all = { focus: 'recovery', intensity: 'normal' };
  trainingDay(g); // pre-season day: nobody plays
  assert(a.energy > b.energy + 1.5, `recovery: strong ${a.energy.toFixed(1)} vs weak ${b.energy.toFixed(1)}`);
});

test('workload spikes raise injury risk', () => {
  assertEq(acwrRisk({ load: { acute: 2, chronic: 2 } }), 1, 'steady load');
  assertEq(acwrRisk({ load: { acute: 4, chronic: 2 } }), 2, 'doubled load');
  assert(acwrRisk({ load: { acute: 3, chronic: 2 } }) > 1, 'a 1.5 ratio is risky');
});

test('aerial duels: tall forwards score more headers from crosses', () => {
  const g = generateWorld({ seed: 'aerial' });
  const comp = g.competitions['ENG-L1'];
  const [home, away] = [g.clubs[comp.clubIds[5]], g.clubs[comp.clubIds[6]]];
  home.tactics.style = 'crosses';
  home.lineup = autoLineup(g, home);
  away.lineup = autoLineup(g, away);
  const fwd = home.lineup.slots.filter((id) => g.players[id].pos === 'F');
  const run = (h) => {
    for (const id of fwd) g.players[id].height = h;
    let headers = 0;
    for (let i = 0; i < 400; i++) {
      const m = runToEnd(g, createMatch(g, { homeId: home.id, awayId: away.id }, { seed: 900 + i }));
      headers += m.events.filter((e) => e.type === 'goal' && e.header && e.side === 0).length;
    }
    return headers;
  };
  const short = run(168);
  const tall = run(197);
  info(`Crossing team, 400 matches: headed goals with 1.68 m forwards ${short}, with 1.97 m forwards ${tall}`);
  assert(tall > short * 1.15, 'height should matter in the air');
});

test('scouting reports technical and physical ranges that contain the truth', () => {
  const g = career('scout-attrs');
  setLevel(g, 2);
  const target = Object.values(g.players).find((p) => p.clubId !== g.userClubId);
  assertEq(attrText(g, target, 'tec'), '?');
  assignScout(g, target.id);
  for (let i = 0; i <= LEVELS[2].days; i++) startDay(g);
  const r = g.clubs[g.userClubId].scouting.reports[target.id];
  assert(r.tec[0] <= target.tec && r.tec[1] >= target.tec, 'tec range');
  assert(r.phy[0] <= target.phy && r.phy[1] >= target.phy, 'phy range');
});

test('hiring a coach replaces the old one and pays compensation', () => {
  const g = career('hire');
  refreshCoachPool(g);
  const club = g.clubs[g.userClubId];
  club.budget = 50e6;
  const c = g.coachPool.find((x) => x.role === 'fitness');
  const before = club.budget;
  const r = hireCoach(g, c.id);
  assert(r.ok, r.message);
  assertEq(club.staff.fitness.id, c.id);
  assert(club.budget < before, 'compensation paid for the old coach');
});

test('old saves get attributes, heights and coaching staff', () => {
  const old = career('old-attrs');
  for (const p of Object.values(old.players)) { delete p.tec; delete p.phy; delete p.height; delete p.xp; delete p.fatigue; delete p.load; }
  delete old.clubs[old.userClubId].staff;
  old.version = 6;
  const m = deserialize(serialize(old));
  const p = Object.values(m.players)[0];
  assert(p.tec && p.phy && p.height, 'attributes created');
  assert(m.clubs[m.userClubId].staff.fitness, 'staff created');
  simulateRestOfSeason(m);
  assertEq(m.season.phase, 'over', 'a migrated career plays on');
});
