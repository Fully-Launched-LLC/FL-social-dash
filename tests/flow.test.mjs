// Tait's flow, end to end, clicking the real buttons on the real built
// pages. Two clients:
//   Fully Launched — the client films (like Grad Gig): 30 ideas from Claude.
//     They suggest changes or upload footage and tap "Video has been filmed".
//   Premium Co — we film: the client approves ideas and never uploads.
// Then editor → Tait (revisions / approve + captions) → client final
// approval (with caption edits, or changes to the video) → Ready to Post.
//   node tests/flow.test.mjs 1   smooth path
//   node tests/flow.test.mjs 2   suggestions, client asks for video changes
//   node tests/flow.test.mjs 3   Tait asks for revisions; client backs out of "filmed" once; one video switched to "we film"
import { freshDb, makeHarness, checker, pickFile } from "./harness.mjs";

const RUN = Number(process.argv[2] || 1);
const V = {
  1: { change: [], opRev: [], clientRev: [], post: 30, early: false, switchToUs: [] },
  2: { change: [25, 26, 27], opRev: [], clientRev: [4, 5], post: 10, early: false, switchToUs: [] },
  3: { change: [0], opRev: [1, 2, 3], clientRev: [6], post: 15, early: true, switchToUs: [29] },
}[RUN];
console.log(`Run ${RUN}:`, JSON.stringify(V));

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const U = { op: "00000000-0000-0000-0000-00000000000a", ed: "00000000-0000-0000-0000-00000000000b", cl: "00000000-0000-0000-0000-00000000000d", prem: "00000000-0000-0000-0000-00000000000e", invited: "00000000-0000-0000-0000-00000000000f" };
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
const PREM = "d44e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users (id) values ('${U.op}'),('${U.ed}'),('${U.cl}'),('${U.prem}');
  insert into social_operators values ('${U.op}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${U.ed}','Morgan','m@x');
  update social_editors set setup_at = now(); -- they made their password (migration 013)
  insert into social_clients (id,name,slug,client_system) values
    ('${FL}','Fully Launched','test-fully-launched','self-serve'),
    ('${PREM}','Premium Co','premium-co','concierge');
  insert into social_client_users (id,client_id,email) values ('${U.cl}','${FL}','fl@x'),('${U.prem}','${PREM}','prem@x');
  insert into social_drive_folder_links (client_id, footage_uploads, final_edits, brand_voice) values
    ('${FL}','https://drive/fl-footage','https://drive/fl-final','https://docs/fl-brand'),
    ('${PREM}','https://drive/prem-footage','https://drive/prem-final',null);
