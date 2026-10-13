// Match report for a played fixture (shown in a modal).

import { crest } from './svg.js';
import { fmtDate } from '../../core/calendar.js';
import { teamOf } from '../../core/national.js';
import { esc, playerName } from '../util.js';
import { clubLink, playerLink } from './links.js';

export function roundLabel(game, f) {
  const c = game.competitions[f.compId];
  const leg = f.leg === 1 ? ' · 1st leg' : f.leg === 2 ? ' · 2nd leg' : '';
  if (c.type === 'continental') {
    if (f.phase === 'league') return `League phase · Matchday ${f.round}`;
    return f.group !== undefined ? `Group ${c.groups[f.group].name} · Matchday ${f.round}` : c.rounds[f.cupRound].name + leg;
  }
  if (c.type === 'national') return `Matchday ${f.round}`;
  if (c.type === 'friendly') return `${f.winter ? 'Winter break' : 'Pre-season'} ${f.round}/3`;
  return c.type === 'cup' ? c.rounds[f.cupRound].name + leg : `Round ${f.round}`;
}

export function scoreText(f) {
  const r = f.result;
  let s = `${r.h} : ${r.a}`;
  const extra = [];
  if (r.agg) extra.push(`agg ${r.agg.h}:${r.agg.a}`);
  if (r.pens) extra.push(`pens ${r.pens.h}:${r.pens.a}`);
  else if (r.et) extra.push('a.e.t.');
  if (extra.length) s += ` (${extra.join(', ')})`;
  return s;
}

