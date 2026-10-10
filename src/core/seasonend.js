// End of season: history, awards, prize money, promotion and relegation,
// retirements, youth intake, contracts, reputation, and the next season.

import { Rng, clamp } from './rng.js';
import { sortedTable, initSeason, addNews } from './season.js';
import { autoLineup } from './ai.js';
import { repairLineup } from './lineup.js';
import { playerValue, playerWage } from './valuation.js';
import { retireChance, youthIntake, maintainAiSquad, ensureUserSquad, ACADEMY_MAX_AGE } from './development.js';
import { emptyLedger, boardExpectation } from './worldgen.js';
import { settleSeason, expectedWageBill, wageBill } from './finance.js';
import { executeTransfer } from './transfers.js';
import { closeContinental } from './continental.js';
import { aiExpansions } from './stadium.js';
import { ageReports } from './scouting.js';
import { returnLoans } from './loans.js';
import { closeNational } from './national.js';
import { seasonEndStaff } from './training.js';
import { seasonEndMorale } from './morale.js';
import { seasonEndBoard, newSeasonBoard } from './board.js';
import { seasonEndNational } from './nationaljob.js';
import { worldAwards, flushSpell, pruneRecords, noteLeagueAwards } from './records.js';

const fullName = (p) => `${p.first} ${p.last}`;
const avgRating = (p) => (p.stats.season.apps ? p.stats.season.ratingSum / p.stats.season.apps : 0);

// League prize money: a share of the club's expected wage bill, from 30%
// (top-flight champions) down to 15% of that for the bottom club.
export function leaguePrize(game, club, tier, pos, n) {
  const top = expectedWageBill(game, club) * (tier === 1 ? 0.3 : 0.2);
  return Math.round((top * (1 - (0.85 * (pos - 1)) / (n - 1))) / 1000) * 1000;
}
const CUP_PRIZE = { winner: 1e6, runnerUp: 4e5 };

// The furthest cup round a club reached ('Winner' for the winner).
export function cupResult(game, cup, clubId) {
  if (!cup.clubIds.includes(clubId)) return null;
  if (cup.winnerId === clubId) return 'Winner';
  let reached = null;
  cup.rounds.forEach((r) => {
    const inRound = r.byes.includes(clubId) || r.fixtureIds.some((id) => {
      const f = game.fixtures[id];
      return f.homeId === clubId || f.awayId === clubId;
    });
    if (inRound) reached = r.name;
  });
  return reached;
}

function leagueAwards(game, comp) {
  const year = game.season.year;
  const ps = comp.clubIds.flatMap((id) => game.clubs[id].squad.map((p) => game.players[p]));
  const rounds = (comp.clubIds.length - 1) * 2;
  const pick = (list, key) => list.sort((a, b) => key(b) - key(a))[0] || null;
  const award = (p, value) => (p ? { playerId: p.id, name: fullName(p), clubId: p.clubId, value } : null);
  const scorer = pick(ps.slice(), (p) => p.stats.season.goals * 100 - p.stats.season.apps);
  const best = pick(ps.filter((p) => p.stats.season.apps >= rounds * 0.5), avgRating);
  const young = pick(ps.filter((p) => year - p.birthYear <= 21 && p.stats.season.apps >= rounds * 0.3), avgRating);
  return {
    topScorer: award(scorer, scorer ? scorer.stats.season.goals : 0),
    bestPlayer: award(best, best ? Math.round(avgRating(best) * 100) / 100 : 0),
    youngPlayer: award(young, young ? Math.round(avgRating(young) * 100) / 100 : 0),
  };
}