`);
const TODAY = (await db.query("select current_date::text d")).rows[0].d;
const plus = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const BASE = "https://fl.test";
const OP = o => openPage("operator/dashboard.html", U.op, BASE + "/operator/dashboard.html", o);
const CL = () => openPage("clients/portal.html", U.cl, BASE + "/clients/test-fully-launched");
const PREMP = () => openPage("clients/portal.html", U.prem, BASE + "/clients/premium-co");
const ED = () => openPage("editor/dashboard.html", U.ed, BASE + "/editor/dashboard.html");

const day = n => plus("2026-10-01", n);      // Oct 1 + n
const nice = iso => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const title = i => `Post ${String(i + 1).padStart(2, "0")} — idea ${i + 1}`;
const plan = Array.from({ length: 30 }, (_, i) => ({
  title: title(i), platform: ["instagram", "tiktok"], hook: `Hook ${i + 1}`,
  body: `Talking points ${i + 1}`, outline: [`Point A${i + 1}`, `Point B${i + 1}`], filmingDirection: `Film it like this: ${i + 1}`, editorInstructions: `Cut it like this: ${i + 1}`,
  dueToFilm: day(i - 10), dueToEdit: day(i - 7), postDate: day(i),
}));

const $ = (p, s) => p.d.querySelector(s);
const $$ = (p, s) => Array.from(p.d.querySelectorAll(s));
// Tab text as "Label (n)" (the count shows as a bubble on the page).
const tabsText = p => $$(p, "#videoTabs .chip").map(c => c.textContent.trim().replace(/\s+(\d+)$/, " ($1)")).join("");
const tabCount = (p, k) => Number(($(p, `#videoTabs [data-tab="${k}"]`)?.textContent.match(/(\d+)\s*$/) || [])[1] || 0);
const openTab = async (p, k) => click($(p, `#videoTabs [data-tab="${k}"]`), "tab " + k);
const btn = (root, text) => root && Array.from(root.querySelectorAll("button")).find(b => b.textContent.trim().startsWith(text));
async function click(el, what) { if (!el) throw new Error("not found: " + what); el.click(); await settle(); }
const portalCard = (p, listSel, t) => $$(p, listSel + " .card").find(c => (c.querySelector("[data-open]") || {}).textContent === t);
const opRow = (p, listSel, t) => $$(p, listSel + " .row").find(r => (r.querySelector("b.video-card") || {}).textContent === t);
// A video's row on its client's Videos tab (Clients → Open → Videos).
const cpRow = (p, t) => { for (const c of [FL, PREM]) { p.w.openClientPage(c, "videos"); const r = opRow(p, "#cpBody", t); if (r) return r; } };
const edCard = (p, t) => $$(p, "#queueList .card").find(c => c.querySelector("[data-open]").textContent === t);
const modal = p => $(p, "#videoModalBox");
const modalOpen = p => !$(p, "#videoModalRoot").classList.contains("hidden");
const statusOf = async t => (await db.query("select status, note, concept_approved_at, caption, on_screen_caption, editor_id, due_to_edit::text, post_date::text, filmed_by from social_videos where title=$1", [t])).rows[0];
const count = async (where, params = [], from = "social_videos") => (await db.query(`select count(*)::int n from ${from} where ${where}`, params)).rows[0].n;
const allPages = [];
const track = p => { allPages.push(p); return p; };
// Client portal: the inline "Suggest changes" / "Request changes" box.
async function sendNote(p, card, buttonLabel, text) {
  await click(btn(card, buttonLabel), buttonLabel);
  const box = card.querySelector(".note-box");
  chk(`${buttonLabel} opens a box in the card (no pop-up prompt)`, box && box.style.display !== "none" && !p.ui.promptsShown.length);
  box.querySelector("textarea").value = text;
  await click(box.querySelector("[data-send]"), "send note");
}
async function dismissThanks(p, expect) {
  chk(`thank-you message: ${expect}`, modalOpen(p) && modal(p).textContent.includes(expect), modalOpen(p) && modal(p).textContent.slice(0, 200));
  await click($(p, "#msgOk"), "got it");
}

const idx = Array.from({ length: 30 }, (_, i) => i);

// ── 1. Operator plans 30 ideas with Claude and adds them ──
let op = track(await OP());
chk("opens on My desk", $(op, "#view-desk").classList.contains("active"));
await click($(op, "#bulkAddBtn"), "add ideas");
$(op, "#bkClient").value = FL;
$(op, "#bkText").value = "Here you go:\n```json\n" + JSON.stringify(plan, null, 2) + "\n```";
$(op, "#bkText").dispatchEvent(new op.w.Event("input"));
chk("preview shows 30", $(op, "#bkPreview").textContent.includes("30 idea(s) ready"), $(op, "#bkPreview").textContent.slice(0, 80));
await click($(op, "#bkSave"), "save ideas");
let rows = (await db.query("select title, status, filmed_by, concept_approved_at, editor_brief, outline from social_videos order by title")).rows;
chk("30 videos created", rows.length === 30, rows.length);
chk("all visible to the client right away, filmed by the client (FL's default)", rows.every(r => r.status === "concept_pending" && r.concept_approved_at && r.filmed_by === "client"), rows[0]);
chk("outline + editing instructions saved", rows.every((r, i) => r.outline === `- Point A${i + 1}\n- Point B${i + 1}` && r.editor_brief.instructions === `Cut it like this: ${i + 1}`), rows[0]);
for (const i of V.switchToUs) {
  op.w.openVideoForm((await db.query("select id from social_videos where title=$1", [title(i)])).rows[0].id); await settle();
  $(op, '[data-f="filmedBy"]').value = "us";
  await click($(op, "#vfSave"), "switch to we film");
  chk(`#${i} switched to "we film"`, (await statusOf(title(i))).filmed_by === "us");
}
const clientFilmed = idx.filter(i => !V.switchToUs.includes(i));

