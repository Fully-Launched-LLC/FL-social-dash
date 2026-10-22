// Unify Phase 6 (migration 030): ideas become video cards in Scripting
// (from an approved plan, or one idea at a time) with Tait's timing; the
// client sees the whole approved card (camera questions too), approves it
// or requests changes (back to Scripting), and uploads footage right on the
// card (the 'footage' bucket; the bridge moves it to Google Drive).
import { freshDb, makeHarness, checker, pickFile } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle, as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);
const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const GG = "11111111-1111-1111-1111-111111111111";
const plus = n => (new Date(Date.now() + n * 864e5)).toISOString().slice(0, 10);
const P1 = plus(40), P2 = plus(45);
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','gg','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
`);
const plan = (await db.query(`insert into social_monthly_plans (client_id, month, status) values ($1, date_trunc('month', current_date + 40)::date, 'on_desk') returning id`, [GG])).rows[0].id;
await db.query(`insert into social_ideas (client_id,title,body,format,why,status,plan_id,planned_post_date) values
  ($1,'Leaf rules','3 city rules','Local guide','seasonal','in_plan',$2,$3),
  ($1,'Shovel','snow','Talking head','winter','in_plan',$2,$4)`, [GG, plan, P1, P2]);
const loose = (await db.query(`insert into social_ideas (client_id,title,body,status,requested_post_date) values ($1,'Smallest job','tiny jobs','new',$2) returning id`, [GG, P2])).rows[0].id;

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = op.d;
[...d.querySelectorAll("#deskIdeas button")].find(b => b.textContent === "Reject").click(); await settle();   // Tait rejects one idea
[...d.querySelectorAll("#deskIdeas button")].find(b => b.textContent.startsWith("Approve the rest")).click(); await settle();
const cards = (await db.query(`select title, status, post_date::text, due_to_film::text, due_to_edit::text, editor_brief, idea_id from social_videos order by title`)).rows;
chk("approving the plan makes a card for each approved idea, in Scripting", cards.length === 1 && cards[0].title === "Shovel" && cards[0].status === "scripting", cards);
const P = cards[0].post_date;
const back = n => { const x = new Date(P + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
chk("dates from Tait's timing: film P-10, edit P-7, script P-13", cards[0].due_to_film === back(10) && cards[0].due_to_edit === back(7) && cards[0].editor_brief.scriptDue === back(13), cards[0]);
chk("the card keeps the idea's format and why", cards[0].editor_brief.format === "Talking head" && cards[0].editor_brief.why === "winter");
chk("the idea is marked as on a card", (await db.query(`select status, video_id from social_ideas where title='Shovel'`)).rows[0].video_id);

// One idea at a time: Make a card.
d.querySelector('.nav-item[data-view="ideabank"]').click(); await settle();
[...[...d.querySelectorAll("#ideaDb [data-idea]")].find(r => r.textContent.includes("Smallest job")).querySelectorAll("button")].find(b => b.textContent === "Make a card").click(); await settle();
const sj = (await db.query(`select status, post_date::text from social_videos where title='Smallest job'`)).rows[0];
chk("Make a card: Scripting, with the requested post date", sj && sj.status === "scripting" && sj.post_date === P2, sj);
op.w.openClientPage(GG, "videos"); await settle();
chk("the client's Videos tab shows the Scripting card", d.getElementById("cpBody").textContent.includes("Smallest job"));
chk("client can't see Scripting cards", !(await as(CL, `select id from social_videos`)).data.length);

// The Writer's work, then Tait approves the script.
await db.query(`update social_videos set hook='Your leaves have 3 rules', body='The script', outline='- one', camera_questions='What did the city say?', status='script_review' where title='Shovel'`);
const op2 = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
[...op2.d.querySelectorAll("#deskScripts button")].find(b => b.textContent === "Approve script").click(); await settle();

// The client's card.
let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/gg");
const cardEl = () => [...cl.d.querySelectorAll(".card")].find(c => (c.querySelector("[data-open]") || {}).textContent === "Shovel");
chk("client sees the whole card, camera questions too", cardEl() && ["Your leaves have 3 rules", "The script", "- one", "Questions to answer on camera", "What did the city say?"].every(s => cardEl().textContent.includes(s)), cardEl() && cardEl().textContent);
chk("buttons: Video has been filmed / Approve / Request changes, plus Upload footage", [...cardEl().querySelectorAll(".actions button")].map(b => b.textContent).join("|") === "Video has been filmed|Approve|Request changes" && !!cardEl().querySelector("[data-upload]"));
const vid = (await db.query(`select id from social_videos where title='Shovel'`)).rows[0].id;
pickFile(cl, cardEl().querySelector("[data-upload]").id || (cardEl().querySelector("[data-upload]").id = "up1"), "take1.mov", "video/quicktime");
await settle(); await new Promise(r => setTimeout(r, 30)); await settle();
const clip = (await db.query(`select kind, name, storage_path, uploaded_by_role from social_footage where video_id=$1`, [vid])).rows[0];
chk("clip uploaded on the card: footage bucket + a raw footage row", clip && clip.kind === "raw" && clip.storage_path.startsWith(GG + "/" + vid + "/") && clip.uploaded_by_role === "client", clip);
chk("upload went to the footage bucket", cl.ui.log.some(l => l.upload && l.upload.bucket === "footage"));
chk("thank-you after the upload", cl.d.getElementById("videoModalBox").textContent.includes("Uploaded!"));
cl.d.getElementById("msgOk").click(); await settle();
chk("the card lists its clip", cardEl().textContent.includes("take1.mov"));
[...cardEl().querySelectorAll(".actions button")].find(b => b.textContent === "Video has been filmed").click(); await settle();
chk("confirm counts the clips", cl.d.getElementById("videoModalBox").textContent.includes("1 so far"));
cl.d.getElementById("cfYes").click(); await settle();
const after = (await db.query(`select status, due_to_edit::text, post_date::text from social_videos where id=$1`, [vid])).rows[0];
chk("footage in on time: editing, post date kept, edit due P-7", after.status === "ready_to_edit" && after.post_date === P && after.due_to_edit === back(7), after);
chk("no page errors", !op.ui.errors.length && !cl.ui.errors.length, [op.ui.errors, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
