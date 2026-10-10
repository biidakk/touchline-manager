// "Other Teams": browse any club in the world, its info and squad.

import { sortedTable } from '../../core/season.js';
import { lineupQuality, squadSummary } from '../../core/ratings.js';
import { ageOf } from '../../core/valuation.js';
import { potText, attrText } from '../../core/scouting.js';
import { crest, flag, jersey, icon } from '../components/svg.js';
import { formArrow, skillMark } from '../components/pitch.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { showPlayer } from '../components/playercard.js';
import { esc, fmtMoneyShort, bindActions, fullName } from '../util.js';
import { setClubName } from '../../core/renames.js';
import { recordsHtml, clubSeasonsHtml } from '../components/records.js';
import { clubHistoryHtml, loadHistory } from '../components/clubhistory.js';

const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };

export function render(root, ctx, params = {}) {
  const g = ctx.game;
  const year = g.season.year;
  const start = params.clubId ? g.clubs[params.clubId] : g.clubs[g.userClubId];
  const st = { compId: start.compId, clubId: params.clubId || g.competitions[start.compId].clubIds.find((id) => id !== g.userClubId),
    tab: params.tab || 'squad' };

  function draw() {
    if (st.tab === 'history') loadHistory(g.clubs[st.clubId].nationId, () => { if (st.tab === 'history') draw(); });
    const comp = g.competitions[st.compId];
    const table = sortedTable(g, comp);
    const club = g.clubs[st.clubId];
    const nation = g.nations[club.nationId];
    const pos = table.findIndex((r) => r.clubId === club.id) + 1;
    const sum = squadSummary(g, club);
    const ps = club.squad.map((id) => g.players[id]).sort((a, b) => POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.skill - a.skill);
    const nations = Object.values(g.nations).filter((n) => n.leagueIds.length);
    const trophies = club.trophies || [];

    root.innerHTML = `${clubTopbar(ctx, { title: 'Other teams' })}
    <div class="panel" style="left:20px;top:92px;width:282px;height:600px;display:flex;flex-direction:column">
      <div class="row" style="gap:6px;flex-wrap:wrap">${nations.flatMap((n) => n.leagueIds).map((id) => {
        const c = g.competitions[id];
        return `<button class="btn btn-small ${id === st.compId ? '' : 'btn-blue'}" style="min-width:0;padding:0 8px" data-action="comp" data-id="${id}" title="${esc(c.name)}">${flag(g.nations[c.nationId].flag, 16)} ${c.tier}</button>`;
      }).join('')}</div>
      <h2 style="margin:12px 0 6px">${esc(comp.name)}</h2>
      <div class="scroll" style="flex:1"><table class="data">${table.map((r, i) => `<tr class="click ${r.clubId === st.clubId ? 'sel' : ''} ${r.clubId === g.userClubId ? 'me' : ''}" data-action="club" data-id="${r.clubId}">
        <td class="num" style="width:22px">${i + 1}.</td><td style="width:24px">${crest(g.clubs[r.clubId].crest, 20)}</td><td>${esc(g.clubs[r.clubId].name)}</td></tr>`).join('')}</table></div>
    </div>
    <div class="panel" style="left:318px;top:92px;width:942px;height:200px">
      <div class="row" style="gap:20px;align-items:flex-start">
        ${crest(club.crest, 110)}${jersey({ colors: club.colors, number: 10, size: 80 })}
        <div style="flex:1">
          <div class="row" style="gap:12px"><span style="font-size:26px;font-weight:900">${esc(club.name)}</span>
            <button class="linkbtn muted" style="font-size:13px" data-action="rename" title="Rename this club (your copy only)">Rename</button></div>
          <div class="row muted">${flag(nation.flag, 18)} ${esc(nation.name)} · ${esc(comp.name)} · ${pos}. place · Manager: ${esc(club.id === g.userClubId ? g.manager.name : club.manager?.name || 'caretaker')}</div>
          <div class="row" style="gap:28px;margin-top:12px;align-items:flex-start">
            <div class="fin-list" style="width:260px"><span>Stadium</span><b>${esc(club.stadium.name)}</b><span>Capacity</span><b>${club.stadium.capacity.toLocaleString('en-US')}</b>
              <span>Reputation</span><b>${club.reputation}</b><span>Money</span><b>${fmtMoneyShort(club.budget)}</b></div>
            <div class="fin-list" style="width:250px"><span>Quality (XI)</span><b>${lineupQuality(g, club).toFixed(1)}</b><span>Squad value</span><b>${fmtMoneyShort(sum.value)}</b>
              <span>Average age</span><b>${sum.age.toFixed(1)}</b><span>Teamwork</span><b>${club.teamwork ?? 60}</b></div>
            <div style="flex:1"><b>${icon('trophy')} Honours</b><div class="muted" style="font-size:13px;margin-top:4px;white-space:normal">${trophies.length
              ? Object.entries(trophies.reduce((a, t) => ({ ...a, [t.name]: [...(a[t.name] || []), t.year] }), {}))
                .map(([n, ys]) => `${esc(n)} ×${ys.length}`).join('<br>') : 'None yet'}</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel" style="left:318px;top:304px;width:942px;height:330px;display:flex;flex-direction:column">
      <div class="panel-head" style="margin-bottom:6px"><h2>${{ squad: 'Squad', seasons: 'Season by season', records: 'Club records', history: 'Club history' }[st.tab]}</h2>
        <div class="seg">${[['squad', 'Squad'], ['history', 'History'], ['seasons', 'Seasons'], ['records', 'Records']].map(([k, l]) => `<button class="${st.tab === k ? 'on' : ''}" data-action="tab" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${st.tab === 'history' ? `<div class="scroll" style="flex:1">${clubHistoryHtml(g, club)}</div>`
        : st.tab === 'records' ? `<div class="scroll" style="flex:1">${recordsHtml(g, club)}</div>`
        : st.tab === 'seasons' ? `<div class="scroll" style="flex:1">${clubSeasonsHtml(g, club)}</div>`
        : `<div class="scroll" style="flex:1"><table class="data">
        <thead><tr><th class="num">No</th><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th>Nat</th><th class="num">Ht</th><th class="num">Skill</th><th class="num">Pot</th><th class="num">TEC</th><th class="num">PHY</th><th class="c">Form</th>
          <th class="num">Apps</th><th class="num">Goals</th><th class="num">Value</th><th class="num">Contract</th></tr></thead>
        <tbody>${ps.map((p) => `<tr class="click" data-action="player" data-id="${p.id}"><td class="num">${p.number}</td>
          <td><b>${esc(fullName(p))}</b>${p.listed ? ' <span class="badge list">$</span>' : ''}${p.injuryDays > 0 ? ' <span class="badge inj">+</span>' : ''}</td>
          <td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td><td>${flag(g.nations[p.nationId].flag, 18)}</td>
          <td class="num">${p.height}</td><td class="num">${skillMark(p)}</td><td class="num">${potText(g, p)}</td>
          <td class="num">${attrText(g, p, 'tec')}</td><td class="num">${attrText(g, p, 'phy')}</td><td class="c">${formArrow(p.form)}</td>
          <td class="num">${p.stats.season.apps}</td><td class="num">${p.stats.season.goals}</td><td class="num">${fmtMoneyShort(p.value)}</td>
          <td class="num">${p.contractEnd}</td></tr>`).join('')}</tbody>
      </table></div>`}
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    comp: (el) => {
      st.compId = el.dataset.id;
      st.clubId = g.competitions[st.compId].clubIds.find((id) => id !== g.userClubId) || g.competitions[st.compId].clubIds[0];
      draw();
    },
    club: (el) => { st.clubId = el.dataset.id; draw(); },
    tab: (el) => { st.tab = el.dataset.v; draw(); },
    player: (el) => showPlayer(ctx, el.dataset.id),
    rename: async () => {
      const club = g.clubs[st.clubId];
      const name = await ctx.prompt('Club name:', club.name, { ok: 'Next' });
      if (name === null || !name.trim()) return;
      const short = await ctx.prompt('Short name (tables, tickers):', club.short, { ok: 'Rename' });
      setClubName(g, club, name.trim(), short?.trim() || null);
      ctx.toast('Club renamed. For a permanent name in every new world, add it to names.json.');
      draw();
    },
    back: () => ctx.back(),
  });
  draw();
}
