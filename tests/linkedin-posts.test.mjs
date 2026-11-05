// Content cards (migration 040; Tait, 2026-11-04): a card is a video or a
// LinkedIn copy post. A post is written in the client's voice and checked by
// Tait on My desk (Approve all), then the client sees the idea, three
// example hooks and the post, edits it in the box, adds a photo, and
// approves it (straight to Ready to post) or rejects the idea (back to
// Scripting with their note). Tait copies it and marks it posted.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e";
const MW = "d44e6fc3-dfea-42dc-902c-54724441040d", GG = "d44e6fc3-dfea-42dc-902c-54724441040e";
const P1 = "a0000000-0000-0000-0000-000000000001", P2 = "a0000000-0000-0000-0000-000000000002", V1 = "a0000000-0000-0000-0000-000000000003";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${CL}','matteo@x.test',now()),('${CL2}','luke@gg.test',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email,skip_onboarding) values
    ('${MW}','Matteo Warren','matteo-warren','self-serve','Matteo Warren','matteo@x.test',true), ('${GG}','Grad Gig','grad-gig','self-serve','Luke','luke@gg.test',true);
  insert into social_client_users (id, client_id, email) values ('${CL}','${MW}','matteo@x.test'), ('${CL2}','${GG}','luke@gg.test');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count, password_set_at, completed_at) values ('${MW}','matteo@x.test',now(),1,now(),now());
  insert into social_videos (id,client_id,title,status,content_type,concept,hook_options,caption,platform,post_date) values
    ('${P1}','${MW}','Why I left banking','script_review','linkedin_post','The day he quit','["I quit on a Tuesday.","Nobody tells you this about banking.","My boss laughed."]','I quit on a Tuesday.\n\nHere is why.','{linkedin}','2026-11-09'),
    ('${P2}','${MW}','Three clients, one week','script_review','linkedin_post','A busy week','["One","Two","Three"]','A week I won''t forget.','{linkedin}','2026-11-10');
  insert into social_videos (id,client_id,title,status,hook,body,platform,post_date) values
    ('${V1}','${MW}','My first sale','script_review','The first sale','Script','{linkedin,facebook,instagram}','2026-11-09');
