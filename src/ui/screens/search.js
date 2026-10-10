// Search: find any player or club in the world by name.

import { ageOf } from '../../core/valuation.js';
import { potText, attrText } from '../../core/scouting.js';
import { crest, flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName, fmtMoneyShort } from '../util.js';
import { clubLink, playerLink, linkClubsInText } from '../components/links.js';

export function render(root, ctx) {
  const g = ctx.game;
  const st = ctx.searchState || (ctx.searchState = { q: '' });
  const year = g.season.year;

  function results() {
    const q = st.q.trim().toLowerCase();
    if (q.length < 2) return { players: [], clubs: [] };
    const players = Object.values(g.players)
      .filter((p) => p.clubId && `${p.first} ${p.last}`.toLowerCase().includes(q))
      .sort((a, b) => b.skill - a.skill).slice(0, 100);
    const clubs = Object.values(g.clubs).filter((c) => c.name.toLowerCase().includes(q)).slice(0, 30);
    return { players, clubs };
  }

  function drawResults() {
    const { players, clubs } = results();
    const box = root.querySelector('#results');
    if (st.q.trim().length < 2) {
      box.innerHTML = '<div class="empty">Type at least two letters of a player or club name.</div>';
      return;
    }
    box.innerHTML = `
      ${clubs.length ? `<h2>Clubs</h2><table class="data" style="margin-bottom:14px">${clubs.map((c) => `<tr class="click" data-action="club" data-id="${c.id}">
        <td style="width:26px">${clubLink(g, c.id, { crest: 22, text: '' })}</td><td><b>${clubLink(g, c.id)}</b></td><td>${flag(g.nations[c.nationId].flag, 18)} ${esc(g.competitions[c.compId].name)}</td>
        <td class="num">${c.stadium.capacity.toLocaleString('en-US')} seats</td></tr>`).join('')}</table>` : ''}
      <h2>Players${players.length === 100 ? ' (first 100)' : ''}</h2>
      <table class="data">${players.map((p) => {
        const c = g.clubs[p.clubId];
        return `<tr class="click ${p.clubId === g.userClubId ? 'me' : ''}" data-action="player" data-id="${p.id}">
          <td><b>${esc(fullName(p))}</b></td><td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td><td>${flag(g.nations[p.nationId].flag, 18)}</td>
          <td>${clubLink(g, c.id, { crest: 18 })}</td><td class="num">${p.skill}/${potText(g, p)}</td>
          <td class="num muted" title="Technical · physical">${attrText(g, p, 'tec')} · ${attrText(g, p, 'phy')}</td><td class="num">${p.height} cm</td><td class="num">${fmtMoneyShort(p.value)}</td></tr>`;
      }).join('') || '<tr><td class="empty">No players found.</td></tr>'}</table>`;
  }

  root.innerHTML = `${clubTopbar(ctx, { title: 'Search' })}
  <div class="panel" style="left:20px;top:92px;width:1240px;height:540px;display:flex;flex-direction:column">
    <input class="field" id="q" placeholder="Player or club name" value="${esc(st.q)}" style="width:420px;margin-bottom:12px">
    <div class="scroll" id="results" style="flex:1"></div>
  </div>
  <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

  const input = root.querySelector('#q');
  input.addEventListener('input', () => { st.q = input.value; drawResults(); });
  input.focus();
  drawResults();

  bindTopbar(root, ctx);
  bindActions(root, {
    player: (el) => showPlayer(ctx, el.dataset.id),
    club: (el) => ctx.go('otherteams', { clubId: el.dataset.id }),
    back: () => { ctx.searchState = null; ctx.back(); },
  });
}
