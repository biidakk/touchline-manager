// Training: coaching staff, group presets with per-player overrides,
// fatigue, workload and development progress.

import { ROLES, ROLE_LABEL, ROLE_INFO, FOCI, FOCUS_LABEL, INTENSITIES, INTENSITY_LABEL, hireCoach, fireCoach, severance, planFor,
  acwr, defaultTraining, starsFor, coachFactor, physioDays } from '../../core/training.js';
import { ageOf } from '../../core/valuation.js';
import { battery } from '../components/pitch.js';
import { clubTopbar, bindTopbar } from '../components/chrome.js';
import { esc, fmtMoneyShort, bindActions, fullName } from '../util.js';

const VACANT = {
  fitness: 'Vacant: physical training much less effective', technical: 'Vacant: technical training much less effective',
  goalkeeping: 'Vacant: keeper training much less effective', physio: 'Vacant: injuries last 35% longer',
  youth: 'Vacant: weak academy and youth intake', assistant: 'Vacant: no advice, morale swings harder',
};
const GROUPS =[['all', 'Whole squad'], ['G', 'Goalkeepers'], ['D', 'Defenders'], ['M', 'Midfielders'], ['F', 'Forwards']];
const POS_ORDER = { G: 0, D: 1, M: 2, F: 3 };
const stars = (n) => (n ? `<span style="color:var(--gold)">${'★'.repeat(n)}</span><span class="dim">${'★'.repeat(5 - n)}</span>` : '<span class="bad">vacant</span>');
const planText = (p) => `${FOCUS_LABEL[p.focus]}${p.focus === 'recovery' ? '' : ` · ${INTENSITY_LABEL[p.intensity]}`}`;

