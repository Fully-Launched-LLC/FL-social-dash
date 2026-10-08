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
const FL = "d44e6fc3-dfea-42dc-902c-54724441040d", OC = "e55e6fc3-dfea-42dc-902c-54724441040e";
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email,invited_at,invite_count) values ('${ED}','Sam Rivera','sam@x',now(),1);
  insert into social_clients (id,name,slug,client_system) values ('${FL}','Fully Launched','test-fully-launched','self-serve'),('${OC}','Other Co','other-co','self-serve');
  insert into social_drive_folder_links (client_id, brand_voice, footage_uploads, final_edits) values ('${FL}','https://docs.google.com/brand','https://drive.google.com/drive/folders/rawfootage01','https://drive.google.com/drive/folders/finaledits01');
  insert into social_client_documents (client_id,title,url,position,team_only) values ('${FL}','Customer Data','https://docs.google.com/cd',0,false),('${FL}','Content Research','https://docs.google.com/cr',1,true);
  insert into social_videos (client_id,title,status,editor_id,due_to_edit,editor_brief,final_cut_url) values
    ('${FL}','Due soon','with_editor','${ED}','${iso(1)}','{"instructions":"Fast cuts.","rawFootageUrl":"https://drive.google.com/drive/folders/ownraw0001","revisions":"0:12  Make the logo bigger\\nWhole video  Music a bit quieter"}','https://drive.google.com/drive/folders/ownfinal001'),
    ('${FL}','Due later','with_editor','${ED}','${iso(10)}','{}',null),
    ('${FL}','Late one','with_editor','${ED}','${iso(-2)}','{}',null),
    ('${OC}','Other client edit','with_editor','${ED}','${iso(5)}','{}',null);
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
chk("…the dashboard isn't loaded or reachable until then", !ed.ui.log.some(l => l.table === "social_videos") && !ed.d.getElementById("queueList").children.length && ed.d.body.classList.contains("setup-mode"), ed.ui.log.filter(l => l.table).map(l => l.table));
// Coming back without the invite link, still no password: the same page.
const back = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
chk("…and every visit asks again until it's made", back.d.getElementById("view-setup").classList.contains("active") && !back.d.querySelector("#view-queue.active"));
ed.d.getElementById("pw1").value = "short"; ed.d.getElementById("pwGo").click(); await settle();
chk("a short password is caught", ed.d.getElementById("pwErr").textContent.includes("8 characters"));
ed.d.getElementById("pw1").value = "goodpassword"; ed.d.getElementById("pw2").value = "goodpassword";
ed.d.getElementById("pwGo").click(); await settle();
const setupAt = (await db.query(`select setup_at from social_editors where id = '${ED}'`)).rows[0].setup_at;
chk("password saved, and they're marked set up", ed.ui.log.some(l => l.updateUser && l.updateUser.password === "goodpassword") && !!setupAt);

const tc = () => ed.d.getElementById("tourCard");
const seen = [], text = {};
chk("then the walkthrough starts", !!tc() && tc().textContent.includes("Step 1 of 10"), tc() && tc().textContent);
for (let k = 0; k < 10; k++) { const h = tc().querySelector("h2").textContent; seen.push(h); text[h] = tc().textContent; tc().querySelector("[data-tour-next]").click(); await settle(); }
chk("it walks To Edit, Time sensitive, when an edit is due, revisions, the three steps, Calendar, Important documents",
  seen.join("|") === "To Edit|Time sensitive|Filter and sort|When an edit is due|Revisions|1. Get the raw footage|2. Edit it|3. Upload the finished video|Calendar|Important documents", seen);
chk("…explaining revisions with their moments, and where footage and uploads go", /Watch with the comments/.test(text["Revisions"]) && /Open the raw footage/.test(text["1. Get the raw footage"]) && /Open the upload folder/.test(text["3. Upload the finished video"]));
chk("…explaining the Edit by date and the documents", /Edit by/.test(text["When an edit is due"]) && /Customer Data/.test(text["Important documents"]) && /Content Research/.test(text["Important documents"]));
chk("then: bookmark this page", tc().textContent.includes("Bookmark this page") && tc().textContent.includes("fl.test"));
tc().querySelector("[data-tour-done]").click();
chk("Got it closes it, back on To Edit, ?setup gone", !tc() && ed.d.querySelector(".view.active").id === "view-queue" && !ed.w.location.search.includes("setup"));

// The filters.
const titles = () => Array.from(ed.d.querySelectorAll("#queueList > .card [data-open]")).map(b => b.textContent);
const chipText = k => ed.d.querySelector(`#showChips [data-show="${k}"]`).textContent.replace(/\s+/g, " ").trim();
chk("Show: All, Time sensitive and Revisions needed, with counts", chipText("all") === "All 4" && chipText("soon") === "Time sensitive 2" && chipText("revisions") === "Revisions needed 1",
  ["all", "soon", "revisions"].map(chipText));
