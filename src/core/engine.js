// Minute-by-minute match engine. A match is a plain state object that is
// advanced with step(); the live view, half-time changes and instant results
// all use the same code. All randomness comes from the match's own seeded RNG.

import { Rng, clamp } from './rng.js';
import { FORMATIONS, ROLE_POS } from './data.js';
import { positionFit } from './ai.js';
import { roleTakers } from './lineup.js';
import { aerial, heightFactor } from './attributes.js';
import { acwrRisk, physioDays } from './training.js';
import { moraleFactor } from './morale.js';
import { pitchOf, pitchTechnique, pitchInjury } from './stadium.js';
import { demand } from './finance.js';

// ---- tuning constants (checked by the calibration tests) ----
const CHANCE_RATE = 0.24;      // chance probability per minute for an even side with all the ball
const CONVERSION = 0.083;      // base goal probability of a chance
const POSS_EXP = 1.5;          // how strongly midfield quality decides possession
const CHANCE_EXP = 1.5;        // how strongly attack vs defence decides chances
const FINISH_EXP = 0.8;        // how strongly shooter vs keeper decides goals
const HOME_MID = 1.03;         // home boost to midfield (possession)
const HOME_CHANCE = 1.13;      // home boost to chance creation
const ON_TARGET = 0.33;        // share of non-goal chances that force a save
const PENALTY_SHARE = 0.022;   // share of chances that are penalties
const FOUL_RATE = 0.125;       // fouls per minute per side
const YELLOW_PER_FOUL = 0.15;
const STRAIGHT_RED = 0.0003;   // per minute per side
const INJURY_RATE = 0.0010;    // per minute per side
const ENERGY_DRAIN = 0.24;     // energy points per minute
const DANGEROUS_FOUL = 0.1;    // share of fouls that give a direct free kick at goal
const FREE_KICK_CONV = 0.065;  // base goal probability of a direct free kick
const HEADER_BONUS = 1.9;      // a header won in a duel is a good chance
const CROSS_AERIAL = 0.4;      // share of chances that are aerial duels when crossing

const WIDE_ROLES = new Set(['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW']);

// Style triangle: passing beats crosses, crosses beat through-balls,
// through-balls beat passing. "Normal" is neutral.
const BEATS = { passing: 'crosses', crosses: 'through', through: 'passing' };

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const lineCount = (n, std) => (n > 0 ? Math.pow(n / std, 0.35) : 0);

function buildSide(game, club, lineup, tactics, ai) {
  const clubId = club.id;
  const slotRoles = FORMATIONS[lineup.formation].map(([r]) => r);
  const energy = {};
  const rating = {};
  const ageDrain = {}; // how fast each player tires: age and stamina (physical); precomputed once per match
  const injRisk = {}; // workload spikes and low physique raise injury risk
  const mood = {}; // morale: a few % either way
  for (const id of [...lineup.slots, ...lineup.bench]) {
    if (!id) continue;
    const p = game.players[id];
    energy[id] = p.energy ?? 100;
    mood[id] = moraleFactor(p);
    ageDrain[id] = (1 + Math.max(0, game.season.year - p.birthYear - 28) * 0.03) * (1.25 - (p.phy ?? 50) / 200);
    injRisk[id] = acwrRisk(p) * ((p.phy ?? 60) < 50 ? 1.15 : 1);
  }
  for (const id of lineup.slots) if (id) rating[id] = 6.2;
  const roles = roleTakers(game, lineup);
  return {
    clubId,
    ai,
    captainId: roles.captainId,
    setPieceId: roles.setPieceId,
    penaltyId: roles.penaltyId,
    teamwork: club.teamwork ?? 60,
    formation: lineup.formation,
    slotRoles,
    slotPos: slotRoles.map((r) => ROLE_POS[r]),
    slots: lineup.slots.slice(),
    bench: lineup.bench.slice(),
    tactics: { intent: tactics.intent ?? 50, style: tactics.style || 'normal' },
    subsUsed: 0,
    maxSubs: 5,
    energy,
    ageDrain,
    injRisk,
    mood,
    physio: game.clubs[clubId] ? physioDays(game, club) : 1,
    v: 0, // bumped whenever the players on the pitch change (strength cache key)
    rating,
    played: lineup.slots.filter(Boolean),
    starters: lineup.slots.filter(Boolean),
    yellow: {},
    sentOff: [],
    injured: [],
    goals: 0,
    stats: { shots: 0, onTarget: 0, poss: 0, fouls: 0, yellow: 0, red: 0, corners: 0 },
  };
}

