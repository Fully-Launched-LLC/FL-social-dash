---
name: format-research
description: Research which content formats are working on YouTube, Instagram and TikTok in a client's niche, on demand, and add them to the client's Content Research doc. Use when Tait says "research formats for <client>", "what formats are working for <niche>", "find outlier videos", or asks for content research from social media.
---

# format-research

Finds the video formats that are outperforming in a client's niche right now
on **YouTube, Instagram and TikTok**, breaks each one down, and adds them to
the client's Content Research doc (`clients/<slug>/research/content-research.md`
and its Google Doc mirror).

It runs only when Tait asks (CLAUDE.md principle 5): no schedule, no
background job, nothing left running.

## The rule this serves

Research decides **packaging**: the format, the hook shape, the structure,
the length. It never decides **substance**. What the client says in the
video always comes from their own words (`sources/customer-data.md`,
`sources/voice.md`, their transcripts). So this skill never writes a script,
a hook or an idea for the client. It says "this format works, here's how it's
built", and points at the client's own material that could fill it.

## Rules for the whole run

- **Read only.** In the browser, only search, scroll, open and read. Never
  like, follow, comment, save, share, message, post, or change a setting.
  Never sign in, type a password, or accept anything. If a platform shows a
  login wall or a CAPTCHA, stop on that platform and say so in the report;
  don't try to get around it.
- **Public pages and Tait's existing sessions only**, opened in new tabs in
  his Chrome (the `chrome-browser` skill). Close every tab you opened when
  you're done.
- **Poppy AI is off limits** (CLAUDE.md): never open, search or read it. If
  Tait pastes what he found there, break that down like any other example.
- **Record only what you can see.** Views, likes, dates, follower counts,
  on-screen text, titles and captions, exactly as shown. You can't hear
  audio: if the hook is spoken and there are no captions or transcript, say
  "spoken hook, not captioned" rather than guessing the words.
- **Quote briefly.** A hook or title quoted word for word, under 15 words.
  Never copy whole captions or transcripts. Always link the post.
- **Mark your reasoning.** Anything that's your interpretation (why it works,
  how it could fit the client) is labelled **Our read**, separate from what
  you observed.
- **No em dashes. No AI tells** (see `.claude/skills/tasteful-content`
  section 1). The client's Do / don't list in `brain.md` still binds what you
  suggest (Grad Gig: never imply background checks).
- **Never mix clients.** Fully Launched and Grad Gig research stay in their
  own files.

## 1. Read the client first

From `clients/<slug>/`:

| File | What you take from it |
|---|---|
| `brain.md` | the niche, the audience, where they post, competitors named, Do / don't |
| `sources/positioning.md` | the pillars and formats (3-3-3), so each format found can be matched to a pillar |
| `sources/customer-data.md` | the customer's own phrases (pains, dreams, the 5 hook phrases): these become search terms, and they're what would fill a format |
| `research/content-research.md` | what's already been researched, so you don't repeat it, and any "Worth researching first" notes from Tait |

If Tait named a niche, competitor or angle in his request, that comes first.

## 2. Plan the searches (show Tait, then go)

Write a short plan: 6 to 10 search terms and any accounts to check, built
from the client's niche, the customer's own phrases, the competitors in
`brain.md`, and Tait's notes. Include a couple of adjacent niches that share
the same customer (for Grad Gig: parents in the western suburbs, local
realtors doing area videos). Show the plan in one short list and go, unless
Tait asked to approve it first.

## 3. Search each platform

Open each in a new tab. Search terms go in the platform's own search box or
search URL.

- **YouTube:** `https://www.youtube.com/results?search_query=<term>`, then
  the **Shorts** filter for short-form, plus the default results for
  long-form titles. On a promising channel, open its **Shorts** or
  **Videos** tab sorted by **Popular** to see what's normal for that
  channel.
- **TikTok:** `https://www.tiktok.com/search?q=<term>` (the Videos tab).
  Open an account's profile to compare a video against its usual views.
