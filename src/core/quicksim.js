// Quick-sim: plays the calendar ahead without stopping at every match. The
// user's matches get an instant result (the assistant makes the changes), and
// the run stops early for things the manager has to see: offers for his
// players, the winter window opening, a sacking or the end of the season.
//
// The UI drives it a day at a time (simDay) so it can show progress.

import { startDay, createUserMatch, finishUserMatch, seasonComplete, pendingUserFixture } from './matchday.js';
import { runToEnd } from './engine.js';
import { autoLineup } from './ai.js';
import { isNational, teamOf } from './national.js';
import { windows, openWindow, newOffers } from './transfers.js';
import { addNews } from './season.js';
import { DAY_MS } from './calendar.js';

export const SIM_TARGETS = [
  ['match', 'Next match only'],
  ['week', 'One week'],
  ['month', 'To the end of the month'],
  ['window', 'To the transfer window'],
  ['season', 'To the end of the season'],
];

// The last day a run to `until` plays (Infinity: until the season ends).
export function simEndDay(game, until) {
  const d = game.day;
  if (until === 'week') return d + 7;
  if (until === 'month') {
    const date = new Date(d * DAY_MS);
    return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0) / DAY_MS);
  }
  if (until === 'window') {
    const open = openWindow(game);
    if (open) return open.close;
    const next = windows(game).find((w) => w.open > d);
    return next ? next.open : Infinity;
  }
  return Infinity;
}

// What a "To the transfer window" run does now, for the menu.
export function windowTargetLabel(game) {
  const open = openWindow(game);
  if (open) return 'Until the transfer window closes';
  const next = windows(game).find((w) => w.open > game.day);
  return next ? 'Until the transfer window opens' : null;
}

export function startSim(game, { until = 'match', autoPick = false, stopForOffers = true } = {}) {
  return { until, autoPick, stopForOffers, end: simEndDay(game, until), results: [], days: 0, startDay: game.day, stop: null };
}

// The user's result line for the summary: { fixtureId, compId, opp, home, gf, ga, o }.
function resultLine(game, f) {
  const nat = game.manager?.national?.teamId;
  const me = [game.userClubId, nat].find((id) => id && (f.homeId === id || f.awayId === id));
  const home = f.homeId === me;
  const r = f.result;
  const gf = home ? r.h : r.a;
  const ga = home ? r.a : r.h;
  let o = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  if (r.winner) o = r.winner === me ? 'W' : 'L';
  return { fixtureId: f.id, compId: f.compId, oppName: teamOf(game, home ? f.awayId : f.homeId).name, home, gf, ga, o };
}

// Plays the user's fixture of the day: an instant result, with the assistant
// on the bench (and picking the XI when asked).
function playFixture(game, sim, f) {
  const national = isNational(game, f);
  const club = game.clubs[game.userClubId];
  if (sim.autoPick && !national) {
    const auto = autoLineup(game, club, club.lineup.formation);
    club.lineup = { ...club.lineup, ...auto };
  }
  const m = createUserMatch(game, f, { assistant: true });
  runToEnd(game, m);
  finishUserMatch(game, f, m);
  const line = resultLine(game, f);
  if (!national) {
    const word = f.result.friendly ? `Friendly ${line.o === 'W' ? 'win' : line.o === 'L' ? 'defeat' : 'draw'}` : line.o === 'W' ? 'Win' : line.o === 'L' ? 'Defeat' : 'Draw';
    addNews(game, `${word}: ${teamOf(game, f.homeId).name} ${f.result.h}-${f.result.a} ${teamOf(game, f.awayId).name}.`, 'result');
  }
  sim.results.push(line);
}

// Plays one day. Returns false once the run is over (sim.stop says why:
// done, seasonOver, sacked, window, offer, windowNews).
export function simDay(game, sim) {
  if (sim.stop) return false;
  // A match day already started (the pre-match screen was left) is played first.
  const pending = pendingUserFixture(game);
  if (pending) {
    playFixture(game, sim, pending);
    if (game.manager.sacked) { sim.stop = 'sacked'; return false; }
    if (sim.until === 'match') { sim.stop = 'done'; return false; }
    return true;
  }
  if (game.season.phase === 'over' || seasonComplete(game)) { sim.stop = 'seasonOver'; return false; }
  if (game.day >= sim.end) { sim.stop = 'done'; return false; }
  const winterOpen = windows(game).find((w) => w.name === 'winter').open;
  const f = startDay(game);
  sim.days++;
  if (game.manager.sacked) {
    if (f) playFixture(game, sim, f);
    sim.stop = 'sacked';
    return false;
  }
  if (f) {
    playFixture(game, sim, f);
    if (game.manager.sacked) { sim.stop = 'sacked'; return false; }
  }
  if (game.season.phase === 'over') { sim.stop = 'seasonOver'; return false; }
  if (sim.until === 'match' && f) { sim.stop = 'done'; return false; }
  if (game.day >= sim.end) { sim.stop = 'done'; return false; }
  if (game.day === winterOpen) {
    addNews(game, 'The winter transfer window is open until 7 February.', 'transfer');
    sim.stop = 'window';
    return false;
  }
  if (sim.stopForOffers && game.windowNews) { sim.stop = 'windowNews'; return false; }
  if (sim.stopForOffers && newOffers(game).some((o) => o.day === game.day)) { sim.stop = 'offer'; return false; }
  return true;
}

// Runs a whole quick-sim at once (tests, and anything that needn't show progress).
export function quickSim(game, opts) {
  const sim = startSim(game, opts);
  for (let guard = 0; guard < 500 && simDay(game, sim); guard++);
  return sim;
}
