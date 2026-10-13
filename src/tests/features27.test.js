import { test, assert, assertEq, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, advanceToUserMatch, playUserMatchInstant } from '../core/matchday.js';
import { evaluateSwap, buySwap, swapWorth, executeTransfer, acceptOffer, listPlayer, askingPrice } from '../core/transfers.js';
import { borrowPlayer, exerciseOption, evaluateLoanRequest } from '../core/loans.js';
import { unlock, ACHIEVEMENTS, checkMatchAchievements, takeAchievementQueue } from '../core/achievements.js';
import { recordGrowth } from '../core/development.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  const g = startCareer(w, w.competitions[comp].clubIds[idx], 'Deals');
  g.manager.board.standing = 100;
  return g;
}

test('swap deals: one of your players counts towards the fee; a poor one is turned down', () => {
  const g = career('swap');
  const user = g.clubs[g.userClubId];
  user.budget = 50e6;
  const seller = Object.values(g.clubs).find((c) => c.compId === user.compId && c.id !== user.id && c.squad.length > 22);
  const target = seller.squad.map((id) => g.players[id]).filter((p) => !seller.lineup.slots.includes(p.id) && p.pos === 'M')[0];
  const mine = user.squad.map((id) => g.players[id]).filter((p) => p.pos !== "G" && swapWorth(g, p, seller) > 0).sort((a, b) => a.skill - b.skill)[0];
  assert(mine, 'a player the seller would take');
  const ask = askingPrice(g, target);
  const worth = swapWorth(g, mine, seller);
  const r = evaluateSwap(g, target.id, Math.max(0, ask - worth), mine.id);
  assertEq(r.status, 'accepted', r.message);
  const before = user.budget;
  buySwap(g, target.id, Math.max(0, ask - worth), mine.id, 3, null);
  assertEq(target.clubId, user.id, 'target joined');
  assertEq(mine.clubId, seller.id, 'our player went the other way');
  assertEq(user.budget, before - Math.max(0, ask - worth), 'only the cash part was paid');
  const poor = user.squad.map((id) => g.players[id]).find((p) => swapWorth(g, p, seller) === 0 && !p.loan);
  if (poor) assertEq(evaluateSwap(g, target.id, 1, poor.id).status, 'rejected', 'a player far below their level');
});

test('sell-on clause: 10 % less now, 15 % of the next sale', () => {
  const g = career('sellon');
  const user = g.clubs[g.userClubId];
  const p = g.players[user.squad.filter((id) => !user.lineup.slots.includes(id))[0]];
  listPlayer(g, p.id, Math.round(p.value * 0.8));
  let o = null;
  for (let i = 0; i < 45 && !o; i++) { startDay(g); o = (g.offers || []).find((x) => x.playerId === p.id && !x.type); }
  assert(o, 'an offer');
  const before = user.budget;
  assert(acceptOffer(g, o.id, { sellOn: true }), 'sold with a sell-on clause');
  assertEq(user.budget, before + Math.round((o.fee * 0.9) / 1000) * 1000, '90 % of the fee');
  assertEq(p.sellOn?.clubId, user.id, 'clause recorded');
  const next = Object.values(g.clubs).find((c) => c.id !== user.id && c.id !== p.clubId && !c.guest);
  next.budget += 1e8;
  const mid = user.budget;
  executeTransfer(g, p.id, next.id, 2e6);
  assertEq(user.budget, mid + 300000, '15 % of the next fee');
  assert(!p.sellOn, 'paid once');
});

test('loan with an option to buy: dearer loan fee, the agreed price later', () => {
  const g = career('option');
  const user = g.clubs[g.userClubId];
  user.budget = 80e6;
  const owner = Object.values(g.clubs).find((c) => c.id !== user.id && c.squad.length > 22 && !c.guest);
  const p = owner.squad.map((id) => g.players[id]).find((x) => !owner.lineup.slots.includes(x.id) && evaluateLoanRequest(g, x.id, 1).status === 'accepted');
  assert(p, 'a loanable player');
  const price = askingPrice(g, p);
  const r = borrowPlayer(g, p.id, 1, { option: true });
  assertEq(r.status, 'accepted', r.message);
  assertEq(p.loan.option, price, 'option price fixed at the start');
  const before = user.budget;
  const ownerBefore = owner.budget;
  assert(exerciseOption(g, p.id).ok, 'option taken up');
  assert(!p.loan && p.clubId === user.id, 'now ours');
  assertEq(user.budget, before - price);
  assertEq(owner.budget, ownerBefore + price);
});

test('achievements unlock once; matches store the "why" analysis; growth is recorded monthly', () => {
  const g = career('ach');
  assert(unlock(g, 'seasons10'), 'unlocks');
  assert(!unlock(g, 'seasons10'), 'only once');
  assertEq(takeAchievementQueue(g).length, 1, 'queued for the pop-up');
  let won = null;
  for (let i = 0; i < 25 && !won; i++) {
    const f = advanceToUserMatch(g);
    delete g.stopReason;
    if (!f) continue;
    playUserMatchInstant(g, f);
    const mine = f.homeId === g.userClubId ? 0 : 1;
    assert(f.result.analysis && f.result.stats[0].xg !== undefined, 'analysis and xG stored');
    if (f.result.winner === g.userClubId || (mine === 0 ? f.result.h > f.result.a : f.result.a > f.result.h)) won = f;
  }
  if (won) assert(g.achievements.first_win, 'first win unlocked');
  const p = g.players[g.clubs[g.userClubId].squad[0]];
  const n = (p.growth || []).length;
  recordGrowth(g);
  assertEq(p.growth.length, n + 1, 'a growth snapshot');
  info(`${ACHIEVEMENTS.length} achievements; unlocked here: ${Object.keys(g.achievements).join(', ')}`);
});
