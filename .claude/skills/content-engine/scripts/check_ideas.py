#!/usr/bin/env python3
"""Mechanical checks on a client's content ideas, before Tait sees them.

  check_ideas.py clients/<slug> [--ids W14,W15] [--library library/viral-scripts]

For each idea in concepts/content-ideas.md (or only --ids):
  - Seed: must be found (an idea with no Seed is listed as a note:
    older ideas predate it; every new idea needs one) word for word in the client's sources/ or research/
    files (case and spacing ignored; "..." splits it into parts that must
    each be found; [brackets] are skipped)
  - Script: no 6-word run copied from any library script's Full script
    (structure is borrowed, words never are)
  - no em dashes anywhere in the idea
Exit code 1 if anything fails.
"""
import argparse
import glob
import os
import re
import sys


def norm(s):
    s = s.replace('’', "'").replace('‘', "'").replace('“', '"').replace('”', '"')
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s\']', ' ', s.lower())).strip()


def ideas(text):
    for m in re.finditer(r'(?ms)^\*\*([A-Z]+\d+)\. (.*?)\*\*\n(.*?)(?=^\*\*[A-Z]+\d+\.|^---|^## |\Z)', text):
        yield m.group(1), m.group(2), m.group(3)


def field(body, name):
    m = re.search(r'\*\*' + re.escape(name) + r':\*\*\s*(.*)', body)
    return m.group(1).strip() if m else ''


def script_block(body):
    m = re.search(r'\*\*Script[^*]*:\*\*\s*\n?((?:.|\n)*?)(?=\n- \*\*(?:Ask on camera|CTA|Source|Needs from you)|\Z)', body)
    return m.group(1) if m else ''


def grams(words, n=6):
    return {' '.join(words[i:i + n]) for i in range(len(words) - n + 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('client')
    ap.add_argument('--ids')
    ap.add_argument('--library', default='library/viral-scripts')
    a = ap.parse_args()
    root = a.client.rstrip('/')
    want = set(a.ids.split(',')) if a.ids else None
    corpus = ' '.join(norm(open(p).read()) for p in glob.glob(root + '/sources/**/*.md', recursive=True)
                      + glob.glob(root + '/research/**/*.md', recursive=True)
                      if not p.endswith(('identity.md', 'content-ideas.md')))
    lib = set()
    for p in glob.glob(a.library + '/scripts/VS-*.md'):
        t = open(p).read()
        full = t.split('## Full script', 1)[1] if '## Full script' in t else ''
        lib |= grams(norm(full).split())
    bad = 0
    checked = 0
    warn = []
    for iid, title, body in ideas(open(root + '/concepts/content-ideas.md').read()):
        if want and iid not in want:
            continue
        checked += 1
        probs = []
        if '—' in title + body:
            probs.append('em dash')
        seed = field(body, 'Seed').strip().strip('"“”')
        if seed:
            for part in re.split(r'\.\.\.|…', re.sub(r'\[[^\]]*\]', ' ', seed)):
                if norm(part) and norm(part) not in corpus:
                    probs.append(f'seed not found word for word: "{part.strip()[:60]}"')
        else:
            warn.append(iid)
        sc = script_block(body)
        hit = grams(norm(sc).split()) & lib if sc and lib else set()
        if hit:
            probs.append(f'script copies a library script: "{sorted(hit)[0]}"')
        if probs:
            bad += 1
            print(f'{iid}. {title}\n  - ' + '\n  - '.join(probs))
    if warn:
        print(f'note: no Seed line on {", ".join(warn)} (older ideas; every new idea needs one)')
    print(f'{checked} ideas checked, {bad} with problems')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
