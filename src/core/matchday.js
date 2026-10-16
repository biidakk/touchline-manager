// Playing the calendar: daily updates, simulating fixtures, applying results
// to players, tables and cups.

import { createMatch, runToEnd, winnerSide } from './engine.js';
import { autoLineup } from './ai.js';
import { repairLineup, updateTeamwork } from './lineup.js';
import { drawCupRound, decidesTie, DAY_MS } from './calendar.js';
import { trainingDay, summerDay, matchLoad } from './training.js';
import { moraleDay, moraleAfterMatch } from './morale.js';
import { boardDay, boardAfterMatch, aiBoardAfterMatch } from './board.js';
import { receiveGate, payPrize, cupRoundPrize, monthlyFinances } from './finance.js';
import { dailyMarket, windows, newOffers } from './transfers.js';
import { afterResult, afterDay, boardVerdict, opponentPreview } from './newsfeed.js';
import { checkContinental, applyContinentalResult } from './continental.js';
import { progressConstruction } from './stadium.js';
import { progressFacilities } from './facilities.js';
import { progressScouting } from './scouting.js';
import { isNational, playNationalFixture, prepareNational, applyNationalResult, nationalMatchOpts, checkNational } from './national.js';
import { nationalAfterMatch, nationalDay } from './nationaljob.js';
import { addNews, sortedTable } from './season.js';
import { Rng } from './rng.js';
import { tickSkillMarks } from './attributes.js';
import { spellFor, clubMatchRecords } from './records.js';
import { applyFriendly, scheduleWinterFriendlies, WINTER_BREAK_START } from './preseason.js';
import { youthLeagueDay } from './youthleague.js';
import { recordGrowth } from './development.js';
import { checkMatchAchievements } from './achievements.js';

// The user's matches: his club's, and his national team's if he manages one.
export const isUserFixture = (game, f) => {
  const nat = game.manager?.national?.teamId;
  return f.homeId === game.userClubId || f.awayId === game.userClubId || (!!nat && (f.homeId === nat || f.awayId === nat));
};

// AI clubs pick their best available XI for every match. The user's lineup is
// kept; unavailable players are swapped out automatically (with a news item).
export function prepareLineup(game, club) {
  if (club.id !== game.userClubId) {
    club.lineup = autoLineup(game, club);
    return;
  }
  const { lineup, changes } = repairLineup(game, club, club.lineup);
  club.lineup = lineup;
  for (const c of changes) {
    const inP = game.players[c.inId];
    const outP = c.outId ? game.players[c.outId] : null;
    const why = !outP ? 'an empty place' : outP.injuryDays > 0 ? `the injured ${outP.last}`
      : outP.suspension > 0 ? `the suspended ${outP.last}` : outP.last;
    addNews(game, `Lineup change: ${inP.first} ${inP.last} starts in place of ${why}.`, 'club');
  }
}

export function createFixtureMatch(game, f, opts = {}) {
  const comp = game.competitions[f.compId];
  if (comp.type === 'national') {
    const [home, away] = prepareNational(game, f);
    return createMatch(game, f, { homeClub: home, awayClub: away, keepEvents: isUserFixture(game, f) || f.id === game.watchId, ...nationalMatchOpts(f), ...opts });
  }
  for (const id of [f.homeId, f.awayId]) prepareLineup(game, game.clubs[id]);
  // Second legs carry the first-leg score (this home side was away then).
  const first = f.leg === 2 ? game.fixtures[f.firstLegId]?.result : null;
  return createMatch(game, f, {
    needsWinner: (comp.type === 'cup' || !!f.knockout) && f.leg !== 1,
    firstLeg: first ? [first.a, first.h] : null,
    keepEvents: isUserFixture(game, f),
    ...opts,
  });
}

