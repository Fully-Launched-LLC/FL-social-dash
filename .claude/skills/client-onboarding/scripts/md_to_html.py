#!/usr/bin/env python3
"""Convert a client markdown file to simple HTML for Drive create_file (text/html).

Usage: md_to_html.py <file.md> > out.html

For NEW Google Docs only: Drive converts <h1>-<h3>, <p>, <ul>/<ol>, <b>, <i>
into native Docs formatting in one call. Existing docs are updated in place
with customer-data-doc's gdoc_build.py instead, so their link never changes.
Handles the subset these files use: #/##/### headings, "- " bullets (one
level of nesting), "1. " lists, **bold**, *italic*, --- rules, "> " quotes.
The "**Drive:**" line and backticks are dropped, as in gdoc_build.py.
"""
import html
import re
import sys


def inline(s):
    s = html.escape(s.replace('`', ''), quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    return re.sub(r'\*(.+?)\*', r'<i>\1</i>', s)


out, stack = [], []  # stack of open list tags


def close_lists(depth=0):
    while len(stack) > depth:
        out.append('</li></%s>' % stack.pop())


for line in open(sys.argv[1]).read().split('\n'):
    if line.startswith('**Drive:**'):
        continue
    m = re.match(r'^(\s*)(- |\d+\. )(.*)', line)
    if m:
        depth = 1 + (len(m.group(1)) > 0)
        tag = 'ul' if m.group(2) == '- ' else 'ol'
        if len(stack) < depth:
            stack.append(tag)
            out.append('<%s><li>' % tag)
        else:
            close_lists(depth)
            out.append('</li><li>')
        out.append(inline(m.group(3)))
        continue
    if line.startswith('   ') and stack:  # a continuation line inside a list item
        out.append('<br>' + inline(line.strip()))
        continue
    close_lists()
    if not line.strip() or line.strip() == '---':
        continue
    h = re.match(r'^(#{1,3}) (.*)', line)
    if h:
        n = len(h.group(1))
        text = re.sub(r'^\d+\. ', '', h.group(2)) if n == 2 else h.group(2)
        out.append('<h%d>%s</h%d>' % (n, inline(text), n))
    else:
        out.append('<p>%s</p>' % inline(line[2:] if line.startswith('> ') else line))
close_lists()
if '—' in ''.join(out):
    sys.exit('Em dash found. Fix the markdown first.')
print('<html><body>' + ''.join(out) + '</body></html>')