export function render(root, ctx) {
  const g = ctx.game;
  const club = g.clubs[g.userClubId];
  if (!club.training) club.training = defaultTraining();
  const year = g.season.year;
  const T = club.training;

  function planSelect(attr, current, allowInherit) {
    const opts = [];
    if (allowInherit) opts.push(`<option value="">${allowInherit}</option>`);
    for (const f of FOCI) {
      if (f === 'recovery') { opts.push(`<option value="recovery|light" ${current && current.focus === 'recovery' ? 'selected' : ''}>Recovery</option>`); continue; }
      for (const i of INTENSITIES) {
        const sel = current && current.focus === f && current.intensity === i ? 'selected' : '';
        opts.push(`<option value="${f}|${i}" ${sel}>${FOCUS_LABEL[f]} · ${INTENSITY_LABEL[i]}</option>`);
      }
    }
    return `<select class="field plan" ${attr} style="height:26px;font-size:12px;padding:0 4px">${opts.join('')}</select>`;
  }

  function draw() {
    const ps = [...club.squad, ...(club.youth || [])].map((id) => g.players[id]).filter(Boolean)
      .sort((a, b) => (club.youth || []).includes(a.id) - (club.youth || []).includes(b.id) || POS_ORDER[a.pos] - POS_ORDER[b.pos] || b.skill - a.skill);
    const light = (p) => {
      const r = acwr(p);
      const c = r <= 1.3 ? 'good' : r <= 1.5 ? '' : 'bad';
      return `<span class="${c}" title="Workload ratio (7-day vs 28-day): ${r.toFixed(2)}. Above 1.3 raises injury risk.">●</span>`;
    };
    const delta = (v) => (v > 0 ? `<span class="good">+${v}</span>` : v < 0 ? `<span class="bad">${v}</span>` : '0');

    root.innerHTML = `${clubTopbar(ctx, { title: 'Training' })}
    <div class="panel" style="left:20px;top:92px;width:430px;height:352px;padding-top:12px">
      <h2 style="margin-bottom:4px">Staff</h2>
      <table class="data compact staff">${ROLES.map((r) => {
        const c = club.staff?.[r];
        return `<tr title="${esc(ROLE_INFO[r])}"><td><b>${ROLE_LABEL[r]}</b><div class="muted" style="font-size:11.5px">${c ? `${esc(c.name)} · until ${c.until}` : `<span class="bad">${VACANT[r]}</span>`}</div></td>
          <td>${stars(c?.stars || 0)}</td><td class="num">${c ? fmtMoneyShort(c.wage) + '/yr' : ''}</td>
          <td class="num" style="white-space:nowrap"><button class="btn btn-small btn-blue" style="min-width:0;padding:0 8px;font-size:12px" data-action="hire" data-role="${r}">${c ? 'Replace' : 'Hire'}</button>
          ${c ? `<button class="btn btn-small btn-blue" style="min-width:0;padding:0 8px;font-size:12px" data-action="fire" data-role="${r}" title="Release">✕</button>` : ''}</td></tr>`;
      }).join('')}</table>
      <p class="hint phone-hide" style="margin-top:6px">Hover a role to see what it does. Coaches: each star adds about 10% to development. Physio: shorter injuries. Youth coach: academy and youth intake. Assistant: match advice (My Team → Assistant) and a calmer dressing room.</p>
    </div>
    <div class="panel" style="left:20px;top:456px;width:430px;height:236px;padding-top:12px">
      <h2 style="margin-bottom:4px">Training plan</h2>
      <table class="data compact">${GROUPS.map(([k, label]) => `<tr><td><b>${label}</b></td>
        <td>${planSelect(`data-group="${k}"`, T.groups[k], k === 'all' ? null : 'Same as whole squad')}</td></tr>`).join('')}</table>
      <label class="row" style="margin-top:8px;font-size:13.5px"><input type="checkbox" id="taper" ${T.taper ? 'checked' : ''}> Ease off the day before a match (taper)</label>
      <p class="hint phone-hide" style="margin-top:4px">Harder training: faster development, more fatigue and injury risk. Recovery: no development, fatigue fades fast.</p>
    </div>
    <div class="panel" style="left:466px;top:92px;width:794px;height:540px;display:flex;flex-direction:column">
      <div class="panel-head"><h2>Players</h2><span class="muted" style="font-size:12.5px">Season gains in technique (TEC) and physique (PHY). The dot shows the workload risk.</span></div>
      <div class="scroll" style="flex:1"><table class="data compact">
        <thead><tr><th>Player</th><th class="c">Pos</th><th class="num">Age</th><th class="num">Ht</th><th class="num">TEC</th><th class="num">PHY</th><th class="num">Skill</th>
          <th class="num">+TEC</th><th class="num">+PHY</th><th>Energy</th><th class="c">Load</th><th>Plan</th></tr></thead>
        <tbody>${ps.map((p) => {
          const academy = (club.youth || []).includes(p.id);
          const eff = planFor(g, club, p);
          return `<tr class="${p.injuryDays > 0 ? 'unavail' : ''}"><td><b>${esc(fullName(p))}</b>${academy ? ' <span class="muted">(academy)</span>' : ''}${p.injuryDays > 0 ? ` <span class="badge inj">+${p.injuryDays}d</span>` : ''}</td>
            <td class="c">${p.pos}</td><td class="num">${ageOf(p, year)}</td><td class="num">${p.height}</td>
            <td class="num">${p.tec}</td><td class="num">${p.phy}</td><td class="num"><b>${p.skill}</b>/${p.potential}</td>
            <td class="num">${delta(p.tec - (p.tecStart ?? p.tec))}</td><td class="num">${delta(p.phy - (p.phyStart ?? p.phy))}</td>
            <td>${battery(p.energy)}</td><td class="c">${light(p)}</td>
            <td>${planSelect(`data-player="${p.id}"`, p.train, `Group: ${planText(eff)}`)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>
    <div class="hint" style="position:absolute;left:466px;top:640px;width:560px">Development factors now: technical ×${coachFactor(starsFor(g, club, 'technical')).toFixed(2)}, physical ×${coachFactor(starsFor(g, club, 'fitness')).toFixed(2)}, keepers ×${coachFactor(starsFor(g, club, 'goalkeeping')).toFixed(2)}, academy ×${coachFactor(starsFor(g, club, 'youth')).toFixed(2)}. Injury length ×${physioDays(g, club).toFixed(2)}.</div>
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
    hire: async (el) => {
      const role = el.dataset.role;
      const pool = (g.coachPool || []).filter((c) => c.role === role).sort((a, b) => b.stars - a.stars);
      if (!pool.length) { ctx.toast('No coaches available until the summer.'); return; }
      const current = club.staff?.[role];
      const k = await ctx.choose(`Hire ${role === 'assistant' ? 'an' : 'a'} ${ROLE_LABEL[role].toLowerCase()}?${current ? ` Replacing ${current.name} costs ${severance(g, current).toLocaleString('en-US')} € in compensation.` : ''}`,
        pool.map((c) => ({ key: c.id, label: `${'★'.repeat(c.stars)} ${c.name} · ${c.wage.toLocaleString('en-US')} € a year · ${c.years} yr` })));
      if (!k) return;
      const r = hireCoach(g, k);
      ctx.toast(r.message);
      draw();
    },
    fire: async (el) => {
      const c = club.staff[el.dataset.role];
      if (!(await ctx.confirm(`Release ${c.name}? Compensation: ${severance(g, c).toLocaleString('en-US')} €.`, { ok: 'Release' }))) return;
      ctx.toast(fireCoach(g, el.dataset.role).message);
      draw();
    },
    back: () => { ctx.save({ silent: true }); ctx.back(); },
  });
  draw();
}
