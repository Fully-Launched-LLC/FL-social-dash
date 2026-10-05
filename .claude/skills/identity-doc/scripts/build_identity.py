#!/usr/bin/env python3
"""Join a client's identity parts into one file for their Identity Google Doc.

  build_identity.py clients/<slug>

Reads, from clients/<slug>/sources/ (each optional except positioning.md):
  offer.md        who they are, what they sell, proof, objections, CTA wording
  positioning.md  the 3-3-3 (pillars, formats, perspectives)
  voice.md        the voice profile
  story-bank.md   every story from their voice memo, with its on-camera prompt

Writes clients/<slug>/sources/identity.md: a generated file (never edit it
by hand, edit the parts). Each part's own title and header lines (up to its
first ---) are dropped; the part becomes a ## section, its ## headings
become ###, and its ### headings become bold lines (Google Docs mirroring
via gdoc_build.py supports three heading levels).
"""
import os
import re
import sys

PARTS = [
    ('offer.md', 'Who they are and what they sell'),
    ('positioning.md', 'The 3-3-3: pillars, formats, perspectives'),
    ('voice.md', 'Voice profile: how they sound'),
    ('story-bank.md', 'Story bank'),
]


def body(text):
    lines = text.split('\n')
    head = lines[:25]
    if '---' in head:
        lines = lines[head.index('---') + 1:]
    elif lines and lines[0].startswith('# '):
        lines = lines[1:]
    out = []
    for line in lines:
        if line.startswith('### '):
            out.append('**' + line[4:].strip() + '**')
        elif line.startswith('## '):
            out.append('### ' + line[3:])
        elif line.startswith('# '):
            out.append('### ' + line[2:])
        else:
            out.append(line)
    return '\n'.join(out).strip('\n')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = sys.argv[1].rstrip('/')
    src = os.path.join(root, 'sources')
    if not os.path.exists(os.path.join(src, 'positioning.md')):
        sys.exit('No sources/positioning.md: build the 3-3-3 first.')
    name = os.path.basename(root)
    brain = os.path.join(root, 'brain.md')
    if os.path.exists(brain):
        m = re.match(r'#\s*(.+)', open(brain).read())
        if m:
            name = re.split(r'[:—-]', m.group(1))[0].strip() or name
    old = os.path.join(src, 'identity.md')
    drive = ''
    if os.path.exists(old):
        m = re.search(r'^\*\*Drive:\*\*.*$', open(old).read(), re.M)
        drive = m.group(0) if m else ''
    out = [f'# {name}: Identity', '',
           drive or '**Drive:** (link added when the Google Doc is made)', '',
           f'Who {name} is, what they sell, how they sound, what they stand for, and the stories they can tell on camera. '
           'Built from their own words. Content Ideas use this with Customer Data and Research.', '']
    missing = []
    for fn, title in PARTS:
        p = os.path.join(src, fn)
        if not os.path.exists(p):
            missing.append(fn)
            continue
        out += ['---', '', f'## {title}', '', body(open(p).read()), '']
    text = '\n'.join(out).rstrip() + '\n'
    if '—' in text:
        sys.exit('Em dash found in a part. Fix it first.')
    open(old, 'w').write(text)
    print(f'wrote {old}' + (f' (not there yet: {", ".join(missing)})' if missing else ''))


if __name__ == '__main__':
    main()
