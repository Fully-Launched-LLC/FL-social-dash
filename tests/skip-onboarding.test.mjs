// An already-onboarded client (migration 015, like Hesedea): the invite
// only asks for a password, nothing shows before it, then the dashboard's
// walkthrough, including how to review a finished video, then bookmark.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const HE = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${CL}','mark@hesedea.test',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email) values ('${HE}','Hesedea','hesedea','concierge','Mark','mark@hesedea.test');
  insert into social_drive_folder_links (client_id, final_edits) values ('${HE}','https://drive.google.com/drive/folders/FinalEditsFolder01');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count) values ('${HE}','mark@hesedea.test',now(),1);
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,post_date,final_cut_url) values
    ('${HE}','Mark''s introduction','client_review','us',now(),'2026-10-12','https://drive.google.com/file/d/markfile0001/view');
`);
const ob = async () => (await db.query(`select password_set_at, completed_at, started_at from social_client_onboarding where client_id='${HE}'`)).rows[0];

// The operator turns it on: Clients → Edit → Already onboarded.
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html#clients");
Array.from(op.d.querySelectorAll("#allClientsList button")).find(b => b.textContent === "Edit").click(); await settle();
const box = op.d.getElementById("cpSkipOnboarding");
chk("Clients → Edit has an 'Already onboarded' option, off by default", !!box && !box.checked && box.closest("label").textContent.includes("only asks for a password"));
box.checked = true;
op.d.getElementById("cpSave").click(); await settle();
chk("…saved on the client", (await db.query(`select skip_onboarding from social_clients where id='${HE}'`)).rows[0].skip_onboarding === true);

// Before a password: the dashboard sends them to the password page and shows nothing.
const early = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea");
chk("no password yet: the dashboard sends them to the password page", early.ui.errors.some(e => /navigation/i.test(e)));
chk("…and shows none of their videos", !early.d.querySelector("#listFinal .card") && !early.d.querySelector("#listAll .card"));

// The invite link: password page only, then straight to the dashboard.
const w = await openPage("welcome.html", CL, "https://fl.test/welcome");
const $ = s => w.d.querySelector(s);
chk("the link opens the password page", $("#stepBody [data-current]").dataset.current === "password" && !!$("#pw1") && !!$("#pw2"));
chk("…with no onboarding steps (no brand, voice memo or footage)", !w.d.querySelectorAll("#steps button").length);
$("#pw1").value = "longenough1"; $("#pw2").value = "longenough1";
w.ui.errors.length = 0;
$("#stepBody [data-next]").click(); await settle();
const r = await ob();
chk("password saved, and onboarding marked done (nothing else to do)", w.ui.log.some(l => l.updateUser && l.updateUser.password === "longenough1") && !!r.password_set_at && !!r.completed_at && !r.started_at, r);
chk("…then it heads to the dashboard", w.ui.errors.some(e => /navigation/i.test(e)) && $("#stepBody [data-current]").dataset.current === "password");

// The dashboard and its walkthrough, review steps included.
const tp = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea?tour=1");
chk("with a password, the dashboard opens (no 'Finish setting up' banner)", !!tp.d.querySelector("#listFinal .card") && !tp.d.getElementById("onboardBanner").textContent.trim());
const tc = () => tp.d.getElementById("tourCard");
const modalOpen = () => !tp.d.getElementById("videoModalRoot")?.classList.contains("hidden");
const spot = () => tp.d.getElementById("tourSpot");
const seen = [], text = {}, review = {};
for (let k = 0; k < 20 && tc() && tc().querySelector("[data-tour-next]"); k++) {
  const h = tc().querySelector("h2").textContent;
  seen.push(h); text[h] = tc().textContent; review[h] = modalOpen();
  tc().querySelector("[data-tour-next]").click(); await settle();
}
chk("the walkthrough: To Do, finished videos, Review the video, then inside the review window, then the calendar (no filming or documents steps for them)",
  seen.join("|") === "To Do|Time sensitive|Finished videos to approve|Review the video|Watch it here|Comment on any moment|Send changes, or approve|Content Calendar", seen);
chk("the review steps happen inside the real review window, and it closes after", review["Watch it here"] && review["Comment on any moment"] && review["Send changes, or approve"]
  && !review["Review the video"] && !review["Content Calendar"], review);
chk("it explains comments at a moment and on the whole video", /pinned to that exact second/.test(text["Comment on any moment"]) && /Whole video/.test(text["Comment on any moment"]));
chk("…and sending changes or approving", /Send changes to the editor/.test(text["Send changes, or approve"]) && /Approve for posting/.test(text["Send changes, or approve"]));
chk("then: bookmark this page", tc().textContent.includes("Bookmark this page") && /email and the password/.test(tc().textContent));
tc().querySelector("[data-tour-done]").click(); await settle();
chk("Got it closes everything, back on To Do", !tc() && !spot() && !modalOpen() && tp.d.querySelector(".view.active").id === "view-videos");
chk("no page errors", !tp.ui.errors.length && !tp.ui.alerts.length, [tp.ui.errors, tp.ui.alerts]);

// A client with the full onboarding still gets every step.
await db.exec(`update social_clients set skip_onboarding = false; update social_client_onboarding set completed_at = null`);
const full = await openPage("welcome.html", CL, "https://fl.test/welcome");
chk("without it: after the password, the usual steps", full.d.querySelector("#stepBody [data-current]").dataset.current === "welcome" && full.d.querySelectorAll("#steps button").length === 4);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
if (counts.fail) process.exit(1);
