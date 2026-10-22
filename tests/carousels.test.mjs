// Carousels (migrations 022, 035): the operator writes and assigns them on
// the client's Carousels tab (operator dashboard); the editor builds them,
// uploads the slides and sends them for review; Tait reviews on My desk and
// approves (to the client) or sends them back; the client reviews slide by
// slide in To review (Tait, 2026-10-22: "treat it the same way as the video
// cards"). Clients never see the copy work before that.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const ED = "00000000-0000-0000-0000-00000000000e", ED2 = "00000000-0000-0000-0000-00000000000f";
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
const C1 = "c0000000-0000-0000-0000-000000000001", C2 = "c0000000-0000-0000-0000-000000000002";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}'),('${ED}'),('${ED2}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fully-launched','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${FL}','fl@x');
  insert into social_editors (id,name,email) values ('${ED}','Aria','aria@x'),('${ED2}','Linda','linda@x');
  update social_editors set setup_at = now();
  insert into social_carousel_guides (client_id, body_md) values ('${FL}', '# Carousel guide\n\n## Examples\n\n![The hook](/assets/carousel-examples/founder-1-hook.jpg)\n![A story slide](/assets/carousel-examples/founder-2-story.jpg)\n\n[instagram](https://www.instagram.com/p/DdR361EjDyJ/)\n[instagram](https://www.instagram.com/p/bad\"onload=x/)\n\n- [A real post](https://www.instagram.com/p/DdR361EjDyJ/)\n- [not a link](javascript:alert(1))\n\n## Brand\n\nNavy \`#04101F\` and gold.');
  insert into social_carousels (id, client_id, position, title, format, category, slides, caption, sources) values
    ('${C1}','${FL}',1,'Gymshark started in a garage','Founder story','E-commerce',
     '[{"text":"He was delivering pizzas\\n\\nHis brand is worth *£1 billion*","photo":"Ben Francis, Wikimedia Commons"},{"text":"Who is your shop for?","photo":"Solid navy"}]',
     'Caption here', '[{"label":"Wikipedia","url":"https://en.wikipedia.org/wiki/Gymshark"}]'),
    ('${C2}','${FL}',2,'Zappos sold shoes it didn''t have','Founder story','E-commerce','[{"text":"Slide one","photo":""}]','','[]');
