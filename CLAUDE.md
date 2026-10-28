# Fully Social OS

A content operating system for running social media for founder-led brands.
Built for an agency of one to scale past one — by turning the repeatable parts
of the process into skills, while keeping the parts that require judgment
manual and human.

This file used to be split across `CLAUDE.md` (operating doctrine) and
`SYSTEM-BLUEPRINT.md` (business model + build-vs-blueprint gap analysis).
They're merged here, in four parts:

- **Build Spec** — what the business does, the principles that govern every
  skill, the two-system business model, the skill pipeline, and the Drive
  structure. Slow-changing; this is what to build toward.
- **Architecture Reference** — how the system is actually built right now:
  repo layout, auth, the dashboards, the build/deploy pipeline. Changes
  whenever the architecture does.
- **Current State** — a snapshot: what's live, what's deleted, what maps to
  the blueprint and what doesn't yet. Fast-changing; trust this over any
  other section if they disagree.
- **Roadmap / Not Yet Built** — the phased end-state for the full client
  lifecycle, documented ahead of being built, so the next several build
  steps have a known destination instead of getting decided one at a time.

## What the business does

Clients hire the agency to run their social media end to end: analyze their
ideal customer, find their positioning, generate content concepts and scripts,
direct filming, hand footage to editors with instructions, review cuts, and
post. Performance data feeds back in so the next cycle is smarter than the
last.

---

# Build Spec

## Core principles — do not violate these

1. **Substance comes from the client's own words** — sales calls, objections,
   DMs, voice notes. Research (`research-sweep`) determines packaging only:
   format, hook shape, structure. Never invert this. It's why most agency
   content sounds identical — it's written from the outside in instead of the
   inside out.

   **The client is not the customer.** Tait's client is the business he
   does social media for; that business's customers are a different person
   he has essentially no direct channel to. So "the client's own words"
   splits into two things that must stay tagged apart: what the client says
   about *themselves* (their voice, their story — `voice-doc`), and what the
   client says *about their customer* (`customer-data-doc`, tagged
   `[founder's account]` — this is the normal case, not a fallback).
   Industry research and AI-inferred predictions about a client's customer
   do belong in the Customer Data document — Tait wants that generative
   step — but only in a clearly separate "unconfirmed" section, never mixed
   into the confirmed material above it, and never treated as real until
   Tait reviews and edits it. This is the one deliberate, bounded exception
   to "never invent" in the whole system — see `customer-data-doc`.

