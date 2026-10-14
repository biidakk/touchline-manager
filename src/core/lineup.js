// Lineup editing for the user's team: moving players between the XI, the
// bench and the reserves, formation changes, repairs and saved lineups.

import { FORMATIONS, ROLE_POS } from './data.js';
import { positionFit, isAvailable, autoLineup } from './ai.js';
import { aerial, attrOf, mentalOf } from './attributes.js';

export const BENCH_SIZE = 7;

export const slotPositions = (formation) => FORMATIONS[formation].map(([r]) => ROLE_POS[r]);

export function cloneLineup(l) {
  return { formation: l.formation, slots: l.slots.slice(), bench: l.bench.slice(), captainId: l.captainId ?? null,
    setPieceId: l.setPieceId ?? null, penaltyId: l.penaltyId ?? null };
}

// Where a player currently is: { zone: 'slot'|'bench'|'reserve', index }.
export function locate(lineup, pid) {
  let i = lineup.slots.indexOf(pid);
  if (i >= 0) return { zone: 'slot', index: i };
  i = lineup.bench.indexOf(pid);
  if (i >= 0) return { zone: 'bench', index: i };
  return { zone: 'reserve', index: -1 };
}

function occupant(lineup, target) {
  if (target.zone === 'slot') return lineup.slots[target.index] || null;
  if (target.zone === 'bench') return lineup.bench[target.index] || null;
  return null;
}

function put(lineup, target, pid) {
  if (target.zone === 'slot') lineup.slots[target.index] = pid;
  else if (target.zone === 'bench') {
    if (pid) {
      if (target.index >= 0 && target.index < lineup.bench.length) lineup.bench[target.index] = pid;
      else lineup.bench.push(pid);
    } else lineup.bench.splice(target.index, 1);
  }
}

// Moves player `pid` to `target`. Whoever was there takes pid's old place
// (a swap); a full bench pushes its displaced player to the reserves.
export function placePlayer(lineup, pid, target) {
  const l = cloneLineup(lineup);
  const from = locate(l, pid);
  if (from.zone === target.zone && from.index === target.index) return l;
  if (target.zone === 'bench' && (target.index < 0 || target.index >= l.bench.length)) {
    if (from.zone === 'bench') return l;
    if (l.bench.length >= BENCH_SIZE) return l; // dropping on the bench area when full does nothing
    if (from.zone === 'slot') l.slots[from.index] = null;
    l.bench.push(pid);
    return fixRoles(l);
  }
  const other = occupant(l, target);
  if (target.zone === 'reserve') {
    if (from.zone === 'slot') l.slots[from.index] = null;
    if (from.zone === 'bench') l.bench.splice(from.index, 1);
    return fixRoles(l);
  }
  // target is a slot or an occupied bench place
  if (from.zone === 'slot') l.slots[from.index] = other;
  else if (from.zone === 'bench') {
    if (other) l.bench[from.index] = other;
    else l.bench.splice(from.index, 1);
  }
  // from reserve: `other` simply drops to the reserves
  put(l, target, pid);
  return fixRoles(l);
}

// Captain / set pieces / penalties must be in the XI; otherwise clear them.
function fixRoles(l) {
  for (const k of ['captainId', 'setPieceId', 'penaltyId']) if (l[k] && !l.slots.includes(l[k])) l[k] = null;
  return l;
}

// Rearranges the same XI into a new formation, matching positions greedily.
export function reshapeLineup(game, lineup, formation) {
  const l = cloneLineup(lineup);
  const oldIds = l.slots.filter(Boolean);
  const pos = slotPositions(formation);
  const slots = new Array(pos.length).fill(null);
  const left = new Set(oldIds);
  // Natural positions first, then best fit.
  for (const pass of [true, false]) {
    pos.forEach((sp, i) => {
      if (slots[i]) return;
      let best = null;
      let bestS = -1;
      for (const id of left) {
        const p = game.players[id];
        if (pass && p.pos !== sp) continue;
        const s = p.skill * positionFit(p.pos, sp);
        if (s > bestS) { bestS = s; best = id; }
      }
      if (best) { slots[i] = best; left.delete(best); }
    });
  }
  l.formation = formation;
  l.slots = slots;
  return fixRoles(l);
}

