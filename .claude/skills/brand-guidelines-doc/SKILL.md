---
name: brand-guidelines-doc
description: Build a client's Brand guidelines document (colours, fonts, logo, look and feel, do's and don'ts) from their own answers, the brand files they uploaded and their website's real styles. Nothing invented. The one client document the client can see once Tait approves it. Use when the Account Manager builds a new client's documents, or Tait asks for a client's brand guidelines.
---

# brand-guidelines-doc

One of the five documents every client gets (brand guidelines, ICP,
identity, editing guidelines, content research). Unlike the others, **the
client sees this one** once Tait approves it, so write it for them: plain,
tidy, no internal notes. The Content Editor and Motion Designer read it on
every edit (with the editing guidelines).

## Sources, in this order (cite each in a Sources line)
1. **Their answers**: the brand section of their interview questions and the
   onboarding Brand step (`bridge.py client get`: `onboarding.brand` has
   fonts, colours, look and feel, links to looks they love).
2. **Brand files they uploaded** (onboarding bucket `<client>/brand/`) or
   their brand guidelines link on the client record.
3. **Their website's real styles**: read the site's CSS for the actual hex
   colours and font families (count how often each colour is used; the
   most-used non-grey is usually the primary). Never guess a hex from a
   screenshot when the CSS is there.
4. **Their logo**: describe it; note where the file is.

Anything none of these answer: write `[ask the client]`. Never invent a
colour, font or rule.

## The document (Markdown)
```
# <Client>: brand guidelines

## Colours
| Role | Hex | Where it's used |
(primary, secondary, text, background, accents; mark which came from where)

## Fonts
- Headings: …   - Body: …   - Accent (if any): …
(say if a font is free on Google Fonts or must be licensed)

## Logo
What it looks like, the versions they have, where the files are, the
space and backgrounds it needs.

## Look and feel
3–5 words in their own words ("warm, local, trustworthy"), plus looks they
love (links).

## Do's and don'ts
Only what they said or what their brand files say.

## On video
How the brand shows up in edits: caption colour and keyword colour, the
accent for graphics, end-card style. Only from the above; Tait decides the
rest in the editing guidelines.

Sources: <answers / files / site / logo, with dates>
```

## Save it
`clients/<slug>/sources/brand_guidelines.md`, then put it on Tait's desk:
`python3 bridge/bridge.py doc put --client <slug> --kind brand_guidelines --file clients/<slug>/sources/brand_guidelines.md --status on_desk --built-by "Account Manager" --sources "<…>"`
