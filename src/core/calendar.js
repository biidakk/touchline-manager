// Dates (stored as integer day numbers, UTC days since 1970-01-01), the
// season calendar, league fixtures and cup draws.

export const DAY_MS = 86400000;
export const dayOf = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
export const weekday = (day) => (day + 4) % 7; // 0 = Sunday
export const nextWeekday = (day, wd) => day + ((wd - weekday(day) + 7) % 7);

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(day, withWeekday = true) {
  const d = new Date(day * DAY_MS);
  const s = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withWeekday ? `${WD[d.getUTCDay()]} ${s}` : s;
}

export function seasonDates(year) {
  const start = nextWeekday(dayOf(year, 8, 8), 6);
  const end = dayOf(year + 1, 5, 31);
  const breakStart = dayOf(year, 12, 20);
  const breakEnd = dayOf(year + 1, 1, 31);
  const weekends = [];
  for (let d = start; d <= end; d += 7) {
    if (d < breakStart || d > breakEnd) weekends.push(d);
  }
  return { start, end, weekends };
}

// Double round robin (circle method). Returns rounds of [homeId, awayId] pairs.
export function roundRobin(ids, rng) {
  const t = rng.shuffle(ids.slice());
  if (t.length % 2) t.push(null);
  const n = t.length;
  const first = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      let a = t[i];
      let b = t[n - 1 - i];
      if (a === null || b === null) continue;
      if (i === 0 ? r % 2 === 1 : i % 2 === 1) [a, b] = [b, a];
      pairs.push([a, b]);
    }
    first.push(pairs);
    t.splice(1, 0, t.pop());
  }
  const second = first.map((pairs) => pairs.map(([a, b]) => [b, a]));
  return [...first, ...second];
}

export function newFixture(game, compId, day, round, homeId, awayId, extra = {}) {
  const id = 'f' + (game.ids.fixture = (game.ids.fixture || 0) + 1);
  const f = { id, compId, day, round, homeId, awayId, result: null, ...extra };
  game.fixtures[id] = f;
  return f;
}

// A two-legged knockout tie: the first leg at `homeId`, the return leg at the
// other club. Only the second leg decides the tie (on aggregate, then extra
// time and penalties).
export function newTie(game, compId, day1, day2, round, homeId, awayId, extra = {}) {
  const f1 = newFixture(game, compId, day1, round, homeId, awayId, { ...extra, leg: 1, knockout: false });
  const f2 = newFixture(game, compId, day2, round, awayId, homeId, { ...extra, leg: 2, firstLegId: f1.id, knockout: true });
  f1.secondLegId = f2.id;
  return [f1, f2];
}

// Fixtures that decide a knockout tie (single matches and second legs).
export const decidesTie = (f) => f.leg !== 1;

// Aggregate score of a second leg from its home side's view, or null.
export function aggregate(game, f) {
  if (f.leg !== 2 || !f.result) return null;
  const first = game.fixtures[f.firstLegId]?.result;
  if (!first) return null;
  return { h: f.result.h + first.a, a: f.result.a + first.h };
}

export function scheduleLeague(game, comp, dates, rng) {
  const rounds = roundRobin(comp.clubIds, rng);
  const W = dates.weekends.length;
  const R = rounds.length;
  comp.fixtureIds = [];
  comp.rounds = R;
  rounds.forEach((pairs, i) => {
    const day = dates.weekends[Math.round((i * (W - 1)) / (R - 1))];
    for (const [h, a] of pairs) comp.fixtureIds.push(newFixture(game, comp.id, day, i + 1, h, a).id);
  });
}

export function cupRoundName(k, R) {
  const left = R - k;
  return left === 1 ? 'Final' : left === 2 ? 'Semi-finals' : left === 3 ? 'Quarter-finals'
    : left === 4 ? 'Round of 16' : left === 5 ? 'Round of 32' : `Round ${k + 1}`;
}

export function scheduleCup(game, comp, dates) {
  const R = Math.ceil(Math.log2(comp.clubIds.length));
  const W = dates.weekends.length;
  comp.rounds = [];
  for (let k = 0; k < R; k++) {
    const day = k === R - 1
      ? dates.weekends[W - 1] + 7
      : dates.weekends[Math.round(2 + (k * (W - 8)) / Math.max(1, R - 2))] + 4;
    const round = { name: cupRoundName(k, R), day, fixtureIds: [], byes: [], drawn: false };
    // The semi-finals are played over two legs, a week apart.
    if (k === R - 2) round.day2 = day + 7;
    comp.rounds.push(round);
  }
  comp.alive = comp.clubIds.slice();
}

// Draws cup round k from the clubs still alive. The strongest clubs get byes
// if the field isn't a power of two; a lower-tier club hosts a higher one.
export function drawCupRound(game, comp, k, rng) {
  const round = comp.rounds[k];
  const R = comp.rounds.length;
  const slots = 2 ** (R - k);
  const alive = comp.alive.slice();
  const tierOf = (id) => game.competitions[game.clubs[id].compId].tier;
  const byesNeeded = Math.max(0, slots - alive.length);
  alive.sort((a, b) => tierOf(a) - tierOf(b) || game.clubs[b].reputation - game.clubs[a].reputation);
  round.byes = alive.slice(0, byesNeeded);
  const playing = rng.shuffle(alive.slice(byesNeeded));
  round.fixtureIds = [];
  for (let i = 0; i + 1 < playing.length; i += 2) {
    let h = playing[i];
    let a = playing[i + 1];
    if (tierOf(h) < tierOf(a)) [h, a] = [a, h];
    if (round.day2) round.fixtureIds.push(...newTie(game, comp.id, round.day, round.day2, k + 1, h, a, { cupRound: k }).map((f) => f.id));
    else round.fixtureIds.push(newFixture(game, comp.id, round.day, k + 1, h, a, { cupRound: k }).id);
  }
  round.drawn = true;
}
