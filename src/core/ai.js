// AI decisions. For now: picking a lineup for a formation.

import { FORMATIONS, ROLE_POS } from './data.js';

// A player outside his natural position plays at 70% of his skill; a keeper
// playing outfield, or an outfield player in goal, at only 25%.
export const OUT_OF_POSITION = 0.7;
export const GK_SWAP = 0.25;

// How well a player of position `pos` plays in a slot of position `slot`.
export function positionFit(pos, slot) {
  if (pos === slot) return 1;
  return pos === 'G' || slot === 'G' ? GK_SWAP : OUT_OF_POSITION;
}

// The skill a player actually brings to a slot.
export const slotSkill = (p, slotPos) => Math.round(p.skill * positionFit(p.pos, slotPos));

export const isAvailable = (p) => !p.retired && (p.injuryDays || 0) <= 0 && (p.suspension || 0) <= 0;

function pickScore(p, slotPos, favour = 0) {
  const energy = 0.6 + 0.4 * ((p.energy ?? 100) / 100);
  return p.skill * positionFit(p.pos, slotPos) * energy + (p.form || 0) * 0.5 + favour;
}

// A B-team partner gives the parent club's loanees regular games, even when
// they are still well below the partner's level (that's the point of a B-team).
const partnerFavour = (game, club, p) => (p.loan && game.clubs[p.loan.parentId]?.partnerId === club.id ? 25 : 0);

// Returns { formation, slots: [playerId x11], bench: [playerId], captainId }.
export function autoLineup(game, club, formation = club.tactics?.formation || '4-4-2') {
  const players = club.squad.map((id) => game.players[id]).filter(isAvailable);
  const slotPos = FORMATIONS[formation].map(([role]) => ROLE_POS[role]);
  const slots = new Array(slotPos.length).fill(null);
  const used = new Set();

  // Fill scarce groups first so a strong midfielder isn't wasted at full-back.
  for (const group of ['G', 'F', 'D', 'M']) {
    const idx = slotPos.map((p, i) => (p === group ? i : -1)).filter((i) => i >= 0);
    for (const i of idx) {
      let best = null;
      let bestScore = -1;
      for (const p of players) {
        if (used.has(p.id)) continue;
        const s = pickScore(p, group, partnerFavour(game, club, p));
        if (s > bestScore) { bestScore = s; best = p; }
      }
      if (best) { slots[i] = best.id; used.add(best.id); }
    }
  }

  const rest = players.filter((p) => !used.has(p.id)).sort((a, b) => b.skill - a.skill);
  const bench = [];
  const take = (pred) => {
    const p = rest.find((x) => pred(x) && !bench.includes(x.id));
    if (p) bench.push(p.id);
  };
  take((p) => p.pos === 'G');
  take((p) => p.pos === 'D');
  take((p) => p.pos === 'M');
  take((p) => p.pos === 'F');
  for (const p of rest) {
    if (bench.length >= 7) break;
    if (!bench.includes(p.id) && p.pos !== 'G') bench.push(p.id);
  }

  const xi = slots.filter(Boolean).map((id) => game.players[id]);
  const captain = xi.reduce((b, p) => {
    const s = p.skill + Math.min(10, (game.season.year - p.birthYear) - 20);
    return !b || s > b.s ? { s, id: p.id } : b;
  }, null);

  return { formation, slots, bench, captainId: captain ? captain.id : null };
}
