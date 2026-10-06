// Editor onboarding (migration 013): the operator invites an editor from
// Editors; the editor's first visit asks for a password, then walks them
// through Time sensitive, when an edit is due, the calendar and the
// documents, then "bookmark this page".
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000e";
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d";
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email,invited_at,invite_count) values ('${ED}','Sam Rivera','sam@x',now(),1);
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fully-launched','self-serve');
  insert into social_drive_folder_links (client_id, brand_voice) values ('${FL}','https://docs.google.com/brand');
  insert into social_client_documents (client_id,title,url,position,team_only) values ('${FL}','Customer Data','https://docs.google.com/cd',0,false),('${FL}','Content Research','https://docs.google.com/cr',1,true);
  insert into social_videos (client_id,title,status,editor_id,due_to_edit) values
    ('${FL}','Due soon','with_editor','${ED}','${iso(1)}'),
    ('${FL}','Due later','with_editor','${ED}','${iso(10)}');
`);

// ── Operator: Editors page ──
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html#editors", {
  fetch: async (u, o) => ({ ok: true, status: 200, json: async () => ({ sent: true, email: JSON.parse(o.body).email || "sam@x" }) }),
});
const edRow = () => op.d.getElementById("editorsList").textContent;
chk("Editors page lists each editor and whether they've set up", edRow().includes("Sam Rivera") && edRow().includes("sam@x") && /Invited .*not set up yet/.test(edRow()), edRow());
op.d.getElementById("inviteEditorBtn").click();
op.d.getElementById("edName").value = "Jo Lee"; op.d.getElementById("edEmail").value = "jo@x.test";
op.d.getElementById("edSend").click(); await settle();
const sent = op.ui.log.filter(l => l.fetch === "/api/invite-editor").map(l => JSON.parse(l.body));
chk("+ Invite editor sends their name and email to /api/invite-editor", sent.length === 1 && sent[0].name === "Jo Lee" && sent[0].email === "jo@x.test", sent);
chk("…and says the invite is on its way", op.d.getElementById("videoModalBox").textContent.includes("Invite sent"));
op.d.querySelector('#editorsList [data-resend]').click(); await settle();
chk("Resend invite sends just the editor's id", JSON.parse(op.ui.log.filter(l => l.fetch === "/api/invite-editor").at(-1).body).editorId === ED);

// ── Editor's first visit, from the invite link ──
const ed = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html?setup=1");
const setup = ed.d.getElementById("view-setup");
chk("first visit: Create your password, nothing else", setup.classList.contains("active") && setup.textContent.includes("Create your password") && setup.textContent.includes("Welcome to the team, Sam") && !ed.d.getElementById("view-queue").classList.contains("active"));
ed.d.getElementById("pw1").value = "short"; ed.d.getElementById("pwGo").click(); await settle();
chk("a short password is caught", ed.d.getElementById("pwErr").textContent.includes("8 characters"));
ed.d.getElementById("pw1").value = "goodpassword"; ed.d.getElementById("pw2").value = "goodpassword";
ed.d.getElementById("pwGo").click(); await settle();
const setupAt = (await db.query(`select setup_at from social_editors where id = '${ED}'`)).rows[0].setup_at;
chk("password saved, and they're marked set up", ed.ui.log.some(l => l.updateUser && l.updateUser.password === "goodpassword") && !!setupAt);

const tc = () => ed.d.getElementById("tourCard");
const seen = [], text = {};
chk("then the walkthrough starts", !!tc() && tc().textContent.includes("Step 1 of 5"), tc() && tc().textContent);
for (let k = 0; k < 5; k++) { const h = tc().querySelector("h2").textContent; seen.push(h); text[h] = tc().textContent; tc().querySelector("[data-tour-next]").click(); }
chk("it walks To Edit, Time sensitive, when an edit is due, Calendar, Important documents", seen.join("|") === "To Edit|Time sensitive|When an edit is due|Calendar|Important documents", seen);
chk("…explaining the Edit by date and the documents", /Edit by/.test(text["When an edit is due"]) && /Customer Data/.test(text["Important documents"]) && /Content Research/.test(text["Important documents"]));
chk("then: bookmark this page", tc().textContent.includes("Bookmark this page") && tc().textContent.includes("fl.test"));
tc().querySelector("[data-tour-done]").click();
chk("Got it closes it, back on To Edit, ?setup gone", !tc() && ed.d.querySelector(".view.active").id === "view-queue" && !ed.w.location.search.includes("setup"));

// What the walkthrough pointed at.
const urgent = ed.d.getElementById("urgentList").textContent;
chk("Time sensitive lists the edit due tomorrow, not the one in 10 days", urgent.includes("Due soon") && !urgent.includes("Due later"), urgent);
chk("each video shows its Edit by date", ed.d.querySelectorAll("#queueList .edit-by").length === 2);
const docs = ed.d.getElementById("docsByClient").textContent;
chk("Documents: the client's brand guidelines and documents, Content Research included", docs.includes("Fully Launched") && docs.includes("Brand guidelines") && docs.includes("Customer Data") && docs.includes("Content Research"), docs);

// Coming back later: no password page, no walkthrough.
const again = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
chk("once set up, the page just opens", !again.d.getElementById("view-setup").classList.contains("active") && !again.d.getElementById("tourCard"));
// The operator can preview the walkthrough, and never gets the password page.
const prev = await openPage("editor/dashboard.html", OP, "https://fl.test/editor/dashboard.html?tour=1");
chk("operator: ?tour=1 previews the walkthrough, no password page", !!prev.d.getElementById("tourCard") && !prev.d.getElementById("view-setup").classList.contains("active"));

chk("no page errors", !op.ui.errors.length && !ed.ui.errors.length && !again.ui.errors.length && !prev.ui.errors.length, [op.ui.errors, ed.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
