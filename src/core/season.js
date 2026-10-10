// Season setup and queries (tables, fixtures, progress).

import { seasonDates, scheduleLeague, scheduleCup, drawCupRound } from './calendar.js';
import { Rng } from './rng.js';
import { initContinental } from './continental.js';
import { initNational } from './national.js';

const emptyRow = () => ({ p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] });

export function initSeason(game, year) {
  const rng = new Rng(game.rng);
  const dates = seasonDates(year);
  game.season = { year, start: dates.start, end: dates.end, weekends: dates.weekends, phase: 'season' };
  game.day = dates.start - 7;
  for (const comp of Object.values(game.competitions)) {
    if (comp.type === 'league') {
      comp.table = {};
      for (const id of comp.clubIds) comp.table[id] = emptyRow();
      scheduleLeague(game, comp, dates, rng);
    } else if (comp.type === 'cup') {
      scheduleCup(game, comp, dates);
      drawCupRound(game, comp, 0, rng);
    }
  }
  // After the national cups, so its Tuesdays avoid their midweek rounds.
  initContinental(game, dates, rng);
  initNational(game, dates, rng);
}

export function sortedTable(game, comp) {
  return Object.entries(comp.table)
    .map(([clubId, r]) => ({ clubId, ...r, gd: r.gf - r.ga }))
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf
      || game.clubs[a.clubId].name.localeCompare(game.clubs[b.clubId].name));
}

export function clubFixtures(game, clubId) {
  return Object.values(game.fixtures)
    .filter((f) => f.homeId === clubId || f.awayId === clubId)
    .sort((a, b) => a.day - b.day);
}

// Upcoming items for a club: real fixtures plus cup rounds not drawn yet.
export function upcomingForClub(game, clubId, limit = 8) {
  const club = game.clubs[clubId];
  const items = clubFixtures(game, clubId)
    .filter((f) => !f.result)
    .map((f) => ({ fixture: f, day: f.day, compId: f.compId }));
  const cup = game.competitions[game.nations[club.nationId].cupId];
  if (cup && cup.alive.includes(clubId)) {
    for (const r of cup.rounds) {
      if (!r.drawn) items.push({ fixture: null, day: r.day, compId: cup.id, roundName: r.name });
    }
  }
  return items.sort((a, b) => a.day - b.day).slice(0, limit);
}

export function leagueProgress(game, clubId) {
  const club = game.clubs[clubId];
  const comp = game.competitions[club.compId];
  const row = comp.table[clubId];
  const total = (comp.clubIds.length - 1) * 2;
  return {
    seasonPct: Math.round((row.p / total) * 100),
    pointsPct: row.p ? Math.round((row.pts / (row.p * 3)) * 100) : 0,
  };
}

export function addNews(game, text, kind = 'info') {
  const id = 'n' + (game.ids.news = (game.ids.news || 0) + 1);
  game.news.unshift({ id, day: game.day, text, kind });
  if (game.news.length > 60) game.news.length = 60;
}
