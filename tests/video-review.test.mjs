// Frame.io-style review (migration 014): who can leave, read and delete
// notes pinned to moments in a finished video; notes closing when the
// video moves on; and the portal finding the finished file in Google Drive
// and streaming it into its own player.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { as, openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", ED2 = "00000000-0000-0000-0000-00000000000c";
const CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e";
const A = "d44e6fc3-dfea-42dc-902c-54724441040d", B = "e55e6fc3-dfea-42dc-902c-54724441040e";
const V1 = "11111111-1111-1111-1111-111111111111", V2 = "22222222-2222-2222-2222-222222222222", V3 = "33333333-3333-3333-3333-333333333333";
const FINAL = "https://drive.google.com/drive/folders/FinalEditsFolder01";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${ED2}'),('${CL}'),('${CL2}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x'),('${ED2}','Sam','s@x');
  update social_editors set setup_at = now();
  insert into social_clients (id,name,slug,client_system,contact_name) values ('${A}','Hesedea','hesedea','concierge','Mark'),('${B}','Other','other','self-serve',null);
  insert into social_client_users (id,client_id,email) values ('${CL}','${A}','a@x'),('${CL2}','${B}','b@x');
  insert into social_drive_folder_links (client_id, final_edits) values ('${A}','${FINAL}');
  insert into social_videos (id,client_id,title,status,editor_id,concept_approved_at,post_date) values
    ('${V1}','${A}','Editing','with_editor','${ED}',now(),'2026-10-20'),
    ('${V2}','${A}','Mark''s introduction','client_review','${ED}',now(),'2026-10-12'),
    ('${V3}','${B}','Other client','client_review',null,now(),'2026-10-14');
