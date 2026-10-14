// Training: coaching staff, group presets with per-player overrides,
// fatigue, workload and development progress.

import { ROLES, ROLE_LABEL, ROLE_INFO, FOCI, FOCUS_LABEL, INTENSITIES, INTENSITY_LABEL, hireCoach, fireCoach, severance, planFor,
  extendQuote, extendCoach,
  acwr, defaultTraining, starsFor, coachFactor, physioDays } from '../../core/training.js';
import { ageOf } from '../../core/valuation.js';
import { potText } from '../../core/scouting.js';
import { battery, skillMark } from '../components/pitch.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoney, fmtMoneyShort, bindActions, fullName } from '../util.js';

const VACANT = {
  fitness: 'Vacant: physical training much less effective', technical: 'Vacant: technical training much less effective',
  goalkeeping: 'Vacant: keeper training much less effective', physio: 'Vacant: injuries last 35% longer',
  youth: 'Vacant: weak academy and youth intake', assistant: 'Vacant: no advice, morale swings harder',
};
const GROUPS = [['all', 'Whole squad'], ['G', 'Goalkeepers'], ['D', 'Defenders'], ['M', 'Midfielders'], ['F', 'Forwards']];
const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };
const ROLE_SHORT = { fitness: 'Fitness', technical: 'Technical', goalkeeping: 'Keepers', physio: 'Physio', youth: 'Youth', assistant: 'Assistant' };
const SHORT_FOCUS = { balanced: 'Balanced', physical: 'Physical', technical: 'Technical', recovery: 'Recovery' };
const stars = (n) => (n ? `<span class="stars"><span style="color:var(--gold)">${'★'.repeat(n)}</span><span class="dim">${'★'.repeat(5 - n)}</span></span>` : '<span class="bad">vacant</span>');
const planText = (p) => `${SHORT_FOCUS[p.focus]}${p.focus === 'recovery' ? '' : ` · ${INTENSITY_LABEL[p.intensity]}`}`;

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  if (!club.training) club.training = defaultTraining();
  const year = g.season.year;
  const T = club.training;

  function planSelect(attr, current, inheritLabel) {
    const opts = [];
    if (inheritLabel) opts.push(`<option value="">${inheritLabel}</option>`);
    for (const f of FOCI) {
      if (f === 'recovery') { opts.push(`<option value="recovery|light" ${current && current.focus === 'recovery' ? 'selected' : ''}>Recovery</option>`); continue; }
      for (const i of INTENSITIES) {
        const sel = current && current.focus === f && current.intensity === i ? 'selected' : '';
        opts.push(`<option value="${f}|${i}" ${sel}>${FOCUS_LABEL[f]} · ${INTENSITY_LABEL[i]}</option>`);
      }
    }
    return `<select class="field plan" ${attr}>${opts.join('')}</select>`;
  }

  function draw() {
    const ps = [...club.squad, ...(club.youth || [])].map((id) => g.players[id]).filter(Boolean)
      .sort((a, b) => (club.youth || []).includes(a.id) - (club.youth || []).includes(b.id) || POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.skill - a.skill);
    const light = (p) => {
      const r = acwr(p);
      const c = r <= 1.3 ? 'good' : r <= 1.5 ? 'warn' : 'bad';
      return `<span class="${c} load-dot" title="Workload ratio (7-day vs 28-day): ${r.toFixed(2)}. Above 1.3 raises injury risk.">●</span>`;
    };
    const delta = (v) => (v > 0 ? `<span class="good">+${v}</span>` : v < 0 ? `<span class="bad">${v}</span>` : '<span class="dim">0</span>');

    root.innerHTML = `${clubTopbar(ctx, { title: 'Training' })}
    <div class="panel" style="left:20px;top:92px;width:440px;height:300px;padding-top:12px">
      <h2 style="margin-bottom:4px">Staff</h2>
      <table class="data compact staff">
        <colgroup><col><col style="width:78px"><col class="staff-wcol"><col class="staff-bcol"></colgroup>
        ${ROLES.map((r) => {
          const c = club.staff?.[r];
          return `<tr title="${esc(ROLE_INFO[r])}"><td><b class="phone-hide">${ROLE_LABEL[r]}</b><b class="phone-only">${ROLE_SHORT[r]}</b> <span class="muted phone-only staff-short">${c ? `${esc(c.name.split(' ').slice(-1)[0])} · <span class="${c.until <= year ? 'warn' : ''}">${c.until}</span>` : '<span class="bad">vacant</span>'}</span><div class="muted staff-name phone-hide">${c ? `${esc(c.name)} · <span class="${c.until <= year ? 'warn' : ''}">until ${c.until}</span>` : `<span class="bad">${VACANT[r]}</span>`}</div></td>
            <td>${stars(c?.stars || 0)}</td><td class="num phone-hide">${c ? fmtMoneyShort(c.wage) : ''}</td>
            <td class="num"><button class="btn btn-small ${c ? 'btn-blue' : ''} staff-btn" data-action="staff" data-role="${r}">${c ? 'Manage' : 'Hire'}</button></td></tr>`;
        }).join('')}</table>
    </div>
    <div class="panel" style="left:20px;top:404px;width:440px;height:288px;padding-top:12px">
      <h2 style="margin-bottom:4px">Training plan</h2>
      <table class="data compact plans">${GROUPS.map(([k, label]) => `<tr><td><b>${label}</b></td>
        <td>${planSelect(`data-group="${k}"`, T.groups[k], k === 'all' ? null : 'Same as whole squad')}</td></tr>`).join('')}</table>
      <label class="row" style="margin-top:8px;font-size:14px"><input type="checkbox" id="taper" ${T.taper ? 'checked' : ''}> Ease off the day before a match</label>
      <p class="hint phone-hide" style="margin-top:4px">Harder training: faster development, more fatigue and injury risk. Recovery: no development, fatigue fades fast.</p>
    </div>
    <div class="panel" style="left:476px;top:92px;width:784px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Players</h2><span class="muted phone-hide" style="font-size:12.5px">Season: this season's gains (technique / physique). Load: workload risk. "=" follows the group plan.</span></div>
      <div class="scroll" style="flex:1"><table class="data compact train-table">
        <thead><tr><th>Player</th><th class="c" style="width:44px">Pos</th><th class="num" style="width:46px">Age</th><th class="num" style="width:80px">Skill</th><th class="num phone-hide" style="width:46px">TEC</th><th class="num phone-hide" style="width:46px">PHY</th>
          <th class="c" style="width:66px">Season</th><th style="width:64px">Energy</th><th class="c" style="width:48px">Load</th><th class="plan-col">Plan</th></tr></thead>
        <tbody>${ps.map((p) => {
          const academy = (club.youth || []).includes(p.id);
          const eff = planFor(g, club, p);
          return `<tr class="${p.injuryDays > 0 ? 'unavail' : ''}"><td class="ellip"><b>${esc(fullName(p))}</b>${academy ? ' <span class="muted">(acad.)</span>' : ''}${p.injuryDays > 0 ? ` <span class="badge inj">+${p.injuryDays}d</span>` : ''}</td>
            <td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td><td class="num"><b>${skillMark(p)}</b>/${potText(g, p, { short: true })}</td>
            <td class="num phone-hide">${p.tec}</td><td class="num phone-hide">${p.phy}</td>
            <td class="c">${delta(p.tec - (p.tecStart ?? p.tec))} / ${delta(p.phy - (p.phyStart ?? p.phy))}</td>
            <td>${battery(p.energy)}</td><td class="c">${light(p)}</td>
            <td>${planSelect(`data-player="${p.id}"`, p.train, `= ${planText(eff)}`)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
    <div class="hint phone-hide" style="position:absolute;left:476px;top:640px;width:560px">Development now: technical ×${coachFactor(starsFor(g, club, 'technical')).toFixed(2)}, physical ×${coachFactor(starsFor(g, club, 'fitness')).toFixed(2)}, keepers ×${coachFactor(starsFor(g, club, 'goalkeeping')).toFixed(2)}, academy ×${coachFactor(starsFor(g, club, 'youth')).toFixed(2)}. Injury length ×${physioDays(g, club).toFixed(2)}.</div>
    <button class="btn btn-blue" style="position:absolute;left:1050px;top:648px;width:210px" data-action="back">Back</button>`;

    root.querySelectorAll('select.plan').forEach((el) => el.addEventListener('change', () => {
      const v = el.value ? { focus: el.value.split('|')[0], intensity: el.value.split('|')[1] } : null;
      if (el.dataset.group) T.groups[el.dataset.group] = el.dataset.group === 'all' ? v || { focus: 'balanced', intensity: 'normal' } : v;
      else g.players[el.dataset.player].train = v;
      draw();
    }));
    root.querySelector('#taper').addEventListener('change', (e) => { T.taper = e.target.checked; });
  }

  bindTopbar(root, ctx);
  bindActions(root, {
    // One button per role: extend the current coach's contract, replace him
    // or release him; for a vacant role, hire someone.
    staff: async (el) => {
      const role = el.dataset.role;
      const current = club.staff?.[role];
      const pool = (g.coachPool || []).filter((c) => c.role === role).sort((a, b) => b.stars - a.stars || a.wage - b.wage);
      const hireOptions = pool.map((c) => ({ key: c.id, label: `${'★'.repeat(c.stars)} ${c.name} · ${fmtMoneyShort(c.wage)} a season · ${c.years} yr` }));
      let k;
      if (current) {
        const opts = [];
        for (const yrs of [1, 2]) {
          const q = extendQuote(g, current, yrs);
          if (q.added === yrs) opts.push({ key: `!extend${yrs}`, label: `Extend until ${q.until} · ${fmtMoneyShort(q.wage)} a season` });
        }
        if (pool.length) opts.push({ key: '!replace', label: `Replace with another coach (${pool.length} available)` });
        opts.push({ key: '!release', label: `Release (compensation ${fmtMoneyShort(severance(g, current))})` });
        k = await ctx.choose(`<b>${ROLE_LABEL[role]}: ${esc(current.name)}</b> ${'★'.repeat(current.stars)}<br>
          Wage ${fmtMoney(current.wage)} a season, contract until ${current.until}.<br><span class="muted">${esc(ROLE_INFO[role])}</span>`, opts, { html: true });
        if (k === '!replace') {
          k = await ctx.choose(`Replace ${current.name} (${current.stars}★)? Paying off his contract costs ${fmtMoney(severance(g, current))}.`, hireOptions);
        }
      } else {
        if (!hireOptions.length) { ctx.toast('No coaches available until the summer.'); return; }
        k = await ctx.choose(`Hire ${role === 'assistant' ? 'an' : 'a'} ${ROLE_LABEL[role].toLowerCase()}?<br><span class="muted">${esc(ROLE_INFO[role])}</span>`, hireOptions, { html: true });
      }
      if (!k) return;
      if (k.startsWith('!extend')) ctx.toast(extendCoach(g, role, Number(k.slice(7))).message);
      else if (k === '!release') {
        if (!(await ctx.confirm(`Release ${current.name}? Compensation: ${fmtMoney(severance(g, current))}.`, { ok: 'Release' }))) return;
        ctx.toast(fireCoach(g, role).message);
      } else ctx.toast(hireCoach(g, k).message);
      draw();
    },
    back: () => { ctx.save({ silent: true }); ctx.back(); },
  });
  draw();
}
