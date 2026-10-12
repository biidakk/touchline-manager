// Guest clubs: clubs from countries without a league in the game. They play
// only in the three European competitions. Names follow the style of the
// other clubs (real cities, close to but not the real names).
//
// Nation rows: id, name, adjective, name style, strength (as the real
// countries), flag. Club rows: [name, short, nation, level, primary colour,
// secondary colour, kit pattern, stadium, capacity]. `level` is the squad's
// average skill; the club's reputation is derived from it.

export const GUEST_COMP_ID = 'GUEST';

const N = (id, name, adj, style, strength, layout, colors, emblem) => ({ id, name, adj, style, strength, flag: { layout, colors, ...(emblem ? { emblem } : {}) } });

export const GUEST_NATIONS = [
  N('POR', 'Portugal', 'Portuguese', 'portuguese', -1, 'vtri', ['#046a38', '#da291c', '#da291c'], '#ffe900'),
  N('NED', 'Netherlands', 'Dutch', 'dutch', -2, 'htri', ['#ae1c28', '#ffffff', '#21468b']),
  N('BEL', 'Belgium', 'Belgian', 'dutch', -3, 'vtri', ['#000000', '#fdda24', '#ef3340']),
  N('TUR', 'Turkey', 'Turkish', 'turkish', -3, 'hband', ['#e30a17', '#e30a17'], '#ffffff'),
  N('SCO', 'Scotland', 'Scottish', 'english', -5, 'cross', ['#005eb8', '#ffffff']),
  N('AUT', 'Austria', 'Austrian', 'german', -5, 'htri', ['#ed2939', '#ffffff', '#ed2939']),
  N('SUI', 'Switzerland', 'Swiss', 'german', -5, 'cross', ['#d52b1e', '#ffffff']),
  N('GRE', 'Greece', 'Greek', 'greek', -5, 'htri', ['#0d5eaf', '#ffffff', '#0d5eaf']),
  N('CRO', 'Croatia', 'Croatian', 'balkan', -6, 'htri', ['#ff0000', '#ffffff', '#171796']),
  N('SRB', 'Serbia', 'Serbian', 'balkan', -6, 'htri', ['#c6363c', '#0c4076', '#ffffff']),
  N('UKR', 'Ukraine', 'Ukrainian', 'eastern', -6, 'hbi', ['#0057b7', '#ffd700']),
  N('DEN', 'Denmark', 'Danish', 'scandi', -5, 'nordic', ['#c8102e', '#ffffff', '#ffffff']),
  N('NOR', 'Norway', 'Norwegian', 'scandi', -6, 'nordic', ['#ba0c2f', '#ffffff', '#00205b']),
  N('SWE', 'Sweden', 'Swedish', 'scandi', -7, 'nordic', ['#006aa7', '#fecc00', '#fecc00']),
  N('FIN', 'Finland', 'Finnish', 'scandi', -9, 'nordic', ['#ffffff', '#002f6c', '#002f6c']),
  N('POL', 'Poland', 'Polish', 'eastern', -6, 'hbi', ['#ffffff', '#dc143c']),
  N('CYP', 'Cyprus', 'Cypriot', 'greek', -7, 'hband', ['#ffffff', '#ffffff'], '#d57800'),
  N('ISR', 'Israel', 'Israeli', 'eastern', -7, 'hband', ['#ffffff', '#ffffff'], '#0038b8'),
  N('SVK', 'Slovakia', 'Slovak', 'czech', -7, 'htri', ['#ffffff', '#0b4ea2', '#ee1c25']),
  N('AZE', 'Azerbaijan', 'Azerbaijani', 'turkish', -8, 'htri', ['#00b5e2', '#ef3340', '#509e2f']),
  N('HUN', 'Hungary', 'Hungarian', 'eastern', -7, 'htri', ['#ce2939', '#ffffff', '#477050']),
  N('SVN', 'Slovenia', 'Slovenian', 'balkan', -8, 'htri', ['#ffffff', '#005da4', '#ed1c24']),
  N('BUL', 'Bulgaria', 'Bulgarian', 'balkan', -8, 'htri', ['#ffffff', '#00966e', '#d62612']),
  N('ROU', 'Romania', 'Romanian', 'eastern', -7, 'vtri', ['#002b7f', '#fcd116', '#ce1126']),
  N('ARM', 'Armenia', 'Armenian', 'eastern', -9, 'htri', ['#d90012', '#0033a0', '#f2a800']),
  N('GIB', 'Gibraltar', 'Gibraltarian', 'english', -12, 'hbi', ['#ffffff', '#da000c']),
  N('BIH', 'Bosnia and Herzegovina', 'Bosnian', 'balkan', -9, 'hband', ['#002395', '#002395'], '#fecb00'),
  N('KAZ', 'Kazakhstan', 'Kazakh', 'eastern', -9, 'hband', ['#00afca', '#00afca'], '#fec50c'),
  N('LVA', 'Latvia', 'Latvian', 'eastern', -10, 'esp', ['#9e3039', '#ffffff']),
  N('AND', 'Andorra', 'Andorran', 'spanish', -12, 'vtri', ['#10069f', '#fedf00', '#d50032']),
  N('LTU', 'Lithuania', 'Lithuanian', 'eastern', -10, 'htri', ['#fdb913', '#006a44', '#c1272d']),
  N('GEO', 'Georgia', 'Georgian', 'eastern', -9, 'cross', ['#ffffff', '#ff0000']),
  N('ALB', 'Albania', 'Albanian', 'balkan', -10, 'hband', ['#e41e20', '#e41e20'], '#000000'),
];