2. **Every concept is built on V.I.D.** — see `templates/vid-method.md`.
   Visual hook (stop scroll in 2s), Identity (viewer thinks "this is for
   me"), Drive action (one clear ask). Identity is the pillar everyone skips
   and it's what gets content screenshotted. Nobody screenshots a tip.
   Content performs when someone sees themselves in a real story, not when
   it hands over value — see `templates/story-over-value.md` for the doctrine
   this pillar actually runs on, and what it means for what's worth
   extracting from a client in the first place.

3. **Two gates stay human.** The agency owner approves every concept before
   the client sees it, and every edit before delivery. Skills draft toward
   these gates — they never skip past them. That judgment is the product.
   (In the dashboard, Tait adding an idea *is* his approval of it: ideas
   reach the client's portal as soon as he adds them — see Dashboards.)

4. **Never invent client facts.** If a skill needs a number, a story, or a
   credential that isn't in `clients/<name>/brain.md` or the mined source
   files under `clients/<name>/sources/`, it stops and asks rather than
   guessing or generalizing.

5. **Research runs on demand, not on a schedule.** `research-sweep` is
   invoked when a cycle needs it. No always-on scraping, no background
   monitoring jobs, no scheduled pulls from research tools (including Poppy
   AI — see below).

6. **Posting is manual.** A human with the login posts. Nothing in this repo
   publishes to a platform, schedules a post via an API, or automates
   publishing in any way. (Tait confirmed this again on 2026-10-16: no
   auto-posting.)

## The business model — two systems, one pipeline

Recorded 2026-08-21, from Tait's own walkthrough. If anything elsewhere in
this file, a skill, or a dashboard ever seems to disagree with this section,
this section wins — fix the other one.

**System 1 — self-serve.** For a business or personal-brand client who
understands social media well enough to drive their own portal: approve
concepts, film their own footage, upload it, give final sign-off.

**System 2 — concierge.** For a client who doesn't want to touch a portal —
"someone like my dad." Older, less online, just wants to be interviewed.
Tait does the filming himself, in person, by asking the client questions.
Everything downstream (editing, review, posting, performance) is the same
pipeline as System 1 — only the front end (how footage gets made) differs.

Both systems produce the same core documents and run through the same
approval gates.

### System 1 — Self-serve

1. **Get the client interested**, then run intake: a call, or a voice memo,
   to extract their customer profile, their voice, and their authentic
   solutions to the problems their business solves.

2. **AI organizes — it does not create.** Every input (call transcripts,
   LinkedIn posts, voice memos, answers to the authenticity questions) gets
   organized into documents. Zero AI-generated content at this stage: no
   rewriting, no changing their words or voice. Organization only. Same
   rule as principle 1, stated even more strictly for this stage.

3. **The documents this stage produces** (all live in the client's Assets
   folder):
   - **Customer Data** — ideal hooks, customer dreams, customer problems /
     typical pain points, typical fears, practical goals.
   - **Three Pillars / Three Formats / Three Unique Perspectives** — the
     "taste document." The single most important document for the client —
     this is where their personal brand (or business brand) voice actually
     comes from. Applies to businesses too, not just individuals.
   - **Unique Perspectives Overview** — a fuller write-up of the three
     perspectives, not just the three one-liners: their unique view on
     things, expanded. This is what content creation draws from most.

4. **Poppy AI setup, per client** — build a competitor list, and use Poppy's
   chat to surface roughly the ten best-performing formats in the client's
   niche, then chat with it to generate content ideas from those formats.
   Manual, per-client, on demand — see Poppy AI below.

5. **Client gets added to their portal.** The portal contains:
   - The Assets folder (all documents from step 3, plus Customer Data)
   - Ability to approve posts
   - Analytics
   - The competitor list
   - Poppy AI access
   - Filming instructions, for clients filming their own content

6. **AI-assisted content calendar** — once the client is briefed, build the
   month's content calendar using the authentic material pulled in step 2.

7. **Client reviews the calendar.** Each card on the calendar shows what to
   film and the instructions for it. The client can **approve**, ask for a
   **rewrite**, or **reject** it outright — this is the first client gate.

8. **Client films, then uploads footage directly to that same content
   card** — not a general dump folder, the specific card for that piece of
   content. (Current build uses one shared Footage Uploads folder per
   client, deep-linked, not per-card upload — see Current State.)

9. **Editor dashboard** (a view distinct from the operator dashboard) shows
   each editor the videos assigned to them, with:
   - Editing instructions and expectations, per video
   - A link to download the footage the client uploaded
   - The client's Assets folder
   - The client's brand voice / brand guidelines doc, so edits stay unique
     to that client

10. **Editor edits, uploads the cut to a "finished" database.**

11. **Owner review (gate 2).** Tait opens each finished video and either
    requests revisions or approves it.

12. **Client review (gate 3) — the client's own portal.** Once Tait
    approves, the client sees the finished video in their portal and gives
    final sign-off before it can be posted. This is a *second*, distinct
    client approval — separate from step 7's concept approval.

13. **Needs-to-be-posted database.** Approved content lands here with a post
    date.

14. **The 7-day rule.** The edit-due date is always 7 days before the post
    date — enough runway for revisions between owner review and posting.

15. **Posting database** — includes how to post, where (platform), and the
    caption. Someone with the login posts manually (principle 6 — this
    never becomes automated).

16. **Monthly performance loop.** After 30 days, a research agent reviews
    everything posted in that window and writes a document on what
    performed best and *why* — specifically which pillars, which formats,
    and which perspectives worked. That document becomes an input to the
    next month's cycle (step 6 onward).

### System 2 — Concierge (interview-led)

1. Extract the client's three pillars / three formats / three unique
   perspectives — same document as System 1, step 3. Voice doesn't need
   separate extraction here; it comes through naturally in the filmed
   interview itself.

2. **AI generates a custom interview question set** for this specific
   client — questions built to draw out their unique perspective and their
   read on their typical customers' concerns. Personalized per client, not
   a fixed generic list.

3. **Tait films the client by asking them these questions directly.** This
   interview *is* the raw footage — there's no separate "client films their
   own content" step in this system.

4. **Poppy Board** — a reference board of the best-performing / outlier
   content in this client's niche, used to guide how the editor should cut
   the interview footage.

5. **Editor dashboard**, same as System 1 step 9, plus: for each video, the
   Poppy Board reference ("here's what this should look like") alongside
   the instructions and due date.

6. Editor edits, uploads to the finished database.

7. **Owner review (gate 2)** — approve or give suggestions, same as System 1
   step 11.

8. **Client review (gate 3)** — client reviews the finished video in their
   portal, same as System 1 step 12.

9. **Needs-to-be-posted database**, same 7-day edit-to-post rule as System 1.

10. **Posting database** — same shape as System 1.

11. **Monthly performance loop** — same as System 1 step 16: what worked,
    what didn't, broken down by pillar/format/perspective, feeding the next
    round.

## The thirteen skills

| Skill | Stage | Produces |
|---|---|---|
| `client-brain` | intake | `clients/<slug>/brain.md` |
| `transcript-mine` | intake | saves the raw source + mines Stories, in `clients/<slug>/sources/` |
| `voice-doc` | intake, ongoing | `clients/<slug>/sources/voice.md` — cumulative voice record + distilled Voice Profile |
| `customer-data-doc` | intake, ongoing | `clients/<slug>/sources/customer-data.md` — verbatim pains/dreams/fears/goals/objections/hook candidates |
| `positioning-doc` | intake, ongoing | `clients/<slug>/sources/positioning.md` — candidate pillars/formats/perspectives + content idea bank |
| `interview-questions-doc` | intake, concierge only | `clients/<slug>/sources/interview-questions.md` — personalized on-camera questions built to draw out stories |
| `research-sweep` | on demand | dated file in `clients/<slug>/research/` |
| `concept-engine` | planning | `clients/<slug>/concepts/<cycle>.md` (gate 1: owner approval) |
| `script-writer` | production | script attached to an approved concept |
| `filming-brief` | production | plain-language filming instructions for the client |
| `editor-brief` | post-production | handoff instructions + Drive link for the editor |
| `calendar-planner` | scheduling | `clients/<slug>/calendar.md` — was written for the old config.json dashboards; needs repointing at Supabase |
| `performance-review` | feedback | performance notes folded back into the next `concept-engine` run |

`voice-doc`, `customer-data-doc`, `positioning-doc`, and
`interview-questions-doc` share `templates/anti-slop-checklist.md` —
inviolable rules, a taste pass, and a refusal template for when the
material can't answer what's needed. The first three organize and extract;
they never draft content. `interview-questions-doc` is the one exception —
it authors questions, not extracted material — but every question still has
to trace to something real in that client's own `voice.md` or
`customer-data.md`. `script-writer` and `concept-engine` load `voice-doc`'s
Voice Profile before writing anything.

## Client Drive structure

Every client gets one folder inside the shared **Fully Social OS** Drive
folder, with five fixed subfolders (Tait, 2026-10-28: "I shouldn't need to
actually enter google drive for any reason") — this is the template, don't
improvise a different shape per client, and don't add Brand Voice or Hooks:

```
Fully Social OS/
  General/
    Assets/                    — shared mockup/template docs, not client-specific
      Ideal Customer Profile — Template   — duplicate this per client, then fill it
  Operator Only (do not share)/
    Old drafts/<Client>/       — draft cuts moved out of Finished Videos (2026-10-28)
  Clients/<Client Name>/
    01 Raw Footage       — footage uploaded on each card, one folder per card
                            ("NN. Title (posts Mon D)"); editor pulls from here
    02 Finished Videos   — only videos Tait approved for posting ("<title>.mp4",
                            copied by the bridge, `copy_finished`); never drafts
    03 Important Documents — every document made for the client (brand
                            guidelines, identity / voice, onboarding brand files)
    04 Assets/           — this client's research and idea documents
      Ideal Customer Profile   — Google Doc, mirrors brain.md's Ideal Customer
                                  section, built from the General/Assets template
      Transcripts/              — voice memo / call transcripts, one file per source
      Content Ideas             — concept-engine output, longer-form idea bank
    05 Previous Content  — footage they already had (onboarding asks for it)
```

`brain.md` in the repo is the source of truth for Brand Voice and the Ideal
Customer Profile — the Drive docs are a synced mirror for people who live in
Drive, not a second source. Update the repo, then re-sync the Drive doc;
don't edit the Drive doc directly and let it drift.

The dashboards link out to these folders (deep links, not in-page upload);
they don't duplicate their content. Each client's folder links live in
`social_drive_folder_links` in Supabase, edited from the operator
dashboard's Clients → Edit.

## Poppy AI

`v2.getpoppy.ai` is a manual research aid, not an integration. When
`research-sweep` runs, checking Poppy AI for outlier formats in the client's
niche is one input a human can bring back and paste in — same as checking a
competitor's page by hand. Nothing in this repo calls it, scrapes it, or
polls it. That would violate principle 5.

---

# Architecture Reference

Describes how the system is actually built. If this disagrees with Build
Spec above, Build Spec is the target and this is the gap — see Current
State for what's tracked as not-yet-built.

## Repo map

```
fully-social-os/
  CLAUDE.md                  this file
  vercel.json                 build command, output directory, redirects/rewrites
  templates/                 shared doctrine — the V.I.D. method, document
                              formats every skill writes into
  clients/<slug>/
    brain.md                 output of client-brain — positioning, ICP,
                              voice, pillars/formats/perspectives, facts
    sources/                 raw material: call transcripts, voice memo
                              transcripts, DMs, objections — mined, not paraphrased
    research/                dated research-sweep outputs (packaging only)
    concepts/                concept-engine output, one file per cycle
  dashboards/
    template/                 client portal + editor templates, and the shared
                               shell.css/shell.js/auth.js that build.py inlines
                               into every page
    operator/                 the operator dashboard template
    dist/                     BUILD OUTPUT ONLY, gitignored — what build.py
                               writes and what Vercel deploys. Never hand-edited.
  supabase/
    migrations/                001 (tables + RLS), 002 (overview/body columns),
                               003 (write path: action functions, audit log,
                               active-editor RLS), 004 (final_cut_url — optional
                               link to one exact finished file), 005
                               (on_screen_caption — added by whoever posts, in the
                               app, not by the editor; outline), 006 (client
                               journey v2: filmed_by, submit_footage + the 7+7
                               dates, caption edits at final approval, client
                               contact details, social_claim_client_invite), 007
                               (social_client_documents — each client's
                               important Google Drive docs), 008 (client
                               onboarding: social_client_onboarding,
                               social_client_generated_docs, new folder links), 009
                               (voice memo texted, not uploaded), 010
                               (onboarding uploads), 011 (each client's
                               own voice memo questions), 012
                               (team-only documents: hidden from the
                               client, read by editors), 013 (editor
                               onboarding: invited_at, setup_at,
                               social_editor_setup_done), 014 (Frame.io-style
                               review: social_video_comments, notes
                               pinned to moments; social_settings, the
                               Google Drive API key), 015
                               (skip_onboarding: already-onboarded clients
                               only make a password), 016 (editor tools:
                               comment replies and Fixed ticks,
                               social_video_versions), 017 (two rounds
                               of changes per video:
                               client_revision_rounds), 018 (review
                               copies: the private 'review' storage
                               bucket, social_video_versions.storage_path),
                               019 (documents: operators and editors only),
                               020 (editors read voice-memo documents;
                               undone by 021), 021 (editors read no client
                               documents: social_editor_folders() gives
                               just raw footage, finished video and brand
                               guidelines links),
                               022 (carousels: social_carousels,
                               social_carousel_guides,
                               social_carousel_uploads, the private
                               'carousels' bucket,
                               social_editor_submit_carousel), 023
                               (social_carousels.due_to_edit), 024
                               (only the operator edits a video's
                               words: approve_final no longer takes
                               the client's caption edits), 026
                               (unified pipeline: social_ideas,
                               social_monthly_plans, 'scripting' and
                               'script_review' card statuses, the 5
                               client documents, social_style_assets,
                               social_footage, social_agent_status), 027
                               (social_onboarding_recordings: voice
                               memos and call recordings with their
                               transcripts; questions_/docs_requested_at), 028
                               (moodboards: social_moodboard_items and
                               the private 'moodboards' bucket; the
                               Library: social_style_assets previews in
                               the private 'library' bucket, ratings), 029
                               (social_ideas: requested_post_date,
                               planned_post_date, special_request; the
                               private 'ideas' bucket), 030-032
                               (scripting, agent room, hand-offs), 033
                               (shared moodboards: sections, palette,
                               added_by; clients read/add to their own
                               board, change only what they added)
    crm/                       013_team_only_access.sql: the CRM's team-only
                               RLS fix (same Supabase project), with its test
  api/                        Vercel serverless functions (no npm deps):
                               invite.js (branded invite email),
                               forgot-password.js ("create a new password"
                               email from Tait, only to people already added),
                               invite-editor.js (editor invite: adds the
                               social_editors row, "Welcome to the Fully
                               Launched editor dashboard" email),
                               build-documents.js (documents from a pasted
                               transcript), notify-review.js ("You have N
                               videos ready to review" email to the client,
                               from Clients → "Email: N to review");
                               _lib.js, _email.js
  ONBOARDING-SETUP.md          the steps only Tait can do to turn onboarding on
    config.example.js          template for supabase/config.js (gitignored —
                               the real Supabase URL/anon key, local dev only)
```

**The content system** (Tait, 2026-10-05; skill `content-system`, run from
Claude Code): **"New client: name, website, industry, call transcript"**
→ intake, `industry-primer`, `voice-memo-questions` (25 to 30 questions:
their voice, their ideal customer in depth, their solutions, `[story]`
prompts they only name on the memo and tell in full on camera, their offer;
pasted on Clients → Onboarding → *Their voice memo questions*, stored in
`social_clients.onboarding_questions`, migration 011) → invite. Then, with
the hand-made transcript, **"Build content for <client>"** →
`research-doc` (Apify: Instagram, TikTok, Facebook, YouTube across
industries, Reddit; plus the 10 best frameworks from the library) →
`customer-data-doc` (format unchanged) → `identity-doc` (offer, 3-3-3,
voice profile, story bank; replaces "Your Voice") → Tait reviews →
`content-engine` (tasteful-content plus frameworks: Hook / Outline /
Script sized by format / Ask on camera, checked by
`scripts/check_ideas.py`) → Tait picks → calendar. Tait's private viral
script library (`viral-script-library`) lives in Drive → Operator Only →
Viral Script Library, cached in gitignored `library/`. Every script
also follows Tait's retention rules, tension loops
(`library/retention/tension-loops.md`, Drive copy "Retention: Tension
Loops" in the same folder, 2026-10-05): a loop opened in the hook, a
rehook every 10 to 15 seconds, every loop closed in the payoff, checked by
`check_ideas.py`. The feedback loop
(Apify reading post views) is not built yet, by Tait's choice.

**This repo is public on GitHub.** Nothing operator-only goes in it:
`library/` and `clients/*/research/private/` are gitignored.

**The AI content team** (Tait, 2026-10-20; being built step by step, see
`team/README.md` and its principles in `team/PRINCIPLES.md`, which differ
from the core principles above for the team's own work): nine AI employees
as Claude Code subagents in `.claude/agents/`, a shared team room per
client, Tait's idea banks, and a Remotion project in `editor/` for AI
editing. The training kits (`team/*` except README and PRINCIPLES), idea
banks (`clients/*/idea-bank/`) and team rooms (`clients/*/team-room/`) are
gitignored because they hold Tait's IP and work in progress. So far:
`content-researcher` (first similar-accounts pass for Grad Gig).

Older order, kept for reference (skill `client-onboarding`, `.claude/skills/client-onboarding/`):
save transcripts → `customer-data-doc` → the 3-3-3 (`positioning.md`) →
`tasteful-content` → content research → Google Docs → the portal's
Documents page. Fully Launched is the reference output.

`customer-data-doc` lives in this repo at `.claude/skills/customer-data-doc/`
(built 2026-09-28: verbatim pains, dreams and 5 hook phrases, mirrored into
the client's Customer Data Google Doc). `tasteful-content` lives at
`.claude/skills/tasteful-content/` (installed 2026-09-28 from Founder OS's
Tasteful AI Content Playbook, adapted per client): run once per new client,
after `customer-data-doc`, it builds `sources/voice.md` and the first
`concepts/content-ideas.md`. `format-research` lives at
`.claude/skills/format-research/` (built 2026-09-30): on demand, it searches
YouTube, Instagram and TikTok in Tait's Chrome (read only, never Poppy),
finds outlier videos in the client's niche, groups them into formats, and
adds them to `research/content-research.md` and its Google Doc. It's this
repo's version of `research-sweep`. `outlier-research` lives at
`.claude/skills/outlier-research/` (built 2026-10-01 from the Niche Outliers
kit): on request, per client, it pulls the top 10 Instagram and TikTok
videos by views in the client's niche through Apify (the `apify` server in
`.mcp.json`; Tait signs in once with `/mcp`) and files them in
`clients/<slug>/research/outliers.md` and its Google Doc, which lives in
Drive's private **Operator Only (do not share)** folder and never goes on
the client's Documents page. It learns per client from Tait's feedback.
After ranking it watches the openings of the top 10 with the `watch` skill
(claude-watch, installed per Mac at `~/.claude/skills/watch`, needs
ffmpeg, yt-dlp and a Groq key in `~/.config/watch/.env`; not in this repo)
to record each video's real format and opening line. The other skills in the table are not in this
repo — where they live is an open question. `calendar-planner` in
particular was written to update the old per-client `config.json` files,
which no longer exist; it needs repointing at Supabase or retiring.

## Data: social_videos is the single source of truth

Every client, video, editor, and Drive link lives in Supabase (same
project as fully-launched-crm; every table here is prefixed `social_`).
Nothing about a client or video is stored in git, in the built pages, or in
a browser's localStorage. There is no status report or copy-paste relay.

Who can write what (`supabase/migrations/003_social_videos_write_path.sql`,
client actions as replaced by `006_client_journey.sql`):

- **Operators** — full direct read/write on every `social_` table. New
  ideas are inserted with gate 1 already stamped (`concept_approved_by/at`),
  so the client sees them at once. Re-sending an idea the client sent back
  goes through `social_operator_approve_concept`.
- **Clients** — no direct writes. Only `social_client_video_action(video,
  action, note, caption, on_screen_caption)`, which checks the move against
  the transition table in 006. What's allowed depends on the video's
  `filmed_by`: `client` → submit_footage ("Video has been filmed": straight
  to ready_to_edit, edit due in 7 days, post in 14 or on the planned date if
  later); `us` → approve_concept. Either → request_concept_changes (clears
  gate 1 — the idea goes back to the owner), approve_final (with optional
  caption edits), request_revisions. mark_filmed / mark_ready_to_edit /
  reject still exist for older pages; no page shows them.
- **Editors** — no direct writes. Only `social_editor_mark_delivered(video,
  final_cut_url)`. The editor dashboard doesn't send a link: editors upload
  into the client's Final edits folder, naming the file after the video, and
  every Watch button opens that folder (`finishedVideoLink` in shell.js). An
  operator can still set `final_cut_url` in the video form to point at one
  exact file (or the video's own finished folder), and Watch then opens that instead.
  Every editor policy requires `social_editors.active` — a deactivated
  editor sees nothing. (Revoke their session in Supabase Auth too.)

**Reviewing a finished video** (Tait, 2026-10-06/07, modeled on Frame.io;
`openReviewPlayer` in shell.js). Every video file stays in Google Drive
(Tait's call: safer and cheaper than Supabase storage). The page finds the
finished file (`findFinishedFile`: the `final_cut_url` file; else the newest
video in that folder; else, in the client's Final edits folder, the newest
video named after the video, or inside a folder named after it) and
streams it from the Drive API into its own player, using the browser key
in `social_settings` ('google_api_key', limited to the Drive API and this
site). That needs the client's Final edits folder shared "anyone with the
link can view". Then a note is pinned to the moment it's paused on (typing
pauses it; moving the playhead moves the time with it) or to the **Whole
video** (a general suggestion). The window is laid out like Frame.io (Tait,
2026-10-07): the player has its own controls (play, clock, speed, sound,
full screen; Space plays/pauses, arrows step 5 s) and every timed comment is
a mark with the author's initials on the scrub bar; comments are numbered
#1, #2 in time order with avatar, name and how long ago; clicking a mark or
a comment's time jumps there. Without the key, sharing, or
a format the browser plays, it falls back to Drive's own player and the
reviewer types the time ("0:12"; blank = whole video). Notes are
`social_video_comments` rows; a trigger closes a video's open notes when it
leaves Edit review or Client final review, so each cut starts a clean round
and the editor's **Watch with the comments** shows the last batch sent. The
client: **Review the video** → notes → **Send N changes to the editor**
(request_revisions, its note listing every note as "0:12  text", so the
editor's Revisions needed box shows them) or **Approve for posting**. Tait
at Edit review: **Review & comment** → **Send N changes to the editor**
(`editor_brief.revisions`, never shown to the client) or **Approve & add
captions**.

`VIDEO_ACTIONS` in `dashboards/template/shell.js` mirrors the transition
table to decide which buttons to show — keep the two in step. The database
is what actually enforces it.

`social_status_audit_log` records every status change and gate-1
approval/reset (action, note, who, role, when), whichever path it came
through. Operators can read it.

## Auth

All three dashboards sit behind Supabase Auth (email + password), backed by
three role tables — `social_operators`, `social_editors`,
`social_client_users` — all RLS-protected. Nothing renders until
`dashboards/template/auth.js`'s gate resolves who's signed in and the
page's own `resolveAccess()` passes. Client-portal access is decided by RLS:
the page fetches the `social_clients` row for the URL's slug, and a client
login only gets its own row back.

**Before creating any client or editor login:** the CRM's tables in the
same project allow any authenticated user (see the note at the end of
001). A client or editor login would be able to read and write the CRM,
including financials, until the CRM's policies check team membership. That
fix belongs in the fully-launched-crm repo and is not done yet.

**Client invites** (Clients → "Invite to portal" / "Resend invite", or
automatically when a new client is created) go through `/api/invite`: a
one-time Supabase link (invite for a new email, sign-in for an existing
login) to `/welcome`, emailed from Fully Launched via Resend. The email is
the full "Welcome to Fully Social" one until they've finished onboarding,
even if their email already has a login; only after that is it the short
sign-in email. Without
`RESEND_API_KEY` the dashboard shows the link to copy and send by hand.
The first time a login with a *confirmed*
email matching a client's `contact_email` opens a portal,
`social_claim_client_invite()` links it to that client
(`social_client_users`); operators and editors are never linked. There is
no "email me a sign-in link" on the login screen (removed 2026-10-12, Tait:
nobody gets in without an email from him).
Invites are **on** (`INVITES_ENABLED = true` in the operator template)
since 2026-09-29, Tait's decision. The CRM fix is written
(`supabase/crm/013_team_only_access.sql`, tested) but must be run in the SQL
Editor; until then any client login can read the CRM. Setup steps (redirect
URLs, domain, keys): `ONBOARDING-SETUP.md`.

"Forgot password? Create a new one." (Tait, 2026-10-12) calls
`/api/forgot-password`, which emails a one-time recovery link from Tait
("Hey, you forgot your password? Click right here to change your
password.") only to someone already added: an operator, an active editor, a
client's login, or an invited client contact email. Anyone else gets the
same on-screen answer and no email. The link opens `/welcome?mode=reset`
(signed in by auth.js's verifyOtp), which sets a new password and then
opens their own dashboard. Sender: `RESET_EMAIL_FROM`, default
`Tait Allen <tait@fullylaunched.com>`. The site's home
page sends a client or editor who signs in there to their own dashboard.

**Review copies** (Tait, 2026-10-09; migration 018): streaming straight
from Google Drive with the API key proved unreliable (Google answers with an
"automated queries" block page; phones wait, then fall back to Drive's own
player). Each version can have a review copy in the private Supabase
bucket `review` (`<client id>/<video id>/<file>`,
`social_video_versions.storage_path`), which the review window plays
through a signed link (6 hours) before trying Drive. The editor's Finished
pop-up asks for the same file to be added there (sent with
`social_add_video_version`'s `p_storage_path`); the operator's review
window has **Upload a review copy** when the cut has none. Drive stays
where the files are kept, and the fallback. Clients watch their own copies,
editors their assigned videos', operators everything.

**Rounds of changes** (Tait, 2026-10-09; migration 017,
`REVISION_ROUNDS` in shell.js): a client gets two rounds of changes on each
finished video. Every cut the editor finishes goes to Tait first (Edit
review); he sends it to the client. Their **Send changes** opens a pop-up
("You only get two rounds of revisions. This will be your first round":
Send it back to the editor / Make more revisions / Cancel), counts the
round and sends it straight to the editor. The fix comes back to Tait,
whose review lists the client's changes and which the editor ticked fixed;
he approves it back to the client. After the client's second round, his
button is **Approve for posting** (straight to Ready to post). A third
round is refused by the database. While it's with the editor, and once
approved, the client can **Watch the video** (the cut they reviewed, with
the changes they sent, read only; "Being changed by the editor" under
Finished videos to approve).

## Client onboarding (`/welcome`)

**With the AI team** (Unify Phase 3, Tait 2026-10-21; migration 027 and
`bridge/`): the bridge on Tait's Mac (`bridge/start.sh` runs Paperclip and
`bridge/bridge.py watch`) checks every 2 minutes. A new client (created
after the bridge was set up) with no questions → a Paperclip task for the
Account Manager to write them (`voice-memo-questions`, now with a brand
section), saved with `bridge.py questions put`. A voice memo from
`/welcome`, or a call recording Tait uploads on Clients → Onboarding →
Recordings → the bridge transcribes it with Groq Whisper (the watch kit's
key), saves it on `social_onboarding_recordings` and appends it to the
client's transcript, then asks the Account Manager to build brand
guidelines (`brand-guidelines-doc`), ICP (`customer-data-doc`) and identity
(`identity-doc`), each saved with `bridge.py doc put` onto My desk →
Documents to review. A pasted transcript does the same ("Save and ask the
team to build documents"). The bridge uses a Supabase service-role key Tait
keeps in `~/.config/fully-social/bridge.env` (never in this repo). Before
027 the panel keeps the older `/api/build-documents` flow.

A new client's invite (`api/_email.js`, in the dashboard's liquid glass since
2026-10-22: a navy page, the platinum logo moving (`/assets/motion/logo-platinum.gif`),
one glass card with a gold pill button —
the logo, "Welcome to your Fully Social dashboard", "Hi <first name>, we are
excited to start working with <company>.", and one **Start here** button at
the bottom; replies go to tait@fullylaunched.com) lands on `/welcome`. The
button links to our own site, `/welcome?client=<slug>&token_hash=…&type=…`,
and auth.js signs them in with `verifyOtp` (a link to a different domain
than the sender is a spam/phishing signal; it went to junk before)
(`dashboards/template/welcome.template.html`, onboarding v2, Tait
2026-10-01). Each step is saved with `social_client_onboarding_save()` so
they can stop and come back:

1. **Create your password** — one big page on its own, two boxes with a
   show-password (eye) button.
2. The steps, with tabs across the top. A step opens only once the one
   before it is done: **Welcome** ("around 30 minutes, come back any
   time", Start) → **Your brand** (drag-and-drop brand files, or "I don't
   have any brand files") → **The questions** (the client's own list,
   `social_clients.onboarding_questions`, or the standard 30 in
   `ONBOARDING_QUESTIONS` in shell.js; `[story]` prompts marked "Story";
   `questionsFor()`; and a voice memo recorder on the same page: record in the
   browser, or upload a recording) → **Your footage** (drag-and-drop files
   or whole folders, and/or a Google Drive folder link).
3. Their portal, `/clients/<slug>?tour=1`: a walkthrough (`startTour` in
   the client portal; Tait, 2026-10-06). Each step opens the right page,
   dims everything else and rings one thing in gold, with the card beside it
   and an arrow pointing at it: To Do ("where everything you need to do is
   found") → Time sensitive → To film → a video card (hook, outline,
   script) → its **Upload footage** button (each video's clips go in its
   own card) → "film it your way" (script, outline, or just answer the
   question) → Content Calendar → Documents (a line on what each one is),
   then "Bookmark this page". The footage folder is left out on purpose.
   Steps that don't apply to a client are skipped.

Uploads (migration 010) go to the private `onboarding` storage bucket,
`<client_id>/brand/`, `/voice-memo/`, `/footage/<batch>/<folder path>`. A
client can only add to and read their own folder; operators read all.
Files are sent as they are (full quality); anything over 6 MB goes as a
resumable upload (tus, 6 MB pieces). Clients → **Onboarding** on the
operator dashboard lists the brand files and footage as links, plays the
voice memo with a download button, and shows the Drive link.

Tait gets the transcript himself and pastes it in Clients → **Onboarding**;
**Save and build documents** calls `/api/build-documents` (operators only,
needs `ANTHROPIC_API_KEY`, no transcription service), and Claude builds
**Customer Data** (Tait's voice-of-customer prompt, word
for word) and **Your Voice** (candidate 3-3-3 marked To confirm, plus the
voice profile) under the skills' rules: nothing invented, quotes word for
word. Every quote is then checked against the transcript and any that isn't
found is flagged in the document. They're saved in
`social_client_generated_docs`, for the team only (migration 019; the
portal's Documents page shows them to operators). For now Tait builds the
documents by hand (no `ANTHROPIC_API_KEY`, his choice, 2026-09-29) as
Google Docs added on Clients → Edit → Documents. Clients aren't sent them:
the "Email them their documents" button and `api/send-documents.js` were
removed (Tait, 2026-10-15: no Google Drive links to clients).
Don't click Save and build documents without the key: it marks the
documents failed, and the client's welcome page says so. The Content Ideas document still comes later, from
Tait's content research. Operators see each client's progress on Clients,
and **Onboarding** shows what they sent, the transcript box, the documents,
"Save and build / rebuild documents", and a preview of their steps
(`/welcome?client=<slug>`). A client who hasn't finished gets a "Finish
setting up" card on their To Do.

## Dashboards

Three shared, static pages. They contain no client data — everything is
fetched after login. Version 1 (2026-09-24) is deliberately the simplest
flow that works end to end; everything else was removed so it can be added
back one piece at a time:

1. Tait plans 30 days of ideas with Claude and pastes them in ("📋 Add
   ideas with Claude"). They fill the content calendar and show in the
   client's portal immediately. Each video is either **client films** or
   **we film** (`filmed_by`; defaults from the client — self-serve = client
   films, concierge = we film — and can be changed per video).
2. Client films: the card offers only **Suggest changes** (a box opens in
   the card) or, after uploading to their footage folder, **Video has been
   filmed** (confirm → thank-you: "in about 7 days you'll get the finished
   video to approve"). It goes straight to Tait for an editor.
   We film: the client **approves the idea** (thank-you: "stay tuned…") or
   suggests changes; Tait films it or already has the footage, and it shows
   in his "Ready for an editor" list. Suggestions always send the idea back
   to Tait, who edits it and sends it again.
3. Timing (7 + 7): footage in → edit due in 7 days → posts 7 days after
   that (or on the planned post date, if later).
4. Tait picks an editor and sends it. The editor downloads the raw footage,
   edits from the instructions, uploads to the finished video folder named
   after the video, and taps "Finished — send to Tait" (Tait is the operator, so editors see "Tait", 2026-10-15).
5. Tait watches it: "Revisions needed" (a box whose text shows in the
   editor's "Revisions needed" section, stored in `editor_brief.revisions`
   so the client portal never shows it) or "Approve & add captions"
   (on-screen caption, post caption — required — platforms, post date),
   which clears the revisions and sends it to the client.
6. The client watches it, reads both captions, and approves it for
   posting — or requests changes (a box in the card; it goes back to the
   editor and shows in the same Revisions needed section). Clients can't
   edit anything on a card. Every client step ends in a short thank-you message, never a
   browser pop-up.
7. My desk → Videos to post lists it by post date with the captions and three
   buttons (Tait, 2026-10-28): **Finished video** (the review window: watch it,
   and still send it back to the editor with comments), **Download** (the
   latest cut into Downloads as "<title>.mp4", to AirDrop to a phone) and
   **Mark posted**. No Drive. Posting stays manual (principle 6).

### Operator dashboard — `/` → `/operator/dashboard.html`

**My desk** (Unify the System Phase 2, Tait 2026-10-21; migration 026) is
the home page: everything waiting on Tait in 5 queues with counts, narrowed
by the top client filter, plus **Due soon** (Tait, 2026-10-22: his next
step on each video, `nextTask`/`timeSensitive`, overdue or due within 3
days, soonest first). **Ideas to review** (monthly plans with status
`on_desk`: approve or reject each idea, then close the plan), **Scripts to
review** (cards in `script_review`: Approve script runs gate 1 so the client
sees the whole card, hook, outline, script and camera questions; Send back
puts it in `scripting` with the note in `editor_brief.scriptNotes`),
**Documents to review** (the 5 client documents in `on_desk`), **Videos to
review** (`in_review`) and **Videos to post** (`ready_to_post`). Before 026
is run, the first three are empty and the desk says so. **Clients → Open**
opens one client's page: Overview, Documents (brand guidelines, ICP,
identity, editing guidelines, content research: write, edit, approve, send
back; only approved brand guidelines reach the client), Footage (b-roll and
old footage the client sees, raw footage on cards, finished cuts) and
Videos (every video for that client, with its buttons, plus an **Abandoned**
list), plus **Open their portal**. The old To Do page was removed
(Tait, 2026-10-22: "that is just my desk now").

**Style guides** (Unify Phase 4, Tait 2026-10-21; migrations 028 + 033):
each client's page has a **Moodboard** tab, and **Library → House moodboard**
holds one for every client. Since 2026-10-22 the client's board is
**shared with the client** on its own **Moodboard** tab in their portal
(Tait: "one big moodboard where clients can drag and drop screenshots"). One
board component, `renderMoodBoard` in shell.js: a paper board like a pinned-up
moodboard (photos with white borders at a slight tilt, tape, handwritten
notes, paint-chip swatches from the images' colours), no labels and no
buckets. Anyone drops or pastes anywhere; new drops have no `section`, and the
bridge asks the **Art Director** to group them (look, colour, type, motion,
editing, texture, brand, words; `bridge.py moodboard place`), so each group's
items sit together on the board. Tait can also move one by hand. A client
moves or removes only what they added (`added_by`); live updates through
Supabase realtime. Once a
client's brand guidelines are approved, the bridge asks the **Art
Director** (new 2026-10-22) to turn the moodboard into their
**editing guidelines**, with a brief for the Content Editor and one for the
Motion Graphics Designer (skill `editing-guidelines-doc`, starting from
`team/content-editor/house-style.md`), which land on My desk; new moodboard
items update them. **No edit starts until a client's editing guidelines are
approved** (Tait's rule). **Library** (sidebar) lists the shared music and
sound effects (`bridge.py assets sync` indexes the folders and uploads short
previews): play, ★ Favourite, Never use. The Editor picks from it with
`bridge.py assets list` and never uses a track marked Never.

Nav (sidebar order: My desk, Content Ideas, Clients, Content Calendar, Library, Editors, Agent room, Editor portal ↗): **Content Calendar** (one chip per platform on each post date, in that
platform's color, plus ✅ approve-by, ✂️ edit-due and 🎬 film-by deadlines
until they're met; overdue ones turn red; filter by platform and by kind.
Approve by is 3 days before posting, `APPROVE_DAYS_BEFORE_POST` in
shell.js. Also "Add ideas with Claude" and "+ New idea") → **Content Ideas** (Tait,
2026-10-19: a two-column board, ideas the client hasn't seen and ideas
sent to them; see below) → **Clients** (name, portal
address, who films, raw footage folder, finished video folder) → **Library** → **Editors** → **Agent room** (the AI content team, below) → **Editor
portal ↗**. A client filter across the top narrows every page.

**Content Ideas → Idea database** (Unify Phase 5, Tait 2026-10-21;
migrations 026 + 029): every idea per client in `social_ideas`, from Tait
(+ Add idea: text, links, screenshots/voice notes, a special-request post
date), his **Telegram bot** (the bridge reads it: "Grad Gig: idea…", voice
notes transcribed, photos to the private 'ideas' bucket; pair with
`bridge.py telegram pair`), weekly research per client (Content Researcher:
Reddit's public feed, YouTube Data API outliers via `bridge.py youtube
outliers`, small Apify runs for Instagram; no TikTok) and Sandcastles links.
On the 10th the bridge asks the Team Lead for next month's plan: 20 ideas
(any mix), scored by the Expert, briefed by the Simplifier, put on My desk
by `bridge.py plan put` with post dates spread over the month's weekdays
(special requests keep their day). Tait's timing from a post date P: script
approved P−13, filmed P−10, edit done P−7. "Ask the team for next month's
plan" makes a draft plan the bridge picks up. Automatic plans start with
December 2026 (installed after the 10th). The older board below is the
**Unsent cards** tab.

**Scripting and the client's card** (Unify Phase 6, Tait 2026-10-21;
migration 030): approving a monthly plan (or **Make a card** on one idea)
makes a video card in `scripting` with the idea's format and why, post date
P, film by P−10, edit by P−7 and `editor_brief.scriptDue` P−13. The bridge
gives the Team Lead "script N cards": Writer (`bridge.py card get/put`) →
Expert → Simplifier → `card ready` → My desk → Scripts to review. Approve
script = gate 1: the client sees the whole card (hook, script, outline,
**camera questions**: answered by a client who films, asked by the
videographer otherwise). The client **Approves** or **Requests changes**
(back to `scripting` with their note, the Writer revises, Tait approves,
the client sees the new version). Footage is **uploaded on the card** by the
client or the videographer (often Tait, through the client's portal) into
the private `footage` bucket; the bridge moves each clip into the card's
Google Drive folder (`01 Raw Footage/NN. Title (posts Mon D)`, found
with Google Drive for desktop) and deletes the temporary copy. Video has
been filmed: on time keeps the post date and the edit is due P−7; late
falls back to 7 + 7. Scripting cards show on the client's Videos tab.

**Editing and reviews** (Unify Phase 7, Tait 2026-10-21; no migration):
the **AI Editor first, humans as backup**. When a card's footage is in (every
clip moved to Drive) and the client's editing guidelines are approved, the
bridge moves it to `with_editor` with `editor_brief.aiEditor` and gives the
Content Editor the edit (Motion Designer and Reviewer with it); without
approved guidelines it waits (`editor_brief.waitingOn`, shown on the client's Videos tab and My
desk). **Send to editor** offers **AI editor** next to the human editors (a
human sets `humanEditor`, which the bridge leaves alone). `bridge.py video
deliver` uploads a review copy (the `review` bucket, a new
`social_video_versions` row) and puts the card in Videos to review (no
Drive copy: only a video approved for posting goes to Finished Videos,
`copy_finished`, Tait 2026-10-28); the Content Poster drafts the
captions (`editor_brief.captionDraft`), which open pre-filled in Approve &
add captions. Tait's notes or a client's round go back to the AI Editor the
same way (bridge `edit_notes`). The bridge texts Tait (Telegram, grouped, at
most every 2 hours) when new things land on My desk, and emails each client
once a day when cards or videos wait for them (`/api/notify-review`, which
now lists cards too and accepts the service-role key from the bridge; live
once deployed).

**Content Ideas** (no migration; Tait, 2026-10-19: "ideas are on one
side and send to the client on the other"). Two columns, per client (the
top client filter), every idea at once, no category filter: **Ideas** (banked: the client
can't see them) and **Sent to client** (Ideas and To film the client can
see, not filmed yet). Drag a card across to send it, or back to take it
off their portal; each card also has a Send / Back button (phones can't
drag). Clicking a card opens the Edit form, whose idea text (hook, script,
outline, how to film, captions, note) and format come first. Each card
shows its **format** (`editor_brief.format`, e.g. "Talking head · pain
opener + payoff", from the outlier research; the Format field in Edit,
`format` in Add ideas with Claude). A banked idea is an Idea
(`concept_pending`) with gate 1 cleared, so the client's RLS already hides
it, plus `editor_brief.ideaBank = { from, postDate, dueToFilm, dueToEdit }`
(where it was and its old dates; dates are cleared while banked), which
keeps it apart from ideas sent back with suggestions. Banked ideas are off
My desk, the calendar and the client's portal (`workVideos()` / `inIdeaBank`).
Sending stamps gate 1 through `social_operator_approve_concept`, removes
the marker, and puts a we-film idea that was To film back there. **Move
back to Ideas** is on the card of any Idea or To film video; "Add ideas
with Claude" has a "Put them in Content Ideas" box (ticked when opened
from Content Ideas). Where the ideas come from: `content-engine` (Tait's
own ideas from his voice memos, `sources/ideas.md`, each paired with an
outlier format).

**Raw footage per video:** a video can have its own Drive folder
(`editor_brief.rawFootageUrl`, the "Raw footage folder for this video" field
in the video form); `rawFootageLink` in shell.js sends every Raw footage /
Upload footage button (operator rows and card, editor, client) there, and
falls back to the client's raw footage folder when it's empty. Folders are
made by hand or by Claude in Drive, inside the client's raw footage folder,
named "NN. Title (posts Mon D)". **✓ Mark filmed** on a we-film video
(to_film → filmed) clears its film-by deadline; it stays ready for an
editor (Send to editor on its row).

Click any video for its card. **Abandon** (an idea that won't happen)
sets status `rejected`, remembers where it was in `editor_brief.abandonedFrom`,
and takes it off the calendar, the client's portal and the editor's page;
the client's Videos tab → Abandoned lists it with **Restore** (back where it was) and
**Delete**. **🗑 Delete** (card, Abandoned list, or the Edit form) removes the
row and its status history for good. "Edit" opens the full form (any status, the
dates (Month · Day · Year dropdowns, `dateSelectHtml` in shell.js), editor, the idea fields, caption, note, and one "Editing
instructions" field stored as `editor_brief.instructions` — older videos'
separate brief fields are folded into it for display). Entering a post date
suggests edit-by 7 days earlier.

### Look and feel

The sidebar is navy. The operator dashboard, client portal and editor portal have a navy
work area with white cards (`body.navy-work`; Tait, 2026-10-22: "i want all
the background to be navy. the video cards can stay white"); every popup keeps the light grey work area with white cards and
navy text (Tait, 2026-10-01: "too much navy"; the `.main, .modal-backdrop`
block at the top of shell.css). The operator dashboard and the client portal are **glass** (the portal too: Tait, 2026-10-22, "make sure that the client facing dashboard looks like the operator dashboard")
(`body.glass`, end of shell.css; Tait, 2026-10-22: "glass morphism… like
apple design", keeping navy with the gold accent): a softly lit navy
background, dark frosted sidebar and sticky top bar, light frosted cards,
frosted pop-ups that scale in, Apple's system font, press feedback, solid
fallbacks for reduced transparency and motion. Onboarding (`/welcome`) and the sign-in screen are glass too, and the
platinum logo animation (`dashboards/template/motion/`, copied to
`/assets/motion/`) plays on sign-in, at the top of onboarding and when My
desk or a client's To Do is empty. Built with the apple-design
and impeccable skills. Navy `#04101f` and white do the work; gold/tan `#C4AB82` from
fullylaunched.com is a rare accent, used only for what needs attention
(Time sensitive when it has something in it, overdue, today on the
calendar) and the one main action on a page (`.accent`: "Add ideas with
Claude"). `.primary` buttons are white. One navy for every surface; cards
and fields are outlined. Status badges are white (dimmed once done);
platforms are color-coded, filled pills (YouTube red, Instagram purple,
Facebook blue, LinkedIn green, TikTok cyan; Tait's call, 2026-10-01). One typeface,
Hanken Grotesk, with weight for headings. No emoji. Layout: a top bar
(where you are, and the client switch on the right); filter tabs as one
segmented bar with count bubbles (`chipLabel`); video lists as tables
(Video · Posts · Platforms · Status · Actions, `vrowHtml`), where clicking
a row or its title opens the video's card and its own buttons don't. Only the sidebar tabs
are raised (white offset shadows). On phones the sidebar becomes a top bar.

### Client portal — `/clients/<slug>`

One shared file; the slug comes from the URL. Three pages: **To Do**,
**Content Calendar** and **Documents** (just their moodboard, 2026-10-22) (Tait, 2026-10-15: "a super simple view where they
only see the things they need to do"). No footage folder link and no
Google Drive for clients. An operator viewing the portal also gets a
**Documents** page: every document for that client, Team only ones marked,
and the ones built from the voice memo. Only operators and editors can
read client documents (migration 019): a client's login can't read
`social_client_documents`, `social_client_generated_docs` or
`social_drive_folder_links` (whose row also holds the brand guidelines,
important documents and other document links). The portal gets just the
raw footage and finished video folders from
`social_client_footage_folders()`.

**To Do** is two tabs and nothing else: **To film** (videos the client
films, grouped by category with a filter row, remembered per browser;
Tait, 2026-10-02) and **To review** (we-film ideas to approve or suggest
changes on, and finished videos to approve, finished first). With nothing
to do, both are empty: no message, no other cards. It opens on the first
tab with something in it. The "Finish setting up" card still shows for a
client who hasn't finished onboarding.

**Opt out of reviewing** (Tait, 2026-10-26; migration 038): under To
review, a box with **Opt out of the reviewing process** ("they trust us
completely"), and a walkthrough step pointing at it ("Or skip reviewing").
Opting out (`social_set_client_review_opt_out`, the client or an operator)
sets `social_clients.skip_client_review`, approves what's waiting for them,
and from then on triggers send every finished video Tait approves straight
to Ready to post and every carousel to approved (gate 3 is skipped; Tait's
gate 2 stays). The operator's approve button says so. **Opt back in** puts
new ones back in their To review. Idea OKs are unchanged.

**More than one person per portal** (Tait, 2026-10-26: "it's not just
Mark, but it's other people on his board as well"; migration 039). The
contact stays the one invited the usual way. Everyone else on the client's
team is a member (`social_client_members`, operators only): the client's
page → Overview → **People with access** → **Add a person** (or
`bridge.py invite --client <slug> --email <e> --name <n> --add`) sends them
the welcome email in their own name through `/api/invite` (`{clientId,
email, name}`). Their first sign-in links them to the client
(`social_claim_client_invite`); `/welcome` asks them only for a password
(`social_is_client_member()`), then opens the portal's walkthrough. They
see and can do everything the contact can. One login still opens one
dashboard: an email already on another client, the team or an editor is
refused.

**Content Calendar**: each post date shows the video's full title and a
colored pill per platform, with a "Posts on" key above; 🎥 film dates for
client-filmed ideas. Under the grid, **Posting in the next 30 days**: each
post with where it's at, its hook and platforms. Clicking a video (grid or
list) opens it read only: post date, platforms, where it is in the process
(Idea → Filming → Editing → Your review → Ready to post → Posted), the
hook, a note if it's waiting on them in To Do, and **Watch the video** once
there's one to watch (from Your review on, or the cut they sent changes
on; an editor's cut Tait hasn't approved is never shown). Every video card starts with its post date, where it's at (in plain
words) and a pill per platform it posts on. Then only what's needed:
client-filmed ideas — film-by date, hook, script, outline, how to film it,
upload link; we-film ideas — when we film it, hook, script, outline, and
"How we'll make it" (the filming notes); at final approval — the video and both captions
(read-only). Every client button calls
`social_client_video_action`. An operator opening a portal sees exactly
what the client sees and can click the client's buttons (logged as the
operator). Operators can also edit a video's words there (Tait,
2026-10-19): clicking a video opens it as text boxes (title, hook,
script, outline, how to film it, on-screen caption, caption, note,
platforms; empty ones too, to add something new), and each card and
calendar popup has **Edit** (`openOperatorEdit`). A client login never
gets these. Dates, status and the editor stay on the operator dashboard.

### Editor dashboard — `/editor/dashboard.html`

The editor portal's work area is navy like its sidebar, with white
headings and tabs and white cards (`body.navy-work` in shell.css; Tait,
2026-10-15); the operator dashboard and the client portal have the same
since 2026-10-22, in glass (below). The operator's Documents page in a client portal starts each client
with **Brand guidelines** (their colors, logo and font; `brandRow` in
shell.js), saying so when there isn't one yet. **Editors see no client
documents** (Tait, 2026-10-15, later the same day, reversing 020: "i dont
want editors to be able to see those important documents"; migration
021). No Documents page, no document buttons on a video card, nothing in
the walkthrough. The database enforces it: editors can't read
`social_client_documents`, `social_client_generated_docs` or
`social_drive_folder_links`; the page gets each client's raw footage,
finished video and brand guidelines links from `social_editor_folders()`.
The **Brand guidelines** button stays on each video card.

**To Do** is two tabs and nothing else (Tait, 2026-10-15): **To edit**
(first cuts) and **To make revisions** (sent back with changes), soonest
edit-by first; empty when there's nothing. The old Show / Client / Due /
Order filters and the "This month" line are gone from the editor's page
(the operator's Editors page still has This month). **Calendar** (edit-by
dates) stays. An operator sees every editor's queue
with an editor filter.

Each video card (Tait, 2026-10-07): **Revisions needed** at the top when
it came back (each line's time as a chip, and **Watch with the comments**),
then three numbered steps: **1. Get the raw footage** (Open the raw footage:
the video's own folder, else the client's), **2. Edit it** (instructions,
brand guidelines), **3. Upload the finished video** (Open the
upload folder: the video's own finished folder when its "exact finished
file" link is a folder, else the client's finished video folder; then
Finished). A video sent back with revisions shows only what's needed to
fix it (Tait, 2026-10-15): the **Revisions needed** box with **Watch with
the comments**, then **Upload the fixed video** with Finished; the raw
footage and Edit it steps are for first cuts. When the comments don't ask for any
changes (Tait, 2026-10-19: Luke left only a comment on Grad Gig's How to
Sign up), **No changes needed: send to Tait** sends the same cut back to
Edit review with nothing to upload and no new version (`noChangesButton`). The walkthrough points at
revisions and each step.
Editor tools (migration 016, Tait 2026-10-07): each comment a video was
sent back with has a **Fixed** tick (`social_resolve_comment`; "x of y
fixed" on the card and on the operator's rows); anyone who can see a
comment can **reply** under it (`parent_id`; the editor and Tait in Watch
with the comments / Comments & replies, the client while reviewing);
**Finished** first looks in the upload folder through the Drive API
(`latestCut` in shell.js) and won't send until a finished video is there
and it isn't the same file as the last version (when Drive can't be read,
the editor confirms instead); each send saves the file as the next
**version** (`social_add_video_version`: v1, v2, …), and the review window
has a version picker that plays an earlier cut with the comments left on
it (comments carry the file in `cut_ref`); **This month** (videos finished =
first versions, revision rounds = later ones) shows for each editor on the
operator's Editors page. Email notifications to
editors are next (Tait's call).

Each card also has the client's brand guidelines Google Doc
(`social_drive_folder_links.brand_voice`, set on the Clients page), and no
other documents (021). An operator can click Finished for any editor.

**Already onboarded** (Clients → Edit, `social_clients.skip_onboarding`,
migration 015; Tait, 2026-10-07, for clients like Hesedea that he onboarded
and filmed in person): the invite's **Start here** opens the password page
only; once it's made, onboarding is marked done and they land on their
dashboard's walkthrough. The client portal sends any invited login that
hasn't made a password (and hasn't finished onboarding) to `/welcome`
first, so nothing shows before it. The walkthrough includes reviewing a
finished video when one is waiting: To review → Review
the video → inside the review window, the player and its comment marks, a
comment at a moment or on the whole video, Send changes or Approve. Steps
that don't apply (nothing to film, no documents) are left out.

### Agent room (Unify Phase 8, Tait 2026-10-21; migrations 026 + 031)

A sidebar tab on the operator dashboard (it replaced Fully AI Social and its
hand-pasted team-room feed; migration 025 was dropped). One card per AI
employee, filled from Paperclip by the bridge on Tait's Mac every couple of
minutes (`social_agent_status`): Working / Idle / Stuck / Paused, what it's
doing now (client, task, Paperclip task id), what it's stuck on, what it
needs from Tait (e.g. his Claude usage limit, Apify credit), its last line
of work and when it last ran; stuck and needs-you first, with a count on the
tab. **Try again**, **Pause** and **Resume** insert `social_agent_requests`,
which the bridge carries out in Paperclip. The job line on each card comes
from `team/team.json`, baked in by build.py. When the data is over 10
minutes old the page says to start `bridge/start.sh`. Operators only.

### Carousels (migration 022; Tait, 2026-10-15)

Instagram carousels modeled on @wefoundrs (founder stories in black and
white, navy and gold). **Operators:** a client portal's **Carousels** page
(operators only, like Documents) holds the editor's style guide
(`social_carousel_guides.body_md`, Markdown, Read / Edit) and every
carousel: format, category, the Content Research question it answers,
perspective, CTA (caption only), slides (`[{text, photo}]`, *stars* mark
the gold italic accent), caption, sources for every fact. Tait edits the
copy, picks an editor and clicks **Save and send to the editor**; reviews
the uploaded slides (**Approve** or **Send back with the note**); then
**Mark posted**. Status: idea → with_editor → to_review → approved →
posted, with changes ↔ to_review. **Editors:** a **Carousels** page (and a
walkthrough step) with only their carousels: each slide's words with a Copy
button (copies without the stars), the photo note, the guide, **Upload
slides** (images into `carousels/<client id>/<carousel id>/`, in file-name
order; × removes one) and **Send to Tait for review**
(`social_editor_submit_carousel`, needs at least one slide). Editors read
no client documents here either. Clients see none of it. The Fully
Launched copy (45 carousels: 30 founder stories plus 15 from our own voice
memos and Customer Data, every third one ours) and guide were loaded by
SQL, not kept in this public repo. Each carousel has an edit-by date (`due_to_edit`, migration
023), set on the operator's carousel form, shown as "Edit by" on the
editor's cards and as "Carousel due" blocks on the editor's Calendar. The
editor's To Do starts with **Time sensitive** (every video and carousel
due in the next 7 days or overdue, soonest first, gold when not empty; To
Do opens on it then), and has **Carousels to edit** (with them or sent
back, soonest due first), with the same cards as the Carousels page; it opens
there when there are no videos. The guide opens with example slides
(`dashboards/template/carousel-examples/`, copied to
`/assets/carousel-examples/` by build.py; public-domain or CC BY-SA photos,
credited on the slide). Guides render Markdown images
(`![caption](/assets/… or https://…)`, side by side when on consecutive
lines) and `[label](https://…)` links (`mdToHtml` in shell.js).

## Adding a client

Operator dashboard → Clients → "+ New client": client name, portal address,
contact name / phone / email (required: the invite goes there), who usually
films, and the Drive links: main folder, Important Documents, Previous
Content, raw footage, finished videos, brand guidelines. The folders are
made by hand or by Claude (the repo never creates the client's folders itself):
`Fully Social OS/Clients/<Client>/` with 01 Raw Footage, 02 Finished Videos,
03 Important Documents, 04 Assets and 05 Previous Content (see Client Drive
structure). "Send their portal invite now" (on by default)
emails the invite as soon as the client is created.

## Adding an editor

Operator dashboard → **Editors** → **+ Invite editor** (name, email;
Tait, 2026-10-06). `/api/invite-editor` makes their login (or uses an
existing one), adds the `social_editors` row, and emails "Welcome to the
Fully Launched editor dashboard" / "We are excited to have you on the
team." / **Click to set up your dashboard**. The button opens
`/editor/dashboard.html?setup=1` on our own site, which signs them in,
asks them to create a password (until `social_editors.setup_at` is set,
migration 013), then runs the walkthrough: To Edit → Time sensitive →
the Edit by date → Calendar → bookmark this page (`runTour`
in shell.js, shared with the client portal; the operator previews it
with `?tour=1`). Editors shows each editor's status (Invited / Set up)
and **Resend invite**. A client's login can't be made an editor: one
login opens one dashboard (for a test, `name+editor@gmail.com` reaches
the same Gmail inbox).

By hand, the older way: `editor_id` must point at a `social_editors` row,
which must point at a Supabase Auth user.

- **You editing yourself (works today, no new login):** in the SQL editor,
  `insert into social_editors (id, name, email) select id, name, email from
  social_operators where email = '<your email>';` — then you appear in the
  "Pick editor" list and can use the editor dashboard.
- **A real editor:** Supabase → Authentication → Add user (their email),
  then `insert into social_editors (id, name, email) values ('<their auth
  user id>', '<name>', '<email>');`. Blocked on the CRM fix above, like
  client logins.
- **Offboarding:** `update social_editors set active = false where email =
  '<email>';` and sign them out in Supabase Auth.

## Build & deploy

`python3 dashboards/build.py` inlines `shell.css`/`shell.js`/`auth.js`
into each template and writes `dashboards/dist/` (gitignored). No client
data is ever baked in, because `dist/` is served publicly and the login
gate only runs in the browser. Rebuild after changing templates; adding
clients or videos never needs a rebuild.

`vercel.json`: `buildCommand` runs `build.py`, then writes
`dashboards/dist/supabase/config.js` from the `SUPABASE_URL` /
`SUPABASE_ANON_KEY` environment variables (the anon key is public by design
— access control is RLS). `outputDirectory` is `dashboards/dist`, so
`clients/<slug>/` source material is never served.

Migrations are applied by hand in the Supabase SQL editor, in order. Each
is safe to re-run as part of the sequence — but re-running 003 on its own
after 006 would bring back 003's older client function alongside 006's, so
re-run 006 after it.

---

# Current State

Fast-changing — a snapshot, not a promise. Trust this section over Build
Spec or Architecture Reference if they ever disagree.

As of 2026-09-23:

- **Clients:** `grad-gig` (Grad Gig) and Fully Launched (Tait's own
  agency — now a real client, `clients/fully-launched/`; its test videos
  were cleared 2026-09-25 and its brain/customer data/taste/research are
  outlines waiting on Tait's voice memo). Both self-serve, both in Supabase.
- **Migration 003** must be run in Supabase before the rebuilt dashboards
  work — the client and editor buttons call its functions.
- **No client or editor logins exist yet**, pending the CRM RLS fix.

## Blueprint vs. built

| Blueprint concept | Current state |
|---|---|
| Customer Data / taste document / voice / interview questions | ✅ Skills — `customer-data-doc`, `positioning-doc`, `voice-doc`, `interview-questions-doc` (not in this repo). |
| AI-assisted content calendar | ✅ Plan with Claude, then "Add ideas with Claude" on the operator dashboard. |
| Concept approval: owner (gate 1), then client approve / rewrite / reject | ✅ Tait adding an idea is gate 1; the client approves or adds suggestions (reject is off the page in v1). |
| Filming instructions per video, client sees what to film | ✅ `filming_instructions`, shown on the client's concept and to-film cards. |
| Footage upload per content card | 🧩 One shared Footage Uploads Drive folder per client, deep-linked from each to-film card. Not per-video upload. |
| Editor dashboard (brief, footage, brand voice, deliver) | ✅ Live, scoped per editor by RLS. |
| Owner review (gate 2), client review (gate 3) | ✅ Live. |
| 7-day edit-to-post rule | ✅ As a suggestion when entering a post date; always editable. |
| Posting database with caption | ✅ My desk → Videos to post: Finished video, Download, Mark posted. Posting stays manual (principle 6). |
| Analytics / monthly performance loop | ❌ Not built — off the client nav. |
| Competitors + Poppy on the client portal | ❌ Not built. |

## Backlog

1. Run the CRM RLS fix (`supabase/crm/013_team_only_access.sql`) and
   migrations 008 and 009, then the rest of `ONBOARDING-SETUP.md`.
2. ~~Password reset~~ — done: `/welcome?mode=reset`.
3. Repoint or retire `calendar-planner`; find where the skills live.
4. Analytics (manual entry first), then the monthly performance loop tied
   to pillar/format/perspective.
5. Competitors + Poppy access on the client portal.
6. Run the intake pipeline against real Grad Gig material for the first time.

---

# Roadmap / Not Yet Built

| Phase | Description | Status |
|---|---|---|
| 0 | Client creation — operator adds a client, gets a working (empty) portal instantly | ✅ Live |
| 1 | Onboarding — invite, password, brand, voice-memo questions, voice memo, existing footage, portal tour | ✅ Built (`/welcome`); needs `ONBOARDING-SETUP.md` to go live. Platform access not included. |
| 2 | Onboarding data lands in Supabase; documents built from the voice memo | ✅ Built (`social_client_onboarding`, `/api/build-documents` from a pasted transcript) |
| 3 | Operator generates content ideas, AI-assisted | 🧩 Claude + "Add ideas with Claude"; not in-app |
| 4 | Operator schedules content and writes filming instructions | ✅ Live |
| 5 | Client films and uploads (self-serve) or Tait films (concierge) | ✅ Status live; upload is a Drive deep link |
| 6 | Editor edits and submits for review | ✅ Live |
| 7 | Operator approves or sends back for revisions | ✅ Live |
| 8 | Client reviews, approves or requests edits | ✅ Live |
| 9 | Final content exported and posted manually | ✅ Live (posting stays manual by design) |

## Future Considerations — not committed, from a shelved alternative spec

Pulled from `FL-CRM-Social-Dash-Spec.md` (a planning doc for a different
architecture — one merged Next.js app combining the CRM and this social
dashboard under a single login — not pursued) before it's deleted. These
are ideas worth keeping on file, not plans; nothing here is scheduled
against any phase above.

1. ~~`status_audit_log` table~~ — built as `social_status_audit_log`
   in migration 003.
2. **Timestamped video comments** — a comment tied to a specific second
   within a video, not the video record as a whole. Relevant once there's
   a live operator/client review loop to attach it to (phases 7–8), not
   before.
3. **Onboarding trigger sequence** — on client activation, automatically
   request three specific things: media upload, a brand/info survey, and
   platform access. Same idea as Roadmap phase 1's onboarding survey
   above, just a sharper framing worth keeping — three concrete asks on
   day one, not one vague "onboarding survey."
4. **CRM + Social Dash merge, as an alternative architecture** — the
   shelved spec's core idea was one merged Next.js app, one login, for
   both the CRM and this dashboard. Not pursued; this repo continues as
   its own separate deployment, because the two-repo approach is working
   and already live. Noted as a real decision point to revisit later —
   not a direction anyone's committed to.