// For the report's "why": the starting elevens' average skill, the average
// energy of the players on the pitch at the end, and each side's intent.
export function matchAnalysis(game, m) {
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    skill: m.sides.map((s) => Math.round(mean(s.played.slice(0, 11).map((id) => game.players[id]?.skill || 0)) * 10) / 10),
    energy: m.sides.map((s) => Math.round(mean(s.slots.filter(Boolean).map((id) => s.energy[id] ?? 100)))),
    intent: m.sides.map((s) => s.tactics?.intent ?? 50),
  };
}

function updateForm(p, rating, rng) {
  if (rating >= 7.2 && rng.chance(0.55)) p.form = Math.min(2, p.form + 1);
  else if (rating <= 5.8 && rng.chance(0.55)) p.form = Math.max(-2, p.form - 1);
  else if (rng.chance(0.15)) p.form += p.form > 0 ? -1 : p.form < 0 ? 1 : 0;
}

export function applyResult(game, f, m) {
  const comp = game.competitions[f.compId];
  const rng = new Rng(game.rng);
  if (comp.type === 'friendly') return applyFriendly(game, f, m, { updateTeamwork, matchLoad, updateForm, rng });
  const [hs, as] = m.sides;
  const user = isUserFixture(game, f);
  const evs = m.events;
  const result = {
    h: hs.goals,
    a: as.goals,
    et: !!m.extraTime,
    pens: m.pens ? { h: m.pens.h, a: m.pens.a } : null,
    goals: evs.filter((e) => e.type === 'goal').map((e) => ({ side: e.side, playerId: e.playerId, minute: e.minute,
      added: e.added, penalty: e.penalty || undefined, freekick: e.freekick || undefined })),
    cards: evs.filter((e) => e.type === 'yellow' || e.type === 'red').map((e) => ({ side: e.side, playerId: e.playerId,
      minute: e.minute, red: e.type === 'red' })),
  };
  const w = winnerSide(m);
  if ((comp.type === 'cup' || f.knockout) && f.leg !== 1) result.winner = w === 0 ? f.homeId : f.awayId;
  if (m.agg) result.agg = { h: hs.goals + m.agg[0], a: as.goals + m.agg[1] };
  result.attendance = receiveGate(game, f).attendance;
  if (user) {
    result.stats = [hs.stats, as.stats];
    result.events = evs.filter((e) => e.type !== 'kickoff');
    result.lineups = m.sides.map((s) => ({ formation: s.formation, played: s.played, ratings: s.rating }));
    result.analysis = matchAnalysis(game, m);
  }
  f.result = result;

  m.sides.forEach((side, i) => {
    const club = game.clubs[side.clubId];
    updateTeamwork(club, club.lineup.slots.filter(Boolean));
    if (club.id === game.userClubId) moraleAfterMatch(game, club, side, w === i, w === 1 - i);
    for (const id of club.squad) {
      const p = game.players[id];
      if (p.suspension > 0 && !side.played.includes(id)) p.suspension--;
    }
    tickSkillMarks(game, club);
    for (const id of side.played) {
      const p = game.players[id];
      const st = p.stats.season;
      st.apps++;
      p.stats.career.apps++;
      st.ratingSum = (st.ratingSum || 0) + side.rating[id];
      const sp = spellFor(game, p, club.id);
      sp.apps++;
      sp.ratingSum += side.rating[id];
      p.energy = Math.round(side.energy[id]);
      matchLoad(p);
      updateForm(p, side.rating[id], rng);
    }
    for (const g of result.goals.filter((x) => x.side === i)) {
      const p = game.players[g.playerId];
      p.stats.season.goals++;
      p.stats.career.goals++;
      spellFor(game, p, club.id).goals++;
    }
    for (const e of evs.filter((x) => x.type === 'goal' && x.side === i && x.assistId)) {
      const p = game.players[e.assistId];
      p.stats.season.assists++;
      p.stats.career.assists = (p.stats.career.assists || 0) + 1;
      spellFor(game, p, club.id).assists++;
    }
    for (const c of result.cards.filter((x) => x.side === i)) {
      const p = game.players[c.playerId];
      if (c.red) {
        p.stats.season.red++;
        const second = evs.some((e) => e.type === 'red' && e.second && e.playerId === c.playerId);
        p.suspension += second ? 1 : rng.int(2, 3);
      } else {
        p.stats.season.yellow++;
        p.yellows = (p.yellows || 0) + 1;
        if (p.yellows % 5 === 0) p.suspension += 1;
      }
    }
    for (const inj of side.injured) {
      const p = game.players[inj.id];
      p.injuryDays = Math.max(p.injuryDays, inj.days);
      if (club.id === game.userClubId) {
        addNews(game, `${p.first} ${p.last} was injured against ${game.clubs[m.sides[1 - i].clubId].name} and will be out for ${inj.days} days.`, 'injury');
      }
    }
  });

  if (comp.type === 'league') {
    const rh = comp.table[f.homeId];
    const ra = comp.table[f.awayId];
    rh.p++; ra.p++;
    rh.gf += result.h; rh.ga += result.a;
    ra.gf += result.a; ra.ga += result.h;
    const rec = (r, x) => { r.form.push(x); if (r.form.length > 6) r.form.shift(); };
    if (result.h > result.a) { rh.w++; ra.l++; rh.pts += 3; rec(rh, 'W'); rec(ra, 'L'); }
    else if (result.h < result.a) { ra.w++; rh.l++; ra.pts += 3; rec(rh, 'L'); rec(ra, 'W'); }
    else { rh.d++; ra.d++; rh.pts++; ra.pts++; rec(rh, 'D'); rec(ra, 'D'); }
  }
  if (comp.type === 'continental') applyContinentalResult(game, f);
  clubMatchRecords(game, f, comp);
  if (user) boardAfterMatch(game, f);
  aiBoardAfterMatch(game, f);
  afterResult(game, f);
  // Other clubs' matches keep only the score: their scorers and cards are in
  // the players' stats and the news now, and nobody opens their report.
  if (!user) { result.goals = []; result.cards = []; }
  return result;
}

