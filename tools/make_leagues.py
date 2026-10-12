"""Builds the game's extra league countries (src/core/europe.js) from the
private research files in private/realpack-new/<NAT>-L<n>.json.

Public output (committed): club rows with near-real names (city + kit
colours in the local language, or the club's earlier guest name), real cities,
stadiums, capacities and colours, and each club's level (the average of its
best 14 researched ratings), which sets its reputation.

Private output (never committed): private/new-club-names.json, the real club
name -> game name map that tools/make_realpack.py uses to key the real squads.

Run: python tools/make_leagues.py
"""

import json
import os
import re
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'private', 'realpack-new')
GUEST_NAMES = os.path.join(ROOT, 'private', 'guest-names.json')
GUESTS_JS = os.path.join(ROOT, 'src', 'core', 'guests.js')
OUT = os.path.join(ROOT, 'src', 'core', 'europe.js')
MAP_OUT = os.path.join(ROOT, 'private', 'new-club-names.json')

# id: name, adjective, name style, strength, flag, national-team kit, public league names, public cup, colour language
COUNTRIES = {
    'POR': ('Portugal', 'Portuguese', 'portuguese', -1, ('vtri', ['#046a38', '#da291c', '#da291c'], '#ffe900'), ['Primeira Divisão'], 'Taça Nacional', 'pt'),
    'NED': ('Netherlands', 'Dutch', 'dutch', -2, ('htri', ['#ae1c28', '#ffffff', '#21468b'], None), ['Eerste Divisie A'], 'Nationale Beker', 'nl'),
    'BEL': ('Belgium', 'Belgian', 'dutch', -3, ('vtri', ['#000000', '#fdda24', '#ef3340'], None), ['Eerste Klasse'], 'Belgische Beker', 'nl'),
    'TUR': ('Turkey', 'Turkish', 'turkish', -3, ('hband', ['#e30a17', '#e30a17'], '#ffffff'), ['Birinci Lig'], 'Türkiye Kupası', 'tr'),
    'GRE': ('Greece', 'Greek', 'greek', -5, ('htri', ['#0d5eaf', '#ffffff', '#0d5eaf'], None), ['Proti Kategoria'], 'Kypello Elladas', 'el'),
    'POL': ('Poland', 'Polish', 'eastern', -6, ('hbi', ['#ffffff', '#dc143c'], None), ['Pierwsza Liga'], 'Puchar Kraju', 'pl'),
    'DEN': ('Denmark', 'Danish', 'scandi', -5, ('nordic', ['#c8102e', '#ffffff', '#ffffff'], None), ['Første Division'], 'Landspokalen', 'da'),
    'NOR': ('Norway', 'Norwegian', 'scandi', -6, ('nordic', ['#ba0c2f', '#ffffff', '#00205b'], None), ['Toppdivisjonen'], 'Norgescupen', 'no'),
    'CYP': ('Cyprus', 'Cypriot', 'greek', -7, ('hband', ['#ffffff', '#ffffff'], '#d57800'), ['Proti Kypriaki'], 'Kypello Kyprou', 'el'),
    'SUI': ('Switzerland', 'Swiss', 'german', -5, ('cross', ['#d52b1e', '#ffffff'], None), ['Oberste Liga'], 'Schweizer Pokal', 'de'),
    'AUT': ('Austria', 'Austrian', 'german', -5, ('htri', ['#ed2939', '#ffffff', '#ed2939'], None), ['Oberste Spielklasse'], 'Österreichischer Pokal', 'de'),
    'SCO': ('Scotland', 'Scottish', 'english', -5, ('cross', ['#005eb8', '#ffffff'], None), ['Scottish Top Flight'], 'Scottish Challenge Cup', 'en'),
    'SWE': ('Sweden', 'Swedish', 'scandi', -7, ('nordic', ['#006aa7', '#fecc00', '#fecc00'], None), ['Högsta Serien'], 'Svenska Pokalen', 'sv'),
    'CRO': ('Croatia', 'Croatian', 'balkan', -6, ('htri', ['#ff0000', '#ffffff', '#171796'], None), ['Prva Liga'], 'Hrvatski Kup', 'hr'),
    'ISR': ('Israel', 'Israeli', 'israeli', -7, ('hband', ['#ffffff', '#ffffff'], '#0038b8'), ['Liga Ha\'Al'], 'Gvia HaMedina', 'he'),
    'HUN': ('Hungary', 'Hungarian', 'eastern', -7, ('htri', ['#ce2939', '#ffffff', '#477050'], None), ['Első Osztály'], 'Magyar Kupa', 'hu'),
    'UKR': ('Ukraine', 'Ukrainian', 'eastern', -6, ('hbi', ['#0057b7', '#ffd700'], None), ['Vyshcha Liha'], 'Kubok Ukrainy', 'uk'),
    'SRB': ('Serbia', 'Serbian', 'balkan', -6, ('htri', ['#c6363c', '#0c4076', '#ffffff'], None), ['Prva Liga Srbije'], 'Kup Srbije', 'sr'),
    'ROU': ('Romania', 'Romanian', 'eastern', -7, ('vtri', ['#002b7f', '#fcd116', '#ce1126'], None), ['Divizia Națională'], 'Cupa Națională', 'ro'),
    'IRN': ('Iran', 'Iranian', 'persian', -8, ('htri', ['#239f40', '#ffffff', '#da0000'], '#da0000'), ['Lig-e Bartar', 'Lig-e Yek'], 'Jam-e Hazfi', 'fa'),
}

