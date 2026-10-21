// Unify Phase 5 (migrations 026 + 029): the Content Idea Database page.
// Add an idea (with a special-request date and a screenshot), filter and
// search, edit, reject/restore, delete, ask the team for next month's plan,
// and the older unsent cards board on its own tab. Operators only.
import { freshDb, makeHarness, checker, pickFile } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle, as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);
const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const GG = "11111111-1111-1111-1111-111111111111", FL = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','gg','self-serve'),('${FL}','Fully Launched','fl','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_ideas (client_id,title,body,source,source_detail,format,why,score) values
    ('${GG}','Is it too small to hire someone?','From r/Naperville','research','r/Naperville','Talking head','real question',8),
    ('${FL}','Founders who post daily','x','phone',null,null,null,null);
`);
chk("client can't read ideas", !(await as(CL, `select * from social_ideas`)).data.length);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = op.d;
d.querySelector('.nav-item[data-view="ideabank"]').click(); await settle();
const rows = () => [...d.querySelectorAll("#ideaDb [data-idea]")].map(r => r.querySelector("b").textContent);
chk("idea database is the first tab, all clients", d.querySelector('#ideaTabs .chip.active').textContent === "Idea database" && rows().length === 2, rows());
chk("shows source, format and why", d.getElementById("ideaDb").textContent.includes("Research · r/Naperville") && d.getElementById("ideaDb").textContent.includes("Format: Talking head") && d.getElementById("ideaDb").textContent.includes("Why: real question"));
d.querySelector(`#globalClientFilter .chip[data-c="${GG}"]`).click(); await settle();
chk("client filter narrows it", JSON.stringify(rows()) === JSON.stringify(["Is it too small to hire someone?"]), rows());

// Add an idea with a special request and a screenshot.
[...d.querySelectorAll("#view-ideabank .page-actions button")].find(b => b.textContent === "+ Add idea").click(); await settle();
chk("form opens on the filtered client", d.getElementById("ifClient").value === GG);
d.getElementById("ifBody").value = "Snow rules for seniors. What the city actually says.";
d.getElementById("ifLinks").value = "https://app.sandcastles.ai/v/123";
d.getElementById("ifSource").value = "sandcastles";
d.getElementById("ifDate").value = "2026-11-14";
pickFile(op, "ifFiles", "shot.png", "image/png");
d.getElementById("ifSave").click(); await settle(); await new Promise(r => setTimeout(r, 30)); await settle();
const added = (await db.query(`select title, body, links, source, requested_post_date, attachments, status from social_ideas where source='sandcastles'`)).rows[0];
chk("idea saved: title from the first sentence, link, date, screenshot", added && added.title === "Snow rules for seniors." && added.links[0].includes("sandcastles") && String(added.requested_post_date).startsWith("2026-11-14") && added.attachments[0].kind === "image" && added.status === "new", added);
chk("screenshot went to the ideas bucket", op.ui.log.some(l => l.upload && l.upload.bucket === "ideas"));
chk("it shows with its request", d.getElementById("ideaDb").textContent.includes("Post on"));

// Filter / search.
d.getElementById("ideaSource").value = "sandcastles"; d.getElementById("ideaSource").dispatchEvent(new op.w.Event("change")); await settle();
chk("filter by source", JSON.stringify(rows()) === JSON.stringify(["Snow rules for seniors."]), rows());
d.getElementById("ideaSource").value = ""; d.getElementById("ideaSource").dispatchEvent(new op.w.Event("change")); await settle();

// Reject and restore, edit, delete.
const btnIn = (title, txt) => [...[...d.querySelectorAll("#ideaDb [data-idea]")].find(r => r.textContent.includes(title)).querySelectorAll("button")].find(b => b.textContent === txt);
btnIn("too small", "Reject").click(); await settle();
chk("rejected ideas leave the Open list", !rows().some(r => r.includes("too small")));
d.getElementById("ideaStatus").value = "rejected"; d.getElementById("ideaStatus").dispatchEvent(new op.w.Event("change")); await settle();
btnIn("too small", "Restore").click(); await settle();
chk("restore brings it back as new", (await db.query(`select status from social_ideas where title like 'Is it too small%'`)).rows[0].status === "new");
d.getElementById("ideaStatus").value = "open"; d.getElementById("ideaStatus").dispatchEvent(new op.w.Event("change")); await settle();
btnIn("Snow rules", "Edit").click(); await settle();
d.getElementById("ifFormat").value = "Local guide"; d.getElementById("ifSave").click(); await settle();
chk("edit saves", (await db.query(`select format from social_ideas where source='sandcastles'`)).rows[0].format === "Local guide");
btnIn("Snow rules", "Edit").click(); await settle();
[...d.querySelectorAll(".modal-box button")].find(b => b.textContent === "Delete").click(); await settle();
chk("delete removes it", !(await db.query(`select 1 from social_ideas where source='sandcastles'`)).rows.length);

// Ask the team for next month's plan: a draft plan the bridge picks up.
[...d.querySelectorAll("#view-ideabank .page-actions button")].find(b => b.textContent.startsWith("Ask the team")).click(); await settle();
const pl = (await db.query(`select status, month from social_monthly_plans where client_id=$1`, [GG])).rows[0];
chk("asking makes a draft plan for next month", pl && pl.status === "draft" && op.ui.alerts.some(a => a.includes("Asked the team")), pl);

// The old board is still there on its own tab.
d.querySelector('#ideaTabs [data-it="cards"]').click(); await settle();
chk("Unsent cards tab shows the old board", d.getElementById("ideaBoard").style.display === "" && d.getElementById("ideaDb").style.display === "none");
chk("no page errors", !op.ui.errors.length, op.ui.errors);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
