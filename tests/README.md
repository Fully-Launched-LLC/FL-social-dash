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
| `todo-tabs.test.mjs` | To Do's stage tabs and counts, the client dropdown (in sync with the top chips), and marking posted from the Ready to post stage. |
| `abandon-delete.test.mjs` | Abandon an idea (off the calendar and the client's portal, onto To Do → Abandoned), restore it to where it was, delete from the card, the Abandoned tab and the Edit form, and add a new idea. |
| `documents.test.mjs` | Client documents: added, checked, ordered and removed on Clients → Edit; shown on the portal's Documents page (under Content Calendar). |
| `flow.test.mjs 1\|2\|3` | Both client journeys end to end, clicking the real built pages: 30 client-filmed ideas (suggest changes / Video has been filmed → 7+7 dates → editor → revisions or approve + captions → client caption edits / change requests → posted), a we-film client (approve ideas, no upload), a per-video switch, and a new client with contact details + invite claim. Run 2 adds suggestions and client edits; run 3 adds owner revisions and backing out of "filmed". |
| `harness.mjs` | Shared setup for the flow test. |

`serve_local.py` serves `dashboards/dist` on http://localhost:5173 with the
same redirects as `vercel.json`, using your local (gitignored)
`supabase/config.js`: `python3 tests/serve_local.py`.