// ── 2. Client (films their own) ──
let cl = track(await CL());
const shownNav = p => $$(p, ".nav-item").filter(n => n.style.display !== "none").map(n => n.textContent.trim());
chk("client nav: To Do, Calendar and Moodboard (no Documents, no Drive, no footage folder)", shownNav(cl).join("|") === "To Do|Content Calendar|Moodboard", shownNav(cl));
chk("no footage folder card", !$(cl, "#footageCard") && !$(cl, "#footageCardLink"));
chk("To Do is exactly two tabs, To film and To review", $$(cl, "#videoTabs .chip").map(c => c.dataset.tab).join() === "film,review" && !$(cl, "#nextStep"), tabsText(cl));
chk("it opens on To film", $(cl, "#videoTabs .chip.active").dataset.tab === "film" && $(cl, '[data-panel="film"]').style.display !== "none");
chk("client can't edit anything on a card", !$$(cl, "#view-videos button").some(b => b.textContent.includes("Edit")) && !$(cl, "#view-videos textarea:not(.note-box textarea)"));
chk(`To film shows only the videos the client films (${clientFilmed.length})`, tabCount(cl, "film") === clientFilmed.length, tabsText(cl));
chk(`we-film ideas sit under To review (${V.switchToUs.length})`, tabCount(cl, "review") === V.switchToUs.length, tabsText(cl));
const c0 = portalCard(cl, "#listToFilm", title(0));
chk("to-film card: film-by, hook, script, outline, how to film", c0 && ["Film by " + nice(day(-10)), "Hook 1", "Talking points 1", "- Point A1\n- Point B1", "Film it like this: 1"].every(t => c0.textContent.includes(t)), c0 && c0.textContent);
chk("to-film card: Upload footage on the card + Video has been filmed / Approve / Request changes (030)", c0 && !!c0.querySelector("[data-upload]")
  && Array.from(c0.querySelectorAll(".actions button")).map(b => b.textContent).join("|") === "Video has been filmed|Approve|Request changes", c0 && Array.from(c0.querySelectorAll(".actions button")).map(b => b.textContent));
chk("client never sees editing instructions", !cl.d.body.textContent.includes("Cut it like this"));

// Requested changes go back to Scripting (030): the Writer revises, Tait
// approves the script, the client sees the new version.
for (const i of V.change) {
  await sendNote(cl, portalCard(cl, "#listToFilm", title(i)), "Request changes", "Make it funnier " + i);
  await dismissThanks(cl, "rework this card");
  const s = await statusOf(title(i));
  chk(`#${i} back to Scripting with the client's note`, s.status === "scripting" && !s.concept_approved_at && s.note === "Make it funnier " + i, s);
}
if (V.change.length) {
  op = track(await OP());
  for (const i of V.change) chk(`#${i} in Scripting on the client's Videos tab with the client's note`, cpRow(op, title(i))?.textContent.includes("Make it funnier " + i));
  // The Writer's revision (what bridge.py card put + card ready do).
  for (const i of V.change) await db.query("update social_videos set hook=$2, status='script_review', note=null where title=$1", [title(i), "Funnier hook " + i]);
  op = track(await OP());
  for (const i of V.change) await click(btn(opRow(op, "#deskScripts", title(i)), "Approve script"), "approve script " + i);
  cl = track(await CL());
  for (const i of V.change) chk(`client sees rewrite #${i}`, portalCard(cl, "#listToFilm", title(i))?.textContent.includes("Funnier hook " + i));
}

