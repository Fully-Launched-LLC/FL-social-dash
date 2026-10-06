// To Do → Time sensitive: Tait's next task on each video, when it's overdue
// or due within 3 days, soonest first. Plus the client's video card facts:
// post date, stage and platforms.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", CL = "00000000-0000-0000-0000-00000000000d";
const GG = "d44e6fc3-dfea-42dc-902c-54724441040d";
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x');
  update social_editors set setup_at = now(); -- they made their password (migration 013)
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,editor_id,due_to_film,due_to_edit,post_date,platform) values
    ('${GG}','Film soon','to_film','us',now(),null,'${day(2)}','${day(9)}','${day(16)}','{linkedin,facebook,instagram}'),
    ('${GG}','Film later','to_film','us',now(),null,'${day(10)}','${day(17)}','${day(24)}','{linkedin}'),
    ('${GG}','Edit overdue','with_editor','us',now(),'${ED}',null,'${day(-1)}','${day(6)}','{instagram}'),
    ('${GG}','Review now','in_review','us',now(),'${ED}',null,'${day(-3)}','${day(3)}','{facebook}'),
    ('${GG}','Post today','ready_to_post','us',now(),null,null,null,'${day(0)}','{linkedin}'),
    ('${GG}','Client idea','concept_pending','client',now(),null,'${day(1)}',null,'${day(8)}','{linkedin}'),
    ('${GG}','Gone','rejected','us',now(),null,'${day(1)}',null,'${day(2)}','{linkedin}');
`);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const tabs = () => Object.fromEntries(Array.from(op.d.querySelectorAll("#todoTabs .chip")).map(c => [c.dataset.stageTab, c.textContent.trim().replace(/\s+(\d+)$/, " ($1)")]));
const shown = () => Array.from(op.d.querySelectorAll("#view-todo [data-stage]")).filter(el => el.style.display !== "none").map(el => el.dataset.stage);
chk("Time sensitive tab right after All, with its count", Object.keys(tabs())[1] === "urgent" && tabs().urgent === "Time sensitive (4)", tabs());
chk("not shown under All", !shown().includes("urgent"));
op.d.querySelector('[data-stage-tab="urgent"]').click(); await settle();
const rows = Array.from(op.d.querySelectorAll('[data-stage="urgent"] .row'));
const titles = rows.map(r => r.querySelector("b.video-card").textContent);
chk("only Tait's tasks due within 3 days or overdue, soonest first", titles.join() === "Edit overdue,Review now,Post today,Film soon", titles);
const text = t => rows.find(r => r.textContent.includes(t)).textContent;
chk("each says what to do", text("Review now").includes("Review the edit") && text("Edit overdue").includes("Chase the editor") && text("Post today").includes("Post it") && text("Film soon").includes("Film it"));
chk("overdue and today are called out", text("Edit overdue").includes("overdue since") && text("Post today").includes("today,"));
chk("client's own tasks, far-off ones and abandoned ideas stay out", !["Client idea", "Film later", "Gone"].some(t => titles.includes(t)));
chk("the stage's buttons are there (send to editor on a we-film video)", !!Array.from(rows.find(r => r.textContent.includes("Film soon")).querySelectorAll("button")).find(b => b.textContent === "Send to editor"));

// Calendar days list their items in title order, numbers in order.
await db.exec(`insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,due_to_film,post_date,platform) values
  ('${GG}','10. Ten','to_film','us',now(),'${day(30)}','${day(40)}','{linkedin}'),('${GG}','2. Two','to_film','us',now(),'${day(30)}','${day(41)}','{linkedin}'),('${GG}','9. Nine','to_film','us',now(),'${day(30)}','${day(42)}','{linkedin}')`);
await op.w.loadLiveData(); await settle();
const filmDay = op.w.eval("calendarByDay(filteredVideos(), calState)")[day(30)].map(e => e.x.video.title);
chk("a day's items are in number order", filmDay.join() === "2. Two,9. Nine,10. Ten", filmDay);

// The client's card: when, where, and where it's at.
const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-grad-gig");
cl.w.openClientVideoModal(cl.w.eval("VIDEOS").find(v => v.title === "Film soon").id); await settle();
const box = cl.d.getElementById("videoModalBox");
const pills = Array.from(box.querySelectorAll(".plat-pill")).map(p => p.textContent);
chk("card shows every platform by name", pills.join() === "LinkedIn,Facebook,Instagram", pills);
chk("card shows the post date and stage", box.textContent.includes("Posts ") && box.textContent.includes("We're filming it"), box.textContent);
chk("we-film card shows when we film it", box.textContent.includes("We film this with you by"));

// The client's To Do: its own Time sensitive tab (their own next steps only).
chk("client page is called To Do", cl.d.querySelector("#view-videos h1").textContent === "To Do" && Array.from(cl.d.querySelectorAll(".nav-item")).some(n => n.textContent.trim() === "To Do"));
cl.w.closeVideoModal();
const ctabs = Object.fromEntries(Array.from(cl.d.querySelectorAll("#videoTabs .chip")).map(c => [c.dataset.tab, c.textContent.trim().replace(/\s+(\d+)$/, " ($1)")]));
chk("client Time sensitive tab after All: only the client's own soon-due step", Object.keys(ctabs)[1] === "urgent" && ctabs.urgent === "Time sensitive (1)", ctabs);
cl.d.querySelector('#videoTabs [data-tab="urgent"]').click(); await settle();
const ucards = Array.from(cl.d.querySelectorAll("#listUrgent > .card"));
chk("it lists the idea they film tomorrow, saying what and by when", ucards.length === 1 && ucards[0].textContent.includes("Client idea") && ucards[0].textContent.includes("Film it · by"), ucards.map(c => c.textContent));
cl.d.querySelector('#videoTabs [data-tab="all"]').click(); await settle();
chk("All doesn't repeat the Time sensitive panel", cl.d.querySelector('[data-panel="urgent"]').style.display === "none");

chk("no page errors", !op.ui.errors.length && !op.ui.alerts.length && !cl.ui.errors.length, [op.ui.errors, op.ui.alerts, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
