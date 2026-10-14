// First-season tips: the assistant explains a screen the first time it is
// opened. New careers have them on; they can be switched off (and on again)
// from the assistant's to-do list. Careers from before v2.8 start with them off.

const TIPS = {
  hub: ['Welcome to your new club', `<p><b>Continue</b> plays on to your next match. Before it you can set the team and tactics, then watch it live or take an instant result.</p>
    <p><b>Sim</b> plays further ahead with instant results: a week, a month, to the transfer window or the end of the season.</p>
    <p><b>To do</b> (above the news) is my list of things that need your attention.</p>`],
  tactics: ['Before the match', `<p>Check my advice, set the play style and how attacking we should be, then kick off.</p>
    <p><b>Instant result</b> skips the live match; I make the substitutions.</p>`],
  myteam: ['My Team', `<p>Tap two players (or drag one onto another) to swap them in the starting XI. Double-tap a player to open his card: contract, morale and transfer options.</p>
    <p>Watch the energy bars. Tired players play worse and get injured more easily.</p>`],
  market: ['Transfer Market', `<p>Search for players, put them on your shortlist and send scouts to find out their true potential.</p>
    <p>You can only sign players while a transfer window is open: summer, and from 27 December to 7 February.</p>`],
  training: ['Training and staff', `<p>Pick a training plan for the squad and hire coaches. Better coaches develop players faster and cut injuries.</p>
    <p>Focus gives a player one attribute to work on extra, such as finishing for a striker.</p>
    <p>An assistant manager gives advice before matches; the more stars, the more he notices.</p>`],
  finances: ['Finances', '<p>Income from tickets, TV and sponsors pays the wages. Keep the club out of debt, or the board will lose patience.</p>'],
  youth: ['Youth academy', `<p>New youngsters arrive every summer. Choose what kind of players your youth scouts look for, promote the best ones by age 19 and send others to a B-team partner for match practice.</p>`],
  deals: ['A new season', '<p>Set the ticket prices and pick a sponsor. Cheaper tickets fill the stadium; dearer ones earn more per fan.</p>'],
  career: ['My Career', '<p>The board\'s confidence and expectations, your record and job offers from other clubs. If confidence falls too low, you are sacked.</p>'],
};

export const tipsOn = (game) => !!game?.tips && !game.tips.off;

export async function showTip(ctx, key) {
  const g = ctx.game;
  if (!tipsOn(g) || ctx.dev || g.tips.seen[key] || !TIPS[key]) return;
  g.tips.seen[key] = true;
  const [title, html] = TIPS[key];
  const k = await ctx.dialog(html, [{ key: 'off', label: 'No more tips', blue: true }, { key: 'ok', label: 'Got it' }], { title: `Tip: ${title}` });
  if (k === 'off') {
    g.tips.off = true;
    ctx.toast('Tips are off. Switch them on again from the To do list.');
  }
}

export function setTips(game, on) {
  game.tips = game.tips || { off: false, seen: {} };
  game.tips.off = !on;
  if (on) game.tips.seen = {};
}
