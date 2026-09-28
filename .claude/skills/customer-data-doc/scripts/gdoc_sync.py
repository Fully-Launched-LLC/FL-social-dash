#!/usr/bin/env python3
"""Bring an existing Google Doc in line with its markdown file after small edits.

Usage: gdoc_sync.py <file.md> <doc.json> --out DIR

doc.json is an unwrapped read_doc result. Compares the doc's paragraphs with
the file's (parsed the same way as gdoc_build.py) and writes DIR/sync.json:
update_doc arguments that delete removed paragraphs and change only the
characters that differ inside edited ones, so bold labels and italics around
the change keep their style, and inserts new paragraphs as plain text. Much
smaller than a full rebuild. After a sync that inserts paragraphs, read the
doc again and run `gdoc_build.py format` so the new lines get their styles.
"""
import argparse
import difflib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gdoc_build import parse, u  # noqa: E402  (runs no CLI on import: guarded below)

ap = argparse.ArgumentParser()
ap.add_argument('md')
ap.add_argument('doc')
ap.add_argument('--out', required=True)
a = ap.parse_args()

want = [p[0].lstrip('\t') for p in parse(open(a.md).read())]
doc = json.load(open(a.doc))
doc = doc.get('content', doc)
body = (doc['tabs'][0]['documentTab'] if 'tabs' in doc else doc)['body']['content']
paras = [(e['startIndex'], e['endIndex'],
          ''.join(x.get('textRun', {}).get('content', '') for x in e['paragraph']['elements']).rstrip('\n'))
         for e in body if 'paragraph' in e]
got = [t.lstrip('\t') for _, _, t in paras]  # a leading tab is a nesting marker, not text

ops = []  # (index, request): applied from the highest index down
for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, got, want, autojunk=False).get_opcodes():
    if tag == 'equal':
        continue
    if tag == 'insert':
        # new paragraphs go in front of the old paragraph at i1 (never at the very end)
        if i1 >= len(paras):
            sys.exit('insert at the end of the doc: rebuild with gdoc_build.py instead')
        full = [p[0] for p in parse(open(a.md).read())]  # keeps nesting tabs
        text = ''.join(full[j] + '\n' for j in range(j1, j2))
        ops.append((paras[i1][0] - 0.25, {'insertText': {'location': {'index': paras[i1][0]}, 'text': text}}))
        continue
    if tag == 'delete':
        s, e = paras[i1][0], paras[i2 - 1][1]
        ops.append((s, {'deleteContentRange': {'range': {'startIndex': s, 'endIndex': e}}}))
        continue
    if tag == 'replace':
        sim = lambda i, j: difflib.SequenceMatcher(None, got[i], want[j]).ratio()
        pairs = []
        if i2 - i1 >= j2 - j1:
            # pair each new paragraph with the most similar old one, in order;
            # old paragraphs left unpaired are deleted
            start = i1
            for j in range(j1, j2):
                left = (j2 - j) - 1  # old paragraphs the later new ones still need
                best = max(range(start, i2 - left), key=lambda i: sim(i, j))
                pairs.append((best, j))
                start = best + 1
        else:
            # more new than old: pair each old paragraph with the most similar
            # new one, in order; new paragraphs left unpaired are inserted in
            # front of the next paired old paragraph (or the one after the run)
            start = j1
            for i in range(i1, i2):
                left = (i2 - i) - 1
                best = max(range(start, j2 - left), key=lambda j: sim(i, j))
                pairs.append((i, best))
                start = best + 1
            full = [p[0] for p in parse(open(a.md).read())]  # keeps nesting tabs
            pj = [j for _, j in pairs]
            groups = {}
            for j in range(j1, j2):
                if j in pj:
                    continue
                nxt = next((i for i, jj in pairs if jj > j), i2)
                groups.setdefault(nxt, []).append(j)
            for k, js in groups.items():
                if k >= len(paras):
                    sys.exit('insert at the end of the doc: rebuild with gdoc_build.py instead')
                # after every edit inside paragraph k (those sort at >= its start - 0.5)
                ops.append((paras[k][0] - 0.75, {'insertText': {'location': {'index': paras[k][0]},
                                                               'text': ''.join(full[j] + '\n' for j in js)}}))
        paired = {i for i, _ in pairs}
        for i in range(i1, i2):
            if i not in paired:
                ops.append((paras[i][0], {'deleteContentRange': {'range': {'startIndex': paras[i][0], 'endIndex': paras[i][1]}}}))
        for i, j in pairs:
            s, _, old = paras[i]
            new = want[j]
            p = 0
            while p < min(len(old), len(new)) and old[p] == new[p]:
                p += 1
            q = 0
            while q < min(len(old), len(new)) - p and old[-1 - q] == new[-1 - q]:
                q += 1
            ds, de = s + u(old[:p]), s + u(old[:len(old) - q])
            mid = new[p:len(new) - q]
            if de > ds:
                ops.append((ds, {'deleteContentRange': {'range': {'startIndex': ds, 'endIndex': de}}}))
            if mid:
                ops.append((ds - 0.5, {'insertText': {'location': {'index': ds}, 'text': mid}}))
        continue
    sys.exit(f'{tag} of doc paragraphs {i1}-{i2} vs file {j1}-{j2}: rebuild with gdoc_build.py instead')

ops.sort(key=lambda o: -o[0])
os.makedirs(a.out, exist_ok=True)
json.dump({'documentId': doc['documentId'], 'requests': [r for _, r in ops],
           'writeControl': {'requiredRevisionId': doc['revisionId']}},
          open(os.path.join(a.out, 'sync.json'), 'w'), ensure_ascii=False)
print(f'{len(ops)} requests -> {a.out}/sync.json')
