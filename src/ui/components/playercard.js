// Player detail dialog (any player in the world), with transfer actions.

import { askingPrice } from '../../core/transfers.js';
import { potText, assignScout, attrText, personalityText } from '../../core/scouting.js';
import { moraleOf, moraleLevel } from '../../core/morale.js';
import { fmtDate } from '../../core/calendar.js';
import { ageOf } from '../../core/valuation.js';
import { crest, flag } from './svg.js';
import { formArrow, skillMark } from './pitch.js';
import { esc, fmtMoney, fullName } from '../util.js';
import { clubLink, playerLink } from './links.js';
import { setPlayerName } from '../../core/renames.js';

const POS = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' };

// "Happy (72)" coloured by level, plus a transfer-request flag.
export function moraleBadge(p, short = false) {
  const v = moraleOf(p);
  const [, label, cls] = moraleLevel(v);
  const req = p.mood?.request ? (short ? ' <span class="badge inj" title="Has asked to leave">!</span>' : ' <span class="bad">· wants to leave</span>') : '';
  return `<span class="${cls}">${label} (${v})</span>${req}`;
}

export function scoutStatus(game, p) {
  const s = game.clubs[game.userClubId]?.scouting;
  const a = s?.assignments.find((x) => x.playerId === p.id);
  if (a) return `<span class="muted">scout reports on ${fmtDate(a.end, false)}</span>`;
  const r = s?.reports[p.id];
  if (r) return `<span class="good">report ${r.year}/${String(r.year + 1).slice(2)}</span>`;
  return '<span class="dim">not scouted</span>';
}

export function playerDetailHtml(game, p) {
  const year = game.season.year;
  const club = p.clubId ? game.clubs[p.clubId] : null;
  const mine = club && club.id === game.userClubId;
  const academy = club && (club.youth || []).includes(p.id);
  const s = p.stats.season;
  const avg = s.apps ? (s.ratingSum / s.apps).toFixed(2) : '-';
  const histRows = careerRows(game, p);
  return `<div class="row" style="gap:16px;align-items:flex-start">
      <div style="flex:1">
        <div class="row" style="gap:10px"><span style="font-size:24px;font-weight:900">${esc(fullName(p))}</span>${flag(game.nations[p.nationId].flag, 28)}</div>
        <div class="row muted" style="margin:4px 0 12px">${club ? `${clubLink(game, club.id, { crest: 22 })}${academy ? ' (academy)' : ` · #${p.number}`}` : 'No club'}</div>
        <div class="fin-list" style="grid-template-columns:150px 1fr">
          <span>Position</span><b>${POS[p.pos]}</b>
          <span>Age · nationality</span><b>${ageOf(p, year)} · ${esc(game.nations[p.nationId].name)}</b>
          <span>Skill / potential</span><b>${skillMark(p)} / ${potText(game, p)} ${formArrow(p.form)}</b>
          <span>Technical · physical</span><b>${attrText(game, p, 'tec')} · ${attrText(game, p, 'phy')}</b>
          <span>Height</span><b>${p.height ? `${p.height} cm` : '-'}</b>
          <span>Personality</span><b>${personalityText(game, p)}</b>
          ${mine ? `<span>Morale</span><b>${moraleBadge(p)}</b>` : ''}
          ${!mine ? `<span>Scouting</span><b>${scoutStatus(game, p)}</b>` : ''}
          <span>This season</span><b>${s.apps} apps, ${s.goals} goals, ${s.assists} assists, avg ${avg}</b>
          <span>Career</span><b>${p.stats.career.apps} apps, ${p.stats.career.goals} goals, ${careerAssists(p)} assists</b>
          ${p.awards?.length ? `<span>Awards</span><b style="white-space:normal">${awardsText(p)}</b>` : ''}
          ${p.intl ? `<span>International</span><b>${p.intl.caps} caps, ${p.intl.goals} goals${p.intl.u21Caps ? ` · U21 ${p.intl.u21Caps} caps, ${p.intl.u21Goals} goals` : ''}</b>` : ''}
          ${p.loan ? `<span>Loan</span><b>from ${clubLink(game, p.loan.parentId)} until season end</b>` : ''}
          <span>Status</span><b>${p.injuryDays > 0 ? `<span class="bad">Injured (${p.injuryDays} days)</span>` : p.suspension > 0 ? '<span class="bad">Suspended</span>' : '<span class="good">Fit</span>'}</b>
        </div>
      </div>
      <div style="width:260px">
        <div class="fin-list">
          <span>Market value</span><b>${fmtMoney(p.value)}</b>
          <span>Wage / year</span><b>${fmtMoney(p.wage)}</b>
          <span>Contract until</span><b>${p.contractEnd}</b>
          ${!mine && !academy && club ? `<span>Asking price</span><b>${fmtMoney(askingPrice(game, p))}</b>` : ''}
          ${p.listed ? '<span>Transfer list</span><b class="good">Listed</b>' : ''}
        </div>
      </div>
    </div>
    <h2 style="margin-top:16px;font-size:16px">Career history</h2>
    <div class="scroll" style="max-height:190px"><table class="data compact"><thead><tr><th>Season</th><th>Club</th><th class="num">Apps</th><th class="num">Goals</th><th class="num">Assists</th><th class="num">Avg</th></tr></thead>
      <tbody>${histRows}</tbody></table></div>`;
}