`);

// What a login can read, straight from the database.
const readAs = async (uid, sql) => {
  await db.exec("begin");
  await db.query(`select set_config('role', 'authenticated', true)`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; }
  finally { await db.exec("rollback"); }
};
const count = async (uid, table) => (await readAs(uid, `select count(*)::int n from ${table}`)).rows[0].n;

chk("an editor reads no carousel that isn't theirs", (await count(ED, "social_carousels")) === 0 && (await count(ED, "social_carousel_guides")) === 0);
chk("a client's login reads no carousels or guide", (await count(CL, "social_carousels")) === 0 && (await count(CL, "social_carousel_guides")) === 0);

// ── The operator: the client's Carousels tab on the dashboard ─────────
const opCarousels = async () => { const o = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html"); o.w.openClientPage(FL, "carousels"); await settle(); return o; };
let op = await opCarousels();
chk("operator: a Carousels tab on the client's page", op.d.querySelector('#cpTabs [data-cptab="carousels"]').classList.contains("active") && op.d.querySelectorAll("#cpBody [data-car]").length === 2);
op.d.querySelector('[data-car-guide="read"]').click(); await settle();
chk("the guide opens, Markdown rendered", op.d.getElementById("videoModalBox").textContent.includes("Navy") && !!op.d.querySelector("#videoModalBox code"));
const gImgs = Array.from(op.d.querySelectorAll("#videoModalBox .md-gallery img")).map(i => i.getAttribute("src"));
chk("…with the example slides side by side, captioned", gImgs.join() === "/assets/carousel-examples/founder-1-hook.jpg,/assets/carousel-examples/founder-2-story.jpg"
  && op.d.querySelectorAll("#videoModalBox .md-gallery:not(.md-embeds)").length === 1 && op.d.querySelector("#videoModalBox figcaption").textContent === "The hook", gImgs);
const igs = Array.from(op.d.querySelectorAll("#videoModalBox iframe.md-ig")).map(f => f.getAttribute("src"));
chk("…Instagram posts embedded with Instagram's own player; nothing else becomes a frame", igs.join() === "https://www.instagram.com/p/DdR361EjDyJ/embed/", igs);
const gLinks = Array.from(op.d.querySelectorAll("#videoModalBox .doc-body a")).map(a => a.getAttribute("href"));
chk("…and links to the real posts; only https links work", gLinks.includes("https://www.instagram.com/p/DdR361EjDyJ/") && !gLinks.some(h => /^javascript/.test(h)), gLinks);
op.w.closeVideoModal();

op.d.querySelector(`#cpBody [data-car="${C1}"]`).click(); await settle();
let box = op.d.getElementById("videoModalBox");
chk("the preview shows every slide, the accent in gold italic, with Copy buttons", box.querySelectorAll(".car-slide").length === 2 && box.querySelector(".gold-i").textContent === "£1 billion" && box.querySelectorAll("[data-copy]").length === 2);
chk("Copy copies the words without the accent stars", box.querySelector("[data-copy]").dataset.copy.includes("£1 billion") && !box.querySelector("[data-copy]").dataset.copy.includes("*"));
chk("sources are listed", box.textContent.includes("Wikipedia"));
box.querySelector('[data-slide="1"][data-k="text"]').value = "Who exactly is your shop for?";
box.querySelector('[data-slide="1"][data-k="text"]').dispatchEvent(new op.w.Event("input"));
box.querySelector("#carSend").click(); await settle();
chk("Send to the editor needs an editor", op.ui.alerts.some(a => /Pick an editor/.test(a)) && (await db.query(`select status from social_carousels where id='${C1}'`)).rows[0].status === "idea");
box.querySelector("#carEditor").value = ED;
box.querySelector('[data-part="y"]').value = "2026"; box.querySelector('[data-part="m"]').value = "10"; box.querySelector('[data-part="d"]').value = "26";
box.querySelector('[data-part="d"]').dispatchEvent(new op.w.Event("change"));
box.querySelector("#carSend").click(); await settle();
let row = (await db.query(`select status, editor_id, slides, due_to_edit::text due from social_carousels where id='${C1}'`)).rows[0];
chk("saved: the edited copy, Aria assigned, with the editor, edit by Oct 26", row.status === "with_editor" && row.editor_id === ED && row.slides[1].text === "Who exactly is your shop for?" && row.due === "2026-10-26", row);

chk("now Aria reads that carousel and the guide; Linda reads nothing", (await count(ED, "social_carousels")) === 1 && (await count(ED, "social_carousel_guides")) === 1 && (await count(ED2, "social_carousels")) === 0);
chk("an editor can't change a carousel directly", (await readAs(ED, `update social_carousels set status='approved' where id='${C1}' returning id`)).rows?.length === 0 || !!(await readAs(ED, `update social_carousels set status='approved' where id='${C1}' returning id`)).error);
chk("an upload has to be in the carousel's own folder", !!(await readAs(ED, `insert into social_carousel_uploads (carousel_id, storage_path) values ('${C1}', 'elsewhere/x.png')`)).error);
chk("Linda can't add slides to Aria's carousel", !!(await readAs(ED2, `insert into social_carousel_uploads (carousel_id, storage_path) values ('${C1}', '${FL}/${C1}/x.png')`)).error);
chk("sending it for review needs slides first", /Upload the slides first/.test((await readAs(ED, `select * from social_editor_submit_carousel('${C1}')`)).error || ""));