chk("all of them, due soonest first by default", titles().join("|") === "Late one|Due soon|Other client edit|Due later", titles());
const pick = async (id, v) => { const el = ed.d.getElementById(id); el.value = v; el.dispatchEvent(new ed.w.Event("change")); await settle(); };
ed.d.querySelector('#showChips [data-show="soon"]').click(); await settle();
chk("Time sensitive: late, due in 3 days, or sent back (not the one in 10 days)", titles().join("|") === "Late one|Due soon", titles());
ed.d.querySelector('#showChips [data-show="revisions"]').click(); await settle();
chk("Revisions needed: only the one sent back", titles().join("|") === "Due soon", titles());
ed.d.querySelector('#showChips [data-show="all"]').click(); await settle();
chk("Client: lists each client they edit for", Array.from(ed.d.querySelectorAll("#fClient option")).map(o => o.textContent).join("|") === "All clients|Fully Launched|Other Co");
await pick("fClient", OC);
chk("…and shows only that client's videos", titles().join("|") === "Other client edit" && chipText("all") === "All 1", titles());
await pick("fClient", "");
await pick("fDue", "late");
chk("Due: Overdue", titles().join("|") === "Late one", titles());
await pick("fDue", "");
await pick("fSort", "late");
chk("Order: due latest first", titles().join("|") === "Due later|Other client edit|Due soon|Late one", titles());
chk("the filters are remembered in this browser", JSON.parse(ed.w.localStorage.getItem("fs-editor-filters")).sort === "late");
await pick("fSort", "soon");
chk("this week / next week / later split at Sunday", ed.w.eval(`(() => {
  const end0 = weekEnd(0), end1 = weekEnd(1), v = d => ({ dueToEdit: d, editorBrief: {} });
  return dueMatches(v(end0), "week") && !dueMatches(v(end0), "next") && dueMatches(v(addDaysISO(end0, 1)), "next")
    && dueMatches(v(end1), "next") && dueMatches(v(addDaysISO(end1, 1)), "later") && new Date(end0 + "T00:00:00").getDay() === 0 && dueMatches(v(null), "later");
})()`));
chk("each video shows its Edit by date", ed.d.querySelectorAll("#queueList .edit-by").length === 4);
const soon = Array.from(ed.d.querySelectorAll("#queueList > .card")).find(c => c.textContent.includes("Due soon"));
const later = Array.from(ed.d.querySelectorAll("#queueList > .card")).find(c => c.textContent.includes("Due later"));
chk("revisions sit at the top of the card, each with its moment, and Watch with the comments", soon.querySelector(".ed-revisions") === soon.querySelector(".ed-revisions, .ed-steps")
  && Array.from(soon.querySelectorAll(".ed-rev .rv-time")).map(t => t.textContent).join(",") === "0:12,Whole video" && /Make the logo bigger/.test(soon.querySelector(".ed-revisions").textContent)
  && !!Array.from(soon.querySelectorAll(".ed-revisions button")).find(b => b.textContent === "Watch with the comments"));
const stepLink = (c, n) => c.querySelector(`.ed-step:nth-child(${n}) a.btn`);
chk("step 1: the video's own raw footage folder", stepLink(soon, 1)?.textContent === "Open the raw footage" && stepLink(soon, 1).href === "https://drive.google.com/drive/folders/ownraw0001");
chk("…or the client's raw footage folder", stepLink(later, 1)?.href === "https://drive.google.com/drive/folders/rawfootage01");
chk("step 2: instructions, brand guidelines and documents", /Fast cuts/.test(soon.querySelector(".ed-step:nth-child(2)").textContent) && /Brand guidelines/.test(soon.querySelector(".ed-step:nth-child(2)").textContent) && /Customer Data/.test(soon.querySelector(".ed-step:nth-child(2)").textContent));
chk("step 3: the video's own finished folder, then Finished", stepLink(soon, 3)?.href === "https://drive.google.com/drive/folders/ownfinal001" && /this video's finished folder/.test(soon.querySelector(".ed-step:nth-child(3)").textContent)
  && !!Array.from(soon.querySelectorAll(".ed-step:nth-child(3) button")).find(b => /Finished/.test(b.textContent)));
chk("…or the client's finished video folder", stepLink(later, 3)?.href === "https://drive.google.com/drive/folders/finaledits01");
chk("no revisions box without revisions", !later.querySelector(".ed-revisions"));
const docs = ed.d.getElementById("docsByClient").textContent;
chk("Documents: the client's brand guidelines and documents, Content Research included", docs.includes("Fully Launched") && docs.includes("Brand guidelines") && docs.includes("Customer Data") && docs.includes("Content Research"), docs);

// Coming back later: no password page, no walkthrough.
const again = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
chk("once set up, the page just opens", !again.d.getElementById("view-setup").classList.contains("active") && !again.d.getElementById("tourCard"));
// An editor added by hand before invites existed (never invited) isn't asked.
await db.exec(`update social_editors set setup_at = null, invited_at = null where id = '${ED}'`);
const old = await openPage("editor/dashboard.html", ED, "https://fl.test/editor/dashboard.html");
chk("an editor added by hand (never invited) just gets their page", !old.d.getElementById("view-setup").classList.contains("active") && old.d.querySelectorAll("#queueList > .card").length === 4);
// The operator can preview the walkthrough, and never gets the password page.
const prev = await openPage("editor/dashboard.html", OP, "https://fl.test/editor/dashboard.html?tour=1");
chk("operator: ?tour=1 previews the walkthrough, no password page", !!prev.d.getElementById("tourCard") && !prev.d.getElementById("view-setup").classList.contains("active"));

chk("no page errors", !op.ui.errors.length && !ed.ui.errors.length && !back.ui.errors.length && !again.ui.errors.length && !prev.ui.errors.length, [op.ui.errors, ed.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