function checkCup(game, comp) {
  const rng = new Rng(game.rng);
  const k = comp.rounds.findIndex((r) => r.drawn && !r.done);
  if (k < 0) return;
  const round = comp.rounds[k];
  const fixtures = round.fixtureIds.map((id) => game.fixtures[id]);
  if (fixtures.some((f) => !f.result)) return;
  round.done = true;
  const ties = fixtures.filter(decidesTie);
  comp.alive = [...round.byes, ...ties.map((f) => f.result.winner)];
  for (const f of ties) payPrize(game.clubs[f.result.winner], cupRoundPrize(k));
  const user = game.userClubId;
  const userTie = ties.find((f) => f.homeId === user || f.awayId === user);
  if (userTie && userTie.result.winner !== user) addNews(game, `We are out of the ${comp.name} (${round.name}).`, 'cup');
  if (k === comp.rounds.length - 1) {
    comp.winnerId = comp.alive[0];
    addNews(game, `${game.clubs[comp.winnerId].name} have won the ${comp.name}!`, 'cup');
    return;
  }
  drawCupRound(game, comp, k + 1, rng);
  const next = comp.rounds[k + 1];
  const mine = next.fixtureIds.map((id) => game.fixtures[id]).find((f) => f.homeId === user || f.awayId === user);
  if (mine) {
    const home = mine.homeId === user;
    const opp = game.clubs[home ? mine.awayId : mine.homeId];
    addNews(game, `${comp.name} ${next.name.toLowerCase()} draw: we will play ${opp.name}${mine.leg ? `, first leg ${home ? 'at home' : 'away'}` : ` ${home ? 'at home' : 'away'}`}.`, 'cup');
  } else if (next.byes.includes(user)) {
    addNews(game, `We have a bye in the ${comp.name} ${next.name.toLowerCase()}.`, 'cup');
  }
}

