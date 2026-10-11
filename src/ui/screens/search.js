// Search: find any player or club in the world by name, or browse players
// with filters (position, age, skill, country, league).

import { ageOf } from '../../core/valuation.js';
import { potText, attrText } from '../../core/scouting.js';
import { flag } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName, fmtMoneyShort } from '../util.js';
import { clubLink } from '../components/links.js';

const AGES = [['', 'Any age'], ['u21', '21 or under'], ['22-29', '22-29'], ['30+', '30+']];
const SKILLS = [['', 'Any skill'], ['50', '50+'], ['60', '60+'], ['70', '70+'], ['80', '80+']];
const LIMIT = 100;

export function render(root, ctx) {
  const g = ctx.game;
  const st = ctx.searchState || (ctx.searchState = { q: '', pos: '', age: '', skill: '', nation: '', comp: '' });
  const year = g.season.year;
  const filtered = () => !!(st.pos || st.age || st.skill || st.nation || st.comp);

  function results() {
    const q = st.q.trim().toLowerCase();
    const named = q.length >= 2;
    if (!named && !filtered()) return null;
    const ageOk = (a) => (st.age === 'u21' ? a <= 21 : st.age === '22-29' ? a >= 22 && a <= 29 : st.age === '30+' ? a >= 30 : true);
    const players = Object.values(g.players).filter((p) => {
      if (!p.clubId || !g.clubs[p.clubId]) return false;
      if (named && !`${p.first} ${p.last}`.toLowerCase().includes(q)) return false;
      if (st.pos && p.pos !== st.pos) return false;
      if (st.skill && p.skill < Number(st.skill)) return false;
      if (st.nation && p.nationId !== st.nation) return false;
      if (st.comp && g.clubs[p.clubId].compId !== st.comp) return false;
      return ageOk(ageOf(p, year));
    }).sort((a, b) => b.skill - a.skill);
    const clubs = named ? Object.values(g.clubs).filter((c) => c.name.toLowerCase().includes(q)
      && (!st.comp || c.compId === st.comp)).slice(0, 30) : [];
    return { players: players.slice(0, LIMIT), total: players.length, clubs };
  }

  function drawResults() {
    const r = results();
    const box = root.querySelector('#results');
    if (!r) {
      box.innerHTML = '<div class="empty">Type two letters of a name, or pick a filter above.</div>';
      return;
    }
    box.innerHTML = `
      ${r.clubs.length ? `<h2>Clubs</h2><table class="data" style="margin-bottom:14px">${r.clubs.map((c) => `<tr class="click" data-action="club" data-id="${c.id}">
        <td style="width:26px">${clubLink(g, c.id, { crest: 22, text: '' })}</td><td><b>${clubLink(g, c.id)}</b></td><td>${flag(g.nations[c.nationId].flag, 18)} ${esc(g.competitions[c.compId].name)}</td>
        <td class="num">${c.stadium.capacity.toLocaleString('en-US')} seats</td></tr>`).join('')}</table>` : ''}
      <h2>Players <span class="muted" style="font-size:14px">${r.total > LIMIT ? `best ${LIMIT} of ${r.total.toLocaleString('en-US')}` : r.total}</span></h2>
      <table class="data">
        <thead><tr><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th>Nat</th><th>Club</th><th class="num">Skill</th><th class="num phone-hide">TEC · PHY</th><th class="num phone-hide">Ht</th><th class="num">Value</th></tr></thead>
        <tbody>${r.players.map((p) => `<tr class="click ${p.clubId === g.userClubId ? 'me' : ''}" data-action="player" data-id="${p.id}">
          <td><b>${esc(fullName(p))}</b></td><td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td><td>${flag(g.nations[p.nationId].flag, 18)}</td>
          <td>${clubLink(g, p.clubId, { crest: 18, short: true })}</td><td class="num">${p.skill}/${potText(g, p, { short: true })}</td>
          <td class="num muted phone-hide" title="Technical · physical">${attrText(g, p, 'tec')} · ${attrText(g, p, 'phy')}</td><td class="num phone-hide">${p.height}</td><td class="num">${fmtMoneyShort(p.value)}</td></tr>`).join('')
          || '<tr><td colspan="9" class="empty">No players found.</td></tr>'}</tbody></table>`;
  }

  function drawFilters() {
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, label]) => `<button class="${st[key] === v ? 'on' : ''}" data-action="f" data-k="${key}" data-v="${v}">${label}</button>`).join('')}</div>`;
    const nations = Object.values(g.nations).filter((n) => n.leagueIds.length);
    const comps = nations.flatMap((n) => n.leagueIds.map((id) => g.competitions[id]));
    root.querySelector('#filters').innerHTML = `
      ${seg('pos', [['', 'All'], ['G', 'GK'], ['D', 'DEF'], ['M', 'MID'], ['F', 'FWD']])}
      ${seg('age', AGES)}
      ${seg('skill', SKILLS)}
      <select class="field" id="nation"><option value="">All nationalities</option>${Object.values(g.nations).sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => `<option value="${n.id}" ${st.nation === n.id ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}</select>
      <select class="field" id="comp"><option value="">All leagues</option>${comps.map((c) => `<option value="${c.id}" ${st.comp === c.id ? 'selected' : ''}>${esc(g.nations[c.nationId].name)}: ${esc(c.name)}</option>`).join('')}</select>
      ${filtered() ? '<button class="btn btn-small btn-blue" data-action="clear">Clear</button>' : ''}`;
    root.querySelector('#nation').addEventListener('change', (e) => { st.nation = e.target.value; refresh(); });
    root.querySelector('#comp').addEventListener('change', (e) => { st.comp = e.target.value; refresh(); });
  }

  function refresh() { drawFilters(); drawResults(); }

  root.innerHTML = `${clubTopbar(ctx, { title: 'Search' })}
  <div class="panel" style="left:20px;top:92px;width:1240px;height:540px;display:flex;flex-direction:column">
    <input class="field" id="q" placeholder="Player or club name" value="${esc(st.q)}" style="width:420px;margin-bottom:10px" enterkeyhint="search">
    <div class="search-filters" id="filters"></div>
    <div class="scroll" id="results" style="flex:1"></div>
  </div>
  <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

  const input = root.querySelector('#q');
  input.addEventListener('input', () => { st.q = input.value; drawResults(); });
  // Enter closes the phone keyboard so the results can be seen.
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  // On a phone the keyboard would cover the screen straight away: no autofocus there.
  if (!document.documentElement.classList.contains('phone')) input.focus();
  refresh();

  bindTopbar(root, ctx);
  bindActions(root, {
    f: (el) => { st[el.dataset.k] = el.dataset.v; refresh(); },
    clear: () => { Object.assign(st, { pos: '', age: '', skill: '', nation: '', comp: '' }); refresh(); },
    player: (el) => showPlayer(ctx, el.dataset.id),
    club: (el) => ctx.go('otherteams', { clubId: el.dataset.id }),
    back: () => { ctx.searchState = null; ctx.back(); },
  });
}