// "Video has been filmed": confirm, then a thank-you with the 7-day wait.
if (V.early) {
  await click(btn(portalCard(cl, "#listToFilm", title(0)), "Video has been filmed"), "filmed (not yet)");
  chk("asks whether the footage is uploaded", modalOpen(cl) && modal(cl).textContent.includes("Is your footage uploaded?"));
  await click($(cl, "#cfNo"), "not yet");
  chk("not yet: nothing moves", (await statusOf(title(0))).status === "concept_pending" && !modalOpen(cl));
}
for (const i of clientFilmed) {
  await click(btn(portalCard(cl, "#listToFilm", title(i)), "Video has been filmed"), "filmed " + i);
  await click($(cl, "#cfYes"), "yes uploaded " + i);
  await dismissThanks(cl, "7 days");
}
chk("all filmed → straight to Tait for an editor (no approve step)", (await count("status='ready_to_edit'")) === clientFilmed.length);
const s0 = await statusOf(title(0)), s29 = await statusOf(title(clientFilmed.at(-1)));
chk("edit due 7 days after filming", s0.due_to_edit === plus(TODAY, 7), s0);
chk("posts 14 days after filming, or on the planned date if later",
  s0.post_date === (day(0) > plus(TODAY, 14) ? day(0) : plus(TODAY, 14)) && s29.post_date === (day(clientFilmed.at(-1)) > plus(TODAY, 14) ? day(clientFilmed.at(-1)) : plus(TODAY, 14)), [s0.post_date, s29.post_date]);
chk("To film now empty, with nothing on the page", tabCount(cl, "film") === 0 && !$$(cl, "#listToFilm .card").length && !$(cl, '[data-panel="film"] .panel-help:not([style*="none"])'), tabsText(cl));
chk(`To review: ${V.switchToUs.length}`, tabCount(cl, "review") === V.switchToUs.length, tabsText(cl));

// A "we film" video on this client: approve the idea, then Tait films it.
if (V.switchToUs.length) {
  const i = V.switchToUs[0];
  await openTab(cl, "review");
  const card = portalCard(cl, "#listReview", title(i));
  chk("videographer card: no upload until approved, no film-by, Approve / Request changes", card && !card.querySelector("[data-upload]") && !card.textContent.includes("Film by")
    && Array.from(card.querySelectorAll(".actions button")).map(b => b.textContent).join("|") === "Approve|Request changes", card && Array.from(card.querySelectorAll(".actions button")).map(b => b.textContent));
  await click(btn(card, "Approve"), "approve we-film idea");
  await dismissThanks(cl, "film it with you");
  chk("approved → to film on Tait's side", (await statusOf(title(i))).status === "to_film");
  chk("once approved it leaves To Do; both tabs empty, nothing on the page", !portalCard(cl, "#listReview", title(i)) && tabCount(cl, "film") === 0 && tabCount(cl, "review") === 0 && !$$(cl, "#view-videos .card").length, tabsText(cl));
  op = track(await OP());
  chk("Tait sees it ready for an editor with the raw footage link", !!cpRow(op, title(i))?.querySelector('a[href="https://drive/fl-footage"]'));
}

// ── 3. Operator assigns the editor ──
op = track(await OP());
op.w.openClientPage(FL, "videos");
const readyRows = () => $$(op, "#cpBody .row").filter(r => btn(r, "Send to editor"));
chk("30 ready for an editor", readyRows().length === 30, readyRows().length);
for (const i of idx) {
  if (i === 0) {   // through the popup, which sits over the row
    await click(cpRow(op, title(i)).querySelector("b.video-card"), "open popup");
    const box = $(op, "#videoModalBox .modal-actions");
    box.querySelector("select").value = U.ed;
    await click(btn(box, "Send to editor"), "send from popup");
    continue;
  }
  const row = cpRow(op, title(i));
  row.querySelector("select").value = U.ed;
  await click(btn(row, "Send to editor"), "send " + i);
}
chk("all with the editor", (await count("status='with_editor' and editor_id=$1", [U.ed])) === 30);

