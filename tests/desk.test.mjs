// Unify the System, Phase 2: My desk (5 queues) and one page per client
// (Overview, Documents, Footage, Videos), clicking the real built operator
// dashboard. Data from migration 026.
import { freshDb, makeHarness, checker } from "./harness.mjs";

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
  insert into social_drive_folder_links (client_id, footage_uploads) values ('${GG}','https://drive.google.com/drive/folders/raw');
`);
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const plan = (await one(`insert into social_monthly_plans (client_id, month, status, brief_md) values ($1,'2026-11-01','on_desk','**20 ideas** for November') returning id`, [GG])).id;
const i1 = (await one(`insert into social_ideas (client_id,title,source,format,why,plan_id,status,score) values ($1,'Leaf rules','research','Local guide','city page','${plan}','in_plan',8) returning id`, [GG])).id;
const i2 = (await one(`insert into social_ideas (client_id,title,source,plan_id,status) values ($1,'Shovel','tait','${plan}','in_plan') returning id`, [GG])).id;
const s1 = (await one(`insert into social_videos (client_id,title,status,hook,body,outline,camera_questions,filmed_by) values ($1,'Leaf rules card','script_review','h','s','o','q','client') returning id`, [GG])).id;
const s2 = (await one(`insert into social_videos (client_id,title,status,filmed_by) values ($1,'Shovel card','script_review','client') returning id`, [GG])).id;
await db.query(`insert into social_videos (client_id,title,status) values ($1,'Edit me','in_review'),($1,'Post me','ready_to_post'),($2,'FL edit','in_review')`, [GG, FL]);
const doc = (await one(`insert into social_client_generated_docs (client_id,kind,title,body_md,status,built_by) values ($1,'brand_guidelines','Brand guidelines','# Orange #F15523','on_desk','Account Manager') returning id`, [GG])).id;
await db.query(`insert into social_footage (client_id,kind,name,drive_url) values ($1,'broll','office.mov','https://drive/x')`, [GG]);

let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = () => op.d;
chk("My desk is the home page", d().getElementById("view-desk").classList.contains("active") && d().getElementById("crumbPage").textContent === "My desk");
chk("sidebar order: My desk first, then Content Ideas, Clients, Content Calendar; no To Do page", [...d().querySelectorAll(".nav-item[data-view]")].map(n => n.dataset.view).join(",").startsWith("desk,ideabank,clients,calendar") && !d().getElementById("view-todo"));
const tiles = () => [...d().querySelectorAll("#deskTiles .desk-tile")].map(t => t.textContent.trim());
chk("6 queues with counts (all clients)", JSON.stringify(tiles()) === JSON.stringify(["2Ideas to review", "2Scripts to review", "1Documents to review", "2Videos to review", "0Carousels to review", "1Videos to post"]), tiles());
chk("nav shows the desk total", d().getElementById("navDeskN").textContent === "8");
chk("plan shows its brief and ideas", d().getElementById("deskIdeas").textContent.includes("20 ideas") && d().getElementById("deskIdeas").textContent.includes("Format: Local guide"));

// Client filter narrows the desk.
d().querySelector(`#globalClientFilter .chip[data-c="${FL}"]`).click(); await settle();
chk("client filter narrows the queues", JSON.stringify(tiles()) === JSON.stringify(["0Ideas to review", "0Scripts to review", "0Documents to review", "1Videos to review", "0Carousels to review", "0Videos to post"]), tiles());
d().querySelector(`#globalClientFilter .chip[data-c="all"]`).click(); await settle();

// Ideas: approve one, reject one.
const ideaBtn = (txt, n = 0) => [...d().querySelectorAll("#deskIdeas button")].filter(b => b.textContent === txt)[n];
ideaBtn("Approve").click(); await settle();
ideaBtn("Reject").click(); await settle();
const ideas = (await db.query(`select title, status from social_ideas order by title`)).rows;
chk("approve / reject each idea", ideas.find(i => i.title === "Leaf rules").status === "approved" && ideas.find(i => i.title === "Shovel").status === "rejected", ideas);
ideaBtn("Approve the rest and close the plan").click(); await settle();
chk("closing the plan approves it and takes it off the desk", (await one(`select status from social_monthly_plans where id=$1`, [plan])).status === "approved" && tiles()[0] === "0Ideas to review", tiles());

