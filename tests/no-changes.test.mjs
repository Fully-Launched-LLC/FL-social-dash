// "No changes needed: send to Tait": a video the client sent back with only
// a comment goes back to Tait without a new upload (Tait, 2026-10-19, Grad
// Gig's How to Sign up). First cuts don't get the button.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b";
const GG = "d44e6fc3-dfea-42dc-902c-54724441040f";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email,setup_at) values ('${ED}','Tait','t@x',now());
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','grad-gig','concierge');
  insert into social_drive_folder_links (client_id, final_edits) values ('${GG}','https://drive.google.com/drive/folders/FinalFolder0001');
  insert into social_videos (client_id,title,status,editor_id,concept_approved_at,note,client_revision_rounds) values
    ('${GG}','How to Sign up','with_editor','${ED}',now(),'Whole video  Love it, nice work',1),
    ('${GG}','First cut','with_editor','${ED}',now(),null,0);
  insert into social_video_versions (video_id, version, file_name, created_by)
    select id, 1, 'How to Sign up.mp4', '${ED}' from social_videos where title='How to Sign up';
`);
const row = async t => (await db.query("select status, client_revision_rounds from social_videos where title=$1", [t])).rows[0];
const versions = async t => (await db.query("select count(*)::int n from social_video_versions v join social_videos s on s.id=v.video_id where s.title=$1", [t])).rows[0].n;

const ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
const card = t => Array.from(ed.d.querySelectorAll("#queueList > .card")).find(c => c.textContent.includes(t));
const btn = (el, re) => el && Array.from(el.querySelectorAll("button")).find(b => re.test(b.textContent));

ed.d.querySelectorAll(".chip").forEach(c => { if (/revisions/i.test(c.textContent)) c.click(); }); await settle();
chk("sent-back video has No changes needed", !!btn(card("How to Sign up"), /No changes needed/));
btn(card("How to Sign up"), /No changes needed/).click(); await settle();
const pop = ed.d.getElementById("videoModalBox");
chk("it asks first, naming the same cut (v1), nothing to upload", /v1/.test(pop.textContent) && /Nothing to upload/.test(pop.textContent) && !pop.querySelector('input[type="file"]'));
ed.d.getElementById("ncYes").click(); await settle();
const r = await row("How to Sign up");
chk("sent to Tait for review, no new version saved, round count unchanged", r.status === "in_review" && (await versions("How to Sign up")) === 1 && r.client_revision_rounds === 1, r);
chk("says it's sent", /Sent to Tait/.test(ed.d.getElementById("videoModalBox").textContent));

ed.d.querySelectorAll(".chip").forEach(c => { if (/^To edit/.test(c.textContent.trim())) c.click(); }); await settle();
chk("a first cut doesn't get the button", !!card("First cut") && !btn(card("First cut"), /No changes needed/) && !!btn(card("First cut"), /Finished/));

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
chk("Tait sees it in Edits to review", op.d.querySelector('[data-stage="edits"]').textContent.includes("How to Sign up"));

chk("no page errors", !ed.ui.errors.length && !op.ui.errors.length, [ed.ui.errors, op.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