// ── 4. Editor ──
// Finished → "Is the finished video in Google Drive?" → yes → sent.
async function finishOne(ed, t) {
  await click(btn(edCard(ed, t), "Finished"), "finish " + t);
  pickFile(ed);
  await click($(ed, "#efYes"), "it's in drive " + t);
  await click($(ed, "#efDone"), "sent " + t);
}
// The review window (no Drive key in tests, so Drive's player and a typed
// time): a note, then a bottom button.
async function leaveNote(p, text, at) {
  if (!at) await click($(p, "#videoModalBox .rv-when-all"), "whole video");
  else await click($(p, "#videoModalBox .rv-when-at"), "at a time");
  $(p, "#videoModalBox .rv-compose textarea").value = text;
  $(p, "#videoModalBox .rv-time-in").value = at || "";
  await click($(p, "#videoModalBox .rv-add"), "add note " + text);
}
const reviewBtn = (p, label) => $$(p, "#videoModalBox .rv-actions button").find(b => b.textContent.startsWith(label));
async function editorFinish(list) {
  const ed = track(await ED());
  for (const i of list) await finishOne(ed, title(i));
  return ed;
}
let ed = track(await ED());
const e0 = edCard(ed, title(0));
chk("editor card: edit-by, instructions, brand guidelines, raw footage, finished folder",
  e0.textContent.includes(ed.w.niceDate(plus(TODAY, 7))) && e0.textContent.includes("Cut it like this: 1") && !!e0.querySelector('a[href="https://docs/fl-brand"]')
  && !!e0.querySelector('a[href="https://drive/fl-footage"]') && !!e0.querySelector('a[href="https://drive/fl-final"]'));
// Backing out: "Not yet" leaves it with the editor.
await click(btn(e0, "Finished"), "finish (not yet)");
chk("editor asked to confirm it's in Google Drive (no key to check it here), with the folder link", $(ed, "#videoModalBox").textContent.includes("Make sure the finished video is uploaded")
  && !!$(ed, '#videoModalBox a[href="https://drive/fl-final"]') && !ed.ui.confirms.length);
await click($(ed, "#efNo"), "not yet");
chk("not yet: still with the editor", (await statusOf(title(0))).status === "with_editor");
await editorFinish(idx);
chk("all back to Tait", (await count("status='in_review'")) === 30);

// ── 5. Tait: revisions, or approve + captions ──
async function approveWithCaption(p, i) {
  await click(btn(opRow(p, "#deskVideos", title(i)), "Approve & add captions"), "approve edit " + i);
  $(p, '#videoModalBox [data-f="onScreenCaption"]').value = "On screen " + (i + 1);
  $(p, '#videoModalBox [data-f="caption"]').value = "Caption " + (i + 1);
  await click($(p, "#aeSave"), "save caption " + i);
}
op = track(await OP());
for (const i of idx) {
  if (V.opRev.includes(i)) {
    await click(btn(opRow(op, "#deskVideos", title(i)), "Review & comment"), "review " + i);
    await leaveNote(op, "Tighten the intro " + i, "0:12");
    await click(reviewBtn(op, "Send 1 change to the editor"), "send revisions " + i);
  } else await approveWithCaption(op, i);
}
if (V.opRev.length) {
  ed = track(await ED());
  for (const i of V.opRev) chk(`editor sees revisions #${i}, with the time`, new RegExp("0:12\\s+Tighten the intro " + i).test(edCard(ed, title(i))?.querySelector(".ed-revisions")?.textContent || ""));
  for (const i of V.opRev) chk(`operator note saved, then closed when sent #${i}`, (await count("v.title=$1 and c.author_role='operator' and c.at_seconds=12 and c.closed_at is not null", [title(i)], "social_video_comments c join social_videos v on v.id=c.video_id")) === 1);
  await editorFinish(V.opRev);
  op = track(await OP());
  for (const i of V.opRev) await approveWithCaption(op, i);
}
chk("all 30 with the client, both captions", (await count("status='client_review' and caption like 'Caption %' and on_screen_caption like 'On screen %'")) === 30);