export function dailyUpdate(game) {
  // June and July (the international finals): holidays for the clubs.
  if (game.day > game.season.end) {
    summerDay(game);
    nationalDay(game);
    return;
  }
  // Training, fatigue, recovery, injuries healing and development for every player.
  trainingDay(game);
  moraleDay(game);
  boardDay(game);
  nationalDay(game);
  const date = new Date(game.day * DAY_MS);
  if (date.getUTCDate() === 1) recordGrowth(game);
  if (date.getUTCDate() === 1 && game.season.phase === 'season') {
    monthlyFinances(game);
    if (date.getUTCMonth() === 0 || date.getUTCMonth() === 3) warnExpiringContracts(game);
    if (date.getUTCMonth() === 0) boardVerdict(game);
  }
  dailyMarket(game);
  if (game.day === WINTER_BREAK_START(game.season.year)) scheduleWinterFriendlies(game);
  youthLeagueDay(game);
  progressConstruction(game);
  progressFacilities(game);
  progressScouting(game);
}

function warnExpiringContracts(game) {
  const club = game.clubs[game.userClubId];
  if (!club) return;
  const exp = club.squad.map((id) => game.players[id]).filter((p) => p.contractEnd <= game.season.year);
  if (exp.length) {
    addNews(game, `Contracts expiring this summer: ${exp.map((p) => p.last).join(', ')}. Offer new contracts from the player card, or they leave for free.`, 'contract');
  }
}

const fixturesOn = (game, day) => Object.values(game.fixtures).filter((f) => f.day === day && !f.result);

// Moves to the next day and plays every fixture on it except the user's,
// which is returned (unplayed) so the UI can show it.
export function startDay(game) {
  settleWatched(game);
  game.day++;
  dailyUpdate(game);
  let userFixture = null;
  for (const f of fixturesOn(game, game.day)) {
    // The user's match (or one he chose to watch) waits for the UI.
    if (isUserFixture(game, f) || f.id === game.watchId) { userFixture = f; continue; }
    if (isNational(game, f)) { playNationalFixture(game, f); continue; }
    const m = runToEnd(game, createFixtureMatch(game, f));
    applyResult(game, f, m);
  }
  if (!userFixture) endDay(game);
  return userFixture;
}

// Called after the user's match (if any) has been applied.
export function endDay(game) {
  for (const comp of Object.values(game.competitions)) if (comp.type === 'cup') checkCup(game, comp);
  checkContinental(game, new Rng(game.rng));
  checkNational(game);
  afterDay(game);
  if (seasonComplete(game) && game.season.phase === 'season') {
    game.season.phase = 'over';
    for (const id of Object.values(game.nations).flatMap((n) => n.leagueIds)) {
      const comp = game.competitions[id];
      if (comp.tier === 1) addNews(game, `${game.clubs[sortedTable(game, comp)[0].clubId].name} are the ${comp.name} champions.`, 'league');
    }
    addNews(game, 'The season is over.', 'league');
  }
}

export function nextUserFixture(game) {
  let best = null;
  for (const f of Object.values(game.fixtures)) {
    if (!f.result && isUserFixture(game, f) && (!best || f.day < best.day)) best = f;
  }
  return best;
}

export function seasonComplete(game) {
  return Object.values(game.fixtures).every((f) => f.result)
    && Object.values(game.competitions).every((c) => c.type === 'league' || (c.type === 'national' && !c.active) || c.type === 'friendly' || c.type === 'guest' || c.winnerId
      || (c.type === 'cup' && !c.rounds.length) // a cup added in mid-season starts next season
      || (c.type === 'continental' && !c.clubIds.length));
}

