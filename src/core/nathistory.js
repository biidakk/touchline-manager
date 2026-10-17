// National team history: the real record up to the start of the game (World
// Cup, Euro and Nations League titles, best results, the all-time top
// scorers; data in NAT_HISTORY) joined with what happens in the career.

import { NAT_IDS, TOURN_IDS } from './national.js';

// The real record up to October 2026, after the 2026 World Cup (won by Spain).
// Titles count predecessor states as FIFA and UEFA do (West Germany,
// Czechoslovakia, Yugoslavia); scorers are the top five with goals and caps.
export const NAT_HISTORY = {
  ENG: {"worldCup": {"won": [1966], "best": null, "apps": 17}, "euro": {"won": [], "best": "Runners-up 2020, 2024", "apps": 11}, "nationsLeague": [], "scorers": [{"name": "Harry Kane", "goals": 91, "caps": 125, "active": true}, {"name": "Wayne Rooney", "goals": 53, "caps": 120, "active": false}, {"name": "Bobby Charlton", "goals": 49, "caps": 106, "active": false}, {"name": "Gary Lineker", "goals": 48, "caps": 80, "active": false}, {"name": "Jimmy Greaves", "goals": 44, "caps": 57, "active": false}]},
  ESP: {"worldCup": {"won": [2010, 2026], "best": null, "apps": 17}, "euro": {"won": [1964, 2008, 2012, 2024], "best": null, "apps": 12}, "nationsLeague": [2023], "scorers": [{"name": "David Villa", "goals": 59, "caps": 98, "active": false}, {"name": "Raúl González", "goals": 44, "caps": 102, "active": false}, {"name": "Fernando Torres", "goals": 38, "caps": 110, "active": false}, {"name": "Álvaro Morata", "goals": 37, "caps": 87, "active": false}, {"name": "David Silva", "goals": 35, "caps": 125, "active": false}]},
  ITA: {"worldCup": {"won": [1934, 1938, 1982, 2006], "best": null, "apps": 18}, "euro": {"won": [1968, 2020], "best": null, "apps": 11}, "nationsLeague": [], "scorers": [{"name": "Gigi Riva", "goals": 35, "caps": 42, "active": false}, {"name": "Giuseppe Meazza", "goals": 33, "caps": 53, "active": false}, {"name": "Silvio Piola", "goals": 30, "caps": 34, "active": false}, {"name": "Roberto Baggio", "goals": 27, "caps": 56, "active": false}, {"name": "Alessandro Del Piero", "goals": 27, "caps": 91, "active": false}]},
  GER: {"worldCup": {"won": [1954, 1974, 1990, 2014], "best": null, "apps": 21}, "euro": {"won": [1972, 1980, 1996], "best": null, "apps": 14, "wonNote": "1972 and 1980 as West Germany"}, "nationsLeague": [], "scorers": [{"name": "Miroslav Klose", "goals": 71, "caps": 137, "active": false}, {"name": "Gerd Müller", "goals": 68, "caps": 62, "active": false}, {"name": "Lukas Podolski", "goals": 49, "caps": 130, "active": false}, {"name": "Rudi Völler", "goals": 47, "caps": 90, "active": false}, {"name": "Jürgen Klinsmann", "goals": 47, "caps": 108, "active": false}]},
  FRA: {"worldCup": {"won": [1998, 2018], "best": null, "apps": 17}, "euro": {"won": [1984, 2000], "best": null, "apps": 11}, "nationsLeague": [2021], "scorers": [{"name": "Kylian Mbappé", "goals": 67, "caps": 107, "active": true}, {"name": "Olivier Giroud", "goals": 57, "caps": 137, "active": false}, {"name": "Thierry Henry", "goals": 51, "caps": 123, "active": false}, {"name": "Antoine Griezmann", "goals": 44, "caps": 137, "active": false}, {"name": "Michel Platini", "goals": 41, "caps": 72, "active": false}]},
  CZE: {"worldCup": {"won": [], "best": "Runners-up 1934, 1962 (as Czechoslovakia)", "apps": 10}, "euro": {"won": [1976], "best": null, "apps": 11, "wonNote": "as Czechoslovakia"}, "nationsLeague": [], "scorers": [{"name": "Jan Koller", "goals": 55, "caps": 91, "active": false}, {"name": "Milan Baroš", "goals": 41, "caps": 93, "active": false}, {"name": "Vladimír Šmicer", "goals": 27, "caps": 81, "active": false}, {"name": "Patrik Schick", "goals": 26, "caps": 56, "active": false}, {"name": "Tomáš Rosický", "goals": 23, "caps": 105, "active": false}]},
  POR: {"worldCup": {"won": [], "best": "Third place 1966", "apps": 9}, "euro": {"won": [2016], "best": null, "apps": 9}, "nationsLeague": [2019, 2025], "scorers": [{"name": "Cristiano Ronaldo", "goals": 146, "caps": 234, "active": true}, {"name": "Pauleta", "goals": 47, "caps": 88, "active": false}, {"name": "Eusébio", "goals": 41, "caps": 64, "active": false}, {"name": "Luís Figo", "goals": 32, "caps": 127, "active": false}, {"name": "Nuno Gomes", "goals": 29, "caps": 79, "active": false}]},
  NED: {"worldCup": {"won": [], "best": "Runners-up 1974, 1978, 2010", "apps": 12}, "euro": {"won": [1988], "best": null, "apps": 11}, "nationsLeague": [], "scorers": [{"name": "Memphis Depay", "goals": 55, "caps": 112, "active": true}, {"name": "Robin van Persie", "goals": 50, "caps": 102, "active": false}, {"name": "Klaas-Jan Huntelaar", "goals": 42, "caps": 76, "active": false}, {"name": "Patrick Kluivert", "goals": 40, "caps": 79, "active": false}, {"name": "Dennis Bergkamp", "goals": 37, "caps": 79, "active": false}]},
  BEL: {"worldCup": {"won": [], "best": "Third place 2018", "apps": 15}, "euro": {"won": [], "best": "Runners-up 1980", "apps": 7}, "nationsLeague": [], "scorers": [{"name": "Romelu Lukaku", "goals": 94, "caps": 135, "active": true}, {"name": "Kevin De Bruyne", "goals": 40, "caps": 127, "active": true}, {"name": "Eden Hazard", "goals": 33, "caps": 126, "active": false}, {"name": "Bernard Voorhoof", "goals": 30, "caps": 61, "active": false}, {"name": "Paul Van Himst", "goals": 30, "caps": 81, "active": false}]},
  TUR: {"worldCup": {"won": [], "best": "Third place 2002", "apps": 3}, "euro": {"won": [], "best": "Semi-finals 2008", "apps": 6}, "nationsLeague": [], "scorers": [{"name": "Hakan Şükür", "goals": 51, "caps": 112, "active": false}, {"name": "Burak Yılmaz", "goals": 31, "caps": 77, "active": false}, {"name": "Tuncay Şanlı", "goals": 22, "caps": 80, "active": false}, {"name": "Hakan Çalhanoğlu", "goals": 22, "caps": 108, "active": true}, {"name": "Lefter Küçükandonyadis", "goals": 21, "caps": 46, "active": false}]},
  GRE: {"worldCup": {"won": [], "best": "Round of 16 2014", "apps": 3}, "euro": {"won": [2004], "best": null, "apps": 4}, "nationsLeague": [], "scorers": [{"name": "Nikos Anastopoulos", "goals": 29, "caps": 74, "active": false}, {"name": "Angelos Charisteas", "goals": 25, "caps": 88, "active": false}, {"name": "Fanis Gekas", "goals": 24, "caps": 78, "active": false}, {"name": "Dimitris Saravakos", "goals": 22, "caps": 78, "active": false}, {"name": "Mimis Papaioannou", "goals": 21, "caps": 61, "active": false}]},
  POL: {"worldCup": {"won": [], "best": "Third place 1974, 1982", "apps": 9}, "euro": {"won": [], "best": "Quarter-finals 2016", "apps": 5}, "nationsLeague": [], "scorers": [{"name": "Robert Lewandowski", "goals": 92, "caps": 170, "active": true}, {"name": "Włodzimierz Lubański", "goals": 48, "caps": 75, "active": false}, {"name": "Grzegorz Lato", "goals": 45, "caps": 100, "active": false}, {"name": "Kazimierz Deyna", "goals": 41, "caps": 97, "active": false}, {"name": "Ernest Pol", "goals": 39, "caps": 46, "active": false}]},
  DEN: {"worldCup": {"won": [], "best": "Quarter-finals 1998", "apps": 6}, "euro": {"won": [1992], "best": null, "apps": 10}, "nationsLeague": [], "scorers": [{"name": "Poul Nielsen", "goals": 52, "caps": 38, "active": false}, {"name": "Jon Dahl Tomasson", "goals": 52, "caps": 112, "active": false}, {"name": "Christian Eriksen", "goals": 46, "caps": 151, "active": true}, {"name": "Pauli Jørgensen", "goals": 44, "caps": 47, "active": false}, {"name": "Ole Madsen", "goals": 42, "caps": 50, "active": false}]},
  NOR: {"worldCup": {"won": [], "best": "Quarter-finals 2026", "apps": 4}, "euro": {"won": [], "best": "Group stage 2000", "apps": 1}, "nationsLeague": [], "scorers": [{"name": "Erling Haaland", "goals": 65, "caps": 59, "active": true}, {"name": "Jørgen Juve", "goals": 33, "caps": 45, "active": false}, {"name": "Einar Gundersen", "goals": 26, "caps": 33, "active": false}, {"name": "Alexander Sørloth", "goals": 26, "caps": 77, "active": true}, {"name": "Harald Hennum", "goals": 25, "caps": 43, "active": false}]},
  CYP: {"worldCup": {"won": [], "best": "Never qualified", "apps": 0}, "euro": {"won": [], "best": "Never qualified", "apps": 0}, "nationsLeague": [], "scorers": [{"name": "Michalis Konstantinou", "goals": 32, "caps": 86, "active": false}, {"name": "Ioannis Okkas", "goals": 27, "caps": 103, "active": false}, {"name": "Pieros Sotiriou", "goals": 12, "caps": 67, "active": false}, {"name": "Constantinos Charalambidis", "goals": 12, "caps": 93, "active": false}, {"name": "Ioannis Pittas", "goals": 11, "caps": 62, "active": true}]},
  SUI: {"worldCup": {"won": [], "best": "Quarter-finals 1934, 1938, 1954, 2026", "apps": 13}, "euro": {"won": [], "best": "Quarter-finals 2020, 2024", "apps": 6}, "nationsLeague": [], "scorers": [{"name": "Alexander Frei", "goals": 42, "caps": 84, "active": false}, {"name": "Kubilay Türkyilmaz", "goals": 34, "caps": 64, "active": false}, {"name": "Max Abegglen", "goals": 34, "caps": 68, "active": false}, {"name": "Xherdan Shaqiri", "goals": 32, "caps": 125, "active": false}, {"name": "André Abegglen", "goals": 29, "caps": 52, "active": false}]},
  AUT: {"worldCup": {"won": [], "best": "Third place 1954", "apps": 8}, "euro": {"won": [], "best": "Round of 16 2020, 2024", "apps": 4}, "nationsLeague": [], "scorers": [{"name": "Marko Arnautović", "goals": 49, "caps": 137, "active": false}, {"name": "Toni Polster", "goals": 44, "caps": 95, "active": false}, {"name": "Hans Krankl", "goals": 34, "caps": 69, "active": false}, {"name": "Johann Horvath", "goals": 29, "caps": 46, "active": false}, {"name": "Erich Hof", "goals": 28, "caps": 37, "active": false}]},
  SCO: {"worldCup": {"won": [], "best": "Group stage", "apps": 9}, "euro": {"won": [], "best": "Group stage", "apps": 4}, "nationsLeague": [], "scorers": [{"name": "Denis Law", "goals": 30, "caps": 55, "active": false}, {"name": "Kenny Dalglish", "goals": 30, "caps": 102, "active": false}, {"name": "Hughie Gallacher", "goals": 24, "caps": 20, "active": false}, {"name": "Lawrie Reilly", "goals": 22, "caps": 38, "active": false}, {"name": "John McGinn", "goals": 22, "caps": 93, "active": true}]},
  SWE: {"worldCup": {"won": [], "best": "Runners-up 1958", "apps": 13}, "euro": {"won": [], "best": "Semi-finals 1992", "apps": 7}, "nationsLeague": [], "scorers": [{"name": "Zlatan Ibrahimović", "goals": 62, "caps": 122, "active": false}, {"name": "Sven Rydell", "goals": 49, "caps": 43, "active": false}, {"name": "Gunnar Nordahl", "goals": 43, "caps": 33, "active": false}, {"name": "Henrik Larsson", "goals": 37, "caps": 106, "active": false}, {"name": "Gunnar Gren", "goals": 32, "caps": 57, "active": false}]},
  CRO: {"worldCup": {"won": [], "best": "Runners-up 2018", "apps": 7}, "euro": {"won": [], "best": "Quarter-finals 1996, 2008", "apps": 7}, "nationsLeague": [], "scorers": [{"name": "Davor Šuker", "goals": 45, "caps": 68, "active": false}, {"name": "Ivan Perišić", "goals": 40, "caps": 162, "active": true}, {"name": "Andrej Kramarić", "goals": 36, "caps": 119, "active": true}, {"name": "Mario Mandžukić", "goals": 33, "caps": 89, "active": false}, {"name": "Luka Modrić", "goals": 30, "caps": 206, "active": true}]},
  ISR: {"worldCup": {"won": [], "best": "Group stage 1970", "apps": 1}, "euro": {"won": [], "best": "Never qualified", "apps": 0}, "nationsLeague": [], "scorers": [{"name": "Eran Zahavi", "goals": 35, "caps": 74, "active": false}, {"name": "Mordechai Spiegler", "goals": 24, "caps": 57, "active": false}, {"name": "Ronen Harazi", "goals": 23, "caps": 52, "active": false}, {"name": "Yossi Benayoun", "goals": 23, "caps": 101, "active": false}, {"name": "Nahum Stelmach", "goals": 19, "caps": 45, "active": false}]},
  HUN: {"worldCup": {"won": [], "best": "Runners-up 1938, 1954", "apps": 9}, "euro": {"won": [], "best": "Third place 1964", "apps": 5}, "nationsLeague": [], "scorers": [{"name": "Ferenc Puskás", "goals": 84, "caps": 85, "active": false}, {"name": "Sándor Kocsis", "goals": 75, "caps": 68, "active": false}, {"name": "Imre Schlosser", "goals": 59, "caps": 68, "active": false}, {"name": "Lajos Tichy", "goals": 51, "caps": 72, "active": false}, {"name": "György Sárosi", "goals": 42, "caps": 62, "active": false}]},
  UKR: {"worldCup": {"won": [], "best": "Quarter-finals 2006", "apps": 1}, "euro": {"won": [], "best": "Quarter-finals 2020", "apps": 4}, "nationsLeague": [], "scorers": [{"name": "Andriy Shevchenko", "goals": 48, "caps": 111, "active": false}, {"name": "Andriy Yarmolenko", "goals": 47, "caps": 127, "active": true}, {"name": "Yevhen Konoplyanka", "goals": 21, "caps": 87, "active": false}, {"name": "Roman Yaremchuk", "goals": 19, "caps": 72, "active": true}, {"name": "Serhiy Rebrov", "goals": 15, "caps": 75, "active": false}]},
  SRB: {"worldCup": {"won": [], "best": "Fourth place 1930, 1962 (as Yugoslavia)", "apps": 13}, "euro": {"won": [], "best": "Runners-up 1960, 1968 (as Yugoslavia)", "apps": 6}, "nationsLeague": [], "scorers": [{"name": "Aleksandar Mitrović", "goals": 64, "caps": 106, "active": true}, {"name": "Stjepan Bobek", "goals": 38, "caps": 63, "active": false}, {"name": "Milan Galić", "goals": 37, "caps": 51, "active": false}, {"name": "Blagoje Marjanović", "goals": 37, "caps": 58, "active": false}, {"name": "Savo Milošević", "goals": 37, "caps": 102, "active": false}]},
  ROU: {"worldCup": {"won": [], "best": "Quarter-finals 1994", "apps": 7}, "euro": {"won": [], "best": "Quarter-finals 2000", "apps": 6}, "nationsLeague": [], "scorers": [{"name": "Adrian Mutu", "goals": 35, "caps": 77, "active": false}, {"name": "Gheorghe Hagi", "goals": 35, "caps": 124, "active": false}, {"name": "Iuliu Bodola", "goals": 31, "caps": 48, "active": false}, {"name": "Viorel Moldovan", "goals": 25, "caps": 70, "active": false}, {"name": "Ciprian Marica", "goals": 25, "caps": 72, "active": false}]},
};

