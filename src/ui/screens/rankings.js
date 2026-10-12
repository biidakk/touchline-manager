// Coefficient rankings: countries (five seasons, total, places next season)
// and clubs (top 100 and your club).

import { countryRanking, clubTotal, ensureCoefficients } from '../../core/coefficients.js';
import { flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, bindActions } from '../util.js';
import { clubLink } from '../components/links.js';

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const st = { tab: params.tab || 'countries' };
  const y = (yr) => `${String(yr).slice(2)}/${String(yr + 1).slice(2)}`;
  const f1 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

  function countries() {
    const co = ensureCoefficients(g);
    const year = g.season.year;
    const seasons = [year - 5, year - 4, year - 3, year - 2, year - 1];
    const me = g.clubs[g.userClubId].nationId;
    const places = (p) => [p.CCC && `${p.CCC} CL`, p.CEL && `${p.CEL} EL`, p.CCL && `${p.CCL} ECL`].filter(Boolean).join(' · ') || '<span class="dim">-</span>';
    return `<table class="data"><thead><tr><th class="num">#</th><th>Country</th>${seasons.map((s) => `<th class="num phone-hide">${y(s)}</th>`).join('')}
      <th class="num">Total</th><th>Places ${y(year)}</th></tr></thead><tbody>
      ${countryRanking(g).map((r) => `<tr class="${r.nationId === me ? 'me' : ''}"><td class="num">${r.rank}.</td>
        <td>${flag(g.nations[r.nationId].flag, 18)} ${esc(g.nations[r.nationId].name)}${g.nations[r.nationId].leagueIds.length ? '' : ' <span class="muted" style="font-size:12px">(guests)</span>'}</td>
        ${seasons.map((s) => `<td class="num phone-hide">${f1(co.country[r.nationId]?.[s] || 0)}</td>`).join('')}
        <td class="num"><b>${f1(r.total)}</b></td><td>${places(r.places)}</td></tr>`).join('')}</tbody></table>`;
  }

  function clubs() {
    ensureCoefficients(g);
    const all = Object.values(g.clubs).map((c) => ({ id: c.id, total: clubTotal(g, c.id) }))
      .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
    const mine = all.findIndex((r) => r.id === g.userClubId);
    const rows = all.slice(0, 100);
    if (mine >= 100) rows.push(all[mine]);
    return `<table class="data"><thead><tr><th class="num">#</th><th>Club</th><th>Country</th><th class="num">Coefficient</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.id === g.userClubId ? 'me' : ''}"><td class="num">${all.indexOf(r) + 1}.</td>
        <td>${clubLink(g, r.id, { crest: 18 })}</td><td>${flag(g.nations[g.clubs[r.id].nationId].flag, 16)} ${esc(g.nations[g.clubs[r.id].nationId].name)}</td>
        <td class="num"><b>${f1(r.total)}</b></td></tr>`).join('')}</tbody></table>`;
  }

  function draw() {
    root.innerHTML = `${clubTopbar(ctx, { title: 'Coefficients' })}
    <div class="panel" style="left:20px;top:92px;width:1240px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${st.tab === 'countries' ? 'Country ranking (last five seasons)' : 'Club ranking (last five seasons)'}</h2>
        <div class="seg"><button class="${st.tab === 'countries' ? 'on' : ''}" data-action="tab" data-v="countries">Countries</button>
          <button class="${st.tab === 'clubs' ? 'on' : ''}" data-action="tab" data-v="clubs">Clubs</button></div></div>
      <div class="scroll" style="flex:1">${st.tab === 'countries' ? countries() : clubs()}</div>
      <p class="hint phone-hide" style="margin:8px 0 0">Points for European results: 2 a win, 1 a draw, a bonus for the league phase and for each knockout round. A country's season score is its clubs' points divided by the number of clubs it entered; the ranking decides each country's places. Club coefficients seed the league-phase pots.</p>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    tab: (el) => { st.tab = el.dataset.v; draw(); },
    back: () => ctx.back(),
  });
  draw();
}
