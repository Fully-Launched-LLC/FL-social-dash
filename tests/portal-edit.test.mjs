// The operator edits a video's words from the client portal: clicking a
// video opens every field as a text box (empty ones too), Save writes it.
// A client login gets the plain card and no Edit.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fully-launched','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${FL}','fl@x');
  insert into social_videos (client_id,title,hook,body,outline,filming_instructions,status,filmed_by,concept_approved_at,platform) values
    ('${FL}','AI Systems · A1 · The 8 PM invoice problem','It''s 8 PM.','Line one.\nLine two.','- 8 PM','Talking head, vertical.','concept_pending','client',now(),'{instagram,tiktok}');
`);
const row = async () => (await db.query("select title, hook, body, outline, caption, on_screen_caption, note, platform, status, concept_approved_at from social_videos")).rows[0];
const T = "AI Systems · A1 · The 8 PM invoice problem";

const op = await openPage("clients/portal.html", OP, "https://fl.test/clients/test-fully-launched");
const card = Array.from(op.d.querySelectorAll(".card")).find(c => (c.querySelector("[data-open]") || {}).textContent === T);
chk("operator: the card has an Edit button", !!card && !!card.querySelector("[data-op-edit]"));

card.querySelector("[data-open]").click(); await settle();
const box = op.d.getElementById("videoModalBox");
const f = k => box.querySelector(`[data-op-f="${k}"]`);
chk("clicking the video opens it as text boxes", box.querySelector("h2").textContent.startsWith("Edit:") && f("hook").value === "It's 8 PM." && f("body").value === "Line one.\nLine two.");
chk("empty fields are there to fill in", f("caption") && f("caption").value === "" && f("onScreenCaption") && f("note"));

f("body").value = "Line one.\nA new line two.";
f("caption").value = "New caption.";
f("platform").value = "Instagram, LinkedIn";
box.querySelector("#opEditSave").click(); await settle();
let r = await row();
chk("saved: script edited, caption added, platforms changed", r.body === "Line one.\nA new line two." && r.caption === "New caption." && r.platform.join() === "instagram,linkedin" && r.hook === "It's 8 PM.", r);
chk("saving changes no status and keeps it visible to the client", r.status === "concept_pending" && !!r.concept_approved_at);
chk("after saving it shows the card as the client sees it, with the new script", box.textContent.includes("✓ Saved") && box.textContent.includes("A new line two.") && !box.querySelector("[data-op-f]"));

btn: {
  const e = box.querySelector("[data-op-edit]");
  chk("that card has Edit to go back", !!e);
  e.click(); await settle();
  f("title").value = "";
  box.querySelector("#opEditSave").click(); await settle();
  chk("an empty title isn't saved", box.querySelector("#opEditErr").textContent.includes("title") && (await row()).title === T);
}

const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
const ccard = Array.from(cl.d.querySelectorAll(".card")).find(c => (c.querySelector("[data-open]") || {}).textContent === T);
chk("client: no Edit on the card", !!ccard && !ccard.querySelector("[data-op-edit]"));
ccard.querySelector("[data-open]").click(); await settle();
chk("client: clicking shows the plain card with the new script", !cl.d.querySelector("#videoModalBox [data-op-f]") && cl.d.getElementById("videoModalBox").textContent.includes("A new line two."));

chk("no page errors", !op.ui.errors.length && !cl.ui.errors.length, [op.ui.errors, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