const W = '#f4f4f4';
const K = '#1b1b1b';
const R = '#c8102e';
const B = '#1f4fbf';
const NAVY = '#13254f';
const G = '#1b8a3a';
const Y = '#f5c400';
const SKY = '#6cb4ee';
const CLARET = '#7b1e2b';
const PURPLE = '#5b2a86';
const ORANGE = '#f28c28';

export const GUEST_CLUBS = [
  // Portugal
  ['Lisboa Águias', 'Águias', 'POR', 73, R, W, 'plain', 'Estádio da Luz Nova', 64600],
  ['Lisboa Leões', 'Leões', 'POR', 74, G, W, 'hoops', 'Estádio de Alvalade', 50100],
  ['Porto Dragões', 'Dragões', 'POR', 73, B, W, 'stripes', 'Estádio do Dragão Azul', 50000],
  ['Braga Arsenalistas', 'Braga', 'POR', 69, R, W, 'sleeves', 'Estádio da Pedreira', 30200],
  ['Guimarães Vitória', 'Guimarães', 'POR', 64, W, K, 'plain', 'Estádio Afonso Henriques', 30000],
  ['Torres Vedras SC', 'Torres Vedras', 'POR', 58, R, NAVY, 'plain', 'Estádio Manuel Marques', 2900],
  // Netherlands
  ['Eindhoven Boeren', 'Eindhoven', 'NED', 72, R, W, 'stripes', 'Philips Park', 35000],
  ['Rotterdam Zuid', 'Rotterdam', 'NED', 71, R, W, 'halves', 'Stadion De Kuip', 47500],
  ['Amsterdam Godenzonen', 'Amsterdam', 'NED', 71, W, R, 'plain', 'Amsterdam Arena', 55800],
  ['Alkmaar Kaaskoppen', 'Alkmaar', 'NED', 68, R, W, 'plain', 'Alkmaar Stadion', 19500],
  ['Utrecht Domstad', 'Utrecht', 'NED', 65, R, W, 'plain', 'Stadion Galgenwaard', 23700],
  ['Enschede Tukkers', 'Enschede', 'NED', 66, R, W, 'plain', 'De Grolsch Veste', 30200],
  ['Nijmegen Groen-Rood', 'Nijmegen', 'NED', 63, R, G, 'stripes', 'Stadion De Goffert', 12500],
  // Belgium
  ['Brugge Blauw-Zwart', 'Brugge', 'BEL', 70, B, K, 'stripes', 'Jan Breydel Stadion', 29000],
  ['Brussel Unie', 'Unie', 'BEL', 67, Y, B, 'plain', 'Stade Joseph Marien', 9400],
  ['Brussel Paars-Wit', 'Paars-Wit', 'BEL', 67, PURPLE, W, 'plain', 'Lotto Park', 22500],
  ['Genk Limburg', 'Genk', 'BEL', 67, B, W, 'plain', 'Cegeka Arena', 23700],
  ['Gent Buffalo\'s', 'Gent', 'BEL', 65, B, W, 'plain', 'Ghelamco Arena', 20000],
  ['Truiden Kanaries', 'Truiden', 'BEL', 61, Y, B, 'plain', 'Stayen', 14600],
  // Turkey
  ['Istanbul Aslanlar', 'Aslanlar', 'TUR', 73, Y, R, 'halves', 'Ali Sami Yen Arena', 52200],
  ['Istanbul Kanaryalar', 'Kanaryalar', 'TUR', 72, Y, NAVY, 'stripes', 'Kadıköy Stadı', 47800],
  ['Istanbul Kartallar', 'Kartallar', 'TUR', 70, K, W, 'plain', 'Dolmabahçe Stadı', 42600],
  ['Trabzon Bordo-Mavi', 'Trabzon', 'TUR', 67, CLARET, SKY, 'stripes', 'Papara Park', 40800],
  ['Istanbul Başak', 'Başak', 'TUR', 65, ORANGE, NAVY, 'plain', 'Fatih Terim Stadyumu', 17300],
  // Scotland
  ['Glasgow Hoops', 'Hoops', 'SCO', 69, G, W, 'hoops', 'Parkhead', 60400],
  ['Glasgow Light Blues', 'Light Blues', 'SCO', 67, B, W, 'plain', 'Ibrox Park', 50800],
  ['Edinburgh Jam Tarts', 'Edinburgh', 'SCO', 61, CLARET, W, 'plain', 'Tynecastle', 19800],
  // Austria
  ['Salzburg Bullen', 'Salzburg', 'AUT', 68, W, R, 'plain', 'Wals-Siezenheim Arena', 30200],
  ['Graz Schwarz-Weiß', 'Graz', 'AUT', 65, K, W, 'plain', 'Liebenau Stadion', 16400],
  ['Linz Athletiker', 'Linz', 'AUT', 63, K, W, 'stripes', 'Linzer Stadion', 19100],
  ['Wien Hütteldorf', 'Hütteldorf', 'AUT', 63, G, W, 'plain', 'Weststadion', 28300],
  // Switzerland
  ['Bern Gelb-Schwarz', 'Bern', 'SUI', 66, Y, K, 'plain', 'Wankdorf', 31800],
  ['Basel Rotblau', 'Basel', 'SUI', 65, R, B, 'halves', 'St. Jakob-Park', 38500],
  ['Lugano Bianconeri', 'Lugano', 'SUI', 63, K, W, 'stripes', 'Stadio Cornaredo', 6300],
  ['Thun Oberland', 'Thun', 'SUI', 58, R, W, 'plain', 'Stockhorn Arena', 10000],
  // Greece
  ['Piraeus Thrylos', 'Piraeus', 'GRE', 70, R, W, 'stripes', 'Karaiskakis', 32100],
  ['Thessaloniki Dikefalos', 'Thessaloniki', 'GRE', 68, K, W, 'stripes', 'Toumba', 28700],
  ['Athina Enosis', 'Enosis', 'GRE', 67, Y, K, 'plain', 'Agia Sophia Arena', 32500],
  ['Athina Trifylli', 'Trifylli', 'GRE', 66, G, W, 'plain', 'Leoforos', 16000],
  ['Heraklion Kritis', 'Heraklion', 'GRE', 60, K, W, 'stripes', 'Theodoros Vardinogiannis', 9000],
  // Croatia, Serbia, Bosnia, Slovenia
  ['Zagreb Modri', 'Zagreb', 'CRO', 66, B, W, 'plain', 'Maksimir', 24800],
  ['Split Bili', 'Split', 'CRO', 63, W, B, 'plain', 'Poljud', 33900],
  ['Beograd Crveno-Beli', 'Crveno-Beli', 'SRB', 67, R, W, 'stripes', 'Marakana Beograd', 51800],
  ['Beograd Crno-Beli', 'Crno-Beli', 'SRB', 63, K, W, 'stripes', 'Humska', 29800],
  ['Banja Luka Crveno-Plavi', 'Banja Luka', 'BIH', 55, R, B, 'halves', 'Gradski stadion Banja Luka', 10000],
  ['Celje Grofje', 'Celje', 'SVN', 59, Y, B, 'plain', 'Stadion Z\'dežele', 13100],
  // Ukraine
  ['Donetsk Hirnyky', 'Donetsk', 'UKR', 69, ORANGE, K, 'stripes', 'Donbas Arena', 52500],
  ['Kyiv Bilo-Syni', 'Kyiv', 'UKR', 66, W, B, 'plain', 'Olimpiyskiy Kyiv', 70000],
  // Denmark
  ['København Løverne', 'København', 'DEN', 66, W, B, 'plain', 'Parken', 38000],
  ['Herning Ulvene', 'Herning', 'DEN', 65, K, R, 'plain', 'MCH Arena', 11400],
  ['Farum Sjælland', 'Farum', 'DEN', 62, R, Y, 'plain', 'Right to Dream Park', 10300],
  ['Aarhus Hvide', 'Aarhus', 'DEN', 62, W, SKY, 'plain', 'Aarhus Stadion', 19400],
  // Norway
  ['Bodø Gule', 'Bodø', 'NOR', 68, Y, K, 'plain', 'Aspmyra', 8200],
  ['Stavanger Mørkeblå', 'Stavanger', 'NOR', 62, NAVY, W, 'plain', 'Viking Stadion', 16600],
  ['Bergen Røde', 'Bergen', 'NOR', 62, R, W, 'plain', 'Brann Stadion', 17700],
  ['Molde Blåhvit', 'Molde', 'NOR', 62, B, W, 'plain', 'Aker Stadion', 11800],
  ['Lillestrøm Kanari', 'Lillestrøm', 'NOR', 58, Y, K, 'plain', 'Åråsen', 11500],
  // Sweden, Finland
  ['Malmö Himmelsblå', 'Malmö', 'SWE', 63, SKY, W, 'plain', 'Eleda Stadion', 22500],
  ['Sölvesborg Blekinge', 'Blekinge', 'SWE', 57, Y, K, 'plain', 'Strandvallen', 7500],
  ['Kuopio Keltamustat', 'Kuopio', 'FIN', 55, Y, K, 'plain', 'Väre Areena', 5000],
  // Poland
  ['Poznań Kolejorz', 'Poznań', 'POL', 63, B, W, 'plain', 'Stadion Miejski Poznań', 42800],
  ['Warszawa Wojskowi', 'Warszawa', 'POL', 63, G, W, 'plain', 'Stadion Łazienkowska', 31100],
  ['Białystok Jaga', 'Białystok', 'POL', 61, Y, R, 'plain', 'Stadion Miejski Białystok', 22400],
  // Cyprus, Israel
  ['Nicosia Prasinoi', 'Nicosia', 'CYP', 60, G, W, 'plain', 'GSP Stadium', 22900],
  ['Pafos Kypros', 'Pafos', 'CYP', 61, B, W, 'plain', 'Stelios Kyriakides', 9400],
  ['Tel Aviv Tsehubim', 'Tel Aviv', 'ISR', 62, Y, B, 'plain', 'Bloomfield', 29400],
  ['Be\'er Sheva Negev', 'Be\'er Sheva', 'ISR', 60, R, W, 'plain', 'Turner Arena', 16100],
  // Slovakia, Hungary, Romania, Bulgaria
  ['Bratislava Belasí', 'Bratislava', 'SVK', 61, SKY, W, 'plain', 'Tehelné pole', 22500],
  ['Budapest Fradi', 'Budapest', 'HUN', 64, G, W, 'stripes', 'Groupama Aréna', 22000],
  ['București Roș-Albaștrii', 'București', 'ROU', 61, R, B, 'halves', 'Arena Națională', 55600],
  ['Craiova Oltenia', 'Craiova', 'ROU', 60, B, W, 'plain', 'Stadionul Ion Oblemenco', 30900],
  ['Razgrad Orli', 'Razgrad', 'BUL', 62, G, W, 'plain', 'Huvepharma Arena', 10400],
  ['Sofia Sini', 'Sofia Sini', 'BUL', 58, B, W, 'plain', 'Georgi Asparuhov', 25000],
  ['Sofia Armeytsi', 'Armeytsi', 'BUL', 57, R, W, 'plain', 'Balgarska Armia', 22000],
  // Azerbaijan, Armenia, Georgia, Kazakhstan
  ['Ağdam Atlılar', 'Ağdam', 'AZE', 62, K, W, 'plain', 'Tofiq Bahramov Arena', 31200],
  ['Baku Masazır', 'Masazır', 'AZE', 57, K, ORANGE, 'plain', 'Alinja Arena', 13000],
  ['Yerevan Ararat', 'Yerevan', 'ARM', 54, Y, R, 'plain', 'Vazgen Sargsyan Stadium', 14400],
  ['Tbilisi Samgori', 'Tbilisi', 'GEO', 52, W, R, 'plain', 'Mikheil Meskhi', 27200],
  ['Almaty Sary-Qara', 'Almaty', 'KAZ', 57, Y, K, 'plain', 'Almaty Central', 23800],
  // The Baltics, Albania, Gibraltar, Andorra
  ['Riga Daugava', 'Riga', 'LVA', 53, B, W, 'plain', 'Skonto Stadions', 9500],
  ['Kaunas Žalieji', 'Kaunas', 'LTU', 53, G, W, 'plain', 'Darius ir Girėnas', 15000],
  ['Rrogozhina Egnatia', 'Rrogozhina', 'ALB', 52, B, Y, 'plain', 'Stadiumi Arena Egnatia', 4000],
  ['Gibraltar Imps', 'Gibraltar', 'GIB', 46, R, K, 'plain', 'Europa Point', 8100],
  ['Escaldes-Engordany CE', 'Escaldes', 'AND', 45, B, W, 'plain', 'Estadi Nacional', 3300],
];

