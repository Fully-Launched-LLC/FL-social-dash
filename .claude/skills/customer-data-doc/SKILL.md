---
name: customer-data-doc
description: Build or rebuild a client's Customer Data document from their voice memo or call transcripts, as verbatim pains, verbatim dreams and the 5 hook phrases, then mirror it into the client's Customer Data Google Doc in place. Use when Tait sends transcripts for a new or existing client and wants the customer data / voice-of-customer / pains and dreams document built or updated.
---

# customer-data-doc

Turns a client's transcripts into `clients/<slug>/sources/customer-data.md` and
mirrors it into that client's Customer Data Google Doc (the one on their
portal's Documents page). First built for Fully Launched on 2026-09-28;
`clients/fully-launched/sources/customer-data.md` is the reference output.

## The prompt this skill runs

This is Tait's prompt, word for word. Everything below it is how to carry it out.

> You are my voice-of-customer analyst. I am pasting in transcripts from real
> calls with my customers. Pull their exact language, not your summary of it.
> Give me two lists. Pains, verbatim: the exact words they used for what is
> hard, stuck, or draining. Quote them. Dreams, verbatim: the exact words they
> used for what they want. Quote them.
> For each quote, add a one-line note on where it came from.
> Then give me the 5 phrases I should use in my hooks and headlines, because
> they are already how my buyer talks.
> Never invent a quote. Only use what is in the transcripts. No em dashes.

