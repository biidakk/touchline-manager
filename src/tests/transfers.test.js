import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { openWindow, windows, askingPrice, evaluateBid, buyPlayer, listPlayer, acceptOffer, renewContract, searchPlayers,
  willJoin, rejectOffer, newOffers } from '../core/transfers.js';
import { loanSuitors, loanToClub } from '../core/loans.js';
import { advanceToUserMatch, playUserMatchInstant, startDay, simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { dayOf } from '../core/calendar.js';
import { wageBill } from '../core/finance.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Market');
}

test('transfer windows: pre-season to 31 August and January', () => {
  const g = career('win');
  const y = g.season.year;
  assert(openWindow(g), 'window should be open in pre-season');
  assert(openWindow(g, dayOf(y, 8, 31)), '31 Aug open');
  assert(!openWindow(g, dayOf(y, 9, 1)), '1 Sep closed');
  assert(!openWindow(g, dayOf(y, 12, 10)), 'December closed');
  assert(openWindow(g, dayOf(y + 1, 1, 15)), 'January open');
  assertEq(windows(g).length, 2);
});

test('asking prices: key players cost more than listed ones', () => {
  const g = career('ask');
  const club = Object.values(g.clubs).find((c) => c.id !== g.userClubId);
  const starter = g.players[club.lineup.slots[5]];
  const before = askingPrice(g, starter);
  starter.listed = true;
  const listed = askingPrice(g, starter);
  assert(before > listed * 1.3, `starter ${before} vs listed ${listed}`);
  starter.listed = false;
});

test('the user buys a player: fees, squads, ledgers and lineups update', () => {
  const g = career('buy');
  const user = g.clubs[g.userClubId];
  user.budget = 50e6;
  const target = searchPlayers(g, { pos: 'F', maxPrice: 20e6 }).filter((x) => x.p.skill < 75 && willJoin(g, x.p, user).ok)
    .sort((a, b) => b.p.skill - a.p.skill)[0];
  assert(target, 'no target found');
  const { p, price } = target;
  const seller = g.clubs[p.clubId];
  assertEq(evaluateBid(g, p.id, Math.round(price * 0.5)).status, 'rejected', 'lowball');
  const mid = evaluateBid(g, p.id, Math.round(price * 0.85));
  assertEq(mid.status, 'counter', 'counter offer');
  assertEq(mid.counter, price);
  const ok = evaluateBid(g, p.id, price);
  assertEq(ok.status, 'accepted', ok.message);
  const sellerBudget = seller.budget;
  buyPlayer(g, p.id, price, 3);
  assertEq(p.clubId, user.id);
  assert(user.squad.includes(p.id) && !seller.squad.includes(p.id), 'squads');
  assertEq(user.budget, 50e6 - price, 'buyer budget');
  assertEq(seller.budget, sellerBudget + price, 'seller budget');
  assertEq(user.finance.season.transfersIn, price, 'ledger in');
  assertEq(seller.finance.season.transfersOut, price, 'ledger out');
  assert(!seller.lineup.slots.includes(p.id), 'seller lineup still has him');
  const nums = user.squad.map((id) => g.players[id].number);
  assertEq(new Set(nums).size, nums.length, 'shirt numbers unique');
  assertEq(g.transfers[0].playerId, p.id, 'ticker');
});

test('bids are refused when the window is closed', () => {
  const g = career('closed');
  g.day = dayOf(g.season.year, 10, 10);
  const p = Object.values(g.players).find((x) => x.clubId !== g.userClubId);
  assertEq(evaluateBid(g, p.id, 1e9).status, 'rejected');
});

test('listed players attract AI offers, and accepting one sells him', () => {
  const g = career('sell');
  const user = g.clubs[g.userClubId];
  const p = g.players[user.squad.filter((id) => !user.lineup.slots.includes(id))[0]];
  listPlayer(g, p.id, Math.round(p.value * 0.8));
  const forHim = () => (g.offers || []).find((x) => x.playerId === p.id);
  for (let i = 0; i < 25 && !forHim(); i++) startDay(g);
  const o = forHim();
  assert(o, 'no offers received in the summer window');
  const before = user.budget;
  assert(acceptOffer(g, o.id), 'accept failed');
  assert(!user.squad.includes(p.id) && g.clubs[o.clubId].squad.includes(p.id), 'not moved');
  assertEq(user.budget, before + o.fee, 'fee received');
});

