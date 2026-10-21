// Unify Phase 8 (migrations 026 + 031): the Agent room. Cards from
// social_agent_status (the bridge fills it from Paperclip), stuck and
// needs-you first, Try again / Pause / Resume as requests the bridge
// carries out, the "out of date" notice. Operators only.
import { readFileSync } from "fs";
import { freshDb, makeHarness, checker, REPO } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle, as } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);
const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const GG = "11111111-1111-1111-1111-111111111111";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system) values ('${GG}','Grad Gig','gg','self-serve');
  insert into social_client_users (id,client_id,email) values ('${CL}','${GG}','gg@x');
  insert into social_agent_status (agent, status, working_on, client_id, paperclip_task, last_line, last_run_at, updated_at) values
    ('Content Editor','working','edit the video: Leaf rules','${GG}','FUL-40','Rendering v2', now(), now());
  update social_agent_status set handoffs = '[{"from":"Content Editor","to":"Tait","task":"Grad Gig: Leaf rules v2 to review"},{"from":"Tait","to":"Content Editor","task":"Grad Gig: edit Leaf rules"}]' where agent='Content Editor';
  insert into social_agent_status (agent, status, stuck_on, needs_from_tait, updated_at) values
    ('Content Researcher','stuck','Claude run failed: session limit','Your Claude usage limit was hit.', now());
  insert into social_agent_status (agent, status, updated_at) values ('Content Writer','idle', now());
`);
chk("client can't read the Agent room", !(await as(CL, `select * from social_agent_status`)).data.length);
chk("client can't ask for agent actions", !!(await as(CL, `insert into social_agent_requests (agent, action) values ('Content Editor','pause')`)).error);

const html = readFileSync(REPO + "dashboards/dist/operator/dashboard.html", "utf8");
chk("the live graph is back (d3), the team-room paste isn't", html.includes("d3@7.9.0") && html.includes('id="aiGraph"') && !html.includes("aiAddBtn") && !html.includes("social_ai_team_messages"));
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = op.d;
const nav = d.querySelector('.nav-item[data-view="aiteam"]');
chk("sidebar says Agent room, with a count of agents that need you", nav.textContent.startsWith("Agent room") && d.getElementById("navAgentN").textContent === "1");
nav.click(); await settle();
const cards = () => [...d.querySelectorAll("#agentGrid .agent-card")];
chk("stuck first, then working, then idle", cards().map(c => c.dataset.agent).join("|") === "Content Researcher|Content Editor|Content Writer", cards().map(c => c.dataset.agent));
const ed = cards().find(c => c.dataset.agent === "Content Editor");
chk("working card: client + task, task id, last line, Working", ed.textContent.includes("Grad Gig · edit the video: Leaf rules") && ed.textContent.includes("FUL-40") && ed.textContent.includes("Rendering v2") && ed.querySelector(".agent-state").textContent === "Working");
chk("job line from team.json", ed.textContent.includes("Edits footage"));
const rs = cards().find(c => c.dataset.agent === "Content Researcher");
chk("stuck card: what it's stuck on and what it needs from you", rs.classList.contains("stuck") && rs.textContent.includes("session limit") && rs.textContent.includes("Needs you"));
[...rs.querySelectorAll("button")].find(b => b.textContent === "Try again").click(); await settle();
chk("Try again asks the bridge", (await db.query(`select agent, action, done_at from social_agent_requests`)).rows.some(r => r.agent === "Content Researcher" && r.action === "retry" && !r.done_at));
chk("the card says it's been asked", cards().find(c => c.dataset.agent === "Content Researcher").textContent.includes("Asked: try again"));
[...cards().find(c => c.dataset.agent === "Content Writer").querySelectorAll("button")].find(b => b.textContent === "Pause").click(); await settle();
chk("Pause asks the bridge (after a confirm)", op.ui.confirms.some(m => m.includes("Pause Content Writer")) && (await db.query(`select 1 from social_agent_requests where agent='Content Writer' and action='pause'`)).rows.length === 1);
chk("graph panel starts on Tait: what's waiting on you and what you handed out", d.getElementById("aiPanel").textContent.includes("Waiting on you") && d.getElementById("aiPanel").textContent.includes("Leaf rules v2 to review") && d.getElementById("aiPanel").textContent.includes("edit Leaf rules → Content Editor"), d.getElementById("aiPanel").textContent);
chk("fresh data: no out-of-date notice", !d.getElementById("agentNotice").textContent.includes("out of date"));
await db.exec(`update social_agent_status set updated_at = now() - interval '1 hour'`);
const op2 = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html#aiteam"); await settle();
chk("old data: says the bridge needs to run", op2.d.getElementById("agentNotice").textContent.includes("out of date") && op2.d.getElementById("agentNotice").textContent.includes("bridge/start.sh"));
chk("no page errors", !op.ui.errors.length && !op2.ui.errors.length, [op.ui.errors, op2.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
