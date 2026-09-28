#!/usr/bin/env python3
"""Check every numbered quote in a customer-data.md against its own source material.

Usage: verify_quotes.py clients/<slug>/sources/customer-data.md

Each quote in the Pains and Dreams sections is split on [bracketed] words and
"...", and every remaining fragment must appear in the "Source material"
section (case- and whitespace-insensitive). Also counts em and en dashes.
Exits non-zero if anything fails.
"""
import re
import sys

md = open(sys.argv[1]).read()
if '## 4. Source material' not in md:
    sys.exit('No "## 4. Source material" section found.')
body, src = md.split('## 4. Source material', 1)
body = body.split('## 3.', 1)[0]  # hook phrases are checked by eye, not here


def norm(s):
    return re.sub(r'\s+', ' ', s.lower().replace('’', "'").replace('‘', "'"))


source = norm(src)
missing = 0
quotes = re.findall(r'^\s*\d+\. "(.*)"\s*$', body, re.M)
for q in quotes:
    for frag in re.split(r'\[[^\]]*\]|\.\.\.', q):
        f = norm(frag).strip(' .,?!')
        if f and f not in source:
            missing += 1
            print(f'NOT FOUND: {frag!r}\n   in quote: {q[:80]}')

em, en = md.count('—'), md.count('–')
print(f'{len(quotes)} quotes checked, {missing} fragments missing')
print(f'em dashes: {em}, en dashes: {en}')
sys.exit(1 if missing or em or not quotes else 0)
