// Market value and wage of a player.

export const ageOf = (p, year) => year - p.birthYear;

export function playerValue(p, year) {
  const age = ageOf(p, year);
  let v = 100000 * Math.exp((p.skill - 50) / 7);
  v *= age <= 21 ? 1.3 : age <= 24 ? 1.2 : age <= 28 ? 1 : age <= 30 ? 0.8 : age <= 32 ? 0.55 : 0.3;
  v *= 1 + Math.max(0, p.potential - p.skill) * 0.04 * (age <= 23 ? 1 : 0.3);
  if (p.pos === 'G') v *= 0.8;
  return v >= 1e6 ? Math.round(v / 1e5) * 1e5 : Math.round(v / 1e4) * 1e4;
}

// Yearly wage: paid for current ability, not potential (otherwise squads full of
// prospects slowly price clubs out of business).
export function playerWage(p, year) {
  const age = ageOf(p, year);
  let w = 100000 * Math.exp((p.skill - 50) / 7) * 0.13;
  if (p.pos === 'G') w *= 0.8;
  if (age >= 30) w *= 1.15;
  return Math.max(15000, Math.round(w / 1000) * 1000);
}
