// Frame.io-style review (migration 014): who can upload a cut, and who can
// leave, read and delete notes pinned to moments in it.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", ED2 = "00000000-0000-0000-0000-00000000000c";
const CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e";
const A = "d44e6fc3-dfea-42dc-902c-54724441040d", B = "e55e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${ED2}'),('${CL}'),('${CL2}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x'),('${ED2}','Sam','s@x');
  update social_editors set setup_at = now();
  insert into social_clients (id,name,slug,client_system) values ('${A}','Hesedea','hesedea','concierge'),('${B}','Other','other','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${A}','a@x'),('${CL2}','${B}','b@x');
  insert into social_videos (id,client_id,title,status,editor_id,concept_approved_at) values
    ('11111111-1111-1111-1111-111111111111','${A}','Editing','with_editor','${ED}',now()),
    ('22222222-2222-2222-2222-222222222222','${A}','Reviewing','client_review','${ED}',now()),
    ('33333333-3333-3333-3333-333333333333','${B}','Other client','client_review',null,now());
`);
const V1 = "11111111-1111-1111-1111-111111111111", V2 = "22222222-2222-2222-2222-222222222222", V3 = "33333333-3333-3333-3333-333333333333";
const setCut = (uid, vid, path) => as(uid, "select review_video_path from social_set_review_video(p_video_id => $1, p_path => $2, p_name => 'cut.mp4')", [vid, path]);
const note = (uid, vid, path, role = "client", at = 12.5) => as(uid,
  "insert into social_video_comments (video_id, video_path, at_seconds, body, author_role) values ($1,$2,$3,'Make the logo bigger',$4) returning id", [vid, path, at, role]);

// Uploading a cut.
const P1 = `${A}/${V1}/1-cut.mp4`, P2 = `${A}/${V2}/1-cut.mp4`, P3 = `${B}/${V3}/1-cut.mp4`;
chk("the assigned editor sets the cut while editing", !(await setCut(ED, V1, P1)).error);
chk("another editor can't", !!(await setCut(ED2, V1, P1)).error);
chk("the editor can't once it's left them", !!(await setCut(ED, V2, P2)).error);
chk("a client can't", !!(await setCut(CL, V2, P2)).error);
chk("the file must be in this video's folder", !!(await setCut(OP, V2, `${A}/${V1}/x.mp4`)).error && !!(await setCut(OP, V2, `x/${V2}/x.mp4`)).error);
chk("the operator can, any time", !(await setCut(OP, V2, P2)).error && !(await setCut(OP, V3, P3)).error);
const v2 = (await db.query(`select review_video_path, review_video_name, review_video_at from social_videos where id='${V2}'`)).rows[0];
chk("path, name and time saved", v2.review_video_path === P2 && v2.review_video_name === "cut.mp4" && !!v2.review_video_at, v2);

// Notes.
chk("the client leaves a note on the cut they're reviewing", !(await note(CL, V2, P2)).error);
chk("…not on an older cut", !!(await note(CL, V2, `${A}/${V2}/0-old.mp4`)).error);
chk("…not as someone else", !!(await note(CL, V2, P2, "operator")).error);
chk("…not on another client's video", !!(await note(CL, V3, P3)).error);
chk("…not while it's not theirs to review", !!(await note(CL, V1, P1)).error);
chk("a note needs words", !!(await as(CL, "insert into social_video_comments (video_id, video_path, body, author_role) values ($1,$2,'  ','client')", [V2, P2])).error);
chk("a whole-video note (no time) is fine", !(await note(CL, V2, P2, "client", null)).error);
chk("the operator leaves notes too", !(await note(OP, V2, P2, "operator")).error);
chk("an editor can't", !!(await note(ED, V2, P2, "editor")).error);

const read = async uid => (await as(uid, `select author_role from social_video_comments where video_id='${V2}'`)).data || [];
chk("the client reads their video's notes", (await read(CL)).length === 3);
chk("another client reads none", (await read(CL2)).length === 0);
chk("the assigned editor reads them", (await read(ED)).length === 3);
chk("another editor reads none", (await read(ED2)).length === 0);

// Deleting: only their own, only while reviewing.
const opNote = (await db.query(`select id from social_video_comments where author_role='operator'`)).rows[0].id;
await as(CL, "delete from social_video_comments where id=$1", [opNote]);
chk("the client can't delete the operator's note", (await db.query(`select 1 from social_video_comments where id='${opNote}'`)).rows.length === 1);
const mine = (await db.query(`select id from social_video_comments where author_id='${CL}' limit 1`)).rows[0].id;
await db.exec(`update social_videos set status='with_editor' where id='${V2}'`);
await as(CL, "delete from social_video_comments where id=$1", [mine]);
chk("…nor their own once the changes are sent", (await db.query(`select 1 from social_video_comments where id='${mine}'`)).rows.length === 1);
await db.exec(`update social_videos set status='client_review' where id='${V2}'`);
await as(CL, "delete from social_video_comments where id=$1", [mine]);
chk("…but can while reviewing", (await db.query(`select 1 from social_video_comments where id='${mine}'`)).rows.length === 0);

chk("deleting the video deletes its notes", await (async () => {
  await db.exec(`delete from social_videos where id='${V2}'`);
  return (await db.query(`select count(*)::int n from social_video_comments where video_id='${V2}'`)).rows[0].n === 0;
})());

console.log(`${counts.pass} passed, ${counts.fail} failed`);
if (counts.fail) process.exit(1);