// opts.homeClub / opts.awayClub let teams that aren't clubs (national teams) play.
export function createMatch(game, fixture, opts = {}) {
  const home = opts.homeClub || game.clubs[fixture.homeId];
  const away = opts.awayClub || game.clubs[fixture.awayId];
  const seed = opts.seed ?? new Rng(game.rng).int(1, 2147483646);
  const m = {
    fixtureId: fixture.id || null,
    rng: { s: seed },
    needsWinner: !!opts.needsWinner,
    // Second legs: goals each side brings from the first leg (aggregate decides).
    agg: opts.firstLeg || null,
    period: 'PRE',
    clock: 0,
    added: 0,
    minute: 0,
    finished: false,
    sides: [
      buildSide(game, home, opts.homeLineup || home.lineup, opts.homeTactics || home.tactics, opts.homeAI ?? true),
      buildSide(game, away, opts.awayLineup || away.lineup, opts.awayTactics || away.tactics, opts.awayAI ?? true),
    ],
    events: [],
    ball: { side: 0, zone: 0.5, carrier: null },
    pens: null,
    keepEvents: opts.keepEvents ?? true,
  };
  // The home club's ground: its pitch (technique and injuries, both sides) and
  // the crowd (a full house lifts the home side a little).
  const ground = !opts.homeClub && game.clubs[fixture.homeId];
  m.pitch = ground ? pitchOf(ground) : 7;
  const fill = ground && fixture.compId ? Math.min(1, demand(game, fixture) / ground.stadium.capacity) : 0.75;
  m.homeEdge = HOME_CHANCE * (1 + 0.06 * (fill - 0.75));
  for (const s of m.sides) s.pitchT = pitchTechnique(m.pitch);
  return m;
}

// ---- strength ----

// Effective technical (t) and physical (p) ability of a player in a slot.
// Tiredness costs physical ability much more than technique.
function effAttrs(game, side, id, slotPos) {
  const pl = game.players[id];
  const fit = positionFit(pl.pos, slotPos) * (1 + 0.02 * (pl.form || 0)) * (side.mood?.[id] ?? 1);
  const e = side.energy[id] / 100;
  return { t: (pl.tec ?? pl.skill) * fit * (0.86 + 0.14 * e) * (side.pitchT ?? 1), p: (pl.phy ?? pl.skill) * fit * (0.62 + 0.38 * e) };
}

// A shooter's finishing: mostly technique, some power.
function effSkill(game, side, id, slotPos) {
  const a = effAttrs(game, side, id, slotPos);
  return 0.7 * a.t + 0.3 * a.p;
}

// The match "matrix": how technique (T) and physique (P) feed each part of play.
//   possession (midfield)  0.7 T + 0.3 P      defending  0.4 T + 0.6 P
//   attacking              0.6 T + 0.4 P      keeper     0.5 T + 0.5 P
//   crosses: wide players' T;  through-balls: forwards' pace (P) vs defenders' P
export function sideStrength(game, side) {
  const lines = { G: [], D: [], M: [], F: [] };
  const wide = [];
  side.slots.forEach((id, i) => {
    if (!id) return;
    const a = effAttrs(game, side, id, side.slotPos[i]);
    lines[side.slotPos[i]].push(a);
    if (WIDE_ROLES.has(side.slotRoles[i])) wide.push(a.t);
  });
  const mix = (line, wt) => avg(line.map((a) => wt * a.t + (1 - wt) * a.p));
  const d = mix(lines.D, 0.4) * lineCount(lines.D.length, 4);
  const midPoss = mix(lines.M, 0.7) * lineCount(lines.M.length, 4);
  const midDef = mix(lines.M, 0.5) * lineCount(lines.M.length, 4);
  const midAtt = mix(lines.M, 0.65) * lineCount(lines.M.length, 4);
  const f = mix(lines.F, 0.6) * lineCount(lines.F.length, 2);
  const outfield = mix([...lines.D, ...lines.M, ...lines.F], 0.5);
  // Captain on the pitch and teamwork (0..100 -> -3%..+3%) scale every line.
  const capt = (side.slots.includes(side.captainId) ? 1.015 : 1) * (0.97 + 0.0006 * side.teamwork);
  const s = {
    gk: (lines.G.length ? mix(lines.G, 0.5) : outfield * 0.45) * capt,
    def: (d * 0.75 + midDef * 0.25) * capt,
    mid: (midPoss * 0.8 + d * 0.1 + f * 0.1) * capt,
    att: (f * 0.7 + midAtt * 0.3) * capt,
    wide: wide.length ? avg(wide) : outfield * 0.85,
    pace: lines.F.length ? avg(lines.F.map((a) => a.p)) : outfield,
    defPace: lines.D.length ? avg(lines.D.map((a) => a.p)) : outfield,
  };
  // Style shifts what the attack is built on.
  const st = side.tactics.style;
  if (st === 'passing') s.att = s.att * 0.6 + s.mid * 0.4;
  else if (st === 'crosses') s.att = s.att * 0.65 + s.wide * 0.35;
  else if (st === 'through') s.att = s.att * 0.8 + f * 0.2;
  return s;
}

