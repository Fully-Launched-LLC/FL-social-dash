// The operator's "Approve for client" buttons: stand-ins for the client's
// own Approve on a concept (after gate 1) and on a finished video.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a";
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
const DAD = "d44e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users values ('${OP}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values
    ('${FL}','Fully Launched','test-fully-launched','self-serve'),
    ('${DAD}','Dad Co','dad-co','concierge');
  insert into social_videos (client_id,title,status,concept_approved_at,filmed_by) values
    ('${FL}','Client-filmed idea','concept_pending',now(),null),
    ('${FL}','We-film idea','concept_pending',now(),'us'),
    ('${FL}','Unapproved concept','concept_pending',null,null),
    ('${FL}','Finished video','client_review',null,null),
    ('${DAD}','Concierge finished video','client_review',null,null);
`);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
// Each client's Videos tab (Clients → Open → Videos).
const row = t => { for (const c of [FL, DAD]) { op.w.openClientPage(c, "videos");
  const r = Array.from(op.d.querySelectorAll("#cpBody .row")).find(r => (r.querySelector("b.video-card") || {}).textContent === t);
  if (r) return r; } };
const btnL = (r, label) => r && Array.from(r.querySelectorAll("button")).find(b => b.textContent.trim() === label);
const statusOf = async t => (await db.query("select status, due_to_edit::text from social_videos where title=$1", [t])).rows[0];
const TODAY = (await db.query("select current_date::text d")).rows[0].d;

chk("no stand-in buttons before the idea is sent", row("Unapproved concept") && !btnL(row("Unapproved concept"), "Approve for client") && !btnL(row("Unapproved concept"), "Mark filmed for client"));
chk("client-filmed idea: Mark filmed, not Approve", !!btnL(row("Client-filmed idea"), "Mark filmed for client") && !btnL(row("Client-filmed idea"), "Approve for client"));
chk("we-film idea: Approve, not Mark filmed", !!btnL(row("We-film idea"), "Approve for client") && !btnL(row("We-film idea"), "Mark filmed for client"));

btnL(row("Client-filmed idea"), "Mark filmed for client").click(); await settle();
let r = await statusOf("Client-filmed idea");
chk("marked filmed → editing, edit due in 7 days", r.status === "ready_to_edit" && r.due_to_edit > TODAY, r);
for (const [t, want] of [["We-film idea", "to_film"], ["Finished video", "ready_to_post"], ["Concierge finished video", "ready_to_post"]]) {
  const b = btnL(row(t), "Approve for client");
  chk(`${t}: Approve for client shows`, !!b);
  if (!b) continue;
  b.click(); await settle();
  chk(`${t}: now ${want}`, (await statusOf(t)).status === want);
}
chk("asked to confirm each time", op.ui.confirms.length === 4 && op.ui.confirms[0].includes("Fully Launched"), op.ui.confirms);
const log = (await db.query("select action, changed_by_role from social_status_audit_log where action <> 'created'")).rows;
chk("audit log says the operator did it", log.length === 4 && log.every(x => x.action === "direct_update" && x.changed_by_role === "operator"), log);
chk("no alerts or page errors", !op.ui.alerts.length && !op.ui.errors.length, [op.ui.alerts, op.ui.errors]);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
