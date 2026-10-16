// Achievements: milestones of the user's career, unlocked once each (with the
// season and club). Checked after every match of the user's club and at the
// end of each season; new ones go into the news and a pop-up queue.

import { addNews } from './season.js';

export const ACHIEVEMENTS = [
  { id: 'first_win', title: 'First win', text: 'Win your first match as a manager.' },
  { id: 'big_win', title: 'Thrashing', text: 'Win a match by five goals or more.' },
  { id: 'giant_killer', title: 'Giant killer', text: 'Beat a club with a reputation 15 or more above yours.' },
  { id: 'euro_win', title: 'European night', text: 'Win a match in a European competition.' },
  { id: 'promotion', title: 'Going up', text: 'Win promotion.' },
  { id: 'cup', title: 'Cup winners', text: 'Win a national cup.' },
  { id: 'league', title: 'Champions', text: 'Win a league title.' },
  { id: 'top5_league', title: 'Big league champions', text: 'Win the title in England, Spain, Italy, Germany or France.' },
  { id: 'double', title: 'The double', text: 'Win the league and the national cup in the same season.' },
  { id: 'treble', title: 'The treble', text: 'Win the league, the cup and a European trophy in one season.' },
  { id: 'ccl', title: 'Conference winners', text: 'Win the Continental Conference.' },
  { id: 'cel', title: 'Continental League winners', text: 'Win the Continental League.' },
  { id: 'ccc', title: 'Kings of Europe', text: 'Win the Continental Champions Cup.' },
  { id: 'unbeaten', title: 'Invincibles', text: 'Go a whole league season unbeaten.' },
  { id: 'points90', title: 'Ninety club', text: 'Collect 90 or more league points in a season.' },
  { id: 'survival', title: 'Great escape', text: 'Stay up with a club whose board only asked you to avoid relegation.' },
  { id: 'graduate', title: 'Made in the academy', text: 'An academy graduate plays 20 or more league games in a season.' },
  { id: 'u19', title: 'Youth champions', text: 'Win the U-19 league.' },
  { id: 'national', title: 'National hero', text: 'Win the Euro or the Nations League as a national team coach.' },
  { id: 'wins100', title: 'Century of wins', text: 'Win 100 league matches in your career.' },
  { id: 'seasons10', title: 'Long service', text: 'Manage for ten seasons.' },
  { id: 'countries3', title: 'Globetrotter', text: 'Manage clubs in three different countries.' },
];

const TOP5 = new Set(['ENG', 'ESP', 'ITA', 'GER', 'FRA']);

export function unlock(game, id, note = '') {
  game.achievements = game.achievements || {};
  if (game.achievements[id]) return false;
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a) return false;
  const club = game.clubs[game.userClubId];
  game.achievements[id] = { year: game.season.year, day: game.day, club: club?.name || null, note };
  game.achievementQueue = [...(game.achievementQueue || []), id];
  addNews(game, `Achievement unlocked: ${a.title}${note ? ` (${note})` : ''}.`, 'achievement');
  return true;
}

// After a match of the user's club (not friendlies or internationals).
export function checkMatchAchievements(game, f) {
  const user = game.userClubId;
  const r = f.result;
  if (!r || r.friendly || (f.homeId !== user && f.awayId !== user)) return;
  const home = f.homeId === user;
  const gf = home ? r.h : r.a;
  const ga = home ? r.a : r.h;
  const won = r.winner ? r.winner === user : gf > ga;
  if (!won) return;
  const opp = game.clubs[home ? f.awayId : f.homeId];
  const me = game.clubs[user];
  unlock(game, 'first_win', `${gf}:${ga} against ${opp.name}`);
  if (gf - ga >= 5) unlock(game, 'big_win', `${gf}:${ga} against ${opp.name}`);
  if (opp.reputation >= me.reputation + 15) unlock(game, 'giant_killer', `against ${opp.name}`);
  if (game.competitions[f.compId]?.type === 'continental') unlock(game, 'euro_win', `against ${opp.name}`);
}

// At the end of a season, from the season's summary and the career record.
export function checkSeasonAchievements(game, summary) {
  const h = game.manager.history || [];
  const last = h.at(-1);
  if (!last) return;
  const user = game.clubs[summary.user.clubId] || game.clubs[game.userClubId];
  const won = new Set((summary.user.trophyIds || []));
  const year = summary.year;
  const leagueWon = last.pos === 1;
  const cupWon = summary.cups?.some((c) => c.winnerId === user?.id);
  const euro = (summary.continentals || []).filter((c) => c.winnerId === user?.id);
  if (summary.user.promoted) unlock(game, 'promotion', last.clubName);
  if (cupWon) unlock(game, 'cup', last.clubName);
  if (leagueWon) {
    unlock(game, 'league', `${last.compName} with ${last.clubName}`);
    if (TOP5.has(user?.nationId) && last.tier === 1) unlock(game, 'top5_league', `${last.compName}`);
  }
  if (leagueWon && cupWon) unlock(game, 'double', last.clubName);
  if (leagueWon && cupWon && euro.length) unlock(game, 'treble', last.clubName);
  for (const c of euro) unlock(game, c.compId === 'CCC' ? 'ccc' : c.compId === 'CEL' ? 'cel' : 'ccl', last.clubName);
  if (last.p >= 20 && last.l === 0) unlock(game, 'unbeaten', `${last.compName} ${year}/${String(year + 1).slice(2)}`);
  if (last.pts >= 90) unlock(game, 'points90', `${last.pts} points`);
  const target = summary.user.board?.target || '';
  if (/relegation/i.test(target) && !summary.user.relegated && summary.user.board?.met) unlock(game, 'survival', last.clubName);
  if (user) {
    const grad = user.squad.map((id) => game.players[id]).find((p) => p?.graduate === user.id && (p.stats.season.apps || 0) >= 20);
    if (grad) unlock(game, 'graduate', `${grad.first} ${grad.last}`);
  }
  if (summary.nationalJob?.verdict === 'champions') unlock(game, 'national', summary.nationalJob.teamName);
  const wins = h.reduce((a, x) => a + (x.w || 0), 0);
  if (wins >= 100) unlock(game, 'wins100', `${wins} wins`);
  if (h.length >= 10) unlock(game, 'seasons10');
  const countries = new Set(h.map((x) => game.clubs[x.clubId]?.nationId).filter(Boolean));
  if (countries.size >= 3) unlock(game, 'countries3', [...countries].join(', '));
  void won;
}

// New unlocks for the pop-up (taken once).
export function takeAchievementQueue(game) {
  const q = game.achievementQueue || [];
  game.achievementQueue = [];
  return q.map((id) => ({ ...ACHIEVEMENTS.find((a) => a.id === id), ...game.achievements[id] }));
}
