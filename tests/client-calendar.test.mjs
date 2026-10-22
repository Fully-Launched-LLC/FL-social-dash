// The client's Content Calendar (Tait, 2026-10-22: simple, red when it needs
// them within a week): every post with its full title and platforms; red
// days and blocks when the client has a step and it posts within 7 days;
// clicking one says where it's at and the next step, with a button to it.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const CL = "00000000-0000-0000-0000-00000000000d", GG = "d44e6fc3-dfea-42dc-902c-54724441040d";
// Dates in the current month, so the calendar shows them without paging,
// and within the next 30 days, so the list under it shows them too.
const now = new Date(), ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const today = now.getDate(), early = today <= 25;
const pad = n => String(n).padStart(2, "0");
const d1 = ym + "-" + pad(early ? today + 1 : today), d2 = ym + "-" + pad(early ? today + 2 : today);
const far = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 45), dFar = `${far.getFullYear()}-${pad(far.getMonth() + 1)}-${pad(far.getDate())}`;
await db.exec(`
  insert into auth.users (id) values ('${CL}');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_videos (client_id,title,hook,status,filmed_by,concept_approved_at,post_date,platform) values
    ('${GG}','Why I started Grad Gig, and the two problems side by side','I saw two problems.','to_film','us',now(),'${d1}','{linkedin,facebook,instagram}'),
    ('${GG}','Is this job too small?',null,'ready_to_post','us',now(),'${d2}','{ig,fb}'),
    ('${GG}','Abandoned one',null,'rejected','us',now(),'${d2}','{linkedin}'),
    ('${GG}','Far off',null,'to_film','us',now(),'${dFar}','{linkedin}'),
    ('${GG}','Review me soon',null,'client_review','us',now(),'${d1}','{instagram}'),
    ('${GG}','Review me later',null,'client_review','us',now(),'${dFar}','{instagram}');
`);

const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-grad-gig");
const cell = day => Array.from(cl.d.querySelectorAll("#calGrid .cal-cell")).find(c => c.querySelector(".daynum").textContent === String(Number(day.slice(8))));
const pills = el => Array.from(el.querySelectorAll(".plat-pill")).map(p => p.textContent);

const c1 = cell(d1).querySelector(".cal-item");
chk("calendar shows the whole title", c1.querySelector(".t").textContent.includes("Why I started Grad Gig, and the two problems side by side"));
chk("calendar shows each platform", pills(c1).join() === "LI,FB,IG", pills(c1));
chk("aliases (ig, fb) show as the right platforms", pills(cell(d2).querySelector(".cal-item")).join() === "IG,FB");
chk("abandoned ideas never show", !cl.d.getElementById("calGrid").textContent.includes("Abandoned one"));
chk("no list under it, no platform legend: just the calendar and a key", !cl.d.getElementById("calAgenda") && !cl.d.getElementById("calLegend") && cl.d.getElementById("calKey").textContent.includes("Needs you this week"));
const block = t => Array.from(cl.d.querySelectorAll("#calGrid .cal-item")).find(b => b.textContent.includes(t));
chk("a video they must review that posts within a week is red, and so is its day", block("Review me soon").classList.contains("cal-urgent") && cell(d1).classList.contains("has-urgent") && block("Review me soon").querySelector(".s").textContent.startsWith("Review it · posts "), block("Review me soon").outerHTML);
chk("a video we're still making isn't red, even this week", !block("Why I started").classList.contains("cal-urgent"));
chk("ready to post isn't red", !block("too small").classList.contains("cal-urgent"));

block("Why I started").click(); await settle();
let mb = cl.d.getElementById("videoModalBox");
chk("clicking a post opens it read only, with where it is in the process", mb.textContent.includes("Why I started Grad Gig") && mb.querySelector(".process .now")?.textContent === "Filming" && !Array.from(mb.querySelectorAll("button")).some(b => /Approve|Suggest|filmed/.test(b.textContent)), mb.textContent);
chk("…says nothing is needed from them, and no video to watch yet", mb.querySelector(".next-step").textContent.startsWith("Nothing needed from you.") && !Array.from(mb.querySelectorAll("button")).some(b => b.textContent === "Watch the video"));
cl.w.closeVideoModal();
block("too small").click(); await settle();
mb = cl.d.getElementById("videoModalBox");
chk("an approved video: Ready to post, and Watch the video", mb.querySelector(".process .now")?.textContent === "Ready to post" && Array.from(mb.querySelectorAll("button")).some(b => b.textContent === "Watch the video"));
cl.w.closeVideoModal();
block("Review me soon").click(); await settle();
mb = cl.d.getElementById("videoModalBox");
chk("an urgent one: red next step, says it's urgent, button to To review", mb.querySelector(".next-step.urgent")?.textContent.includes("Watch the finished video and approve it") && mb.textContent.includes("so this is urgent") && !!Array.from(mb.querySelectorAll("button")).find(b => b.textContent === "Go to To review"), mb.textContent);
Array.from(mb.querySelectorAll("button")).find(b => b.textContent === "Go to To review").click(); await settle();
chk("…which opens To review on To Do", cl.d.querySelector('.nav-item[data-view="videos"]').classList.contains("active") && !cl.d.getElementById("videoModalBox")?.offsetParent && cl.d.querySelector('#videoTabs .chip.active')?.dataset.tab === "review", cl.d.querySelector('#videoTabs .chip.active')?.outerHTML);
const later = (await db.query(`select id from social_videos where title='Review me later'`)).rows[0].id;
cl.w.openCalendarVideo(later); await settle();
chk("a review weeks away has a next step but isn't urgent", !!cl.d.querySelector("#videoModalBox .next-step:not(.urgent)") && cl.d.getElementById("videoModalBox").textContent.includes("Your next step"));
cl.w.closeVideoModal();

chk("no page errors", !cl.ui.errors.length && !cl.ui.alerts.length, [cl.ui.errors, cl.ui.alerts]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
