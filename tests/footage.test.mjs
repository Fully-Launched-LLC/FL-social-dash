// Per-video raw footage folders (editor_brief.rawFootageUrl): where the
// operator, the editor and a filming client find them; Mark filmed for
// videos we film; and the video form keeping the rest of editor_brief.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", CL = "00000000-0000-0000-0000-00000000000d";
const GG = "d44e6fc3-dfea-42dc-902c-54724441040d";
const OWN = "https://drive.google.com/drive/folders/own-a", CLIENT_FOLDER = "https://drive.google.com/drive/folders/client";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x');
  update social_editors set setup_at = now(); -- they made their password (migration 013)
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_drive_folder_links (client_id, footage_uploads, final_edits) values ('${GG}','${CLIENT_FOLDER}','https://drive/final');
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,editor_id,due_to_film,post_date,editor_brief) values
    ('${GG}','A own folder','to_film','us',now(),null,'2026-10-02','2026-10-09','{"instructions":"Cut A","rawFootageUrl":"${OWN}","keepMe":"yes"}'),
    ('${GG}','B no folder','to_film','us',now(),null,'2026-10-02','2026-10-12','{"instructions":"Cut B"}'),
    ('${GG}','C editing','with_editor','us',now(),'${ED}',null,'2026-10-14','{"instructions":"Cut C","rawFootageUrl":"https://drive.google.com/drive/folders/own-c"}'),
    ('${GG}','D client films','to_film','client',now(),null,'2026-10-03','2026-10-16','{"rawFootageUrl":"https://drive.google.com/drive/folders/own-d"}'),
    ('${GG}','E stock','to_film','us',now(),null,null,'2026-10-05','{}');
`);
const row = async t => (await db.query("select status, editor_brief from social_videos where title=$1", [t])).rows[0];
const idOf = async t => (await db.query("select id from social_videos where title=$1", [t])).rows[0].id;

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
op.d.querySelector('[data-stage-tab="toEditor"]').click(); await settle();
const opRow = t => Array.from(op.d.querySelectorAll('[data-stage="toEditor"] .row')).find(r => r.textContent.includes(t));
const rawLink = r => Array.from(r.querySelectorAll("a")).find(a => a.textContent.includes("Raw footage"));
chk("row: video with its own folder links to it", rawLink(opRow("A own folder"))?.href === OWN && rawLink(opRow("A own folder")).href === OWN);
chk("row: video without one falls back to the client's folder", rawLink(opRow("B no folder"))?.href === CLIENT_FOLDER);

op.w.openOperatorVideoModal(await idOf("A own folder")); await settle();
const cardRaw = Array.from(op.d.querySelectorAll("#videoModalBox a")).filter(a => a.textContent.includes("Raw footage"));
chk("card: one raw footage link, this video's", cardRaw.length === 1 && cardRaw[0].href === OWN, cardRaw.map(a => a.href));
const markBtn = Array.from(op.d.querySelectorAll("#videoModalBox button")).find(b => b.textContent === "✓ Mark filmed");
chk("card: Mark filmed on a video we film", !!markBtn);
markBtn.click(); await settle();
chk("Mark filmed: status filmed, still ready for an editor, film deadline gone", (await row("A own folder")).status === "filmed"
  && !!opRow("A own folder") && !op.w.eval("calendarEntries(findVideo(" + JSON.stringify(await idOf("A own folder")) + "))").some(e => e.kind === "film"));
chk("…and it no longer offers Mark filmed", !Array.from(opRow("A own folder").querySelectorAll("button")).some(b => b.textContent === "✓ Mark filmed"));

chk("no Mark filmed on a post with nothing to film (no film-by date)", !Array.from(opRow("E stock").querySelectorAll("button")).some(b => b.textContent === "✓ Mark filmed"));

// The video form: shows the folder, validates it, keeps the rest of editor_brief.
op.w.openVideoForm(await idOf("A own folder")); await settle();
const f = op.d.querySelector('#videoModalBox [data-f="rawFootageUrl"]');
chk("form shows this video's raw footage folder", f.value === OWN);
f.value = "not a link"; op.d.getElementById("vfSave").click(); await settle();
chk("a bad link is caught", op.d.getElementById("vfError").textContent.includes("https://") && (await row("A own folder")).editor_brief.rawFootageUrl === OWN);
f.value = "https://drive.google.com/drive/folders/new-a"; op.d.getElementById("vfSave").click(); await settle();
const eb = (await row("A own folder")).editor_brief;
chk("saved, and the rest of editor_brief is kept", eb.rawFootageUrl === "https://drive.google.com/drive/folders/new-a" && eb.keepMe === "yes" && eb.instructions === "Cut A", eb);
op.w.openVideoForm(await idOf("B no folder")); await settle();
op.d.querySelector('#videoModalBox [data-f="rawFootageUrl"]').value = "https://drive.google.com/drive/folders/new-b";
op.d.getElementById("vfSave").click(); await settle();
chk("a folder can be added to a video that had none", (await row("B no folder")).editor_brief.rawFootageUrl === "https://drive.google.com/drive/folders/new-b");

// The editor gets the video's own folder.
const ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
const edLink = Array.from(ed.d.querySelectorAll("a")).find(a => a.textContent.includes("Raw footage"));
chk("editor: raw footage opens this video's folder", edLink?.href === "https://drive.google.com/drive/folders/own-c", edLink && edLink.href);

// A client who films uploads into the video's own folder.
const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-grad-gig");
const up = Array.from(cl.d.querySelectorAll("#listToFilm a")).find(a => a.textContent.includes("Upload footage"));
chk("client: Upload footage opens this video's folder", up?.href === "https://drive.google.com/drive/folders/own-d" && cl.d.getElementById("listToFilm").textContent.includes("its footage folder"));
chk("client: a filmed we-film video reads 'Filmed: editing next'", cl.w.eval("clientStage(VIDEOS.find(v => v.title === 'A own folder'), 'us')") === "Filmed: editing next");

chk("no page errors", ![op, ed, cl].some(p => p.ui.errors.length) && !op.ui.alerts.length, [op.ui.errors, ed.ui.errors, cl.ui.errors, op.ui.alerts]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