// ---- aerial duels (corners and crosses) ----

const keeperOf = (side) => side.slots.find((id, k) => id && side.slotPos[k] === 'G');

// The defender who goes up for the ball: the best in the air.
function bestAerial(game, side) {
  let best = null;
  side.slots.forEach((id, k) => {
    if (!id || side.slotPos[k] === 'G') return;
    const a = aerial(game.players[id]) * (0.75 + 0.25 * side.energy[id] / 100) + (side.slotPos[k] === 'D' ? 4 : 0);
    if (!best || a > best.a) best = { id, a };
  });
  return best;
}

// Attacker vs defender in the air: ~0.7% per cm of height difference
// (in line with heading research), more for jumping, strength and timing.
function aerialDuel(game, rng, attSide, attId, defSide, deliveryTec = null) {
  const att = game.players[attId];
  const def = bestAerial(game, defSide);
  attSide.stats.aerials = attSide.stats.aerials || 0;
  defSide.stats.aerials = defSide.stats.aerials || 0;
  if (!def) { attSide.stats.aerials++; return true; }
  const d = game.players[def.id];
  const aAtt = aerial(att) * (0.75 + 0.25 * attSide.energy[attId] / 100);
  let pWin = 0.5 + 0.007 * ((att.height || 180) - (d.height || 180)) + 0.006 * (aAtt - def.a);
  if (deliveryTec !== null) pWin += 0.002 * (deliveryTec - 60);
  const won = rng.next() < clamp(pWin, 0.15, 0.85);
  if (won) attSide.stats.aerials++; else defSide.stats.aerials++;
  return won;
}

// A won header: its quality against the keeper, whose height helps him claim.
function headerConversion(game, side, attId, opSide, S, i, extraTec = null) {
  const pl = game.players[attId];
  const quality = extraTec === null ? aerial(pl) : (aerial(pl) + extraTec) / 2;
  const gkId = keeperOf(opSide);
  const gkReach = S[1 - i].gk * (0.85 + 0.3 * heightFactor(gkId ? game.players[gkId].height || 188 : 180));
  return clamp(CONVERSION * HEADER_BONUS * Math.pow(quality / Math.max(1, gkReach), FINISH_EXP), 0.02, 0.5);
}

function styleEdge(mine, theirs) {
  if (mine === 'normal' || theirs === 'normal') return 1;
  if (BEATS[mine] === theirs) return 1.07;
  if (BEATS[theirs] === mine) return 0.94;
  return 1;
}

// ---- helpers ----

function onPitch(side) { return side.slots.filter(Boolean); }

// `hot`: picking someone for a card, where temperamental players stand out.
function pickPlayer(game, rng, side, weights, exclude = null, hot = false) {
  const ids = side.slots.map((id, i) => ({ id, pos: side.slotPos[i] }))
    .filter((x) => x.id && x.id !== exclude && weights[x.pos] > 0);
  if (!ids.length) return null;
  return rng.weighted(ids, (x) => weights[x.pos] * game.players[x.id].skill
    * (hot && game.players[x.id].personality === 'temperamental' ? 2 : 1)).id;
}

function push(m, ev) {
  ev.minute = m.minute;
  ev.added = m.clock > periodLen(m.period) ? m.clock - periodLen(m.period) : 0;
  if (m.keepEvents || ev.type === 'goal' || ev.type === 'yellow' || ev.type === 'red' || ev.type === 'injury') m.events.push(ev);
  return ev;
}

const PERIOD_START = { '1H': 0, '2H': 45, ET1: 90, ET2: 105 };
const periodLen = (p) => (p === 'ET1' || p === 'ET2' ? 15 : 45);

// ---- substitutions ----

