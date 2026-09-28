#!/usr/bin/env python3
"""Turn customer-data.md into Google Docs content, in two steps.

  gdoc_build.py text   <customer-data.md> --out DIR
      Writes DIR/text.txt (the body to insert at index 1, with every long
      transcript replaced by PLACEHOLDER_<n>) and DIR/placeholder_<n>.txt.

  gdoc_build.py format <customer-data.md> <doc.json> --out DIR
      doc.json is an unwrapped read_doc result taken after the text and
      placeholders are in. Checks the doc's text matches the file paragraph
      for paragraph, then writes DIR/format.json: the full update_doc
      arguments (documentId, requests, writeControl) for styles and lists.
"""
import argparse
import json
import os
import re
import sys

LONG = 1000  # paragraphs longer than this in Source material become placeholders


def u(s):
    return len(s.encode('utf-16-le')) // 2


def inline(s):
    out, rng = '', []
    for m in re.finditer(r'\*\*(.+?)\*\*|\*(.+?)\*|([^*]+)', s):
        if m.group(1) is not None:
            rng.append((u(out), u(out) + u(m.group(1)), 'bold'))
            out += m.group(1)
        elif m.group(2) is not None:
            rng.append((u(out), u(out) + u(m.group(2)), 'italic'))
            out += m.group(2)
        else:
            out += m.group(3)
    return out, rng


def parse(md):
    """Paragraphs as [text, inline ranges, kind, list group]."""
    paras, group, prev, in_sources = [], 0, None, False
    lines = md.split('\n')
    for i, line in enumerate(lines):
        if line.startswith('**Drive:**'):
            continue
        # the repo-paths line under "Also saved in the repo:" means nothing in Drive
        if in_sources and re.match(r'^clients/\S+', line):
            continue
        if not line.strip() or line.strip() == '---':
            continue
        m = re.match(r'^(#{1,3}) (.*)', line)
        if m:
            level = len(m.group(1))
            title = re.sub(r'^\d+\. ', '', m.group(2)) if level == 2 else m.group(2)
            if level == 2:
                in_sources = title.lower().startswith('source material')
            paras.append([*inline(title), f'H{level}', None])
            prev = 'h'
            continue
        m = re.match(r'^\d+\. (.*)', line)
        if m:
            if prev != 'num':
                group += 1
            t, r = inline(m.group(1))
            paras.append([t, r, 'num', group])
            prev = 'num'
            continue
        if line.startswith('   ') and paras and paras[-1][2] == 'num':
            t, r = inline(line.strip())
            p = paras[-1]
            off = u(p[0]) + 1
            p[0] += '\u000b' + t
            p[1] += [(a + off, b + off, k) for a, b, k in r]
            continue
        m = re.match(r'^(\s*)- (.*)', line)
        if m:
            if prev != 'bul':
                group += 1
            t, r = inline(m.group(2))
            if m.group(1):  # nested bullet: a leading tab sets the level
                t = '\t' + t
                r = [(a + 1, b + 1, k) for a, b, k in r]
            paras.append([t, r, 'bul', group])
            prev = 'bul'
            continue
        if line.startswith('> '):
            line = line[2:]
        t, r = inline(line)
        if in_sources:
            t = t.replace(' Also saved in the repo:', '')
        paras.append([t, r, 'P', None])
        prev = 'p'
    if any('—' in p[0] for p in paras):
        sys.exit('Em dash found. Fix customer-data.md first.')
    return paras


def cmd_text(args):
    paras = parse(open(args.md).read())
    os.makedirs(args.out, exist_ok=True)
    out, n, in_sources = [], 0, False
    for t, _, kind, _ in paras:
        if kind == 'H2':
            in_sources = t.lower().startswith('source material')
        if in_sources and kind == 'P' and len(t) > LONG:
            n += 1
            open(os.path.join(args.out, f'placeholder_{n}.txt'), 'w').write(t)
            t = f'PLACEHOLDER_{n}'
        out.append(t)
    open(os.path.join(args.out, 'text.txt'), 'w').write('\n'.join(out))
    print(f'{len(paras)} paragraphs, {n} placeholders -> {args.out}')


