// Extra news items that make the world feel alive: big results, hat-tricks,
// goal milestones, league leaders, big transfers, opponent previews and the
// board's mid-season verdict.

import { addNews, sortedTable } from './season.js';
import { boardTarget } from './worldgen.js';
import { confidence } from './board.js';

const name = (p) => `${p.first} ${p.last}`;

export function afterResult(game, f) {
  const user = game.clubs[game.userClubId];
  if (!user) return;
  const inUserLeague = f.compId === user.compId;
  const mine = f.homeId === user.id || f.awayId === user.id;
  const r = f.result;
  const h = game.clubs[f.homeId];
  const a = game.clubs[f.awayId];
  if (inUserLeague && !mine && Math.abs(r.h - r.a) >= 4) {
    const [w, l] = r.h > r.a ? [h, a] : [a, h];
    addNews(game, `${w.name} thrash ${l.name} ${Math.max(r.h, r.a)}:${Math.min(r.h, r.a)}.`, 'result');
  }
  const counts = {};
  for (const gl of r.goals) counts[gl.playerId] = (counts[gl.playerId] || 0) + 1;
  for (const [id, n] of Object.entries(counts)) {
    const p = game.players[id];
    if (!p) continue;
    if (n >= 3 && (inUserLeague || mine)) {
      addNews(game, `${n === 3 ? 'Hat-trick' : `${n} goals`} for ${name(p)} (${game.clubs[p.clubId].short}) against ${p.clubId === h.id ? a.name : h.name}!`, 'player');
    }
    if (p.clubId === user.id && [10, 20, 30].includes(p.stats.season.goals)) {
      addNews(game, `${name(p)} has scored ${p.stats.season.goals} goals this season.`, 'player');
    }
  }
}

// After each day: a new leader in the user's league.
export function afterDay(game) {
  const user = game.clubs[game.userClubId];
  if (!user) return;
  const comp = game.competitions[user.compId];
  const rows = sortedTable(game, comp);
  if (!rows.length || rows[0].p < 3) return;
  const leader = rows[0].clubId;
  if (comp.leaderId && comp.leaderId !== leader) {
    addNews(game, leader === user.id ? `We are top of the ${comp.name}!` : `${game.clubs[leader].name} go top of the ${comp.name}.`, 'league');
  }
  comp.leaderId = leader;
}

export function bigTransfer(game, t) {
  const user = game.clubs[game.userClubId];
  if (!user || t.fromId === user.id || t.toId === user.id || t.fee < 8e6) return;
  const nat = user.nationId;
  if (game.clubs[t.fromId].nationId !== nat && game.clubs[t.toId].nationId !== nat) return;
  addNews(game, `Big transfer: ${t.playerName} moves from ${game.clubs[t.fromId].name} to ${game.clubs[t.toId].name} for ${t.fee.toLocaleString('en-US')} €.`, 'transfer');
}

// Before the user's match: a short preview of the opponent.
export function opponentPreview(game, f) {
  const user = game.clubs[game.userClubId];
  const opp = game.clubs[f.homeId === user.id ? f.awayId : f.homeId];
  const row = game.competitions[opp.compId].table[opp.id];
  const players = opp.squad.map((id) => game.players[id]);
  const scorer = players.slice().sort((x, y) => y.stats.season.goals - x.stats.season.goals)[0];
  const missing = players.filter((p) => p.injuryDays > 0 || p.suspension > 0)
    .sort((x, y) => y.skill - x.skill).slice(0, 2);
  const parts = [`Next up: ${opp.name}`];
  if (row && row.form.length) parts.push(`form ${row.form.slice(-5).join('')}`);
  if (scorer && scorer.stats.season.goals) parts.push(`top scorer ${scorer.last} (${scorer.stats.season.goals})`);
  if (missing.length) parts.push(`without ${missing.map((p) => p.last).join(' and ')}`);
  addNews(game, parts.join(', ') + '.', 'preview');
}

// 1 January: how the board sees the season so far.
export function boardVerdict(game) {
  const user = game.clubs[game.userClubId];
  if (!user) return;
  const comp = game.competitions[user.compId];
  const pos = sortedTable(game, comp).findIndex((r) => r.clubId === user.id) + 1;
  const t = game.manager?.target;
  const target = t && t.clubId === user.id ? t : boardTarget(game, user);
  const n = comp.clubIds.length;
  let text;
  if (pos <= target.maxPos) text = `The board is pleased with ${pos}. place at the halfway point (target: ${target.text.toLowerCase()}).`;
  else if (pos <= target.maxPos + 3) text = `The board expects improvement: ${pos}. place, the target is to ${target.text.toLowerCase()}.`;
  else text = `The board is concerned: ${pos}. of ${n} is well below the target (${target.text.toLowerCase()}).`;
  addNews(game, `${text} Board confidence: ${confidence(game)}/100.`, 'board');
}
