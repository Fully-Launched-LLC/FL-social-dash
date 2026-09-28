#!/usr/bin/env python3
"""Style freshly inserted "Talking points" / "Ask on camera" lines in a Content Ideas doc.

Usage: format_new_fields.py <doc.json> --out DIR

Run after gdoc_sync.py inserts the new lines (they arrive as plain text that
copies the style of the line they were inserted in front of). For each run of
new lines it clears bold/italic, bolds the "Talking points:" and "Ask on
camera:" labels, and rebuilds the bullets so talking points nest one level
under their label. Writes DIR/format_new.json (update_doc arguments).
"""
import argparse
import json
import os

LABELS = ('Talking points:', 'Ask on camera:')


def u(s):
    return len(s.encode('utf-16-le')) // 2


ap = argparse.ArgumentParser()
ap.add_argument('doc')
ap.add_argument('--out', required=True)
a = ap.parse_args()
doc = json.load(open(a.doc))
doc = doc.get('content', doc)
body = (doc['tabs'][0]['documentTab'] if 'tabs' in doc else doc)['body']['content']
paras = [(e['startIndex'], e['endIndex'],
          ''.join(x.get('textRun', {}).get('content', '') for x in e['paragraph']['elements']).rstrip('\n'))
         for e in body if 'paragraph' in e]

runs, cur = [], []
for s, e, t in paras:
    if t.startswith(LABELS) or (t.startswith('\t') and cur):
        cur.append((s, e, t))
    else:
        if cur:
            runs.append(cur)
        cur = []
if cur:
    runs.append(cur)

reqs = []
for run in reversed(runs):  # last run first: bulleting strips tabs and shifts what follows
    s, e = run[0][0], run[-1][1]
    reqs.append({'updateTextStyle': {'range': {'startIndex': s, 'endIndex': e - 1},
                                     'textStyle': {}, 'fields': 'bold,italic'}})
    for ps, _, t in run:
        for lab in LABELS:
            if t.startswith(lab):
                reqs.append({'updateTextStyle': {'range': {'startIndex': ps, 'endIndex': ps + u(lab)},
                                                 'textStyle': {'bold': True}, 'fields': 'bold'}})
    reqs.append({'deleteParagraphBullets': {'range': {'startIndex': s, 'endIndex': e - 1}}})
    reqs.append({'createParagraphBullets': {'range': {'startIndex': s, 'endIndex': e - 1},
                                            'bulletPreset': 'BULLET_DISC_CIRCLE_SQUARE'}})
os.makedirs(a.out, exist_ok=True)
json.dump({'documentId': doc['documentId'], 'requests': reqs,
           'writeControl': {'requiredRevisionId': doc['revisionId']}},
          open(os.path.join(a.out, 'format_new.json'), 'w'))
print(f'{len(runs)} runs, {len(reqs)} requests -> {a.out}/format_new.json')
