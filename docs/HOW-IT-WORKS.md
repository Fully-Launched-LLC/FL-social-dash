# How Fully Social works (one page)

One system, built around the **video card**. Tait works in one place, the
operator dashboard; the AI team (Paperclip, on Tait's Mac) does the work; the
client only ever sees their video cards and finished videos.

## Turn it on
On Tait's Mac, open Terminal and run `~/code/FL-social-dash/bridge/start.sh`,
then leave the window open. It starts **Paperclip** (the AI team's office)
and the **bridge**, which checks the dashboard every 2 minutes, starts the
team's work and saves it back. If the Mac is off, everything waits.

## The pipeline
| # | Stage | Who | Where Tait sees it |
|---|---|---|---|
| 1 | **Interview questions** for a new client (voice, customer, story, offer, brand) | Account Manager | Clients → client → Onboarding (Copy to send) |
| 2 | **Answers** (client's voice memo, or a recorded call) are transcribed on the Mac | Bridge | Onboarding → Recordings |
| 3 | **Documents**: brand guidelines, ICP, identity | Account Manager | My desk → Documents to review |
| 4 | **Moodboard → editing guidelines** (Tait and the client build the board together; after brand guidelines are approved) | Art Director (briefs the Editor + Motion Designer) | Client → Moodboard (client: portal → Moodboard tab; they just drop screenshots, the Art Director groups them); My desk → Documents |
| 5 | **Ideas**: Tait's (dashboard or Telegram), research for new clients (weekly), Sandcastles links | Tait, Researcher | Content Ideas |
| 6 | **Monthly plan of 20** on the 10th for next month (or "Ask the team for next month's plan") | Team Lead, Strategist, Expert, Simplifier | My desk → Ideas to review |
| 7 | **Scripts** on each card (hook, outline, script, camera questions) | Writer, Expert, Simplifier | My desk → Scripts to review |
| 8 | **Client card review**: Approve, Request changes (→ back to the Writer, then Tait), upload footage on the card | Client / videographer | Client portal |
| 9 | **Edit** in the client's style (only once their editing guidelines are approved) | AI Editor + Motion Designer + Reviewer (human editors as backup) | My desk → Videos to review |
| 10 | **Tait's review** (Frame.io player) → captions (drafted by the Poster) | Tait, Poster | My desk |
| 11 | **Client's review** (2 rounds of changes; Tait checks every revision first) | Client | Client portal |
| 12 | **Ready to post → Posted** (Tait posts by hand) | Tait | My desk → Videos to post |

**Timing** from each post date P: script approved by P−13, filmed by P−10,
edit done by P−7.

## Tait's places
- **My desk** (home): Due soon, then ideas, scripts, documents, videos to review, videos to post.
- **Content Ideas**: the idea database (and the older unsent cards).
- **Clients → Open**: Overview, Documents (operator-only; the client sees only approved brand guidelines), Moodboard, Footage, Videos, and **Open their portal**.
- **Library**: shared music and sound effects (★ Favourite / Never use) and the house moodboard.
- **Agent room**: what each AI employee is doing, stuck on, or needs from Tait; Try again / Pause.
- **Telegram bot**: text ideas ("Hesedea: …", voice notes, screenshots); it also tells Tait when his desk fills up.

## What clients see
Only their **video cards** (approve, request changes, upload footage), their
**moodboard** (its own tab: they drop screenshots in), their
**videos to review** (approve or leave notes), their approved **brand
guidelines** and their **b-roll library**. Never documents, research, ideas,
agents, other clients or unapproved revisions: the database enforces it.

## Private setup (never in this repo)
`~/.config/fully-social/bridge.env` on Tait's Mac holds the Supabase secret
key, the Telegram bot token and the YouTube key. The Groq key (transcription)
is in `~/.config/watch/.env`. Google Drive for desktop must be signed in.

## For Claude
Details: `CLAUDE.md` (Architecture Reference), `bridge/README.md`,
`team/` (the team's training, private), `tests/README.md`. Migrations
026–033 build this; 033 (shared moodboards) must be run in the Supabase SQL Editor.
