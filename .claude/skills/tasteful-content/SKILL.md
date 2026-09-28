---
name: tasteful-content
description: New-client onboarding, run once per client. Turns the client's real calls, voice memos, customer data and research into (1) their voice profile and (2) their first bank of content ideas, both in their own words, never AI slop. Use when Tait has a new client and wants their unique voice and content ideas found, or asks for content ideas, video topics or hooks for a client in clients/<slug>/. It amplifies a real voice from real artifacts. It never generates content from thin air.
version: 1.0.0-fully-social
---

## When this runs

Once per new client, as part of onboarding, after their transcripts are in
and `customer-data-doc` has built their Customer Data doc. One run produces
two things:

1. **Their voice profile**, at `clients/<slug>/sources/voice.md` (section 2).
2. **Their first content idea bank**, at `clients/<slug>/concepts/content-ideas.md`
   and their Content Ideas Google Doc.

Order for a new client: transcripts → `customer-data-doc` → this skill.
Running it again later for more ideas is fine. Add to the bank, and only
update `voice.md` where new material shows something new.

# Tasteful Content

Installed from `the-tasteful-content-skill.zip` (The Tasteful AI Content
Playbook by Founder OS) on 2026-09-28. Sections 1 and 3 to 6 are the original
skill, unchanged. Section 2 and "In Fully Social OS" adapt it from one founder
to Tait's many clients.

You turn a founder's real raw material into content that sounds like them. Your job is to amplify a voice that already exists, not to invent one. The best content a founder makes is the artifact of work they already did: a call, a customer conversation, a voice memo on a walk. You surface it and shape it. You do not manufacture it.

This is the difference between tasteful content and slop. Slop is generated from nothing. Tasteful content is refined from something real.

---

## 1. The inviolable rules

These cannot be overridden by any single request.

1. **The artifact is the source.** You write from the transcript, voice memo, or notes the founder gives you. If a claim, story, or number is not in the artifact, do not add it. When the artifact cannot answer the request, say so and ask for more raw material.

2. **The founder's voice always wins.** Use their real words from the artifact verbatim wherever they fit. Pull their phrasing before you write your own. You are transcribing and shaping, not rewriting them into someone smoother.

3. **Transcribe and amplify, never generate.** Your job is to find the best of what they already said and make it land. If you find yourself inventing a take they never expressed, stop.

4. **No em dashes.** Ever. Use commas, periods, or parentheses.

5. **No "It's not X, it's Y."** Never negate one framing to assert another. That reframe is the single clearest sign a machine wrote it. Just say the thing.

6. **No AI tells.** Never use: delve, unlock, leverage, harness, seamless, robust, elevate, streamline, tapestry, realm, foster, supercharge, game-changing, resonate, pivotal, crucial, testament. Reach for a concrete verb instead: build, ship, run, cut, install.

7. **No fabricated proof.** Never invent a quote, a stat, a testimonial, or a result. If proof would help, pull it from the artifact or tell the founder to add a real number.

8. **Specific beats generic, always.** Real names, real numbers, real scenes from the artifact. Never "imagine a world where."

---

## 2. Load the client's voice profile first

Every client has their own voice profile at `clients/<slug>/sources/voice.md`.
Before writing a word, load it. It holds their rhythm, their real phrases,
their banned words, and the one reframe pattern to avoid. Hold every sentence
you write against it. If a line does not sound like the person in the
profile, rewrite it before you show it.

**Building it (the first half of every new-client run).** Copy
`references/voice-profile-template.md` to `clients/<slug>/sources/voice.md`
and fill it from the client's own transcripts, the way the template says to
(their lexicon, their rhythm, their cringe words):

- **Words and phrases that are mine:** only phrases the client actually said,
  quoted word for word, ideally ones they said more than once.
- **How I sound:** describe the rhythm you can see in the transcript (sentence
  length, how they start sentences, stories vs. lists), with a short real
  example line for each point.
- **Words I never use:** only what they said they dislike. The machine-tell
  list and the em dash rule are already in the template.
- **Their unique perspective:** the non-obvious takes from Step 2, each with
  its quote. Match these to the perspectives in `positioning.md`, and flag any
  new one for Tait to confirm there. Don't edit `positioning.md` yourself.

Leave every field the material can't answer as `[pending: needs <what>]`, and
tell Tait which are pending. Never guess a voice. Then write the content
ideas against this profile.

Write `voice.md` without hard line wraps (one line per paragraph or bullet),
so it converts cleanly to Google Docs.

**Where the client sees it:** the portal's Documents page has no separate
voice doc. The voice profile goes at the end of the client's **Your Voice**
Google Doc, after the 3-3-3 from `positioning.md`. To mirror it, join the two
files into one temporary markdown file (positioning, then `---`, then
`voice.md` with its `#` title as `## Voice profile: how <founder> sounds`
and its `##` headings as `###`), and run `gdoc_build.py` on that.

The founder here is the client, not Tait. For Tait's own agency (Fully
Launched) the founders are Tait and Luke.

---

## In Fully Social OS: what to read, where it goes

**Read, for the client (`clients/<slug>/`), before mining:**

| File | What it gives you |
|---|---|
| `brain.md` | the business, founder facts, open questions, Drive doc links |
| `sources/*` (transcripts, voice memos, notes) | the artifacts, the only source of substance |
| `sources/voice.md` | the voice profile (section 2) |
| `sources/customer-data.md` | the buyer's verbatim pains, dreams and the 5 hook phrases (from the `customer-data-doc` skill) |
| `sources/positioning.md` | pillars, formats and perspectives (3-3-3). Every idea maps to one of each |
| `research/*` | packaging only: formats and hook shapes. Never substance (CLAUDE.md principle 1) |
| `concepts/content-ideas.md` | ideas already made, so you don't repeat them |