`);
const row = async id => (await db.query(`select * from social_videos where id='${id}'`)).rows[0];
const readAs = async (uid, sql) => {
  await db.exec("begin");
  await db.query(`select set_config('role', 'authenticated', true)`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; }
  finally { await db.exec("commit"); }
};

// The client can't see them before Tait checks them.
chk("before Tait's OK the client sees no cards", (await readAs(CL, "select id from social_videos")).rows.length === 0);

// Tait: My desk → Scripts to review → Approve all.
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const scripts = () => op.d.getElementById("deskScripts");
chk("Scripts to review lists the posts as LinkedIn posts", scripts().textContent.includes("Why I left banking") && scripts().textContent.includes("LinkedIn post"), scripts().textContent.slice(0, 300));
const all = Array.from(scripts().querySelectorAll("button")).find(b => /Approve all 3/.test(b.textContent));
chk("…with Approve all 3", !!all);
all.click(); await settle();
chk("approve all sends every card to the client", (await row(P1)).status === "concept_pending" && !!(await row(P1)).concept_approved_at && !!(await row(V1)).concept_approved_at);

// The client's card.
const cp = await openPage("clients/portal.html", CL, "https://fl.test/clients/matteo-warren");
const card = title => Array.from(cp.d.querySelectorAll("#listReview .card")).find(c => c.textContent.includes(title));
const c1 = card("Why I left banking");
chk("the post is on To review", !!c1, cp.d.getElementById("listReview").textContent.slice(0, 200));
chk("…with the idea, three hooks and the post in an editable box", c1 && c1.textContent.includes("The day he quit") && c1.querySelectorAll(".hook-list li").length === 3
  && c1.querySelector("textarea[data-copy]").value.startsWith("I quit on a Tuesday."));
chk("…a photo button for the camera roll", c1 && c1.querySelector("input[type=file][data-photo]").accept === "image/*");
chk("the video is not on To review (it's To film)", !card("My first sale"));

// Edit, save.
c1.querySelector("textarea[data-copy]").value = "I quit banking on a Tuesday.\n\nHere is why.";
c1.querySelector("[data-save-copy]").click(); await settle();
chk("Save my edits saves the post", (await row(P1)).caption === "I quit banking on a Tuesday.\n\nHere is why." && (await row(P1)).status === "concept_pending");

// Photo.
const pick = card("Why I left banking").querySelector("[data-photo]");
Object.defineProperty(pick, "files", { value: [new cp.w.File(["jpg"], "me at desk.jpg", { type: "image/jpeg" })], configurable: true });
pick.dispatchEvent(new cp.w.Event("change")); await settle();
const photo = (await row(P1)).photo_path || "";
chk("a photo uploads into their own folder on the post", photo.startsWith(`${MW}/${P1}/`) && photo.endsWith("me_at_desk.jpg"), photo);
chk("…into the post-photos bucket", cp.ui.log.some(l => l.upload && l.upload.bucket === "post-photos"));

// Rules the database keeps.
chk("a photo outside their folder is refused", /isn't on this post/.test((await readAs(CL, `select social_client_linkedin_post('${P1}','photo',null,null,'${GG}/x/y.jpg')`)).error || ""));
chk("another client can't touch it", /isn't waiting/.test((await readAs(CL2, `select social_client_linkedin_post('${P1}','save','hacked')`)).error || ""));
chk("rejecting needs a note", /note is required/.test((await readAs(CL, `select social_client_linkedin_post('${P2}','reject')`)).error || ""));
const direct = await readAs(CL, `update social_videos set caption='x', status='posted' where id='${V1}' returning id`);
chk("a client can't edit a card directly (only through the functions)", (direct.error || direct.rows.length === 0) && (await row(V1)).caption === null && (await row(V1)).status === "concept_pending", direct);

// Approve, with one more edit typed in.
const c1b = card("Why I left banking");
c1b.querySelector("textarea[data-copy]").value = "I quit banking on a Tuesday.\n\nHere's why.";
c1b.querySelector("[data-approve-post]").click(); await settle();
cp.d.getElementById("cfYes").click(); await settle();
const r1 = await row(P1);
chk("Approve post: straight to Ready to post, with the last edit", r1.status === "ready_to_post" && r1.caption === "I quit banking on a Tuesday.\n\nHere's why.", [r1.status, r1.caption]);
chk("…and it's logged as the client's approval", (await db.query(`select action from social_status_audit_log where video_id='${P1}' order by id desc limit 1`)).rows[0]?.action === "approve_post");

// Reject the other.
const c2 = card("Three clients, one week");
c2.querySelector("[data-reject-post]").click();
c2.querySelector(".note-box textarea").value = "Not my story, I never had three clients in a week.";
c2.querySelector(".note-box [data-send]").click(); await settle();
const r2 = await row(P2);
chk("Reject the idea: back to Scripting with the note, hidden from the client", r2.status === "scripting" && r2.note.startsWith("Not my story") && !r2.concept_approved_at);
chk("…gone from their portal", (await readAs(CL, `select id from social_videos where id='${P2}'`)).rows.length === 0);

// Tait: Content to post.
const op2 = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const post = op2.d.getElementById("deskPost");
chk("Content to post shows the post with its words", post.textContent.includes("Why I left banking") && post.textContent.includes("Here's why.") && post.textContent.includes("LinkedIn post"), post.textContent.slice(0, 300));
const labels = Array.from(post.querySelectorAll("button")).map(b => b.textContent.trim());
chk("…Copy the post, Download photo, Mark posted", ["Copy the post", "Download photo", "Mark posted"].every(l => labels.includes(l)), labels);
op2.w.openOperatorVideoModal(P1); await settle();
const modal = op2.d.getElementById("videoModalBox").textContent;
chk("its card shows the idea, hooks and post (no film or edit dates)", modal.includes("The day he quit") && modal.includes("My boss laughed.") && !modal.includes("Due to film"), modal.slice(0, 300));
op2.w.closeVideoModal();
Array.from(post.querySelectorAll("button")).find(b => b.textContent.trim() === "Mark posted").click(); await settle();
chk("Mark posted", (await row(P1)).status === "posted");

// The Edit form for a post.
op2.w.openVideoForm(P2); await settle();
const box = op2.d.getElementById("videoModalBox");
chk("Edit opens the LinkedIn form", box.textContent.includes("Edit content card · LinkedIn post") && !!box.querySelector('[data-f="hook2"]') && !box.querySelector('[data-f="filmingDirection"]'));
box.querySelector('[data-f="hook0"]').value = "A new hook";
box.querySelector('[data-f="caption"]').value = "A rewritten post.";
box.querySelector("#lfSave").click(); await settle();
const r2b = await row(P2);
chk("…saves the hooks and post", r2b.caption === "A rewritten post." && JSON.stringify(r2b.hook_options) === JSON.stringify(["A new hook", "Two", "Three"]), r2b.hook_options);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
