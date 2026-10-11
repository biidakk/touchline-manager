"""Builds realpack.json (real teams and players, for personal use) from the
per-league research files in private/realpack/<LEAGUE>.json.

    python tools/make_realpack.py

Checks every club and player, prints what it fixed or left out, and writes
realpack.json to the game folder (start.bat / start-phone.bat and the
Windows app pick it up from there; on a phone, load the file on the New
Career screen). Neither the research files nor realpack.json are published.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'private', 'realpack')
OUT = os.path.join(ROOT, 'realpack.json')
POS = {'G', 'D', 'M', 'F'}


def clean_player(p, problems, where):
    if not isinstance(p, dict):
        return None
    name = str(p.get('name', '')).strip()
    pos = str(p.get('pos', '')).strip().upper()[:1]
    try:
        rating = float(p.get('rating'))
    except (TypeError, ValueError):
        rating = None
    if not name or pos not in POS or rating is None:
        problems.append(f'{where}: dropped {p.get("name")!r} (name, position or rating missing)')
        return None
    out = {'name': name, 'pos': pos, 'rating': round(max(30, min(97, rating)))}
    for key in ('born', 'height', 'number', 'potential'):
        try:
            if p.get(key) is not None:
                out[key] = int(round(float(p[key])))
        except (TypeError, ValueError):
            pass
    if p.get('nation'):
        out['nation'] = str(p['nation']).strip()
    return out


def main():
    if not os.path.isdir(SRC):
        sys.exit(f'No research files in {SRC}')
    pack = {'format': 'touchline-realpack', 'season': '2026/27', 'clubs': {},
            # The game's league and cup names -> the real ones.
            'leagues': {'Premier Division': 'Premier League', 'First Division': 'Championship', 'Primera División': 'LaLiga',
                        'Segunda División': 'LaLiga Hypermotion', 'Division 1': 'Ligue 1', 'Division 2': 'Ligue 2',
                        '1. liga': 'Chance Liga', '2. liga': 'Chance Národní liga'},
            'cups': {'English Cup': 'FA Cup', 'Copa de España': 'Copa del Rey', 'Deutscher Pokal': 'DFB-Pokal',
                     'Český pohár': 'MOL Cup', 'Continental Champions Cup': 'Champions League'}}
    problems = []
    total = 0
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith('.json'):
            continue
        with open(os.path.join(SRC, fn), encoding='utf-8') as f:
            data = json.load(f)
        clubs = data.get('clubs', {})
        n = 0
        for name, c in clubs.items():
            seen = set()
            players = []
            for p in c.get('players', []):
                q = clean_player(p, problems, f'{fn} {name}')
                key = (q['name'], q.get('born')) if q else None
                if q and key not in seen:
                    seen.add(key)
                    players.append(q)
            keepers = sum(1 for p in players if p['pos'] == 'G')
            if len(players) < 16 or keepers < 2:
                problems.append(f'{fn} {name}: only {len(players)} players / {keepers} keepers (the game keeps its own squad)')
            entry = {k: str(c[k]).strip() for k in ('real', 'short', 'stadium', 'manager', 'asOf') if c.get(k)}
            # 'SK Artis Brno (formerly SK Líšeň)' -> the name; 'José Rojo Martín (Pacheta)' -> the nickname.
            if 'real' in entry:
                entry['real'] = re.sub(r'\s*\(.*?\)', '', entry['real']).strip()
            m = re.search(r'\((.+?)\)', entry.get('manager', ''))
            if m:
                entry['manager'] = m.group(1).strip()
            entry['players'] = players
            pack['clubs'][name] = entry
            n += len(players)
        total += n
        print(f'{fn}: {len(clubs)} clubs, {n} players')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, separators=(',', ':'))
    for p in problems:
        print('  ' + p)
    print(f'Wrote {OUT}: {len(pack["clubs"])} clubs, {total} players, {os.path.getsize(OUT) // 1024} KB')


if __name__ == '__main__':
    main()