export function endSeason(game) {
  const rng = new Rng(game.rng);
  const year = game.season.year;
  const userId = game.userClubId;
  const user = game.clubs[userId];
  const summary = { year, leagues: [], cups: [], user: {}, retiredUser: [], youthUser: [], releasedUser: [] };

  // ---- results, history, awards, prize money ----
  const finalTables = {};
  for (const nation of Object.values(game.nations).filter((n) => n.leagueIds.length)) {
    for (const compId of nation.leagueIds) {
      const comp = game.competitions[compId];
      const rows = sortedTable(game, comp);
      finalTables[compId] = rows;
      const awards = leagueAwards(game, comp);
      noteLeagueAwards(game, comp, awards);
      comp.history.push({ year, championId: rows[0].clubId, table: rows.map((r) => ({ clubId: r.clubId, name: game.clubs[r.clubId].name,
        p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: r.pts })), awards });
      rows.forEach((r, i) => {
        const club = game.clubs[r.clubId];
        const prize = leaguePrize(game, club, comp.tier, i + 1, rows.length);
        club.budget += prize;
        club.finance.season.prizes += prize;
        club.history.push({ year, compId, compName: comp.name, tier: comp.tier, pos: i + 1, p: r.p, w: r.w, d: r.d, l: r.l,
          gf: r.gf, ga: r.ga, pts: r.pts });
      });
      summary.leagues.push({ compId, name: comp.name, nationId: nation.id, tier: comp.tier, championId: rows[0].clubId,
        promoted: comp.promote ? rows.slice(0, comp.promote).map((r) => r.clubId) : [],
        relegated: comp.relegate ? rows.slice(-comp.relegate).map((r) => r.clubId) : [], ...awards });
      const champ = game.clubs[rows[0].clubId];
      champ.trophies = [...(champ.trophies || []), { year, compId, name: comp.name }];
    }
    const cup = game.competitions[nation.cupId];
    const final = cup.rounds[cup.rounds.length - 1].fixtureIds.map((id) => game.fixtures[id])[0];
    const runnerUp = final ? (final.result.winner === final.homeId ? final.awayId : final.homeId) : null;
    cup.history.push({ year, winnerId: cup.winnerId, runnerUpId: runnerUp });
    game.clubs[cup.winnerId].budget += CUP_PRIZE.winner;
    game.clubs[cup.winnerId].finance.season.prizes += CUP_PRIZE.winner;
    if (runnerUp) { game.clubs[runnerUp].budget += CUP_PRIZE.runnerUp; game.clubs[runnerUp].finance.season.prizes += CUP_PRIZE.runnerUp; }
    const winner = game.clubs[cup.winnerId];
    winner.trophies = [...(winner.trophies || []), { year, compId: cup.id, name: cup.name }];
    summary.cups.push({ compId: cup.id, name: cup.name, winnerId: cup.winnerId, runnerUpId: runnerUp });
    for (const id of cup.clubIds) {
      const h = game.clubs[id].history.at(-1);
      if (h && h.year === year) h.cup = cupResult(game, cup, id);
    }
  }

  summary.continental = closeContinental(game, year);
  summary.national = closeNational(game, year);
  summary.nationalJob = seasonEndNational(game);

  // ---- the user's season ----
  const uh = user.history.at(-1);
  const trophies = (user.trophies || []).filter((t) => t.year === year);
  for (const t of trophies) game.history.trophies.push({ ...t, clubId: userId, clubName: user.name });
  const userComp = game.competitions[user.compId];
  summary.user = { clubId: userId, compId: user.compId, pos: uh.pos, pts: uh.pts, cup: uh.cup, cont: uh.cont || null,
    trophies: trophies.map((t) => t.name) };
  game.manager.history = game.manager.history || [];
  game.manager.history.push({ year, clubId: userId, clubName: user.name, compName: userComp.name, tier: userComp.tier,
    pos: uh.pos, p: uh.p, w: uh.w, d: uh.d, l: uh.l, gf: uh.gf, ga: uh.ga, pts: uh.pts, cup: uh.cup, cont: uh.cont || null,
    trophies: trophies.map((t) => t.name) });
  const leaving = seasonEndBoard(game, summary, finalTables, trophies);
  game.manager.history.at(-1).board = summary.user.board;
  game.history.seasons.push({ year, champions: summary.leagues.map((l) => ({ compId: l.compId, clubId: l.championId })),
    cups: [...summary.cups, ...(summary.continental ? [summary.continental] : [])].map((c) => ({ compId: c.compId, clubId: c.winnerId })),
    awards: summary.leagues.map((l) => ({ compId: l.compId, topScorer: l.topScorer, bestPlayer: l.bestPlayer, youngPlayer: l.youngPlayer })) });

  // ---- reputation: finishing above or below expectations ----
  for (const [compId, rows] of Object.entries(finalTables)) {
    const comp = game.competitions[compId];
    const byRep = comp.clubIds.slice().sort((a, b) => game.clubs[b].reputation - game.clubs[a].reputation);
    rows.forEach((r, i) => {
      const club = game.clubs[r.clubId];
      const expected = byRep.indexOf(r.clubId);
      club.reputation = clamp(Math.round(club.reputation + clamp((expected - i) * 0.6, -5, 5)), 15, 95);
    });
  }

  // ---- promotion and relegation ----
  for (const nation of Object.values(game.nations).filter((n) => n.leagueIds.length)) {
    const [top, second] = nation.leagueIds.map((id) => game.competitions[id]);
    const down = summary.leagues.find((l) => l.compId === top.id).relegated;
    const up = summary.leagues.find((l) => l.compId === second.id).promoted;
    top.clubIds = top.clubIds.filter((id) => !down.includes(id)).concat(up);
    second.clubIds = second.clubIds.filter((id) => !up.includes(id)).concat(down);
    for (const id of up) { game.clubs[id].compId = top.id; game.clubs[id].reputation = Math.min(95, game.clubs[id].reputation + 4); }
    for (const id of down) { game.clubs[id].compId = second.id; game.clubs[id].reputation = Math.max(15, game.clubs[id].reputation - 4); }
    if (up.includes(userId)) { summary.user.promoted = true; addNews(game, `Promotion! ${user.name} will play in the ${top.name} next season.`, 'league'); }
    if (down.includes(userId)) { summary.user.relegated = true; addNews(game, `${user.name} have been relegated to the ${second.name}.`, 'league'); }
  }

  // ---- world awards, then players' season spells into their history and the
  // clubs' records (ageing happens via the new year) ----
  summary.world = worldAwards(game, summary);
  const nextYear = year + 1;
  for (const p of Object.values(game.players)) flushSpell(game, p);
  pruneRecords(game);

  // ---- loans end: players return to their clubs (or academies) ----
  returnLoans(game);

  // ---- retirements ----
  for (const club of Object.values(game.clubs)) {
    for (const id of club.squad.slice()) {
      const p = game.players[id];
      if (rng.chance(retireChance(p, nextYear - p.birthYear))) {
        club.squad = club.squad.filter((x) => x !== id);
        if (club.id === userId) summary.retiredUser.push({ name: fullName(p), age: nextYear - p.birthYear, pos: p.pos, skill: p.skill });
        delete game.players[id];
      }
    }
  }

  // ---- contracts: the user's expiring players leave unless renewed; AI clubs
  // release weak or old players and renew the rest ----
  summary.contractsLeft = [];
  for (const club of Object.values(game.clubs)) {
    const avg = club.squad.reduce((a, id) => a + game.players[id].skill, 0) / Math.max(1, club.squad.length);
    // Clubs whose wage bill runs high are stricter about renewing contracts.
    const pressure = wageBill(game, club) / expectedWageBill(game, club);
    const cut = pressure > 1.15 || club.budget < 0 ? avg - 4 : avg - 12;
    for (const id of club.squad.slice()) {
      const p = game.players[id];
      if (p.contractEnd >= nextYear) continue;
      const age = nextYear - p.birthYear;
      if (club.id === userId) {
        summary.contractsLeft.push(`${p.first} ${p.last}`);
        club.squad = club.squad.filter((x) => x !== id);
        delete game.players[id];
        continue;
      }
      if ((age >= 33 || p.skill < cut) && rng.chance(0.7)) {
        club.squad = club.squad.filter((x) => x !== id);
        delete game.players[id];
        continue;
      }
      p.contractEnd = nextYear + (age >= 31 ? 1 : rng.int(1, 3));
      p.wage = playerWage(p, nextYear);
    }
  }
  if (summary.contractsLeft.length) {
    addNews(game, `Left on free transfers (contracts expired): ${summary.contractsLeft.join(', ')}.`, 'contract');
  }
  game.offers = [];

  // ---- AI clubs in debt sell their most valuable player to a richer club ----
  for (const club of Object.values(game.clubs)) {
    if (club.id === userId || club.budget >= 0 || club.squad.length <= 20) continue;
    const star = club.squad.map((id) => game.players[id]).sort((a, b) => b.value - a.value)[0];
    const fee = Math.round(star.value / 1e4) * 1e4;
    const buyers = Object.values(game.clubs).filter((c) => c.id !== userId && c.id !== club.id
      && c.nationId === club.nationId && c.budget > fee * 2);
    if (!buyers.length) continue;
    const buyer = rng.pick(buyers);
    executeTransfer(game, star.id, buyer.id, fee, { years: 3 });
    addNews(game, `${club.name} sell ${star.first} ${star.last} to ${buyer.name} for ${fee.toLocaleString('en-US')} € to ease their debts.`, 'transfer');
  }

  // ---- reset season state on players ----
  for (const p of Object.values(game.players)) {
    p.stats.season = { apps: 0, goals: 0, assists: 0, yellow: 0, red: 0 };
    p.seasonStart = p.skill;
    p.tecStart = p.tec;
    p.phyStart = p.phy;
    p.yellows = 0;
    p.suspension = 0;
    p.form = 0;
    p.energy = 100;
    p.value = playerValue(p, nextYear);
  }

  // ---- finances: pay the rest of the year, then archive the season ledger ----
  settleSeason(game);
  aiExpansions(game, rng);
  ageReports(game);
  seasonEndStaff(game, nextYear);
  seasonEndMorale(game);
  // Teenagers may still grow a little.
  for (const p of Object.values(game.players)) {
    if (nextYear - p.birthYear <= 18 && p.height) p.height += rng.int(0, 2);
  }
  for (const club of Object.values(game.clubs)) {
    club.finance.history.push({ year, ...club.finance.season });
    if (club.finance.history.length > 25) club.finance.history.shift();
    club.finance.season = emptyLedger();
  }
  summary.user.prize = game.clubs[userId].finance.history.at(-1).prizes;

  // ---- new season ----
  game.fixtures = {};
  for (const comp of Object.values(game.competitions)) {
    if (comp.type === 'cup') { delete comp.winnerId; comp.clubIds = game.nations[comp.nationId].leagueIds.flatMap((id) => game.competitions[id].clubIds); }
  }
  initSeason(game, nextYear);
  newSeasonBoard(game, leaving);

  // ---- youth intake and squads (players are now a year older) ----
  for (const club of Object.values(game.clubs)) {
    const isUser = club.id === userId;
    if (isUser) {
      // Academy players who are too old to stay leave unless promoted.
      for (const id of (club.youth || []).slice()) {
        const p = game.players[id];
        if (nextYear - p.birthYear > ACADEMY_MAX_AGE) {
          summary.releasedUser.push(`${p.first} ${p.last}`);
          club.youth = club.youth.filter((x) => x !== id);
          delete game.players[id];
        }
      }
    }
    const youth = youthIntake(game, club, rng, isUser);
    if (isUser) {
      summary.youthUser = youth;
      ensureUserSquad(game, club, rng);
    } else {
      maintainAiSquad(game, club, rng).forEach((id) => delete game.players[id]);
    }
  }
  for (const club of Object.values(game.clubs)) {
    if (club.id === userId) club.lineup = repairLineup(game, club, club.lineup).lineup;
    else club.lineup = autoLineup(game, club);
    for (const k of ['A', 'B', 'C']) {
      const s = club.savedLineups[k];
      if (s) {
        s.slots = s.slots.map((id) => (club.squad.includes(id) ? id : null));
        s.bench = s.bench.filter((id) => club.squad.includes(id));
      }
    }
  }

  const best = game.players[summary.youthUser.slice().sort((a, b) => game.players[b].potential - game.players[a].potential)[0]];
  addNews(game, `${summary.youthUser.length} new players have joined the youth academy${best ? `; the most promising is ${best.first} ${best.last} (potential ${best.potential})` : ''}. Promote them from the Youth screen.`, 'youth');
  if (summary.releasedUser.length) addNews(game, `Left the academy (too old, not promoted): ${summary.releasedUser.join(', ')}.`, 'youth');
  if (summary.retiredUser.length) addNews(game, `Retired: ${summary.retiredUser.map((r) => r.name).join(', ')}.`, 'club');
  addNews(game, `The board expects you to: ${boardExpectation(game, user).toLowerCase()}.`, 'board');
  addNews(game, `Season ${nextYear}/${String(nextYear + 1).slice(2)} is about to begin.`, 'league');

  game.lastSummary = summary;
  return summary;
}
