// Team-level numbers shown in the UI (and later used by the match engine).

import { ageOf } from './valuation.js';
import { FORMATIONS, ROLE_POS } from './data.js';
import { slotSkill } from './ai.js';

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Average effective skill of a lineup's XI (out-of-position players count at 70%).
export function lineupSkill(game, lineup) {
  if (!lineup) return 0;
  const roles = FORMATIONS[lineup.formation];
  return avg(lineup.slots.map((id, i) => (id ? slotSkill(game.players[id], ROLE_POS[roles[i][0]]) : null))
    .filter((x) => x !== null));
}

export const lineupQuality = (game, club) => lineupSkill(game, club.lineup);

export function squadSummary(game, club, ids = club.squad) {
  const ps = ids.map((id) => game.players[id]);
  return {
    skill: avg(ps.map((p) => p.skill)),
    value: ps.reduce((s, p) => s + p.value, 0),
    age: avg(ps.map((p) => ageOf(p, game.season.year))),
    wages: ps.reduce((s, p) => s + p.wage, 0),
  };
}