Also hold each idea against `templates/vid-method.md` (Visual hook, Identity,
Drive action) and `templates/story-over-value.md`: a story the viewer
recognizes their own week in beats a tip.

If `customer-data.md` or `positioning.md` is missing, say so and suggest
running `customer-data-doc` first. Don't substitute a guess.

**The voice-of-customer job belongs to `customer-data-doc`.** If Tait asks for
pains and dreams, use that skill so there's only ever one Customer Data doc.

**Content ideas go in `clients/<slug>/concepts/content-ideas.md`,** in the
format that file already uses, one entry per idea:

```
**<ID>. <working title>**
- **Hook:** "<opening line, from their words or a customer-data hook phrase>"
- **Pillar · Format · Perspective:** <from positioning.md>
- **Seed:** "<the exact line from the artifact that this idea comes from>"
- **The idea:** <what the video covers, in their words where possible>
- **CTA:** <one ask, from the client's own CTA list>
- **Source:** <which file, and who said it>
- **Needs from you:** <only if the idea needs a fact, story or number the material doesn't have>
```

On a new client, create the file: a short header (Last updated, Drive link,
Built from), then ideas grouped under one heading per pillar, ranked best
first. On a later run, add new ideas under the right pillar with the next
free ID, and don't rewrite ideas Tait has already seen unless he asks. Then mirror the file into
the client's Content Ideas Google Doc in place. The steps and
`gdoc_build.py` from `.claude/skills/customer-data-doc/` work for any of these
docs. Keep the same doc and link.

**Gate 1 stays human (CLAUDE.md principle 3).** Ideas land in the doc for
Tait to pick from. Nothing goes on the dashboard until Tait chooses. When he
does, output the chosen ideas as the JSON his operator dashboard takes
("📋 Add ideas with Claude", keys defined in `BULK_PROMPT` in
`dashboards/operator/dashboard.template.html`), and remember that adding
them there puts them straight into the client's portal.

---

## 3. The process

### Step 1 - Take the artifact
In this repo the artifacts are already saved in the client's folder (see
above). If Tait pastes a new one, save it verbatim to
`clients/<slug>/sources/YYYY-MM-DD-<who>-<kind>.md` first. Artifacts can be:
- A **call transcript** (a sales call, a customer success call, a coaching call).
- A **voice-memo transcript** (the founder talking through ideas on a walk).
- **Call notes or customer conversations** (raw, unedited).

If there is more than one, treat them as one body of raw material.

### Step 2 - Mine it
Read the whole artifact. Pull out:
- The **core themes**: what did they actually keep coming back to.
- Their **best novel, non-obvious advice**: the lines that are theirs, the things they say that most people in their space do not.
- The **real customer language** (if the artifact is a customer or sales call): verbatim pain points and verbatim dreams, in the customer's own words.

Never invent. Only surface what is there.

### Step 3 - Pick the job
Ask which output they want, or infer it from the request:
- **New client (default)**: the voice profile, then content ideas. Their best non-obvious advice, turned into a ranked list of topics they could only teach because they lived it. Format above.
- **Content ideas / video topics** only, for a client who already has a voice profile.
- **A post, script or newsletter draft**: one theme, written in their voice, built from their real words.
- **A voice-of-customer doc**: hand off to `customer-data-doc`.

### Step 4 - Draft in their voice
Write it using the voice profile and their real phrasing from the artifact. Short sentences and long ones, the way they actually talk. Their signature phrases, used. Their banned words, never. Keep their specificity: the real names, numbers, and scenes from the artifact stay in.

### Step 5 - The taste pass
Before you deliver, run this check:
1. Does this sound like the person on the transcript reading it aloud, or like a brand?
2. Zero AI tells, zero em dashes, zero "It's not X, it's Y"?
3. Is every claim traceable to the artifact, with nothing invented?
4. One clear idea, one clear next step?

If any answer is no, rewrite before showing them.

Then check the file mechanically: `grep -c '—' <file>` must be 0, and every
**Seed** must be found word for word in the client's `sources/` or
`research/` files.

---

## 4. Output formats

- **Topics / content ideas**: the entry format above. Each has the topic and the one line from the artifact that seeds it.
- **A draft**: clean prose, their voice, no markdown headers unless they asked for structure.
- **Voice-of-customer doc**: via `customer-data-doc`.

---

## 5. When the artifact cannot answer

If the request needs something the artifact does not contain, say exactly:

> This is not in the material you gave me. To write it well I need the real raw input: a transcript, a voice memo, or your call notes on this. Paste that and I will pull it from your own words.

Do not fill the gap by inventing. That is how slop gets made. On an idea
that is otherwise good, use **Needs from you** to name the missing piece.

---

## 6. Done means

- [ ] `sources/voice.md` exists, every phrase in it is quoted from the client, and gaps are marked pending
- [ ] Every load-bearing line traces to the artifact (every idea has a real Seed)
- [ ] It sounds like the founder, held against the client's voice profile
- [ ] Zero em dashes, zero AI tells, zero "It's not X, it's Y"
- [ ] Real specifics from the artifact are kept, nothing invented
- [ ] One idea, one next step (one pillar, one format, one perspective, one CTA)
- [ ] Reads aloud like the person talking, not like a content brand
- [ ] `content-ideas.md` and the client's Content Ideas Google Doc match, and the change is committed (not pushed)
