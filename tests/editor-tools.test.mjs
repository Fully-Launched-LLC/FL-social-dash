// Editor tools (migration 016): tick off each revision, replies, the check
// before Finished, versions, and "done this month".
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { as, openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", ED2 = "00000000-0000-0000-0000-00000000000c";
const CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e";
const A = "d44e6fc3-dfea-42dc-902c-54724441040d", B = "e55e6fc3-dfea-42dc-902c-54724441040e";
const V1 = "11111111-1111-1111-1111-111111111111", V2 = "22222222-2222-2222-2222-222222222222", V3 = "33333333-3333-3333-3333-333333333333";
const C1 = "aaaaaaaa-0000-0000-0000-000000000001", C2 = "aaaaaaaa-0000-0000-0000-000000000002", C3 = "aaaaaaaa-0000-0000-0000-000000000003";
const FINAL = "https://drive.google.com/drive/folders/FinalEditsFolder01";
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${ED2}'),('${CL}'),('${CL2}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email,setup_at) values ('${ED}','Morgan','m@x',now()),('${ED2}','Sam','s@x',now());
  insert into social_clients (id,name,slug,client_system,contact_name) values ('${A}','Hesedea','hesedea','concierge','Mark'),('${B}','Other','other','self-serve',null);
  insert into social_client_users (id,client_id,email) values ('${CL}','${A}','a@x'),('${CL2}','${B}','b@x');
  insert into social_drive_folder_links (client_id, final_edits, footage_uploads) values ('${A}','${FINAL}','https://drive.google.com/drive/folders/RawFolder0001');
  insert into social_videos (id,client_id,title,status,editor_id,concept_approved_at,due_to_edit,editor_brief) values
    ('${V1}','${A}','Mark''s introduction','with_editor','${ED}',now(),'${iso(2)}','{"revisions":"0:04  Start on the smile\\nWhole video  Quieter music"}'),
    ('${V2}','${A}','Second video','client_review','${ED}',now(),'${iso(5)}','{}'),
    ('${V3}','${B}','Other client video','with_editor','${ED2}',now(),'${iso(3)}','{}');
  insert into social_video_comments (id,video_id,cut_ref,at_seconds,body,author_role,author_name,author_id,closed_at,created_at) values
    ('${C1}','${V1}','oldcut00001',4,'Start on the smile','client','Mark','${CL}',now(),now() - interval '1 hour'),
    ('${C2}','${V1}','oldcut00001',null,'Quieter music','client','Mark','${CL}',now(),now() - interval '50 minutes'),
    ('${C3}','${V2}','cutv2000001',7,'Logo sooner','client','Mark','${CL}',null,now());