export function makeSub(game, m, sideIdx, outId, inId, reason = 'tactical') {
  const side = m.sides[sideIdx];
  const slot = side.slots.indexOf(outId);
  if (slot < 0 || !side.bench.includes(inId) || side.subsUsed >= side.maxSubs) return false;
  side.slots[slot] = inId;
  side.bench = side.bench.filter((id) => id !== inId);
  side.subsUsed++;
  side.v++;
  side.played.push(inId);
  side.subbedOff = [...(side.subbedOff || []), outId];
  side.rating[inId] = 6.2;
  push(m, { type: 'sub', side: sideIdx, playerId: inId, otherId: outId, reason });
  return true;
}

// Fills a place left open by an injury with a substitute.
export function subIntoOpenSlot(game, m, sideIdx, slot, inId) {
  const side = m.sides[sideIdx];
  const open = side.openSlots || {};
  if (!(slot in open) || side.slots[slot] || !side.bench.includes(inId) || side.subsUsed >= side.maxSubs) return false;
  const injured = open[slot];
  side.slots[slot] = inId;
  side.bench = side.bench.filter((id) => id !== inId);
  const rest = { ...open };
  delete rest[slot];
  side.openSlots = rest;
  side.subsUsed++;
  side.v++;
  side.played.push(inId);
  if (injured) side.subbedOff = [...(side.subbedOff || []), injured];
  side.rating[inId] = 6.2;
  push(m, { type: 'sub', side: sideIdx, playerId: inId, otherId: injured, reason: 'injury' });
  return true;
}

// Moves an on-pitch player to another place in the formation during a match:
// swaps with whoever is there, or leaves his old place empty (after a red card).
export function moveOnPitch(m, sideIdx, fromSlot, toSlot) {
  const side = m.sides[sideIdx];
  const s = side.slots;
  if (!s[fromSlot] || fromSlot === toSlot) return false;
  [s[fromSlot], s[toSlot]] = [s[toSlot], s[fromSlot]];
  side.v++;
  // An injury gap moves with the swap.
  if (side.openSlots && toSlot in side.openSlots) {
    const open = { ...side.openSlots };
    open[fromSlot] = open[toSlot];
    delete open[toSlot];
    side.openSlots = open;
  }
  return true;
}

function bestBenchFor(game, side, slotPos) {
  let best = null;
  let bestScore = -1;
  for (const id of side.bench) {
    const p = game.players[id];
    const s = p.skill * positionFit(p.pos, slotPos) * (side.energy[id] / 100);
    if (s > bestScore) { bestScore = s; best = id; }
  }
  return best;
}

function aiSubs(game, m, sideIdx, maxNow) {
  const side = m.sides[sideIdx];
  const other = m.sides[1 - sideIdx];
  let made = 0;
  const losing = side.goals < other.goals;
  const candidates = side.slots
    .map((id, i) => ({ id, i }))
    .filter((x) => x.id && side.slotPos[x.i] !== 'G')
    .map((x) => ({ ...x, need: (100 - side.energy[x.id]) + (side.yellow[x.id] && side.slotPos[x.i] === 'D' ? 12 : 0)
      + (side.rating[x.id] < 6 ? 8 : 0) }))
    .sort((a, b) => b.need - a.need);
  for (const c of candidates) {
    if (made >= maxNow || side.subsUsed >= side.maxSubs) break;
    if (c.need < 14) break;
    // Chasing the game late on: bring on a forward for a defender or midfielder.
    const wantPos = losing && m.minute >= 70 && side.slotPos[c.i] !== 'F' && side.bench.some((id) => game.players[id].pos === 'F')
      ? 'F' : side.slotPos[c.i];
    const inId = bestBenchFor(game, side, wantPos);
    if (!inId || game.players[inId].pos === 'G') continue;
    if (makeSub(game, m, sideIdx, c.id, inId)) made++;
  }
}

function handleInjury(game, m, sideIdx, id, rng) {
  const side = m.sides[sideIdx];
  const r = rng.next();
  const raw = r < 0.6 ? rng.int(3, 10) : r < 0.9 ? rng.int(11, 30) : rng.int(31, 120);
  const days = Math.max(2, Math.round(raw * (side.physio ?? 1))); // a good physio speeds up rehab
  side.injured.push({ id, days });
  push(m, { type: 'injury', side: sideIdx, playerId: id, days });
  const slot = side.slots.indexOf(id);
  side.v++;
  // A manager-controlled side picks the replacement itself: the injured player
  // leaves and his place stays open until a substitute is brought on.
  if (!side.ai) {
    side.slots[slot] = null;
    side.openSlots = { ...(side.openSlots || {}), [slot]: id };
    m.userInjury = { side: sideIdx, playerId: id, slot };
    return;
  }
  const inId = side.subsUsed < side.maxSubs ? bestBenchFor(game, side, side.slotPos[slot]) : null;
  if (inId && makeSub(game, m, sideIdx, id, inId, 'injury')) return;
  side.slots[slot] = null;
}

