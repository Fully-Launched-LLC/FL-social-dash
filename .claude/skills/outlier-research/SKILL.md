---
name: outlier-research
description: Find the top outlier videos (most views) on Instagram and TikTok in one client's niche, through Apify, and file them in that client's private Outlier Research Google Doc that only Tait (the operator) can see. Use when Tait says "find outliers for <client>", "outlier research for <client>", "what's viral in <client>'s niche", "niche outliers", or names a client and a niche to research. Learns per client from Tait's feedback. Lists only: no breakdowns, no scripts, nothing posted.
---

# outlier-research

Tait names a client → the top 10 outlier videos in that client's niche,
filed in the client's **Outlier Research (operator only)** Google Doc.

Adapted from the Niche Outliers kit (Bradford Marais, MIT, kept as
downloaded at `~/code/niche-outliers`). Differences: it runs **per client**,
learns **per client**, and files to a **private Google Doc** instead of
Notion.

It runs only when Tait asks (CLAUDE.md principle 5): no schedule, nothing
left running.

## How it fits with format-research

`format-research` reads videos in Chrome and breaks the formats down, then
adds them to the client's Content Research doc, which the client can see.
This skill is the quick, cheap first pass: a ranked list of what's getting
the most views, for Tait's eyes only. Tait watches the top ones; if a
format is worth keeping, he can ask for `format-research` on it.

Research decides **packaging**, never **substance** (CLAUDE.md principle 1).
This skill never writes a hook, script or idea.

## Files

Per client, in `clients/<slug>/research/`:

| File | What it holds |
|---|---|
| `outliers.md` | the repo copy of the private Google Doc: what's been learned, then every run, newest first. The `**Drive:**` line at the top holds the doc's link. |

The Google Doc lives in Drive → **Fully Social OS / Operator Only (do not
share)** (folder `12Lk0_lLkVNOICJuJZMNMrYnkS7GskBcc`), never in the client's
folder, and is **never** added to the client's Documents page
(`social_client_documents`).

## Workflow

```
- [ ] 0. Check Apify is connected
- [ ] 1. Pick the client, read what's known
- [ ] 2. Turn the niche into search terms (show Tait, one line)
- [ ] 3. Scrape Instagram reels
- [ ] 4. Scrape TikTok
- [ ] 5. Merge, dedupe, drop "not my lane", rank, top 10
- [ ] 6. Write the run into outliers.md, then the Google Doc
- [ ] 7. Ask what was off, and write it down
```

### 0. Check Apify is connected

An Apify tool must be available in this session (the `apify` server in
this repo's `.mcp.json`). If it isn't, stop and tell Tait, in plain words:
open Claude Code in this folder, type `/mcp`, pick **apify** →
**Authenticate**. Never scrape another way, never invent numbers.

Cost: about $0.19 a run on Apify's free plan ($5 of credit a month). Say it
once per session, in one line, before the first scrape.

### 1. Pick the client, read what's known

If Tait didn't name a client, ask which one (list the folders in
`clients/`). Never mix clients.

Read, from `clients/<slug>/`:

- `research/outliers.md` → **What works** (their niche, creators to keep,
  not my lane, formats that keep winning). If the file doesn't exist,
  create it from the template below.
- `brain.md` (the niche, the audience, Do / don't) and
  `sources/positioning.md` (pillars or categories).

The niche: what Tait typed comes first. Otherwise use **My niche** in
`outliers.md`. If that's empty, propose one from `brain.md` in one line
and ask Tait to confirm it; once he does, write it under **My niche**.

A client with several categories (Fully Launched: AI Systems, Social
Media, Websites, E-commerce) gets **one category per run**. If Tait didn't
say which, ask, and keep **My niche** as one line per category.

### 2. Search terms

3 to 5 hashtags plus one plain keyword, tight to the niche. Nothing under
**Not my lane** ever becomes a search term. Show them to Tait in one line
and go.

### 3. Instagram

Apify actor `apify/instagram-scraper`. Read its input schema through the
Apify tools first; never guess fields. About 30 results, **reels only**
(`resultsType: "reels"` at the time of writing), so Tait doesn't pay for
photos. Keep: video view count, owner username, caption, post URL, post
date.

### 4. TikTok

Apify actor `clockworks/tiktok-scraper`. Read its input schema first.
About 30 results for the same hashtags. Keep: `playCount`, author,
caption, video URL, post date.

If an actor name or field differs, list the available actors through Apify
and pick the closest Instagram / TikTok scraper, reading its schema first.

### 5. Rank

Merge, tag each with its platform, dedupe by URL. Drop anything under
**Not my lane** (creators, and posts plainly about an excluded topic), and
say how many you dropped. Sort by views, highest first, take the top 10.
If a platform came back empty, carry on and note it in the run.

**Only list what the scrapers returned.** A missing count is "n/a", never
a guess.

### 6. Write it down

Add the run to the top of **Runs** in `outliers.md`, in this shape:

```
### 2026-10-01: Etsy sellers (E-commerce)

*Searched #etsyseller #etsyshop #smallbusiness and "etsy tips" · Instagram 28, TikTok 30 · 3 dropped (not my lane)*

1. **2.4M views** · TikTok · @creator · [Watch](https://...)
   Caption, trimmed to about 120 characters, as written
2. ...
```

- Views readable: `2.4M`, `840K`, `9,100`.
- Captions are the creator's words: trim, never rewrite. Drop emoji and
  hashtags. Replace any em dash with a comma.
- No em dashes anywhere else either.

Then mirror `outliers.md` to the Google Doc (`google-workspace` skill
rules: read before writing, guard with the revision):

- **First run for this client:** create a Google Doc titled
  `<Client>: Outlier Research (operator only)` in the Operator Only
  folder, put its link on the `**Drive:**` line, then check
  `get_file_permissions` shows only Tait as owner. If anyone else has
  access, stop and tell him; don't share or unshare anything yourself.
- **Insert or update:** use the customer-data-doc scripts:
  `gdoc_sync.py clients/<slug>/research/outliers.md <doc.json> --out DIR`
  (a new doc: `gdoc_build.py text` and insert at index 1), then re-read and
  `gdoc_build.py format ... --start "<the new run's heading>" --end "<the
  run after it>"` so only the new run is styled. `[Watch](url)` becomes a
  clickable link.
- Verify: sync against a fresh read gives 0 requests.

Tell Tait in one or two lines: the doc link (it stays the same every run),
how many came from each platform, and the top one.

### 7. Ask what was off

After the link, one question:

> Anything in there that isn't the right lane for <client>? Tell me and
> I'll remember it for next time.

Write what he says into **What works** in `outliers.md`, then sync the doc:

- "@someone isn't right" / "that topic is off" → **Not my lane**
- "more like number 3" / "@someone is spot on" → **Creators worth watching**
- "I want more X" (a format) → **Formats that keep winning**
- "the niche is really X" → **My niche**

Also note a pattern you saw yourself (say, six of ten are text on screen
over b-roll) under **Formats that keep winning**, labelled "Seen in the
<date> run". **Only write what Tait said or what the run showed.** If he
says it's fine, write nothing and don't ask again.

## Template for a new `outliers.md`

```
# <Client>: Outlier Research (operator only)

**Drive:** <filled in on the first run>

Only Tait can see this. Top outlier videos in <Client>'s niche, found on request through Apify. Newest run first. Watch the top ones yourself: the caption gives the topic, only the video gives the first line and how it was filmed.

## What works

### My niche

### Creators worth watching

### Not my lane

### Formats that keep winning

## Runs
```

Leave a section empty rather than filling it with guesses.
