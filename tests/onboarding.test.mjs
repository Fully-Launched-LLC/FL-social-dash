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
chk("clients can't write the transcript themselves (no such step)", /Unknown step/.test((await as(CL2, `select * from social_client_onboarding_save('${OTHER}','transcript','{"text":"x"}')`)).error?.message || ""));
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
  "Password|Welcome|Your brand|The questions|Voice memo|Your footage|Your portal");
$("#pw1").value = "short"; $("#pw2").value = "short"; nextBtn().click(); await settle();
chk("too-short password is caught", /8 characters/.test(err()) && cur() === "password");
$("#pw1").value = "longenough1"; $("#pw2").value = "different1"; nextBtn().click(); await settle();
chk("mismatched passwords are caught", /match/.test(err()));
$("#pw2").value = "longenough1"; nextBtn().click(); await settle();
chk("password saved with Supabase and recorded", w.ui.log.some(l => l.updateUser && l.updateUser.password === "longenough1") && !!(await row()).password_set_at && cur() === "welcome");
nextBtn().click(); await settle();
chk("then Your brand, with the Important Documents folder", cur() === "brand" && $('#stepBody a[href="https://drive/important"]'));
chk("brand step has no fonts, colors or look-and-feel boxes", !$("#bFonts") && !$("[data-hex]") && !$("#bAesthetic") && !!$("#bLinks"));
chk("brand step offers to create brand files", /I don't have any brand files yet, create them for me/.test($("#stepBody [data-create]").textContent));
$("#bLinks").value = "https://instagram.com/somebrand";
$("#stepBody [data-uploaded]").click(); await settle();
let r = await row();
chk("brand saved (files uploaded + links)", r.brand.files === "uploaded" && r.brand.links === "https://instagram.com/somebrand" && cur() === "questions", r.brand);
chk("the questions are all there", w.d.querySelectorAll("#stepBody .qitem").length === 19 && $("#stepBody").textContent.includes("What tips them over right before they find you"));
chk("the questions are a readable list, no note boxes", !$("#stepBody textarea"));
chk("the note at the top says record a voice memo and send it to Tait at the number", /Record your answers in a voice memo and send it to Tait at 980-312-1255/.test($("#stepBody").textContent));
nextBtn().click(); await settle();
chk("then the voice memo step", cur() === "memo");
chk("the voice memo step says to text it to Tait (no upload)", $("#stepBody").textContent.includes("Text the recording to Tait") && !$("#stepBody input[type=file]"));
nextBtn().click(); await settle();
chk("I've texted it is recorded", !!(await row()).voice_memo_sent_at);
chk("then Your footage, with the Previous Content folder", cur() === "footage" && $('#stepBody a[href="https://drive/previous"]'));
$("#stepBody [data-uploaded]").click(); await settle();
chk("footage done, then straight to the portal tour (no documents step)", !!(await row()).footage_done_at && cur() === "tour");
chk("no Your documents step anywhere", !Array.from(w.d.querySelectorAll("#steps button")).some(b => /documents/i.test(b.textContent)));
// Later, Tait adds their documents by hand and the transcript (as he would on the operator dashboard).
await db.exec(`insert into social_client_documents (client_id, title, url, position) values ('${NC}','NewCo: Customer Data (Google Doc)','https://docs.google.com/document/d/cd',0);
  update social_client_onboarding set docs_status='ready', transcript='we never have time' where client_id='${NC}';
  insert into social_client_generated_docs (client_id, kind, title, body_md) values
  ('${NC}','customer_data','NewCo: Customer Data','# NewCo: Customer Data\n## 1. Pains, verbatim\n1. "we never have time"\n*Founder, on time.*'),
  ('${NC}','your_voice','NewCo: Your Voice','# NewCo: Your Voice\n- **Pillar** [To confirm]')`);
w.ui.errors.length = 0;
nextBtn().click(); await settle();
chk("finishing marks onboarding done", !!(await row()).completed_at);
chk("no page errors on /welcome (besides leaving the page)", w.ui.errors.every(e => /navigation/i.test(e)), w.ui.errors);

// An invite link opened a second time (already used / expired).
const exp = await openPage("welcome.html", null, "https://fl.test/welcome?client=newco#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
chk("an expired or used link says so on the sign-in screen", /expired or was already used/.test(exp.d.getElementById("authError").textContent) && !exp.w.location.hash, exp.d.getElementById("authError").textContent);

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
chk("Onboarding view: brand choice, transcript, send-documents button, preview", box.includes("Brand files: uploaded to their Important Documents folder") && box.includes("https://instagram.com/somebrand") && !!op.d.getElementById("obSendDocs")
  && op.d.getElementById("obTranscript").value === "we never have time" && !!op.d.querySelector('#videoModalBox a[href="/welcome?client=newco"]'), box.slice(0, 300));
op.w.closeVideoModal();
// Pasting a transcript and building: too short is caught, a real one goes to the document service.
const opB = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html", {
  fetch: async (u, o) => ({ ok: true, status: 200, json: async () => ({ ok: true, flaggedQuotes: 0 }) }),
});
opB.w.confirm = () => true;
opB.w.openOnboarding(NC); await settle();
opB.d.getElementById("obSendDocs").click(); await settle();
const sendCall = opB.ui.log.find(l => l.fetch && /send-documents/.test(String(l.fetch.url || l.fetch)));
chk("Email them their documents calls /api/send-documents for that client", !!sendCall && JSON.stringify(sendCall).includes(NC), opB.ui.log.filter(l => l.fetch));
opB.w.closeVideoModal();
opB.ui.log.length = 0;
opB.w.openOnboarding(OTHER); await settle();
opB.d.getElementById("obTranscript").value = "too short"; opB.d.getElementById("obBuild").click(); await settle();
chk("a too-short transcript is caught before sending", /too short/.test(opB.d.getElementById("obErr").textContent) && !opB.ui.log.some(l => l.fetch));
const TR = "Our best customer is a busy parent. ".repeat(10);
opB.d.getElementById("obTranscript").value = TR; opB.d.getElementById("obBuild").click(); await settle();
const bd = opB.ui.log.find(l => l.fetch === "/api/build-documents");
chk("Save and build sends the pasted transcript for this client", bd && JSON.parse(bd.body).clientId === OTHER && JSON.parse(bd.body).transcript === TR.trim(), bd);
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
