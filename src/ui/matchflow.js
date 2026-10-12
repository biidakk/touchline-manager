// Finishing the user's match: apply the result, save, show the report.

import { finishUserMatch } from '../core/matchday.js';
import { addNews } from '../core/season.js';
import { isNational, teamOf } from '../core/national.js';
import { matchReport, scoreText, outcomeFor } from './components/report.js';

export async function finishMatch(ctx, f, m) {
  const g = ctx.game;
  const national = isNational(g, f);
  const mine = national ? g.manager.national?.teamId : g.userClubId;
  finishUserMatch(g, f, m);
  const o = outcomeFor(g, f, mine);
  // (Internationals make their own news.)
  if (!national) addNews(g, `${f.result.friendly ? `Friendly ${o === 'W' ? 'win' : o === 'L' ? 'defeat' : 'draw'}` : o === 'W' ? 'Win' : o === 'L' ? 'Defeat' : 'Draw'}: ${teamOf(g, f.homeId).name} ${scoreText(f)} ${teamOf(g, f.awayId).name}.`, 'result');
  ctx.match = null;
  await ctx.save({ silent: true });
  ctx.home('hub');
  await ctx.modal(matchReport(g, f), { title: 'Full time', button: 'Continue' });
  if (g.manager.sacked) {
    await ctx.confirm(`${g.manager.sacked.clubName} have sacked you ${g.manager.sacked.why}. Choose your next club from the offers.`, { ok: 'Find a new job', cancel: null });
    ctx.home('career');
  } else if (g.season.phase === 'over') ctx.home('hub', { seasonOver: true });
}