// 'W' | 'D' | 'L' from the user's point of view (cup ties count the winner).
export function outcomeFor(game, f, clubId = game.userClubId) {
  const r = f.result;
  if (r.winner && r.h === r.a) return r.winner === clubId ? 'W' : 'L';
  const mine = f.homeId === clubId ? r.h : r.a;
  const theirs = f.homeId === clubId ? r.a : r.h;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

const minuteText =(e) => (e.added ? `${e.minute}+${e.added}'` : `${e.minute}'`);

// "Why we won / lost": the few things that decided the match, from the
// user's side (his club's matches with the analysis stored after them).
export function whyHtml(game, f) {
  const r = f.result;
  const an = r?.analysis;
  if (!an || !r.stats) return '';
  const me = f.homeId === game.userClubId ? 0 : f.awayId === game.userClubId ? 1 : -1;
  if (me < 0) return '';
  const op = 1 - me;
  const gf = me === 0 ? r.h : r.a;
  const ga = me === 0 ? r.a : r.h;
  const [s, o] = [r.stats[me], r.stats[op]];
  const xg = (x) => (x.xg ?? 0);
  const lines = [];
  const xgF = xg(s);
  const xgA = xg(o);
  if (xgF - xgA >= 0.4) lines.push(`We created the better chances (expected goals ${xgF.toFixed(1)} to ${xgA.toFixed(1)}).`);
  else if (xgA - xgF >= 0.4) lines.push(`They created the better chances (expected goals ${xgA.toFixed(1)} to ${xgF.toFixed(1)}).`);
  else lines.push(`The chances were even (expected goals ${xgF.toFixed(1)} to ${xgA.toFixed(1)}).`);
  if (gf - xgF >= 1.2) lines.push(`Clinical finishing: ${gf} goal${gf === 1 ? '' : 's'} from chances worth ${xgF.toFixed(1)}.`);
  else if (xgF - gf >= 1.2) lines.push(`Wasteful in front of goal: ${gf} from chances worth ${xgF.toFixed(1)}.`);
  if (ga - xgA >= 1.2) lines.push(`They scored more than their chances deserved (${ga} from ${xgA.toFixed(1)}).`);
  else if (xgA - ga >= 1.2) lines.push(`Our goalkeeper and defence kept out chances worth ${xgA.toFixed(1)}.`);
  const dSkill = an.skill[me] - an.skill[op];
  if (Math.abs(dSkill) >= 3) lines.push(dSkill > 0 ? `Our eleven was stronger on paper (${an.skill[me]} to ${an.skill[op]}).` : `Their eleven was stronger on paper (${an.skill[op]} to ${an.skill[me]}).`);
  const pt = s.poss + o.poss || 1;
  const poss = Math.round((100 * s.poss) / pt);
  if (poss >= 60 || poss <= 40) lines.push(poss >= 60 ? `We controlled the ball (${poss}% possession).` : `They dominated the ball (${100 - poss}% possession).`);
  const dE = an.energy[me] - an.energy[op];
  if (Math.abs(dE) >= 8) lines.push(dE > 0 ? `They tired more (energy at the end ${an.energy[op]}% to our ${an.energy[me]}%).` : `We ran out of legs (energy at the end ${an.energy[me]}% to their ${an.energy[op]}%): rotate or train lighter.`);
  if (s.red) lines.push(`A red card cost us${s.red > 1 ? ` (${s.red})` : ''}.`);
  if (o.red) lines.push(`They had ${o.red > 1 ? `${o.red} players` : 'a player'} sent off.`);
  if (an.intent[me] >= 80 && o.shots >= 14) lines.push(`Our attacking intent (${an.intent[me]}) left gaps: they had ${o.shots} shots.`);
  else if (an.intent[me] <= 30 && s.shots <= 7) lines.push(`Playing so cautiously (intent ${an.intent[me]}) gave us only ${s.shots} shots.`);
  const title = gf > ga ? 'Why we won' : gf < ga ? 'Why we lost' : 'Why it was a draw';
  return `<div class="why"><h3>${title}</h3><ul>${lines.slice(0, 5).map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
}

export function matchReport(game, f) {
  const r = f.result;
  const home = teamOf(game, f.homeId);
  const away = teamOf(game, f.awayId);
  const comp = game.competitions[f.compId];
  const P = (id) => game.players[id];
  // Players who have since left football are no longer in the world.
  const nm = (id) => (P(id) ? playerLink(game, id, { text: playerName(P(id)) }) : 'a former player');
  const team = (t, size) => (game.clubs[t.id] ? `${clubLink(game, t.id, { crest: size, text: '' })}<b>${clubLink(game, t.id)}</b>` : `${crest(t.crest, size)}<b>${esc(t.name)}</b>`);

  const side = (i) => {
    const goals = r.goals.filter((g) => g.side === i).map((g) => `<div>${minuteText(g)} ${nm(g.playerId)}${g.penalty ? ' (pen)' : ''} ⚽</div>`);
    const cards = r.cards.filter((c) => c.side === i).map((c) => `<div>${minuteText(c)} ${nm(c.playerId)} <span class="card ${c.red ? 'red' : 'yellow'}"></span></div>`);
    return [...goals, ...cards].join('') || '<div class="dim">-</div>';
  };

  let stats = '';
  if (r.stats) {
    const [a, b] = r.stats;
    const possTotal = a.poss + b.poss || 1;
    const rows = [
      ['Possession', `${Math.round((100 * a.poss) / possTotal)}%`, `${Math.round((100 * b.poss) / possTotal)}%`],
      ...(a.xg !== undefined ? [['Expected goals', a.xg.toFixed(1), (b.xg ?? 0).toFixed(1)]] : []),
      ['Shots', a.shots, b.shots], ['On target', a.onTarget, b.onTarget], ['Corners', a.corners, b.corners],
      ['Free kicks at goal', a.freeKicks || 0, b.freeKicks || 0],
      ['Aerial duels won', a.aerials || 0, b.aerials || 0],
      ['Fouls', a.fouls, b.fouls], ['Yellow cards', a.yellow, b.yellow], ['Red cards', a.red, b.red],
    ];
    stats = `<table class="data report-stats">${rows.map(([k, x, y]) => `<tr><td class="num"><b>${x}</b></td><td class="c muted">${k}</td><td><b>${y}</b></td></tr>`).join('')}</table>`;
  }

  let lineups = '';
  if (r.lineups) {
    const col = (i) => r.lineups[i].played.filter((id) => P(id)).map((id) => {
      const rating = r.lineups[i].ratings[id];
      return `<tr><td>${P(id).number}</td><td>${nm(id)}</td><td class="c">${P(id).pos}</td>
        <td class="num ${rating >= 7 ? 'good' : rating < 6 ? 'bad' : ''}">${rating.toFixed(1)}</td></tr>`;
    }).join('');
    lineups = `<div class="report-cols">
      <table class="data">${col(0)}</table><table class="data">${col(1)}</table></div>`;
  }

  return `<div class="report">
    <div class="muted c">${esc(comp.name)} · ${roundLabel(game, f)} · ${fmtDate(f.day)}</div>
    <div class="report-head">
      <div class="team">${team(home, 64)}</div>
      <div class="score">${r.h}<span>:</span>${r.a}</div>
      <div class="team">${team(away, 64)}</div>
    </div>
    ${r.agg ? `<div class="c"><b>Aggregate ${r.agg.h}:${r.agg.a}</b>${r.winner ? ` · ${esc(teamOf(game, r.winner).name)} go through` : ''}</div>` : ''}
    ${r.pens ? `<div class="c"><b>${r.pens.h}:${r.pens.a} on penalties</b></div>` : r.et ? '<div class="c"><b>After extra time</b></div>' : ''}
    <div class="report-cols"><div>${side(0)}</div><div style="text-align:right">${side(1)}</div></div>
    ${whyHtml(game, f)}
    ${stats}
    ${lineups}
  </div>`;
}
