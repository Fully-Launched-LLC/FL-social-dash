// The operator in the client portal: clicks the client's own buttons for
// them and edits videos, all recorded as the operator.
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
  insert into social_videos (client_id,title,status,concept_approved_at) values
    ('${FL}','Change me','concept_pending',now()),
    ('${FL}','Hidden concept','concept_pending',null),
    ('${FL}','Film me','to_film',null),
    ('${FL}','Final ok','client_review',null),
    ('${FL}','Final redo','client_review',null),
    ('${FL}','Edit me','to_film',null),
    ('${DAD}','Dad final','client_review',null),
    ('${DAD}','Dad filmed','filmed',null);
  insert into social_videos (client_id,title,status,concept_approved_at,filmed_by) values
    ('${FL}','Approve me','concept_pending',now(),'us');
`);

const open = slug => openPage("clients/portal.html", OP, "https://fl.test/clients/" + slug);
const card = (p, t) => Array.from(p.d.querySelectorAll(".card")).find(c => (c.querySelector("[data-open]") || {}).textContent === t);
const btn = (el, text) => el && Array.from(el.querySelectorAll("button")).find(b => b.textContent.trim().startsWith(text));
const row = async t => (await db.query("select status, note, concept_approved_at, title, hook, post_date from social_videos where title=$1", [t])).rows[0];

let p = await open("test-fully-launched");
chk("gate-1 concept still hidden from portal", !card(p, "Hidden concept"));

const steps = [
  ["Approve me", "Approve idea", null, "to_film"],
  ["Change me", "Suggest changes", "Shorter hook", "concept_pending"],
  ["Film me", "Video has been filmed", null, "ready_to_edit"],
  ["Final ok", "Approve for posting", null, "ready_to_post"],
  ["Final redo", "Review the video", "0:30  Louder music", "with_editor"],
];
const tab = async key => { p.d.querySelector(`#videoTabs [data-tab="${key}"]`)?.click(); await settle(); };
for (const [t, label, note, want] of steps) {
  const c = card(p, t), b = btn(c, label);
  chk(`${t}: "${label}" shows for operator`, !!b);
  if (!b) continue;
  b.click(); await settle();
  if (label === "Review the video") {
    // The review window: a timed note, then send it to the editor.
    const box = p.d.getElementById("videoModalBox");
    box.querySelector(".rv-compose textarea").value = "Louder music";
    box.querySelector(".rv-time-in").value = "0:30";
    box.querySelector(".rv-add").click(); await settle();
    Array.from(box.querySelectorAll(".rv-actions button")).find(b => b.textContent === "Send 1 change to the editor").click(); await settle();
    const n = (await db.query("select author_role, author_name, at_seconds from social_video_comments")).rows;
    chk("operator's note in the portal counts as the client's review, marked as us", n.length === 1 && n[0].author_role === "client" && /^Fully Launched \(for /.test(n[0].author_name) && Number(n[0].at_seconds) === 30, n);
  } else if (note) {
    const box = c.querySelector(".note-box");
    box.querySelector("textarea").value = note;
    box.querySelector("[data-send]").click(); await settle();
  }
  if (label === "Video has been filmed") { p.d.getElementById("cfYes").click(); await settle(); }
  chk(`${t}: thank-you shown`, !!p.d.getElementById("msgOk"));
  p.d.getElementById("msgOk")?.click(); await settle();
  const r = await row(t);
  chk(`${t}: now ${want}`, r.status === want, r);
  if (note) chk(`${t}: note saved`, r.note === note, r.note);
}
chk("request changes sends concept back to owner", (await row("Change me")).concept_approved_at === null);

chk("no Edit button in the portal, even for the operator", !Array.from(p.d.querySelectorAll("#view-videos button")).some(b => b.textContent.includes("Edit")));

chk("no alerts or page errors (FL)", !p.ui.alerts.length && !p.ui.errors.length, [p.ui.alerts, p.ui.errors]);

// Concierge: only the final-review buttons, no filming ones.
p = await open("dad-co");
chk("concierge: approve final shows", !!btn(card(p, "Dad final"), "Approve for posting"));
chk("concierge (we film): no filmed button", !btn(card(p, "Dad final"), "Video has been filmed"));
chk("concierge: final card has only Review / Approve", Array.from(card(p, "Dad final").querySelectorAll(".actions button")).map(b => b.textContent).join("|") === "Review the video|Approve for posting");

const log = (await db.query("select action, changed_by_role from social_status_audit_log where action <> 'created'")).rows;
chk("audit log: all by operator, none as client", log.length >= 5 && log.every(r => r.changed_by_role === "operator" && r.action === "direct_update"), log);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