function sendOff(game, m, sideIdx, id) {
  const side = m.sides[sideIdx];
  const slot = side.slots.indexOf(id);
  side.v++;
  side.sentOff.push(id);
  side.slots[slot] = null;
  side.stats.red++;
  side.rating[id] -= 1.5;
  // Keep a goalkeeper on the pitch if the keeper was sent off.
  if (side.slotPos[slot] === 'G') {
    const gk = side.bench.find((b) => game.players[b].pos === 'G');
    if (gk && side.subsUsed < side.maxSubs) {
      const victim = side.slots.map((x, i) => ({ x, i })).filter((o) => o.x && side.slotPos[o.i] === 'F').pop()
        || side.slots.map((x, i) => ({ x, i })).filter((o) => o.x && side.slotPos[o.i] === 'M').pop();
      if (victim) {
        side.slots[slot] = victim.x; // temporarily, then swap with the keeper
        side.slots[victim.i] = null;
        makeSub(game, m, sideIdx, victim.x, gk, 'red card');
      }
    } else {
      const d = side.slots.findIndex((x, i) => x && side.slotPos[i] === 'D');
      if (d >= 0) { side.slots[slot] = side.slots[d]; side.slots[d] = null; }
    }
  }
}

// AI sides manage the game late on: protect a lead, chase a deficit.
function effectiveIntent(m, i) {
  const side = m.sides[i];
  let intent = side.tactics.intent;
  if (side.ai && m.minute >= 70) {
    const diff = side.goals - m.sides[1 - i].goals;
    if (diff > 0) intent -= 15;
    else if (diff < 0) intent += 20;
  }
  return clamp(intent, 0, 100);
}

// ---- one minute of football ----

// Team strength changes slowly (energy), so it's recomputed every 3 minutes,
// or at once when players, positions or style change.
function cachedStrength(game, m, side) {
  const key = `${Math.floor(m.minute / 3)}|${side.v}|${side.tactics.style}|${side.slots.length}`;
  if (side._sKey !== key) {
    side._s = sideStrength(game, side);
    side._sKey = key;
  }
  return side._s;
}

