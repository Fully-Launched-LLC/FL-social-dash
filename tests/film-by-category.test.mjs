// To film, grouped by category, with a filter so a whole category can be
// filmed in one sitting. Titles without a category keep the plain list.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const CL = "00000000-0000-0000-0000-00000000000e", FL = "00000000-0000-0000-0000-0000000000f1";
const CL2 = "00000000-0000-0000-0000-00000000000f", GG = "00000000-0000-0000-0000-0000000000f2";
await db.exec(`
  insert into auth.users (id) values ('${CL}'), ('${CL2}');
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fl','self-serve'), ('${GG}','Grad Gig','test-gg','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${FL}','fl@x'), ('${CL2}','${GG}','gg@x');
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,post_date,due_to_film) values
    ('${FL}','E-commerce · M2 · More marketplaces','to_film','client',now(),'2026-10-21','2026-10-07'),
    ('${FL}','AI Systems · A2 · The 8 PM invoice problem','to_film','client',now(),'2026-10-19','2026-10-05'),
    ('${FL}','Social Media · O1 · What do I post?','concept_pending','client',now(),'2026-10-20','2026-10-06'),
    ('${FL}','AI Systems · B12 · An afternoon, not weeks','to_film','client',now(),'2026-10-20','2026-10-06'),
    ('${FL}','Recreate this Instagram reel','to_film','client',now(),null,null),
    ('${GG}','Is this job too small? · Part 1','to_film','client',now(),'2026-10-20','2026-10-06');
`);

const p = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fl");
const heads = () => Array.from(p.d.querySelectorAll("#listToFilm .film-cat-head")).map(h => h.textContent.split(" · ")[0]);
const titles = () => Array.from(p.d.querySelectorAll("#listToFilm .card [data-open]")).map(b => b.textContent);
const chips = () => Array.from(p.d.querySelectorAll("#filmCats .chip")).map(c => c.textContent.trim());

chk("filter row shows each category with its count", chips().join("|") === "All categories 5|AI Systems 2|Social Media 1|E-commerce 1|No category 1", chips());
chk("All: one heading per category, AI first, no-category last", heads().join("|") === "AI Systems|Social Media|E-commerce|No category", heads());
chk("videos sit under their own heading", titles()[0].startsWith("AI Systems · A2") && titles()[1].startsWith("AI Systems · B12"), titles());

Array.from(p.d.querySelectorAll("#filmCats .chip")).find(c => c.dataset.cat === "AI Systems").click(); await settle();
chk("picking AI Systems shows only those", titles().length === 2 && titles().every(t => t.startsWith("AI Systems")), titles());
chk("the pick is remembered", p.w.localStorage.getItem("fs-film-category") === "AI Systems");
p.d.querySelector('#filmCats .chip[data-cat=""]').click(); await settle();
chk("All categories brings everything back", titles().length === 5);

const g = await openPage("clients/portal.html", CL2, "https://fl.test/clients/test-gg");
chk("no categories: no filter row, plain list", g.d.getElementById("filmCats").style.display === "none" && !g.d.querySelector("#listToFilm .film-cat-head") && g.d.querySelectorAll("#listToFilm .card").length === 1);

chk("no page errors", ![...p.ui.errors, ...g.ui.errors, ...p.ui.alerts, ...g.ui.alerts].length, [p.ui.errors, g.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
