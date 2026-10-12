// Pre-season tour: before the first league match the user picks one of three
// tours. Each brings three friendlies against foreign clubs of a similar level
// and costs money, and they lift morale and teamwork by different amounts.
//
// Friendlies count for nothing: no tables, stats, records, gate money, board
// verdicts or suspensions. Energy, fatigue, form, injuries and teamwork work
// as in any match.

import { Rng, hashSeed } from './rng.js';
import { expectedWageBill, clubLevel } from './finance.js';
import { newFixture } from './calendar.js';
import { addNews } from './season.js';

export const FRIENDLY_ID = 'FRIENDLY';
// Days before the first league weekend (a Saturday): Wednesday, Saturday, Wednesday.
export const FRIENDLY_DAYS = [10, 7, 3];

// cost: share of the club's yearly wage bill. fees: appearance money per
// friendly, the same share times (reputation / 70)^3, so only big names earn
// back the long trip. level: opponents' strength against the user's club.
export const TOURS = [
  { key: 'camp', name: 'Mountain training camp', place: 'Austria', cost: 0.012, fees: 0, morale: 3, teamwork: 10, level: -2,
    text: 'Hard work and few distractions. The squad grows together most, but nobody calls it a holiday.' },
  { key: 'coast', name: 'Seaside tour', place: 'Portugal', cost: 0.025, fees: 0, morale: 9, teamwork: 5, level: 0,
    text: 'Sun, good hotels and matches at the coast. The players love it.' },
  { key: 'world', name: 'Summer tour', place: 'the USA', cost: 0.06, fees: 0.016, morale: 6, teamwork: 2, level: 4,
    text: 'Big stadiums and stronger opponents. Expensive, but appearance fees can pay for it if your name is big enough.' },
];

const tourOf = (key) => TOURS.find((t) => t.key === key);

// Money for one tour: { cost, fees } (fees for all three friendlies).
export function tourMoney(game, club, tour) {
  const wages = expectedWageBill(game, club);
  const fees = tour.fees * wages * (club.reputation / 70) ** 3 * FRIENDLY_DAYS.length;
  return { cost: Math.round((tour.cost * wages) / 1000) * 1000, fees: Math.round(fees / 1000) * 1000 };
}

export function ensureFriendlies(game) {
  if (!game.competitions[FRIENDLY_ID]) {
    game.competitions[FRIENDLY_ID] = { id: FRIENDLY_ID, type: 'friendly', name: 'Friendly', baseName: 'Friendly', clubIds: [], nationId: null };
  }
  return game.competitions[FRIENDLY_ID];
}

export const isFriendly = (game, f) => game.competitions[f.compId]?.type === 'friendly';

// Can the user still choose a tour this season?
export function tourDue(game) {
  const club = game.clubs[game.userClubId];
  if (!club || game.manager?.sacked || game.season.phase !== 'season') return false;
  if (club.tour?.year === game.season.year) return false;
  return game.day < game.season.start - FRIENDLY_DAYS[0];
}

// Three foreign opponents of about the user's level (plus the tour's level).
export function tourOpponents(game, tourKey) {
  const user = game.clubs[game.userClubId];
  const tour = tourOf(tourKey);
  const rng = new Rng({ s: hashSeed(`${game.seed}:tour:${user.id}:${game.season.year}:${tourKey}`) });
  const target = clubLevel(game, user) + tour.level;
  const foreign = Object.values(game.clubs).filter((c) => c.nationId !== user.nationId);
  for (const width of [3, 5, 8, 12, 99]) {
    const near = foreign.filter((c) => Math.abs(clubLevel(game, c) - target) <= width);
    if (near.length >= FRIENDLY_DAYS.length) return rng.shuffle(near).slice(0, FRIENDLY_DAYS.length).map((c) => c.id);
  }
  return [];
}

export function chooseTour(game, tourKey) {
  const tour = tourOf(tourKey);
  const club = game.clubs[game.userClubId];
  if (!tour || !tourDue(game)) return { ok: false, message: 'Too late for a pre-season tour.' };
  const { cost, fees } = tourMoney(game, club, tour);
  const comp = ensureFriendlies(game);
  const opponents = tourOpponents(game, tourKey);
  const busy = new Set(Object.values(game.fixtures).filter((f) => f.homeId === club.id || f.awayId === club.id).map((f) => f.day));
  const fixtureIds = [];
  FRIENDLY_DAYS.forEach((before, i) => {
    const day = game.season.start - before;
    const opp = opponents[i];
    if (!opp || busy.has(day) || day <= game.day) return;
    // On tour the hosts are the home side.
    fixtureIds.push(newFixture(game, comp.id, day, i + 1, opp, club.id, { friendly: tour.key }).id);
  });
  // The cost is paid now, the appearance fees with it (they're agreed up front).
  const net = cost - fees;
  club.budget -= net;
  club.finance.season.tour = (club.finance.season.tour || 0) + net;
  club.teamwork = Math.min(100, (club.teamwork ?? 60) + tour.teamwork);
  for (const id of club.squad) {
    const p = game.players[id];
    if (p.mood) p.mood.events += tour.morale;
  }
  club.tour = { year: game.season.year, key: tour.key, fixtureIds };
  addNews(game, `Pre-season: ${tour.name} in ${tour.place} with friendlies against ${opponents.map((id) => game.clubs[id].name).join(', ')}.`, 'club');
  return { ok: true, message: `${tour.name} booked.` };
}

// Friendlies change nothing that counts; players still tire, get injured,
// find form and learn to play together.
export function applyFriendly(game, f, m, { updateTeamwork, matchLoad, updateForm, rng }) {
  const [hs, as] = m.sides;
  const evs = m.events;
  const result = {
    h: hs.goals,
    a: as.goals,
    friendly: true,
    goals: evs.filter((e) => e.type === 'goal').map((e) => ({ side: e.side, playerId: e.playerId, minute: e.minute,
      added: e.added, penalty: e.penalty || undefined, freekick: e.freekick || undefined })),
    cards: evs.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => ({ side: e.side, playerId: e.playerId,
      minute: e.minute, red: e.type === 'red' })),
  };
  const user = f.homeId === game.userClubId || f.awayId === game.userClubId;
  if (user) {
    result.stats = [hs.stats, as.stats];
    result.events = evs.filter((e) => e.type !== 'kickoff');
    result.lineups = m.sides.map((s) => ({ formation: s.formation, played: s.played, ratings: s.rating }));
  }
  f.result = result;
  m.sides.forEach((side, i) => {
    const club = game.clubs[side.clubId];
    updateTeamwork(club, club.lineup.slots.filter(Boolean));
    for (const id of side.played) {
      const p = game.players[id];
      p.energy = Math.round(side.energy[id]);
      matchLoad(p);
      updateForm(p, side.rating[id], rng);
    }
    for (const inj of side.injured) {
      const p = game.players[inj.id];
      p.injuryDays = Math.max(p.injuryDays, inj.days);
      if (club.id === game.userClubId) {
        addNews(game, `${p.first} ${p.last} was injured in the friendly against ${game.clubs[m.sides[1 - i].clubId].name} and will be out for ${inj.days} days.`, 'injury');
      }
    }
  });
  return result;
}
