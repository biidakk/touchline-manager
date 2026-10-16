// First-season tips: the assistant explains a screen the first time it is
// opened. New careers have them on; they can be switched off (and on again)
// from the assistant's to-do list, and ? in the top bar shows a screen's tip
// at any time. Careers from before v2.8 start with them off.

const TIPS = {
  hub: ['Welcome to your new club', `<p><b>Continue</b> plays on to your next match. Before it you can set the team and tactics, then watch it live or take an instant result.</p>
    <p><b>Sim</b> plays further ahead with instant results: a week, a month, to the transfer window or the end of the season.</p>
    <p><b>To do</b> (above the news) is my list of things that need your attention.</p>
    <p>Each screen explains itself the first time you open it. Tap <b>?</b> at the top to read its tip again.</p>`],
  tactics: ['Before the match', `<p>Check my advice, set the play style and how attacking we should be, then kick off.</p>
    <p>During the live match, <b>Tactics &amp; subs</b> pauses the game for changes; 1×, 2× and 4× set the speed.</p>
    <p><b>Instant result</b> skips the live match; I make the substitutions.</p>`],
  myteam: ['My Team', `<p>Tap two players (or drag one onto another) to swap them in the starting XI. Double-tap a player to open his card: attributes, contract, morale and transfer options.</p>
    <p>Watch the energy bars. Tired players play worse and get injured more easily.</p>
    <p>The captain and set-piece takers are picked automatically unless you choose them. A good captain has high leadership.</p>`],
  player: ['The player card', `<p><b>Skill</b> is the overall rating; <b>potential</b> is how good he can become (scout him to see it clearly).</p>
    <p><b>Technical</b>: finishing, heading, passing, crossing, dribbling, tackling, marking. <b>Physical</b>: pace, stamina, strength. Keepers also have reflexes and handling.</p>
    <p><b>Mental</b>: creativity makes chances, positioning stops them, teamwork helps the whole side and leadership makes a captain. They grow with games played and age.</p>
    <p>For your own players, <b>Focus</b> picks one attribute to train extra, and a leadership course raises leadership once a season.</p>`],
  market: ['Transfer Market', `<p>Search for players, put them on your shortlist and send scouts to find out their true potential.</p>
    <p>Players marked <b>LISTED</b> are on the transfer list: their club will sell for less.</p>
    <p>You can only sign players while a transfer window is open: summer, and from 27 December to 7 February.</p>`],
  training: ['Training and staff', `<p>Pick a training plan for the squad and hire coaches. Better coaches develop players faster and cut injuries.</p>
    <p>Tap a coach to extend his contract (up to three seasons ahead), replace or release him. Contracts end in the summer.</p>
    <p>Focus gives a player one attribute to work on extra, such as finishing for a striker.</p>
    <p>An assistant manager gives advice before matches; the more stars, the more he notices.</p>`],
  stadium: ['Stadium and facilities', `<p>A bigger stadium means more tickets. Expansions take months and cost money.</p>
    <p><b>Ground facilities</b> (levels 1 to 6) bring more fans to every match. A better <b>youth academy</b> brings more talented youngsters and helps them grow.</p>
    <p>Levels above your club's standard cost upkeep every month, so upgrade when the money is there.</p>
    <p><b>Reputation</b>, from Local to Worldwide, grows with success and helps to attract better players.</p>`],
  finances: ['Finances', '<p>Income from tickets, TV and sponsors pays the wages. Keep the club out of debt, or the board will lose patience.</p>'],
  youth: ['Youth academy', `<p>New youngsters arrive every summer. Choose what kind of players your youth scouts look for, promote the best ones by age 19 and send others to a B-team partner for match practice.</p>`],
  deals: ['A new season', '<p>Set the ticket prices and pick a sponsor. Cheaper tickets fill the stadium; dearer ones earn more per fan.</p>'],
  preseason: ['Pre-season tour', '<p>A training camp builds teamwork the most and a seaside tour lifts morale. A summer tour abroad is expensive, but big clubs earn it back in appearance fees.</p>'],
  career: ['My Career', `<p>The board's confidence and expectations, your record and job offers from other clubs. If confidence falls too low, you are sacked.</p>`],
  tables: ['League tables', '<p>Tables, results and top scorers for every league. Tap a club to look at it.</p>'],
  schedule: ['Schedule', '<p>All our matches this season, in every competition, with the results so far.</p>'],
  cup: ['Cups', '<p>The national cup is a straight knockout. The continental cups start with a league phase, then knockout rounds over two legs.</p>'],
  national: ['National teams', `<p>25 European countries play internationals on Thursdays in five breaks a season. Their coaches call up the best players, so yours may come back tired or injured.</p>
    <p>In the seasons before a Euro, the teams play qualifiers in groups; the others play the Nations League. The U21 teams do the same, with an U21 Euro every two years.</p>`],
  euro: ['The Euro', `<p>The finals are played in June, after the club season. Groups of four, then knockouts.</p>
    <p>Pick any match of the next match day and <b>Watch</b> it live, play the day with instant results, or <b>Sim to end</b> for the final result.</p>
    <p><b>Scorers</b> lists the top scorers and assists of the tournament.</p>`],
  rankings: ['Coefficients', `<p>Countries and clubs earn points for European results: 2 for a win, 1 for a draw, and a bonus for each stage reached.</p>
    <p>The <b>country ranking</b> (the last five seasons) decides how many clubs each country sends to the Champions Cup, Continental League and Conference. <b>So far</b> and <b>Next season</b> show how this season's results are moving it.</p>
    <p>The <b>club ranking</b> seeds the league-phase draw: a higher coefficient means easier opponents.</p>`],
  otherteams: ['Other teams', '<p>Look at any club in the world: its squad, finances and reputation. Tap a player to open his card or make an offer.</p>'],
};

export const tipsOn = (game) => !!game?.tips && !game.tips.off;

export const hasTip = (key) => !!TIPS[key];

// force: the ? button reads a tip again, even with tips off.
export async function showTip(ctx, key, { force = false } = {}) {
  const g = ctx.game;
  if (!TIPS[key]) return;
  if (!force && (!tipsOn(g) || ctx.dev || g.tips.seen[key])) return;
  if (g.tips) g.tips.seen[key] = true;
  const [title, html] = TIPS[key];
  const buttons = force ? [] : [{ key: 'off', label: 'No more tips', blue: true }];
  const k = await ctx.dialog(html, [...buttons, { key: 'ok', label: 'Got it' }], { title: `Tip: ${title}` });
  if (k === 'off') {
    g.tips.off = true;
    ctx.toast('Tips are off. Tap ? on any screen to read its tip.');
  }
}

export function setTips(game, on) {
  game.tips = game.tips || { off: false, seen: {} };
  game.tips.off = !on;
  if (on) game.tips.seen = {};
}
