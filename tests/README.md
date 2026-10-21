# Tests

Nothing here touches the real Supabase project. Every test builds a fresh
in-memory Postgres (PGlite), runs the real migrations in
`supabase/migrations/` against it, and signs in as each role, so the
access rules and action functions are the real ones.

Setup, once: `cd tests && npm install`. Then `npm test` (rebuild the
dashboards first with `python3 dashboards/build.py` if templates changed).

| File | What it checks |
|---|---|
| `db.test.mjs` | Database rules: approval gates, who-films rules and the 7+7 dates, caption edits, invite claiming (confirmed email only, never operators), no direct client/editor writes, inactive editors locked out, audit log. |
| `parity.test.mjs` | The buttons each page shows (`VIDEO_ACTIONS` in `shell.js`) match what the database allows, for every status and client type. |
| `operator-approve.test.mjs` | The operator's "Approve for client" buttons: only after gate 1 for concepts, move the video on, logged as the operator. |
| `operator-portal.test.mjs` | The operator in a client portal: every client button works for them, the Edit form saves, concierge clients get only their steps, all logged as the operator. |
| `operator-editor.test.mjs` | The operator in the editor portal: links from the operator dashboard, opens on one editor's work, clicks Finished for any editor (including themself), logged as the operator. |
| `date-dropdowns.test.mjs` | The Month · Day · Year dropdowns in the video forms: picking, the 7-day edit-by suggestion, Feb 31 → Feb 28, editing an existing date, saving (operator form and portal edit form). |
| `todo-tabs.test.mjs` | To Do's stage tabs and counts, filtering by client with the top chips, and marking posted from the Ready to post stage. |
| `abandon-delete.test.mjs` | Abandon an idea (off the calendar and the client's portal, onto To Do → Abandoned), restore it to where it was, delete from the card, the Abandoned tab and the Edit form, and add a new idea. |
| `client-calendar.test.mjs` | The client's Content Calendar: full titles, a platform pill per platform (aliases like ig/fb included), the Posts on key, the day-by-day list with hooks, and abandoned ideas hidden. |
| `time-sensitive.test.mjs` | To Do's Time sensitive tab (Tait's tasks due within 3 days or overdue, soonest first; client tasks, far-off dates and abandoned ideas left out), and the client's video card: post date, stage, platforms, when we film it. |
| `footage.test.mjs` | Per-video raw footage folders on operator rows and cards, the editor page and a filming client's card (with fallback to the client folder); Mark filmed; the video form validating the folder and keeping the rest of editor_brief. |
| `onboarding.test.mjs` | Client onboarding: who can save each step (migration 008), a new client walking every step of `/welcome` (password, brand, questions, texting the voice memo, footage, documents, tour), a we-film client with no brand step, the operator's progress and Onboarding view (pasting a transcript to build documents), a new client needing an email and getting their invite, the portal's documents and Continue card, the Forgot-password page, and saving clients before migration 008 runs. |
| `api.test.mjs` | The `/api` functions (including `invite-editor`: who's allowed, the editor row, the editor welcome email, Resend, and refusing a client's login) with Supabase, Resend and Anthropic faked: who's allowed, invite links (new vs existing login), the branded email, the copy-the-link fallback, both documents built from a pasted transcript with Tait's prompt (team only, no transcription service), quote checking, and failures saved with their reason. |
| `documents.test.mjs` | Client documents: added, checked, ordered and removed on Clients → Edit; shown on the portal's Documents page (under Content Calendar). |
| `editor-onboarding.test.mjs` | Editor onboarding: Editors page (list, + Invite editor, Resend invite), the editor's first visit (create a password, marked set up), the walkthrough (To Edit, Time sensitive, Edit by, Calendar, Documents, bookmark), Time sensitive and Documents on the editor page, and the operator's ?tour=1 preview. |
| `flow.test.mjs 1\|2\|3` | Both client journeys end to end, clicking the real built pages: 30 client-filmed ideas (suggest changes / Video has been filmed → 7+7 dates → editor → revisions or approve + captions → client caption edits / change requests → posted), a we-film client (approve ideas, no upload), a per-video switch, and a new client with contact details + invite claim. Run 2 adds suggestions and client edits; run 3 adds owner revisions and backing out of "filmed". |
| `unified-pipeline.test.mjs` | Migration 026: ideas and monthly plans (operator only, status changes logged), Scripting / Script review cards hidden from clients, the 5 client documents (client reads only approved brand guidelines), style assets, the footage library (clients add b-roll/raw, see their own), the agent room. |
| `desk.test.mjs` | Unify Phase 2: My desk is the home page with 5 queues (ideas, scripts, documents, videos to review, videos to post) and counts, the client filter, approving/rejecting ideas and closing a monthly plan, approving a script (client then sees the whole card) or sending it back with a note, approving documents (client reads only approved brand guidelines), and one page per client (Overview, Documents, Footage, Videos). |
| `onboarding-team.test.mjs` | Unify Phase 3 (migration 027): the Onboarding panel's recordings and transcript status, uploading a call recording, Copy to send for the questions, and pasting a transcript so the team builds the documents (clients can't read recordings). Bridge logic: `python3 bridge/test_bridge.py`. |
| `style-guide.test.mjs` | Unify Phase 4 (migration 028): the Library (music and sound effects by folder, search, play the preview, Favourite / Never use) and moodboards (the house moodboard and each client's: drop images/videos, add a link or note, note an item, remove it). Clients can't read either. |
| `ideas-db.test.mjs` | Unify Phase 5 (migrations 026 + 029): the Content Idea Database page: list and filter by client, source, status and search; add an idea with a link, a special-request date and a screenshot; edit, reject/restore, delete; Ask the team for next month's plan (a draft plan the bridge picks up); the older unsent cards on their own tab. |
| `scripting.test.mjs` | Unify Phase 6 (migration 030): approving a plan makes a card per approved idea in Scripting (film P-10, edit P-7, script P-13), Make a card from one idea, To Do's Scripting stage, the client's whole card (camera questions), Approve / Request changes, uploading footage on the card (the 'footage' bucket) and Video has been filmed keeping the post date. |
| `editing.test.mjs` | Unify Phase 7: the AI editor next to human editors (Send to editor → AI editor flags the card for the bridge; a human editor marks it so the bridge leaves it alone), "waiting on editing guidelines" on To Do and My desk, and Approve & add captions opening with the Content Poster's draft and cover idea. |
| `agent-room.test.mjs` | Unify Phase 8 (migration 031): the Agent room's cards (stuck and needs-you first, client + task, last line, the job from team.json), Try again / Pause as requests for the bridge, the out-of-date notice; clients can't read it. |
| `harness.mjs` | Shared setup for the flow test. |

`serve_local.py` serves `dashboards/dist` on http://localhost:5173 with the
same redirects as `vercel.json`, using your local (gitignored)
`supabase/config.js`: `python3 tests/serve_local.py`.