PALETTE = {
    'red': (200, 16, 46), 'blue': (31, 79, 191), 'white': (244, 244, 244), 'black': (27, 27, 27), 'green': (27, 138, 58),
    'yellow': (245, 196, 0), 'claret': (123, 30, 43), 'sky': (108, 180, 238), 'orange': (242, 140, 40),
    'purple': (91, 42, 134), 'navy': (19, 37, 79),
}
WORDS = {
    'pt': dict(red='Rubro', blue='Azul', white='Branco', black='Negro', green='Verde', yellow='Amarelo', claret='Grená', sky='Celeste', orange='Laranja', purple='Roxo', navy='Anil'),
    'nl': dict(red='Rood', blue='Blauw', white='Wit', black='Zwart', green='Groen', yellow='Geel', claret='Bordeaux', sky='Lichtblauw', orange='Oranje', purple='Paars', navy='Marine'),
    'tr': dict(red='Kırmızı', blue='Mavi', white='Beyaz', black='Siyah', green='Yeşil', yellow='Sarı', claret='Bordo', sky='Turkuaz', orange='Turuncu', purple='Mor', navy='Lacivert'),
    'el': dict(red='Kokkino', blue='Ble', white='Lefko', black='Mavro', green='Prasino', yellow='Kitrino', claret='Bordo', sky='Galazio', orange='Portokali', purple='Mov', navy='Skouro'),
    'pl': dict(red='Czerwoni', blue='Niebiescy', white='Biali', black='Czarni', green='Zieloni', yellow='Żółci', claret='Bordowi', sky='Błękitni', orange='Pomarańczowi', purple='Fioletowi', navy='Granatowi'),
    'da': dict(red='Røde', blue='Blå', white='Hvide', black='Sorte', green='Grønne', yellow='Gule', claret='Vinrøde', sky='Lyseblå', orange='Orange', purple='Lilla', navy='Mørkeblå'),
    'no': dict(red='Røde', blue='Blå', white='Hvite', black='Svarte', green='Grønne', yellow='Gule', claret='Vinrøde', sky='Lyseblå', orange='Oransje', purple='Lilla', navy='Mørkeblå'),
    'sv': dict(red='Röda', blue='Blå', white='Vita', black='Svarta', green='Gröna', yellow='Gula', claret='Vinröda', sky='Ljusblå', orange='Orange', purple='Lila', navy='Mörkblå'),
    'de': dict(red='Rot', blue='Blau', white='Weiß', black='Schwarz', green='Grün', yellow='Gelb', claret='Weinrot', sky='Himmelblau', orange='Orange', purple='Lila', navy='Dunkelblau'),
    'en': dict(red='Red', blue='Blue', white='White', black='Black', green='Green', yellow='Gold', claret='Maroon', sky='Sky', orange='Orange', purple='Purple', navy='Navy'),
    'hr': dict(red='Crveni', blue='Plavi', white='Bijeli', black='Crni', green='Zeleni', yellow='Žuti', claret='Bordo', sky='Nebeski', orange='Narančasti', purple='Ljubičasti', navy='Modri'),
    'sr': dict(red='Crveni', blue='Plavi', white='Beli', black='Crni', green='Zeleni', yellow='Žuti', claret='Bordo', sky='Nebeski', orange='Narandžasti', purple='Ljubičasti', navy='Modri'),
    'he': dict(red='Adom', blue='Kachol', white='Lavan', black='Shachor', green='Yarok', yellow='Tsahov', claret='Bordo', sky='Tchelet', orange='Katom', purple='Sagol', navy='Kehe'),
    'hu': dict(red='Piros', blue='Kék', white='Fehér', black='Fekete', green='Zöld', yellow='Sárga', claret='Bordó', sky='Égkék', orange='Narancs', purple='Lila', navy='Sötétkék'),
    'uk': dict(red='Chervoni', blue='Syni', white='Bili', black='Chorni', green='Zeleni', yellow='Zhovti', claret='Bordovi', sky='Blakytni', orange='Pomaranchevi', purple='Fioletovi', navy='Temno-syni'),
    'ro': dict(red='Roșu', blue='Albastru', white='Alb', black='Negru', green='Verde', yellow='Galben', claret='Vișiniu', sky='Bleu', orange='Portocaliu', purple='Violet', navy='Bleumarin'),
    'fa': dict(red='Ghermez', blue='Abi', white='Sefid', black='Siah', green='Sabz', yellow='Zard', claret='Zereshki', sky='Asemani', orange='Narenji', purple='Banafsh', navy='Sormei'),
}


