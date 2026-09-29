// Abandon, restore and delete a content idea from the operator dashboard,
// and what the calendar and the client's portal show for each.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const GG = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,post_date,due_to_edit,due_to_film,platform,editor_brief) values
    ('${GG}','Keep me','to_film','us',now(),'2026-10-05','2026-10-03','2026-10-02','{linkedin,facebook,instagram}','{"instructions":"Cut it tight"}'),
    ('${GG}','Maybe not','to_film','us',now(),'2026-10-06','2026-10-04','2026-10-02','{linkedin,facebook,instagram}','{"instructions":"Talking head"}'),
    ('${GG}','Delete me','concept_pending','us',now(),'2026-10-07','2026-10-05','2026-10-02','{linkedin}','{}');
`);
const status = async t => (await db.query("select status, editor_brief from social_videos where title=$1", [t])).rows[0];
const idOf = async t => (await db.query("select id from social_videos where title=$1", [t])).rows[0].id;

let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const tabs = () => Object.fromEntries(Array.from(op.d.querySelectorAll("#todoTabs .chip")).map(c => [c.dataset.stageTab, c.textContent]));
const shown = () => Array.from(op.d.querySelectorAll("#view-todo [data-stage]")).filter(el => el.style.display !== "none").map(el => el.dataset.stage);
const modalBtn = label => Array.from(op.d.querySelectorAll("#videoModalBox button")).find(b => b.textContent.trim() === label);
const calTitles = () => Object.values(op.w.eval("calendarByDay(filteredVideos(), calState)")).flat().map(e => e.x.video.title);

chk("both calendars' source: every scheduled video has its post date", ["Keep me", "Maybe not", "Delete me"].every(t => calTitles().includes(t)), calTitles());
chk("Abandoned tab exists, empty, and isn't part of All", tabs().abandoned === "Abandoned (0)" && tabs().all === "All (3)" && !shown().includes("abandoned"), tabs());

// Abandon from the video card.
op.w.openOperatorVideoModal(await idOf("Maybe not")); await settle();
chk("video card has Abandon and Delete", !!modalBtn("Abandon") && !!modalBtn("Delete"));
modalBtn("Abandon").click(); await settle();
let s = await status("Maybe not");
chk("abandoned: status rejected, where it was remembered", s.status === "rejected" && s.editor_brief.abandonedFrom === "to_film" && s.editor_brief.instructions === "Talking head", s);
chk("abandoned: off the calendar", !calTitles().includes("Maybe not") && calTitles().includes("Keep me"));
chk("abandoned: counts move to the Abandoned tab", tabs().abandoned === "Abandoned (1)" && tabs().all === "All (2)", tabs());
op.d.querySelector('[data-stage-tab="abandoned"]').click(); await settle();
chk("Abandoned tab shows it alone, with Restore and Delete", shown().join() === "abandoned"
  && op.d.querySelector('[data-stage="abandoned"]').textContent.includes("Maybe not")
  && ["Restore", "Delete"].every(l => Array.from(op.d.querySelectorAll('[data-stage="abandoned"] button')).some(b => b.textContent === l)));
op.d.querySelector('[data-stage-tab="all"]').click(); await settle();
chk("All doesn't show abandoned ideas", !shown().includes("abandoned") && !op.d.getElementById("view-todo").querySelector('[data-stage="toEditor"]').textContent.includes("Maybe not"));

// The client never sees it, on My Videos or the calendar.
let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-grad-gig");
const clTitles = cl.w.eval("VIDEOS").map(v => v.title);
chk("client portal: abandoned idea hidden, the others there (and on its calendar)", !clTitles.includes("Maybe not") && clTitles.includes("Keep me") && cl.w.eval("VIDEOS").find(v => v.title === "Keep me").postDate === "2026-10-05", clTitles);

// Restore puts it back where it was.
op.d.querySelector('[data-stage-tab="abandoned"]').click(); await settle();
Array.from(op.d.querySelectorAll('[data-stage="abandoned"] button')).find(b => b.textContent === "Restore").click(); await settle();
s = await status("Maybe not");
chk("restored to To film, back on the calendar", s.status === "to_film" && !("abandonedFrom" in s.editor_brief) && s.editor_brief.instructions === "Talking head" && calTitles().includes("Maybe not"), s);
chk("Abandoned tab empty again", tabs().abandoned === "Abandoned (0)" && tabs().all === "All (3)", tabs());

// Delete from the card: gone for good.
op.w.openOperatorVideoModal(await idOf("Delete me")); await settle();
modalBtn("Delete").click(); await settle();
chk("deleted from the card", !(await status("Delete me")) && !calTitles().includes("Delete me") && op.ui.confirms.at(-1).includes("permanently"));

// Delete an abandoned idea from the Abandoned tab.
op.w.openOperatorVideoModal(await idOf("Maybe not")); await settle();
modalBtn("Abandon").click(); await settle();
op.d.querySelector('[data-stage-tab="abandoned"]').click(); await settle();
Array.from(op.d.querySelectorAll('[data-stage="abandoned"] button')).find(b => b.textContent === "Delete").click(); await settle();
chk("deleted from the Abandoned tab", !(await status("Maybe not")) && tabs().abandoned === "Abandoned (0)");

// Delete still works from the Edit form, and editing an abandoned idea keeps it abandoned.
op.w.openOperatorVideoModal(await idOf("Keep me")); await settle();
modalBtn("Abandon").click(); await settle();
op.w.openVideoForm(await idOf("Keep me")); await settle();
chk("Edit form shows Abandoned as its status", op.d.querySelector('#videoModalBox [data-f="status"]').value === "rejected");
op.d.getElementById("vfSave").click(); await settle();
chk("saving the form keeps it abandoned", (await status("Keep me")).status === "rejected");
op.w.openVideoForm(await idOf("Keep me")); await settle();
op.d.getElementById("vfDelete").click(); await settle();
chk("deleted from the Edit form", !(await status("Keep me")));

// Adding ideas still works.
op.w.openVideoForm(null, GG); await settle();
op.d.querySelector('#videoModalBox [data-f="title"]').value = "Fresh idea";
op.d.getElementById("vfSave").click(); await settle();
chk("+ New idea adds one", (await status("Fresh idea"))?.status === "concept_pending");

chk("no page errors", !op.ui.errors.length && !op.ui.alerts.length && !cl.ui.errors.length, [op.ui.errors, op.ui.alerts, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
