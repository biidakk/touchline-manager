# Football Manager: Plan (v1)

> **Status:** all 7 milestones are done (v1.0). Since then, from the "later" list: the Continental Champions Cup (v1.1), stadium expansion and scouting (v1.2), loans and B-team cooperation (v1.3), national teams with U21 (v1.4). Everything on the "later" list is now built. v1.5 adds technical/physical attributes, height, aerial duels, coaching staff and training plans (see DESIGN-attributes-training.md); daily training replaces the monthly development ticks described below. v1.6 adds personalities, morale (playing time, results, wages, ambition, promises, transfer requests) and three more staff roles: physio, youth coach and assistant manager (pre-match advice). v1.7 adds the manager's career: board confidence, sackings, manager reputation, AI vacancies, job offers and applications, and moving between clubs (AI boards can sack their managers after any league match). v1.8 lets the user manage a national team (senior or U21) alongside his club: squad picks, tactics, playing the internationals. v1.9 makes the Champions Cup quarter- and semi-finals and the national cup semi-finals two-legged ties (aggregate, then extra time and penalties). v2.0 replaces the fictional world: at the user's request the game now uses real countries (England, Spain, Italy, Germany, France, Czech Republic, two divisions each) with clubs close to the real ones (real cities, near-real names, kit colours and stadiums; generated crests, no real logos), realistic player and manager names per country, named AI managers, a names.json file plus in-game renames for the player's own names, and a desktop app (app/TouchlineManager.exe, pywebview). This supersedes the "fictional world only" rule from the original brief. v2.1 is a balancing pass: coach wages and scouting costs scale with the club (they had pushed every small club the user managed into debt and into a sacking spiral), inherited debt no longer counts against a new manager, board targets are tuned to be met about two seasons in three, and AI clubs only shortlist transfer targets they can afford (activity had dropped with six countries). Saves are upgraded to version 12. v2.2 adds history: player career tables per club with assists (double-click a player), club and national team records kept from the career's first season, the Ballon d'Or and Golden Shoe, green/red marks for skill changes, and national federations that only approach a manager who is doing well or out of work (save version 13). See README.md for what's in the game.
>
> **Changes from this plan made along the way:**
> - Set pieces (corners, free kicks with a wall, penalties) were added to the engine and the live view.
> - The user's youth intake goes to a separate academy, as in CSM.
> - Transfers happen in two windows (summer and January).
> - Wages pay for current ability, not potential.
> - Being out of position costs 30 % of skill, and 75 % in or out of goal.

## What the reference screenshots tell us
- **Fixed 16:9 "console" layout** (~1280×720 design size, scaled to fit the window). Dark-blue gradient background, rounded semi-transparent blue panels with thin light borders, white bold sans-serif text, and pill-shaped segmented buttons (dark blue, with the active segment in a lighter blue). Primary actions are big white or outlined buttons (CONTINUE, BACK).
- **Hub:** a club header bar (crest and name, with save/quit on the right) and a 4-column grid: menu with icons | upcoming fixtures (competition icon, round, opponent, H/A) | news (dismissable, "clear all", "+N more") above transfers (player, club > club, fee, paged 1–10/11–20…, All/League toggle) | club card (crest, league, quality, stadium, money) above season box (season % and "possible points %" bars, 5-row table excerpt with own club highlighted) | CONTINUE.
- **My Team:** dense squad table (No, Name, Pos G/D/M/F, Age, flag, Current/Potential skill, form arrow, energy %). Starters, bench and reserves are separated by divider lines, with H/$ badges for captain/listed. The pitch is vertical with the attack at the top. Each shirt shows number, name, "cur/pot", form arrow and a battery-style energy badge. Footer line: "avg skill – squad value – avg age". Finance list on the right, stadium card, A/B/C lineup slots (save/delete), 4 stat tiles (captain, set pieces, teamwork, goalkeeper), intent 0–100 in steps of 10, play style with % breakdown.
- **Tactics:** two mirrored pitches, a centre column of comparison tiles, a bench row per team with position badges, and intent and style bars for each side.
- **Live match:** big score blocks with crests and names, a clock, scorers and cards listed under each team, a horizontal striped pitch with numbered shirts, a ball-carrier label, a ball-icon caption bar, and LINEUPS / PAUSE buttons.

All visuals will be our own CSS and inline SVG: jersey SVG parameterised by colours and pattern, generated crests (shield + initials + colour pattern), generated tricolour flags, simple icons. No screenshot ships with the game.