def rgb(h):
    h = (h or '#888888').lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (136, 136, 136)


def colour(h):
    c = rgb(h)
    return min(PALETTE, key=lambda k: sum((a - b) ** 2 for a, b in zip(PALETTE[k], c)))


def hexof(h):
    r, g, b = rgb(h)
    return f'#{r:02x}{g:02x}{b:02x}'


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    drop = {'fc', 'sc', 'sl', 'cf', 'fk', 'sk', 'nk', 'ac', 'as', 'kv', 'kaa', 'krc', 'rsc', 'bk', 'if', 'ff', 'cd', 'gd', 'afc',
            'club', 'de', 'the', 'football', 'royal', 'r', 'kfc', 'ks', 'ofk', 'pfc', 'hnk', 'csm', 'cs', 'ud', 'sv', 'fcsb_'}
    return {t for t in re.findall(r'[a-z0-9]+', s) if t not in drop}


def guest_rows():
    """Guest club rows from guests.js: name -> (nation, pattern)."""
    text = open(GUESTS_JS, encoding='utf-8').read()
    rows = {}
    for m in re.finditer(r"\[\s*'((?:[^'\\]|\\.)+)',\s*'(?:[^'\\]|\\.)+',\s*'([A-Z]{3})',\s*\d+,\s*\w+,\s*\w+,\s*'(\w+)'", text):
        rows[m.group(1).replace("\\'", "'")] = (m.group(2), m.group(3))
    return rows