// ── Aria's Carousels page ──────────────────────────────────────────────
let ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
const card = () => ed.d.querySelector(`#carCards [data-carcard="${C1}"]`);
chk("editor: a Carousels page with only her carousel", !!ed.d.querySelector('.nav-item[data-view="carousels"]') && ed.d.querySelectorAll("#carCards [data-carcard]").length === 1 && !!card());
chk("…the slides' words and photo notes, with Copy buttons and the client's name", card().querySelectorAll(".car-slide").length === 2 && card().textContent.includes("Wikimedia Commons") && card().textContent.includes("Fully Launched") && card().querySelectorAll("[data-copy]").length === 2);
chk("…Send for review is off until there are slides", card().querySelector("[data-submit]").disabled);
const todoTab = () => ed.d.querySelector('#edTabs [data-edtab="carousels"]');
chk("To Do has a Carousels to edit tab with her count, and opens on it when there are no videos", todoTab() && todoTab().textContent.replace(/\s+/g, " ").trim() === "Carousels to edit 1" && todoTab().classList.contains("active")
  && ed.d.querySelectorAll(`#queueList [data-carcard="${C1}"]`).length === 1, todoTab() && todoTab().textContent);
chk("…and her calendar shows it on Oct 26", Array.from(ed.d.querySelectorAll("#calGrid .cal-block")).some(b => /Carousel due/.test(b.textContent) && b.textContent.includes("Gymshark")), ed.d.getElementById("calGrid").textContent.slice(0, 200));
chk("…the card shows the edit-by date", /Oct 26/.test(card().querySelector(".edit-by").textContent) && /Oct 26/.test(ed.d.querySelector(`#queueList [data-carcard="${C1}"] .edit-by`).textContent));
chk("…its cards work like the Carousels page (copy, upload, send)", !!ed.d.querySelector(`#queueList [data-carcard="${C1}"] [data-upload]`) && ed.d.querySelectorAll(`#queueList [data-carcard="${C1}"] [data-copy]`).length === 2);
card().querySelector("[data-guide]").click(); await settle();
chk("…the guide opens from the card", ed.d.getElementById("videoModalBox").textContent.includes("Navy"));
ed.w.closeVideoModal();

// Upload two slides, picked out of order: they're saved in file-name order.
const inp = card().querySelector("[data-upload]");
Object.defineProperty(inp, "files", { value: [new ed.w.File(["b"], "02.png", { type: "image/png" }), new ed.w.File(["a"], "01.png", { type: "image/png" })], configurable: true });
inp.dispatchEvent(new ed.w.Event("change")); await settle();
let ups = (await db.query(`select file_name, position, storage_path from social_carousel_uploads where carousel_id='${C1}' order by position`)).rows;
chk("uploads go to the carousels bucket, in the carousel's folder, in file-name order", ups.map(u => u.file_name).join() === "01.png,02.png" && ups.every(u => u.storage_path.startsWith(`${FL}/${C1}/`))
  && ed.ui.log.filter(l => l.upload && l.upload.bucket === "carousels").length === 2, ups);
chk("…and show as thumbnails, removable", card().querySelectorAll(".car-thumb").length === 2 && card().querySelectorAll("[data-remove]").length === 2);
card().querySelectorAll("[data-remove]")[1].click(); await settle();
chk("× removes a slide (row and file)", (await db.query(`select count(*)::int n from social_carousel_uploads where carousel_id='${C1}'`)).rows[0].n === 1 && ed.ui.log.some(l => l.remove && l.remove.bucket === "carousels"));
card().querySelector("[data-submit]").click(); await settle();
row = (await db.query(`select status, submitted_at from social_carousels where id='${C1}'`)).rows[0];
chk("Send to Tait for review: to review", row.status === "to_review" && !!row.submitted_at, row);
chk("…and it leaves To Do's Carousels to edit (count 0)", todoTab().textContent.replace(/\s+/g, " ").trim() === "Carousels to edit 0" && !ed.d.querySelector("#queueList [data-carcard]"), todoTab().textContent);
chk("…then the editor can't upload more", !card().querySelector("[data-upload]") && !!(await readAs(ED, `insert into social_carousel_uploads (carousel_id, storage_path) values ('${C1}', '${FL}/${C1}/late.png')`)).error);

