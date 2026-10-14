// The assistant manager's advice before a match. What he notices depends on
// his stars:
//   1★  empty places, unavailable and out-of-position players, tired starters
//   2★  fresher or better players left out
//   3★  unhappy players, transfer requests, workload spikes
//   4★  the next opponent: aerial threat, pace, their key player
//   5★  a play style and attacking intent for the match

import { FORMATIONS, ROLE_POS, PLAY_STYLE_LABELS } from './data.js';
import { slotSkill } from './ai.js';
import { acwr } from './training.js';
import { moraleOf, moraleFactor } from './morale.js';
import { lineupQuality } from './ratings.js';
import { nextUserFixture } from './matchday.js';
import { ROLES, ROLE_LABEL } from './training.js';
import { confidence } from './board.js';
import { scoutingOf, LEVELS } from './scouting.js';
import { ACADEMY_MAX_AGE } from './development.js';
import { decisionsDue } from './commercial.js';
import { openWindow } from './transfers.js';
import { dayOf } from './calendar.js';
import { attrOf } from './attributes.js';

const BEATEN_BY = { crosses: 'passing', through: 'crosses', passing: 'through' };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const name = (p) => `${p.first[0]}. ${p.last}`;
const list = (ps) => ps.slice(0, 4).map(name).join(', ') + (ps.length > 4 ? ` and ${ps.length - 4} more` : '');

// How useful a player is today in a position: skill, energy and morale.
const today = (p, pos) => slotSkill(p, pos) * (0.75 + 0.25 * (p.energy ?? 100) / 100) * moraleFactor(p);