// ── 6. Client final approval ──
cl = track(await CL());
chk("To review (30): the finished videos, and it opens there", tabCount(cl, "review") === 30 && $(cl, "#videoTabs .chip.active").dataset.tab === "review", tabsText(cl));
const fr = portalCard(cl, "#listReview", title(0));
chk("final card: Review the video + both captions, read-only", fr && !fr.querySelector('a[href="https://drive/fl-final"]')
  && fr.textContent.includes("Caption 1") && fr.textContent.includes("On screen 1") && !fr.querySelector("[data-cap]")
  && Array.from(fr.querySelectorAll(".actions button")).map(b => b.textContent).join("|") === "Review the video|Approve for posting");
chk("To review is showing", $(cl, '[data-panel="review"]').style.display !== "none");
for (const i of idx) {
  const card = portalCard(cl, "#listReview", title(i));
  if (V.clientRev.includes(i)) {
    await click(btn(card, "Review the video"), "review " + i);
    chk(`review window: plays the editor's review copy (018), typed times until it loads, no notes yet, Send waits for one #${i}`,
      ($(cl, "#videoModalBox video.rv-video")?.getAttribute("src") || "").startsWith("https://signed/") && $(cl, "#videoModalBox").classList.contains("rv-typed-mode")
      && $(cl, "#videoModalBox .rv-list").textContent.includes("No comments yet") && reviewBtn(cl, "Send changes").disabled);
    $(cl, "#videoModalBox .rv-compose textarea").value = "Bad time"; $(cl, "#videoModalBox .rv-time-in").value = "abc";
    await click($(cl, "#videoModalBox .rv-add"), "bad time " + i);
    chk(`a bad time is caught #${i}`, $(cl, "#videoModalBox .rv-err").textContent.includes("0:12") && !$$(cl, "#videoModalBox .rv-note").length);
    await leaveNote(cl, "Use the other take " + i, "1:05");
    await leaveNote(cl, "Louder music " + i);
    chk(`two notes listed #${i}`, $$(cl, "#videoModalBox .rv-note").length === 2 && !reviewBtn(cl, "Send 2 changes").disabled);
    await click($(cl, "#videoModalBox [data-del]"), "delete a note " + i); // the first one: "Use the other take" (1:05; whole-video notes go last)
    chk(`deleted one #${i}`, $$(cl, "#videoModalBox .rv-note").length === 1);
    await click(reviewBtn(cl, "Send 1 change to the editor"), "send changes " + i);
    // Two rounds of changes (017): the pop-up, then Send it back to the editor.
    await click(Array.from($$(cl, "#videoModalBox .rv-confirm button")).find(b => /Send it back to the editor/.test(b.textContent)), "send it back " + i);
    await dismissThanks(cl, "make those changes");
    continue;
  }
  await click(btn(card, "Approve for posting"), "approve for posting " + i);
  await dismissThanks(cl, "Approved for posting");
}
if (V.clientRev.length) {
  ed = track(await ED());
  for (const i of V.clientRev) chk(`editor sees the client's change, with the time, and can watch with the notes #${i}`,
    /Whole video\s+Louder music/.test(edCard(ed, title(i))?.querySelector(".ed-revisions")?.textContent || "") && !edCard(ed, title(i)).textContent.includes("other take") && !!btn(edCard(ed, title(i)), "Watch with the comments"));
  await editorFinish(V.clientRev);
  op = track(await OP());
  for (const i of V.clientRev) { await click(btn(opRow(op, "#deskVideos", title(i)), "Approve & add captions"), "again " + i); await click($(op, "#aeSave"), "resend " + i); }
  cl = track(await CL());
  for (const i of V.clientRev) { await click(btn(portalCard(cl, "#listReview", title(i)), "Approve for posting"), "final again " + i); await dismissThanks(cl, "Approved"); }
}
chk("all 30 ready to post", (await count("status='ready_to_post'")) === 30);