def main():
    if not os.path.isdir(SRC):
        sys.exit(f'No research files in {SRC}')
    guest_names = json.load(open(GUEST_NAMES, encoding='utf-8')) if os.path.exists(GUEST_NAMES) else {}
    guests = guest_rows()
    real_to_guest = {}
    for base, real in guest_names.items():
        if base in guests:
            real_to_guest.setdefault(guests[base][0], []).append((norm(real), base))
    nations = []
    name_map = {}
    report = []
    for nat, (name, adj, style, strength, flag, league_names, cup, lang) in COUNTRIES.items():
        tiers = []
        used = set()  # game names, unique across the country's divisions
        for t in range(len(league_names)):
            path = os.path.join(SRC, f'{nat}-L{t + 1}.json')
            if not os.path.exists(path):
                tiers = None
                report.append(f'{nat}: missing {os.path.basename(path)}')
                break
            data = json.load(open(path, encoding='utf-8'))
            rows = []
            # Earlier guest names: exact matches first, then the closest partial one;
            # each guest name goes to one club only (a club named 'X' is not 'X 29M').
            guest_of = {}
            pool = list(real_to_guest.get(nat, []))
            keys = {real: norm(c.get('real') or real) for real, c in data['clubs'].items()}
            for exact in (True, False):
                for real, key in keys.items():
                    if real in guest_of or not key:
                        continue
                    best = None
                    for tokens, base in pool:
                        if not tokens or base in guest_of.values():
                            continue
                        if exact and tokens == key:
                            best = (0, base)
                            break
                        if not exact and (tokens <= key or key <= tokens):
                            d = len(tokens ^ key)
                            if not best or d < best[0]:
                                best = (d, base)
                    if best:
                        guest_of[real] = best[1]
            for real, c in data['clubs'].items():
                ratings = sorted((p.get('rating') for p in c.get('players', []) if isinstance(p.get('rating'), (int, float))), reverse=True)[:14]
                level = round(sum(ratings) / len(ratings)) if ratings else (55 if t == 0 else 47)
                cols = c.get('colors') or ['#888888', '#ffffff']
                primary, secondary = hexof(cols[0]), hexof(cols[1] if len(cols) > 1 else '#ffffff')
                pattern = 'plain'
                game_name = guest_of.get(real)
                if game_name:
                    pattern = guests[game_name][1]
                else:
                    city = (c.get('city') or real).split(',')[0].strip()
                    w = WORDS[lang]
                    a, b = colour(primary), colour(secondary)
                    cands = [f'{city} {w[a]}-{w[b]}' if a != b else f'{city} {w[a]}', f'{city} {w[b]}-{w[a]}' if a != b else f'{city} {w[a]}-{w["white"]}',
                             f'{city} {w[a]} II']
                    game_name = next((x for x in cands if x not in used), f'{city} {w[a]} {len(used)}')
                used.add(game_name)
                name_map[c.get('real') or real] = game_name
                short = (c.get('city') or real).split(',')[0].strip()[:14]
                rows.append([game_name, short, primary, secondary, pattern, c.get('stadium') or f'Stadion {short}',
                             int(c.get('capacity') or 5000), level])
            rows.sort(key=lambda r: -r[7])
            tiers.append(rows)
            report.append(f'{nat}-L{t + 1}: {len(rows)} clubs, levels {rows[0][7]}..{rows[-1][7]}')
        if not tiers:
            continue
        nations.append({'id': nat, 'name': name, 'adj': adj, 'style': style, 'strength': strength,
                        'flag': {'layout': flag[0], 'colors': flag[1], **({'emblem': flag[2]} if flag[2] else {})},
                        'leagues': league_names[:len(tiers)], 'cup': cup, 'sizes': [len(r) for r in tiers], 'clubs': tiers})
    js = ['// Generated by tools/make_leagues.py from the research files: the league countries',
          '// beyond the original six (top 25 by UEFA coefficient, plus Iran). Club rows:',
          '// [name, short, primary, secondary, pattern, stadium, capacity, level] (level: the',
          '// squad\'s average skill, which sets the reputation). Names are near-real.', '',
          'export const EUROPE_NATIONS = ' + json.dumps(nations, ensure_ascii=False, indent=1) + ';', '']
    open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(js))
    json.dump(name_map, open(MAP_OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\n'.join(report))
    print(f'Wrote {OUT} ({len(nations)} countries) and {MAP_OUT} ({len(name_map)} clubs)')


if __name__ == '__main__':
    main()
