// Youth academy and B-team cooperation: promote or release academy players,
// pick a partner club and send young players there for match practice.

import { promoteYouth, releasePlayer, ACADEMY_MAX_AGE, YOUTH_FOCUS, youthPlanOf, setYouthPlan, youthEffortCost } from '../../core/development.js';
import { partnerCandidates, partnerOf, setPartner, loanToPartner, loanedOutBy } from '../../core/loans.js';
import { openWindow } from '../../core/transfers.js';
import { ageOf } from '../../core/valuation.js';
import { potText, potEstimate } from '../../core/scouting.js';
import { formArrow } from '../components/pitch.js';
import { crest, flag, jersey } from '../components/svg.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, bindActions, fullName, fmtMoneyShort } from '../util.js';

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  const year = g.season.year;

  function draw() {
    const partner = partnerOf(g);
    const windowOpen = !!openWindow(g);
    const ps = (club.youth || []).map((id) => g.players[id]).sort((a, b) => potEstimate(g, b) - potEstimate(g, a));
    const away = loanedOutBy(g, club.id);
    const firstTeamYoung = club.squad.map((id) => g.players[id]).filter((p) => ageOf(p, year) <= 21 && !p.loan)
      .sort((a, b) => potEstimate(g, b) - potEstimate(g, a));
    const dev = (p) => (p.skill - p.seasonStart > 0 ? `<span class="good">+${p.skill - p.seasonStart}</span>` : '0');
    const row = (p) => {
      const age = ageOf(p, year);
      const last = age >= ACADEMY_MAX_AGE;
      return `<tr><td>${jersey({ colors: club.colors, number: '', gk: p.pos === 'G', size: 26 })}</td>
        <td><b>${esc(fullName(p))}</b>${last ? ' <span class="badge sus" title="Must be promoted this season or he leaves">LAST YEAR</span>' : ''}</td>
        <td class="c">${p.pos}</td><td class="num">${age}</td><td class="phone-hide">${flag(g.nations[p.nationId].flag, 20)}</td>
        <td class="num">${p.skill}</td><td class="num"><b>${potText(g, p)}</b></td><td class="c phone-hide">${formArrow(p.form)}</td><td class="num">${dev(p)}</td>
        <td class="num academy-actions"><button class="btn btn-small" data-action="promote" data-id="${p.id}">Promote</button>
          ${partner ? `<button class="btn btn-small btn-blue" data-action="tob" data-id="${p.id}" ${windowOpen ? '' : 'disabled'} title="Loan to ${esc(partner.name)} until the end of the season">B-team</button>` : ''}
          <button class="btn btn-small btn-blue" data-action="release" data-id="${p.id}">Release</button></td></tr>`;
    };
    const cands = partnerCandidates(g);
    const plan = youthPlanOf(club);

    root.innerHTML = `${clubTopbar(ctx, { title: 'Youth academy' })}
    <div class="panel" style="left:20px;top:92px;width:760px;height:430px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Academy (${ps.length})</h2><span class="muted" style="font-size:12.5px">New players arrive every summer. Promote them by age ${ACADEMY_MAX_AGE}, or they leave.</span></div>
      <div class="scroll" style="flex:1"><table class="data">
        <thead><tr><th></th><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th class="phone-hide">Nat</th><th class="num">Skill</th><th class="num">Pot</th><th class="c phone-hide">Form</th><th class="num">+Season</th><th></th></tr></thead>
        <tbody>${ps.map(row).join('') || '<tr><td colspan="10" class="empty">The academy is empty. New players arrive at the start of next season.</td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="panel" style="left:20px;top:534px;width:760px;height:98px">
      <div class="panel-head"><h2>Youth recruitment</h2><span class="muted" style="font-size:12.5px">For next summer's intake</span></div>
      <div class="row" style="gap:8px">
        <select class="field" data-plan="focus" style="flex:1;min-width:0;height:32px">${Object.entries(YOUTH_FOCUS).map(([k, l]) => `<option value="${k}" ${plan.focus === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select class="field" data-plan="region" style="flex:1;min-width:0;height:32px" title="Abroad: half the youngsters from other countries, with more gems and more misses">
          <option value="home" ${plan.region === 'home' ? 'selected' : ''}>Scout at home</option>
          <option value="abroad" ${plan.region === 'abroad' ? 'selected' : ''}>Home and abroad</option></select>
        <select class="field" data-plan="effort" style="flex:1;min-width:0;height:32px" title="Extra effort: one more youngster a year, slightly better on average">
          <option value="normal" ${plan.effort === 'normal' ? 'selected' : ''}>Normal effort</option>
          <option value="extra" ${plan.effort === 'extra' ? 'selected' : ''}>Extra effort (${fmtMoneyShort(youthEffortCost(g, club))}/yr)</option></select>
      </div>
    </div>
    <div class="panel" style="left:796px;top:92px;width:464px;height:300px;display:flex;flex-direction:column">
      <h2>B-team partner</h2>
      <div class="row" style="gap:8px">
        ${partner ? crest(partner.crest, 32) : ''}
        <select class="field" id="partner" style="flex:1;height:32px">
          <option value="">No partner club</option>
          ${cands.map((c) => `<option value="${c.id}" ${partner && partner.id === c.id ? 'selected' : ''}>${esc(c.name)} (${esc(g.competitions[c.compId].name)})</option>`).join('')}
        </select>
      </div>
      <p class="hint" style="margin:6px 0">Loans to the partner are free, they pay the wages and they play your youngsters regularly. Loans run until the end of the season and can be agreed during transfer windows${windowOpen ? '' : ' (closed now)'}.</p>
      <div class="scroll" style="flex:1"><table class="data compact">${away.map((p) => `<tr><td><b>${esc(fullName(p))}</b>${p.loan.academy ? ' <span class="muted">(academy)</span>' : ''}</td>
        <td>${crest(g.clubs[p.clubId].crest, 16)} ${esc(g.clubs[p.clubId].short)}</td><td class="num">${p.stats.season.apps} apps</td><td class="num">${p.skill} (${dev(p)})</td></tr>`).join('')
        || '<tr><td class="empty">No players out on loan.</td></tr>'}</table></div>
    </div>
    <div class="panel" style="left:796px;top:404px;width:464px;height:228px;display:flex;flex-direction:column">
      <h2>Young first-team players</h2>
      <div class="scroll" style="flex:1"><table class="data compact">
        <tbody>${firstTeamYoung.map((p) => `<tr><td class="num">${p.number}</td><td><b>${esc(fullName(p))}</b></td><td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td>
          <td class="num">${p.skill}/${potText(g, p)}</td><td class="num">${p.stats.season.apps} apps</td><td class="num">${dev(p)}</td></tr>`).join('') || '<tr><td class="empty">None</td></tr>'}</tbody>
      </table></div>
    </div>
    <button class="btn" style="position:absolute;left:820px;top:648px;width:210px" data-action="u19">U-19 league</button>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

    for (const sel of root.querySelectorAll('[data-plan]')) {
      sel.addEventListener('change', () => {
        setYouthPlan(club, { [sel.dataset.plan]: sel.value });
        ctx.toast('Youth recruitment plan updated');
      });
    }
    root.querySelector('#partner').addEventListener('change', (e) => {
      setPartner(g, e.target.value || null);
      ctx.toast(e.target.value ? `B-team cooperation with ${g.clubs[e.target.value].name}` : 'No partner club');
      draw();
    });
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    promote: (el) => {
      const p = g.players[el.dataset.id];
      promoteYouth(g, club, el.dataset.id);
      ctx.toast(`${p.first} ${p.last} promoted to the first team (#${p.number})`);
      draw();
    },
    tob: (el) => { ctx.toast(loanToPartner(g, el.dataset.id).message); draw(); },
    u19: () => ctx.go('u19'),
    release: async (el) => {
      const p = g.players[el.dataset.id];
      if (!(await ctx.confirm(`Release ${p.first} ${p.last} from the academy? He will leave the club.`, { ok: 'Release' }))) return;
      releasePlayer(g, club, el.dataset.id);
      draw();
    },
    back: () => { ctx.save({ silent: true }); ctx.back(); },
  });
  draw();
}
