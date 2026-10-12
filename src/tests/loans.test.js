import { test, assert, assertEq, assertBetween, info } from './harness.js';
import { generateWorld, startCareer } from '../core/worldgen.js';
import { startDay, simulateRestOfSeason } from '../core/matchday.js';
import { endSeason } from '../core/seasonend.js';
import { evaluateLoanRequest, borrowPlayer, listForLoan, acceptLoanOffer, partnerCandidates, setPartner, loanToPartner,
  loanedOutBy } from '../core/loans.js';
import { searchPlayers, evaluateBid } from '../core/transfers.js';
import { wageBill } from '../core/finance.js';
import { startAcademy } from '../core/development.js';

function career(seed, comp = 'ENG-L1', idx = 5) {
  const w = generateWorld({ seed });
  const g = startCareer(w, w.competitions[comp].clubIds[idx], 'Loaner');
  startAcademy(g);
  g.manager.board.standing = 100; // a patient board: a mid-season sacking would stop the simulated season
  return g;
}

test('borrowing: starters are refused, a reserve joins for a fee and returns at season end', () => {
  const g = career('borrow');
  const user = g.clubs[g.userClubId];
  user.budget = 50e6;
  const owner = Object.values(g.clubs).find((c) => c.id !== user.id && c.squad.length > 20);
  const starter = owner.lineup.slots[3];
  assertEq(evaluateLoanRequest(g, starter, 1).status, 'rejected', 'starter');
  const reserve = owner.squad.find((id) => !owner.lineup.slots.includes(id) && g.players[id].pos !== 'G');
  assertEq(evaluateLoanRequest(g, reserve, 0.25).status, 'rejected', 'too small a wage share');
  const before = user.budget;
  const r = borrowPlayer(g, reserve, 1);
  assertEq(r.status, 'accepted', r.message);
  const p = g.players[reserve];
  assert(user.squad.includes(reserve) && !owner.squad.includes(reserve), 'moved');
  assertEq(p.loan.parentId, owner.id);
  assert(user.budget < before, 'loan fee paid');
  assert(!searchPlayers(g, {}).some((x) => x.p.id === reserve), 'loaned players are not for sale');
  assertEq(evaluateBid(g, reserve, 1e9).status, 'rejected', 'cannot buy a loaned player');
  simulateRestOfSeason(g);
  endSeason(g);
  assert(!user.squad.includes(reserve), 'should have left the borrowing club');
  // Unless his own club released or retired him at season end, he's back there.
  if (g.players[reserve]) assert(!p.loan && p.clubId === owner.id && owner.squad.includes(reserve), 'back at his club');
});

test('wages are split between the parent club and the borrower', () => {
  const g = career('wages');
  const user = g.clubs[g.userClubId];
  user.budget = 50e6;
  const owner = Object.values(g.clubs).find((c) => c.id !== user.id && c.squad.length > 20);
  const id = owner.squad.find((x) => !owner.lineup.slots.includes(x) && g.players[x].pos !== 'G');
  const w = g.players[id].wage;
  const userBefore = wageBill(g, user);
  const ownerBefore = wageBill(g, owner);
  borrowPlayer(g, id, 0.75);
  assertBetween(wageBill(g, user) - userBefore, w * 0.75 - 1, w * 0.75 + 1, 'borrower share');
  assertBetween(ownerBefore - wageBill(g, owner), w * 0.75 - 1, w * 0.75 + 1, 'parent keeps a quarter');
});

test('AI clubs make loan offers for listed and unused young players, and loans can be accepted', () => {
  const g = career('offers');
  const user = g.clubs[g.userClubId];
  // Three players on the loan list (offers come at about 10% a day each, from the end of pre-season).
  const listed = user.squad.filter((id) => !user.lineup.slots.includes(id) && g.players[id].pos !== 'G').slice(0, 3);
  for (const id of listed) listForLoan(g, id);
  const loanOffer = () => (g.offers || []).find((o) => o.type === 'loan' && listed.includes(o.playerId));
  for (let i = 0; i < 45 && !loanOffer(); i++) startDay(g);
  const o = loanOffer();
  assert(o, 'no loan offer in the summer window');
  const p = g.players[o.playerId];
  assert(acceptLoanOffer(g, o.id), 'accept failed');
  assertEq(p.clubId, o.clubId);
  assert(loanedOutBy(g, user.id).includes(p), 'listed as loaned out');
  const unsolicited = (g.offers || []).filter((x) => x.type === 'loan').length;
  info(`Loan offers in the window: accepted 1, others pending ${unsolicited}`);
});

test('B-team partner: free loans, regular games, academy players return to the academy', () => {
  const g = career('partner', 'GER-L1', 2);
  const user = g.clubs[g.userClubId];
  const cands = partnerCandidates(g);
  assert(cands.length > 0 && cands.every((c) => c.nationId === user.nationId && c.compId !== user.compId), 'candidates');
  const partner = cands[0];
  setPartner(g, partner.id);
  const kid = g.players[user.youth[0]];
  const budget = user.budget;
  const r = loanToPartner(g, kid.id);
  assert(r.ok, r.message);
  assertEq(user.budget, budget, 'free loan');
  assertEq(kid.loan.wageShare, 1, 'partner pays the wage');
  simulateRestOfSeason(g);
  const apps = kid.stats.season.apps;
  info(`Academy loanee at the partner: ${apps} appearances (skill ${kid.skill}, partner level ~${Math.round(partner.lineup.slots.reduce((a, id) => a + g.players[id].skill, 0) / 11)})`);
  assert(apps >= 15, 'the partner should play him regularly');
  endSeason(g);
  if (g.players[kid.id]) assert(user.youth.includes(kid.id) || g.season.year - kid.birthYear > 19, 'should return to the academy');
});
