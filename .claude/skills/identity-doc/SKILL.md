---
name: identity-doc
description: Build or update a client's Identity document - who they are, what they sell (offer, proof, objections, CTA wording), the 3-3-3 (pillars, formats, perspectives), their voice profile, and their story bank - from their own words, and mirror it into their Identity Google Doc (it replaces the older "Your Voice" doc). Use as step 8 of the content system, or when Tait asks for a client's identity, brand voice, offer or story bank.
---

# identity-doc

One of the three documents every client gets (with Customer Data and
Research). Content ideas read it to know **who is talking and what they
can honestly say**. Every line comes from the client's own words: the
voice memo, calls, their website, posts they wrote. Nothing invented.

## The four parts, each its own file in `clients/<slug>/sources/`

| File | What's in it | Built by |
|---|---|---|
| `offer.md` | the business in their words; each offer (what's included, price if they said); proof and results (real numbers only); objections they hear and how they answer; how people start and the exact CTA wording they use | this skill |
| `positioning.md` | the 3-3-3: pillars, formats, perspectives, with who said it | this skill, in the shape of `clients/fully-launched/sources/positioning.md` (see `client-onboarding` step 3) |
| `voice.md` | the voice profile: how they sound, words that are theirs, words they never use, their perspectives | `tasteful-content` section 2 |
| `story-bank.md` | every story from the voice memo | this skill |

Then `scripts/build_identity.py clients/<slug>` joins them into
`sources/identity.md` (generated: edit the parts, never this file), and
that file is mirrored into the Google Doc.

## Rules

- Quote the client wherever possible, tagged with who said it
  (`[Pat, voice memo]`). Square brackets are the only edit inside a quote.
- Anything the material can't answer: `[pending: needs <what>]`. A price,
  result or number that isn't in their words never goes in.
- Candidates Tait still has to decide (a pillar, a perspective) are marked
  **[To confirm]**, with the quote they came from.
- No em dashes. Hold everything against `brain.md`'s Do / don't list.

## offer.md

```
# <Client>: Offer

**Last updated:** YYYY-MM-DD
**Sources:** <files>

---

## The business in their words
## What they sell
### <Offer name>
- **What's included:**
- **Price:** (only if they said it)
- **Who it's for:**
## Proof and results
- "<quote with the real number>" [who, source]
## Objections and how they answer them
- **"<objection, in the customer's words if quoted>"** → "<how the client answers it>" [source]
## How people start (calls to action)
- The first step, in their words, and the exact phrasing to use on camera.
```

## story-bank.md

One entry per story the client named (from the `[story]` prompts and any
story they told elsewhere):

```
### S1. <short title>
- **Prompt (ask this on camera):** "<the story prompt, as asked>"
- **What they said on the memo:** "<their one or two sentences, verbatim>"
- **Why it lands:** <one line: which customer pain, fear or dream it touches, from Customer Data>
- **Fits:** <pillar> · <format>
- **Source:** <file>
```

Leave out prompts they skipped. Never fill in the story yourself: the full
story comes on camera.

## Steps

1. Read `brain.md`, every transcript in `sources/`, `customer-data.md`, and
   `research/industry-primer.md` (for context only, never as their words).
2. Write or update `offer.md`, `positioning.md` and `story-bank.md`; run
   `tasteful-content` section 2 for `voice.md` if it's missing or the new
   memo shows something new about their voice.
3. `python3 .claude/skills/identity-doc/scripts/build_identity.py clients/<slug>`
4. Mirror `sources/identity.md` into the Google Doc (load
   `anthropic-skills:google-workspace` first; scripts in
   `.claude/skills/customer-data-doc/scripts/`):
   - **New client:** create `<Client>: Identity` in the client's Important
     Documents folder (`client-onboarding`), fill it with `gdoc_build.py
     text` then `format`, put its link on the `**Drive:**` line of
     `identity.md` and in `brain.md`.
   - **A client with a "Your Voice" doc** (Fully Launched, Grad Gig): that
     doc becomes the Identity doc, same link. Rename it with Drive
     `update_file` to `<Client>: Identity`, then replace its contents
     (`gdoc_sync.py` against the new `identity.md`; if the diff is most of
     the doc, delete the body and insert `gdoc_build.py text`), then
     `format`. Update the title on the portal's Documents list (operator
     dashboard → Clients → Edit → Documents).
   - Verify: `gdoc_sync.py` against a fresh read gives 0 requests.
5. `grep -c '—'` is 0 on every file. List the pending and To confirm items
   for Tait.