export function assistantAdvice(game) {
  const club = game.clubs[game.userClubId];
  const a = club.staff?.assistant;
  const stars = a?.stars || 0;
  const items = [];
  const add = (tone, text) => items.push({ tone, text });
  if (!stars) {
    add('info', 'You have no assistant manager. Hire one on the Training screen to get advice before matches.');
    return { name: null, stars, items };
  }
  const P = (id) => game.players[id];
  const l = club.lineup;
  const roles = FORMATIONS[l.formation].map(([r]) => ROLE_POS[r]);
  const xi = l.slots.map((id, i) => ({ id, p: id ? P(id) : null, pos: roles[i] }));

  // 1★
  const empty = xi.filter((x) => !x.p).length;
  if (empty) add('bad', `We have ${empty} empty place${empty > 1 ? 's' : ''} in the starting XI.`);
  const out = xi.filter((x) => x.p && (x.p.injuryDays > 0 || x.p.suspension > 0)).map((x) => x.p);
  if (out.length) add('bad', `${list(out)} can't play (injured or suspended).`);
  const oop = xi.filter((x) => x.p && x.p.pos !== x.pos).map((x) => x.p);
  if (oop.length) add('warn', `${list(oop)} ${oop.length > 1 ? 'are' : 'is'} playing out of position.`);
  const tired = xi.filter((x) => x.p && (x.p.energy ?? 100) < 75).map((x) => x.p);
  if (tired.length) add('warn', `${list(tired)} ${tired.length > 1 ? 'look' : 'looks'} tired (energy under 75%). Consider resting ${tired.length > 1 ? 'them' : 'him'}.`);

  // 2★
  if (stars >= 2) {
    const used = new Set([...l.slots, ...l.bench].filter(Boolean));
    const avail = club.squad.map(P).filter((p) => p && !used.has(p.id) && !p.injuryDays && !p.suspension);
    const benchAvail = l.bench.map(P).filter((p) => p && !p.injuryDays && !p.suspension);
    let shown = 0;
    for (const x of xi) {
      if (!x.p || shown >= 3) continue;
      const mine = today(x.p, x.pos);
      const better = [...benchAvail, ...avail].filter((p) => p.pos === x.pos && today(p, x.pos) >= mine + 3)
        .sort((p, q) => today(q, x.pos) - today(p, x.pos))[0];
      if (better) {
        add('info', `${name(better)} would be a better choice than ${name(x.p)} at ${x.pos} today (${Math.round(today(better, x.pos))} vs ${Math.round(mine)} with energy and morale).`);
        shown++;
      }
    }
  }

  // 3★
  if (stars >= 3) {
    const sq = club.squad.map(P).filter(Boolean);
    const requests = sq.filter((p) => p.mood?.request);
    if (requests.length) add('bad', `${list(requests)} ${requests.length > 1 ? 'want' : 'wants'} to leave. Talk to ${requests.length > 1 ? 'them' : 'him'} from the player card.`);
    const unhappy = sq.filter((p) => p.mood && !p.mood.request && moraleOf(p) < 40);
    if (unhappy.length) add('warn', `${list(unhappy)} ${unhappy.length > 1 ? 'are' : 'is'} unhappy. Playing time or a talk could help.`);
    const spikes = xi.filter((x) => x.p && acwr(x.p) > 1.5).map((x) => x.p);
    if (spikes.length) add('warn', `${list(spikes)} ${spikes.length > 1 ? 'have' : 'has'} had a sudden jump in workload: a higher injury risk.`);
    const promises = sq.filter((p) => p.mood?.promise);
    for (const p of promises) {
      const pr = p.mood.promise;
      add('info', `Promise to ${name(p)}: ${pr.starts} of 4 starts so far, ${8 - pr.matches} matches left.${l.slots.includes(p.id) ? '' : ' He is not in the XI today.'}`);
    }
  }

  // 4★ and 5★: the next opponent.
  const f = nextUserFixture(game);
  if (stars >= 4 && f) {
    const opp = game.clubs[f.homeId === club.id ? f.awayId : f.homeId];
    if (opp?.lineup) {
      const ol = opp.lineup;
      const oroles = FORMATIONS[ol.formation].map(([r]) => ROLE_POS[r]);
      const theirs = (pos) => ol.slots.map((id, i) => (id && oroles[i] === pos ? P(id) : null)).filter(Boolean);
      const ours = (pos) => xi.filter((x) => x.p && x.pos === pos).map((x) => x.p);
      const hF = avg(theirs('F').map((p) => p.height));
      const hD = avg(ours('D').map((p) => p.height));
      if (hF && hD && hF - hD >= 3) add('warn', `${opp.name}'s forwards are tall (${Math.round(hF)} cm on average, our defenders ${Math.round(hD)} cm). Watch the crosses and corners.`);
      const myF = avg(ours('F').map((p) => p.height));
      const theirD = avg(theirs('D').map((p) => p.height));
      if (myF && theirD && myF - theirD >= 3) add('good', `Our forwards are taller than their defence (${Math.round(myF)} vs ${Math.round(theirD)} cm): crosses could pay off.`);
      const pace = avg(ours('F').map((p) => attrOf(p, 'pac'))) - avg(theirs('D').map((p) => attrOf(p, 'pac')));
      if (pace >= 5) add('good', `Our forwards are quicker than their defenders (pace ${Math.round(avg(ours('F').map((p) => attrOf(p, 'pac'))))} vs ${Math.round(avg(theirs('D').map((p) => attrOf(p, 'pac'))))}): through-balls could work.`);
      else if (pace <= -6) add('warn', `Their defenders are quicker than our forwards: through-balls will struggle.`);
      const star = ol.slots.filter(Boolean).map(P).sort((p, q) => q.skill - p.skill)[0];
      if (star) add('info', `Their key player is ${star.first} ${star.last} (${star.pos}, skill ${star.skill}).`);
      if (stars >= 5) {
        const s = opp.tactics?.style || 'normal';
        if (s !== 'normal') add('good', `${opp.name} usually play ${PLAY_STYLE_LABELS[s].toLowerCase()}. ${PLAY_STYLE_LABELS[BEATEN_BY[s]]} works best against that.`);
        const diff = lineupQuality(game, club) - lineupQuality(game, opp);
        const home = f.homeId === club.id;
        const intent = diff >= 4 ? (home ? 70 : 60) : diff <= -4 ? (home ? 40 : 30) : 50;
        add('info', `We are ${diff >= 4 ? 'the stronger side' : diff <= -4 ? 'the underdogs' : 'evenly matched'} (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}). I'd set the attacking intent around ${intent}%.`);
      }
    }
  }
  if (!items.length) add('good', 'Everything looks fine. The team is ready.');
  return { name: a.name, stars, items };
}