- **Instagram:** search the term, open the relevant accounts, and look at
  their **Reels** tab. Hashtag pages (`https://www.instagram.com/explore/tags/<tag>/`)
  help for local niches.

Take `get_page_text` / `read_page` over screenshots where it gives you the
numbers; use screenshots to see on-screen text and the look of a video.

## 4. Find the outliers

A video is an **outlier** when it clearly beats its own account's normal:
roughly **3x or more** the views of that account's typical recent videos.
Big views on a big account aren't an outlier; 200k views on an account that
usually gets 5k is. Note the account's typical views next to the video's, so
Tait can see the gap. Prefer the last 6 months.

Aim for 15 to 30 outliers across the three platforms before grouping. If a
platform turns up nothing useful, say so rather than padding.

## 5. Group them into formats

Group the outliers into **5 to 10 formats**: the same structure showing up
across different accounts. One-off videos that don't repeat go under
"Worth a look" instead.

For each format, record:

- **Name:** a plain name for it ("Street question to a local", "Three-things
  list over B-roll").
- **How it's built:** the beats in order, as observed (for example: on-screen
  question, 1 to 2 s; answer; payoff line; CTA). Length, and talking head /
  voiceover / text-on-screen.
- **Hook shape:** the pattern of the opening, with one or two real hooks
  quoted briefly as examples.
- **Examples:** 2 to 4, each with platform, account, link, views vs. the
  account's usual, and date.
- **Our read, why it works:** one or two lines, tied to the V.I.D. method
  (`templates/vid-method.md`): what's the visual hook, where does the viewer
  see themselves.
- **Our read, how it could fit <client>:** which pillar from
  `positioning.md` it suits, and which of the client's own lines or stories
  (quoted from `customer-data.md` / `voice.md`, with the file) could fill it.
  If nothing in their material fits yet, write **Needs from the client:** and
  what's missing. Never make up the substance.

Rank formats by how strong the evidence is (how many outliers, how big the
gap), best first.

## 6. Add it to the Content Research doc

In `clients/<slug>/research/content-research.md`:

- Add (or, on a later run, update) a section right after the header block:

  ```
  ## Formats that are working (YouTube, Instagram, TikTok)

  *Researched <YYYY-MM-DD> by Claude, on Tait's request. Search terms: <list>.
  Views as shown on <date>.*

  ### 1. <Format name>
  - **How it's built:** ...
  - **Hook shape:** ... e.g. "<quote>" (<account>, <platform>)
  - **Examples:**
    - <Platform>: [<account>](<link>), <views> views (usually ~<typical>), <date>
  - **Our read, why it works:** ...
  - **Our read, how it could fit <Client>:** <pillar>. Could be filled by: "<client quote>" (`sources/<file>`). / **Needs from the client:** ...

  ### Worth a look
  - ...
  ```

- Where findings fit the existing sections (**YouTube: strong titles**,
  **Competitors: what's performing**, **Local creators**, **Trending on
  social media right now**), add rows there too and remove that section's
  *Nothing added yet.* line. Keep sections that are still empty as they are.
- Update **Last updated** and **Sources** in the header.
- On a later run, keep earlier formats; add new ones, refresh numbers only if
  you re-checked them, and note the new date.

Then mirror it into the client's **Content Research** Google Doc (the
`**Drive:**` link in the file's header). Load `anthropic-skills:google-workspace`
first and edit that doc in place, keeping its link. If the client has no
Content Research doc yet, follow `client-onboarding` step 6 to create it.

## 7. Check and report

- `grep -c '—' clients/<slug>/research/content-research.md` must be 0.
- Every example has a working link and the numbers as seen.
- Close every browser tab you opened.
- Commit on a branch (never `main`); push only when Tait asks.

Report to Tait in a few lines: the top 3 formats and why, anything that
couldn't be searched (login wall, CAPTCHA, nothing found), and the
**Needs from the client** items. Adding a format to the doc is not
approving it: Tait picks which formats to use when he plans ideas
(gate 1 stays his).
