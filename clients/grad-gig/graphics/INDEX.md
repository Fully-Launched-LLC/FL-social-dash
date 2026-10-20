# Grad Gig: motion graphics library

The ONLY graphics the Content Editor may use in Grad Gig videos (besides the
shared effects library in `team/content-editor/effects/`, adapted to Grad Gig's
brand). Graphic code lives in `editor/src/clients/grad-gig/` (private).

## How a graphic gets in here
1. **Pitch.** While planning an edit, the Editor finds a moment no approved
   graphic covers. It adds a row to **Pitched** (date, video, timestamp, the
   exact line, the idea, why nothing approved works). Ideas only, nothing built.
2. **Tait approves or passes** (with a reason, which the team learns from).
3. **Directions.** For an approved idea, the Editor renders 2–3 still frames in
   different directions; Tait picks one.
4. **Build.** The Editor builds the picked direction as a reusable component
   and renders a short test clip; Tait gives the final OK.
5. **Approved.** It moves to the table below and can be used in any Grad Gig
   video from then on.

Every graphic must pass `team/content-editor/graphics-standard.md`
("Evidence, not effects": it points at something real, no scam tells) before
Tait sees it.

## Approved (usable)
Lifecycle: **New → Current → Watch → Retired** (Tait makes the call; retired = never again).
| # | Graphic | Component | What it's for | Points at (real thing) | Approved | Uses | Stage |
|---|---|---|---|---|---|---|---|
| | _none yet_ | | | | | | |

## Pitched (waiting for Tait)
| Date | Video @ time | Line | Idea | Why nothing approved fits | Tait's call |
|---|---|---|---|---|---|

## Passed / rejected (with Tait's reason, so we learn)
| Date | Idea | Tait's reason |
|---|---|---|
