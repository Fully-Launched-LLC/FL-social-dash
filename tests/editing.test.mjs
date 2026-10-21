// Unify Phase 7: the AI Editor next to the human editors, the "waiting on
// editing guidelines" note (Tait: no edit until they're approved), and the
// Content Poster's caption draft in Approve & add captions.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);
const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000e";
const GG = "11111111-1111-1111-1111-111111111111";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Ed','ed@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','gg','self-serve');
  insert into social_videos (client_id,title,status,editor_brief) values
    ('${GG}','Ready one','ready_to_edit','{}'),
    ('${GG}','Waiting one','ready_to_edit','{"waitingOn":"editing guidelines"}'),
    ('${GG}','Human one','ready_to_edit','{}'),
    ('${GG}','Cut to review','in_review','{"captionDraft":{"caption":"Leaves? 3 rules.","onScreenCaption":"3 leaf rules","cover":"Luke pointing at a rake"}}');
`);
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = op.d;
chk("My desk: videos waiting on the editing guidelines", d.getElementById("deskDocs").textContent.includes("1 video waiting") && d.getElementById("deskDocs").textContent.includes("Grad Gig's editing guidelines"));
d.querySelector('.nav-item[data-view="todo"]').click(); await settle();
const row = t => [...d.querySelectorAll("#toEditorList .vrow")].find(r => r.textContent.includes(t));
chk("the waiting card says so", row("Waiting one").textContent.includes("Waiting on their editing guidelines"));
chk("AI editor is an option next to the human editors", [...row("Ready one").querySelectorAll("select option")].map(o => o.textContent).join("|") === "Pick editor…|AI editor|Ed");
row("Ready one").querySelector("select").value = "ai";
[...row("Ready one").querySelectorAll("button")].find(b => b.textContent === "Send to editor").click(); await settle();
const ai = (await db.query(`select status, editor_id, editor_brief from social_videos where title='Ready one'`)).rows[0];
chk("AI editor: with an editor, no human editor, flagged for the bridge", ai.status === "with_editor" && ai.editor_id === null && ai.editor_brief.aiEditor === true, ai);
row("Human one").querySelector("select").value = ED;
[...row("Human one").querySelectorAll("button")].find(b => b.textContent === "Send to editor").click(); await settle();
const hu = (await db.query(`select status, editor_id, editor_brief from social_videos where title='Human one'`)).rows[0];
chk("human editor: assigned and marked so the bridge leaves it alone", hu.status === "with_editor" && hu.editor_id === ED && hu.editor_brief.humanEditor === true, hu);
chk("With an editor shows the AI editor", [...d.querySelectorAll("#withEditorList .vrow")].find(r => r.textContent.includes("Ready one"))?.textContent.includes("AI editor"));
[...[...d.querySelectorAll("#editsList .vrow")].find(r => r.textContent.includes("Cut to review")).querySelectorAll("button")].find(b => b.textContent.startsWith("Approve & add captions")).click(); await settle();
const box = d.getElementById("videoModalBox");
chk("captions open with the Poster's draft and cover idea", box.querySelector('[data-f="caption"]').value === "Leaves? 3 rules." && box.querySelector('[data-f="onScreenCaption"]').value === "3 leaf rules" && box.textContent.includes("Luke pointing at a rake"));
chk("no page errors", !op.ui.errors.length, op.ui.errors);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
