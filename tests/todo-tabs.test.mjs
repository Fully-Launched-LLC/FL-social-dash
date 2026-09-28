// To Do: one tab per stage (plus All) with counts, the client dropdown,
// and the Ready to post stage.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b";
const A = "d44e6fc3-dfea-42dc-902c-54724441040d", B = "d44e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x');
  insert into social_clients (id,name,slug,client_system) values ('${A}','Alpha','alpha','self-serve'),('${B}','Beta','beta','concierge');
  insert into social_videos (client_id,title,status,concept_approved_at,editor_id,caption) values
    ('${A}','A sent back','concept_pending',null,null,null),
    ('${A}','A idea','concept_pending',now(),null,null),
    ('${A}','A to film','to_film',null,null,null),
    ('${A}','A footage in','ready_to_edit',null,null,null),
    ('${A}','A editing','with_editor',null,'${ED}',null),
    ('${A}','A edit done','in_review',null,'${ED}',null),
    ('${A}','A final','client_review',null,null,'cap'),
    ('${A}','A ready','ready_to_post',null,null,'Post me'),
    ('${A}','A posted','posted',null,null,null),
    ('${B}','B idea','concept_pending',now(),null,null),
    ('${B}','B we film','to_film',null,null,null),
    ('${B}','B ready','ready_to_post',null,null,'Post B');
`);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const tabs = () => Object.fromEntries(Array.from(op.d.querySelectorAll("#todoTabs .chip")).map(c => [c.dataset.stageTab, c.textContent]));
const shown = () => Array.from(op.d.querySelectorAll("#view-todo [data-stage]")).filter(el => el.style.display !== "none").map(el => el.dataset.stage);
const titlesIn = stage => Array.from(op.d.querySelectorAll(`#view-todo [data-stage="${stage}"] b.video-card`)).map(b => b.textContent);

let t = tabs();
chk("tabs in stage order with counts", Object.values(t).join(" | ") ===
  "All (11) | ⏰ Time sensitive (0) | Sent back with suggestions (1) | Waiting on client (4) | Ready for an editor (2) | With an editor (1) | Edits to review (1) | Ready to post (2) | Abandoned (0)", Object.values(t));
chk("All shows every stage", shown().join() === "sentBack,client,toEditor,withEditor,edits,post", shown());
chk("posted videos aren't in To Do", !op.d.getElementById("view-todo").textContent.includes("A posted"));

op.d.querySelector('[data-stage-tab="post"]').click(); await settle();
chk("Ready to post tab shows only that stage", shown().join() === "post" && tabs().post.startsWith("Ready to post") && op.d.querySelector('[data-stage-tab="post"]').classList.contains("active"));
chk("ready-to-post cards: captions + Mark posted", titlesIn("post").join() === "A ready,B ready" && op.d.querySelector('[data-stage="post"]').textContent.includes("Post me")
  && !!Array.from(op.d.querySelectorAll('[data-stage="post"] button')).find(b => b.textContent === "Mark posted"));
op.d.querySelector('[data-stage-tab="toEditor"]').click(); await settle();
chk("Ready for an editor: client footage + we-film video", shown().join() === "toEditor" && titlesIn("toEditor").sort().join() === "A footage in,B we film");
op.d.querySelector('[data-stage-tab="client"]').click(); await settle();
chk("Waiting on client: grouped by status in pipeline order (ideas → to film → final)", titlesIn("client").join() === "A idea,B idea,A to film,A final", titlesIn("client"));
const labels = Array.from(op.d.querySelectorAll('[data-stage="client"] .badge')).map(b => b.textContent);
chk("status labels line up in order", labels.join() === "Idea,Idea,To film,Client final review", labels);

// Client dropdown filters everything, and matches the chips at the top.
const sel = op.d.getElementById("todoClient");
chk("client dropdown lists All clients + each client", Array.from(sel.options).map(o => o.textContent).join() === "All clients,Alpha,Beta");
sel.value = B; sel.dispatchEvent(new op.w.Event("change")); await settle();
t = tabs();
chk("filtered to Beta: counts update", t.all === "All (3)" && t.client === "Waiting on client (1)" && t.toEditor === "Ready for an editor (1)" && t.post === "Ready to post (1)", t);
chk("stage tab kept while filtering", shown().join() === "client" && titlesIn("client").join() === "B idea");
chk("top chips follow the dropdown", op.d.querySelector("#globalClientFilter .chip.active").textContent === "Beta");
op.d.querySelector('#globalClientFilter [data-c="all"]').click(); await settle();
chk("…and the dropdown follows the chips", op.d.getElementById("todoClient").value === "all" && tabs().all === "All (11)");

// Mark posted from To Do.
op.d.querySelector('[data-stage-tab="post"]').click(); await settle();
Array.from(op.d.querySelectorAll('[data-stage="post"] button')).find(b => b.textContent === "Mark posted").click(); await settle();
chk("marked posted from To Do", (await db.query("select status from social_videos where title='A ready'")).rows[0].status === "posted" && tabs().post === "Ready to post (1)");

// New ideas straight from To Do.
chk("no separate Ready to Post page", !op.d.getElementById("view-post") && !Array.from(op.d.querySelectorAll(".nav-item")).some(n => n.textContent.includes("Ready to Post")));
const todoBtn = label => Array.from(op.d.querySelectorAll("#view-todo button")).find(b => b.textContent.trim() === label);
todoBtn("+ New idea").click(); await settle();
chk("+ New idea on To Do opens the idea form", op.d.getElementById("videoModalBox").textContent.includes("New idea") && !!op.d.getElementById("vfSave"));
op.w.closeVideoModal();
todoBtn("📋 Add ideas with Claude").click(); await settle();
chk("Add ideas with Claude on To Do opens the paste box", !!op.d.getElementById("bkText"));
op.w.closeVideoModal();

chk("no page errors", !op.ui.errors.length && !op.ui.alerts.length, [op.ui.errors, op.ui.alerts]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