test('AI clubs trade with each other during the windows', () => {
  const g = career('ai');
  simulateRestOfSeason(g);
  const n = g.transfers.length;
  info(`AI transfers in one season: ${n}; biggest: ${g.transfers.slice().sort((a, b) => b.fee - a.fee).slice(0, 3)
    .map((t) => `${t.playerName} ${(t.fee / 1e6).toFixed(1)}M`).join(', ')}`);
  assertBetween(n, 40, 400, 'number of transfers');
  for (const c of Object.values(g.clubs)) {
    assert(c.squad.length >= 18, `${c.name} squad too small`);
    for (const id of c.squad) assertEq(g.players[id].clubId, c.id, 'player/club link');
  }
});

test('finances: a season roughly balances for typical clubs', () => {
  const g = career('money');
  const start = Object.fromEntries(Object.values(g.clubs).map((c) => [c.id, c.budget]));
  simulateRestOfSeason(g);
  endSeason(g);
  const rel = [];
  for (const c of Object.values(g.clubs)) {
    const h = c.finance.history.at(-1);
    const net = h.tickets + h.tvSponsors + h.prizes - h.wages - h.costs;
    rel.push({ c, r: net / Math.max(1, wageBill(g, c)), h });
    assert(Number.isFinite(c.budget), 'budget is not a number');
    assertEq(Math.round(c.budget - start[c.id]),
      Math.round(net + h.transfersOut - h.transfersIn - (h.scouting || 0) - (h.construction || 0) - (h.staff || 0)), `${c.name} budget vs ledger`);
  }
  rel.sort((a, b) => a.r - b.r);
  const median = rel[Math.floor(rel.length / 2)].r;
  const u = g.clubs[g.userClubId].finance.history.at(-1);
  info(`Season finances: median operating result ${(median * 100).toFixed(0)}% of the wage bill (worst ${(rel[0].r * 100).toFixed(0)}%, best ${(rel.at(-1).r * 100).toFixed(0)}%)`);
  info(`  User club: tickets ${(u.tickets / 1e6).toFixed(2)}M, TV ${(u.tvSponsors / 1e6).toFixed(2)}M, prizes ${(u.prizes / 1e6).toFixed(2)}M, wages ${(u.wages / 1e6).toFixed(2)}M, costs ${(u.costs / 1e6).toFixed(2)}M`);
  assertBetween(median, -0.25, 0.6, 'median operating result');
});

test('contracts: renewals hold, expiring players leave at season end', () => {
  const g = career('contract');
  const user = g.clubs[g.userClubId];
  const year = g.season.year;
  const [a, b] = user.squad.filter((id) => g.players[id].birthYear > year - 29).slice(0, 2).map((id) => g.players[id]);
  a.contractEnd = year;
  b.contractEnd = year;
  assert(renewContract(g, a.id, 3).ok, 'renewal refused');
  simulateRestOfSeason(g);
  const s = endSeason(g);
  assert(g.players[a.id] && user.squad.includes(a.id), 'renewed player left');
  assert(!g.players[b.id], 'expired player stayed');
  assert(s.contractsLeft.includes(`${b.first} ${b.last}`), 'summary');
});

test('CONTINUE stops when the winter window opens', () => {
  const g = career('stop');
  let stopped = false;
  for (let i = 0; i < 60 && !stopped; i++) {
    const f = advanceToUserMatch(g);
    if (f) playUserMatchInstant(g, f);
    else if (g.stopReason === 'window') stopped = true;
  }
  assert(stopped, 'never stopped at the winter window');
  assertEq(g.day, dayOf(g.season.year + 1, 1, 1));
});

