// The operator in the editor portal: reaches it from the operator
// dashboard, sees every editor's work, and can click Finished for them.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a";
const ED = "00000000-0000-0000-0000-00000000000b";
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
// Tait is an operator and also on the editor list, like on prod.
await db.exec(`
  insert into auth.users values ('${OP}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${OP}','Tait','tait@x'),('${ED}','Morgan','m@x');
  update social_editors set setup_at = now(); -- they made their password (migration 013)
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fully-launched','self-serve');
  insert into social_videos (client_id,title,status,editor_id) values
    ('${FL}','Tait edits this','with_editor','${OP}'),
    ('${FL}','Morgan edits this','with_editor','${ED}');
`);

// Operator dashboard links to the editor portal.
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
chk("sidebar links to editor portal", !!op.d.querySelector('a.nav-item[href="/editor/dashboard.html"]'));
const opRow = t => Array.from(op.d.querySelectorAll(".row")).find(r => (r.querySelector("b.video-card") || {}).textContent === t);
opRow("Morgan edits this").querySelector("b.video-card").click(); await settle();
const link = op.d.querySelector(`#videoModalBox a[href="/editor/dashboard.html?editor=${ED}"]`);
chk("popup links to that editor's portal", !!link);

// Editor portal as operator, opened on Morgan's work.
const url = "https://fl.test/editor/dashboard.html?editor=" + ED;
const p = await openPage("editor/dashboard.html", OP, url);
chk("tells the editor to upload the finished video on Finished", p.d.getElementById("queueList").textContent.includes("upload the finished video there"));
chk("operator banner shows", p.d.getElementById("operatorBanner").textContent.includes("as the operator"));
const cards = () => Array.from(p.d.querySelectorAll("#queueList .card"));
const titles = () => cards().map(c => c.querySelector("[data-open]").textContent);
chk("opens filtered to Morgan", titles().length === 1 && titles()[0] === "Morgan edits this", titles());
const fin = t => cards().find(c => c.querySelector("[data-open]").textContent === t)?.querySelector("button.primary");
fin("Morgan edits this").click(); await settle();
const pop = p.d.getElementById("videoModalBox");
chk("pop-up asks for the finished video; Send waits for it", pop.textContent.includes("Upload the finished video") && p.d.getElementById("efYes").disabled);
// Drop a file on the upload box (resumable uploads need tus; the test
// page has none, so it goes as one piece to the storage stand-in).
const dropVideo = async (page, name) => {
  const zone = page.d.querySelector("#videoModalBox .rv-upload");
  const ev = new page.w.Event("drop", { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [new page.w.File(["x"], name, { type: "video/mp4" })] };
  zone.dispatchEvent(ev); await settle();
};
await dropVideo(p, "Morgan cut.mp4");
const up = p.ui.log.find(l => l.upload);
chk("uploaded to finished-videos, in this video's folder", up && up.upload.bucket === "finished-videos" && /^d44e6fc3-[^/]+\/[0-9a-f-]{36}\/\d+-Morgan_cut\.mp4$/.test(up.upload.path), up);
chk("…and Send is on", !p.d.getElementById("efYes").disabled);
p.d.getElementById("efYes").click(); await settle();
chk("sent confirmation shown", p.d.getElementById("videoModalBox").textContent.includes("Sent to the operator"));
p.d.getElementById("efDone").click(); await settle();
let r = (await db.query("select status, final_cut_url, review_video_path, review_video_name from social_videos where title='Morgan edits this'")).rows[0];
chk("operator finished Morgan's video; the cut is the one to review", r.status === "in_review" && r.final_cut_url === null
  && r.review_video_path === up.upload.path && r.review_video_name === "Morgan cut.mp4", r);
chk("no link asked for, no browser pop-ups", !p.ui.promptsShown.length && !p.ui.confirms.length, p.ui.confirms);

// All editors, then Tait's own.
Array.from(p.d.querySelectorAll("#editorChips .chip")).find(c => c.textContent === "All editors").click(); await settle();
chk("Tait's video visible under All editors", titles().includes("Tait edits this"), titles());
fin("Tait edits this").click(); await settle();
await dropVideo(p, "tait.mp4");
p.d.getElementById("efYes").click(); await settle();
r = (await db.query("select status from social_videos where title='Tait edits this'")).rows[0];
chk("operator finished their own video", r.status === "in_review", r);

// A link to the exact file, if the operator adds one, beats the folder.
await db.exec(`insert into social_drive_folder_links (client_id, final_edits) values ('${FL}','https://drive/fl-final');
  update social_videos set final_cut_url = 'https://drive/exact' where title = 'Tait edits this';`);
// (Both now have an uploaded cut, so it's Review & leave notes; Drive links
// are for videos finished before uploads.)
await db.exec(`update social_videos set review_video_path = null where title in ('Tait edits this','Morgan edits this')`);
const op3 = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const w3 = t => Array.from(op3.d.querySelectorAll("#editsList .row")).find(r => r.querySelector("b.video-card").textContent === t);
chk("no uploaded cut: Watch opens the exact file when set", !!w3("Tait edits this")?.querySelector('a[href="https://drive/exact"]'));
chk("…otherwise the Final edits folder", !!w3("Morgan edits this")?.querySelector('a[href="https://drive/fl-final"]'));

const log = (await db.query("select changed_by_role from social_status_audit_log where action <> 'created'")).rows;
chk("logged as operator", log.length === 2 && log.every(x => x.changed_by_role === "operator"), log);
chk("no alerts or page errors", !p.ui.alerts.length && !p.ui.errors.length && !op.ui.errors.length, [p.ui.alerts, p.ui.errors, op.ui.errors]);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
