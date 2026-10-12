"""Fills REAL_CLUB_POINTS in src/core/coefdata.js: the real club coefficients
(private/coef-clubs-2026.txt, from kassiesa.net) keyed by the clubs' game names.

Real names are matched to game names through the private files (the six
countries' research files, the guest names and the new leagues' name map), so
only game names and numbers end up in the public file.

Run after tools/make_leagues.py: python tools/make_coefdata.py
"""

import glob
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PRIV = os.path.join(ROOT, 'private')
COEF = os.path.join(PRIV, 'coef-clubs-2026.txt')
OUT = os.path.join(ROOT, 'src', 'core', 'coefdata.js')

DROP = {'fc', 'sc', 'sl', 'cf', 'fk', 'sk', 'nk', 'ac', 'as', 'kv', 'kaa', 'krc', 'rsc', 'bk', 'if', 'ff', 'cd', 'gd', 'afc',
        'club', 'de', 'the', 'football', 'royal', 'r', 'kfc', 'ks', 'ofk', 'pfc', 'hnk', 'csm', 'cs', 'ud', 'sv', 'ogc', 'rc',
        'olympique', 'stade', 'vfb', 'vfl', 'tsg', 'bv', 'borussia', 'real', 'calcio', 'ss', 'us', 'ssc', 'afc', 'cfr', 'ca'}
ALIAS = {'internazionale': 'inter', 'munchen': 'munich', 'koln': 'cologne', 'paris': 'psg', 'olympiakos': 'olympiacos',
         'kobenhavn': 'copenhagen', 'sankt': 'st', 'hearts': 'heart', 'beer': 'beer', 'tel': 'tel'}
# Letters that NFKD doesn't split into a base letter and an accent.
LETTERS = str.maketrans({'ł': 'l', 'Ł': 'L', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'đ': 'd', 'Đ': 'D', 'ß': 'ss', 'ı': 'i', 'ð': 'd', 'þ': 'th'})


def norm(s):
    s = unicodedata.normalize('NFKD', s.translate(LETTERS)).encode('ascii', 'ignore').decode().lower()
    return {ALIAS.get(t, t) for t in re.findall(r'[a-z0-9]+', s) if t not in DROP}


def same(a, b):
    # Equal words, or one a stem of the other (Lyon / Lyonnais, Paks / Paksi).
    return a == b or (min(len(a), len(b)) >= 4 and (a.startswith(b) or b.startswith(a)))


def overlap(x, y):
    return sum(1 for a in x if any(same(a, b) for b in y))


def candidates():
    """(nation, real name, game name) for every club with a known real name."""
    out = []
    for path in glob.glob(os.path.join(PRIV, 'realpack', '*.json')):
        nat = os.path.basename(path)[:3]
        for base, c in json.load(open(path, encoding='utf-8'))['clubs'].items():
            if c.get('real'):
                out.append((nat, c['real'], base))
    names = json.load(open(os.path.join(PRIV, 'new-club-names.json'), encoding='utf-8')) if os.path.exists(os.path.join(PRIV, 'new-club-names.json')) else {}
    for path in glob.glob(os.path.join(PRIV, 'realpack-new', '*.json')):
        nat = os.path.basename(path)[:3]
        for real, c in json.load(open(path, encoding='utf-8'))['clubs'].items():
            r = c.get('real') or real
            if r in names:
                out.append((nat, r, names[r]))
    guests_js = open(os.path.join(ROOT, 'src', 'core', 'guests.js'), encoding='utf-8').read()
    nat_of = {m.group(1).replace("\\'", "'"): m.group(2) for m in re.finditer(r"\[\s*'((?:[^'\\]|\\.)+)',\s*'(?:[^'\\]|\\.)+',\s*'([A-Z]{3})'", guests_js)}
    gpath = os.path.join(PRIV, 'guest-names.json')
    if os.path.exists(gpath):
        for base, real in json.load(open(gpath, encoding='utf-8')).items():
            if base in nat_of:
                out.append((nat_of[base], real, base))
    return out


def main():
    cands = candidates()
    by_nat = {}
    for nat, real, base in cands:
        by_nat.setdefault(nat, []).append((norm(real), base))
    points = {}
    missed = []
    for line in open(COEF, encoding='utf-8'):
        parts = line.rstrip('\n').split('|')
        if len(parts) < 10:
            continue
        name, nat = parts[2], parts[3].upper()
        seasons = [float(x) if x.strip() not in ('', '-') else 0.0 for x in parts[4:9]]
        key = norm(name)
        best = None
        for tokens, base in by_nat.get(nat, []):
            common = overlap(tokens, key)
            if common and (common == len(tokens) or common == len(key) or common >= 2):
                if not best or common > best[0]:
                    best = (common, base)
        if best and best[1] not in points:
            points[best[1]] = seasons
        elif not best and nat in by_nat:
            missed.append(f'{name} ({nat})')
    text = open(OUT, encoding='utf-8').read()
    body = ',\n'.join(f'  {json.dumps(k, ensure_ascii=False)}: [{", ".join(f"{v:.3f}" for v in vals)}]' for k, vals in sorted(points.items()))
    text = re.sub(r'export const REAL_CLUB_POINTS = \{[\s\S]*?\};', 'export const REAL_CLUB_POINTS = {\n' + body + ',\n};', text)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(text)
    print(f'{len(points)} clubs matched; not matched in countries with game clubs: {len(missed)}')
    for m in missed[:60]:
        print('  ', m)


if __name__ == '__main__':
    main()
