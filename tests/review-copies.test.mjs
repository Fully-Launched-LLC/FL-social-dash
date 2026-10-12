// Review copies in Supabase Storage (migration 018, Tait 2026-10-09): the
// review window plays a version's copy instead of streaming from Google
// Drive; the operator's "Upload a review copy"; and the database only
// taking a copy that belongs to that video.
import { freshDb, makeHarness, checker, pickFile } from "./harness.mjs";

const db = await freshDb();
const { as, openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", CL = "00000000-0000-0000-0000-00000000000d";
const A = "d44e6fc3-dfea-42dc-902c-54724441040d", B = "e55e6fc3-dfea-42dc-902c-54724441040e";
const V = "22222222-2222-2222-2222-222222222222", W = "33333333-3333-3333-3333-333333333333";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x');
  update social_editors set setup_at = now();
  insert into social_clients (id,name,slug,client_system,contact_name) values ('${A}','Grad Gig','grad-gig','self-serve','Luke'),('${B}','Other','other','self-serve',null);
  insert into social_client_users (id,client_id,email) values ('${CL}','${A}','l@x');
  insert into social_settings (key, value) values ('google_api_key','KEY123');
  insert into social_videos (id,client_id,title,status,editor_id,concept_approved_at,post_date,final_cut_url) values
    ('${V}','${A}','With a copy','client_review','${ED}',now(),'2026-10-12','https://drive.google.com/file/d/drivecut000001/view'),
    ('${W}','${A}','No copy yet','in_review','${ED}',now(),'2026-10-13','https://drive.google.com/file/d/drivecut000002/view');
  insert into social_video_versions (video_id, version, file_id, file_name, storage_path, created_by) values
    ('${V}', 1, 'drivecut000001', 'cut.mp4', '${A}/${V}/1-cut.mp4', '${ED}');
`);
const drive = [];
const fetchDrive = url => { drive.push(url); return { ok: true, status: 200, json: async () => ({ files: [], videoMediaMetadata: { width: 1080, height: 1920 } }) }; };
const button = (root, re) => Array.from(root.querySelectorAll("button, label")).find(b => re.test(b.textContent));

// The client: plays the review copy, not Drive.
let p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
const card = Array.from(p.d.querySelectorAll("#listFinal .card")).find(c => c.textContent.includes("With a copy"));
button(card, /^Review the video$/).click(); await settle();
let box = p.d.getElementById("videoModalBox");
let src = box.querySelector("video.rv-video")?.getAttribute("src");
chk("the client's review window plays the review copy (a signed link), not Drive", src === `https://signed/${A}/${V}/1-cut.mp4`, src);
chk("…without asking Drive for the video", !drive.some(u => u.includes("alt=media")), drive);
chk("…and no upload button for the client", !box.querySelector(".rv-copy"));
// A comment still belongs to that cut (the Drive file), as before.
box.querySelector(".rv-when-all").click();
box.querySelector(".rv-compose textarea").value = "Love it";
box.querySelector(".rv-add").click(); await settle();
chk("comments on it are tied to the cut", (await db.query(`select cut_ref from social_video_comments where body='Love it'`)).rows[0]?.cut_ref === "drivecut000001");
// Once sent, Watch the video plays the same copy.
await as(CL, "select status from social_client_video_action(p_video_id => $1, p_action => 'request_revisions', p_note => 'Whole video  Love it')", [V]);
p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
Array.from(p.d.querySelectorAll("#listChanges .card button")).find(b => b.textContent === "Watch the video").click(); await settle();
src = p.d.querySelector("#videoModalBox video.rv-video")?.getAttribute("src");
chk("while it's with the editor, Watch the video plays the review copy too", src === `https://signed/${A}/${V}/1-cut.mp4`, src);
chk("no page errors (client)", !p.ui.errors.length && !p.ui.alerts.length, [p.ui.errors, p.ui.alerts]);

// The operator: no copy yet → Upload a review copy.
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html", { fetch: fetchDrive });
op.w.operatorReview(W); await settle();
box = op.d.getElementById("videoModalBox");
chk("no copy yet: it streams from Drive and offers Upload a review copy", box.querySelector("video.rv-video")?.getAttribute("src")?.includes("/files/drivecut000002?") && !!box.querySelector(".rv-copy input[type=file]"));
const inp = box.querySelector(".rv-copy input");
inp.id = "rvCopyPick"; pickFile(op, "rvCopyPick", "final.mp4"); await settle();
const ver = (await db.query(`select version, file_id, storage_path from social_video_versions where video_id='${W}'`)).rows;
chk("uploading it makes v1 with the Drive file and the copy's path", ver.length === 1 && ver[0].version === 1 && ver[0].file_id === "drivecut000002" && ver[0].storage_path.startsWith(`${A}/${W}/`) && ver[0].storage_path.endsWith("final.mp4"), ver);
chk("…uploaded to the review bucket", op.ui.log.some(l => l.upload && l.upload.bucket === "review" && l.upload.path === ver[0].storage_path));
src = op.d.querySelector("#videoModalBox video.rv-video")?.getAttribute("src");
chk("…and the window reopens on the copy, with no upload button", src === "https://signed/" + ver[0].storage_path && !op.d.querySelector("#videoModalBox .rv-copy"), src);
// A version that already exists without a copy gets it added, not a new version.
await db.exec(`update social_video_versions set storage_path = null where video_id='${W}'`);
op.w.closeVideoModal(); op.w.operatorReview(W); await settle();
op.d.querySelector("#videoModalBox .rv-copy input").id = "rvCopyPick2"; pickFile(op, "rvCopyPick2", "again.mp4"); await settle();
const ver2 = (await db.query(`select version, storage_path from social_video_versions where video_id='${W}'`)).rows;
chk("an existing version without a copy gets it added (still v1)", ver2.length === 1 && ver2[0].storage_path.endsWith("again.mp4"), ver2);
chk("no page errors (operator)", !op.ui.errors.length && !op.ui.alerts.length, [op.ui.errors, op.ui.alerts]);

// The database: a copy must be this video's own.
const bad = await as(OP, "select version from social_add_video_version($1, null, 'x.mp4', $2)", [V, `${B}/${V}/x.mp4`]);
chk("a review copy under another client's folder is refused", !!bad.error && /isn't this video's/.test(bad.error.message), bad);
const bad2 = await as(OP, "select version from social_add_video_version($1, null, 'x.mp4', $2)", [V, `${A}/${W}/x.mp4`]);
chk("…and under another video's folder", !!bad2.error, bad2);
await db.exec(`update social_videos set status='with_editor' where id='${W}'`);
const good = await as(ED, "select version, storage_path from social_add_video_version($1, 'drivecut000003', 'v2.mp4', $2)", [W, `${A}/${W}/9-v2.mp4`]);
chk("the editor adds the next version with its copy", !good.error && good.data[0].version === 2 && good.data[0].storage_path === `${A}/${W}/9-v2.mp4`, good);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
if (counts.fail) process.exit(1);
