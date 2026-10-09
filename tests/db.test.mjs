import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

import { fileURLToPath } from "url";
const MIG = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const db = new PGlite();

// Minimal Supabase stand-ins: roles, auth.users, auth.uid(), default grants.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
for (const f of ["001_social_os_schema.sql", "002_social_videos_overview_body.sql", "003_social_videos_write_path.sql", "004_social_videos_final_cut_url.sql", "005_social_videos_on_screen_caption.sql", "006_client_journey.sql", "007_client_documents.sql", "017_revision_rounds.sql"]) {
  await db.exec(readFileSync(MIG + f, "utf8"));
}
// Re-running every migration, in order, is safe (006 replaces 003's client function again).
for (const f of ["003_social_videos_write_path.sql", "004_social_videos_final_cut_url.sql", "005_social_videos_on_screen_caption.sql", "006_client_journey.sql", "007_client_documents.sql", "017_revision_rounds.sql"]) {
  await db.exec(readFileSync(MIG + f, "utf8"));
}

const U = {
  op: "00000000-0000-0000-0000-00000000000a", ed: "00000000-0000-0000-0000-00000000000b",
  edOff: "00000000-0000-0000-0000-00000000000c", cl: "00000000-0000-0000-0000-00000000000d",
  clCon: "00000000-0000-0000-0000-00000000000e",
};
const C = { self: "11111111-1111-1111-1111-111111111111", con: "22222222-2222-2222-2222-222222222222" };
await db.exec(`
  insert into auth.users values ('${U.op}'),('${U.ed}'),('${U.edOff}'),('${U.cl}'),('${U.clCon}');
  insert into social_operators values ('${U.op}','Op','op@x');
  insert into social_editors (id,name,email,active) values ('${U.ed}','Ed','ed@x',true),('${U.edOff}','Off','off@x',false);
  insert into social_clients (id,name,slug,client_system) values ('${C.self}','Self','self','self-serve'),('${C.con}','Con','con','concierge');
  insert into social_client_users (id,client_id,email) values ('${U.cl}','${C.self}','cl@x'),('${U.clCon}','${C.con}','clc@x');
  insert into social_drive_folder_links (client_id, root) values ('${C.self}','r');
`);

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) pass++; else { fail++; console.log("FAIL:", name, extra ?? ""); } }