// Titles and best results, the career's finals and Nations Leagues included.
export function honours(game, team) {
  const real = NAT_HISTORY[team.nationId] || {};
  const euro = game.competitions[TOURN_IDS.senior];
  const euro21 = game.competitions[TOURN_IDS.u21];
  const nl = game.competitions[NAT_IDS.senior];
  const u21Id = `${team.id}-21`;
  const won = (list, id) => list.filter((h) => h.championId === id).map((h) => h.year);
  const second = (list, id) => list.filter((h) => h.runnerUpId === id).map((h) => h.year);
  return {
    worldCup: { won: real.worldCup?.won || [], best: real.worldCup?.best || null, apps: real.worldCup?.apps ?? null },
    euro: {
      won: real.euro?.won || [], note: real.euro?.wonNote || '', best: real.euro?.best || null, apps: real.euro?.apps ?? null,
      career: won(euro.history, team.id), careerFinals: second(euro.history, team.id),
    },
    nationsLeague: {
      won: real.nationsLeague || [],
      career: nl.history.filter((h) => h.championId === team.id && h.format !== 'qual').map((h) => h.year + 1),
    },
    u21: won(euro21.history, u21Id),
  };
}

// All-time top scorers: the real list, plus every goal scored in the career
// (players who are in both lists are added up).
export function allTimeScorers(game, team, n = 10) {
  const rows = new Map();
  for (const s of NAT_HISTORY[team.nationId]?.scorers || []) rows.set(s.name, { ...s, before: true });
  const add = (name, goals, caps, id) => {
    if (!goals) return;
    const r = rows.get(name);
    if (r) { r.goals += goals; r.caps += caps; r.id = id; r.active = !!game.players[id]; }
    else rows.set(name, { name, goals, caps, id, active: !!game.players[id] });
  };
  const book = team.allTime || {};
  for (const [id, e] of Object.entries(book)) add(e.name, e.goals, e.caps, id);
  // Saves from before the all-time list: the players' own international goals.
  for (const p of Object.values(game.players)) {
    if (p.nationId !== team.nationId || !p.intl?.goals || book[p.id]) continue;
    add(`${p.first} ${p.last}`, p.intl.goals, p.intl.caps, p.id);
  }
  return [...rows.values()].sort((a, b) => b.goals - a.goals || a.caps - b.caps).slice(0, n);
}
