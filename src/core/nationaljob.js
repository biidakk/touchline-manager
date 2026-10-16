// Managing a national team (senior or U21) alongside the club job.
//
// National federations look for a head coach when their team does badly (or
// the coach moves on). The user can apply, or be approached, if his
// reputation is high enough for that nation: the strongest football nation
// wants the best-known managers, U21 teams are easier to get. A national team
// manager picks the squad for each international break (the rest is filled
// automatically), the formation and tactics, and plays the matches himself.
// At the end of the season: a title (the Euro, the Nations League) boosts his
// reputation, finishing last in the group costs him the job.

import { Rng, clamp, hashSeed } from './rng.js';
import { addNews } from './season.js';
import { nationalTable, nationRanking, groupOf, NAT_IDS, TOURN_IDS, LEVELS } from './national.js';
import { confidence } from './board.js';

const VACANCY_DAYS = 120;
const OFFER_DAYS = 21;

const rngFor = (game, tag) => new Rng({ s: hashSeed(`${game.seed}:nat:${tag}:${game.day}`) });
const teamName = (game, id) => game.national.teams[id].name;

export const managedTeam = (game) => {
  const id = game.manager?.national?.teamId;
  return id ? game.national.teams[id] : null;
};
export const isManagedTeam = (game, id) => !!id && game.manager?.national?.teamId === id;

// Nations ordered by the average skill of their 23 best first-team players.
export const nationalRanking = (game) => nationRanking(game);

// The manager reputation a federation looks for.
export function nationalRequirement(game, teamId, ranking = nationalRanking(game)) {
  const team = game.national.teams[teamId];
  const rank = clamp(ranking.findIndex((r) => r.nationId === team.nationId), 0, ranking.length - 1);
  // From 64 for the strongest nation down to 30 for the weakest.
  return Math.round(64 - (34 * rank) / Math.max(1, ranking.length - 1)) - (team.level === 'u21' ? 22 : 0);
}

export function ensureNationalJobs(game) {
  if (!game.national) return;
  game.national.jobs = game.national.jobs || [];
  game.manager.national = game.manager.national || null;
  game.manager.natHistory = game.manager.natHistory || [];
}

// Federations only approach a manager who is out of work, or one whose club
// is doing well: board satisfied (55+) after meeting last season's target,
// delighted (65+) now, or a trophy last season. Applying is always possible.
export function welcomeByFederations(game) {
  const m = game.manager;
  if (m.sacked) return true;
  const conf = confidence(game);
  const last = (m.history || []).at(-1);
  const recent = last && last.year >= game.season.year - 1;
  return conf >= 65 || (recent && last.board?.met && conf >= 55) || !!(recent && last.trophies?.length);
}

function offerJob(game, job) {
  job.offered = true;
  job.expires = game.manager.sacked ? Math.max(job.expires, game.day + VACANCY_DAYS) : game.day + OFFER_DAYS;
  addNews(game, `Job offer: the ${teamName(game, job.teamId)} federation wants you as head coach${game.manager.sacked ? '' : ' (alongside your club job)'}. See My Career.`, 'job');
}

const mayOffer = (game, teamId, rng) => !game.manager.national && welcomeByFederations(game)
  && (game.manager.reputation ?? 0) >= nationalRequirement(game, teamId) && rng.chance(game.manager.sacked ? 0.5 : 0.35);

function openVacancy(game, teamId, why, rng) {
  const jobs = game.national.jobs;
  if (isManagedTeam(game, teamId) || jobs.some((j) => j.teamId === teamId)) return;
  const job = { teamId, day: game.day, expires: game.day + VACANCY_DAYS, why };
  jobs.push(job);
  if (mayOffer(game, teamId, rng)) offerJob(game, job);
  else {
    addNews(game, `${teamName(game, teamId)} are looking for a new head coach${why ? ` ${why}` : ''}.`, 'job');
  }
}

// A new career: two federations are looking for a coach, so the option is there from the start.
export function startNationalJobs(game) {
  ensureNationalJobs(game);
  const rng = rngFor(game, 'start');
  const ids = Object.keys(game.national.teams);
  openVacancy(game, rng.pick(ids.filter((id) => !id.endsWith('-21'))), '', rng);
  openVacancy(game, rng.pick(ids.filter((id) => id.endsWith('-21'))), '', rng);
}

// Just sacked (or resigned): open national vacancies may call.
export function nationalOffersWhenFree(game) {
  if (!game.national?.jobs) return;
  const rng = rngFor(game, 'free');
  for (const job of game.national.jobs) if (!job.offered && mayOffer(game, job.teamId, rng)) offerJob(game, job);
}

export function nationalDay(game) {
  if (!game.national?.jobs) return;
  game.national.jobs = game.national.jobs.filter((j) => j.expires >= game.day);
}

export function applyNational(game, teamId) {
  ensureNationalJobs(game);
  const job = game.national.jobs.find((j) => j.teamId === teamId);
  if (!job) return { ok: false, message: 'That job is no longer available.' };
  if (job.offered) return { ok: false, message: 'They have already offered you the job.' };
  if (job.applied) return { ok: false, message: 'You have already applied.' };
  job.applied = true;
  const diff = (game.manager.reputation ?? 0) - nationalRequirement(game, teamId);
  const chance = diff >= 0 ? 0.85 : diff >= -6 ? 0.4 : 0;
  if (!rngFor(game, `apply:${teamId}`).chance(chance)) {
    return { ok: false, message: chance ? `${teamName(game, teamId)} have chosen another coach.` : `${teamName(game, teamId)} want a more experienced coach.` };
  }
  job.offered = true;
  job.expires = Math.max(job.expires, game.day + OFFER_DAYS);
  return { ok: true, message: `${teamName(game, teamId)} offer you the job.` };
}