test('stars of much bigger clubs and leagues refuse to drop down', () => {
  const g = career('stature', 'CZE-L1', 3);
  const user = g.clubs[g.userClubId];
  user.budget = 1e9;
  const big = Object.values(g.clubs).filter((c) => c.nationId === 'ENG' && c.compId === 'ENG-L1').sort((a, b) => b.reputation - a.reputation)[0];
  const star = big.squad.map((id) => g.players[id]).sort((a, b) => b.skill - a.skill)[0];
  assert(!willJoin(g, star, user).ok, `${star.skill} star of ${big.name} (${big.reputation}) would join ${user.name} (${user.reputation})`);
  assertEq(evaluateBid(g, star.id, 1e9).status, 'rejected', 'any fee');
  // Players of the club's own level still come, and from clubs below it nearly everyone does.
  const peers = Object.values(g.clubs).filter((c) => c.id !== user.id && c.nationId === user.nationId && Math.abs(c.reputation - user.reputation) <= 4);
  const peerPlayers = peers.flatMap((c) => c.squad.map((id) => g.players[id]));
  const share = peerPlayers.filter((p) => willJoin(g, p, user).ok).length / peerPlayers.length;
  assert(share > 0.9, `only ${(share * 100).toFixed(0)}% of players at clubs of the same standing would join`);
  const willing = Object.values(g.players).filter((p) => p.clubId && p.clubId !== user.id && willJoin(g, p, user).ok).length;
  info(`${user.name} (rep ${user.reputation}): ${willing} players in the world would join`);
});

test('a rejected bid from a keen club can come back higher; offers pop up once', () => {
  const g = career('raise');
  const user = g.clubs[g.userClubId];
  const p = g.players[user.squad.filter((id) => !user.lineup.slots.includes(id))[0]];
  listPlayer(g, p.id, Math.round(p.value * 0.8));
  const forHim = () => (g.offers || []).find((x) => x.playerId === p.id);
  for (let i = 0; i < 25 && !forHim(); i++) startDay(g);
  const o = forHim();
  assert(o, 'no offer');
  assert(o.seen === false && newOffers(g).includes(o), 'a new offer should wait to be shown');
  o.interest = 1; // sure to come back
  assert(rejectOffer(g, o.id), 'a fully keen club should come back');
  assert(!forHim(), 'rejected offer removed');
  let back = null;
  for (let i = 0; i < 5 && !back; i++) { startDay(g); back = (g.offers || []).find((x) => x.playerId === p.id && x.raises); }
  assert(back, 'no improved bid');
  assertEq(back.clubId, o.clubId, 'same club');
  assert(back.fee > o.fee && back.previous === o.fee, `raised ${o.fee} -> ${back.fee}`);
  back.interest = 1;
  rejectOffer(g, back.id);
  for (let i = 0; i < 5; i++) startDay(g);
  const third = (g.offers || []).find((x) => x.playerId === p.id && x.raises === 2);
  if (third) { third.interest = 1; assert(!rejectOffer(g, third.id), 'at most two raises'); }
});

test('CONTINUE can stop for new offers', () => {
  const g = career('offerstop');
  const user = g.clubs[g.userClubId];
  for (const id of user.squad.filter((x) => !user.lineup.slots.includes(x)).slice(0, 4)) listPlayer(g, id, Math.round(g.players[id].value * 0.7));
  let stopped = false;
  for (let i = 0; i < 10 && !stopped; i++) {
    const f = advanceToUserMatch(g, { stopForOffers: true });
    if (g.stopReason === 'offer') { stopped = true; break; }
    if (f) playUserMatchInstant(g, f);
    delete g.stopReason;
  }
  assert(stopped, 'never stopped for an offer');
  assert(newOffers(g).some((o) => o.day === g.day), 'stopped without a new offer');
});

test('loaning out: a choice of clubs of his level, and he goes to the one picked', () => {
  const g = career('suitors');
  const user = g.clubs[g.userClubId];
  const p = user.squad.map((id) => g.players[id]).filter((x) => !user.lineup.slots.includes(x.id) && x.pos !== 'G')
    .sort((a, b) => a.skill - b.skill)[0];
  const list = loanSuitors(g, p.id);
  assertBetween(list.length, 1, 6, 'suitors');
  assertEq(JSON.stringify(loanSuitors(g, p.id)), JSON.stringify(list), 'the list stays the same within the week');
  for (const s of list) assert(s.clubId !== user.id && s.fee > 0 && s.wageShare > 0, 'suitor terms');
  const pick = list[list.length - 1];
  const before = user.budget;
  const r = loanToClub(g, p.id, pick.clubId);
  assert(r.ok, r.message);
  assertEq(p.clubId, pick.clubId);
  assertEq(user.budget, before + pick.fee, 'loan fee received');
  info(`${list.length} clubs: ${list.map((s) => `${g.clubs[s.clubId].name} ${s.starter ? 'starter' : 'squad'}`).join(', ')}`);
});
