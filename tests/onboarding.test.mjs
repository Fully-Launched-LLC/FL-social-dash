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
chk("starts on Create your password: its own page, no step tabs", cur() === "password" && $("#stepBody h1").textContent === "Create your password" && !w.d.querySelector("#steps button"));
chk("both password boxes have a show-password button", w.d.querySelectorAll("#stepBody [data-eye]").length === 2);
$('[data-eye="pw1"]').click();
chk("show password reveals what they typed", $("#pw1").type === "text" && $('[data-eye="pw1"]').getAttribute("aria-label") === "Hide password");
$('[data-eye="pw1"]').click();
chk("…and hides it again", $("#pw1").type === "password");
$("#pw1").value = "short"; $("#pw2").value = "short"; nextBtn().click(); await settle();
chk("too-short password is caught", /8 characters/.test(err()) && cur() === "password");
$("#pw1").value = "longenough1"; $("#pw2").value = "different1"; nextBtn().click(); await settle();
chk("mismatched passwords are caught", /match/.test(err()));
$("#pw2").value = "longenough1"; nextBtn().click(); await settle();
chk("password saved with Supabase and recorded", w.ui.log.some(l => l.updateUser && l.updateUser.password === "longenough1") && !!(await row()).password_set_at && cur() === "welcome");
const tabs = () => Array.from(w.d.querySelectorAll("#steps button"));
chk("then the steps, with tabs: Welcome, Your brand, The questions, Your footage", tabs().map(b => b.textContent.replace("✓ ", "")).join("|") === "Welcome|Your brand|The questions|Your footage", tabs().map(b => b.textContent));
chk("later steps are locked until the one before is done", tabs().slice(1).every(b => b.disabled && b.classList.contains("locked")));
tabs()[2].click(); await settle();
chk("clicking a locked step does nothing", cur() === "welcome");
chk("welcome says about 30 minutes, come back any time, with Start", /around 30 minutes/.test($("#stepBody").textContent) && /come back any time/.test($("#stepBody").textContent) && nextBtn().textContent === "Start");
nextBtn().click(); await settle();
chk("Start is recorded and opens Your brand", !!(await row()).started_at && cur() === "brand");
chk("brand: 'Upload any brand documents that you have', a drop zone, no links box", /Upload any brand documents that you have/.test($("#stepBody").textContent) && !!$('#stepBody .dropzone[data-zone="brand"]') && !$("#bLinks"));
chk("brand: continue is off until a file is uploaded", nextBtn().disabled && /I've uploaded my brand files, continue/.test(nextBtn().textContent));
chk("brand: 'I don't have any brand files' is there", $("#stepBody [data-none]").textContent === "I don't have any brand files");
w.w.eval(`handleFiles("brand", [{ file: new File(["logo-bytes"], "Our Logo.png", { type: "image/png" }), rel: "Our Logo.png" }, { file: new File(["guide"], "brand guide.pdf", { type: "application/pdf" }), rel: "brand guide.pdf" }], () => render())`); await settle();
const ups = w.ui.log.filter(l => l.upload);
chk("brand files upload to the onboarding bucket, in NewCo's brand folder", ups.length === 2 && ups.every(u => u.upload.bucket === "onboarding" && u.upload.path.startsWith(NC + "/brand/")) && ups.some(u => u.upload.path.endsWith("Our_Logo.png")), ups);
chk("each upload is listed with a tick, and saved as it lands", $('[data-list="brand"]').textContent.includes("✓ Our Logo.png") && (await row()).brand.uploads.length === 2);
chk("brand: continue turns on once something's uploaded", !nextBtn().disabled);
nextBtn().click(); await settle();
let r = await row();
chk("brand done (uploaded, both files kept)", r.brand.files === "uploaded" && r.brand.done === true && r.brand.uploads.length === 2 && cur() === "questions", r.brand);
chk("the questions are all there on one page", w.d.querySelectorAll("#stepBody .qitem").length === 30 && $("#stepBody").textContent.includes("What just happened in their life or business right before they found you"));
chk("story prompts are marked, with the 'name it, tell it on camera' note", w.d.querySelectorAll("#stepBody .qitem.story").length === 6 && $("#stepBody").textContent.includes("we'll ask you on camera"));
chk("the voice memo is on the same page, no texting a number", !!$("#stepBody [data-memo]") && !$("#stepBody").textContent.includes("980-312-1255") && !w.d.querySelector('[data-step="memo"]'));
chk("no recorder in this browser: upload a recording instead", !$("#stepBody [data-rec]") && !!$("#stepBody [data-memo-pick]"));
chk("questions: continue is off until the voice memo is saved", nextBtn().disabled);
w.ui.log.length = 0;
w.w.eval(`saveMemoFile(new File(["audio-bytes"], "My memo.m4a", { type: "audio/mp4" }), () => render())`); await settle();
r = await row();
const memoUp = w.ui.log.find(l => l.upload);
chk("the voice memo uploads to NewCo's voice-memo folder and is recorded", memoUp && memoUp.upload.path.startsWith(NC + "/voice-memo/") && memoUp.upload.path.endsWith(".m4a") && r.voice_memo_path === memoUp.upload.path && !!r.voice_memo_uploaded_at, memoUp);
chk("saved shows on the page, and continue turns on", /Your voice memo is saved/.test($("#stepBody").textContent) && !nextBtn().disabled);
nextBtn().click(); await settle();
chk("then Your footage: files, folders, or a Google Drive link", cur() === "footage" && !!$('#stepBody .dropzone[data-zone="footage"] [data-pick-folder]') && !!$("#driveLink") && /Upload all of your existing footage/.test($("#stepBody").textContent));
chk("footage: done is off until a file or a link", nextBtn().disabled);
w.ui.log.length = 0;
w.w.eval(`handleFiles("footage", [{ file: new File(["video-bytes"], "clip1.mov", { type: "video/quicktime" }), rel: "Shoot 1/clip1.mov" }], () => render())`); await settle();
const fUp = w.ui.log.find(l => l.upload);
chk("footage keeps its folder path, at full quality (sent as-is)", fUp && fUp.upload.path.startsWith(NC + "/footage/") && fUp.upload.path.endsWith("/Shoot_1/clip1.mov") && fUp.upload.size === 11 && fUp.upload.type === "video/quicktime", fUp);
r = await row();
chk("footage files are saved as they land, without finishing the step", r.footage.files.length === 1 && !r.footage_done_at);
$("#driveLink").value = "https://drive.google.com/drive/folders/abc"; $("#driveLink").dispatchEvent(new w.w.Event("input"));
w.ui.errors.length = 0;
nextBtn().click(); await settle();
r = await row();
chk("finishing saves the footage and the Drive link, and marks onboarding done", !!r.footage_done_at && r.footage.drive_link === "https://drive.google.com/drive/folders/abc" && r.footage.files.length === 1 && !!r.completed_at, r.footage);
chk("no page errors on /welcome (besides leaving the page)", w.ui.errors.every(e => /navigation/i.test(e)), w.ui.errors);

// The invite link from our own email: /welcome?token_hash=…&type=invite signs in on the page.
const tok = await openPage("welcome.html", CL, "https://fl.test/welcome?client=newco&token_hash=hash123&type=invite");
const vo = tok.ui.log.find(l => l.verifyOtp);
chk("an invite link with token_hash signs in on our page (verifyOtp) and drops it from the address", vo && vo.verifyOtp.token_hash === "hash123" && vo.verifyOtp.type === "invite" && !tok.w.location.search.includes("token_hash") && tok.w.location.search.includes("client=newco"), vo);
// An invite link opened a second time (already used / expired).
const exp = await openPage("welcome.html", null, "https://fl.test/welcome?client=newco#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
chk("an expired or used link says so on the sign-in screen", /expired or was already used/.test(exp.d.getElementById("authError").textContent) && !exp.w.location.hash, exp.d.getElementById("authError").textContent);

// Coming back later: every step open, on the last one.
w = await openPage("welcome.html", CL, "https://fl.test/welcome");
chk("returning after finishing: all steps open, on the last step", w.d.querySelector("#stepBody section").dataset.current === "footage" && Array.from(w.d.querySelectorAll("#steps button")).every(b => !b.disabled));

// "I don't have any brand files" moves on too (a client who hasn't started).
await db.exec(`update social_client_onboarding set started_at=now(), password_set_at=now() where client_id='${OTHER}'`);
w = await openPage("welcome.html", CL2, "https://fl.test/welcome");
chk("every client gets the brand step now", w.d.querySelector("#stepBody section").dataset.current === "brand");
w.d.querySelector("#stepBody [data-none]").click(); await settle();
const o2 = (await db.query(`select brand from social_client_onboarding where client_id='${OTHER}'`)).rows[0].brand;
chk("'I don't have any brand files' is saved and goes to the questions", o2.files === "none" && o2.done === true && w.d.querySelector("#stepBody section").dataset.current === "questions", o2);

// Later, Tait adds their documents by hand and the transcript (as he would on the operator dashboard).
await db.exec(`insert into social_client_documents (client_id, title, url, position) values ('${NC}','NewCo: Customer Data (Google Doc)','https://docs.google.com/document/d/cd',0);
  update social_client_onboarding set docs_status='ready', transcript='we never have time' where client_id='${NC}';
  insert into social_client_generated_docs (client_id, kind, title, body_md) values
  ('${NC}','customer_data','NewCo: Customer Data','# NewCo: Customer Data\n## 1. Pains, verbatim\n1. "we never have time"\n*Founder, on time.*'),
  ('${NC}','your_voice','NewCo: Your Voice','# NewCo: Your Voice\n- **Pillar** [To confirm]')`);

// ── Operator: progress, what they sent, preview ──
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const ncRow = Array.from(op.d.querySelectorAll("#allClientsList .row")).find(r => r.textContent.includes("NewCo"));
chk("Clients list shows onboarding progress", ncRow.textContent.includes("Onboarding done") && Array.from(ncRow.querySelectorAll("button")).some(b => b.textContent === "Resend invite"), ncRow.textContent);
Array.from(ncRow.querySelectorAll("button")).find(b => b.textContent === "Onboarding").click(); await settle();
const box = op.d.getElementById("videoModalBox").textContent;
chk("Onboarding view: brand files, voice memo player, footage and Drive link, transcript, send-documents, preview", box.includes("Brand files (2)") && !!op.d.querySelector('#videoModalBox a[href^="https://signed/' + NC + '/brand/"]') && !!op.d.querySelector('#videoModalBox audio[src^="https://signed/' + NC + '/voice-memo/"]') && box.includes("Download the voice memo") && box.includes("https://drive.google.com/drive/folders/abc") && box.includes("1 file uploaded") && !!op.d.getElementById("obSendDocs")
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

// Straight from onboarding: the walkthrough, then "bookmark this page".
// One video they film themselves, with its own footage folder.
await db.exec(`insert into social_videos (client_id,title,hook,outline,body,filming_instructions,status,filmed_by,concept_approved_at,post_date,due_to_film,platform,editor_brief) values
  ('${NC}','Why we started','We almost quit.','- the start\n- the turn','The whole script.','Talking head. Question to ask: "Why did you start?"','to_film','client',now(),'2026-12-20','2026-12-06','{instagram}','{"rawFootageUrl":"https://drive.google.com/drive/folders/why"}');`);
const tp = await openPage("clients/portal.html", CL, "https://fl.test/clients/newco?tour=1");
const tc = () => tp.d.getElementById("tourCard");
const ringed = () => { const s = tp.d.getElementById("tourSpot"); return s && s.style.display !== "none"; };
chk("the portal opens with a walkthrough, starting at To Do", !!tc() && tc().querySelector("h2").textContent === "To Do" && tc().textContent.includes("Step 1 of 8") && /everything you need to do/.test(tc().textContent) && ringed(), tc() && tc().textContent);
chk("…and drops ?tour=1 from the address, so a reload doesn't repeat it", !tp.w.location.search.includes("tour"));
const seen = [], text = {}, onPage = {};
for (let k = 0; k < 8; k++) {
  const h = tc().querySelector("h2").textContent;
  seen.push(h); text[h] = tc().textContent;
  onPage[h] = tp.d.querySelector(".view.active").id + (h === "To film" ? ":" + tp.d.querySelector("#videoTabs .chip.active").dataset.tab : "");
  tc().querySelector("[data-tour-next]").click();
}
chk("it walks To Do, Time sensitive, To film, a card, Upload footage, film it your way, Content Calendar, Documents (no footage folder)",
  seen.join("|") === "To Do|Time sensitive|To film|Each card is one video|Upload footage on each card|Film it your way|Content Calendar|Documents", seen);
chk("…opening each page and tab as it goes", onPage["To film"] === "view-videos:film" && onPage["Content Calendar"] === "view-calendar" && onPage["Documents"] === "view-documents", onPage);
chk("…explains the hook, outline and script, uploading on each card, and filming it their way",
  /Hook.*Outline.*Script/s.test(text["Each card is one video"]) && /its own card/.test(text["Upload footage on each card"]) && /script.*outline.*question/is.test(text["Film it your way"]));
chk("…and says what each document is", /Customer Data.*target customer/s.test(text["Documents"]) && /Your Voice.*who you are and what you do/s.test(text["Documents"]), text["Documents"]);
chk("then: bookmark social.fullylaunched.com (this site) to come back and sign in", tc().textContent.includes("Bookmark this page") && tc().textContent.includes("fl.test") && /email and the password/.test(tc().textContent));
tc().querySelector("[data-tour-done]").click();
chk("Got it closes it, back on To Do", !tc() && !tp.d.getElementById("tourVeil") && !tp.d.getElementById("tourSpot") && tp.d.querySelector(".view.active").id === "view-videos");
const noTour = await openPage("clients/portal.html", CL, "https://fl.test/clients/newco");
chk("no walkthrough on a normal visit", !noTour.d.getElementById("tourCard"));

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