function playMinute(game, m, rng) {
  const [h, a] = m.sides;
  const sh = cachedStrength(game, m, h);
  const sa = cachedStrength(game, m, a);
  const S = [sh, sa];
  const mh = Math.pow(sh.mid * HOME_MID, POSS_EXP);
  const ma = Math.pow(sa.mid, POSS_EXP);
  const share = [mh / (mh + ma), ma / (mh + ma)];
  const possSide = rng.next() < share[0] ? 0 : 1;
  m.sides[possSide].stats.poss++;
  m.ball = { side: possSide, zone: rng.float(0.25, 0.7), carrier: pickPlayer(game, rng, m.sides[possSide], { G: 0.2, D: 1, M: 2, F: 1.2 }) };

  for (let i = 0; i < 2; i++) {
    const me = m.sides[i];
    const op = m.sides[1 - i];
    const myI = (effectiveIntent(m, i) - 50) / 50;
    const opI = (effectiveIntent(m, 1 - i) - 50) / 50;
    const ratio = S[i].att / Math.max(1, S[1 - i].def);
    let rate = CHANCE_RATE * share[i] * Math.pow(ratio, CHANCE_EXP)
      * (1 + 0.32 * myI) * (1 + 0.22 * opI) * styleEdge(me.tactics.style, op.tactics.style);
    if (i === 0) rate *= m.homeEdge ?? HOME_CHANCE;
    // Through-balls live on pace: fast forwards against slow defenders.
    if (me.tactics.style === 'through') rate *= 0.95 * Math.pow(S[i].pace / Math.max(1, S[1 - i].defPace), 0.6);
    if (rng.next() < rate) chance(game, m, rng, i, S);

    // Fouls and cards (committed by side i).
    if (rng.next() < FOUL_RATE * (1 + 0.15 * opI)) {
      me.stats.fouls++;
      if (rng.next() < DANGEROUS_FOUL) freeKick(game, m, rng, i, S);
      if (rng.next() < YELLOW_PER_FOUL) {
        // Booked players are more careful, so they're less likely to be booked again.
        let id = pickPlayer(game, rng, me, { G: 0.1, D: 3, M: 2, F: 1 }, null, true);
        if (id && me.yellow[id] && rng.chance(0.6)) id = null;
        if (id) {
          if (me.yellow[id]) {
            push(m, { type: 'red', side: i, playerId: id, second: true });
            me.stats.yellow++;
            sendOff(game, m, i, id);
          } else {
            me.yellow[id] = true;
            me.stats.yellow++;
            me.rating[id] -= 0.4;
            push(m, { type: 'yellow', side: i, playerId: id });
          }
        }
      }
    }
    if (rng.next() < STRAIGHT_RED) {
      const id = pickPlayer(game, rng, me, { G: 0.3, D: 3, M: 2, F: 1 }, null, true);
      if (id) { push(m, { type: 'red', side: i, playerId: id }); sendOff(game, m, i, id); }
    }
    // Injuries: overloaded and less robust players are more at risk.
    const onField = me.slots.filter(Boolean);
    const risk = onField.length ? onField.reduce((s, id) => s + (me.injRisk?.[id] ?? 1), 0) / onField.length : 1;
    if (rng.next() < INJURY_RATE * risk * pitchInjury(m.pitch ?? 7)) {
      const id = rng.weighted(onField, (x) => (me.injRisk?.[x] ?? 1) * (game.players[x].pos === 'G' ? 0.5 : 1));
      if (id) handleInjury(game, m, i, id, rng);
    }

    // Energy
    const drain = ENERGY_DRAIN * (1 + 0.25 * myI);
    for (const id of me.slots) {
      if (!id) continue;
      me.energy[id] = Math.max(0, me.energy[id] - drain * (me.ageDrain[id] ?? 1) * rng.float(0.8, 1.2));
    }
  }
}

function chance(game, m, rng, i, S) {
  const me = m.sides[i];
  const op = m.sides[1 - i];
  me.stats.shots++;
  const penalty = rng.next() < PENALTY_SHARE;
  let shooter;
  if (penalty) {
    shooter = me.slots.includes(me.penaltyId) ? me.penaltyId : onPitch(me).filter((id) => game.players[id].pos !== 'G')
      .sort((x, y) => game.players[y].skill - game.players[x].skill)[0];
  } else {
    shooter = pickPlayer(game, rng, me, { G: 0, D: 0.7, M: 2.4, F: 3.4 });
  }
  if (!shooter) return;
  // Crossing teams turn many chances into aerial duels: a big target man wins
  // them and gets a good header; lose the duel and the chance is gone.
  if (!penalty && me.tactics.style === 'crosses' && rng.next() < CROSS_AERIAL) {
    const target = rng.weighted(onPitch(me).filter((id) => game.players[id].pos !== 'G'),
      (id) => ({ D: 0.8, M: 1, F: 3 }[game.players[id].pos]) * Math.pow(aerial(game.players[id]), 2));
    const winger = me.slots.find((id, k) => id && WIDE_ROLES.has(me.slotRoles[k]) && id !== target);
    m.ball = { side: i, zone: 0.92, carrier: target };
    if (!aerialDuel(game, rng, me, target, op, winger ? game.players[winger].tec : null)) {
      push(m, { type: 'miss', side: i, playerId: target, header: true, duelLost: true });
      return;
    }
    const conv = headerConversion(game, me, target, op, S, i);
    shotOutcome(game, m, rng, i, target, conv, { header: true, assistId: winger || null });
    return;
  }
  const slot = me.slots.indexOf(shooter);
  const shotEff = effSkill(game, me, shooter, me.slotPos[slot]);
  const gk = Math.max(1, S[1 - i].gk);
  let conv = penalty ? 0.76 * Math.pow(shotEff / gk, 0.3) : CONVERSION * Math.pow(shotEff / gk, FINISH_EXP);
  if (me.tactics.style === 'through') conv *= 1.08;
  conv = clamp(conv, 0.02, 0.92);
  m.ball = { side: i, zone: 0.92, carrier: shooter };
  if (penalty) {
    const fouler = pickPlayer(game, rng, op, { G: 0.3, D: 3, M: 1, F: 0.3 });
    push(m, { type: 'penalty', side: i, playerId: shooter, foulerId: fouler });
  }
  const assist = !penalty && rng.next() < 0.75 ? pickPlayer(game, rng, me, { G: 0.05, D: 1, M: 3, F: 2 }, shooter) : null;
  const outcome = shotOutcome(game, m, rng, i, shooter, conv, { penalty, assistId: assist });
  if (outcome !== 'goal' && rng.next() < 0.3) corner(game, m, rng, i, S);
}