## Architecture
Plain ES modules and no build. `start.bat` runs `python -m http.server 8765` and opens the browser.

```
index.html           app shell, loads src/ui/app.js
tests.html           runs src/tests/*.js, prints pass/fail and season statistics
start.bat
css/theme.css        tokens (blues, panel, pitch), panels, tables, buttons
src/core/            pure logic, no DOM access (testable)
  rng.js             seeded PRNG (mulberry32) + helpers; state is serialisable
  names.js           per-nation syllable tables -> player/club/stadium names
  worldgen.js        nations, competitions, clubs, squads
  ratings.js         position fit, team line strengths, captain/set-piece/teamwork/GK
  engine.js          match engine (step-able state machine)
  ai.js              AI lineups/tactics/subs, AI transfer behaviour
  calendar.js        season date list, fixtures (round robin), cup draws
  season.js          advance day, tables, end of season, promotion/relegation, awards
  development.js     ageing, growth/decline, retirement, youth intake
  transfers.js       valuation, market search, offers, AI-to-AI deals
  finance.js         income/expense ledger per club per season
  save.js            serialise/deserialise, versioned migrations
src/ui/              DOM only; reads state and calls core functions
  app.js, router.js, components/ (jersey, crest, flag, table, segmented, pitch)
  screens/ hub, myteam, tactics, match, league, cup, market, finances, career, otherteams, search
src/tests/           engine realism, worldgen invariants, season loop, 20-season soak, save round-trip
```

