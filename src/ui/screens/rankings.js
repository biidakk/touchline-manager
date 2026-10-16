// Coefficient rankings: countries (five seasons, this season so far, total,
// places this season and next season as things stand) and clubs (top 100 and
// your club, season by season).

import { countryRanking, liveRanking, seasonPoints, clubTotal, ensureCoefficients } from '../../core/coefficients.js';
import { flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, bindActions } from '../util.js';
import { clubLink } from '../components/links.js';

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const st = { tab: params.tab || 'countries' };
  const y = (yr) => `${String(yr).slice(2)}/${String(yr + 1).slice(2)}`;
  const f1 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
  const year = g.season.year;
  const seasons = [year - 5, year - 4, year - 3, year - 2, year - 1];
  const me = g.clubs[g.userClubId].nationId;
  const places = (p) => `${p.CCC} / ${p.CEL} / ${p.CCL}`;
  const live = seasonPoints(g);

  function countries() {
    const co = ensureCoefficients(g);
    const next = new Map(liveRanking(g).map((r) => [r.nationId, r]));
    const arrow = (now, then) => (then < now ? '<span class="good">↑</span>' : then > now ? '<span class="bad">↓</span>' : '<span class="dim">–</span>');
    return `<table class="data coef"><thead><tr><th class="num">#</th><th>Country</th>${seasons.map((s) => `<th class="num">${y(s)}</th>`).join('')}
      <th class="num">Total</th><th class="c">Places ${y(year)}<br><span class="muted">CL / EL / ECL</span></th>
      <th class="num live">${y(year)}<br><span class="muted">so far</span></th><th class="c live">Next season<br><span class="muted">as it stands</span></th></tr></thead><tbody>
      ${countryRanking(g).map((r) => {
        const n = next.get(r.nationId);
        return `<tr class="${r.nationId === me ? 'me' : ''}"><td class="num">${r.rank}.</td>
        <td class="coef-name">${flag(g.nations[r.nationId].flag, 18)} ${esc(g.nations[r.nationId].name)}${g.nations[r.nationId].leagueIds.length ? '' : ' <span class="muted phone-hide" style="font-size:12px">(guests)</span>'}</td>
        ${seasons.map((s) => `<td class="num">${f1(co.country[r.nationId]?.[s] || 0)}</td>`).join('')}
        <td class="num"><b>${f1(r.total)}</b></td><td class="c">${places(r.places)}</td>
        <td class="num live">${f1(live.country[r.nationId] || 0)}</td>
        <td class="c live">${n.rank}. ${arrow(r.rank, n.rank)} ${places(n.places)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  function clubs() {
    const co = ensureCoefficients(g);
    const all = Object.values(g.clubs).map((c) => ({ id: c.id, total: clubTotal(g, c.id), own: seasons.reduce((a, s) => a + (co.club[c.id]?.[s] || 0), 0) }))
      .filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
    const mine = all.findIndex((r) => r.id === g.userClubId);
    const rows = all.slice(0, 100);
    if (mine >= 100) rows.push(all[mine]);
    const pts = (v) => (v === undefined ? '<span class="dim">-</span>' : v);
    return `<table class="data coef"><thead><tr><th class="num">#</th><th>Club</th>${seasons.map((s) => `<th class="num">${y(s)}</th>`).join('')}
      <th class="num">Total</th><th class="num live">${y(year)}<br><span class="muted">so far</span></th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.id === g.userClubId ? 'me' : ''}"><td class="num">${all.indexOf(r) + 1}.</td>
        <td class="coef-name">${flag(g.nations[g.clubs[r.id].nationId].flag, 16)} ${clubLink(g, r.id, { crest: 18 })}</td>
        ${seasons.map((s) => `<td class="num">${pts(co.club[r.id]?.[s])}</td>`).join('')}
        <td class="num"><b>${f1(r.total)}</b>${r.total > r.own + 1e-9 ? '*' : ''}</td><td class="num live">${pts(live.clubPts[r.id])}</td></tr>`).join('')}</tbody></table>`;
  }

  function draw() {
    root.innerHTML = `${clubTopbar(ctx, { title: 'Coefficients' })}
    <div class="panel" style="left:20px;top:92px;width:1240px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${st.tab === 'countries' ? 'Country ranking' : 'Club ranking'}</h2>
        <div class="seg"><button class="${st.tab === 'countries' ? 'on' : ''}" data-action="tab" data-v="countries">Countries</button>
          <button class="${st.tab === 'clubs' ? 'on' : ''}" data-action="tab" data-v="clubs">Clubs</button></div></div>
      <div class="scroll" style="flex:1">${st.tab === 'countries' ? countries() : clubs()}</div>
      <p class="hint" style="margin:8px 0 0">${st.tab === 'countries'
        ? 'The total of the last five seasons sets each country\'s places this season. <b>So far</b> and <b>Next season</b> add this season\'s European results as they come in.'
        : 'Points: 2 a win, 1 a draw, a bonus for the league phase and each knockout round. * a club\'s coefficient is at least 20% of its country\'s. Club coefficients seed the league-phase draw.'}</p>
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