// Resolves a shot: goal, save or miss, with ratings, stats and the event.
function shotOutcome(game, m, rng, i, shooter, conv, flags = {}) {
  const me = m.sides[i];
  const op = m.sides[1 - i];
  const gkId = op.slots.find((id, k) => id && op.slotPos[k] === 'G');
  const r = rng.next();
  const ev = { side: i, playerId: shooter, ...flags };
  if (r < conv) {
    me.goals++;
    me.stats.onTarget++;
    me.rating[shooter] += 1.1;
    if (flags.assistId) me.rating[flags.assistId] += 0.6;
    if (gkId) op.rating[gkId] -= 0.35;
    push(m, { type: 'goal', ...ev });
    return 'goal';
  }
  if (r < conv + (1 - conv) * ON_TARGET) {
    me.stats.onTarget++;
    if (gkId) op.rating[gkId] += 0.25;
    push(m, { type: flags.penalty ? 'penmiss' : 'save', ...ev, gkId });
    return 'save';
  }
  push(m, { type: flags.penalty ? 'penmiss' : 'miss', ...ev, post: rng.next() < 0.08 });
  return 'miss';
}

// A corner kick: a quarter of them reach a man in the box, where an aerial
// duel decides whether he gets a header. The taker's delivery (technique) helps.
function corner(game, m, rng, i, S) {
  const me = m.sides[i];
  const op = m.sides[1 - i];
  me.stats.corners++;
  const taker = me.slots.includes(me.setPieceId) ? me.setPieceId
    : pickPlayer(game, rng, me, { G: 0, D: 0.3, M: 2, F: 1 });
  push(m, { type: 'corner', side: i, playerId: taker });
  if (rng.next() >= 0.25) return;
  const cands = onPitch(me).filter((id) => id !== taker && game.players[id].pos !== 'G');
  if (!cands.length) return;
  // The tall ones go up for corners.
  const header = rng.weighted(cands, (id) => ({ D: 2, M: 1, F: 2 }[game.players[id].pos]) * Math.pow(aerial(game.players[id]), 2));
  const delivery = taker ? (game.players[taker].tec ?? game.players[taker].skill) : S[i].mid;
  if (!aerialDuel(game, rng, me, header, op, delivery)) return;
  me.stats.shots++;
  const conv = headerConversion(game, me, header, op, S, i, delivery);
  shotOutcome(game, m, rng, i, header, conv * 0.55, { header: true, assistId: taker });
}

// A foul by side `fouler` near its own goal gives the other side a direct
// free kick, taken by their set-piece taker.
function freeKick(game, m, rng, fouler, S) {
  const i = 1 - fouler;
  const me = m.sides[i];
  const taker = me.slots.includes(me.setPieceId) ? me.setPieceId
    : pickPlayer(game, rng, me, { G: 0, D: 0.3, M: 2, F: 1.5 });
  if (!taker) return;
  me.stats.shots++;
  me.stats.freeKicks = (me.stats.freeKicks || 0) + 1;
  const conv = clamp(FREE_KICK_CONV * Math.pow(game.players[taker].skill / Math.max(1, S[fouler].gk), FINISH_EXP), 0.02, 0.3);
  push(m, { type: 'freekick', side: i, playerId: taker });
  shotOutcome(game, m, rng, i, taker, conv, { freekick: true });
}

function penaltyShootout(game, m, rng) {
  const score = [0, 0];
  const takers = m.sides.map((s) => onPitch(s).filter((id) => game.players[id].pos !== 'G')
    .sort((x, y) => game.players[y].skill - game.players[x].skill));
  const gks = m.sides.map((s, k) => {
    const id = s.slots.find((x, j) => x && s.slotPos[j] === 'G');
    return id ? game.players[id].skill : 30;
  });
  const kicks = [];
  const kick = (i, n) => {
    const t = takers[i][n % takers[i].length];
    const p = clamp(0.76 * Math.pow(game.players[t].skill / gks[1 - i], 0.3), 0.5, 0.92);
    const ok = rng.next() < p;
    if (ok) score[i]++;
    kicks.push({ side: i, playerId: t, scored: ok });
  };
  for (let n = 0; n < 5; n++) {
    kick(0, n);
    if (score[0] > score[1] + (5 - n)) break;
    if (score[1] + (5 - n) < score[0]) break;
    kick(1, n);
    if (score[1] > score[0] + (4 - n) || score[0] > score[1] + (4 - n)) break;
  }
  for (let n = 5; score[0] === score[1] && n < 40; n++) { kick(0, n); kick(1, n); }
  m.pens = { h: score[0], a: score[1], kicks };
  push(m, { type: 'pens', side: score[0] > score[1] ? 0 : 1, h: score[0], a: score[1] });
}

