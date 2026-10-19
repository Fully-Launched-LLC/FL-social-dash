// Content Ideas: ideas the client hasn't seen yet, and the ones sent. Move
// ideas back, drag them across to send them, add new ones straight into it, and what To Do, the
// calendar and the client's portal show for each.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fully-launched','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${FL}','fl@x');
  insert into social_videos (client_id,title,hook,status,filmed_by,concept_approved_at,post_date,due_to_edit,due_to_film,platform,editor_brief) values
    ('${FL}','AI Systems · A1 · The 8 PM invoice problem','It is 8 PM.','concept_pending','client',now(),'2026-10-19','2026-10-12','2026-10-05','{instagram}','{"instructions":"Tight cuts"}'),
    ('${FL}','Websites · W1 · Embarrassed by your website?','Be honest.','concept_pending','client',now(),'2026-10-21','2026-10-14','2026-10-07','{instagram}','{"format":"Talking head · pain opener"}'),
    ('${FL}','Websites · W2 · Stay with the client','Hi.','concept_pending','client',now(),'2026-10-22','2026-10-15','2026-10-08','{instagram}','{}'),
    ('${FL}','We film this one','Hey.','to_film','us',now(),'2026-10-23','2026-10-16','2026-10-09','{linkedin}','{}'),
    ('${FL}','Sent back idea','Hm.','concept_pending','client',null,'2026-10-24','2026-10-17','2026-10-10','{linkedin}','{}');
