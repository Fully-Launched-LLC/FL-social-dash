---
name: client-onboarding
description: The full new-client setup, in order. Takes a client's transcripts (voice memos, calls, notes, research memos) and builds the same four documents Fully Launched has (Customer Data, Your Voice 3-3-3 plus voice profile, Content Ideas, Content Research), mirrored into Google Docs and listed on the client's portal. Use when Tait sends transcripts for a client and wants them "organized like Fully Launched", or starts onboarding a new client.
---

# client-onboarding

The order Fully Launched was built in, as one repeatable run. Reference
output: everything in `clients/fully-launched/`. Match its files, headings
and style exactly.

## Rules for the whole run

- CLAUDE.md principles apply: substance only from the client's own words,
  never invent a fact, no em dashes, two human gates.
- Every authored line traces to a source. Anything the material can't
  answer is marked `[pending: needs <what>]` or **Needs from you**, never
  filled in.
- The client's `brain.md` is read first and updated last. Its Do / don't
  list binds every document (Grad Gig: never imply background checks).

## Before the order: the client's Drive folders

When Tait adds a client (or says "make <client>'s Drive folders"), create in
Google Drive, inside the shared **Fully Social OS** folder (find it with Drive
search, `title contains 'Fully Social OS'`):

```
<Client Name>/
  Important Documents   brand files from onboarding; their Google Docs
  Previous Content      footage they already have (onboarding asks for it)
  Raw Footage           new clips; per-video folders go in here
  Finished Videos       editors' cuts
```

Then put the links on the operator dashboard, Clients → Edit: main folder,
Important Documents, Previous Content, raw footage, finished videos. Their
onboarding steps' folder buttons use these. Per-video raw footage folders
(`NN. Title (posts Mon D)`) go inside Raw Footage and on each video's
"Raw footage folder for this video" field.

## If they onboarded through the portal

Clients text their voice memo to Tait; he pastes the transcript in Clients →
**Onboarding** and builds their Customer Data and Your Voice documents
(`api/build-documents.js`). That view shows the transcript, their brand and
written notes, and the documents. Then:
- Step 1: save that transcript verbatim as
  `clients/<slug>/sources/YYYY-MM-DD-<who>-voice-memo.md`.
- Steps 2 to 4: review the built documents against this skill's rules
  (fix anything flagged "check: not word for word"), write them to the repo
  files, then continue with the Google Docs (step 6) and portal (step 7).

## The order

### 1. Save the transcripts

Save each one verbatim, one file per recording:
`clients/<slug>/sources/YYYY-MM-DD-<who>-<kind>.md` (a research memo goes in
`research/`). Header: who, when, what kind, then the text exactly as given.
Never tidy the transcript. Ask who is speaking if it isn't clear.

### 2. Customer Data → skill `customer-data-doc`

Builds `sources/customer-data.md`: verbatim pains, dreams, 5 hook phrases,
full recordings at the bottom. Verify with its `verify_quotes.py`.

### 3. Your Voice: the 3-3-3 → `sources/positioning.md` (this step)

Same shape as `clients/fully-launched/sources/positioning.md`:
- **What this document is** (the 3-3-3 explained in one paragraph).
- **Pillars (3):** for each: What we do, Who it's for, Our angle, each line
  tagged with who said it (`[Luke]`, `[Tait]`).
- **Formats (3)** and **Unique perspectives (3)**.
- **Where we post** and **Calls to action**, only if the material says.
- **How to use this document** (pick one pillar, one format, one
  perspective, one CTA).

The 3-3-3 is Tait's creative call (see Grad Gig's `brain.md`). So:
anything the client said directly is tagged with their name; anything that
is only a candidate is marked **[To confirm]**, with the quote it came from.
Never state a pillar, format or perspective as decided unless Tait or the
client decided it in the material.

### 4. Voice profile + Content Ideas → skill `tasteful-content`

Builds `sources/voice.md` and `concepts/content-ideas.md`. It needs steps 2
and 3 first.

### 5. Content Research → `research/content-research.md` (this step)

Only from research Tait actually did and sent (a Reddit memo, competitor
notes, YouTube titles). Same shape as Fully Launched's: Tait's big
takeaways (quoted), then one table per source, **What people are asking**
(their words) and **Tait's take** (his words, or *(no take yet)*). Keep the
empty sections (YouTube, Competitors, Trending, Other industries) with
*Nothing added yet.* Research shapes packaging only (principle 1). If Tait
sent no research, create the file with only the empty sections and say so.

### 6. Google Docs, one per file

Load `anthropic-skills:google-workspace` first. The four docs, titled
without em dashes:

| Google Doc | Built from |
|---|---|
| `<Client>: Customer Data` | `sources/customer-data.md` |
| `<Client>: Your Voice (3-3-3 and voice profile)` | `sources/positioning.md`, then `sources/voice.md` (see `tasteful-content`) |
| `<Client>: Content Ideas` | `concepts/content-ideas.md` |
| `<Client>: Content Research` | `research/content-research.md` |

- If the client already has one (check `brain.md` and Drive search), update
  it in place. Keep the link.
- Otherwise create it with Drive `create_file` in the client's
  `05 Assets` folder (find it with Drive search, `title contains`), empty,
  then fill it with `gdoc_build.py` (see `customer-data-doc`, step 6).
  Tables (Content Research) don't go through `gdoc_build.py`: for a new doc,
  create it from HTML with `create_file` (`text/html`) instead.
- Put each link on the file's `**Drive:**` line and in `brain.md`.

### 7. Put the docs on the portal

Operator dashboard → Clients → the client → Edit → Documents: add each doc
(title + link). This writes `social_client_documents`, which the client
portal's Documents page reads. Tait must be signed in; Claude never enters
his password. Show Tait the list before saving.

### 8. Finish

- Update `brain.md`: sources, doc links, voice, open questions.
- Check: `grep -c '—'` is 0 on every authored file.
- Commit on a branch (never `main`). Push only when Tait asks.
- Report: what each doc holds, what's **pending** or **To confirm**, and
  the questions only Tait or the client can answer.
