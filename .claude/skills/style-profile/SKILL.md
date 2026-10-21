---
name: style-profile
description: Build or update a client's Style Profile for the AI content team, the look (editing style) and the content (formats, hooks, topics), from accounts Tait picks plus the Content Researcher's finds. Use when Tait says "build the style profile for <client>", "study these accounts for <client>", "what should <client>'s videos look like", or when a new client starts on the content team.
---

# style-profile

Output: `clients/<slug>/style-profile.md` (Part 1: the look; Part 2: formats,
hooks, topics) and `clients/<slug>/brand.md` (colours, fonts, the chosen look).
Team principles: `team/PRINCIPLES.md` (#4, #11–13). Researcher rules:
`team/content-researcher/rules.md`.

Built 2026-10-20 from doing it for Grad Gig; Grad Gig's files are the reference
output.

## Inputs
- Tait's picks, split into **LOOK references** (how the videos should look) and
  **TOPIC references** (what to remix). Ask which is which if he doesn't say.
- The client's brain.md, customer data, voice, idea bank.
- The client's logo, website, and raw footage (for brand samples).

## Workflow

```
- [ ] 1. Similar accounts (Researcher): Instagram first; if the business is
         unique, adjacent businesses to remix. Profile data, not hashtags.
- [ ] 2. LOOK: for each look reference, watch its 2 best recent reels frame by
         frame (watch skill + 1 fps contact sheets). Write what makes the look.
- [ ] 3. Brand: colours and fonts from the logo (sample pixels) and the site's
         CSS (the page HTML is often empty; read its .css/.js assets).
- [ ] 4. Brand options: render 2–3 looks on the client's own graded footage
         (`editor/src/BrandOptions.tsx`; copy footage into
         editor/public/clients/<slug>/, which is gitignored). Tait picks.
- [ ] 5. FORMATS: pull ~15 recent reels per topic reference (instagram-reel-
         scraper), rank by plays vs. the account's usual, watch the top 2–3.
         Record the format, the proof (views vs. usual), how it works, the remix.
- [ ] 6. VIEWERS: read the comments on the biggest videos
         (instagram-comment-scraper); note what viewers ask and want.
- [ ] 7. TOPICS: pair the client's customer pains (their own words, tagged
         [client's words]) with the proven formats. Seeds, not final ideas.
- [ ] 8. Write Part 1 + Part 2, tag every line by source, list what must be
         true before filming (real numbers, permissions, compliance).
- [ ] 9. Post in the team room thread, and ask Tait to approve or correct.
         His corrections go in the feedback log → rule proposals.
```

## Rules
- Keep LOOK and TOPIC references apart.
- Outlier = several times the account's usual views, not just big numbers.
- Never invent numbers or customer facts; tag guesses `[AI guess]`.
- Spend carefully on Apify: small runs (≤15 reels per account, ≤40 comments
  per post); say the cost.
- Client footage and premium effect code never go in git (the repo is public).
