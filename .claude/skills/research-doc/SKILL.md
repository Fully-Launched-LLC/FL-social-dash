---
name: research-doc
description: Build or refresh a client's Research document - the industry primer, the questions customers ask (Reddit), outlier videos in the niche and from competitors (Instagram, TikTok, Facebook via Apify), the trending formats on Instagram (talking head, green screen, text on b-roll...), ideas from other industries (YouTube outliers via Apify), the viral formats that are working, and the 10 frameworks from Tait's viral script library that fit this client best. Writes research/content-research.md and mirrors it into the client's Content Research Google Doc. Use as step 6 of the content system, or when Tait asks for research, outliers, customer questions or frameworks for a client.
---

# research-doc

Research decides **packaging**: hooks, formats, structures, what people
ask. It never decides **substance**: what the client says comes from their
own words (CLAUDE.md principle 1). This skill finds what's working and
what people want to know; `content-engine` fills it with the client's
stories and solutions.

## Before you start

- **Apify must be connected** (the `apify` connector in this repo's
  `.mcp.json`). If no Apify tool is available, stop and tell Tait: open
  Claude Code in `~/code/FL-social-dash`, type `/mcp`, pick **apify** →
  **Authenticate**. Never invent results to fill a gap.
- **Say the cost once:** a full run is several Apify actor runs, roughly
  $0.50 to $1.50 of Apify credit (the free plan includes $5 a month).
- **Read first:** `brain.md`, `research/industry-primer.md` (its search
  words and competitors), `research/content-research.md` (what's already
  there, Tait's takes), `research/private/outliers.md` (what Tait said is
  or isn't the right lane), `library/viral-scripts/frameworks.md`.
- For every Apify actor: read its input schema through the Apify tools
  before running it, never guess fields. If a named actor isn't available,
  search Apify's store for the closest one and say which you used. Ask for
  about 30 results per search; more costs more.

## The six research jobs

**1. Customer questions (Reddit).** A Reddit scraper actor on the
subreddits and keywords from the primer, top posts of the past year. Keep
posts that are questions or complaints from the client's kind of customer:
the title or question in their words (quoted, under 25 words), the
subreddit, upvotes and comments, the link. Group them by theme. These feed
hooks ("why can't anyone find my Etsy shop?").

**2. Niche outliers (Instagram, TikTok).** Run the `outlier-research`
skill's steps 3 to 5 for the client's niche (or each category, for a
client with several): top 10 by views. The full list goes in the private
outlier doc as usual; the Research doc gets the top 5 per platform.

**2b. Trending formats on Instagram (in the niche).** Which *formats* are
winning right now, not just which videos. From the Instagram reels pull in
job 2 (widen it to about 50 reels from the last 60 days for this job), for
each reel:

- download its cover image (`displayUrl` in the scraper's output; the link
  expires, so fetch it right away) with `curl -s -o <scratchpad>/ig/<n>.jpg`
  and look at it with the Read tool;
- read its length (`videoDuration`), caption and audio (`musicInfo`: an
  original voice or a trending sound);
- label its format from what you can see, one of: **talking head** (one
  person speaking to camera), **green screen** (person over a screenshot,
  article, post or image), **text on b-roll** (big on-screen text over
  footage, usually with music), **voiceover b-roll**, **two-person or
  podcast clip**, **interview or street interview**, **screen recording or
  tutorial**, **POV or skit**, **before and after**, **slideshow or photo
  dump**, **other** (describe it). Add the on-screen text style if there
  is one (a big caption at the top, word-by-word captions).

Then rank the formats: how many of the top reels use each, their median
views, and whether they're rising (more of them in the last 30 days than
the 30 before). The labels come from one cover frame and the caption, so
call it that ("from the cover frame") and never claim more; Tait checks
the top examples by watching them. This goes in the Research doc as
**Trending formats on Instagram**, and in the private outlier doc next to
each reel.

**3. Competitor outliers (Instagram, TikTok, Facebook).** For each
competitor in the primer with social accounts: their recent posts via the
Instagram and TikTok scrapers (profile URLs) and a Facebook page posts or
reels scraper. A post is an **outlier** when its views are at least 3
times that account's median views in the same pull; list the outliers with
views, the multiple ("5.2x their usual"), caption trimmed, link.

**4. Ideas from other industries (YouTube).** A YouTube scraper, searching
the problems and dreams from Customer Data and the primer in plain words,
across any industry, sorted by views. Keep videos whose views are far above
their channel's size (views ÷ subscribers where both are given). Record
the title word for word, channel, views, link, and **Could carry**: which
of the client's topics could use that title shape (our read). Titles and
their shapes are the point here; Tait also reviews thumbnails himself on
the links.

**5. Viral formats.** From jobs 2 to 4, the formats that repeat (talking
head with text on screen, green screen, story time, list, POV...). For the
strongest 3 to 5, a breakdown in the shape `format-research` uses
(observed vs. our read, quotes under 15 words, links). Run
`format-research` itself when Tait wants a deeper read in Chrome.

**6. The 10 frameworks for this client.** From
`library/viral-scripts/frameworks.md`, pick the 10 hook formulas and
script frameworks that best fit this client's stories, offer and audience
(Identity, Customer Data, the story bank). For each: its ID and name, the
beats, why it fits this client, and which of their stories or solutions
could carry it (story bank IDs once they exist). Name the library scripts
it came from by ID only: the scripts themselves stay private. If the
library has fewer than 10 frameworks, use what's there and say how many
more scripts it needs.

## Write `research/content-research.md`

Keep what's there (Tait's takeaways and takes, earlier research, the
"Formats that are working" section) and add or refresh these sections, in
this order, each starting with *Pulled YYYY-MM-DD*:

```
## Industry primer
(a five-line summary, and "Full primer: research/industry-primer.md")

## What customers are asking
### <Theme>
1. "<question in their words>" · r/<sub> · 412 upvotes · [link](https://...)

## Trending formats on Instagram
*Pulled YYYY-MM-DD from <n> reels, last 60 days · format read from each reel's cover frame and caption*
1. **Green screen** · 14 of the top 50 · median 210K views · rising · best: [Watch](https://...), [Watch](https://...)
   What it looks like here: <one line, observed>

## Outliers in the niche
1. **2.4M views** · TikTok · @creator · <caption trimmed> · [Watch](https://...)

## Competitor outliers
### <Competitor>
1. **5.2x their usual** (180K views) · Instagram · <caption trimmed> · [Watch](https://...)

## Ideas from other industries
1. "<YouTube title, word for word>" · <channel> · 3.1M views · [Watch](https://...)
   Could carry: <the client's topic> (our read)

## Viral formats that are working
## The 10 frameworks for <client>
### 1. H3 Credibility + promise, with F2 Story with a lesson
- **Beats:** ...
- **Why it fits:** ...
- **Could carry:** S2 (the almost-walked-away customer), the pricing objection

## Tait's take
(his words only, or *(no take yet)*)
```

Lists with `[Watch](url)` links, not tables, so `gdoc_build.py` can mirror
them (it turns `[text](url)` into clickable links). Captions and titles are
the creators' words: trim, never rewrite; drop emoji and hashtags. No em
dashes. Never list a number the scrapers didn't return ("n/a").

## Mirror and finish

Mirror into the client's Content Research Google Doc in place (load
`anthropic-skills:google-workspace`; `gdoc_sync.py`, then `gdoc_build.py
format` on the new sections only; see `client-onboarding` step 6 for a doc
that still has tables). Verify with a fresh `gdoc_sync.py` (0 requests).
Tell Tait the three to five things that stood out, and anything that came
back thin (a platform empty, no competitors with social accounts).
