// A ready-to-post card (Tait, 2026-11-02): only Review copy, Mark posted and
// Abandon, and the post date changes right on the card.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a";
const GG = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`
  insert into auth.users (id) values ('${OP}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve');
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,post_date,platform) values
    ('${GG}','Nature spots','ready_to_post','client',now(),'2026-11-01','{instagram}'),
    ('${GG}','No date yet','ready_to_post','client',now(),null,'{instagram}'),
    ('${GG}','Still filming','to_film','us',now(),'2026-11-09','{instagram}');
`);
const idOf = async t => (await db.query("select id from social_videos where title=$1", [t])).rows[0].id;
const postDate = async t => { const d = (await db.query("select post_date from social_videos where title=$1", [t])).rows[0].post_date; return d && (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)); };

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const actionLabels = () => Array.from(op.d.querySelectorAll("#videoModalBox .modal-actions .btn, #videoModalBox .modal-actions button")).map(b => b.textContent.trim());
const dateInput = () => op.d.getElementById("vmPostDate");

op.w.openOperatorVideoModal(await idOf("Nature spots")); await settle();
let labels = actionLabels();
chk("ready to post: only Review copy, Mark posted, Abandon", JSON.stringify(labels) === JSON.stringify(["Review copy", "Mark posted", "Abandon"]), labels);
chk("…the post date is a date picker showing the date", dateInput() && dateInput().value === "2026-11-01", dateInput() && dateInput().value);

dateInput().value = "2026-11-02"; dateInput().dispatchEvent(new op.w.Event("change")); await settle();
chk("changing it saves the new post date", (await postDate("Nature spots")) === "2026-11-02", await postDate("Nature spots"));
chk("…and the card stays open showing it", dateInput() && dateInput().value === "2026-11-02");

op.w.openOperatorVideoModal(await idOf("No date yet")); await settle();
dateInput().value = "2026-11-05"; dateInput().dispatchEvent(new op.w.Event("change")); await settle();
chk("a card with no post date can get one", (await postDate("No date yet")) === "2026-11-05", await postDate("No date yet"));

op.w.openOperatorVideoModal(await idOf("Still filming")); await settle();
labels = actionLabels();
chk("other cards keep Edit and Open portal, and a plain post date", labels.includes("Edit") && labels.includes("Open portal") && !dateInput(), labels);

chk("no page errors", !op.ui.errors.length && !op.ui.alerts.length, [op.ui.errors, op.ui.alerts]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
