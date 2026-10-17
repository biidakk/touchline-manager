import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { openWindow, windows, askingPrice, evaluateBid, buyPlayer, listPlayer, acceptOffer, renewContract, searchPlayers,
  willJoin, rejectOffer, newOffers, leaguePriceFactor, buyerPriceFactor, expiringContracts, leagueGamesLeft, contractWish, respondToContract }
  from '../core/transfers.js';
import { ageOf } from '../core/valuation.js';
import { loanSuitors, loanToClub } from '../core/loans.js';
import { advanceToUserMatch, playUserMatchInstant, startDay, simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { dayOf } from '../core/calendar.js';
import { wageBill } from '../core/finance.js';

function career(seed, comp = 'ENG-L1', idx = 6) {
  const w = generateWorld({ seed });
  return startCareer(w, w.competitions[comp].clubIds[idx], 'Market');
}

test('transfer windows: pre-season to 31 August, and 27 December to 7 February', () => {
  const g = career('win');
  const y = g.season.year;
  assert(openWindow(g), 'window should be open in pre-season');
  assert(openWindow(g, dayOf(y, 8, 31)), '31 Aug open');
  assert(!openWindow(g, dayOf(y, 9, 1)), '1 Sep closed');
  assert(!openWindow(g, dayOf(y, 12, 10)), 'December closed');
  assert(openWindow(g, dayOf(y + 1, 1, 15)), 'January open');
  assert(openWindow(g, dayOf(y, 12, 27)) && openWindow(g, dayOf(y + 1, 2, 7)), 'winter: 27 December to 7 February');
  assert(!openWindow(g, dayOf(y + 1, 2, 8)), '8 February closed');
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
  // Three players on the list (offers come from the end of pre-season).
  const listed = user.squad.filter((id) => !user.lineup.slots.includes(id)).slice(0, 3);
  for (const id of listed) listPlayer(g, id, Math.round(g.players[id].value * 0.8));
  const forHim = () => (g.offers || []).find((x) => listed.includes(x.playerId) && x.type !== 'loan');
  for (let i = 0; i < 45 && !forHim(); i++) startDay(g);
  const o = forHim();
  assert(o, 'no offers received in the summer window');
  const p = g.players[o.playerId];
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
  assertBetween(n, 30, 400, 'number of transfers'); // about 34-56 a season depending on the seed
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
  assertEq(g.day, dayOf(g.season.year, 12, 27));
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
  // Three players on the list (offers come from the end of pre-season).
  const listed = user.squad.filter((id) => !user.lineup.slots.includes(id)).slice(0, 3);
  for (const id of listed) listPlayer(g, id, Math.round(g.players[id].value * 0.8));
  const anyOffer = () => (g.offers || []).find((x) => listed.includes(x.playerId) && !x.type);
  for (let i = 0; i < 45 && !anyOffer(); i++) startDay(g);
  const o = anyOffer();
  assert(o, 'no offer');
  const p = g.players[o.playerId];
  const forHim = () => (g.offers || []).find((x) => x.playerId === p.id && x.clubId === o.clubId);
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

test('prices: players from the strongest leagues cost more, from small ones less', () => {
  const g = career('leagueprice');
  const f = (n) => leaguePriceFactor(g, n);
  assertEq(f('ENG'), 1.35, 'top five');
  assertEq(f('POR'), 1.15, '6-10');
  assertEq(f('SCO'), 1, '11-20');
  assertEq(f('ROU'), 0.85, '21 and below');
  // Same player, moved between countries: the price follows the league.
  const p = Object.values(g.players).find((x) => g.clubs[x.clubId]?.nationId === 'ENG' && !x.listed);
  const eng = askingPrice(g, p);
  const ro = Object.values(g.clubs).find((c) => c.nationId === 'ROU');
  const home = p.clubId;
  p.clubId = ro.id;
  const rou = askingPrice(g, p);
  p.clubId = home;
  assert(eng > rou * 1.4, `England ${eng} vs Romania ${rou}`);
});

test('expiring contracts are flagged seven league games before the end', () => {
  const g = career('expiry');
  const user = g.clubs[g.userClubId];
  const p = g.players[user.squad[3]];
  p.contractEnd = g.season.year;
  assertEq(expiringContracts(g, user.id).length > 0, false, 'not yet at the start');
  for (let i = 0; i < 400 && leagueGamesLeft(g, user.id) > 7; i++) {
    const f = advanceToUserMatch(g);
    if (f) playUserMatchInstant(g, f);
    delete g.stopReason;
  }
  assert(expiringContracts(g, user.id).some((x) => x.id === p.id), 'flagged with 7 games left');
  assert(!expiringContracts(g, user.id, 3).length || leagueGamesLeft(g, user.id) <= 3, 'the reminder waits for 3 games');
});

test('contract talks: a fair offer is accepted, low ones use up his patience', () => {
  const g = career('talks');
  const user = g.clubs[g.userClubId];
  const p = Object.values(g.players).find((x) => x.clubId !== user.id && ageOf(x, g.season.year) >= 24 && ageOf(x, g.season.year) <= 28);
  const wish = contractWish(g, p, user);
  const ok = respondToContract(g, p, user, { patience: 3 }, { wage: wish.wage, years: wish.years[0] });
  assertEq(ok.status, 'accepted', ok.message);
  const neg = { patience: 3 };
  const low = respondToContract(g, p, user, neg, { wage: Math.round(wish.wage * 0.9), years: wish.years[0] });
  assertEq(low.status, 'counter', low.message);
  assert(low.wage >= wish.wage * 0.97, 'he names his price');
  const insulting = respondToContract(g, p, user, neg, { wage: Math.round(wish.wage * 0.5), years: wish.years[0] });
  assertEq(insulting.status, 'walked', 'a very low offer ends the talks');
  const odd = respondToContract(g, p, user, { patience: 3 }, { wage: wish.wage, years: 1 });
  if (wish.years[0] > 1) assertEq(odd.status, 'counter', 'a length he does not want costs more');
});

test('AI transfer lists: clubs list surplus players for each window; listed players are cheaper and easier to buy', () => {
  const g = career('lists');
  const user = g.clubs[g.userClubId];
  user.budget = 1e9;
  startDay(g);
  const listed = Object.values(g.players).filter((p) => p.aiListed);
  assert(listed.length > 50, `only ${listed.length} players listed at the start of the window`);
  const p = listed.find((x) => willJoin(g, x, user).ok && g.clubs[x.clubId].squad.filter((id) => g.players[id].pos === x.pos).length > 5);
  assert(p, 'a listed player who would join');
  const ask = askingPrice(g, p);
  assertEq(evaluateBid(g, p.id, Math.round(ask * 0.9)).status, 'accepted', 'a listed player goes for 90 % of the price');
  assertEq(evaluateBid(g, p.id, Math.round(ask * 0.65)).status, 'counter', 'and his club talks from lower bids');
  const listedPrice = ask;
  p.listed = false; delete p.aiListed; const keep = p.askingPrice; delete p.askingPrice;
  assert(askingPrice(g, p) > listedPrice, `unlisted ${askingPrice(g, p)} vs listed ${listedPrice}`);
  p.listed = true; p.aiListed = true; p.askingPrice = keep;
  const close = windows(g).find((w) => w.name === 'summer').close;
  while (g.day <= close) startDay(g);
  assertEq(Object.values(g.players).filter((x) => x.aiListed).length, 0, 'the lists end with the window');
  info(`Listed at the start of the summer window: ${listed.length} players`);
});

test('bids for your players: clubs from richer leagues pay more', () => {
  const g = career('buyer-price', 'CZE-L1', 0);
  const f = (buyer, seller) => buyerPriceFactor(g, buyer, seller);
  assertEq(f('CZE', 'CZE'), 1, 'from home');
  assert(f('ENG', 'CZE') > 1.5 && f('ENG', 'CZE') <= 2.2, `England for a Czech player: ${f('ENG', 'CZE')}`);
  assert(f('ENG', 'CZE') > f('POR', 'CZE') && f('POR', 'CZE') > 1, 'the bigger the league, the more');
  assert(f('CZE', 'ENG') < 1 && f('CZE', 'ENG') >= 0.75, 'a smaller league pays less');
  assert(Math.abs(f('ESP', 'ENG') - 1) <= 0.25, 'the big leagues among themselves: close');
  info(`Czech player: England x${f('ENG', 'CZE').toFixed(2)}, Portugal x${f('POR', 'CZE').toFixed(2)}, Austria x${f('AUT', 'CZE').toFixed(2)}`);
});