const yr = (y) => `${y}/${String(y + 1).slice(2)}`;

const careerAssists = (p) => p.stats.career.assists
  ?? (p.history || []).reduce((a, h) => a + (h[5] || 0), 0) + (p.stats.season.assists || 0);

function awardsText(p) {
  const by = {};
  for (const a of p.awards) (by[a.name] = by[a.name] || []).push(yr(a.year));
  return Object.entries(by).map(([name, ys]) => `${esc(name)}${ys.length > 1 ? ` ×${ys.length}` : ''} <span class="muted">(${ys.join(', ')})</span>`).join('<br>');
}

// One row per club per season (newest first), the current season's spell on
// top, and the career totals.
function careerRows(game, p) {
  const club = (id) => (game.clubs[id] ? clubLink(game, id) : '<span class="dim">-</span>');
  const rows = [];
  const sp = p.spell;
  if (sp && (sp.apps || sp.goals)) {
    rows.push(`<tr class="me"><td>${yr(game.season.year)} <span class="muted">(now)</span></td><td>${club(sp.clubId)}</td><td class="num">${sp.apps}</td>
      <td class="num">${sp.goals}</td><td class="num">${sp.assists}</td><td class="num">${sp.apps ? (sp.ratingSum / sp.apps).toFixed(1) : '-'}</td></tr>`);
  }
  for (const [y, clubId, apps, goals, r10, assists] of (p.history || []).slice().reverse()) {
    rows.push(`<tr><td>${yr(y)}</td><td>${club(clubId)}</td><td class="num">${apps}</td><td class="num">${goals}</td>
      <td class="num">${assists ?? '-'}</td><td class="num">${(r10 / 10).toFixed(1)}</td></tr>`);
  }
  if (!rows.length) return '<tr><td colspan="6" class="dim">No matches played yet.</td></tr>';
  rows.push(`<tr style="font-weight:800;border-top:2px solid var(--row-line)"><td>Total</td><td></td><td class="num">${p.stats.career.apps}</td>
    <td class="num">${p.stats.career.goals}</td><td class="num">${careerAssists(p)}</td><td></td></tr>`);
  return rows.join('');
}

// Opens the dialog. Players of other clubs get "Make offer" (opens the market
// with him selected) and a shortlist toggle.
export async function showPlayer(ctx, playerId) {
  const g = ctx.game;
  const p = g.players[playerId];
  if (!p) return;
  const own = p.clubId === g.userClubId;
  const forSale = !own && p.clubId && g.clubs[p.clubId].squad.includes(p.id) && !p.loan;
  g.shortlist = g.shortlist || [];
  const listed = g.shortlist.includes(p.id);
  const rename = '<button class="btn btn-small btn-blue" data-pa="rename" title="Rename this player (your copy only)">Rename</button>';
  const extra = forSale
    ? `<div class="row" style="margin-top:14px;gap:10px"><button class="btn btn-small" data-pa="offer">Make offer</button>
        <button class="btn btn-small btn-blue" data-pa="short">${listed ? 'Remove from shortlist' : 'Add to shortlist'}</button>
        <button class="btn btn-small btn-blue" data-pa="scout">Scout</button>${rename}</div>`
    : `<div class="row" style="margin-top:14px;gap:10px">${rename}</div>`;
  let action = null;
  const html = `<div data-player-modal>${playerDetailHtml(g, p)}${extra}</div>`;
  const done = ctx.modal(html, { title: own ? 'Your player' : 'Player' });
  const node = document.querySelector('[data-player-modal]');
  node.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pa]');
    if (!b) return;
    action = b.dataset.pa;
    if (action === 'scout') {
      ctx.toast(assignScout(g, p.id).message);
      action = null;
      return;
    }
    if (action === 'short') {
      if (g.shortlist.includes(p.id)) g.shortlist = g.shortlist.filter((x) => x !== p.id); else g.shortlist.push(p.id);
      b.textContent = g.shortlist.includes(p.id) ? 'Remove from shortlist' : 'Add to shortlist';
      ctx.toast(g.shortlist.includes(p.id) ? 'Added to shortlist' : 'Removed from shortlist');
      action = null;
      return;
    }
    node.closest('.modal-bg').querySelector('[data-close]').click();
  });
  await done;
  if (action === 'rename') {
    const name = await ctx.prompt('Player name (first name and surname):', `${p.first} ${p.last}`, { ok: 'Rename' });
    if (name && setPlayerName(p, name)) {
      ctx.toast(`Renamed to ${p.first} ${p.last}`);
      ctx.render();
    }
    return;
  }
  if (action === 'offer') {
    ctx.marketState = null;
    ctx.go('market', { tab: 'search', select: p.id });
  }
}