// ── 7. Posting ──
op = track(await OP());
chk("no separate Ready to Post page", !$(op, "#view-post") && !$$(op, ".nav-item").some(n => n.textContent.includes("Ready to Post")));
const p0 = $$(op, "#deskPost > .card")[0];
chk("My desk → Videos to post: date, both captions, finished video", p0 && /Post \d{4}-\d{2}-\d{2}/.test(p0.textContent) && p0.textContent.includes("Caption") && p0.textContent.includes("On-screen caption") && !!p0.querySelector('a[href="https://drive/fl-final"]'));
for (let n = 0; n < V.post; n++) await click(btn($$(op, "#deskPost > .card")[0], "Mark posted"), "post " + n);
chk(`${V.post} posted`, (await count("status='posted'")) === V.post);

// ── 8. Premium client: we film, they approve ideas ──
op = track(await OP());
op.w.openBulkAdd(PREM); await settle();
$(op, "#bkText").value = JSON.stringify([1, 2, 3].map(n => ({ title: "Prem " + n, hook: "Prem hook " + n, body: "Prem script " + n, outline: "- Prem point " + n, filmingDirection: "We film it " + n, postDate: day(n) })));
$(op, "#bkText").dispatchEvent(new op.w.Event("input"));
await click($(op, "#bkSave"), "save premium ideas");
chk("premium ideas default to we film", (await count("client_id=$1 and filmed_by='us' and status='concept_pending'", [PREM])) === 3);
let prem = track(await PREMP());
chk("premium: To film (0), To review (3), opens on To review, no footage folder link", tabCount(prem, "film") === 0 && tabCount(prem, "review") === 3 && $(prem, "#videoTabs .chip.active").dataset.tab === "review" && !$(prem, "#footageCardLink"), tabsText(prem));
const pc = portalCard(prem, "#listReview", "Prem 1");
chk("premium idea card: hook, script, outline, how we'll make it — no upload", pc && ["Prem hook 1", "Prem script 1", "- Prem point 1", "How we'll make itWe film it 1"].every(t => pc.textContent.includes(t)) && !pc.textContent.includes("How to film it") && !pc.querySelector("a[href*='footage']"), pc && pc.textContent);
await click(btn(pc, "Approve"), "premium approve 1"); await dismissThanks(prem, "film it with you");
await click(btn(portalCard(prem, "#listReview", "Prem 2"), "Approve"), "premium approve 2"); await dismissThanks(prem, "approve before it posts");
await sendNote(prem, portalCard(prem, "#listReview", "Prem 3"), "Request changes", "Different angle");
await dismissThanks(prem, "rework");
chk("premium: approved and sent-back ideas all leave To Do; nothing on the page", !portalCard(prem, "#listReview", "Prem 1") && !portalCard(prem, "#listReview", "Prem 2") && !portalCard(prem, "#listReview", "Prem 3") && !$$(prem, "#view-videos .card").length, tabsText(prem));
chk("premium: 2 approved, 1 back with Tait", (await count("client_id=$1 and status='to_film'", [PREM])) === 2 && (await statusOf("Prem 3")).concept_approved_at === null);
op = track(await OP());
for (const t of ["Prem 1", "Prem 2"]) {
  const r = cpRow(op, t);
  chk(`${t}: Tait films → raw footage link + send to editor`, !!r?.querySelector('a[href="https://drive/prem-footage"]'));
  r.querySelector("select").value = U.ed; await click(btn(r, "Send to editor"), "send " + t);
}
ed = track(await ED());
for (const t of ["Prem 1", "Prem 2"]) await finishOne(ed, t);
op = track(await OP());
for (const t of ["Prem 1", "Prem 2"]) { await click(btn(opRow(op, "#deskVideos", t), "Approve & add captions"), "approve " + t); $(op, '#videoModalBox [data-f="caption"]').value = t + " caption"; await click($(op, "#aeSave"), "cap " + t); }
prem = track(await PREMP());
for (const t of ["Prem 1", "Prem 2"]) { await click(btn(portalCard(prem, "#listReview", t), "Approve for posting"), "prem final " + t); await dismissThanks(prem, "Approved"); }
chk("premium videos ready to post", (await count("client_id=$1 and status='ready_to_post'", [PREM])) === 2);

