// Client onboarding end to end (migration 008, /welcome, the operator's
// Clients page and the client portal):
//   - the database: only that client (or an operator) can save its steps
//   - a new client clicks their invite and walks every step of /welcome
//   - the operator sees their progress and what they sent
//   - the client portal shows the documents and a way back into onboarding
//   - /welcome?mode=reset sets a new password for anyone
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { as, openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e", ED = "00000000-0000-0000-0000-00000000000b";
const NC = "d44e6fc3-dfea-42dc-902c-54724441040d", OTHER = "d44e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${CL}','pat@newco.test',now()),('${CL2}','sam@other.test',now()),('${ED}','ed@x',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','ed@x');
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email) values
    ('${NC}','NewCo','newco','self-serve','Pat Lee','pat@newco.test'),
    ('${OTHER}','OtherCo','otherco','concierge','Sam','sam@other.test');
  insert into social_client_users (id,client_id,email) values ('${CL2}','${OTHER}','sam@other.test');
  insert into social_drive_folder_links (client_id, footage_uploads, important_documents, previous_content, root)
    values ('${NC}','https://drive/raw','https://drive/important','https://drive/previous','https://drive/root');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count) values ('${NC}','pat@newco.test',now(),1);
`);
const row = async () => (await db.query(`select * from social_client_onboarding where client_id='${NC}'`)).rows[0];

// ── The database rules ──
chk("another client can't save NewCo's steps", !!(await as(CL2, `select * from social_client_onboarding_save('${NC}','password','{}')`)).error);
chk("an editor can't either", !!(await as(ED, `select * from social_client_onboarding_save('${NC}','password','{}')`)).error);
chk("an operator can", !(await as(OP, `select * from social_client_onboarding_save('${OTHER}','footage','{}')`)).error);
chk("a voice memo outside the client's own folder is refused", /this client's folder/.test((await as(OP, `select * from social_client_onboarding_save('${NC}','voice_memo','{"path":"${OTHER}/x.webm"}')`)).error?.message || ""));
chk("unknown steps are refused", !!(await as(OP, `select * from social_client_onboarding_save('${NC}','hack','{}')`)).error);
chk("clients read only their own onboarding", (await as(CL2, `select count(*)::int n from social_client_onboarding`)).data[0].n === 1);
await db.exec(`insert into social_client_generated_docs (client_id, kind, title, body_md) values ('${OTHER}','customer_data','OtherCo: Customer Data','# x')`);
chk("clients read only their own documents", (await as(CL, `select count(*)::int n from social_client_generated_docs`)).data[0].n === 0);

// ── NewCo's contact clicks the invite: /welcome ──
let w = await openPage("welcome.html", CL, "https://fl.test/welcome", {
  fetch: async (u) => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
});
const $ = s => w.d.querySelector(s);
const cur = () => $("#stepBody section")?.dataset.current;
const nextBtn = () => $("#stepBody [data-next]");
const err = () => $("#stepBody [data-err]")?.textContent;
chk("the invite claims the login for NewCo", (await db.query(`select client_id from social_client_users where id='${CL}'`)).rows[0]?.client_id === NC);
chk("starts on Create your password", cur() === "password" && $("#stepBody h1").textContent === "Create your password");
chk("steps for a client who films include Your brand", Array.from(w.d.querySelectorAll("#steps button")).map(b => b.textContent).join("|") ===
  "Password|Welcome|Your brand|The questions|Voice memo|Your footage|Your documents|Your portal");
$("#pw1").value = "short"; $("#pw2").value = "short"; nextBtn().click(); await settle();
chk("too-short password is caught", /8 characters/.test(err()) && cur() === "password");
$("#pw1").value = "longenough1"; $("#pw2").value = "different1"; nextBtn().click(); await settle();
chk("mismatched passwords are caught", /match/.test(err()));
$("#pw2").value = "longenough1"; nextBtn().click(); await settle();
chk("password saved with Supabase and recorded", w.ui.log.some(l => l.updateUser && l.updateUser.password === "longenough1") && !!(await row()).password_set_at && cur() === "welcome");
nextBtn().click(); await settle();
chk("then Your brand, with the Important Documents folder", cur() === "brand" && $('#stepBody a[href="https://drive/important"]'));
$("#bFonts").value = "Inter, Playfair"; $('[data-hex="0"]').value = "#04101f"; $('[data-hex="1"]').value = "#C4AB82"; $("#bAesthetic").value = "clean and warm";
nextBtn().click(); await settle();
let r = await row();
chk("brand saved", r.brand.fonts === "Inter, Playfair" && r.brand.colors.join() === "#04101f,#C4AB82" && r.brand.aesthetic === "clean and warm" && cur() === "questions", r.brand);
chk("the questions are all there", w.d.querySelectorAll("#stepBody .qitem").length === 19 && $("#stepBody").textContent.includes("What tips them over right before they find you"));
$('[data-ans="best"]').value = "Busy parents"; nextBtn().click(); await settle();
chk("written notes saved", (await row()).answers.best === "Busy parents" && cur() === "memo");
// Upload a recording from a file (a microphone isn't available here).
const file = new w.w.File(["x".repeat(2048)], "memo.m4a", { type: "audio/mp4" });
Object.defineProperty($("#memoFile"), "files", { value: [file] });
$("#memoFile").dispatchEvent(new w.w.Event("change")); await settle();
chk("a chosen file shows Send my voice memo", $("#memoReady").style.display !== "none");
$("#memoUpload").click(); await settle();
const up = w.ui.log.find(l => l.upload);
r = await row();
chk("uploaded into NewCo's private folder", up && up.upload.bucket === "onboarding-audio" && up.upload.path.startsWith(NC + "/") && up.upload.path.endsWith(".m4a"), up);
chk("recorded, and documents start building", r.voice_memo_path === up.upload.path && r.docs_status === "processing");
chk("the document service is asked to build them", w.ui.log.some(l => l.fetch === "/api/voice-memo" && JSON.parse(l.body).clientId === NC));
chk("then Your footage, with the Previous Content folder", cur() === "footage" && $('#stepBody a[href="https://drive/previous"]'));
$("#stepBody [data-uploaded]").click(); await settle();
chk("footage done", !!(await row()).footage_done_at && cur() === "docs");
chk("documents step waits while they build", $("#stepBody").textContent.includes("We're building"));
// The documents finish building (as api/voice-memo.js would).
await db.exec(`update social_client_onboarding set docs_status='ready' where client_id='${NC}';
  insert into social_client_generated_docs (client_id, kind, title, body_md) values
  ('${NC}','customer_data','NewCo: Customer Data','# NewCo: Customer Data\n## 1. Pains, verbatim\n1. "we never have time"\n*Founder, on time.*'),
  ('${NC}','your_voice','NewCo: Your Voice','# NewCo: Your Voice\n- **Pillar** [To confirm]')`);
w.w.eval("refresh().then(render)"); await settle();
chk("documents show when ready, rendered", $("#stepBody").textContent.includes("NewCo: Customer Data") && $("#stepBody li").textContent.includes("we never have time") && $("#stepBody i"));
nextBtn().click(); await settle();
chk("reading them is recorded", !!(await row()).docs_seen_at && cur() === "tour");
w.ui.errors.length = 0;
nextBtn().click(); await settle();
chk("finishing marks onboarding done", !!(await row()).completed_at);
chk("no page errors on /welcome (besides leaving the page)", w.ui.errors.every(e => /navigation/i.test(e)), w.ui.errors);

// Coming back later: straight to the step they left off (here: done → last step).
w = await openPage("welcome.html", CL, "https://fl.test/welcome");
chk("returning after finishing opens on the last step", w.d.querySelector("#stepBody section").dataset.current === "tour");

// A client who doesn't film: no brand step.
w = await openPage("welcome.html", CL2, "https://fl.test/welcome");
chk("we-film client: no Your brand step", !Array.from(w.d.querySelectorAll("#steps button")).some(b => b.textContent.includes("brand")));

// ── Operator: progress, what they sent, preview ──
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const ncRow = Array.from(op.d.querySelectorAll("#allClientsList .row")).find(r => r.textContent.includes("NewCo"));
chk("Clients list shows onboarding progress", ncRow.textContent.includes("Onboarding done") && Array.from(ncRow.querySelectorAll("button")).some(b => b.textContent === "Resend invite"), ncRow.textContent);
Array.from(ncRow.querySelectorAll("button")).find(b => b.textContent === "Onboarding").click(); await settle();
const box = op.d.getElementById("videoModalBox").textContent;
chk("Onboarding view: brand, notes, documents, voice memo, preview", box.includes("Inter, Playfair") && box.includes("Busy parents") && box.includes("NewCo: Customer Data")
  && !!op.d.querySelector('#videoModalBox a[href^="https://signed/"]') && !!op.d.querySelector('#videoModalBox a[href="/welcome?client=newco"]'), box.slice(0, 300));
op.w.closeVideoModal();
// New client form: email is required; creating sends the invite.
const opI = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html", {
  fetch: async (u, o) => ({ ok: true, status: 200, json: async () => ({ sent: false, link: "https://supabase/verify?token=abc", reason: "Email sending isn't set up yet (RESEND_API_KEY). Copy the link and send it yourself.", email: "jo@fresh.test" }) }),
});
opI.d.getElementById("newClientBtn").click(); await settle();
opI.d.getElementById("cpName").value = "FreshCo"; opI.d.getElementById("cpName").dispatchEvent(new opI.w.Event("input"));
opI.d.getElementById("cpSave").click(); await settle();
chk("new client needs a contact email", /contact email/.test(opI.d.getElementById("cpError").textContent) && !(await db.query("select 1 from social_clients where name='FreshCo'")).rows.length);
opI.d.getElementById("cpContactEmail").value = "jo@fresh.test"; opI.d.getElementById("cpImportant").value = "https://drive/fresh-important";
opI.d.getElementById("cpSave").click(); await settle();
const fresh = (await db.query("select c.id, f.important_documents from social_clients c left join social_drive_folder_links f on f.client_id=c.id where c.name='FreshCo'")).rows[0];
chk("created with its folders", fresh && fresh.important_documents === "https://drive/fresh-important");
chk("…and its invite is sent right away", opI.ui.log.some(l => l.fetch === "/api/invite" && JSON.parse(l.body).clientId === fresh.id));
chk("no email service yet: the link is there to copy", opI.d.getElementById("videoModalBox").textContent.includes("Send this link yourself") && opI.d.getElementById("invLink").value === "https://supabase/verify?token=abc");

// ── Client portal: documents and the way back into onboarding ──
await db.exec(`update social_client_onboarding set completed_at=null where client_id='${NC}'`);
const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/newco");
chk("unfinished onboarding: a Continue card on To Do", cl.d.getElementById("onboardBanner").textContent.includes("Finish setting up") && cl.d.querySelector('#onboardBanner a[href="/welcome"]'));
const readBtn = Array.from(cl.d.querySelectorAll("#docsList button")).find(b => b.closest(".row").textContent.includes("NewCo: Your Voice"));
chk("Documents lists the documents built from the voice memo", !!readBtn && cl.d.getElementById("docsList").textContent.includes("NewCo: Customer Data"));
readBtn.click(); await settle();
chk("…and opens them to read", cl.d.getElementById("videoModalBox").textContent.includes("[To confirm]"));

// ── Forgot password → /welcome?mode=reset works for anyone ──
const ed = await openPage("welcome.html", ED, "https://fl.test/welcome?mode=reset");
chk("reset page: just the new password step", ed.d.querySelector("#stepBody h1").textContent === "Set a new password" && !ed.d.querySelector("#steps button"));
ed.d.getElementById("pw1").value = "brandnew99"; ed.d.getElementById("pw2").value = "brandnew99";
ed.d.querySelector("#stepBody [data-next]").click(); await settle();
chk("reset saves the new password", ed.ui.log.some(l => l.updateUser && l.updateUser.password === "brandnew99"));
const login = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
login.d.getElementById("authEmail").value = "someone@x"; login.d.getElementById("authForgot").click(); await settle();
const rs = login.ui.log.find(l => l.reset);
chk("Forgot password now lands on /welcome?mode=reset", rs && rs.reset === "someone@x" && rs.opts.redirectTo === "https://fl.test/welcome?mode=reset", rs);

// Before migration 008 is run: saving a client still works (the new folder columns are skipped).
await db.exec(`alter table social_drive_folder_links drop column root, drop column important_documents, drop column previous_content`);
const old = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
Array.from(old.d.querySelectorAll("#allClientsList .row")).find(r => r.textContent.includes("OtherCo")).querySelector("button:last-child").click(); await settle();
old.d.getElementById("cpFootage").value = "https://drive/other-raw"; old.d.getElementById("cpImportant").value = "https://drive/x";
old.d.getElementById("cpSave").click(); await settle();
chk("before migration 008, editing a client still saves", (await db.query(`select footage_uploads from social_drive_folder_links where client_id='${OTHER}'`)).rows[0]?.footage_uploads === "https://drive/other-raw" && !old.d.getElementById("cpError").textContent, old.d.getElementById("cpError").textContent);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