// Run SQL as a given user (or anon when uid is null), like PostgREST does.
async function as(uid, sql, params = []) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('role', $1, true)`, [uid ? "authenticated" : "anon"]);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(uid ? { sub: uid } : {})]);
    const r = await db.query(sql, params);
    await db.exec("commit");
    return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { await db.exec("rollback"); return { error: e.message }; }
}
const rpc = (uid, fn, args) => as(uid, `select (${fn}).status, (${fn}).note from (select 1) x`.replace(/\(\$\{fn\}\)/g, ""), args);
async function act(uid, video, action, note) {
  return as(uid, `select status, note, concept_approved_at from social_client_video_action($1,$2,$3)`, [video, action, note ?? null]);
}
async function statusF(v) { return (await db.query(`select filmed_by from social_videos where id=$1`, [v])).rows[0]; }
async function status(v) { return (await db.query(`select status, note, concept_approved_at, editor_id from social_videos where id=$1`, [v])).rows[0]; }
async function mkVideo(client, st, extra = "") {
  return (await db.query(`insert into social_videos (client_id, title, status ${extra ? "," + extra.split("=")[0] : ""}) values ($1,'t',$2 ${extra ? ",'" + extra.split("=")[1] + "'" : ""}) returning id`, [client, st])).rows[0].id;
}

// ── gate 1 ──
const v1 = await mkVideo(C.self, "concept_pending");
check("client can't see unapproved concept", (await as(U.cl, `select id from social_videos where id=$1`, [v1])).rows.length === 0);
check("client can't act on unapproved concept", /not found/i.test((await act(U.cl, v1, "approve_concept")).error));
check("client can't call operator gate-1 fn", /operator/i.test((await as(U.cl, `select * from social_operator_approve_concept($1)`, [v1])).error));
check("operator approves concept", !(await as(U.op, `select * from social_operator_approve_concept($1)`, [v1])).error);
check("double approve refused", /already approved/.test((await as(U.op, `select * from social_operator_approve_concept($1)`, [v1])).error));
check("client now sees concept", (await as(U.cl, `select id from social_videos where id=$1`, [v1])).rows.length === 1);

// ── no direct writes ──
const direct = await as(U.cl, `update social_videos set status='posted' where id=$1`, [v1]);
check("client direct update does nothing", !direct.error && direct.affected === 0 && (await status(v1)).status === "concept_pending", direct);
const directIns = await as(U.cl, `insert into social_videos (client_id,title) values ($1,'x')`, [C.self]);
check("client direct insert refused", !!directIns.error);

// ── request changes resets gate 1 ──
check("request changes needs note", /note is required/.test((await act(U.cl, v1, "request_concept_changes", "  ")).error));
const rc = await act(U.cl, v1, "request_concept_changes", "make it punchier");
check("request changes ok", !rc.error && rc.rows[0].status === "concept_pending" && rc.rows[0].concept_approved_at === null, rc);
check("concept hidden again after request changes", (await as(U.cl, `select id from social_videos where id=$1`, [v1])).rows.length === 0);

// ── self-serve happy path ──
await as(U.op, `select * from social_operator_approve_concept($1)`, [v1]);
check("illegal jump refused", /currently concept_pending/.test((await act(U.cl, v1, "approve_final")).error));
check("unknown action refused", /Unknown action/.test((await act(U.cl, v1, "post_it")).error));
check("new videos default to the client's system (self-serve → client films)", (await statusF(v1)).filmed_by === "client");
check("client-filmed: no approve step", /isn't part of how this video gets filmed/.test((await act(U.cl, v1, "approve_concept")).error));
await db.query(`update social_videos set post_date = current_date + 30 where id=$1`, [v1]);
const sf = await act(U.cl, v1, "submit_footage");
check("video has been filmed → straight to editing", sf.rows?.[0].status === "ready_to_edit", sf);
const dates = (await db.query(`select due_to_edit = current_date + 7 as edit7, post_date = current_date + 30 as keptplan from social_videos where id=$1`, [v1])).rows[0];
check("edit due 7 days after filming; later planned post date kept", dates.edit7 && dates.keptplan, dates);
const vLate = await mkVideo(C.self, "to_film");
await db.query(`update social_videos set post_date = current_date + 3 where id=$1`, [vLate]);
await act(U.cl, vLate, "submit_footage");
check("post date pushed to 14 days after filming when the plan was sooner", (await db.query(`select post_date = current_date + 14 as ok from social_videos where id=$1`, [vLate])).rows[0].ok);
const vUs = await mkVideo(C.self, "concept_pending", "filmed_by=us");
await as(U.op, `select * from social_operator_approve_concept($1)`, [vUs]);
check("we-film video: client can't submit footage", /isn't part of how/.test((await act(U.cl, vUs, "submit_footage")).error));
check("we-film video: client approves idea", (await act(U.cl, vUs, "approve_concept")).rows?.[0].status === "to_film");
await db.query(`update social_videos set filmed_by = null where id=$1`, [vUs]);
check("clearing who-films falls back to the client's default", (await statusF(vUs)).filmed_by === "client");
check("note preserved from earlier request", (await status(v1)).note === "make it punchier");

// ── reject ──
const v2 = await mkVideo(C.self, "to_film");
check("reject needs note", /note is required/.test((await act(U.cl, v2, "reject")).error));
check("reject with note", (await act(U.cl, v2, "reject", "not for us")).rows?.[0].status === "rejected");

// ── cross-client ──
const vCon = await mkVideo(C.con, "to_film");
check("client can't act on another client's video", /not found/i.test((await act(U.cl, vCon, "mark_filmed")).error));

// ── concierge ──
check("concierge videos default to we film", (await statusF(vCon)).filmed_by === "us");
check("concierge (we film) can't mark filmed", /isn't part of how/.test((await act(U.clCon, vCon, "mark_filmed")).error));
const vCon2 = await mkVideo(C.con, "client_review");
check("concierge request revisions needs note", /note is required/.test((await act(U.clCon, vCon2, "request_revisions")).error));
check("concierge request revisions", (await act(U.clCon, vCon2, "request_revisions", "cut the intro")).rows?.[0].status === "with_editor");

// ── editor ──
const v3 = await mkVideo(C.self, "ready_to_edit");
await as(U.op, `update social_videos set status='with_editor', editor_id=$2 where id=$1`, [v3, U.ed]);
check("editor sees assigned video", (await as(U.ed, `select id from social_videos where id=$1`, [v3])).rows.length === 1);
check("editor sees assigned client", (await as(U.ed, `select id from social_clients where id=$1`, [C.self])).rows.length === 1);
check("editor sees drive links", (await as(U.ed, `select client_id from social_drive_folder_links where client_id=$1`, [C.self])).rows.length === 1);
const edDirect = await as(U.ed, `update social_videos set status='posted' where id=$1`, [v3]);
check("editor direct update does nothing", !edDirect.error && edDirect.affected === 0, edDirect);
check("client can't mark delivered", /active editor/.test((await as(U.cl, `select * from social_editor_mark_delivered($1)`, [v3])).error));
check("editor marks delivered", (await as(U.ed, `select status from social_editor_mark_delivered($1)`, [v3])).rows?.[0].status === "in_review");
check("editor can't deliver twice", /currently in_review/.test((await as(U.ed, `select * from social_editor_mark_delivered($1)`, [v3])).error));

// ── inactive editor ──
const v4 = await mkVideo(C.self, "ready_to_edit");
await as(U.op, `update social_videos set status='with_editor', editor_id=$2 where id=$1`, [v4, U.edOff]);
check("inactive editor sees no videos", (await as(U.edOff, `select id from social_videos`)).rows.length === 0);
check("inactive editor sees no clients", (await as(U.edOff, `select id from social_clients`)).rows.length === 0);
check("inactive editor sees no drive links", (await as(U.edOff, `select client_id from social_drive_folder_links`)).rows.length === 0);
check("inactive editor still reads own row", (await as(U.edOff, `select active from social_editors`)).rows.length === 1);
check("inactive editor can't deliver", /active editor/.test((await as(U.edOff, `select * from social_editor_mark_delivered($1)`, [v4])).error));

// ── gate 2/3 via operator direct, then client final approve ──
await as(U.op, `update social_videos set status='client_review' where id=$1`, [v3]);
await db.query(`update social_videos set caption='Old caption', on_screen_caption='Old on-screen' where id=$1`, [v3]);
const fa = await as(U.cl, `select status, caption, on_screen_caption from social_client_video_action($1,'approve_final',null,$2,$3)`, [v3, "New caption", "  "]);
check("client final approve with caption edit (blank on-screen = unchanged)", fa.rows?.[0].status === "ready_to_post" && fa.rows[0].caption === "New caption" && fa.rows[0].on_screen_caption === "Old on-screen", fa);

// ── documents ──
await db.exec(`insert into social_client_documents (client_id, title, url, position) values
  ('${C.self}','Brand Voice','https://docs/voice',0), ('${C.con}','Con doc','https://docs/con',0);`);
check("client reads only their own documents", (await as(U.cl, `select title from social_client_documents`)).rows.map(r => r.title).join() === "Brand Voice");
const docIns = await as(U.cl, `insert into social_client_documents (client_id,title,url) values ($1,'x','https://x')`, [C.self]);
check("client can't add documents", !!docIns.error);
const docUpd = await as(U.cl, `update social_client_documents set url='https://evil' where client_id=$1`, [C.self]);
check("client can't change documents", !docUpd.error && docUpd.affected === 0);
check("editor doesn't see client documents", (await as(U.ed, `select id from social_client_documents`)).rows.length === 0);
check("operator sees all documents", (await as(U.op, `select id from social_client_documents`)).rows.length === 2);
check("anon sees no documents", !!(await as(null, `select id from social_client_documents`)).error || (await as(null, `select id from social_client_documents`)).rows.length === 0);

// ── invites ──
const inv = { ok: "00000000-0000-0000-0000-0000000000f1", unconfirmed: "00000000-0000-0000-0000-0000000000f2", stranger: "00000000-0000-0000-0000-0000000000f3" };
await db.exec(`
  update social_clients set contact_name='Pat', contact_email='Pat@Client.com' where id='${C.self}';
  insert into auth.users (id, email, email_confirmed_at) values
    ('${inv.ok}','pat@client.com', now()), ('${inv.unconfirmed}','pat@client.com', null), ('${inv.stranger}','who@else.com', now());
  update auth.users set email='op@x', email_confirmed_at=now() where id='${U.op}';
  update social_clients set contact_email='op@x' where id='${C.con}';
