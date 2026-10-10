// Managing a national team: pick the squad for the international breaks,
// the formation and tactics. Matches are played from the calendar like club
// matches (pre-match tactics, live view or instant result).

import { FORMATION_NAMES, PLAY_STYLES, PLAY_STYLE_LABELS } from '../../core/data.js';
import { nationalCandidates, suggestSquad, refreshUserSquad, nationalTable, NAT_IDS } from '../../core/national.js';
import { managedTeam, resignNational } from '../../core/nationaljob.js';
import { autoLineup, isAvailable } from '../../core/ai.js';
import { ageOf } from '../../core/valuation.js';
import { fmtDate } from '../../core/calendar.js';
import { crest, flag } from '../components/svg.js';
import { formArrow, battery } from '../components/pitch.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { showPlayer } from '../components/playercard.js';
import { esc, bindActions, fullName } from '../util.js';

const MAX = 23;

export function render(root, ctx) {
  const g = ctx.game;
  const st = { pos: 'all' };

  function draw() {
    const team = managedTeam(g);
    if (!team) { ctx.back(); return; }
    team.picks = team.picks || [];
    const n = g.manager.national;
    const year = g.season.year;
    const nation = g.nations[team.nationId];
    const picks = new Set(team.picks);
    const called = new Set(team.squad);
    // Picks first (by position), then everyone else by skill.
    const all = nationalCandidates(g, team).sort((a, b) => picks.has(b.id) - picks.has(a.id)
      || (picks.has(a.id) ? 'GDMF'.indexOf(a.pos) - 'GDMF'.indexOf(b.pos) : 0) || b.skill - a.skill);
    const list = all.filter((p) => st.pos === 'all' || p.pos === st.pos);
    const count = (pos) => team.picks.filter((id) => g.players[id]?.pos === pos).length;
    const comp = g.competitions[NAT_IDS[team.level]];
    const pos = comp.table[team.id]?.p ? nationalTable(g, comp).findIndex((r) => r.clubId === team.id) + 1 : 0;
    const next = comp.fixtureIds.map((id) => g.fixtures[id]).filter((f) => !f.result && (f.homeId === team.id || f.awayId === team.id))
      .sort((a, b) => a.day - b.day)[0];
    const opp = next ? g.national.teams[next.homeId === team.id ? next.awayId : next.homeId] : null;
    const caps = (p) => (p.intl ? (team.level === 'senior' ? p.intl.caps : p.intl.u21Caps) : 0);
    const status = (p) => (p.injuryDays > 0 ? `<span class="bad">Injured (${p.injuryDays}d)</span>` : p.suspension > 0 ? '<span class="bad">Suspended</span>' : '');

    root.innerHTML = `${clubTopbar(ctx, { title: `National team: ${team.name}` })}
    <div class="panel" style="left:20px;top:92px;width:780px;height:600px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Squad selection <span class="${team.picks.length > MAX ? 'bad' : 'muted'}" style="font-size:15px">${team.picks.length}/${MAX} picked
        · G ${count('G')} D ${count('D')} M ${count('M')} F ${count('F')}</span></h2>
        <div class="row" style="gap:6px"><button class="btn btn-small btn-blue" data-action="auto">Auto pick</button><button class="btn btn-small btn-blue" data-action="clear">Clear</button></div></div>
      <div class="row" style="justify-content:space-between;margin-bottom:6px">
        <div class="seg">${[['all', 'All'], ['G', 'GK'], ['D', 'DEF'], ['M', 'MID'], ['F', 'FWD']].map(([k, l]) => `<button class="${st.pos === k ? 'on' : ''}" data-action="pos" data-v="${k}">${l}</button>`).join('')}</div>
        <span class="muted" style="font-size:12.5px">${all.length} eligible players · ✓ = picked · <b>C</b> = in the current squad</span></div>
      <div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th class="c">Pick</th><th class="c">Pos</th><th>Player</th><th class="num">Age</th><th>Club</th><th class="num">Skill</th><th class="c">Form</th><th class="c">Energy</th><th class="num">Caps</th><th></th></tr></thead>
        <tbody>${list.map((p) => `<tr class="${picks.has(p.id) ? 'me' : ''} ${isAvailable(p) ? '' : 'dim'}">
          <td class="c"><button class="pickbox ${picks.has(p.id) ? 'on' : ''}" data-action="pick" data-id="${p.id}" title="Pick / unpick">${picks.has(p.id) ? '✓' : ''}</button></td>
          <td class="c">${p.pos}</td><td class="click" data-action="player" data-id="${p.id}"><b>${esc(fullName(p))}</b>${called.has(p.id) ? ' <span class="badge C" title="In the current squad">C</span>' : ''}</td>
          <td class="num">${ageOf(p, year)}</td><td>${g.clubs[p.clubId] ? `${crest(g.clubs[p.clubId].crest, 16)} ${esc(g.clubs[p.clubId].short)}` : ''}</td>
          <td class="num"><b>${p.skill}</b></td><td class="c">${formArrow(p.form)}</td><td class="c">${battery(p.energy)}</td>
          <td class="num">${caps(p)}</td><td>${status(p)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="hint" style="margin:6px 0 0">Your picks are called up for every international break. Places you leave open, and injured or suspended picks, are filled with the best available players. During a break, changes apply straight away.</p>
    </div>
    <div class="panel" style="left:816px;top:92px;width:444px;height:540px;display:flex;flex-direction:column;gap:10px">
      <div class="row" style="gap:12px">${flag(nation.flag, 44)}<div><div style="font-size:20px;font-weight:900">${esc(team.name)}</div>
        <div class="muted">${esc(comp.name)}${pos ? ` · ${pos}. place` : ''}</div></div></div>
      <div class="fin-list">
        <span>Head coach since</span><b>${n.from}/${String(n.from + 1).slice(2)}</b>
        <span>Matches</span><b>${n.p} (W ${n.w} · D ${n.d} · L ${n.l})</b>
        <span>Next match</span><b>${next ? `${fmtDate(next.day)} vs ${esc(opp.name)} (${next.homeId === team.id ? 'H' : 'A'})` : 'None this season'}</b>
      </div>
      <h2 style="margin:6px 0 0;font-size:15px">Formation</h2>
      <div class="seg full">${FORMATION_NAMES.map((f) => `<button class="${team.tactics.formation === f ? 'on' : ''}" data-action="formation" data-v="${f}">${f}</button>`).join('')}</div>
      <h2 style="margin:6px 0 0;font-size:15px">Attacking intent</h2>
      <div class="seg full">${Array.from({ length: 11 }, (_, k) => k * 10).map((v) => `<button class="${team.tactics.intent === v ? 'on' : ''}" data-action="intent" data-v="${v}">${v}</button>`).join('')}</div>
      <h2 style="margin:6px 0 0;font-size:15px">Play style</h2>
      <div class="seg full">${PLAY_STYLES.map((s) => `<button class="${team.tactics.style === s ? 'on' : ''}" data-action="style" data-v="${s}">${PLAY_STYLE_LABELS[s]}</button>`).join('')}</div>
      <p class="hint" style="margin-top:auto">The starting XI is picked from the squad for your formation; you can still swap players on the pre-match screen. Finish last in the ${esc(comp.name)} and the federation lets you go; win it and your reputation grows.</p>
      <button class="btn btn-small btn-blue" style="align-self:flex-start" data-action="resign">Step down</button>
    </div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;
  }

  const changed = () => { refreshUserSquad(g); draw(); };
  bindTopbar(root, ctx);
  bindActions(root, {
    pos: (el) => { st.pos = el.dataset.v; draw(); },
    pick: (el) => {
      const team = managedTeam(g);
      const id = el.dataset.id;
      if (team.picks.includes(id)) team.picks = team.picks.filter((x) => x !== id);
      else if (team.picks.length >= MAX) { ctx.toast(`The squad is full (${MAX}). Unpick someone first.`); return; }
      else team.picks.push(id);
      changed();
    },
    auto: () => { managedTeam(g).picks = suggestSquad(g, managedTeam(g)); changed(); },
    clear: () => { managedTeam(g).picks = []; changed(); },
    player: (el) => showPlayer(ctx, el.dataset.id),
    formation: (el) => {
      const team = managedTeam(g);
      team.tactics.formation = el.dataset.v;
      if (team.squad.length) team.lineup = autoLineup(g, team, el.dataset.v);
      draw();
    },
    intent: (el) => { managedTeam(g).tactics.intent = Number(el.dataset.v); draw(); },
    style: (el) => { managedTeam(g).tactics.style = el.dataset.v; draw(); },
    resign: async () => {
      if (!(await ctx.confirm(`Step down as head coach of ${managedTeam(g).name}?`, { ok: 'Step down', cancel: 'Stay' }))) return;
      const r = resignNational(g);
      ctx.toast(r.message);
      if (r.ok) ctx.home('hub');
    },
    back: () => ctx.back(),
  });
  draw();
}
