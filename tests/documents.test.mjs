// Client documents: the operator adds, orders and removes them on
// Clients → Edit; the client sees them on their portal's Documents page.
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
`);

let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const openEdit = async () => { Array.from(op.d.querySelectorAll("#allClientsList button")).find(b => b.textContent === "Edit").click(); await settle(); };
const rows = () => Array.from(op.d.querySelectorAll("#cpDocs .doc-row"));
const setRow = (r, title, url) => { r.querySelector('[data-doc="title"]').value = title; r.querySelector('[data-doc="url"]').value = url; };
await openEdit();
chk("Documents section on the client form, empty to start", !!op.d.getElementById("cpDocs") && rows().length === 0);
op.d.getElementById("cpAddDoc").click(); op.d.getElementById("cpAddDoc").click(); op.d.getElementById("cpAddDoc").click(); await settle();
setRow(rows()[0], "Brand Voice", "https://docs.google.com/voice");
setRow(rows()[1], "Customer Data", "not a link");
op.d.getElementById("cpSave").click(); await settle();
chk("a bad link is caught", op.d.getElementById("cpError").textContent.includes("https://") && (await db.query("select count(*)::int n from social_client_documents")).rows[0].n === 0);
setRow(rows()[1], "Customer Data", "https://docs.google.com/customers");
op.d.getElementById("cpSave").click(); await settle();
let docs = (await db.query("select title, url, position from social_client_documents order by position")).rows;
chk("saved in order; the empty row is ignored", docs.map(d => d.title + "@" + d.position).join() === "Brand Voice@0,Customer Data@1", docs);

// Client sees them on Documents, under Content Calendar.
let cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
const navs = Array.from(cl.d.querySelectorAll(".nav-item")).map(n => n.textContent.trim());
chk("Documents sits right under Content Calendar", navs.indexOf("Documents") === navs.indexOf("Content Calendar") + 1, navs);
const links = () => Array.from(cl.d.querySelectorAll("#docsList .row")).map(r => r.querySelector("b").textContent + "→" + r.querySelector("a").href);
chk("client sees both documents with Open links", links().join() === "Brand Voice→https://docs.google.com/voice,Customer Data→https://docs.google.com/customers", links());

// Remove one, rename the other.
op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
await openEdit();
chk("existing documents load into the form", rows().length === 2 && rows()[0].querySelector('[data-doc="title"]').value === "Brand Voice");
rows()[0].querySelector("button").click(); await settle();
rows()[0].querySelector('[data-doc="title"]').value = "Customer Data (2026)";
op.d.getElementById("cpSave").click(); await settle();
docs = (await db.query("select title from social_client_documents")).rows;
chk("removed and renamed", docs.map(d => d.title).join() === "Customer Data (2026)", docs);
cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
chk("client sees the update", links().join() === "Customer Data (2026)→https://docs.google.com/customers", links());

// Team only (migration 012): Content Research is for Tait and the editors.
op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
await openEdit();
op.d.getElementById("cpAddDoc").click(); await settle();
setRow(rows()[1], "Content Research", "https://docs.google.com/research");
rows()[1].querySelector('[data-doc="team"]').checked = true;
op.d.getElementById("cpSave").click(); await settle();
docs = (await db.query("select title, team_only from social_client_documents order by position")).rows;
chk("Team only is saved per document", docs.map(d => d.title + ":" + d.team_only).join() === "Customer Data (2026):false,Content Research:true", docs);
op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
await openEdit();
chk("…and loads back into the form", rows()[1].querySelector('[data-doc="team"]').checked && !rows()[0].querySelector('[data-doc="team"]').checked);
cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
chk("the client never sees a Team only document", links().join() === "Customer Data (2026)→https://docs.google.com/customers", links());
const ED = "00000000-0000-0000-0000-00000000000e";
await db.exec(`insert into auth.users (id) values ('${ED}');
  insert into social_editors (id,name,email) values ('${ED}','Ed','ed@x');
  insert into social_videos (client_id,title,status,editor_id) values ('${FL}','Edit me','with_editor','${ED}');`);
const ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
const edLinks = Array.from(ed.d.querySelectorAll("#queueList a.btn")).map(a => a.textContent);
chk("the editor sees the client's documents on the video, Content Research included", edLinks.includes("Customer Data (2026)") && edLinks.includes("Content Research"), edLinks);
await db.exec("delete from social_videos");

// Empty state.
await db.exec("delete from social_client_documents");
cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/test-fully-launched");
chk("empty state", cl.d.getElementById("docsList").textContent.includes("No documents yet"));

chk("no page errors", !op.ui.errors.length && !cl.ui.errors.length, [op.ui.errors, cl.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
