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
                     'Český pohár': 'MOL Cup', 'Continental Champions Cup': 'Champions League',
                     'Continental League': 'Europa League', 'Continental Conference': 'Conference League'}}
    # Real names for the guest clubs of the European competitions (names only).
    guest_file = os.path.join(ROOT, 'private', 'guest-names.json')
    if os.path.exists(guest_file):
        pack['guests'] = json.load(open(guest_file, encoding='utf-8'))
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
    lock(pack)


# The locked copy for the website: realpack.enc can only be read with the
# code (kept in private/realpack-code.txt and reused). The game unlocks it from
# a link ending in #rp=CODE, or from the code typed on the New Career screen.
CODE_FILE = os.path.join(ROOT, 'private', 'realpack-code.txt')
ENC = os.path.join(ROOT, 'realpack.enc')
ITERATIONS = 200000


def lock(pack):
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        print('(python -m pip install cryptography to also build the locked realpack.enc)')
        return
    import base64
    import hashlib
    import secrets
    if os.path.exists(CODE_FILE):
        code = open(CODE_FILE, encoding='utf-8').read().strip()
    else:
        alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        raw = ''.join(secrets.choice(alphabet) for _ in range(10))
        code = raw[:5] + '-' + raw[5:]
        with open(CODE_FILE, 'w', encoding='utf-8') as f:
            f.write(code)
    norm = ''.join(ch for ch in code.upper() if ch.isalnum())
    salt = secrets.token_bytes(16)
    iv = secrets.token_bytes(12)
    key = hashlib.pbkdf2_hmac('sha256', norm.encode(), salt, ITERATIONS, 32)
    data = AESGCM(key).encrypt(iv, json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), None)
    b64 = lambda b: base64.b64encode(b).decode('ascii')
    box = {'format': 'touchline-realpack-locked', 'iter': ITERATIONS, 'salt': b64(salt), 'iv': b64(iv), 'data': b64(data)}
    with open(ENC, 'w', encoding='ascii') as f:
        json.dump(box, f)
    print(f'Wrote {ENC} ({os.path.getsize(ENC) // 1024} KB). Code: {code}')
    print(f'Link: https://biidakk.github.io/touchline-manager/#rp={code}')


if __name__ == '__main__':
    main()
