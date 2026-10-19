// The Idea Bank: ideas the client hasn't seen yet. Move ideas into it, pick
// a few and send them, add new ones straight into it, and what To Do, the
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
    ('${FL}','Websites · W1 · Embarrassed by your website?','Be honest.','concept_pending','client',now(),'2026-10-21','2026-10-14','2026-10-07','{instagram}','{}'),
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
const bankIds = () => Array.from(op.d.querySelectorAll("#bankList [data-bank-id]")).map(el => el.dataset.bankId);
const modalBtn = label => Array.from(op.d.querySelectorAll("#videoModalBox button")).find(b => b.textContent.trim() === label);

chk("sidebar has an Idea Bank tab", !!op.d.querySelector('.nav-item[data-view="ideabank"]'));
chk("bank starts empty", !bankIds().length && op.d.getElementById("navBankN").hidden);

// Move one from its card, three more at once.
op.w.openOperatorVideoModal(await idOf(A1)); await settle();
chk("an idea's card has Move to Idea Bank", !!modalBtn("Move to Idea Bank"));
modalBtn("Move to Idea Bank").click(); await settle();
let r = await row(A1);
chk("moved: hidden from the client, dates cleared and kept", r.status === "concept_pending" && !r.concept_approved_at && !r.due_to_film && !r.post_date
  && r.editor_brief.ideaBank.from === "concept_pending" && r.editor_brief.ideaBank.postDate === "2026-10-19" && r.editor_brief.instructions === "Tight cuts", r);
await op.w.moveToIdeaBank([await idOf(W1), await idOf(W2), await idOf("We film this one")]); await settle();
chk("we-film idea remembers it was To film", (await row("We film this one")).editor_brief.ideaBank.from === "to_film");
chk("bank lists all four, nav count 4", bankIds().length === 4 && op.d.getElementById("navBankN").textContent === "4");
chk("bank groups by category, with a filter", op.d.getElementById("bankList").textContent.includes("AI Systems") && op.d.querySelectorAll("#bankTabs .chip").length >= 3);
chk("banked ideas are off To Do and the calendar", ![A1, W1, "We film this one"].some(t => todoText().includes(t) || calTitles().includes(t)), calTitles());
chk("sent-back idea stays in Sent back, not the bank", op.d.querySelector('[data-stage="sentBack"]').textContent.includes("Sent back idea")
  && !op.d.getElementById("bankList").textContent.includes("Sent back idea"));

let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
let clTitles = cl.w.eval("VIDEOS").map(v => v.title);
chk("client can't see banked ideas (RLS)", clTitles.length === 0, clTitles);

// Category filter, then pick two rows and send them with a film-by date.
op.d.querySelector('#bankTabs [data-bank-cat="Websites"]').click(); await settle();
chk("category filter shows just that category", bankIds().length === 2);
op.d.querySelector('#bankTabs [data-bank-cat=""]').click(); await settle();
op.d.querySelector(`#bankList [data-bank-id="${await idOf(W1)}"]`).click(); await settle();
op.d.querySelector(`#bankList [data-bank-id="${await idOf("We film this one")}"] input`).click(); await settle();
chk("clicking a row or its box picks it", op.d.getElementById("bankBar").textContent.includes("2 picked"));
Array.from(op.d.querySelectorAll("#bankBar button")).find(b => b.textContent.includes("Send 2")).click(); await settle();
chk("send window lists the picked ideas", op.d.getElementById("videoModalBox").textContent.includes(W1));
op.d.querySelector('#videoModalBox [data-f="filmBy"]').setDate("2026-10-30");
op.d.getElementById("sbSend").click(); await settle();
r = await row(W1);
chk("sent: visible to the client, film-by set, out of the bank", r.status === "concept_pending" && !!r.concept_approved_at && r.due_to_film === "2026-10-30" && !r.editor_brief.ideaBank, r);
r = await row("We film this one");
chk("we-film idea goes back to To film", r.status === "to_film" && !!r.concept_approved_at && !r.editor_brief.ideaBank, r);
chk("bank keeps the other two", bankIds().length === 2 && op.d.getElementById("bankBar").textContent.includes("0 picked"));
chk("sent ones are back on To Do", todoText().includes(W1));

cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
clTitles = cl.w.eval("VIDEOS").map(v => v.title).sort();
chk("client sees just the two sent", clTitles.join("|") === ["We film this one", W1].sort().join("|"), clTitles);

// Send from a banked idea's own card.
op.w.openOperatorVideoModal(await idOf(A1)); await settle();
chk("banked card says the client can't see it", op.d.getElementById("videoModalBox").textContent.includes("In the Idea Bank"));
modalBtn("Send to client").click(); await settle();
op.d.getElementById("sbSend").click(); await settle();
chk("sent from its card, no film-by date", !!(await row(A1)).concept_approved_at && !(await row(A1)).due_to_film);

// Add ideas with Claude, straight into the bank.
op.w.openBulkAdd(FL, true); await settle();
chk("bulk add from the Idea Bank has the box ticked", op.d.getElementById("bkToBank").checked);
const text = op.d.getElementById("bkText");
text.value = JSON.stringify([{ title: "Social Media · S9 · New one", hook: "Look.", postDate: "2026-11-20" }]);
text.dispatchEvent(new op.w.Event("input")); await settle();
op.d.getElementById("bkSave").click(); await settle();
r = await row("Social Media · S9 · New one");
chk("bulk-added idea is banked", !!r && !r.concept_approved_at && !r.post_date && r.editor_brief.ideaBank.postDate === "2026-11-20", r);
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