def cmd_format(args):
    paras = parse(open(args.md).read())
    doc = json.load(open(args.doc))
    doc = doc.get('content', doc)
    tab = doc['tabs'][0]['documentTab'] if 'tabs' in doc else doc
    body = tab['body']['content']
    dp = [(e['startIndex'],
           ''.join(x.get('textRun', {}).get('content', '') for x in e['paragraph']['elements']).rstrip('\n'))
          for e in body if 'paragraph' in e]
    want = [p[0].lstrip('\t') for p in paras]
    got = [t for _, t in dp]
    if len(want) != len(got) or any(a != b and a != b.lstrip('\t') for a, b in zip(want, got)):
        print(f'MISMATCH: {len(got)} doc paragraphs vs {len(want)} expected')
        for i, (a, b) in enumerate(zip(want, got)):
            if a != b.lstrip('\t'):
                print(f'  #{i}\n   file: {a[:80]!r}\n   doc:  {b[:80]!r}')
                break
        sys.exit(1)
    end = body[-1]['endIndex'] - 1
    reqs = [
        {'deleteParagraphBullets': {'range': {'startIndex': 1, 'endIndex': end}}},
        {'updateParagraphStyle': {'range': {'startIndex': 1, 'endIndex': end},
                                  'paragraphStyle': {'namedStyleType': 'NORMAL_TEXT'},
                                  'fields': 'namedStyleType'}},
        {'updateTextStyle': {'range': {'startIndex': 1, 'endIndex': end}, 'textStyle': {},
                             'fields': 'bold,italic,underline,link,fontSize,weightedFontFamily'}},
    ]
    styles = {'H1': 'TITLE', 'H2': 'HEADING_1', 'H3': 'HEADING_2'}
    groups = {}
    for (t, r, kind, g), (s, text) in zip(paras, dp):
        e = s + u(text)
        if kind in styles:
            reqs.append({'updateParagraphStyle': {
                'range': {'startIndex': s, 'endIndex': e + 1},
                'paragraphStyle': {'namedStyleType': styles[kind], 'keepWithNext': True},
                'fields': 'namedStyleType,keepWithNext'}})
        if g:
            groups.setdefault(g, [kind, s, e])[2] = e
        shift = u(t) - u(text)  # 1 if the doc already lost a nesting tab
        for a, b, k in r:
            reqs.append({'updateTextStyle': {
                'range': {'startIndex': s + a - shift, 'endIndex': s + b - shift},
                'textStyle': {k: True}, 'fields': k}})
    # last list first: bulleting strips nesting tabs, which shifts later text
    for g, (kind, s, e) in sorted(groups.items(), reverse=True):
        reqs.append({'createParagraphBullets': {
            'range': {'startIndex': s, 'endIndex': e},
            'bulletPreset': 'NUMBERED_DECIMAL_ALPHA_ROMAN' if kind == 'num' else 'BULLET_DISC_CIRCLE_SQUARE'}})
    os.makedirs(args.out, exist_ok=True)
    out = {'documentId': doc['documentId'], 'requests': reqs,
           'writeControl': {'requiredRevisionId': doc['revisionId']}}
    json.dump(out, open(os.path.join(args.out, 'format.json'), 'w'), ensure_ascii=False)
    print(f'text matches ({len(dp)} paragraphs); {len(reqs)} requests -> {args.out}/format.json')


ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest='cmd', required=True)
a = sub.add_parser('text')
a.add_argument('md')
a.add_argument('--out', required=True)
b = sub.add_parser('format')
b.add_argument('md')
b.add_argument('doc')
b.add_argument('--out', required=True)
args = ap.parse_args()
cmd_text(args) if args.cmd == 'text' else cmd_format(args)