`);
check("unconfirmed email can't claim", (await as(inv.unconfirmed, `select social_claim_client_invite() c`)).rows[0].c === null);
check("stranger can't claim", (await as(inv.stranger, `select social_claim_client_invite() c`)).rows[0].c === null);
check("operator is never linked as a client", (await as(U.op, `select social_claim_client_invite() c`)).rows[0].c === null);
check("invited contact claims their client (email case ignored)", (await as(inv.ok, `select social_claim_client_invite() c`)).rows[0].c === C.self);
check("…and now sees that client's portal row", (await as(inv.ok, `select id from social_clients`)).rows.map(r => r.id).join() === C.self);
check("claiming twice is harmless", (await as(inv.ok, `select social_claim_client_invite() c`)).rows[0].c === C.self);
check("anon can't claim", /permission denied/.test((await as(null, `select social_claim_client_invite()`)).error));

// ── anon ──
check("anon can't call client fn", /permission denied/.test((await as(null, `select * from social_client_video_action($1,'approve_concept',null)`, [v1])).error));
check("anon can't call editor fn", /permission denied/.test((await as(null, `select * from social_editor_mark_delivered($1)`, [v1])).error));
check("anon can't call operator fn", /permission denied/.test((await as(null, `select * from social_operator_approve_concept($1)`, [v1])).error));

// ── audit log ──
const log = (await as(U.op, `select action, from_status, to_status, note, changed_by_role from social_status_audit_log where video_id=$1 order by id`, [v1])).rows;
const actions = log.map(r => r.action).join(",");
check("audit log sequence for v1",
  actions === "created,approve_concept,request_concept_changes,approve_concept,submit_footage", actions);
check("audit log roles", log.map(r => r.changed_by_role).join(",") === ",operator,client,operator,client", log.map(r => r.changed_by_role).join(","));
check("audit log keeps note", log[2].note === "make it punchier");
check("operator direct update logged", (await as(U.op, `select action from social_status_audit_log where video_id=$1 and action='direct_update'`, [v3])).rows.length === 2);
check("editor delivery logged as editor", (await as(U.op, `select 1 from social_status_audit_log where video_id=$1 and action='mark_delivered' and changed_by_role='editor'`, [v3])).rows.length === 1);
check("client can't read audit log", (await as(U.cl, `select id from social_status_audit_log`)).rows.length === 0);
check("client can't write audit log", !!(await as(U.cl, `insert into social_status_audit_log (video_id,client_id,action,to_status) values ($1,$2,'x','posted')`, [v1, C.self])).error);
check("anon can't read audit log", (await as(null, `select id from social_status_audit_log`)).rows?.length === 0);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