// Reputation from the squad level, inverting the squad generator
// (mean skill = 30 + reputation * 0.55 + country strength).
export const guestReputation = (level, strength) => Math.max(20, Math.min(95, Math.round((level - 30 - strength) / 0.55)));

// The guests in the real 2026/27 league phases (first season only; the clubs
// of the six league countries are listed in continental.js).
export const GUEST_FIRST_SEASON = {
  CCC: ['Lisboa Leões', 'Porto Dragões', 'Brugge Blauw-Zwart', 'Eindhoven Boeren', 'Rotterdam Zuid', 'Bodø Gule',
    'Istanbul Kanaryalar', 'Donetsk Hirnyky', 'Istanbul Aslanlar', 'Bratislava Belasí', 'Athina Enosis', 'Linz Athletiker',
    'Stavanger Mørkeblå', 'Baku Masazır'],
  CEL: ['Lisboa Águias', 'Alkmaar Kaaskoppen', 'Piraeus Thrylos', 'Budapest Fradi', 'Brussel Unie', 'Zagreb Modri',
    'Salzburg Bullen', 'Glasgow Hoops', 'Brussel Paars-Wit', 'Graz Schwarz-Weiß', 'Poznań Kolejorz', 'Celje Grofje',
    'Białystok Jaga', 'Nicosia Prasinoi', 'Istanbul Kartallar', 'Torres Vedras SC', "Be'er Sheva Negev",
    'Nijmegen Groen-Rood', 'Heraklion Kritis', 'Lillestrøm Kanari', 'Sofia Sini', 'Yerevan Ararat'],
  CCL: ['Braga Arsenalistas', 'Amsterdam Godenzonen', 'København Løverne', 'Herning Ulvene', 'Beograd Crveno-Beli',
    "Gent Buffalo's", 'Athina Trifylli', 'Pafos Kypros', 'Lugano Bianconeri', 'Kuopio Keltamustat', 'Enschede Tukkers',
    'Gibraltar Imps', 'Banja Luka Crveno-Plavi', 'Truiden Kanaries', 'Bergen Røde', 'Edinburgh Jam Tarts',
    'Almaty Sary-Qara', 'Trabzon Bordo-Mavi', 'Craiova Oltenia', 'Riga Daugava', 'Split Bili', 'Farum Sjælland',
    'Aarhus Hvide', 'Escaldes-Engordany CE', 'Thun Oberland', 'Sofia Armeytsi', 'Kaunas Žalieji', 'Sölvesborg Blekinge',
    'Tbilisi Samgori', 'Rrogozhina Egnatia'],
};
