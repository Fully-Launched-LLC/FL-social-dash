// Migration 026 (Unify the System, Phase 1): the Content Idea Database,
// scripting statuses, the 5 client documents, style assets, the footage
// library and the agent room. Checks who can read and write what, signed in
// as each role, including a test client trying to read operator-only data.
import { freshDb, makeHarness, checker, REPO } from "./harness.mjs";
import { readFileSync } from "fs";

const db = await freshDb();
const { as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d",
      CL2 = "00000000-0000-0000-0000-00000000000f", ED = "00000000-0000-0000-0000-00000000000e";
const GG = "11111111-1111-1111-1111-111111111111", FL = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}'),('${CL2}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Ed','ed@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','gg','self-serve'),('${FL}','Fully Launched','fl','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x'),('${CL2}','${FL}','fl@x');
`);
const ok = r => !r.error;
const n = r => (r.data || []).length;

// Re-running 026 is safe.
await db.exec(readFileSync(REPO + "supabase/migrations/026_unified_pipeline.sql", "utf8"));
chk("026 re-runs cleanly", true);

// ── Ideas + monthly plan (operator only) ──
let r = await as(OP, `insert into social_monthly_plans (client_id, month) values ($1, '2026-11-01') returning id`, [GG]);
chk("operator makes a monthly plan", ok(r) && n(r) === 1, r);
const plan = r.data[0].id;
r = await as(OP, `insert into social_ideas (client_id, title, source, format, why, plan_id, status) values ($1,'Leaf rules','research','F5 local guide','city page, seasonal',$2,'in_plan') returning id`, [GG, plan]);
chk("operator adds an idea to the plan", ok(r) && n(r) === 1, r);
const idea = r.data[0].id;
chk("operator approves the idea", ok(await as(OP, `update social_ideas set status='approved' where id=$1`, [idea])));
const log = await db.query(`select action, from_status, to_status from social_status_audit_log where idea_id=$1 order by id`, [idea]);
chk("idea status changes are logged", log.rows.length === 2 && log.rows[1].from_status === "in_plan" && log.rows[1].to_status === "approved", log.rows);
chk("client can't read ideas", n(await as(CL, `select * from social_ideas`)) === 0);
chk("client can't read monthly plans", n(await as(CL, `select * from social_monthly_plans`)) === 0);
chk("client can't add ideas", !ok(await as(CL, `insert into social_ideas (client_id,title) values ($1,'x')`, [GG])));
chk("editor can't read ideas", n(await as(ED, `select * from social_ideas`)) === 0);
chk("bad idea status refused", !ok(await as(OP, `update social_ideas set status='maybe' where id=$1`, [idea])));

// ── Video card born from the idea: scripting → script review → client ──
r = await as(OP, `insert into social_videos (client_id, title, status, idea_id, hook, body, outline, camera_questions, filmed_by) values ($1,'Leaf rules','scripting',$2,'h','s','o','q','client') returning id`, [GG, idea]);
chk("operator creates a card in Scripting", ok(r) && n(r) === 1, r);
const vid = r.data[0].id;
chk("client can't see a card in Scripting", n(await as(CL, `select id from social_videos where id=$1`, [vid])) === 0);
chk("operator moves it to Script review", ok(await as(OP, `update social_videos set status='script_review' where id=$1`, [vid])));
chk("client can't see a card in Script review", n(await as(CL, `select id from social_videos where id=$1`, [vid])) === 0);
chk("client can't update a card in Script review", n(await as(CL, `update social_videos set title='x' where id=$1 returning id`, [vid])) === 0);
chk("operator sends it (concept_pending, unstamped): still hidden", ok(await as(OP, `update social_videos set status='concept_pending' where id=$1`, [vid])) && n(await as(CL, `select id from social_videos where id=$1`, [vid])) === 0);
chk("gate 1 approval shows it to the client", ok(await as(OP, `select * from social_operator_approve_concept($1)`, [vid])) && n(await as(CL, `select id from social_videos where id=$1`, [vid])) === 1);
r = await as(CL, `select hook, body, outline, camera_questions from social_videos where id=$1`, [vid]);
chk("client sees the whole card: hook, script, outline, camera questions", r.data?.[0]?.hook === "h" && r.data[0].body === "s" && r.data[0].outline === "o" && r.data[0].camera_questions === "q", r.data);
chk("other client can't see it", n(await as(CL2, `select id from social_videos where id=$1`, [vid])) === 0);
const vlog = await db.query(`select from_status, to_status from social_status_audit_log where video_id=$1 order by id`, [vid]);
chk("card status changes are logged", vlog.rows.some(x => x.from_status === "scripting" && x.to_status === "script_review"), vlog.rows);
chk("bad video status refused", !ok(await as(OP, `update social_videos set status='maybe' where id=$1`, [vid])));

// ── The 5 documents: operator-only, except approved brand guidelines ──
for (const k of ["brand_guidelines", "icp", "identity", "editing_guidelines", "content_research"])
  chk(`operator saves ${k}`, ok(await as(OP, `insert into social_client_generated_docs (client_id, kind, title, body_md, status) values ($1,$2,$2,'body','approved')`, [GG, k])));
chk("unknown document kind refused", !ok(await as(OP, `insert into social_client_generated_docs (client_id, kind, title, body_md) values ($1,'secrets','x','y')`, [GG])));
r = await as(CL, `select kind from social_client_generated_docs`);
chk("client reads only their approved brand guidelines", n(r) === 1 && r.data[0].kind === "brand_guidelines", r.data);
chk("other client reads none of them", n(await as(CL2, `select kind from social_client_generated_docs`)) === 0);
chk("editor reads none of them", n(await as(ED, `select kind from social_client_generated_docs`)) === 0);
await as(OP, `update social_client_generated_docs set status='draft' where kind='brand_guidelines'`);
chk("draft brand guidelines are hidden from the client", n(await as(CL, `select kind from social_client_generated_docs`)) === 0);
chk("client can't write documents", !ok(await as(CL, `insert into social_client_generated_docs (client_id, kind, title, body_md) values ($1,'icp','x','y')`, [GG])) );
chk("client can't approve documents", n(await as(CL, `update social_client_generated_docs set status='approved' returning id`)) === 0);

// ── Style assets: operator only ──
chk("operator adds shared music", ok(await as(OP, `insert into social_style_assets (kind, name, path, tags) values ('music','Arrival of the Birds','editor/public/clients/_music/cinematic/x.mp3','{warm,hopeful}')`)));
chk("operator adds shared sfx", ok(await as(OP, `insert into social_style_assets (kind, name) values ('sfx','Deep impact')`)));
chk("client can't read style assets", n(await as(CL, `select * from social_style_assets`)) === 0);
chk("editor can't read style assets (agents use the bridge)", n(await as(ED, `select * from social_style_assets`)) === 0);

// ── Footage library ──
chk("client adds b-roll to their library", ok(await as(CL, `insert into social_footage (client_id, kind, name, drive_url) values ($1,'broll','office.mov','https://drive/x')`, [GG])));
chk("client adds raw footage to their card", ok(await as(CL, `insert into social_footage (client_id, video_id, kind, name) values ($1,$2,'raw','take1.mov')`, [GG, vid])));
chk("client can't add a finished cut", !ok(await as(CL, `insert into social_footage (client_id, kind, name) values ($1,'finished','x')`, [GG])));
chk("client can't add footage to another client", !ok(await as(CL, `insert into social_footage (client_id, kind, name) values ($1,'broll','x')`, [FL])));
chk("operator adds a finished cut", ok(await as(OP, `insert into social_footage (client_id, video_id, kind, name) values ($1,$2,'finished','cut.mp4')`, [GG, vid])));
r = await as(CL, `select kind from social_footage order by kind`);
chk("client sees their b-roll and raw, not the finished cut file", n(r) === 2 && !r.data.some(x => x.kind === "finished"), r.data);
chk("other client sees none", n(await as(CL2, `select * from social_footage`)) === 0);

// ── Agent room: operator only ──
chk("operator (bridge) writes agent status", ok(await as(OP, `insert into social_agent_status (agent, role, status, working_on, needs_from_tait) values ('Content Editor','Edits in Remotion','working','Editor test v12',null)`)));
chk("client can't read the agent room", n(await as(CL, `select * from social_agent_status`)) === 0);
chk("editor can't read the agent room", n(await as(ED, `select * from social_agent_status`)) === 0);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
