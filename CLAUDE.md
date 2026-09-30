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
   publishing in any way.

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
folder, with five fixed subfolders — this is the template, don't improvise a
different shape per client:

```
Fully Social OS/
  General/
    Assets/                    — shared mockup/template docs, not client-specific
      Ideal Customer Profile — Template   — duplicate this per client, then fill it
  <Client Name>/
    01 Footage Uploads   — client drops raw footage here; editor pulls from here
    02 Final Edits       — editor delivers cuts here for owner approval
    03 Brand Voice       — Google Doc mirror of brain.md's founder/voice/do-don't
    04 Hooks             — good hooks for this client, for reuse/reference
    05 Assets/           — this client's filled-in research and idea documents
      Ideal Customer Profile   — Google Doc, mirrors brain.md's Ideal Customer
                                  section, built from the General/Assets template
      Transcripts/              — voice memo / call transcripts, one file per source
      Content Ideas             — concept-engine output, longer-form idea bank
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
                               (voice memo texted, not uploaded)
    crm/                       013_team_only_access.sql: the CRM's team-only
                               RLS fix (same Supabase project), with its test
  api/                        Vercel serverless functions (no npm deps):
                               invite.js (branded invite email),
                               build-documents.js (documents from a pasted
                               transcript); _lib.js, _email.js
  ONBOARDING-SETUP.md          the steps only Tait can do to turn onboarding on
    config.example.js          template for supabase/config.js (gitignored —
                               the real Supabase URL/anon key, local dev only)
```

**New-client order** (skill `client-onboarding`, `.claude/skills/client-onboarding/`):
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
repo's version of `research-sweep`. The other skills in the table are not in this
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
  exact file, and Watch then opens that instead.
  Every editor policy requires `social_editors.active` — a deactivated
  editor sees nothing. (Revoke their session in Supabase Auth too.)

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
login) to `/welcome`, emailed from Fully Launched via Resend. Without
`RESEND_API_KEY` the dashboard shows the link to copy and send by hand.
The first time a login with a *confirmed*
email matching a client's `contact_email` opens a portal,
`social_claim_client_invite()` links it to that client
(`social_client_users`); operators and editors are never linked. Clients
sign in again with "Email me a sign-in link" on the login screen.
Invites are **on** (`INVITES_ENABLED = true` in the operator template)
since 2026-09-29, Tait's decision. The CRM fix is written
(`supabase/crm/013_team_only_access.sql`, tested) but must be run in the SQL
Editor; until then any client login can read the CRM. Setup steps (redirect
URLs, domain, keys): `ONBOARDING-SETUP.md`.

"Forgot password?" sends a link to `/welcome?mode=reset`, which sets a new
password for anyone and then opens their own dashboard. The site's home
page sends a client or editor who signs in there to their own dashboard.

## Client onboarding (`/welcome`)

A new client's invite lands on `/welcome` (`dashboards/template/welcome.template.html`),
one step at a time, each saved with `social_client_onboarding_save()` so
they can stop and come back:
password → how it works → **brand** (only if they film: logo and files to
their Important Documents folder, fonts, colors, look and feel, looks they
love) → **the questions** (`ONBOARDING_QUESTIONS` in shell.js: the order
Luke's own recordings answered, plus the 3-3-3 perspective questions;
optional written notes) → **voice memo** (recorded on their phone and
texted to Tait, `TEXT_MEMO_TO` in the welcome template; "I've texted it"
records `voice_memo_sent_at`) → **footage** (their Previous Content Drive
folder) → **their documents** → **portal tour** → their portal.

Tait gets the transcript himself and pastes it in Clients → **Onboarding**;
**Save and build documents** calls `/api/build-documents` (operators only,
needs `ANTHROPIC_API_KEY`, no transcription service), and Claude builds
**Customer Data** (Tait's voice-of-customer prompt, word
for word) and **Your Voice** (candidate 3-3-3 marked To confirm, plus the
voice profile) under the skills' rules: nothing invented, quotes word for
word. Every quote is then checked against the transcript and any that isn't
found is flagged in the document. They're saved in
`social_client_generated_docs` and shown in the welcome steps and on the
portal's Documents page. For now Tait builds the documents by hand (no
`ANTHROPIC_API_KEY`, his choice, 2026-09-29) as Google Docs added on Clients
→ Edit → Documents; the welcome page's Your documents step lists those too.
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
   after the video, and taps "Finished — send to operator".
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
7. To Do's Ready to post stage lists it by post date with the captions and finished video;
   whoever posts marks it posted. Posting stays manual (principle 6).

### Operator dashboard — `/` → `/operator/dashboard.html`

Nav: **To Do** (every video by stage, one tab each plus All, with counts:
sent back with suggestions → waiting on client → ready for an editor → with
an editor → edits to review → ready to post, plus an **Abandoned** tab
kept out of All, and **⏰ Time sensitive** right after All (also kept out of
it): Tait's next task on each video, from `nextTask` (re-send an idea,
film it, send it to an editor, chase the editor, review the edit, nudge the
client to approve, post it), when its date is overdue or within
`TIME_SENSITIVE_DAYS` (3), soonest first; "Add ideas with Claude" and "+ New idea"
buttons; within each stage, videos grouped by status in pipeline order,
then by post date) →
**Content Calendar** (one chip per platform on each post date, in that
platform's color, plus ✅ approve-by, ✂️ edit-due and 🎬 film-by deadlines
until they're met; overdue ones turn red; filter by platform and by kind.
Approve by is 3 days before posting, `APPROVE_DAYS_BEFORE_POST` in
shell.js. Also "Add ideas with Claude" and "+ New idea", as on To Do) → **Clients** (name, portal
address, who films, raw footage folder, finished video folder) → **Editor
portal ↗**. A client filter across the top narrows every page.

