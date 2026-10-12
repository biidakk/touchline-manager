# Touchline Manager

A football (soccer) management game, inspired by the layout of Czech Soccer Manager.

## Play
- **In your browser (PC, tablet or phone):** **https://biidakk.github.io/touchline-manager/**. On a phone, turn it sideways and use "Add to Home Screen" to install it as an app; after the first visit it also works offline. Your career is saved in that browser (use Export to keep a backup).
- **Windows app:** download `TouchlineManager.exe` from the **[latest release](https://github.com/biidakk/touchline-manager/releases/latest)** and run it. Windows may warn about an unknown publisher (the app isn't code-signed): click *More info → Run anyway*.
- **From the source:** download this repository and double-click `start.bat` (needs Python).

**The world:**
- **Countries:** England, Spain, Italy, Germany, France and the Czech Republic, each with two divisions (18 clubs; 16 in the Czech leagues) and a national cup.
- **Clubs:** real cities, with names, kit colours and stadiums close to the real clubs (for example "Manchester Blue", "Madrid Blancos", "FC Plzeň"), but not their real names.
- **Players and managers:** realistic names for each country, combined at random. A combination can occasionally match a real person by chance.
- **Graphics:** crests are generated from the kit colours (no real logos), and all graphics are CSS/SVG made for this project.
- **Your own names:** put real or any other names in **`names.json`** (see [Your own names](#your-own-names)).

## Starting the game
**Desktop app:** double-click **`app\TouchlineManager.exe`**. The game opens in its own window, with no browser and nothing else to start. It needs Windows 10/11 with the Edge WebView2 runtime, which is normally already installed. Saves are kept under `%APPDATA%\TouchlineManager`.

**In a browser:**
1. Double-click **`start.bat`**. It starts `python -m http.server 8765` in this folder and opens http://localhost:8765.
2. Keep the console window open while you play. Close it to stop the server.
3. You need Python 3 and a modern browser (Edge, Chrome or Firefox). After updating the game files, press **Ctrl+F5** once, because browsers cache the scripts.

The app and the browser keep separate saves. To move a career between them, use **Export** in one and **Import** in the other.

**Rebuilding the .exe** after changing the game files: run `desktop\build_exe.bat`. It needs `python -m pip install --user pywebview pyinstaller` once. The app's source is `desktop\launcher.py`.

## On a phone or tablet
- **Try it at home:** run **`start-phone.bat`** on the PC. It shows an address such as `http://192.168.1.20:8765`; type it on a phone on the same Wi-Fi, **including `http://`**, and turn the phone sideways. The first time, Windows asks whether Python may use the network: allow it on private networks.
- **"Can't open the page":** the phone probably switched to a secure `https://` address, which a home server can't offer (the PC window then prints a hint). Type `http://` explicitly; in Chrome tap "Continue to site" or turn off *Settings → Privacy and security → Security → Always use secure connections*; on an iPhone turn off *Settings → Apps → Safari → Not Secure Connection Warning*.
- **Add to Home Screen** (Safari's share menu on iPhone, Chrome's menu on Android) gives it an icon and a full screen.
- **Offline play and a proper install:** use the published site (https://biidakk.github.io/touchline-manager/): after the first visit it works offline, and "Add to Home Screen" installs it.
- **Saves** on the phone are separate from the PC's: move a career with Export / Import.
- **Touch:** tap two players to swap them (drag-and-drop needs a mouse); double-tap a player for his career.
- **Bigger text on phones:** small screens switch to much larger text automatically (the 1280×720 screen is shown at about half size on a phone). To make room, phones show fewer rows (three fixtures on the hub, five transfers a page) and hide low-value columns and hints. The search box doesn't pop up the keyboard by itself. Held upright, the game asks you to turn the phone sideways.

## Real teams and players
The published game uses near-real club names and generated players. For your own copy you can play with **real clubs and real squads** from a real-teams file (`realpack.json`, format `touchline-realpack`). It is personal-use data and is never published with the game.
- **On the PC** (`start.bat`, `start-phone.bat` or `TouchlineManager.exe`): put `realpack.json` in the game folder (next to the .exe for the Windows app).
- **On a phone or any browser:** send the file to the device, then on **New career → Real teams → Load file**. It stays stored in that browser (**Remove** takes it out again).
- **Sharing with friends (locked copy):** `tools/make_realpack.py` also writes `realpack.enc`, an encrypted copy that can sit on the website, plus a code kept in `private/realpack-code.txt`. A link ending in `#rp=CODE` unlocks the real teams on the device that opens it; in an installed home-screen app, use **New career → Real teams → Enter code**. Without the code the file is unreadable. Anyone you give the link or code can unlock it.
- **New career:** tick **Real clubs and players**. Clubs get their real names, stadiums and head coaches, and their squads are replaced by the real players (positions, ages, nationalities, heights and shirt numbers). Careers you already play are not changed.
- **Ratings** in the file are estimates on a video-game style 40–95 scale. The game turns them into its skills: each club keeps about the strength the game gives it, and the order of players inside a club follows the file. Potential comes from the file for young players, or from age.
- **Countries without a league** in the game (Brazil, Argentina, Portugal, Norway…) are added for their players' nationality and flags only; they have no national team.
- **Youth players** arriving each summer are still generated.
- **Making the file:** `tools/make_realpack.py` merges per-league research files (`private/realpack/<LEAGUE>.json`) into `realpack.json` and reports problems. Clubs with fewer than 16 players or 2 keepers keep their generated squad (but take the real name).
## Your own names
`names.json` (in the game folder, or next to `TouchlineManager.exe`) maps the game's names to yours, for example `"clubs": { "Manchester Blue": { "name": "...", "short": "...", "stadium": "...", "manager": "..." } }`. It also covers nations, leagues, cups and players ("Old Name": "New Name").
- **When it applies:** when a world is created and every time a career is loaded, so you can edit it at any time.
- **Format:** the file explains itself and has examples. Keep it valid JSON (quotes, commas) and save it as UTF-8. If it can't be read, the title screen says so.
- **In the game:** use **Rename** on any player card, or on a club in Other Teams.
- **Older careers:** saves from before v2.0 keep their fictional world.

## How to play
1. **New career:** enter your name (every new career gets a freshly generated world), browse the six countries and their two divisions, and choose a club. The board tells you what it expects.
2. **Hub:**
   - **Menu:** My Team, Other Teams, Season Schedule, My Career, Search, Transfer Market, Training, Finances, plus your league and cup.
   - **Panels:** your last result and next three fixtures (Full schedule for the rest), news, the transfer ticker, your club card and the season table.
   - **CONTINUE** plays the calendar up to your next match. It also stops when the winter transfer window opens, on a day a club makes an offer for one of your players (see Selling), and at the end of the season. At the start of a season (and after taking over a club) it reads **PREPARE SEASON** first: see Season preparations below.
3. **My Team:**
   - **Picking the team:** drag players between the squad list and the pitch, or click two players to swap them. Choose a formation (4-4-2, 4-3-3, 4-5-1, 3-5-2, 5-3-2) or use **Auto pick**.
   - **Out of position:** a player outside his natural position plays at 70 % of his skill, and at 25 % in or out of goal.
   - **Player card** (click a player): make him captain, set-piece taker or penalty taker; put him on the transfer list (**Sell…**); loan him out (**Loan…**); offer a new **Contract…**; or **Release** him. While the card is open it takes the right-hand column; close it with **✕** to get the Youth, Transfers, Training and Back buttons again.
   - **Career history** (double-click any player, in the list, on the pitch or in the Detail tab): his full card with a season-by-season table (one row per club, so a mid-season move shows both clubs) with apps, goals, assists and average rating, career totals, international caps and his awards.
   - **Skill changes:** when a player's skill goes up his number turns **green** (▲), when it drops **red** (▼). The colour stays for your next two matches.
   - **Tactics:** attacking intent 0–100 % and a play style (Normal / Passing / Crosses / Through-balls; the styles counter each other in a triangle).
   - **Lineups A/B/C:** save (↓), load (letter) or delete (x).
   - **Youth:** promote academy players to the first team, or release them.
4. **Match day:**
   - **Pre-match screen:** both teams side by side. The middle column compares the two captains, set-piece takers, teamwork and goalkeepers (left number: home team, right: away team; the better one is green). Under each pitch: average skill of the eleven, their market value and average age.
   - **Live 2D match:** passing moves, corners, free kicks with a wall, penalties, commentary, speed 1×/2×/4×, pause, and **Instant result**.
   - **Tactics & subs** is available at any time, and opens automatically at half-time and when one of your players is injured. Drag a substitute onto a player to bring him on.
5. **Transfers:**
   - **Windows:** summer (pre-season to 31 Aug) and January.
   - **Buying:** search with filters, bid, and handle counter-offers. Players don't drop down: a club's stature is its reputation plus the strength of its country's league, and the bigger the step down from his club and the better he is for yours, the less willing he is (a top Czech club can sign only about one in eight of the world's best players, a mid-table Czech club almost none). Players who want to leave and players of 32 and over bend more, and players going on loan (young ones most) a lot. The search marks players who won't come with **won't join**.
   - **Selling:** list players with **Sell…**. Each new offer, for a sale or a loan, pops up in the middle of the screen: **Sell** (or **Loan him**), **Reject**, or **Decide later** (it stays under Transfer Market → Selling until it runs out after a week). A club that really wants the player may come back a few days after a rejection with a better bid, 10–25 % higher, at most twice; the more he would improve their team, the more likely they are to come back.
   - **Contracts:** expiring contracts must be renewed, or the player leaves for free in the summer.
6. **Loans and B-team cooperation:**
   - **Loaning out:** use **Loan…** on a player's card in My Team. It offers up to three ways: send him to your **B-team partner** (if you have one), **choose a club now** from up to six clubs of his level that want him (each shows whether he would start, the loan fee and the share of his wage they pay; the list changes weekly), or put him on the **loan list** and wait for offers, which pop up like transfer offers. Loans are agreed only during a transfer window.
   - **Unprompted offers:** AI clubs also approach you on their own, with loan offers for young players who aren't playing and transfer offers for good players.
   - **Borrowing:** in the market, pick a player who isn't a regular starter at his club and use **Ask for loan**. You pay a loan fee and choose to cover 50/75/100 % of his wage; clubs want at least 75 % for older players.
   - **Loan rules:** loans run until the end of the season and the players then return. Borrowed players can't be sold or released. Playing time on loan counts for development.
   - **B-team partner** (Youth screen):
     - Choose a smaller club in your country, outside your league, as your partner.
     - Loans to the partner are free, the partner pays the wages and plays your youngsters regularly. A 16-year-old sent there typically plays about 30 matches and gains around +8 in a season.
     - Academy players can be sent there too; they come back to the academy afterwards.
7. **Scouting** (Transfer Market → Scouting):
   - Other clubs' **potential is hidden ("?")** until you scout a player. For your own players and academy you see your staff's **estimate**, a range such as "74-79" that contains the true potential (on the pitch and in lists the middle of it, such as "~76"). A better youth coach or assistant manager narrows it (8 points wide with neither, 3 at 5★), so you never know exactly when a player has reached his limit.
   - Click **Scout** on a player (market or player dialog). After some days you get a range such as "78–84" that contains his true potential.
   - Choose your **scouting staff level** (None / Basic / Good / Excellent). Better staff cost more per season but scout more players at once, report faster and give narrower ranges. Prices scale with the club, so a small club pays far less than a giant.
   - Reports expire after two seasons. The potential filter in the market works on scouted players only.
8. **Stadium** (My Team → Stadium, or Finances):
   - **Demand:** crowds depend on reputation, form, the opponent and the competition, not just on seats.
   - **Ground plan:** a ground has up to eight stands: the main stand and side stand along the touchlines, two ends behind the goals and four corners. Smaller grounds miss some (shown dashed). **Build a missing stand** (a corner needs both stands next to it); it is sized to match the rest of the ground.
   - **More seats:** enlarge all stands by +2,000, +5,000 or +10,000 seats. Building work is paid up front, takes a few months and only one project runs at a time. The table shows the extra ticket income at current demand.
   - **Pitch** (quality 1–10): wears by a point every season (two after a hard winter). A poor pitch blunts technical football for both teams and causes more injuries. Re-lay it to any better level; the top levels cost the most.
   - AI clubs with packed stadiums expand too, and re-lay worn pitches when they can afford it.
9. **Finances:** tickets (crowds depend on reputation, form and the opponent), TV & sponsors, prize money, player and staff wages, running costs, building work and transfers, shown season to date and for past seasons, plus your current deals.
   - **Season preparations** (before the first match of each season, and after taking over a club):
     - **Ticket prices:** Low, Normal or High for the season. Low fills more seats (a full house gives the home side a small lift), High earns more per fan but fewer come unless you sell out anyway. The screen estimates the crowd and the season's league ticket income for each.
     - **Main shirt sponsor** (when the old contract has run out): three companies offer a 1-, 3- or 5-season deal. The short deal pays the most per season; longer deals pay less but lock the money in (useful before a hard season) and come with a signing bonus. Offers follow your club's level when you sign.
10. **Continental Champions Cup:**
   - **Entry:** the top of each first division qualifies: England, Spain, Italy and Germany 3 each, France and the Czech Republic 2 each (by reputation in the first season).
   - **Group stage:** 4 groups of 4 in autumn, drawn from seeding pots, home and away on Tuesday nights.
   - **Knockouts in spring:** quarter-finals and semi-finals over **two legs** (group winners play the second leg at home), then a one-match final.
   - **Two-legged ties:** the aggregate score decides (no away-goals rule). If it's level after the second leg, extra time and penalties follow. The pre-match screen shows the first-leg score, the live match shows the aggregate, and the cup screen lists both legs.
   - The national cups' **semi-finals** are two-legged too; every other round and the final is one match.
   - **Rewards:** prize money per win and per round, bigger crowds, and a reputation boost for the winner.
   - See it from the hub (★ tile) or the Cup screen.
11. **National teams** (hub → National Teams):
    - **Competition:** a senior and an **Under-21** Nations Championship for all six nations, home and away. Ten matchdays on Thursdays across five international breaks, so they never clash with club matches.
    - **Call-ups:** before each break the best available players of each nationality are called up. The U21 squad takes the best players aged 21 or under who aren't in the senior squad, academy players included.
    - **Your called-up players:** you get news when they're called up, score or are injured. They come back tired, and they collect **caps and international goals** (shown in the player dialog).
    - **The screen:** tables, results (click for a report), top scorers, past champions, and every nation's squad with your players highlighted.
    - Champions are listed in the season review.
    - **Managing a national team** (alongside your club job):
      - **Getting the job:** federations look for a head coach when their team finishes last or their coach moves on, and two are looking when a career starts. They're listed under My Career → Jobs. Each wants a certain manager reputation: the strongest football nation the most, U21 teams much less. You can always apply. Federations only **approach** you themselves when you're out of work, or when your club is doing well (board delighted, 65+; or satisfied, 55+, after meeting last season's target; or a trophy last season).
      - **Squad:** on the National Team screen (hub → National Teams → Manage) pick up to 23 players from everyone eligible. The squad is called up for every break, and places you leave open (or injured picks) are filled automatically. Also set the formation, intent and style.
      - **Matches:** the calendar stops for your internationals like club matches: pre-match screen, live view, substitutions, or instant result. Squads get their own shirt numbers.
      - **Verdict:** win the Nations Championship and your reputation grows; finish last and the federation lets you go. You can step down at any time (**Resign** next to the team in My Career, or on the National Team screen).
    - **Records** (National Teams → Records): each national team's all-time top scorers, most caps, biggest win and heaviest defeat.
    - Every other national team is run by its own (AI) coach.
12. **Player attributes:**
    - **Skill** is the overall number. It is made of **TEC** (technique: passing, first touch, finishing) and **PHY** (physique: pace, strength, stamina). Keepers and defenders lean on PHY, midfielders on TEC.
    - **Height** (cm) matters in the air: crosses and corners become aerial duels, and taller, stronger players win more of them and score more headers. Tall keepers claim more crosses.
    - In matches, TEC counts most for passing and chance creation, PHY for defending, through-ball runs and keeping going late in the game. Players with high PHY recover energy faster.
    - **Potential** caps how high skill can grow. Other clubs' TEC and PHY are shown as scouted ranges, like potential.
13. **Training** (hub → Training, or My Team → Training):
    - **Coaching staff:** a fitness, a technical and a goalkeeping coach, rated 1–5 stars. Better coaches cost more but develop players faster (each star adds about 10 %). Coaches ask wages in line with the club: a staff as good as your rivals' costs about 8 % of a typical wage bill at any club. Without a coach, training is much less effective. Releasing a coach costs half of his remaining wage.
    - **Plans:** pick a focus (Balanced, Physical, Technical or Recovery) and an intensity (Light, Normal or Hard). Set them for the whole squad and per position group, and override them for single players in the players table.
    - **Trade-off:** harder training develops players faster, but it builds fatigue. Tired players have lower energy on match day, and sudden jumps in workload (the coloured dot) raise the injury risk. Players with high PHY handle hard training better. **Taper** eases training on the day before a match.
    - Typical season gain for a talented 18-year-old: Light about +3.5, Normal +5.5, Hard +7.
14. **Morale and personalities:**
    - Every player has a **personality**: Professional (trains better), Ambitious (wants to play, win and be paid), Loyal (rarely asks to leave, signs cheaper), Temperamental (big mood swings, more cards) or Easy-going (doesn't mind the bench, develops a bit slower). Other clubs' personalities show once you scout them.
    - Your players' **morale** (0–100: Unhappy, Unsettled, Content, Happy, Delighted) depends on playing time compared with their place in the squad, results, their wage, the club's ambition and the captaincy, and on your decisions (new contracts, listing them, promises).
    - **Effects:** up to about ±5 % match ability and ±15 % development speed. Unhappy players refuse new contracts, and after about three weeks of being unhappy they **ask to leave**; rival clubs then bid more often.
    - **Talking:** click Morale on the player card to see what's on his mind. **Encourage** him (once a month), **promise playing time** (he expects 4 starts in the next 8 matches; a broken promise is much worse than none), put him up for sale, or refuse his request.
    - Unhappy players get a coloured dot in the squad list, and players who want to leave get a red **!**. The Detail tab has Morale and Personality columns.
15. **Staff** (Training screen): besides the three coaches, a **physio** (injuries last 20 % less at 5★ and 35 % longer without one; faster recovery), a **youth coach** (runs the academy's training; each star above your club's usual level adds about 2.5 to the potential of the yearly youth intake) and an **assistant manager**.
    - **Assistant** (My Team → Assistant) gives advice before matches. What he notices depends on his stars: 1★ unavailable, out-of-position and tired players; 2★ fresher or better players left out; 3★ unhappy players and workload spikes; 4★ the next opponent (tall forwards, pace, their key player); 5★ a play style and attacking intent for the match. A good assistant also softens morale drops.
16. **Your career** (hub → My Career):
    - **Board confidence** (0–100, also shown on the hub's club card) depends on recent results against what a club of your standing should get, your league position against the season's target (it counts more as the season goes on), trust earned in earlier seasons, and debt. Debt you inherited when you took over only counts if it grows; the board expects it halved each season. A new manager gets some time. Targets come from the club's reputation rank in its league and are set so that an average manager meets them roughly two seasons in three (the two favourites are asked to challenge for the title, meaning a top-three finish). My Career lists the reasons.
    - **Getting sacked:** below 30 the board issues an ultimatum. If confidence then drops below 20 (after at least 8 league matches) you are sacked. At the end of the season the board judges the whole season. You can also be sacked for a very poor finish, or for relegation when relegation wasn't expected.
    - **Reputation:** grows with finishes above the target, trophies, promotions and managing bigger clubs. It shrinks with failures, relegations and sackings. It decides which clubs want you.
    - **Jobs:** AI clubs that do badly sack their managers. The board can act at any point of the season: after any league match once a club is well below its target, and again in the summer. Your own board also checks after every match and at its monthly look at the finances. Vacancies appear under Jobs, where you can **apply**; whether they say yes depends on your reputation against theirs. Clubs of your level may also make **offers**, which last two weeks.
    - **Asking the board for money** (Board panel → Ask for money, once a season): for transfers or for the stadium (new stands, more seats, the pitch), in three sizes. The board says yes, no, or yes **if you promise a better finish** than the target (the bigger the request, the bigger the promise). A promise becomes your target for the season, and missing it gets you sacked at the end of the season. Stadium money is kept in a stadium fund and can only be spent there.
    - **Moving on:** taking a job hands your old club to the AI. Its academy joins its first team, and your staff, training plans and players' moods stay behind. You keep your scouting reports. At the new club you start with fresh staff at its usual level and a new academy intake. You can also **resign** (the Resign button on the Board panel).
    - **Out of work:** after a sacking or resignation you always get at least three offers from clubs a little below your level. Pick one to carry on.
    - **Records:** My Career shows the season-by-season record (target met or missed) and every club you've managed, with matches, wins and how you left.
17. **Clickable names:** club names and crests open that club's page (Other Teams) almost everywhere: fixtures, results, league tables, cups, the schedule, the transfer ticker and market, news items, match reports, search, the season review, national squads and job offers. Player names in the ticker, match reports, awards and records open the player's card. Names are not clickable during a live match or on the tactics screen, so a stray tap never leaves the match.
18. **Real club history** (Other Teams → History): each club's real-world story up to the 2024/25 season: founded, nickname, league and cup titles, European trophies, a short history and its best achievements, next to what it has won in your career. The data is in `data/history/<country>.json` (plain text, one file per country); entries the research could not confirm are marked `"uncertain": true` with a note, so you can check and correct them.
19. **Club history and records** (Other Teams → pick any club, including your own → Seasons / Records; or My Career → "Club history & records"): season-by-season finishes, and records kept from the first season of your career: all-time top scorers (the club's best historic strikers), most appearances, most goals in one season, biggest wins in the league, the cup and the Champions Cup, heaviest defeat and record crowd. Players who leave or retire stay in the records; current players are marked with a green dot.
20. **World awards** (League Tables → Ballon d'Or, and the season review):
    - **Ballon d'Or:** the season's best player across all leagues, from his form (average rating), goals and assists (worth more for defenders and midfielders), the level of his league, and the trophies he won (title, Champions Cup, cup, Nations Championship). Top three listed.
    - **Golden Shoe:** most league goals across all leagues, counted ×2 in the big five top flights, ×1.5 in the Czech top flight and ×1 in second divisions. The live race is shown during the season.
    - Awards (and league awards: top scorer, player and young player of the season) appear on the player's card.
21. **End of season:**
   - **Season review:** world awards, league awards, champions, promotion and relegation (3 up, 3 down), your youth intake and retirements.
   - **Development:** players develop through daily training and matches. Young players who play regularly improve fastest. From age 30 physique declines first, technique later.

## Saving
- **Save** (top bar) stores the career in the browser's IndexedDB, and the game also saves automatically after matches and at season end. **Continue career** on the title screen loads it.
- **Export** downloads the career as a `.json` file, and **Import** loads one. Use this for backups or to move a career to another browser; clearing the browser's site data deletes the in-browser save.
- Save files are versioned, and older saves are upgraded automatically.

## Tests
With the server running, open http://localhost:8765/tests.html. The page title shows `PASS n/n` or `FAIL …`; the current suite has 119 tests. They cover:
- **World generation:** world, fixtures, cup draws.
- **Lineup rules.**
- **Live-match mechanics.**
- **Transfers and finances.**
- **News.**
- **Saving.**
- **Match engine calibration:** 4,000 matches give about 2.8 goals per game, home/draw/away about 43/23/34 %, and a clearly stronger side wins about 67 % of the time.
- **Attributes and training:** heights per position, development by intensity, focus and coach quality, recovery by PHY, workload risk, aerial duels (crossing teams with 1.97 m forwards score about 1.8× more headers than with 1.68 m ones).
- **Morale and staff:** a dropped ambitious starter becomes unhappy and asks to leave while regulars stay content; kept promises beat broken ones; a happy squad does better than an unhappy one; temperamental players collect about 1.7× the cards; a 5★ physio cuts injury time by about 40 % compared with none; a 5★ youth coach raises the intake's average potential by about 13 compared with none; the assistant's advice grows with his stars; a normal season with auto pick averages morale around 68 with no transfer requests.
- **Board and career:** a new manager starts with the board's patience. A normal season with auto lineups keeps the manager in his job. A wrecked title favourite gets an ultimatum and then the sack, followed by at least three offers. Taking a new job hands the old club to the AI cleanly, and the season and save carry on. Applications depend on reputation. Older saves are upgraded.
- **Two-legged ties:** second legs are played at the other ground a week or two later, aggregates add up, level ties go to extra time and penalties, first legs never decide anything, the final stays one match, and no club ever has two matches on one day.
- **National team job:** federations want managers of their level (U21 jobs are easier). As head coach your squad picks are called up, your formation is played, the calendar stops for your internationals, and the season ends with the federation's verdict. Older saves are upgraded.
- **Club and season decisions:** small grounds miss stands and corners need their neighbours; a new stand and the stadium fund; pitch costs, wear and match effects; ticket prices move price and demand; sponsor offers (short pays more, long has a bonus) are paid and saved; asking the board works once a season and a broken promise means the sack.
- **Real teams:** a real-teams file renames clubs, replaces squads with its players in rating order, keeps the leagues' balance, adds players-only nations without national teams, reports unusable clubs, and a career with it plays a season and saves.
- **History and records:** skill-change marks last two matches; a mid-season transfer splits a player's season into two rows; departed players stay in club records; biggest wins, record crowd, national team scorers and caps; the Ballon d'Or and Golden Shoe podiums; federations only approach a manager who is doing well or out of work; old saves are upgraded.
- **A full season.**
- **A 20-season career run:** league sizes, squads, ages and league strength stay stable, the countries keep their character, club money stays healthy, the run takes about 25–45 s depending on the machine, and the save is about 9 MB (of which about 1.5 MB is history and records).

**Developer shortcut:** `http://localhost:8765/?dev=1` starts a throwaway career (seed `dev`) that is never saved. Add `&screen=myteam` (or `market`, `tables`, `otherteams`, …) to open a screen directly.

## Project layout
```
index.html, css/theme.css     app shell and theme (1280×720 stage, scaled to the window)
src/core/                     game logic: no DOM access, testable
  rng.js          seeded random numbers (state stored in the save)
  data.js         nations, formations, kit colours, save version
  realworld.js    the countries, leagues and clubs (names, colours, stadiums)
  names.js        player and manager names per country (plus the old fictional styles)
  renames.js      names.json and in-game renames
  worldgen.js     world, clubs and squads; board targets
  calendar.js     dates, fixtures, cup draws
  season.js       season setup, tables, news helper
  engine.js       minute-by-minute match engine (step-able; set pieces, cards, injuries, subs)
  matchday.js     daily calendar, applying results, cup rounds, monthly hooks
  lineup.js       lineup editing, formations, repairs, saved lineups, teamwork
  ai.js           position fit and AI lineup selection
  attributes.js   TEC/PHY split, height, aerial ability
  training.js     staff (coaches, physio, youth coach, assistant), training plans, daily fatigue/workload/development
  morale.js       personalities, morale and its reasons, transfer requests, promises
  board.js        board confidence, sackings, manager reputation, vacancies, job offers, changing clubs, AI managers
  assistant.js    the assistant manager's pre-match advice
  development.js  youth academy, retirements, AI squads
  seasonend.js    end of season: history, awards, prizes, promotion/relegation, contracts, new season
  transfers.js    windows, prices, offers, AI deals, contracts, market search
  finance.js      gate receipts, TV & sponsors, wages, running costs, prizes
  newsfeed.js     extra news: previews, big results, hat-tricks, leaders, big transfers, board verdicts
  continental.js  Continental Champions Cup: qualification, group draw, groups, knockouts, history
  stadium.js      crowd demand, stadium expansion (user and AI)
  scouting.js     hidden potential, scouting staff levels, assignments and reports
  loans.js        loans in both directions, AI loan offers, B-team partner club
  national.js     national teams (senior and U21): call-ups, Nations Championship, caps
  nationaljob.js  managing a national team: federation vacancies, applications, the season verdict
  records.js      player season rows per club, club and national team records, Ballon d'Or and Golden Shoe
  ratings.js      team numbers (quality, value, age)
  valuation.js    player value and wages
  save.js         save format and migrations
src/ui/                       screens and components (SVG jerseys, crests, flags, icons, pitch, match animation)
src/tests/                    tests run by tests.html
names.json                    your own names (see above)
desktop/launcher.py           the desktop app (local server + its own window); desktop/build_exe.bat builds app/TouchlineManager.exe
```

## Possible next steps
Everything on the original "later" list is now in, and v2.0 added the real-country world with named AI managers. See `PLAN.md` for the history.