// Final player ratings: result, goals conceded for the back line, shooting
// for attackers, stamina, and a little noise. Clamped to 3..10.
function finalizeRatings(game, m, rng) {
  m.sides.forEach((side, i) => {
    const op = m.sides[1 - i];
    const diff = side.goals - op.goals;
    const res = diff > 0 ? 0.35 : diff < 0 ? -0.35 : 0;
    const share = side.stats.poss / Math.max(1, side.stats.poss + op.stats.poss);
    for (const id of side.played) {
      const pos = game.players[id].pos;
      let r = side.rating[id] + res + (share - 0.5) * (pos === 'M' ? 1.2 : 0.4);
      if (pos === 'G' || pos === 'D') r += op.goals === 0 ? 0.5 : -0.2 * op.goals;
      if (pos === 'F') r += Math.min(0.6, side.stats.onTarget * 0.05) - (side.goals === 0 ? 0.3 : 0);
      r += (side.energy[id] - 70) / 100 + rng.normal(0, 0.3);
      side.rating[id] = Math.round(clamp(r, 3, 10) * 10) / 10;
    }
  });
}

function startPeriod(m, rng, period) {
  m.period = period;
  m.clock = 0;
  m.added = period === '1H' ? rng.int(0, 3) : period === '2H' ? rng.int(1, 5) : rng.int(0, 2);
  m.minute = PERIOD_START[period];
  push(m, { type: 'kickoff', period });
}

// Advances the match by one minute (or across a break). Returns new events.
export function step(game, m) {
  if (m.finished) return [];
  const rng = new Rng(m.rng);
  const before = m.events.length;
  if (m.period === 'PRE') { startPeriod(m, rng, '1H'); return m.events.slice(before); }
  if (m.period === 'HT') { startPeriod(m, rng, '2H'); return m.events.slice(before); }
  if (m.period === 'ETB') { startPeriod(m, rng, 'ET1'); return m.events.slice(before); }

  m.clock++;
  m.minute = PERIOD_START[m.period] + Math.min(m.clock, periodLen(m.period));
  playMinute(game, m, rng);
  for (let i = 0; i < 2; i++) {
    if (m.sides[i].ai && m.period !== '1H' && m.clock <= periodLen(m.period) && [58, 68, 78].includes(m.minute)) {
      aiSubs(game, m, i, 2);
    }
  }

  if (m.clock >= periodLen(m.period) + m.added) {
    const draw = totalGoals(m, 0) === totalGoals(m, 1);
    if (m.period === '1H') { m.period = 'HT'; push(m, { type: 'half' }); }
    else if (m.period === '2H' && m.needsWinner && draw) {
      m.period = 'ETB';
      m.extraTime = true;
      push(m, { type: 'fulltime90' });
    }
    else if (m.period === 'ET1') startPeriod(m, rng, 'ET2');
    else {
      if (m.period === 'ET2' && draw) penaltyShootout(game, m, rng);
      m.period = 'FT';
      m.finished = true;
      finalizeRatings(game, m, rng);
      push(m, { type: 'full' });
    }
  }
  return m.events.slice(before);
}

export function runToEnd(game, m) {
  while (!m.finished) step(game, m);
  return m;
}

// Goals for a side including the first leg (two-legged ties).
export const totalGoals = (m, i) => m.sides[i].goals + (m.agg ? m.agg[i] : 0);

export function winnerSide(m) {
  const [h, a] = [totalGoals(m, 0), totalGoals(m, 1)];
  if (h !== a) return h > a ? 0 : 1;
  if (m.pens) return m.pens.h > m.pens.a ? 0 : 1;
  return null;
}

export const displayMinute = (m) => {
  const len = periodLen(m.period);
  const extra = m.clock > len ? m.clock - len : 0;
  return extra ? `${PERIOD_START[m.period] + len}+${extra}` : `${m.minute}`;
};