`);
const note = (uid, vid, role = "client", at = 12.5) => as(uid,
  "insert into social_video_comments (video_id, at_seconds, body, author_role) values ($1,$2,'Make the logo bigger',$3) returning id", [vid, at, role]);
const open = async vid => (await db.query(`select count(*)::int n from social_video_comments where video_id='${vid}' and closed_at is null`)).rows[0].n;

// Notes.
chk("the client leaves a note on the video they're reviewing", !(await note(CL, V2)).error);
chk("…not as someone else", !!(await note(CL, V2, "operator")).error);
chk("…not already closed", !!(await as(CL, "insert into social_video_comments (video_id, body, author_role, closed_at) values ($1,'x','client',now())", [V2])).error);
chk("…not on another client's video", !!(await note(CL, V3)).error);
chk("…not while it's not theirs to review", !!(await note(CL, V1)).error);
chk("a note needs words", !!(await as(CL, "insert into social_video_comments (video_id, body, author_role) values ($1,'  ','client')", [V2])).error);
chk("a whole-video note (no time) is fine", !(await note(CL, V2, "client", null)).error);
chk("the operator leaves notes too", !(await note(OP, V2, "operator")).error);
chk("an editor can't", !!(await note(ED, V2, "editor")).error);

const read = async uid => (await as(uid, `select author_role from social_video_comments where video_id='${V2}'`)).data || [];
chk("the client reads their video's notes", (await read(CL)).length === 3);
chk("another client reads none", (await read(CL2)).length === 0);
chk("the assigned editor reads them", (await read(ED)).length === 3);
chk("another editor reads none", (await read(ED2)).length === 0);

const opNote = (await db.query(`select id from social_video_comments where author_role='operator'`)).rows[0].id;
await as(CL, "delete from social_video_comments where id=$1", [opNote]);
chk("the client can't delete the operator's note", (await db.query(`select 1 from social_video_comments where id='${opNote}'`)).rows.length === 1);
const mine = (await db.query(`select id from social_video_comments where author_id='${CL}' and at_seconds is null`)).rows[0].id;
await as(CL, "delete from social_video_comments where id=$1", [mine]);
chk("…but deletes their own open one", (await db.query(`select 1 from social_video_comments where id='${mine}'`)).rows.length === 0);

// Closing: whichever way the video leaves review.
await as(CL, "select status from social_client_video_action(p_video_id => $1, p_action => 'request_revisions', p_note => '0:12  Make the logo bigger')", [V2]);
chk("sending changes closes every open note", (await open(V2)) === 0 && (await db.query(`select count(*)::int n from social_video_comments where video_id='${V2}' and closed_at is not null`)).rows[0].n === 2);
const kept = (await db.query(`select id from social_video_comments where author_id='${CL}'`)).rows[0].id;
await db.exec(`update social_videos set status='client_review' where id='${V2}'`);
await as(CL, "delete from social_video_comments where id=$1", [kept]);
chk("a closed note can't be deleted, even back in review", (await db.query(`select 1 from social_video_comments where id='${kept}'`)).rows.length === 1);
await note(CL, V2);
await db.exec(`update social_videos set status='ready_to_post' where id='${V2}'`);
chk("approving closes them too (the operator's direct update)", (await open(V2)) === 0);
await db.exec(`update social_videos set status='client_review' where id='${V2}'`);
await note(CL, V2);
await db.exec(`update social_videos set caption='x' where id='${V2}'`);
chk("an edit that isn't a status change leaves them open", (await open(V2)) === 1);

// Settings: the Drive key.
chk("an operator saves the Drive key", !(await as(OP, "insert into social_settings (key, value) values ('google_api_key','KEY123')")).error);
await as(CL, "update social_settings set value='x' where key='google_api_key'");
chk("a client can't change it", (await db.query("select value from social_settings where key='google_api_key'")).rows[0].value === "KEY123");
chk("everyone signed in can read it", (await as(CL, "select value from social_settings where key='google_api_key'")).data?.[0]?.value === "KEY123");

// The portal: finds the finished file in Drive and streams it.
const drive = [];
const fetchDrive = (url) => {
  drive.push(url);
  const q = decodeURIComponent((url.match(/[?&]q=([^&]+)/) || [])[1] || "");
  const folder = (q.match(/'([^']+)' in parents/) || [])[1];
  const files = {
    FinalEditsFolder01: [{ id: "oldcut0000", name: "Something else.mp4", mimeType: "video/mp4" },
      { id: "subfolder01", name: "01. Mark's introduction (posts Mon Oct 12)", mimeType: "application/vnd.google-apps.folder" }],
    subfolder01: [{ id: "notes00000", name: "notes.txt", mimeType: "text/plain" }, { id: "markcut0001", name: "Mark intro v2.mp4", mimeType: "video/mp4" }],
  }[folder] || [];
  return { ok: true, status: 200, json: async () => ({ files }) };
};
const p = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea", { fetch: fetchDrive });
const card = Array.from(p.d.querySelectorAll("#listFinal .card")).find(c => c.textContent.includes("Mark's introduction"));
chk("the final card: Review the video, no Request changes box", !!card && Array.from(card.querySelectorAll(".actions button")).map(b => b.textContent).join("|") === "Review the video|Approve for posting");
Array.from(card.querySelectorAll("button")).find(b => b.textContent === "Review the video").click(); await settle();
const box = p.d.getElementById("videoModalBox");
const vid = box.querySelector("video.rv-video");
chk("found the video in the folder named after it, and streams it from Drive",
  vid && vid.getAttribute("src") === "https://www.googleapis.com/drive/v3/files/markcut0001?alt=media&key=KEY123", [vid && vid.getAttribute("src"), drive]);
chk("asked Drive with the key", drive.length === 2 && drive.every(u => u.includes("key=KEY123")), drive);
chk("this round's open note is listed", box.querySelectorAll(".rv-note").length === 1);
// Once the player knows the length, times are automatic and notes are marks.
let t = 30;
vid.play = async () => {};
Object.defineProperty(vid, "duration", { get: () => 80 });
Object.defineProperty(vid, "currentTime", { get: () => t, set: x => { t = +x; vid.dispatchEvent(new p.w.Event("timeupdate")); } });
vid.pause = () => {};
vid.dispatchEvent(new p.w.Event("loadedmetadata")); await settle();
chk("the player tells the time: no typed time box", !box.classList.contains("rv-typed-mode") && box.querySelectorAll(".rv-mark").length === 1);
const ta = box.querySelector(".rv-compose textarea");
ta.dispatchEvent(new p.w.Event("focus"));
ta.value = "Cut this pause";
box.querySelector(".rv-add").click(); await settle();
const saved = (await db.query(`select at_seconds, cut_ref, author_name from social_video_comments where body='Cut this pause'`)).rows[0];
chk("the comment lands on the moment the video is on, on this cut, by Mark", saved && Number(saved.at_seconds) === 30 && saved.cut_ref === "markcut0001" && saved.author_name === "Mark", saved);
chk("…shows as a second mark, with his initials", box.querySelectorAll(".rv-mark").length === 2 && box.querySelector(`.rv-mark[data-t="30"]`)?.textContent === "M");
// A general comment, about the whole video.
box.querySelector(".rv-when-all").click();
ta.value = "Music is a bit loud overall";
box.querySelector(".rv-add").click(); await settle();
const general = (await db.query(`select at_seconds from social_video_comments where body='Music is a bit loud overall'`)).rows[0];
chk("Whole video: a general comment, no time, listed last, no mark", general && general.at_seconds === null
  && box.querySelector(".rv-note:last-child").textContent.includes("Whole video") && box.querySelectorAll(".rv-mark").length === 2);
chk("comments numbered in time order", Array.from(box.querySelectorAll(".rv-num")).map(n => n.textContent).join(",") === "#1,#2,#3");
box.querySelector(".rv-when-at").click();
t = 45;
ta.value = "Logo here";
box.querySelector(".rv-add").click(); await settle();
chk("back to At: pinned to where the playhead is now", Number((await db.query(`select at_seconds from social_video_comments where body='Logo here'`)).rows[0].at_seconds) === 45);
box.querySelector('.rv-time[data-t="30"]').click();
chk("clicking a comment's time jumps there and highlights it", t === 30 && box.querySelector(".rv-note.on .rv-time")?.dataset.t === "30");
const mk = Array.from(box.querySelectorAll(".rv-mark")).find(m => m.dataset.t === "45");
mk.click();
chk("clicking a mark on the bar jumps there too", t === 45 && box.querySelector(".rv-note.on").textContent.includes("Logo here"));
chk("the clock shows where it is", box.querySelector(".rv-clock").textContent === "0:45 / 1:20");
// Full screen where the page can't (an iPhone): the phone's own video player.
let native = false; vid.webkitEnterFullscreen = () => { native = true; };
box.querySelector(".rv-full").click();
chk("Full screen on a phone without page full screen uses the phone's own player", native);
// No sound decoded a couple of seconds in: offer Google's player.
Object.defineProperty(vid, "webkitAudioDecodedByteCount", { get: () => 0 });
t = 3; await settle();
chk("no sound: it offers Google's player", /No sound\?/.test(box.querySelector(".rv-stage").textContent));
box.querySelector(".rv-nosound button").click(); await settle();
chk("…which opens Drive's player for the same file", box.querySelector(".rv-stage iframe")?.getAttribute("src")?.includes("/file/d/markcut0001/preview"));
chk("no page errors", !p.ui.errors.length && !p.ui.alerts.length, [p.ui.errors, p.ui.alerts]);

// A link to the exact file skips the search; with no key, Drive's player.
await db.exec(`update social_videos set final_cut_url='https://drive.google.com/file/d/exactfile0001/view' where id='${V2}'; delete from social_settings;`);
const p2 = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea", { fetch: fetchDrive });
drive.length = 0;
Array.from(p2.d.querySelectorAll("#listFinal button")).find(b => b.textContent === "Review the video").click(); await settle();
const b2 = p2.d.getElementById("videoModalBox");
chk("no key: Drive's own player for the exact file, typed times", b2.querySelector("iframe.rv-frame")?.getAttribute("src") === "https://drive.google.com/file/d/exactfile0001/preview"
  && b2.classList.contains("rv-typed-mode") && !drive.length);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
if (counts.fail) process.exit(1);