export function declineNational(game, teamId) {
  game.national.jobs = game.national.jobs.filter((j) => j.teamId !== teamId);
  return { ok: true, message: `You turned down ${teamName(game, teamId)}.` };
}

function closeNationalStint(game, end) {
  const m = game.manager;
  const n = m.national;
  if (!n) return;
  m.natHistory.push({ ...n, to: game.season.year, end });
  m.national = null;
  const team = game.national.teams[n.teamId];
  team.picks = [];
}

export function acceptNational(game, teamId) {
  ensureNationalJobs(game);
  const job = game.national.jobs.find((j) => j.teamId === teamId && j.offered);
  if (!job) return { ok: false, message: 'There is no offer from that federation.' };
  if (pendingNational(game)) return { ok: false, message: 'Play today\'s international first.' };
  const m = game.manager;
  if (m.national) closeNationalStint(game, 'left');
  m.national = { teamId, name: teamName(game, teamId), from: game.season.year, p: 0, w: 0, d: 0, l: 0 };
  game.national.teams[teamId].picks = [];
  game.national.jobs = game.national.jobs.filter((j) => j.teamId !== teamId);
  addNews(game, `${m.name} is the new head coach of ${teamName(game, teamId)}. Pick the squad on the National Team screen before each international break.`, 'national');
  return { ok: true, message: `You are the head coach of ${teamName(game, teamId)}.` };
}

export function resignNational(game) {
  const n = game.manager.national;
  if (!n) return { ok: false, message: 'You do not manage a national team.' };
  if (pendingNational(game)) return { ok: false, message: 'Play today\'s international first.' };
  closeNationalStint(game, 'resigned');
  addNews(game, `${game.manager.name} has stepped down as head coach of ${n.name}.`, 'national');
  return { ok: true, message: `You have left ${n.name}.` };
}

const pendingNational = (game) => {
  const id = game.manager?.national?.teamId;
  return !!id && Object.values(game.fixtures).some((f) => f.day === game.day && !f.result && (f.homeId === id || f.awayId === id));
};

// After each of the user's internationals.
export function nationalAfterMatch(game, f) {
  const n = game.manager.national;
  if (!n || (f.homeId !== n.teamId && f.awayId !== n.teamId)) return;
  const home = f.homeId === n.teamId;
  const gf = home ? f.result.h : f.result.a;
  const ga = home ? f.result.a : f.result.h;
  n.p++;
  if (gf > ga) n.w++; else if (gf < ga) n.l++; else n.d++;
}

// End of season (after the national competitions are closed).
export function seasonEndNational(game) {
  ensureNationalJobs(game);
  const m = game.manager;
  const year = game.season.year;
  const rng = rngFor(game, 'summer');
  const out = {};
  for (const level of LEVELS) {
    const comp = game.competitions[NAT_IDS[level]];
    if (!comp.fixtureIds.length) continue;
    const t = game.competitions[TOURN_IDS[level]];
    const finals = t.year === year + 1 && t.winnerId ? t : null;
    // Each team is judged on its group (older saves: the one table).
    const groups = comp.groups?.length ? comp.groups.map((g) => g.ids) : [comp.clubIds.filter((id) => comp.table[id])];
    for (const ids of groups) {
      const rows = nationalTable(game, comp, ids);
      rows.forEach((r, i) => {
        const last = i === rows.length - 1 && rows.length > 2;
        const won = finals?.winnerId === r.clubId || comp.winnerId === r.clubId || (!comp.format && i === 0);
        if (isManagedTeam(game, r.clubId)) {
          out.pos = i + 1;
          out.group = groupOf(comp, r.clubId)?.name || null;
          out.teamName = teamName(game, r.clubId);
          if (won) {
            m.reputation = clamp(m.reputation + (level === 'senior' ? (finals ? 8 : 5) : 2), 1, 100);
            out.verdict = 'champions';
            out.title = finals ? finals.name : comp.name;
          } else if (last) {
            out.verdict = 'sacked';
            m.reputation = clamp(m.reputation - 2, 1, 100);
            closeNationalStint(game, 'sacked');
            addNews(game, `The ${out.teamName} federation has dismissed you after a last-place finish.`, 'national');
          } else out.verdict = 'kept';
          return;
        }
        const p = last ? 0.5 : 0.08;
        if (rng.chance(p)) openVacancy(game, r.clubId, last ? 'after finishing last in their group' : 'after their coach moved on', rng);
      });
    }
    // The hosts play no qualifiers: only the finals count.
    if (finals && isManagedTeam(game, finals.hostId) && !out.teamName) {
      out.teamName = teamName(game, finals.hostId);
      out.verdict = finals.winnerId === finals.hostId ? 'champions' : 'kept';
      if (out.verdict === 'champions') {
        out.title = finals.name;
        m.reputation = clamp(m.reputation + (level === 'senior' ? 8 : 2), 1, 100);
      }
    }
  }
  return out.teamName ? out : null;
}