// ── 9. New client with contact details; invite ──
op = track(await OP({ fetch: async (u, o) => ({ ok: true, status: 200, json: async () => ({ sent: true, email: JSON.parse(o.body).clientId ? "pat@gradgig.test" : "" }) }) }));
await click($(op, "#newClientBtn"), "new client");
$(op, "#cpName").value = "Grad Gig Test"; $(op, "#cpName").dispatchEvent(new op.w.Event("input"));
$(op, "#cpContactName").value = "Pat Client"; $(op, "#cpContactPhone").value = "555-0100"; $(op, "#cpContactEmail").value = "Pat@GradGig.test";
await click($(op, "#cpSave"), "create client");
const nc = (await db.query("select id, slug, contact_name, contact_phone, contact_email, client_system from social_clients where name='Grad Gig Test'")).rows[0];
chk("new client saved with contact details", nc && nc.slug === "grad-gig-test" && nc.contact_name === "Pat Client" && nc.contact_phone === "555-0100" && nc.contact_email === "pat@gradgig.test" && nc.client_system === "self-serve", nc);
const ncRow = $$(op, "#allClientsList .row").find(r => r.textContent.includes("Grad Gig Test"));
chk("client list shows them, not invited yet", ncRow && ncRow.textContent.includes("Not invited yet"));
// Invites now go through Claude (bridge.py invite → /api/invite); same call.
await op.w.sendInvite(nc.id); await settle();
const inv0 = op.ui.log.find(l => l.fetch === "/api/invite");
chk("Invite asks the invite service to email this client", inv0 && JSON.parse(inv0.body).clientId === nc.id, inv0);
chk("…and says it's on its way", modal(op).textContent.includes("Invite sent") && modal(op).textContent.includes("pat@gradgig.test"));
op.w.closeVideoModal();
// The invited contact signs in for the first time (confirmed email) and is linked to their portal.
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${U.invited}', 'pat@gradgig.test', now())`);
const inv = track(await openPage("clients/portal.html", U.invited, BASE + "/clients/grad-gig-test"));
chk("invited contact lands in their portal", !$(inv, "#appShell").classList.contains("hidden") && $(inv, "#brandName").textContent === "Grad Gig Test");
chk("…and is now linked as that client's login", (await db.query("select client_id from social_client_users where id=$1", [U.invited])).rows[0]?.client_id === nc.id);

// ── 10. Audit trail for one ordinary client-filmed video ──
const plainI = clientFilmed.find(i => ![...V.change, ...V.opRev, ...V.clientRev].includes(i) && !(V.early && i === 0));
const trail = (await db.query("select a.action, a.changed_by_role r from social_status_audit_log a join social_videos v on v.id=a.video_id where v.title=$1 order by a.id", [title(plainI)])).rows.map(x => x.action + ":" + x.r).join(" > ");
const want = "created:operator > submit_footage:client > direct_update:operator > mark_delivered:editor > direct_update:operator > approve_final:client" + (plainI < V.post ? " > direct_update:operator" : "");
chk("audit trail records every step", trail === want, trail);

// ── 11. Nothing broke along the way ──
const errs = allPages.flatMap(p => p.ui.errors);
chk("no page errors", errs.length === 0, errs);
const failed = allPages.flatMap(p => p.ui.log.filter(l => l.error));
chk("no failed database calls", failed.length === 0, failed);
const unexpectedAlerts = allPages.flatMap(p => p.ui.alerts).filter(a => !a.startsWith("Added "));
chk("no unexpected error popups", unexpectedAlerts.length === 0, unexpectedAlerts);
chk("clients never saw a browser prompt", allPages.filter(p => p.w.location.pathname.startsWith("/clients/")).every(p => !p.ui.promptsShown.length));

console.log(`Run ${RUN}: ${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
