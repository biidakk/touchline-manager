// New career: a fresh world (random seed, players and fixtures differ every
// career), then pick a club.

import { generateWorld, startCareer, boardExpectation } from '../../core/worldgen.js';
import { lineupQuality } from '../../core/ratings.js';
import { startAcademy } from '../../core/development.js';
import { applyRealPack } from '../../core/realpack.js';
import { pickFile } from '../storage.js';
import { crest, jersey, flag } from '../components/svg.js';
import { esc, fmtMoney, fmt1, bindActions } from '../util.js';

const randomSeed = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function stars(rep) {
  const n = Math.max(1, Math.min(5, Math.round((rep - 20) / 14)));
  return '★'.repeat(n) + '<span class="dim">' + '★'.repeat(5 - n) + '</span>';
}

export function render(root, ctx) {
  const st = { manager: 'Manager', seed: randomSeed(), world: null, nationId: 'ENG', tier: 1, clubId: null, real: !!ctx.realPack, realInfo: null };

  function generate() {
    st.world = generateWorld({ seed: st.seed, managerName: st.manager });
    st.realInfo = st.real && ctx.realPack ? applyRealPack(st.world, ctx.realPack) : null;
    ctx.applyNames(st.world);
    if (!st.world.nations[st.nationId]) st.nationId = Object.values(st.world.nations).find((n) => n.leagueIds.length).id;
    const comp = st.world.competitions[`${st.nationId}-L${st.tier}`];
    st.clubId = comp.clubIds[comp.clubIds.length - 1];
  }

  function draw() {
    const g = st.world;
    const comp = g.competitions[`${st.nationId}-L${st.tier}`];
    const clubs = comp.clubIds.map((id) => g.clubs[id]).sort((a, b) => b.reputation - a.reputation);
    const sel = g.clubs[st.clubId];
    const leagueNations = Object.values(g.nations).filter((n) => n.leagueIds.length);

    root.innerHTML = `
    <div class="topbar"><div class="title">New career</div><div class="spacer"></div>
      <button class="top-action" data-action="back">Back</button></div>

    <div class="panel" style="left:24px;top:92px;width:290px;height:604px">
      <label class="lbl">Manager name</label>
      <input class="field" id="mgr" style="width:100%" maxlength="28" value="${esc(st.manager)}">
      <h2 style="margin-top:22px">Country</h2>
      <ul class="menu-list">
        ${leagueNations.map((n) => `<li data-action="nation" data-id="${n.id}" style="${n.id === st.nationId ? 'background:var(--row-me)' : ''}">
          ${flag(n.flag, 26)} ${esc(n.name)}</li>`).join('')}
      </ul>
      <h2 style="margin-top:22px">Division</h2>
      <div class="seg">
        ${g.nations[st.nationId].leagueIds.map((id) => {
          const c = g.competitions[id];
          return `<button class="${c.tier === st.tier ? 'on' : ''}" data-action="tier" data-tier="${c.tier}">${esc(c.name)}</button>`;
        }).join('')}
      </div>
      <h2 style="margin-top:22px">Real teams</h2>
      ${ctx.realPack ? `<label class="row" style="font-size:14px"><input type="checkbox" id="real" ${st.real ? 'checked' : ''}> Real clubs and players</label>
        <div class="muted" style="font-size:12.5px;margin-top:4px">${st.realInfo ? `${st.realInfo.players.toLocaleString('en-US')} players, ${st.realInfo.clubs} clubs` : 'File loaded'}${ctx.realPack.season ? ` (${esc(ctx.realPack.season)})` : ''}</div>
        <div class="row" style="margin-top:6px"><button class="btn btn-small btn-blue" data-action="loadpack">Load file</button><button class="btn btn-small btn-blue" data-action="code">Code</button>${ctx.realPackSource === 'browser' ? '<button class="btn btn-small btn-blue" data-action="droppack">Remove</button>' : ''}</div>`
        : `<div class="muted" style="font-size:12.5px">Fictional players. Load a real-teams file, or enter the code you were given, to play with real clubs and players.</div>
        <div class="row" style="margin-top:6px"><button class="btn btn-small btn-blue" data-action="loadpack">Load file</button><button class="btn btn-small btn-blue" data-action="code">Enter code</button></div>`}
    </div>

    <div class="panel" style="left:330px;top:92px;width:600px;height:604px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>${esc(comp.name)}</h2><span class="muted">${clubs.length} clubs</span></div>
      <div class="scroll" style="flex:1">
        <table class="data">
          <thead><tr><th></th><th>Club</th><th>Reputation</th><th class="num">Quality</th><th class="num">Stadium</th><th class="num">Budget</th></tr></thead>
          <tbody>${clubs.map((c) => `<tr class="click ${c.id === st.clubId ? 'sel' : ''}" data-action="club" data-id="${c.id}">
            <td>${crest(c.crest, 26)}</td><td><b>${esc(c.name)}</b></td><td style="color:var(--gold)">${stars(c.reputation)}</td>
            <td class="num">${fmt1(lineupQuality(g, c))}</td><td class="num">${c.stadium.capacity.toLocaleString('en-US')}</td>
            <td class="num">${fmtMoney(c.budget)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>

    <div class="panel" style="left:946px;top:92px;width:310px;height:530px;text-align:center">
      <div class="row" style="justify-content:center;gap:18px;margin-top:6px">${crest(sel.crest, 110)}${jersey({ colors: sel.colors, number: 10, size: 84 })}</div>
      <h2 style="margin:14px 0 4px;font-size:21px">${esc(sel.name)}</h2>
      <div class="muted row" style="justify-content:center">${flag(g.nations[sel.nationId].flag, 18)} ${esc(comp.name)}</div>
      <div class="kv" style="text-align:left;margin-top:18px;grid-template-columns:110px 1fr">
        <span>Stadium:</span><b>${esc(sel.stadium.name)}</b>
        <span>Capacity:</span><b>${sel.stadium.capacity.toLocaleString('en-US')}</b>
        <span>Budget:</span><b>${fmtMoney(sel.budget)}</b>
        <span>Quality:</span><b>${fmt1(lineupQuality(g, sel))}</b>
        <span>Reputation:</span><b style="color:var(--gold)">${stars(sel.reputation)}</b>
        <span>Replacing:</span><b>${esc(sel.manager?.name || '-')}</b>
      </div>
      <div style="margin-top:18px;text-align:left"><label class="lbl">Board expectation</label><b>${esc(boardExpectation(g, sel))}</b></div>
    </div>
    <button class="btn" style="position:absolute;left:946px;top:640px;width:310px;height:56px;font-size:20px" data-action="start">Start career</button>`;

    root.querySelector('#mgr').addEventListener('input', (e) => { st.manager = e.target.value; });
    root.querySelector('#real')?.addEventListener('change', (e) => { st.real = e.target.checked; regenerate(); });
  }

  bindActions(root, {
    back: () => ctx.back(),
    nation: (el) => {
      st.nationId = el.dataset.id;
      st.tier = 1;
      st.clubId = st.world.competitions[`${st.nationId}-L1`].clubIds.at(-1);
      draw();
    },
    tier: (el) => {
      st.tier = Number(el.dataset.tier);
      st.clubId = st.world.competitions[`${st.nationId}-L${st.tier}`].clubIds.at(-1);
      draw();
    },
    club: (el) => { st.clubId = el.dataset.id; draw(); },
    loadpack: async () => {
      const text = await pickFile();
      if (!text) return;
      try {
        await ctx.storeRealPack(text);
        st.real = true;
        regenerate();
        ctx.toast(`Real teams loaded: ${st.realInfo.players.toLocaleString('en-US')} players`);
      } catch (e) {
        await ctx.confirm(`That file could not be used: ${e.message}`, { cancel: null });
      }
    },
    code: async () => {
      const code = await ctx.prompt('Enter the real-teams code (for example ABCDE-12345):', '', { ok: 'Unlock' });
      if (!code || !code.trim()) return;
      try {
        await ctx.unlockRealPack(code);
        st.real = true;
        regenerate();
        ctx.toast(`Real teams unlocked: ${st.realInfo.players.toLocaleString('en-US')} players`);
      } catch (e) {
        await ctx.confirm(`Could not unlock the real teams: ${e.message}`, { cancel: null });
      }
    },
    droppack: async () => {
      if (!(await ctx.confirm('Remove the real-teams file from this browser? New careers will use fictional players again (careers you already play keep theirs).', { ok: 'Remove' }))) return;
      await ctx.forgetRealPack();
      st.real = !!ctx.realPack;
      regenerate();
    },
    start: async () => {
      const name = st.manager.trim() || 'Manager';
      ctx.game = startCareer(st.world, st.clubId, name);
      startAcademy(ctx.game);
      await ctx.save({ silent: true });
      ctx.home('hub');
      ctx.toast(`Welcome to ${ctx.game.clubs[st.clubId].name}!`);
    },
  });

  // A new world with the same seed (the club choice is kept where it exists).
  function regenerate() {
    const base = st.world.clubs[st.clubId]?.baseName;
    generate();
    const same = Object.values(st.world.clubs).find((c) => c.baseName === base);
    if (same) st.clubId = same.id;
    draw();
  }

  generate();
  draw();
}
