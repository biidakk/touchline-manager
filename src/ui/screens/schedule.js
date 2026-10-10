// The user's season schedule: all fixtures with results.

import { clubFixtures } from '../../core/season.js';
import { fmtDate } from '../../core/calendar.js';
import { crest, icon } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { matchReport, roundLabel, scoreText, outcomeFor } from '../components/report.js';
import { esc, bindActions } from '../util.js';
import { clubLink } from '../components/links.js';

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const cup = g.competitions[g.nations[club.nationId].cupId];
  const rows = clubFixtures(g, club.id).map((f) => ({ day: f.day, f }));
  if (cup.alive.includes(club.id)) {
    for (const r of cup.rounds) if (!r.drawn) rows.push({ day: r.day, cupRound: r });
  }
  rows.sort((a, b) => a.day - b.day);

  const played = rows.filter((r) => r.f && r.f.result).map((r) => outcomeFor(g, r.f));
  const count = (x) => played.filter((o) => o === x).length;

  root.innerHTML = `${clubTopbar(ctx, { title: 'Season schedule' })}
  <div class="panel" style="left:20px;top:92px;width:1240px;height:540px;display:flex;flex-direction:column">
    <div class="panel-head"><h2>${esc(club.name)} ${g.season.year}/${String(g.season.year + 1).slice(2)}</h2>
      <span class="muted">Played ${played.length}: <span class="good">${count('W')} W</span> · ${count('D')} D · <span class="bad">${count('L')} L</span></span></div>
    <div class="scroll" style="flex:1">
    <table class="data">
      <thead><tr><th>Date</th><th>Competition</th><th>Round</th><th class="c">H/A</th><th></th><th>Opponent</th><th class="c">Result</th><th></th></tr></thead>
      <tbody>${rows.map((r) => {
        if (r.cupRound) {
          return `<tr><td>${fmtDate(r.day)}</td><td>${icon('trophy', 'ico')} ${esc(cup.name)}</td><td>${esc(r.cupRound.name)}</td>
            <td></td><td></td><td class="dim">Not drawn yet</td><td></td><td></td></tr>`;
        }
        const f = r.f;
        const home = f.homeId === club.id;
        const opp = g.clubs[home ? f.awayId : f.homeId];
        const c = g.competitions[f.compId];
        const o = f.result ? outcomeFor(g, f) : '';
        return `<tr class="${f.result ? 'click' : ''}" ${f.result ? `data-action="report" data-id="${f.id}"` : ''}>
          <td>${fmtDate(f.day)}</td><td>${icon(c.type === 'cup' ? 'trophy' : c.type === 'continental' ? 'star' : 'ball', 'ico')} ${esc(c.name)}</td><td>${roundLabel(g, f)}</td>
          <td class="c">${home ? 'H' : 'A'}</td><td style="width:26px">${clubLink(g, opp.id, { crest: 22, text: '' })}</td><td><b>${clubLink(g, opp.id)}</b></td>
          <td class="c">${f.result ? `<b>${scoreText(f)}</b>` : '<span class="dim">-</span>'}</td>
          <td class="c">${o ? `<span class="res-badge ${o}" style="width:22px;height:22px;font-size:12px">${o}</span>` : ''}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>
  <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

  bindTopbar(root, ctx);
  bindActions(root, {
    report: (el) => ctx.modal(matchReport(g, g.fixtures[el.dataset.id]), { title: 'Match report' }),
    back: () => ctx.back(),
  });
}
