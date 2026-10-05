#!/usr/bin/env python3
"""Rebuild the viral script library's index and its one-file export.

  build_library.py [library/viral-scripts]

Reads scripts/VS-*.md (one analysed script each) and frameworks.md, writes:
  index.md     a table of every script: ID, creator, platform, views, niche,
               format, hook type, framework, words
  LIBRARY.md   frameworks.md, then every script's analysis and full text,
               in ID order: one file Claude reads in full, or that Tait can
               upload to a claude.ai Project ("one big Claude project")

Fields are read from each script file's "- **Field:** value" lines.
"""
import glob
import os
import re
import sys

COLS = ['Creator', 'Platform', 'Views', 'Niche', 'Format', 'Hook type', 'Framework', 'Words']


def field(text, name):
    m = re.search(r'^- \*\*' + re.escape(name) + r':\*\*\s*(.*)$', text, re.M)
    return m.group(1).strip() if m else ''


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'library/viral-scripts'
    files = sorted(glob.glob(os.path.join(root, 'scripts', 'VS-*.md')),
                   key=lambda p: int(re.search(r'VS-(\d+)', p).group(1)))
    rows, parts = [], []
    for p in files:
        t = open(p).read()
        vid = re.search(r'VS-\d+', os.path.basename(p)).group(0)
        title = (re.match(r'#\s*(.+)', t) or [None, vid])[1]
        rows.append('| ' + ' | '.join([vid, title.replace('|', '/')] + [field(t, c).replace('|', '/') for c in COLS]) + ' |')
        parts.append(t.strip())
    index = ['# Viral script library: index', '',
             f'{len(rows)} scripts. Frameworks and hook formulas: `frameworks.md`. Everything in one file: `LIBRARY.md`.', '',
             '| ID | Title | ' + ' | '.join(COLS) + ' |', '|' + '---|' * (len(COLS) + 2)] + rows
    open(os.path.join(root, 'index.md'), 'w').write('\n'.join(index) + '\n')
    fw = os.path.join(root, 'frameworks.md')
    lib = ['# Viral Script Library', '',
           'Private to Tait. Frameworks first, then every script with its analysis. '
           'Use the structure, never the words: no line from these scripts goes into a client\'s content.', '']
    if os.path.exists(fw):
        lib += ['---', '', open(fw).read().strip(), '']
    for t in parts:
        lib += ['---', '', t, '']
    open(os.path.join(root, 'LIBRARY.md'), 'w').write('\n'.join(lib).rstrip() + '\n')
    print(f'{len(rows)} scripts -> {root}/index.md and {root}/LIBRARY.md')


if __name__ == '__main__':
    main()