// Replaces unavailable (injured/suspended/departed) players. Returns
// { lineup, changes: [{ outId, inId }] }.
export function repairLineup(game, club, lineup) {
  if (!lineup) return { lineup: autoLineup(game, club), changes: [] };
  const l = cloneLineup(lineup);
  const ok = (id) => id && club.squad.includes(id) && isAvailable(game.players[id]);
  const changes = [];
  l.bench = l.bench.filter(ok);
  const pos = slotPositions(l.formation);
  l.slots.forEach((id, i) => {
    if (ok(id)) return;
    const pool = club.squad.filter((x) => !l.slots.includes(x) && ok(x));
    // Prefer bench players, then reserves; best fit for the slot.
    const score = (x) => game.players[x].skill * positionFit(game.players[x].pos, pos[i]) + (l.bench.includes(x) ? 2 : 0);
    const best = pool.sort((a, b) => score(b) - score(a))[0] || null;
    if (best) {
      l.bench = l.bench.filter((b) => b !== best);
      changes.push({ outId: id || null, inId: best, slot: i });
    }
    l.slots[i] = best;
  });
  // Top the bench back up.
  const rest = club.squad.filter((x) => ok(x) && !l.slots.includes(x) && !l.bench.includes(x))
    .sort((a, b) => game.players[b].skill - game.players[a].skill);
  if (!l.bench.some((x) => game.players[x].pos === 'G')) {
    const gk = rest.find((x) => game.players[x].pos === 'G');
    if (gk && l.bench.length < BENCH_SIZE) { l.bench.push(gk); rest.splice(rest.indexOf(gk), 1); }
  }
  for (const x of rest) {
    if (l.bench.length >= BENCH_SIZE) break;
    if (game.players[x].pos !== 'G') l.bench.push(x);
  }
  fixRoles(l);
  return { lineup: l, changes };
}

// Captain, set-piece and penalty takers actually used (explicit or automatic).
export function roleTakers(game, lineup) {
  const xi = lineup.slots.filter(Boolean).map((id) => game.players[id]);
  const best = (pred, key) => xi.filter(pred).sort((a, b) => key(b) - key(a))[0]?.id ?? null;
  const year = game.season.year;
  return {
    captainId: lineup.captainId ?? best(() => true, (p) => mentalOf(p, 'ldr', year) + 0.2 * p.skill),
    setPieceId: lineup.setPieceId ?? best((p) => p.pos !== 'G', (p) => attrOf(p, 'cro') + 0.5 * attrOf(p, 'fin')),
    penaltyId: lineup.penaltyId ?? best((p) => p.pos === 'F' || p.pos === 'M', (p) => attrOf(p, 'fin')),
  };
}

// How well the XI suits each attacking style, as shares of 100 (the
// reference screen shows these under Passing / Crosses / Through-balls).
export function styleShares(game, lineup) {
  const pos = slotPositions(lineup.formation);
  const roles = FORMATIONS[lineup.formation].map(([r]) => r);
  const wideRoles = new Set(['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW']);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const of = (pred, val) => avg(lineup.slots.map((id, i) => (id && pred(i) ? val(game.players[id]) : null)).filter((x) => x !== null));
  // Passing: midfield passing. Crosses: wide players' crossing plus the
  // forwards' power in the air. Through-balls: forwards' pace.
  const w = {
    passing: of((i) => pos[i] === 'M', (p) => attrOf(p, 'pas')),
    crosses: 0.5 * of((i) => wideRoles.has(roles[i]), (p) => attrOf(p, 'cro')) + 0.5 * of((i) => pos[i] === 'F', (p) => aerial(p)),
    through: of((i) => pos[i] === 'F', (p) => attrOf(p, 'pac')),
  };
  const pw = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.pow(Math.max(1, v), 4)]));
  const total = pw.passing + pw.crosses + pw.through;
  const out = {};
  let sum = 0;
  for (const k of ['passing', 'crosses']) { out[k] = Math.round((100 * pw[k]) / total); sum += out[k]; }
  out.through = 100 - sum;
  return out;
}

export function saveLineupSlot(club, key, lineup) {
  club.savedLineups[key] = { ...cloneLineup(lineup), intent: club.tactics.intent, style: club.tactics.style };
}

export function loadLineupSlot(game, club, key) {
  const s = club.savedLineups[key];
  if (!s) return null;
  club.tactics.formation = s.formation;
  club.tactics.intent = s.intent ?? club.tactics.intent;
  club.tactics.style = s.style ?? club.tactics.style;
  return repairLineup(game, club, cloneLineup(s)).lineup;
}

// Teamwork rises when the same players keep starting together.
export function updateTeamwork(club, xi) {
  const last = club.lastXI || [];
  const same = xi.filter((id) => last.includes(id)).length;
  const tw = club.teamwork ?? 60;
  club.teamwork = Math.max(20, Math.min(100, Math.round(tw + (last.length ? (same - 8) * 1.2 : 0))));
  club.lastXI = xi.slice();
}