`);
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];

// ── Ticks (social_resolve_comment) ──
const fix = (uid, id, done = true) => as(uid, "select resolved_at from social_resolve_comment(p_comment_id => $1, p_done => $2)", [id, done]);
chk("the video's editor ticks a comment fixed", !(await fix(ED, C1)).error && !!(await one(`select resolved_at from social_video_comments where id='${C1}'`)).resolved_at);
chk("…and unticks it", !(await fix(ED, C1, false)).error && !(await one(`select resolved_at from social_video_comments where id='${C1}'`)).resolved_at);
chk("another editor can't", !!(await fix(ED2, C1)).error);
chk("a client can't", !!(await fix(CL, C1)).error);
chk("not once it's left the editor", !!(await fix(ED, C3)).error);
chk("an operator can", !(await fix(OP, C3)).error && !(await fix(OP, C3, false)).error);

// ── Replies ──
const reply = (uid, parent, vid, role) => as(uid, "insert into social_video_comments (video_id, parent_id, body, author_role) values ($1,$2,'Which logo?',$3) returning id", [vid, parent, role]);
chk("the editor replies on their video", !(await reply(ED, C1, V1, "editor")).error);
chk("…but can't leave a new top-level comment", !!(await as(ED, "insert into social_video_comments (video_id, body, author_role) values ($1,'x','editor')", [V1])).error);
chk("another editor can't reply", !!(await reply(ED2, C1, V1, "editor")).error);
chk("the client replies while reviewing", !(await reply(CL, C3, V2, "client")).error);
chk("…not on another client's video", !!(await reply(CL2, C3, V2, "client")).error);

// ── Versions (social_add_video_version) ──
const addV = (uid, vid, file) => as(uid, "select version from social_add_video_version(p_video_id => $1, p_file_id => $2, p_file_name => 'cut.mp4')", [vid, file]);
let r = await addV(ED, V1, "cutv1000001");
chk("the editor saves v1", !r.error && r.data[0].version === 1, r);
r = await addV(OP, V1, "cutv2000001");
chk("…then v2 (an operator can too)", !r.error && r.data[0].version === 2, r);
chk("another editor can't", !!(await addV(ED2, V1, "x")).error);
chk("a client can't", !!(await addV(CL, V1, "x")).error);
chk("not once it's left the editor", !!(await addV(ED, V2, "x")).error);
const vread = async uid => ((await as(uid, `select version from social_video_versions where video_id='${V1}'`)).data || []).length;
chk("the client reads their video's versions, another client none", (await vread(CL)) === 2 && (await vread(CL2)) === 0);
chk("its editor reads them, another editor none", (await vread(ED)) === 2 && (await vread(ED2)) === 0);
await db.exec(`delete from social_video_versions where video_id='${V1}'`);

// ── The editor's page ──
// Drive (the check before Finished), answered per folder.
let DRIVE = { FinalEditsFolder01: [] };
const fetchDrive = url => {
  const q = decodeURIComponent((url.match(/[?&]q=([^&]+)/) || [])[1] || "");
  const folder = (q.match(/'([^']+)' in parents/) || [])[1];
  return { ok: true, status: 200, json: async () => ({ files: DRIVE[folder] || [] }) };
};
await db.exec(`insert into social_settings (key, value) values ('google_api_key','KEY123');
  insert into social_video_versions (video_id, version, file_id, file_name, created_by, created_at) values
    ('${V2}', 1, 'cutv1000002', 'second v1.mp4', '${ED}', now() - interval '3 days'),
    ('${V2}', 2, 'cutv2000001', 'second v2.mp4', '${ED}', now() - interval '1 day');`);
const ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html", { fetch: fetchDrive });
const card = () => Array.from(ed.d.querySelectorAll("#queueList > .card")).find(c => c.textContent.includes("Mark's introduction"));
const box = () => card().querySelector(".ed-revisions");
chk("Revisions needed lists each comment with a Fixed tick, and 0 of 2 fixed", box().querySelectorAll("[data-fix]").length === 2 && box().textContent.includes("0 of 2 fixed")
  && /Start on the smile/.test(box().textContent) && box().textContent.includes("1 reply"), box() && box().textContent.replace(/\s+/g, " "));
const tick = box().querySelector(`[data-fix="${C1}"]`);
tick.checked = true; tick.dispatchEvent(new ed.w.Event("change")); await settle();
chk("ticking saves it and the count goes to 1 of 2", !!(await one(`select resolved_at from social_video_comments where id='${C1}'`)).resolved_at && box().textContent.includes("1 of 2 fixed"));
chk("this month: 1 video finished, 1 revision round (from their versions)", /This month: 1 video finished · 1 revision round/.test(ed.d.getElementById("monthStat").textContent), ed.d.getElementById("monthStat").textContent);

// Watch with the comments: replies, and a reply from the editor.
box().querySelector("[data-notes]").click(); await settle();
const rv = () => ed.d.getElementById("videoModalBox");
chk("the window shows each comment's replies, ticks and a Reply button", rv().querySelectorAll(".rv-reply").length === 1 && rv().querySelectorAll(".rv-fix input").length === 2 && rv().querySelectorAll("[data-reply]").length === 2);
rv().querySelector(`[data-reply="${C2}"]`).click();
rv().querySelector(`[data-reply-box="${C2}"] textarea`).value = "How much quieter?";
rv().querySelector(`[data-reply-send="${C2}"]`).click(); await settle();
const rep = await one(`select author_role, author_name, video_id from social_video_comments where parent_id='${C2}'`);
chk("the editor's reply is saved under that comment, as them", rep && rep.author_role === "editor" && rep.author_name === "Morgan" && rep.video_id === V1, rep);
ed.w.closeVideoModal();

// Finished: nothing in the folder yet.
const finish = () => Array.from(card().querySelectorAll("button")).find(b => /Finished/.test(b.textContent));
finish().click(); await settle();
const pop = () => ed.d.getElementById("videoModalBox");
chk("Finished checks the folder: nothing there yet, so it won't send", /can't see a finished video/.test(pop().textContent) && ed.d.getElementById("efYes").disabled && !ed.d.getElementById("efAgain").hidden);
DRIVE.FinalEditsFolder01 = [{ id: "newcut00001", name: "Mark's introduction v1.mov", mimeType: "video/quicktime", modifiedTime: new Date().toISOString() }];
ed.d.getElementById("efAgain").click(); await settle();
chk("uploaded: Check again finds it, as v1", /Found Mark's introduction v1.mov/.test(pop().textContent) && /v1/.test(pop().textContent) && !ed.d.getElementById("efYes").disabled, pop().textContent.replace(/\s+/g, " "));
ed.d.getElementById("efYes").click(); await settle();
const v = await one(`select version, file_id, file_name, created_by from social_video_versions where video_id='${V1}'`);
chk("sending saves v1 with that file, by the editor, and sends it", v && v.version === 1 && v.file_id === "newcut00001" && v.created_by === ED && (await one(`select status from social_videos where id='${V1}'`)).status === "in_review", v);

// Back with changes, and the same file again.
await db.exec(`update social_videos set status='with_editor', editor_brief='{"revisions":"0:02  Tighter"}' where id='${V1}'`);
const ed2 = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html", { fetch: fetchDrive });
DRIVE.FinalEditsFolder01 = [{ id: "newcut00001", name: "Mark's introduction v1.mov", mimeType: "video/quicktime", modifiedTime: new Date(Date.now() - 3600e3).toISOString() }];
Array.from(Array.from(ed2.d.querySelectorAll("#queueList > .card")).find(c => c.textContent.includes("Mark's introduction")).querySelectorAll("button")).find(b => /Finished/.test(b.textContent)).click(); await settle();
chk("the same file as v1: it says so and won't send", /same file you sent as/.test(ed2.d.getElementById("videoModalBox").textContent) && ed2.d.getElementById("efYes").disabled);
chk("no page errors (editor)", !ed.ui.errors.length && !ed2.ui.errors.length && !ed.ui.alerts.length, [ed.ui.errors, ed2.ui.errors, ed.ui.alerts]);

// ── Versions in the review window (the client's) ──
await db.exec(`insert into social_video_comments (video_id,cut_ref,at_seconds,body,author_role,author_name,author_id,closed_at) values ('${V2}','cutv1000002',3,'Old note on v1','client','Mark','${CL}',now() - interval '2 days')`);
const cp = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea", { fetch: fetchDrive });
Array.from(cp.d.querySelectorAll("#listFinal .card")).find(c => c.textContent.includes("Second video")).querySelector("[data-review]").click(); await settle();
const cb = () => cp.d.getElementById("videoModalBox");
const sel = cb().querySelector(".rv-version");
chk("the review window has a version picker, on v2 (latest)", !!sel && sel.value === "2" && Array.from(sel.options).map(o => o.textContent.slice(0, 2)).join(",") === "v2,v1");
chk("…playing the latest version's file", cb().querySelector("video.rv-video")?.getAttribute("src").includes("/files/cutv2000001?alt=media"));
chk("…with this round's comments and the client's reply under it", /Logo sooner/.test(cb().querySelector(".rv-list").textContent) && cb().querySelectorAll(".rv-reply").length === 1);
sel.value = "1"; sel.dispatchEvent(new cp.w.Event("change")); await settle();
chk("picking v1 plays that cut with the comments left on it, read only", /earlier cut/.test(cb().textContent) && /Old note on v1/.test(cb().querySelector(".rv-list").textContent)
  && !/Logo sooner/.test(cb().querySelector(".rv-list").textContent) && !cb().querySelector(".rv-compose") && cb().querySelector("video.rv-video")?.getAttribute("src").includes("/files/cutv1000002?alt=media"));
chk("no page errors (client)", !cp.ui.errors.length, cp.ui.errors);

// ── The operator ──
await db.exec(`update social_videos set status='in_review' where id='${V1}'`);
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html", { fetch: fetchDrive });
op.d.querySelector('[data-stage-tab="edits"]')?.click(); await settle();
chk("Edit review rows show how many revisions are ticked fixed", Array.from(op.d.querySelectorAll(".vrow")).some(r => r.textContent.includes("Mark's introduction") && r.textContent.includes("Revisions: 1 of 2 fixed")),
  Array.from(op.d.querySelectorAll(".vrow")).map(r => r.textContent.replace(/\s+/g, " ").slice(0, 120)));
op.d.querySelector('.nav-item[data-view="editors"]')?.click(); await settle();
const morgan = Array.from(op.d.querySelectorAll("#editorsList .row")).find(r => r.textContent.includes("Morgan"));
chk("the Editors page shows each editor's month", morgan && /This month: 2 videos finished · 1 revision round/.test(morgan.textContent), morgan && morgan.textContent.replace(/\s+/g, " "));
chk("no page errors (operator)", !op.ui.errors.length, op.ui.errors);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
if (counts.fail) process.exit(1);