// ── Tait reviews: send it back, then approve ──────────────────────────
op = await opCarousels();
chk("operator: To review has a count", /To review\s*1/.test(op.d.getElementById("cpBody").textContent.replace(/\s+/g, " ")));
chk("…and it's on My desk: Carousels to review", op.d.getElementById("deskCarousels").textContent.includes("Gymshark started in a garage") && [...op.d.querySelectorAll("#deskTiles .desk-tile")].some(t => t.textContent === "1Carousels to review"));
op.d.querySelector(`#cpBody [data-car="${C1}"]`).click(); await settle();
box = op.d.getElementById("videoModalBox");
chk("the review shows the uploaded slides", box.querySelectorAll(".car-thumb img").length === 1 && box.querySelector(".car-thumb img").src.startsWith("https://signed/"));
box.querySelector("#carBack").click(); await settle();
chk("Send back needs a note", op.ui.alerts.some(a => /what to change/.test(a)));
box.querySelector("#carNote").value = "Make slide 1 darker.";
box.querySelector("#carBack").click(); await settle();
row = (await db.query(`select status, review_note from social_carousels where id='${C1}'`)).rows[0];
chk("sent back with the note", row.status === "changes" && row.review_note === "Make slide 1 darker.", row);

ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
chk("the editor sees the note at the top and can upload again", card().querySelector(".car-note").textContent.includes("Make slide 1 darker.") && !!card().querySelector("[data-upload]"));
card().querySelector("[data-submit]").click(); await settle();
chk("…and send it again", (await db.query(`select status from social_carousels where id='${C1}'`)).rows[0].status === "to_review");

op = await opCarousels();
op.d.querySelector("#deskCarousels button").click(); await settle();
op.d.getElementById("carApprove").click(); await settle();
chk("Approve needs the post date", op.ui.alerts.some(a => /day it posts/.test(a)) && (await db.query(`select status from social_carousels where id='${C1}'`)).rows[0].status === "to_review");
const POST = (() => { const t = new Date(); t.setDate(t.getDate() + 3); return t.toISOString().slice(0, 10); })();
op.d.querySelector("#videoModalBox [data-f=post_date]").setDate(POST); await settle();
op.d.getElementById("carApprove").click(); await settle();
row = (await db.query(`select status, approved_at, review_note, post_date::text pd from social_carousels where id='${C1}'`)).rows[0];
chk("Approve sends it to the client, with its post date", row.status === "client_review" && !!row.approved_at && row.review_note === null && row.pd === POST, row);
chk("a client's login now reads that one carousel and its slides, nothing else", (await count(CL, "social_carousels")) === 1 && (await count(CL, "social_carousel_uploads")) === 1 && (await count(CL, "social_carousel_guides")) === 0);