// Advances to the user's next match day and returns the (unplayed) user
// fixture, or null if the user has no fixtures left (the rest of the season
// is then simulated).
// It also stops (returning null, with game.stopReason set) on the day the
// winter transfer window opens, so the winter break can't skip it, and on a
// day new offers arrive for the user's players (with stopForOffers, as the game does).
export function advanceToUserMatch(game, { stopForOffers = false } = {}) {
  const winter = windows(game).find((w) => w.name === 'winter');
  for (let guard = 0; guard < 400; guard++) {
    const target = nextUserFixture(game);
    if (!target && seasonComplete(game)) return null;
    const f = startDay(game);
    if (game.manager.sacked) {
      // Sacked before kick-off: a caretaker takes today's match.
      if (f) playUserMatchInstant(game, f);
      game.stopReason = 'sacked';
      return null;
    }
    if (f) {
      if (!isNational(game, f)) opponentPreview(game, f);
      return f;
    }
    if (game.day === winter.open) {
      game.stopReason = 'window';
      addNews(game, 'The winter transfer window is open until 7 February.', 'transfer');
      return null;
    }
    if (stopForOffers && game.windowNews) {
      game.stopReason = 'windowNews';
      return null;
    }
    // Bids and loan offers for the user's players stop the calendar so they can be
    // answered, at most once a week; others wait for the next match day.
    if (stopForOffers && newOffers(game).some((o) => o.day === game.day) && !(game.day - (game.lastOfferStop ?? -99) < 7)) {
      game.lastOfferStop = game.day;
      game.stopReason = 'offer';
      return null;
    }
  }
  throw new Error('advanceToUserMatch: calendar did not progress');
}

// International finals: plays on to the end of the competition's next match
// day (or, with watchId, up to that match, which is returned unplayed for the
// live view). The user's own match comes back first if it is sooner.
export function advanceIntl(game, compId, { watchId = null } = {}) {
  settleWatched(game);
  const pending = pendingUserFixture(game);
  if (pending) return pending;
  const days = game.competitions[compId].fixtureIds.map((id) => game.fixtures[id]).filter((f) => f && !f.result).map((f) => f.day);
  const target = watchId ? game.fixtures[watchId].day : Math.min(...days);
  if (!days.length || !(target > game.day)) return null;
  game.watchId = watchId;
  for (let guard = 0; guard < 400 && game.day < target; guard++) {
    const f = startDay(game);
    if (f) return f;
  }
  game.watchId = null;
  return null;
}

// A match the user left while watching it (the app was closed): played out
// instantly, so the day can finish.
function settleWatched(game) {
  const f = game.watchId && game.fixtures[game.watchId];
  if (!f || f.day > game.day) return;
  game.watchId = null;
  if (!f.result) finishUserMatch(game, f, runToEnd(game, createFixtureMatch(game, f)));
}

// The user's fixture today that hasn't been played yet (after startDay).
export function pendingUserFixture(game) {
  return Object.values(game.fixtures).find((f) => f.day === game.day && !f.result && isUserFixture(game, f)) || null;
}

// A match for the user's fixture: the user's side isn't AI-controlled unless asked.
export function createUserMatch(game, f, { assistant = false } = {}) {
  const nat = game.manager?.national?.teamId;
  const userHome = f.homeId === game.userClubId || (!!nat && f.homeId === nat);
  return createFixtureMatch(game, f, { homeAI: userHome ? assistant : true, awayAI: userHome ? true : assistant });
}

export function finishUserMatch(game, f, m) {
  if (isNational(game, f)) {
    applyNationalResult(game, f, m);
    nationalAfterMatch(game, f);
  } else {
    applyResult(game, f, m);
    checkMatchAchievements(game, f);
  }
  endDay(game);
}

export function playUserMatchInstant(game, f) {
  const m = runToEnd(game, createFixtureMatch(game, f));
  finishUserMatch(game, f, m);
  return m;
}

// Simulates the remaining season with the user's matches played instantly.
// Stops early if the manager is sacked.
export function simulateRestOfSeason(game) {
  for (let guard = 0; guard < 400 && !seasonComplete(game) && !game.manager.sacked; guard++) {
    const f = startDay(game);
    if (f) playUserMatchInstant(game, f);
  }
}