**State** is one plain JSON-serialisable `game` object. Saves go to **IndexedDB** (localStorage's ~5 MB cap is too tight over 20 seasons), with **Export/Import JSON** buttons. Each save carries a `version` and runs through migrations.

## Data model (sketch)
```
game { version, seed, rngState, date, seasonYear, userClubId, settings,
       nations{}, competitions{}, clubs{}, players{}, news[], transfers[], history{} }
nation      { id, name, short, flag{colors,layout}, namePool, tiers:[compId], cupId,
              /* later */ nationalTeam:null }
competition { id, type:'league'|'cup'|/*later*/'continental', nationId, tier, name,
              clubIds[], fixtures[], table{}, rounds[], prizeMoney, promotion, relegation,
              seasonHistory[] }
club        { id, name, short, nationId, compId, colors{primary,secondary,pattern}, crest{},
              stadium{name,capacity,/*later*/expansion:null}, reputation, budget, wageBudget,
              squad:[playerId], lineups{A,B,C,current}, tactics{formation,intent,style,captainId},
              finance{season:{...}, history[]}, /*later*/ bTeamOf:null, scouting:null }
lineup      { formation, slots:[{pos:'GK'|'DL'|...,playerId}], bench:[playerId], captainId }
player      { id, first, last, nationId, birthYear, pos:'G'|'D'|'M'|'F', side?, skill, potential,
              form(-2..2), energy(0..100), injuryDays, suspension, cards, number, clubId,
              wage, contractEnd, value, listed, stats:{season, career}, retired }
fixture     { id, compId, date, round, homeId, awayId, result:{h,a,events?}|null }
```
Skills use a **1–100** scale (top league stars ~80–88, lower tier ~45–60). Only the user's matches keep full event logs. AI matches keep scores and scorers, which keeps saves small. Retired players are trimmed to a short history record.

## Match engine approach
- **Team strengths per line** (GK, DEF, MID, ATT), computed from the XI: skill × position fit (out of position −15–40 %) × energy factor × form. Captain, teamwork (how long the players have been together) and set-piece taker give small modifiers. The 4 comparison tiles show these numbers.
- **Minute loop (90 + stoppage):** each minute, possession is weighted by MID ratio. An attack's chance probability depends on ATT vs DEF and on intent. Shot quality → goal probability uses the GK rating. Intent raises your chances and the chances conceded at the same time. Style (Normal / Passing / Crosses / Through-balls) works as rock-paper-scissors against the opponent's style and defensive line, and changes the event mix (headers vs shots after combinations). The home side gets about +6 % on chance creation.
- **Events:** goals (weighted to F > M > D for the scorer, with assists), saves, misses, yellow/red cards (~3.5 / ~0.1 per game), injuries (~0.15 per game), penalties, and substitutions (AI subs tired or carded players around 55–80'). Energy drops each minute based on age and intent, and red cards weaken a line.
- **Step-able engine:** `createMatch()` → `step(match)` per minute, so the live view, half-time changes and "instant result" all use the same code. Fully seeded and deterministic.
- **Calibration targets (checked in tests.html over thousands of seeded matches):** ~2.6–2.9 goals per game, home win ~45 %, draw ~26 %, away ~29 %, 0–0 ~7–9 %, and a clearly stronger side wins about 60–70 %.
- **2D view:** the engine reports ball zone and possession each tick. The UI moves shirts from formation positions shifted by phase and ball position, with tweened animation, and shows a ball-carrier label and caption. Speed settings 1×/2×/4× plus Instant.

## Season loop
A shared day-based calendar: league weekends plus midweek cup rounds. CONTINUE simulates every match in all countries up to and including the user's next fixture date, then opens pre-match tactics. A season has 18-club leagues (34 rounds) and 16-club leagues (30 rounds). The cup is single-leg knockout with random draws (lower tier hosts) and extra time plus penalties. At season end: 3 down / 3 up, prizes, awards (champion, top scorer, best player, best young player), ageing and development toward potential (peak 26–30, decline 31+), retirement (mostly 33–38), youth intake of 3–6 per club with potential tied to reputation, contract expiry, and AI squad top-ups.

## Player development
- **Monthly ticks during the season** (~10 per season). Each tick moves skill by a small step, usually 0 or ±1. The rate depends on:
  - **Age:** ≤21 fast, 22–25 moderate, 26–29 plateau, 30–32 slow decline, 33+ faster decline.
  - **Gap to potential:** growth slows as skill approaches potential.
  - **Playing time:** regular starters develop about 1.5× faster than bench and reserve players. Very young players get a small boost from being loaned out or playing in the B-team later on.
  - **Form and match ratings:** a small push in either direction, plus some randomness.
- **Typical season change:** an 18-year-old with a big gap gains +4 to +7, a 27-year-old ±1, a 33-year-old −2 to −4.
- **Season end:** age +1. Potential can drift ±0–3 (late bloomers and busts), retirements happen, and the youth intake arrives.
- **Form** (arrow) updates after every match. **Energy** drops in matches and recovers daily.
- **Visibility:** the squad table shows the change since the start of the season, and the news feed reports notable jumps ("X improved to 64").

## Transfers and finances
Player value depends on skill, potential, age and position. The market screen has filters (position, age, skill, price, nation, listed only) and an offer dialog. The AI accepts or counters based on value, squad need, its budget and whether the player is a key player. Daily AI-to-AI deals feed the ticker. The finance ledger per season covers tickets (attendance ∝ reputation × form × capacity), TV/sponsors (by tier), prize money, wages, transfers in/out and season costs, shown like the reference panel.

## Milestones (each ends with a run via start.bat, a console-error check and tests)
1. **Skeleton:** theme CSS, scaling shell, router, SVG jersey/crest/flag, seeded worldgen (3 fictional nations × 2 tiers + cup), new-game screen (pick a club), hub with real data, IndexedDB save + export/import, start.bat, tests.html with worldgen tests, README.
2. **Engine + calendar:** match engine, fixtures, tables, CONTINUE simulates the calendar, league table screen, engine calibration tests.
3. **My Team:** squad table, drag-and-drop XI and bench, 5 formations, captain, intent/style, A/B/C lineups, team averages, AI lineup selection.
4. **Match screens:** pre-match tactics comparison, live 2D view (speed, pause, instant), half-time and in-match subs and tactics, post-match summary.
5. **Season loop:** cups and draws, promotion/relegation, awards, development/retirement/youth, career overview and history, 20-season soak test (performance and save size).
6. **Transfers and finance:** market and offers, AI trades, ticker, finance panel and ledger, contracts/wages.
7. **Polish:** news feed variety, other-teams/search screens, balancing pass, README update.

**Verification:** I can't watch the browser myself, so I'll run headless Microsoft Edge (`msedge --headless --enable-logging`) against the local server to load index.html and tests.html, capture console errors and read the test results. You do the visual checks; I'll list what to try after each milestone.

## Decisions I've made (tell me if you want them changed)
- **Fictional nations** (e.g. invented names with generated flags) rather than real countries, so nothing resembles real leagues. Easy to switch to real country names with fictional clubs.
- **English UI.**
- **Skill scale 1–100** (CSM uses a compressed ~20–50 scale).
