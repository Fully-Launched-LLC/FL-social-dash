---
name: editing-guidelines-doc
description: Turn a client's moodboard (screenshots and videos of motion graphics, fonts, text styles, colours and video styles Tait dropped in) plus their brand guidelines into their Editing guidelines, the style guide the Content Editor reads before every edit. Use when the bridge asks for a client's editing guidelines, when new moodboard items arrive, or when Tait asks for a client's editing style.
---

# editing-guidelines-doc

Tait, 2026-10-21: "my goal is to drop in a moodboard that an ai agent turns
into an editing style guide for the editor agent." One of each client's 5
documents. **Operator-only.** The Content Editor reads the approved version
before every edit, and **no edit starts until Tait approves it**.

## Inputs (read all of them)
1. **The moodboard:** `python3 bridge/bridge.py moodboard get --client <slug>`
   downloads every item and prints Tait's notes. Look at every image (Read
   it), watch every video (`watch` skill). Tait's note on an item outranks
   your reading of it.
2. **House style:** `team/content-editor/house-style.md` (the starting point).
3. **Brand guidelines** (approved): `bridge.py doc get --client <slug> --kind brand_guidelines`.
4. **Identity:** `--kind identity` (who they are, what they sell, formats).
5. If they exist: `clients/<slug>/style-profile.md`, `graphics/INDEX.md`
   (graphics Tait kept or passed), `team-room/feedback-log.md`.

## What to pull from the moodboard
For each item, one line: what it is, what's worth copying (layout, motion,
type, colour, pace), and which section it feeds. Then generalise only what
the items actually show. Two items disagreeing → list both and ask Tait.

## The document (Markdown, these sections)
```
# <Client>: editing guidelines
Built from: moodboard (N items, dates), brand guidelines (approved <date>), house style.

## The look in one paragraph
## Layouts            (split frame, full face, full-screen graphics: when each)
## Captions           (font, size, weight, case, placement, keyword colour, animation, words per beat)
## Text styles        (headlines, title tags, labels: fonts, mixes like bold sans + italic serif, colours)
## Colours            (background, accent, glow, text; hex codes from the brand guidelines)
## Motion graphics    (which of the 7 skills fit them, new styles from the moodboard, how they move, swipes)
## Video types        (the formats they make, what each looks like, length)
## Pacing             (cut speed, how often the frame changes, punch-ins)
## Music              (mood, tempo, favourites from the Library, never use)
## Sound effects      (which kinds, how many, where)
## Reusable lines     (CTA wording, sign-offs, recurring on-screen lines, from their identity)
## Don'ts
## Moodboard notes    (one line per item: what we took from it)
```
Differences from the house style are marked **(this client)**. Nothing
invented about the client: their facts, CTAs and colours come from their
documents.

## Save it
`clients/<slug>/sources/editing_guidelines.md`, then
`python3 bridge/bridge.py doc put --client <slug> --kind editing_guidelines --file clients/<slug>/sources/editing_guidelines.md --status on_desk --built-by "Content Editor" --sources "moodboard (N items), brand guidelines"`
and `python3 bridge/bridge.py moodboard used --client <slug>`.
