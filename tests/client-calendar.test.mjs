// The client's Content Calendar: every post shows its full title and the
// platforms it goes out on, plus a day-by-day list of the month.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const CL = "00000000-0000-0000-0000-00000000000d", GG = "d44e6fc3-dfea-42dc-902c-54724441040d";
// Dates in the current month, so the calendar shows them without paging.
const now = new Date(), ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const d1 = ym + "-05", d2 = ym + "-06";
await db.exec(`
  insert into auth.users (id) values ('${CL}');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_videos (client_id,title,hook,status,filmed_by,concept_approved_at,post_date,platform) values
    ('${GG}','Why I started Grad Gig, and the two problems side by side','I saw two problems.','to_film','us',now(),'${d1}','{linkedin,facebook,instagram}'),
    ('${GG}','Is this job too small?',null,'ready_to_post','us',now(),'${d2}','{ig,fb}'),
    ('${GG}','Abandoned one',null,'rejected','us',now(),'${d2}','{linkedin}');
`);

const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-grad-gig");
const cell = day => Array.from(cl.d.querySelectorAll("#calGrid .cal-cell")).find(c => c.querySelector(".daynum").textContent === String(Number(day.slice(8))));
const pills = el => Array.from(el.querySelectorAll(".plat-pill")).map(p => p.textContent);

const c1 = cell(d1).querySelector(".cal-item");
chk("calendar shows the whole title", c1.querySelector(".t").textContent.includes("Why I started Grad Gig, and the two problems side by side"));
chk("calendar shows each platform", pills(c1).join() === "LI,FB,IG", pills(c1));
chk("aliases (ig, fb) show as the right platforms", pills(cell(d2).querySelector(".cal-item")).join() === "IG,FB");
chk("abandoned ideas never show", !cl.d.getElementById("calGrid").textContent.includes("Abandoned one") && !cl.d.getElementById("calAgenda").textContent.includes("Abandoned one"));
chk("legend lists the platforms by name", pills(cl.d.getElementById("calLegend")).join() === "LinkedIn,Facebook,Instagram", pills(cl.d.getElementById("calLegend")));

const days = Array.from(cl.d.querySelectorAll("#calAgenda .agenda-day"));
chk("day-by-day list: one entry per post day, in order", days.length === 2 && days[0].textContent.includes("Why I started") && days[1].textContent.includes("too small"));
chk("list shows the hook and platforms by name", days[0].textContent.includes("I saw two problems.") && pills(days[0]).join() === "LinkedIn,Facebook,Instagram");
cl.d.querySelector("#calAgenda .agenda-post").click(); await settle();
chk("clicking a post opens its card", cl.d.getElementById("videoModalBox").textContent.includes("Why I started Grad Gig"));
cl.w.closeVideoModal();

Array.from(cl.d.querySelectorAll("#calGrid [data-cal]")).find(b => b.dataset.cal === "1").click(); await settle();
chk("paging the month updates the list too", cl.d.getElementById("calAgenda").textContent.includes("Nothing posts this month"));

chk("no page errors", !cl.ui.errors.length && !cl.ui.alerts.length, [cl.ui.errors, cl.ui.alerts]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