// The assistant's to-do list for the hub: things worth the manager's
// attention today, each with the screen that deals with it. Unlike the
// match advice it needs no assistant (the club secretary keeps the list), but
// an assistant adds the squad's moods.
// Items: { tone: 'bad' | 'warn' | 'info', text, screen, params? }
export function clubChecklist(game) {
  const club = game.clubs[game.userClubId];
  if (!club) return [];
  const items = [];
  const add = (tone, text, screen, params) => items.push({ tone, text, screen, params });
  const P = (id) => game.players[id];
  const year = game.season.year;
  const sq = club.squad.map(P).filter(Boolean);
  const stars = club.staff?.assistant?.stars || 0;

  if (game.season.phase !== 'over' && decisionsDue(game).any) add('bad', "Set this season's ticket prices and choose a sponsor.", 'deals');

  const l = club.lineup;
  const empty = l.slots.filter((id) => !id).length;
  const out = l.slots.map(P).filter((p) => p && (p.injuryDays > 0 || p.suspension > 0));
  if (empty || out.length) {
    add('bad', `The starting XI has ${empty ? `${empty} empty place${empty > 1 ? 's' : ''}` : ''}${empty && out.length ? ' and ' : ''}${out.length ? `${list(out)} unavailable` : ''}.`, 'myteam');
  }
  const tired = l.slots.map(P).filter((p) => p && !out.includes(p) && (p.energy ?? 100) < 70);
  if (tired.length) add('warn', `${list(tired)} ${tired.length > 1 ? 'are' : 'is'} tired (energy under 70%).`, 'myteam');

  const offers = (game.offers || []).filter((o) => P(o.playerId)?.clubId === club.id);
  if (offers.length) add('warn', `${offers.length} offer${offers.length > 1 ? 's' : ''} for your players ${offers.length > 1 ? 'are' : 'is'} waiting for an answer.`, 'market', { tab: 'selling' });

  // Expiring contracts from New Year on (renewals are cheaper than replacements).
  if (game.season.phase !== 'over' && game.day >= dayOf(year + 1, 1, 1)) {
    const exp = sq.filter((p) => p.contractEnd <= year && !p.loan);
    if (exp.length) add('warn', `Contract${exp.length > 1 ? 's' : ''} ending this summer: ${list(exp)}.`, 'myteam');
  }

  if (stars >= 1) {
    const requests = sq.filter((p) => p.mood?.request);
    if (requests.length) add('bad', `${list(requests)} ${requests.length > 1 ? 'want' : 'wants'} to leave.`, 'myteam');
    const unhappy = sq.filter((p) => p.mood && !p.mood.request && moraleOf(p) < 40);
    if (unhappy.length) add('warn', `${list(unhappy)} ${unhappy.length > 1 ? 'are' : 'is'} unhappy.`, 'myteam');
  }

  const count = (pos) => sq.filter((p) => p.pos === pos && !p.loan).length;
  const need = { G: 2, D: 6, M: 6, F: 3 };
  const short = Object.entries(need).filter(([pos, n]) => count(pos) < n).map(([pos]) => ({ G: 'goalkeepers', D: 'defenders', M: 'midfielders', F: 'forwards' })[pos]);
  if (short.length) add('warn', `The squad is short of ${short.join(' and ')}.${openWindow(game) ? '' : ' Sign players when the window opens.'}`, 'market', { tab: 'search' });

  if (club.budget < 0) add('bad', 'The club is in debt. Sell players or cut wages before the board steps in.', 'finances', { title: 'Finances', milestone: 6 });
  const conf = confidence(game);
  if (conf < 40) add('bad', `The board's confidence is low (${conf}). Results have to improve.`, 'career', { title: 'My Career', milestone: 5 });

  if (game.season.phase !== 'over' && game.day >= dayOf(year + 1, 1, 1)) {
    const ending = ROLES.filter((r) => club.staff?.[r] && club.staff[r].until <= year);
    if (ending.length) add('warn', `Staff contract${ending.length > 1 ? 's' : ''} ending this summer: ${ending.map((r) => `${club.staff[r].name} (${ROLE_LABEL[r].toLowerCase()})`).join(', ')}. Extend ${ending.length > 1 ? 'them' : 'it'} under Staff.`, 'training', { title: 'Training', milestone: 10 });
  }
  const vacant = ROLES.filter((r) => !club.staff?.[r]);
  if (vacant.length) add('info', `Staff vacancies: ${vacant.join(', ')} coach${vacant.length > 1 ? 'es' : ''}.`, 'training', { title: 'Training', milestone: 10 });

  const sc = scoutingOf(game);
  const free = (LEVELS[sc.level]?.slots || 1) - (sc.assignments || []).length;
  if (free > 0) add('info', `${free} scout${free > 1 ? 's are' : ' is'} free. Send ${free > 1 ? 'them' : 'him'} to watch a player.`, 'market', { tab: 'scouting' });

  const last = (club.youth || []).map(P).filter((p) => p && year - p.birthYear >= ACADEMY_MAX_AGE);
  if (last.length) add('warn', `${list(last)} must be promoted from the academy this season or ${last.length > 1 ? 'they leave' : 'he leaves'}.`, 'youth');

  return items;
}
