// Abandon from the operator dashboard (Tait, 2026-11-01): one button that
// deletes a video for good (the bridge also trashes its Drive copy), no
// separate Delete, and at Edit review only Review & comment, Approve and
// Abandon.
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
  insert into social_drive_folder_links (client_id,root,footage_uploads,final_edits) values
    ('${GG}','https://drive.google.com/drive/folders/root00000001','https://drive.google.com/drive/folders/raw000000001','https://drive.google.com/drive/folders/fin000000001');
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,post_date,due_to_edit,due_to_film,platform,editor_brief) values
    ('${GG}','Keep me','to_film','us',now(),'2026-10-05','2026-10-03','2026-10-02','{linkedin,facebook,instagram}','{"instructions":"Cut it tight"}'),
    ('${GG}','Maybe not','to_film','us',now(),'2026-10-06','2026-10-04','2026-10-02','{linkedin,facebook,instagram}','{"instructions":"Talking head"}'),
    ('${GG}','Bad cut','in_review','us',now(),'2026-10-08',null,null,'{instagram}','{"aiEditor":true,"revisions":"0:03  Move the text up"}'),
    ('${GG}','Worse cut','in_review','us',now(),'2026-10-09',null,null,'{instagram}','{"aiEditor":true}');
`);
const row = async t => (await db.query("select status, editor_brief from social_videos where title=$1", [t])).rows[0];
const idOf = async t => (await db.query("select id from social_videos where title=$1", [t])).rows[0].id;
// Comments Tait sent back on Bad cut: the row used to get "Comments & replies".
await db.exec(`insert into social_video_comments (video_id,author_id,author_role,body,closed_at) values ('${await idOf("Bad cut")}','${OP}','operator','Move the text up',now())`);

let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const videosTab = () => { op.w.openClientPage(GG, "videos"); return op.d.getElementById("cpBody"); };
const modalLabels = () => Array.from(op.d.querySelectorAll("#videoModalBox .modal-actions .btn, #videoModalBox .modal-actions button, #videoModalBox .modal-links a")).map(b => b.textContent.trim());
const modalBtn = label => Array.from(op.d.querySelectorAll("#videoModalBox button")).find(b => b.textContent.trim() === label);
const calTitles = () => Object.values(op.w.eval("calendarByDay(filteredVideos(), calState)")).flat().map(e => e.x.video.title);

// The card at Edit review: just the three.
op.w.openOperatorVideoModal(await idOf("Bad cut")); await settle();
let labels = modalLabels();
chk("Edit review card: only Review & comment, Approve and Abandon", JSON.stringify(labels) === JSON.stringify(["Review & comment", "Approve & add captions", "Abandon"]), labels);
chk("…the revisions it was sent back with still show", op.d.getElementById("videoModalBox").textContent.includes("Move the text up"));
chk("no Comments & replies on its row", !videosTab().textContent.includes("Comments & replies"));

// Any other card: Abandon, no Delete.
op.w.openOperatorVideoModal(await idOf("Maybe not")); await settle();
labels = modalLabels();
chk("other cards: Abandon, Edit and Open portal, no Delete", labels.includes("Abandon") && labels.includes("Edit") && labels.includes("Open portal") && !labels.includes("Delete"), labels);
modalBtn("Abandon").click(); await settle();
let s = await row("Maybe not");
chk("Abandon: flagged for the bridge to delete, brief kept", s.status === "rejected" && s.editor_brief.deleteRequested === true && s.editor_brief.instructions === "Talking head"
  && op.ui.confirms.at(-1).includes("Google Drive"), s);
chk("…off the calendar and the client's Videos tab, no Abandoned list", !calTitles().includes("Maybe not") && calTitles().includes("Keep me")
  && !videosTab().textContent.includes("Maybe not") && !videosTab().textContent.includes("Abandoned"));

// The client never sees it.
let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-grad-gig");
const clTitles = cl.w.eval("VIDEOS").map(v => v.title);
chk("client portal: abandoned video hidden, the others there", !clTitles.includes("Maybe not") && clTitles.includes("Keep me"), clTitles);

// The review window: Abandon next to Send changes to the editor.
op.w.operatorReview(await idOf("Worse cut")); await settle();
const rvLabels = Array.from(op.d.querySelectorAll("#videoModalBox .rv-actions button")).map(b => b.textContent.trim());
chk("review window: Approve, Send changes, Abandon", JSON.stringify(rvLabels) === JSON.stringify(["Approve & add captions", "Send changes to the editor", "Abandon"]), rvLabels);
modalBtn("Abandon").click(); await settle();
s = await row("Worse cut");
chk("…and it abandons it the same way", s.status === "rejected" && s.editor_brief.deleteRequested === true && s.editor_brief.aiEditor === true, s);

// The Edit form: no Delete, and no Abandoned status to hide a video by hand.
op.w.openVideoForm(await idOf("Keep me")); await settle();
chk("Edit form has no Delete button", !op.d.getElementById("vfDelete") && !modalBtn("Delete"));
chk("Edit form's status list has no Abandoned", !Array.from(op.d.querySelectorAll('#videoModalBox [data-f="status"] option')).some(o => o.value === "rejected"));
op.d.getElementById("vfSave").click(); await settle();
chk("saving the form still works", (await row("Keep me")).status === "to_film");

// Adding ideas still works.
op.w.openVideoForm(null, GG); await settle();
op.d.querySelector('#videoModalBox [data-f="title"]').value = "Fresh idea";
op.d.getElementById("vfSave").click(); await settle();
chk("+ New idea adds one", (await row("Fresh idea"))?.status === "concept_pending");

chk("no page errors", !op.ui.errors.length && !op.ui.alerts.length && !cl.ui.errors.length, [op.ui.errors, op.ui.alerts, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
