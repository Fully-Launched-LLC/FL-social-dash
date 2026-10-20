// Fully AI Social (migration 025): the AI content team on the operator
// dashboard. The team comes from team/team.json baked in by build.py; the
// team room comes from social_ai_team_messages, pasted in from Claude.
// Operators only: clients and editors can't read or write the team room.
import { readFileSync } from "fs";
import { freshDb, makeHarness, checker, REPO } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const { as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d", ED = "00000000-0000-0000-0000-00000000000e";
const GG = "11111111-1111-1111-1111-111111111111", FL = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Ed','ed@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','test-grad-gig','self-serve'),('${FL}','Fully Launched','test-fl','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_ai_team_messages (client_id,from_agent,to_agent,message,file,said_at) values
    ('${GG}','Content Researcher','Tait','First pass on similar accounts.','team-room/similar-accounts.md','2026-10-20T10:00:00Z'),
    ('${FL}','Content Strategist','Content Writer','Fully Launched plan.',null,'2026-10-20T11:00:00Z');
`);

// The page and build.
const html = readFileSync(REPO + "dashboards/dist/operator/dashboard.html", "utf8");
const team = JSON.parse(readFileSync(REPO + "team/team.json", "utf8"));
chk("build baked the team in", !html.includes("/*__AI_TEAM__*/") && team.employees.every(e => html.includes(JSON.stringify(e.name))));
chk("no private training baked in (rules, idea banks, team rooms)", !/rule-proposals|idea-bank\/ideas|feedback-log/.test(html.split("const AI_TEAM")[1] || ""));

let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const nav = op.d.querySelector('.nav-item[data-view="aiteam"]');
chk("sidebar has a Fully AI Social tab with the other tabs", nav?.textContent.trim() === "Fully AI Social" && nav.parentElement === op.d.querySelector(".sidebar"));
nav.click(); await settle();
chk("tab opens with the crumb", op.d.getElementById("view-aiteam").classList.contains("active") && op.d.getElementById("crumbPage").textContent === "Fully AI Social");
const feed = () => op.d.getElementById("aiFeed").textContent;
chk("all clients: both team rooms show", feed().includes("First pass on similar accounts.") && feed().includes("Fully Launched plan."), feed());
chk("panel starts on the working employee", op.d.getElementById("aiPanel").textContent.includes("Content Researcher") && op.d.getElementById("aiPanel").textContent.includes("Working now"));

// Client filter narrows the team room.
op.d.querySelector(`#globalClientFilter .chip[data-c="${GG}"]`).click(); await settle();
chk("Grad Gig filter: only Grad Gig's team room", feed().includes("First pass") && !feed().includes("Fully Launched plan.") && op.d.getElementById("aiRoomTitle").textContent === "Grad Gig team room", feed());

// Paste an update from Claude.
op.d.getElementById("aiAddBtn").click(); await settle();
const box = op.d.getElementById("videoModalBox");
chk("update window preselects the filtered client", box.querySelector("#aiClient").value === GG);
const text = box.querySelector("#aiText");
text.value = "not json"; text.dispatchEvent(new op.w.Event("input"));
chk("bad JSON is explained, save stays off", box.querySelector("#aiError").textContent.includes("valid JSON") && box.querySelector("#aiSave").disabled);
text.value = '```json\n[{"from":"Content Expert","to":"Content Writer, Tait","message":"3 Film it, 2 Fix it.","file":"03-expert-review.md","at":"2026-10-20"},{"from":"","message":"no sender"}]\n```';
text.dispatchEvent(new op.w.Event("input"));
chk("valid messages counted, empty ones skipped", box.querySelector("#aiPreview").textContent.includes("1 message") && !box.querySelector("#aiSave").disabled);
box.querySelector("#aiSave").click(); await settle();
const rows = (await db.query("select client_id, from_agent, to_agent, file from social_ai_team_messages where from_agent='Content Expert'")).rows;
chk("saved to Grad Gig's team room", rows.length === 1 && rows[0].client_id === GG && rows[0].to_agent === "Content Writer, Tait", rows);
chk("feed shows it", feed().includes("3 Film it, 2 Fix it."));

// Operators only.
const clientRead = await as(CL, "select * from social_ai_team_messages");
const editorRead = await as(ED, "select * from social_ai_team_messages");
const clientWrite = await as(CL, `insert into social_ai_team_messages (client_id,from_agent,message) values ('${GG}','x','y')`);
chk("clients and editors can't read the team room", clientRead.data?.length === 0 && editorRead.data?.length === 0, [clientRead, editorRead]);
chk("clients can't write to it", !!clientWrite.error);

chk("no page errors", !op.ui.errors.length, op.ui.errors);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
