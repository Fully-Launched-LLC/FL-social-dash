// Unify Phase 5 (migrations 026 + 029): the Content Idea Database page.
// Tait, 2026-10-22: just a place to drop ideas, star the ones to use soon,
// filter by client (migration 034 for stars). Add (with a screenshot), star
// and unstar, ideas on a card drop off, edit, delete. Operators only.
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
const rows = () => [...d.querySelectorAll("#ideaDb [data-idea]")].map(r => r.querySelector(".idea-text > div").textContent);
const page = () => d.getElementById("view-ideabank").textContent;
chk("just ideas: no status, source or search filters, no old board", !d.getElementById("ideaStatus") && !d.getElementById("ideaSource") && !d.getElementById("ideaQ") && !d.getElementById("ideaBoard") && !d.getElementById("ideaTabs"));
chk("only Add idea at the top", [...d.querySelectorAll("#view-ideabank .page-actions button")].map(b => b.textContent).join() === "+ Add idea");
chk("every client's ideas, with the client named", rows().length === 2 && page().includes("Grad Gig") && page().includes("Fully Launched"), rows());
chk("each idea has only Star and Edit", [...d.querySelectorAll("#ideaDb [data-idea]")].every(r => [...r.querySelectorAll("button")].map(b => b.textContent).join() === "☆,Edit"));
d.querySelector(`#ideaClients .chip[data-c="${GG}"]`).click(); await settle();
chk("client filter on the page narrows it", JSON.stringify(rows()) === JSON.stringify(["From r/Naperville"]) && d.querySelector(`#globalClientFilter .chip[data-c="${GG}"]`).classList.contains("active"), rows());

// Add an idea with a screenshot.
[...d.querySelectorAll("#view-ideabank .page-actions button")].find(b => b.textContent === "+ Add idea").click(); await settle();
chk("form opens on the filtered client", d.getElementById("ifClient").value === GG);
d.getElementById("ifBody").value = "Snow rules for seniors. What the city actually says.";
d.getElementById("ifLinks").value = "https://app.sandcastles.ai/v/123";
d.getElementById("ifSource").value = "sandcastles";
d.getElementById("ifDate").value = "2026-11-14";
pickFile(op, "ifFiles", "shot.png", "image/png");
d.getElementById("ifSave").click(); await settle(); await new Promise(r => setTimeout(r, 30)); await settle();
const added = (await db.query(`select title, body, links, source, requested_post_date, attachments, status, starred from social_ideas where source='sandcastles'`)).rows[0];
chk("idea saved: title from the first sentence, link, date, screenshot, not starred", added && added.title === "Snow rules for seniors." && added.links[0].includes("sandcastles") && String(added.requested_post_date).startsWith("2026-11-14") && added.attachments[0].kind === "image" && added.status === "new" && added.starred === false, added);
chk("screenshot went to the ideas bucket", op.ui.log.some(l => l.upload && l.upload.bucket === "ideas"));
chk("newest first", rows()[0].startsWith("Snow rules"), rows());

// Star: saved, and starred ideas go to the top.
const btnIn = (title, txt) => [...[...d.querySelectorAll("#ideaDb [data-idea]")].find(r => r.textContent.includes(title)).querySelectorAll("button")].find(b => b.textContent === txt);
btnIn("Naperville", "☆").click(); await settle(); await new Promise(r => setTimeout(r, 20)); await settle();
const st = (await db.query(`select starred, starred_at from social_ideas where title like 'Is it too small%'`)).rows[0];
chk("star saves with the time", st.starred === true && !!st.starred_at, st);
chk("starred idea goes to the top", rows()[0] === "From r/Naperville" && !!btnIn("Naperville", "★"), rows());
chk("sidebar shows the starred count", d.getElementById("navBankN").textContent === "★ 1" && !d.getElementById("navBankN").hidden);
btnIn("Naperville", "★").click(); await settle(); await new Promise(r => setTimeout(r, 20)); await settle();
chk("unstar saves", (await db.query(`select starred, starred_at from social_ideas where title like 'Is it too small%'`)).rows[0].starred === false && rows()[0].startsWith("Snow rules"));

// Ideas already on a card or rejected leave the list.
await db.exec(`update social_ideas set status='used' where title like 'Is it too small%'`);
await op.w.loadLiveData(); await settle();
chk("ideas on a card drop off", !rows().some(r => r.includes("Naperville")), rows());

// Edit, delete.
btnIn("Snow rules", "Edit").click(); await settle();
d.getElementById("ifFormat").value = "Local guide"; d.getElementById("ifSave").click(); await settle();
chk("edit saves", (await db.query(`select format from social_ideas where source='sandcastles'`)).rows[0].format === "Local guide");
btnIn("Snow rules", "Edit").click(); await settle();
[...d.querySelectorAll(".modal-box button")].find(b => b.textContent === "Delete").click(); await settle();
chk("delete removes it", !(await db.query(`select 1 from social_ideas where source='sandcastles'`)).rows.length);
chk("no page errors", !op.ui.errors.length, op.ui.errors);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