// Scripts: client can't see them yet; approve → client sees the whole card.
chk("client can't see a card in Script review", !(await as(CL, `select id from social_videos where id=$1`, [s1])).data.length);
const scriptBtn = (vid, txt) => [...d().querySelectorAll(`#deskScripts .vrow[data-id="${vid}"] button`)].find(b => b.textContent === txt);
scriptBtn(s1, "Approve script").click(); await settle();
const card = (await as(CL, `select status, hook, body, outline, camera_questions from social_videos where id=$1`, [s1])).data[0];
chk("approved script goes to the client with the whole card", card && card.status === "concept_pending" && card.camera_questions === "q", card);
scriptBtn(s2, "Send back").click(); await settle();
d().querySelector("#sbNote").value = "Punchier hook";
d().querySelector("#sbGo").click(); await settle();
const back = await one(`select status, note, editor_brief from social_videos where id=$1`, [s2]);
chk("send back: to Scripting with the note", back.status === "scripting" && back.note === "Punchier hook" && back.editor_brief.scriptNotes[0].note === "Punchier hook", back);
chk("scripts queue now empty", tiles()[1] === "0Scripts to review");
const log = (await db.query(`select action, from_status, to_status from social_status_audit_log where video_id=$1 order by id`, [s1])).rows;
chk("script approval is logged as gate 1", log.some(l => l.action === "approve_concept" && l.from_status === "concept_pending"), log);

// Documents: client can't read it until approved.
chk("client can't read brand guidelines on the desk", !(await as(CL, `select id from social_client_generated_docs`)).data.length);
[...d().querySelectorAll("#deskDocs button")].find(b => b.textContent === "Approve").click(); await settle();
chk("approved brand guidelines: off the desk, client can read", tiles()[2] === "0Documents to review" && (await as(CL, `select kind from social_client_generated_docs`)).data.length === 1);

// Videos to review / post keep the existing buttons.
chk("videos to review have Review & comment", [...d().querySelectorAll("#deskVideos button")].some(b => b.textContent === "Review & comment"));
chk("videos to post have Mark posted", d().getElementById("deskPost").textContent.includes("Mark posted"));

// One client's page.
d().querySelector('.nav-item[data-view="clients"]').click(); await settle();
d().querySelector("#allClientsList b.video-card").click(); await settle();
chk("client page opens with tabs", d().getElementById("view-client").classList.contains("active") && [...d().querySelectorAll("#cpTabs .chip")].map(c => c.textContent).join(",") === "Overview,Documents,Moodboard,Footage,Videos,Carousels");
chk("Open their portal links to their portal", d().getElementById("cpPortal").getAttribute("href") === "/clients/fl" || d().getElementById("cpPortal").getAttribute("href") === "/clients/gg");
const openClient = async id => { op.w.openClientPage(id); await settle(); };
await openClient(GG);
d().querySelector('#cpTabs [data-cptab="docs"]').click(); await settle();
const docRows = [...d().querySelectorAll("#cpBody .doc-row")].map(r => r.textContent.replace(/\s+/g, " ").trim());
chk("Documents tab lists the 5 documents", docRows.length >= 5 && docRows[0].includes("Brand guidelines") && docRows[0].includes("Approved") && docRows[4].includes("Content research"), docRows);
[...d().querySelectorAll("#cpBody .doc-row")][1].querySelector("button").click(); await settle();
d().querySelector("#docEditBtn").click(); d().querySelector("#docEdit").value = "Parents near Wheaton"; d().querySelector("#docEditBtn").click(); await settle();
chk("write a new document (ICP) from the client page", (await one(`select status, body_md from social_client_generated_docs where client_id=$1 and kind='icp'`, [GG]))?.body_md === "Parents near Wheaton");
chk("client can't read the ICP", (await as(CL, `select kind from social_client_generated_docs`)).data.every(x => x.kind === "brand_guidelines"));
d().querySelector('#cpTabs [data-cptab="footage"]').click(); await settle();
chk("Footage tab shows the b-roll library", d().getElementById("cpBody").textContent.includes("office.mov"));
d().querySelector('#cpTabs [data-cptab="videos"]').click(); await settle();
chk("Videos tab lists this client's videos only", d().getElementById("cpBody").textContent.includes("Edit me") && !d().getElementById("cpBody").textContent.includes("FL edit"));
chk("no page errors", !op.ui.errors.length, op.ui.errors);

// Due soon (Tait, 2026-10-22): Tait's next step on each video, overdue or
// due within 3 days, soonest first; the rest stay out.
await db.query(`insert into social_videos (client_id,title,status,post_date) values
  ($1,'Post today','ready_to_post',current_date),($1,'Post later','ready_to_post',current_date + 20),($1,'Late post','ready_to_post',current_date - 2)`, [GG]);
op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const dueTitles = [...d().querySelectorAll("#deskDue .vrow b.video-card")].map(b => b.textContent);
chk("Due soon lists overdue and due-now videos, soonest first", dueTitles.join() === "Late post,Post today", dueTitles);
chk("each says what to do and when", d().getElementById("deskDue").textContent.includes("Post it · overdue since") && d().getElementById("deskDue").textContent.includes("Post it · today,"));
chk("Due soon is marked when it has something", d().getElementById("deskDueCard").classList.contains("due-hot"));
chk("no page errors after Due soon", !op.ui.errors.length, op.ui.errors);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