// ── The client reviews it slide by slide ───────────────────────────────
let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
chk("the client: no Carousels page", !cl.d.querySelector('.nav-item[data-view="carousels"]') && !cl.d.getElementById("view-carousels"));
const crd = () => [...cl.d.querySelectorAll("#listReview .card")].find(c => c.textContent.includes("Gymshark"));
chk("it's in To review like a video card, with its slides and post date", !!crd() && crd().textContent.includes("Carousel · 1 slide") && crd().querySelectorAll(".car-strip img").length === 1 && /To review\s*1/.test(cl.d.getElementById("videoTabs").textContent.replace(/\s+/g, " ")));
chk("…and on the calendar on its post date, red (it needs them this week)", [...cl.d.querySelectorAll("#calGrid .cal-item")].some(b => b.textContent.includes("Gymshark") && b.classList.contains("cal-urgent")));
crd().querySelector("[data-review]").click(); await settle();
box = cl.d.getElementById("videoModalBox");
chk("the review: each slide big with a note box", box.querySelectorAll(".car-review-slide img").length === 1 && box.querySelectorAll('[data-slide-note="1"]').length === 1);
box.querySelector("[data-changes]").click(); await settle();
chk("Send the changes needs a note", /at least one slide/.test(box.querySelector("#carErr").textContent));
box.querySelector('[data-slide-note="1"]').value = "Use a brighter photo.";
box.querySelector("[data-changes]").click(); await settle();
row = (await db.query(`select status, client_notes from social_carousels where id='${C1}'`)).rows[0];
chk("changes go back to the editor with the note on slide 1", row.status === "changes" && row.client_notes[0].slide === 1 && row.client_notes[0].note === "Use a brighter photo.", row);
ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
chk("the editor sees the client's slide notes", card().querySelector(".car-note").textContent.includes("Slide 1: Use a brighter photo."));
card().querySelector("[data-submit]").click(); await settle();
op = await opCarousels();
op.d.querySelector("#deskCarousels button").click(); await settle();
chk("Tait sees what the client asked for", op.d.getElementById("videoModalBox").textContent.includes("Use a brighter photo."));
op.d.getElementById("carApprove").click(); await settle();
cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
crd().querySelector("[data-review]").click(); await settle();
cl.d.querySelector("#videoModalBox [data-approve]").click(); await settle();
row = (await db.query(`select status, client_approved_at from social_carousels where id='${C1}'`)).rows[0];
chk("the client approves it", row.status === "approved" && !!row.client_approved_at, row);
chk("…and it leaves To review", !crd());
chk("a client can't review a carousel that isn't waiting for them", /isn't waiting/.test((await readAs(CL, `select social_client_review_carousel('${C1}', true, '[]')`)).error || ""));
op = await opCarousels();
op.d.querySelector(`#cpBody [data-car="${C1}"]`).click(); await settle();
op.d.getElementById("carPosted").click(); await settle();
chk("then Mark posted", (await db.query(`select status from social_carousels where id='${C1}'`)).rows[0].status === "posted");

// The guide can be edited.
op.d.querySelector('[data-car-guide="edit"]').click(); await settle();
op.d.getElementById("cgBody").value = "# Carousel guide\n\nNew rules.";
op.d.getElementById("cgSave").click(); await settle();
chk("operator edits the guide", (await db.query(`select body_md from social_carousel_guides where client_id='${FL}'`)).rows[0].body_md.includes("New rules."));


// ── Time sensitive: due in the next 7 days (or late), soonest first ──
const iso = d => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
await db.exec(`insert into social_carousels (client_id, position, title, status, editor_id, due_to_edit, slides) values
  ('${FL}', 10, 'Due in 20 days', 'with_editor', '${ED2}', '${iso(20)}', '[]'),
  ('${FL}', 11, 'Due in 2 days', 'with_editor', '${ED2}', '${iso(2)}', '[]'),
  ('${FL}', 12, 'Overdue', 'changes', '${ED2}', '${iso(-1)}', '[]')`);
const ld = await openPage("editor/dashboard.html", ED2, "https://fl.test/editor/dashboard.html");
const ldTab = k => ld.d.querySelector(`#edTabs [data-edtab="${k}"]`);
const titlesIn = () => Array.from(ld.d.querySelectorAll("#queueList [data-carcard] .left b")).map(b => b.textContent);
chk("Time sensitive comes first, gold, with what's due this week or late, and To Do opens on it", ld.d.querySelector("#edTabs [data-edtab]").dataset.edtab === "time"
  && ldTab("time").textContent.replace(/\s+/g, " ").trim() === "Time sensitive 2" && ldTab("time").classList.contains("urgent") && ldTab("time").classList.contains("active"), ldTab("time") && ldTab("time").textContent);
chk("…soonest first, the late one on top marked overdue", titlesIn().join("|") === "Overdue|Due in 2 days" && /Overdue/.test(ld.d.querySelector("#queueList .edit-by").textContent), titlesIn());
ldTab("carousels").click(); await settle();
chk("Carousels to edit: all of them, soonest due first", titlesIn().join("|") === "Overdue|Due in 2 days|Due in 20 days", titlesIn());

chk("no page errors", !op.ui.errors.length && !ed.ui.errors.length && !cl.ui.errors.length, [op.ui.errors, ed.ui.errors, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