`);
const row = async t => (await db.query("select status, concept_approved_at, due_to_film, post_date, editor_brief from social_videos where title=$1", [t])).rows[0];
const idOf = async t => (await db.query("select id from social_videos where title=$1", [t])).rows[0].id;
const A1 = "AI Systems · A1 · The 8 PM invoice problem", W1 = "Websites · W1 · Embarrassed by your website?", W2 = "Websites · W2 · Stay with the client";

let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const calTitles = () => Object.values(op.w.eval("calendarByDay(workVideos(), calState)")).flat().map(e => e.x.video.title);
const todoText = () => op.d.getElementById("view-todo").textContent;
const bankIds = () => Array.from(op.d.querySelectorAll("#bankList [data-card-id]")).map(el => el.dataset.cardId);
const sentIds = () => Array.from(op.d.querySelectorAll("#sentList [data-card-id]")).map(el => el.dataset.cardId);
const modalBtn = label => Array.from(op.d.querySelectorAll("#videoModalBox button")).find(b => b.textContent.trim() === label);

chk("sidebar has a Content Ideas tab", op.d.querySelector('.nav-item[data-view="ideabank"]')?.textContent.startsWith("Content Ideas"));
chk("bank starts empty", !bankIds().length && op.d.getElementById("navBankN").hidden);

// Move one from its card, three more at once.
op.w.openOperatorVideoModal(await idOf(A1)); await settle();
chk("an idea's card has Move back to Ideas", !!modalBtn("Move back to Ideas"));
modalBtn("Move back to Ideas").click(); await settle();
let r = await row(A1);
chk("moved: hidden from the client, dates cleared and kept", r.status === "concept_pending" && !r.concept_approved_at && !r.due_to_film && !r.post_date
  && r.editor_brief.ideaBank.from === "concept_pending" && r.editor_brief.ideaBank.postDate === "2026-10-19" && r.editor_brief.instructions === "Tight cuts", r);
await op.w.moveToIdeaBank([await idOf(W1), await idOf(W2), await idOf("We film this one")]); await settle();
chk("we-film idea remembers it was To film", (await row("We film this one")).editor_brief.ideaBank.from === "to_film");
chk("bank lists all four, nav count 4", bankIds().length === 4 && op.d.getElementById("navBankN").textContent === "4");
chk("category filter tabs", op.d.querySelectorAll("#bankTabs .chip").length >= 3);
chk("banked ideas are off To Do and the calendar", ![A1, W1, "We film this one"].some(t => todoText().includes(t) || calTitles().includes(t)), calTitles());
chk("sent-back idea stays in Sent back, not the bank", op.d.querySelector('[data-stage="sentBack"]').textContent.includes("Sent back idea")
  && !op.d.getElementById("bankList").textContent.includes("Sent back idea"));

let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
let clTitles = cl.w.eval("VIDEOS").map(v => v.title);
chk("client can't see banked ideas (RLS)", clTitles.length === 0, clTitles);

// Category filter.
op.d.querySelector('#bankTabs [data-bank-cat="Websites"]').click(); await settle();
chk("category filter shows just that category", bankIds().length === 2);
op.d.querySelector('#bankTabs [data-bank-cat=""]').click(); await settle();

// Drag W1 onto Sent to client (a real drag: dragstart on the card, drop on the column).
const drag = async (id, col) => {
  const data = {}, dt = { setData: (k, v) => { data[k] = v; }, getData: k => data[k], effectAllowed: "" };
  const ev = (type, target) => { const e = new op.w.Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; target.dispatchEvent(e); };
  ev("dragstart", op.d.querySelector(`[data-card-id="${id}"]`));
  ev("drop", op.d.querySelector(`.board-col[data-col="${col}"]`));
  await settle();
};
chk("cards show their format", op.d.querySelector(`[data-card-id="${await idOf(W1)}"] .idea-format`)?.textContent === "Talking head · pain opener");
await drag(await idOf(W1), "sent");
r = await row(W1);
chk("dragged to Sent: visible to the client, out of the bank", r.status === "concept_pending" && !!r.concept_approved_at && !r.editor_brief.ideaBank && r.editor_brief.format === "Talking head · pain opener", r);
chk("it's in the Sent to client column", sentIds().includes(await idOf(W1)) && !bankIds().includes(await idOf(W1)));
// The button does the same (phones can't drag).
Array.from(op.d.querySelectorAll(`[data-card-id="${await idOf("We film this one")}"] button`)).find(b => b.textContent.includes("Send to client")).click(); await settle();
r = await row("We film this one");
chk("Send button: we-film idea goes back to To film", r.status === "to_film" && !!r.concept_approved_at && !r.editor_brief.ideaBank, r);
chk("bank keeps the other two", bankIds().length === 2 && op.d.getElementById("bankColN").textContent === "2");
chk("sent ones are back on To Do", todoText().includes(W1));

cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
clTitles = cl.w.eval("VIDEOS").map(v => v.title).sort();
chk("client sees just the two sent", clTitles.join("|") === ["We film this one", W1].sort().join("|"), clTitles);

// Drag one back: off the client's portal again, no question asked.
await drag(await idOf(W1), "bank");
r = await row(W1);
chk("dragged back to Ideas: hidden again", !r.concept_approved_at && !!r.editor_brief.ideaBank && bankIds().includes(await idOf(W1)), r);
await drag(await idOf(W1), "sent");

// Send from a banked idea's own card.
op.w.openOperatorVideoModal(await idOf(A1)); await settle();
chk("banked card says the client can't see it", op.d.getElementById("videoModalBox").textContent.includes("In Content Ideas"));
modalBtn("Send to client").click(); await settle();
chk("sent from its card", !!(await row(A1)).concept_approved_at && !(await row(A1)).editor_brief.ideaBank);

// Clicking a card opens the Edit form, idea text first.
op.d.querySelector(`[data-card-id="${await idOf(W2)}"] b`).click(); await settle();
const firstFields = Array.from(op.d.querySelectorAll("#videoModalBox [data-f]")).slice(0, 4).map(el => el.dataset.f);
chk("clicking a card opens Edit with title, hook, script, outline first", op.d.querySelector("#videoModalBox h2").textContent === "Edit video" && firstFields.join() === "title,hook,body,outline", firstFields);
op.d.querySelector('#videoModalBox [data-f="hook"]').value = "New hook.";
// Format is editable in the Edit form.
op.d.querySelector('#videoModalBox [data-f="format"]').value = "Myth · contrarian opener";
op.d.getElementById("vfSave").click(); await settle();
chk("hook and format saved from the Edit form, still banked", (await row(W2)).editor_brief.format === "Myth · contrarian opener" && !!(await row(W2)).editor_brief.ideaBank
  && (await db.query("select hook from social_videos where title=$1", [W2])).rows[0].hook === "New hook.");

// Add ideas with Claude, straight into the bank.
op.w.openBulkAdd(FL, true); await settle();
chk("bulk add from the Idea Bank has the box ticked", op.d.getElementById("bkToBank").checked);
const text = op.d.getElementById("bkText");
text.value = JSON.stringify([{ title: "Social Media · S9 · New one", hook: "Look.", format: "Green screen · reaction", postDate: "2026-11-20" }]);
text.dispatchEvent(new op.w.Event("input")); await settle();
op.d.getElementById("bkSave").click(); await settle();
r = await row("Social Media · S9 · New one");
chk("bulk-added idea is banked, with its format", !!r && !r.concept_approved_at && !r.post_date && r.editor_brief.ideaBank.postDate === "2026-11-20" && r.editor_brief.format === "Green screen · reaction", r);
chk("and listed in the bank", bankIds().includes(await idOf("Social Media · S9 · New one")));

// Without the box ticked, bulk add works as before.
op.w.openBulkAdd(FL); await settle();
text.value = "";
const t2 = op.d.getElementById("bkText");
t2.value = JSON.stringify([{ title: "Straight to client" }]);
t2.dispatchEvent(new op.w.Event("input")); await settle();
op.d.getElementById("bkSave").click(); await settle();
chk("bulk add without the bank goes to the client", !!(await row("Straight to client")).concept_approved_at);

chk("no page errors", !op.ui.errors.length && !cl.ui.errors.length, [op.ui.errors, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