The transcripts are usually voice memos (the client founder, a cofounder,
Tait's own research memo read out loud), not customer calls. Treat them the
same way, and say in the doc which kind they are.

## Hard rules

- **Never invent a quote.** Every quote must be in a transcript. No
  paraphrase, no "tidied up" wording, no inferred or brainstormed section.
  This document has no "unconfirmed" or AI-inferred part, even though
  `templates/anti-slop-checklist.md` describes one: Tait's prompt above wins.
- **No em dashes** anywhere: quotes, notes, headings, the doc title.
- **Square brackets are the only edit allowed inside a quote**, and only to
  fix a transcription error or add a missing word ("fair" → "[Faire]",
  "what the post" → "what [to] post"). "..." marks words cut from the middle.
- **The client is not the customer** (CLAUDE.md principle 1). The founder
  describing their customer is the normal case. Label it that way. Never
  present it as the customer's own words.
- If the transcripts have no dreams, or fewer than 5 hook-worthy phrases,
  say so in the doc instead of padding.

## Steps

### 1. Collect the transcripts

- Ask for the client slug if it isn't obvious. Read `clients/<slug>/brain.md`
  and list `clients/<slug>/sources/` and `clients/<slug>/research/` for
  transcripts already saved. A rebuild uses all of them plus anything new.
- Save each new transcript verbatim, one file per recording:
  `clients/<slug>/sources/YYYY-MM-DD-<who>-<kind>.md` (for example
  `2026-09-25-tait-voice-memo.md`). Research memos go in `research/`. Never
  clean up the transcript text itself.
- Chat notes Tait types (not recorded) count as a source. Quote them as
  "notes in chat".

### 2. Pull the quotes

Read every transcript in full. For each passage about what is hard, stuck,
draining or feared → **Pains**. For each passage about what they want →
**Dreams**.

- Copy the exact words. Short, punchy fragments beat long run-ons. Cut the
  run-on down with "..." rather than rewording it.
- Group each list under short plain-English theme headings (for example "No
  time, and no idea what to post", "Fears, spoken and unspoken", "What
  customers say", "From Reddit"). Number the quotes straight through each list.
- One-line note under each quote, in italics: who said it, and about what.
  Use the speaker labels explained in "How to read this" (below).
- **Two-sided businesses** (a marketplace like Grad Gig: homeowners who hire,
  students who work) have two different buyers. Split each list by audience
  first ("For homeowners", "For students"), then by theme, and pick hook
  phrases for each side. Never mix one side's quotes into the other's list.

### 3. Pick the 5 hook phrases

Pick phrases the buyer already says, preferring ones that (a) come from the
buyer's side (Reddit posts, "what customers say") and (b) show up more than
once across the transcripts. For each: the phrase in bold, a `*Why:*` line
citing where it appears, and an `*As a hook:*` line with one example hook
that keeps the phrase intact.

### 4. Write `clients/<slug>/sources/customer-data.md`

Follow the reference output's shape exactly:

```
# <Client>: Customer Data

**Drive:** mirror of this file (see brain.md for the current link)
**Last updated:** YYYY-MM-DD
**Built from:** <each source, dated>. The full recordings are at the bottom.

## How to read this
- bullets: word for word, square brackets, "...", the speaker labels
  (nested bullets), and a "Good to know" line saying whether any of it is
  from real customer calls yet

---

## 1. Pains, verbatim
### <theme>
1. "<quote>"
   *<source note>*

## 2. Dreams, verbatim
(same shape)

## 3. The 5 phrases to use in hooks and headlines
<one-line intro>
1. **"<phrase>"**
   *Why:* ...
   *As a hook:* ...

## 4. Source material
The full, word-for-word recordings. Also saved in the repo:
<repo paths, one line>

### A. <source title>
<full transcript, verbatim>
```

### 5. Verify before it goes anywhere

```
python3 .claude/skills/customer-data-doc/scripts/verify_quotes.py clients/<slug>/sources/customer-data.md
```

It checks every numbered quote against section 4's transcripts (ignoring
bracketed words and "...") and counts em and en dashes. Fix every miss, then
run it again. It must print `0 fragments missing` and `em dashes: 0`.

### 6. Mirror it into the Google Doc

Load the `anthropic-skills:google-workspace` skill and read its
`references/docs.md` first.

**Find the doc.** It's the "Customer Data" row in `social_client_documents`
for this client (operator dashboard → Clients → Edit → Documents), and
`brain.md` lists its link. Use that same doc and link. Never create a second
one. Only if the client has none: create it with Drive `create_file` in the
client's `05 Assets` folder, then add the link to `brain.md` and tell Tait to
add it on Clients → Edit so it shows in the portal.

**Replace the contents in place** (Tait has asked for a full replace, so
clearing the body is expected here):

1. `read_doc` → note `revisionId` and the body end index. The result is
   large and gets saved to a file. Unwrap it:
   `python3 -c "import json;d=json.load(open('<saved>'));json.dump(d.get('content',d),open('doc.json','w'))"`
2. `python3 .claude/skills/customer-data-doc/scripts/gdoc_build.py text clients/<slug>/sources/customer-data.md --out <scratch>/gdoc`
   writes `text.txt` (the body, with long transcripts swapped for
   `PLACEHOLDER_<n>`) and one `placeholder_<n>.txt` per transcript.
3. One `update_doc`, guarded by `requiredRevisionId`: `deleteContentRange`
   1 → end−1, then `insertText` of `text.txt` at index 1. Use `\u000b` (a
   line break inside one list item) exactly where the file has it.
4. One `update_doc` per placeholder: `replaceAllText` of `PLACEHOLDER_<n>`
   with that transcript. Keeping each call small is what makes this reliable.
5. `read_doc` again, unwrap it, then
   `python3 .claude/skills/customer-data-doc/scripts/gdoc_build.py format clients/<slug>/sources/customer-data.md doc.json --out <scratch>/gdoc`
   It checks that the doc's text matches the file paragraph for paragraph
   (stop if it prints any mismatch) and writes `format.json`: the full
   `update_doc` arguments, with title, headings, bullets, numbered lists,
   bold and italic source notes, and the revision guard.
6. Send `format.json` as one `update_doc`.
7. Rename the doc with Drive `update_file` to `<Client>: Customer Data` (no
   em dash).
8. Verify: `read_doc`, then run the google-workspace `docs_index.py outline`
   on it. Check the headings, that the numbered lists exist, and that the
   notes are italic.

Numbering in the Google Doc restarts at 1 under each theme heading. That's
expected: the Docs API can't carry one list across headings.

### 7. Finish

- Update `brain.md` if the doc link or source list changed.
- Commit the transcripts and `customer-data.md` on the current branch
  (never on `main`). Don't push unless Tait asks.
- Report to Tait: how many pains, dreams and sources went in, the 5 hook
  phrases, the verify result, and the doc link (same link as before).