**Raw footage per video:** a video can have its own Drive folder
(`editor_brief.rawFootageUrl`, the "Raw footage folder for this video" field
in the video form); `rawFootageLink` in shell.js sends every Raw footage /
Upload footage button (operator rows and card, editor, client) there, and
falls back to the client's raw footage folder when it's empty. Folders are
made by hand or by Claude in Drive, inside the client's raw footage folder,
named "NN. Title (posts Mon D)". **✓ Mark filmed** on a we-film video
(to_film → filmed) clears its film-by deadline; it stays in Ready for an
editor.

Click any video for its card. **Abandon** (an idea that won't happen)
sets status `rejected`, remembers where it was in `editor_brief.abandonedFrom`,
and takes it off the calendar, the client's portal and the editor's page;
To Do → Abandoned lists it with **Restore** (back where it was) and
**Delete**. **🗑 Delete** (card, Abandoned tab, or the Edit form) removes the
row and its status history for good. "Edit" opens the full form (any status, the
dates (Month · Day · Year dropdowns, `dateSelectHtml` in shell.js), editor, the idea fields, caption, note, and one "Editing
instructions" field stored as `editor_brief.instructions` — older videos'
separate brief fields are folded into it for display). Entering a post date
suggests edit-by 7 days earlier.

### Look and feel

Navy `#04101f` and white do the work; gold/tan `#C4AB82` from
fullylaunched.com is a rare accent, used only for what needs attention
(Time sensitive when it has something in it, overdue, today on the
calendar) and the one main action on a page (`.accent`: "Add ideas with
Claude"). `.primary` buttons are white. One navy for every surface; cards
and fields are outlined. Status badges are white (dimmed once done);
platforms are white, told apart by their line (Facebook solid, LinkedIn
outline, Instagram dashed, TikTok dotted, YouTube double). One typeface,
Hanken Grotesk, with weight for headings. No emoji. Layout: a top bar
(where you are, and the client switch on the right); filter tabs as one
segmented bar with count bubbles (`chipLabel`); To Do's stages as tables
(Video · Posts · Platforms · Status · Actions, `vrowHtml`), where clicking
a row or its title opens the video's card and its own buttons don't. Only the sidebar tabs
are raised (white offset shadows). On phones the sidebar becomes a top bar.

### Client portal — `/clients/<slug>`

One shared file; the slug comes from the URL. **To Do** (a "Your
footage folder" card, then tabs: **All** — the default, every action the
client has to take, grouped under headings; **Time sensitive** — the
client's own next step on each video (film it, approve the idea, approve the
finished video) when it's late or due within 3 days, soonest first, kept out
of All; To film — client-filmed
ideas; Ideas to approve — we-film ideas; Finished videos to approve. A
tab shows when it fits the client's default or has something in it), **Content Calendar**
(each post date shows the video's full title and a colored pill per
platform, with a "Posts on" key above; 🎥 film dates for client-filmed
ideas; under the grid, "What posts each day": the month as a list with
each video's hook and platforms by name), **Documents**
(the client's important Google Drive docs — `social_client_documents`,
added on the operator's Clients → Edit; clients read only their own) and **My footage
folder ↗** (the client's Drive folder — what they upload and what we
film). Every video card starts with its post date, where it's at (in plain
words) and a pill per platform it posts on. Then only what's needed:
client-filmed ideas — film-by date, hook, script, outline, how to film it,
upload link; we-film ideas — when we film it, hook, script, outline, and
"How we'll make it" (the filming notes); at final approval — the video and both captions
(read-only). Every client button calls
`social_client_video_action`. An operator opening a portal sees exactly
what the client sees and can click the client's buttons (logged as the
operator); editing happens only on the operator dashboard.

### Editor dashboard — `/editor/dashboard.html`

**To Edit** (videos currently with them: edit-by date, revisions if it came
back, editing instructions, the client's brand guidelines Google Doc —
`social_drive_folder_links.brand_voice`, set on the Clients page — and the
raw footage and finished video folder links; nothing else) and
**Calendar** (edit-by dates). An operator sees every editor's queue with a
filter, and can click Finished for them.

## Adding a client

Operator dashboard → Clients → "+ New client": client name, portal address,
contact name / phone / email (required: the invite goes there), who usually
films, and the Drive links: main folder, Important Documents, Previous
Content, raw footage, finished videos, brand guidelines. The folders are
made by hand or by Claude (the repo never creates Drive folders itself):
`Fully Social OS/<Client>/` with Important Documents, Previous Content, Raw
Footage and Finished Videos. "Send their portal invite now" (on by default)
emails the invite as soon as the client is created.

## Adding an editor

`editor_id` must point at a `social_editors` row, which must point at a
Supabase Auth user — so a video can't go to an editor until one exists.

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
| Posting database with caption | ✅ To Do → Ready to post, with copy-caption. Posting stays manual (principle 6). |
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
