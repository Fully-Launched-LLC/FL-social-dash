// Two rounds of changes per video (migration 017, Tait 2026-10-09): the
// pop-up before a round goes (Cancel / Make more revisions / Send it back
// to the editor), the database refusing a third round, and the client
// still watching the video, read only, while the editor makes the changes.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { as, openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", ED = "00000000-0000-0000-0000-00000000000b", CL = "00000000-0000-0000-0000-00000000000d";
const A = "d44e6fc3-dfea-42dc-902c-54724441040d", V = "22222222-2222-2222-2222-222222222222";
await db.exec(`
  insert into auth.users (id) values ('${OP}'),('${ED}'),('${CL}');
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_editors (id,name,email) values ('${ED}','Morgan','m@x');
  update social_editors set setup_at = now();
  insert into social_clients (id,name,slug,client_system,contact_name) values ('${A}','Grad Gig','grad-gig','self-serve','Luke');
  insert into social_client_users (id,client_id,email) values ('${CL}','${A}','l@x');
  insert into social_settings (key, value) values ('google_api_key','KEY123');
  insert into social_videos (id,client_id,title,status,editor_id,concept_approved_at,post_date,final_cut_url) values
    ('${V}','${A}','I paid Wheaton students','client_review','${ED}',now(),'2026-10-12','https://drive.google.com/file/d/cutv1/view');
`);
const fetchDrive = () => ({ ok: true, status: 200, json: async () => ({ files: [] }) });
const rounds = async () => (await db.query(`select client_revision_rounds n, status from social_videos where id='${V}'`)).rows[0];
const card = p => Array.from(p.d.querySelectorAll(".card")).find(c => c.textContent.includes("I paid Wheaton students") && c.querySelector(".actions"));
const button = (root, re) => Array.from(root.querySelectorAll("button")).find(b => re.test(b.textContent));

// Round 1: comment, then Send changes opens the pop-up.
let p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
button(card(p), /^Review the video$/).click(); await settle();
let box = p.d.getElementById("videoModalBox");
chk("the review window says which round this is", /Round 1 of 2/.test(box.textContent));
box.querySelector(".rv-when-all").click();
box.querySelector(".rv-compose textarea").value = "Music is too loud";
box.querySelector(".rv-add").click(); await settle();
button(box, /^Send 1 change to the editor$/).click(); await settle();
let pop = box.querySelector(".rv-confirm");
chk("Send changes opens a pop-up over the video: two rounds, this is the first",
  !!pop && /only get two rounds of revisions/.test(pop.textContent) && /first round/.test(pop.textContent) && !!box.querySelector(".rv-stage"), pop && pop.textContent);
chk("…with Send it back to the editor, Make more revisions and Cancel",
  Array.from(pop.querySelectorAll("button")).map(b => b.textContent).join("|") === "Send it back to the editor|Make more revisions|Cancel");
button(pop, /Make more revisions/).click(); await settle();
chk("Make more revisions closes the pop-up and keeps the window and the comment", !box.querySelector(".rv-confirm") && !p.d.getElementById("videoModalRoot").classList.contains("hidden") && box.querySelectorAll(".rv-note").length === 1);
chk("…nothing sent", (await rounds()).status === "client_review");
box.querySelector(".rv-when-all").click();
box.querySelector(".rv-compose textarea").value = "Logo bigger";
box.querySelector(".rv-add").click(); await settle();
button(box, /^Send 2 changes to the editor$/).click(); await settle();
button(box.querySelector(".rv-confirm"), /^Cancel$/).click(); await settle();
chk("Cancel closes it all and sends nothing (the comments stay for later)", p.d.getElementById("videoModalRoot").classList.contains("hidden") && (await rounds()).status === "client_review"
  && (await db.query(`select count(*)::int n from social_video_comments where video_id='${V}' and closed_at is null`)).rows[0].n === 2);
button(card(p), /^Review the video$/).click(); await settle();
box = p.d.getElementById("videoModalBox");
button(box, /^Send 2 changes to the editor$/).click(); await settle();
button(box.querySelector(".rv-confirm"), /Send it back to the editor/).click(); await settle();
let r = await rounds();
chk("Send it back to the editor: round 1 counted, with the editor", r.n === 1 && r.status === "with_editor", r);
chk("the thank-you says they can still watch it", /Watch the video/.test(p.d.getElementById("videoModalBox").textContent));

// While it's with the editor: watch it, read only, the changes they sent.
p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
await db.exec(`update social_video_comments set cut_ref='cutv1' where video_id='${V}'`);
let c = card(p);
chk("with the editor: the card has Watch the video, not Review", !!button(c, /^Watch the video$/) && !button(c, /^Review the video$/));
button(c, /^Watch the video$/).click(); await settle();
box = p.d.getElementById("videoModalBox");
chk("…it plays the cut they reviewed, with the 2 changes they sent", box.querySelector("video.rv-video")?.getAttribute("src")?.includes("/files/cutv1?") && box.querySelectorAll(".rv-note").length === 2, box.querySelector("video.rv-video")?.getAttribute("src"));
chk("…read only: no comment box, no delete, no send or approve", !box.querySelector(".rv-compose") && !box.querySelector(".rv-del") && !box.querySelector(".rv-actions button") && /can leave more comments when the new version comes back/.test(box.textContent));
chk("…and they can't add a comment while it's with the editor", !!(await as(CL, "insert into social_video_comments (video_id, body, author_role) values ($1,'one more','client')", [V])).error);
// The editor fixes it: every finished cut goes to Tait first, never
// straight to the client.
await db.exec(`insert into social_video_versions (video_id, version, file_id, file_name, created_by) values ('${V}', 1, 'cutv1', 'v1.mov', '${ED}'), ('${V}', 2, 'cutv2', 'v2.mov', '${ED}');
  update social_video_comments set resolved_at = now() where video_id='${V}' and body='Music is too loud';`);
const done1 = await as(ED, "select status from social_editor_mark_delivered($1)", [V]);
chk("the editor's fix of round 1 goes to Tait, not the client", !done1.error && (await rounds()).status === "in_review", done1);
p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
button(card(p), /^Watch the video$/).click(); await settle();
box = p.d.getElementById("videoModalBox");
chk("…while Tait checks it, the client still sees the cut they reviewed (not the new one), no version picker", box.querySelector("video.rv-video")?.getAttribute("src")?.includes("/files/cutv1?") && !box.querySelector(".rv-version"));
// Tait's review shows the client's changes and which the editor ticked.
let op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html", { fetch: fetchDrive });
op.w.operatorReview(V); await settle(); await settle();
let asked = op.d.querySelector("#videoModalBox .rv-asked");
chk("Tait's review lists the client's changes for this round, and which the editor fixed",
  !!asked && /round 1 of 2/.test(asked.textContent) && /ticked 1 of 2 as fixed/.test(asked.textContent) && /Music is too loud/.test(asked.textContent) && /Logo bigger/.test(asked.textContent), asked && asked.textContent);
chk("…and his button sends it back to the client (they have a round left)", !!button(op.d.getElementById("videoModalBox"), /^Approve & add captions$/));
op.w.closeVideoModal();
op.w.approveEdit(V); await settle();
op.d.querySelector('#videoModalBox [data-f="caption"]').value = "Caption";
op.d.getElementById("aeSave").click(); await settle();
chk("Tait approves: back to the client", (await rounds()).status === "client_review");

// Round 2 is the last; then no more.
p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
button(card(p), /^Review the video$/).click(); await settle();
box = p.d.getElementById("videoModalBox");
chk("back for review: round 2 of 2", /Round 2 of 2/.test(box.textContent));
box.querySelector(".rv-when-all").click();
box.querySelector(".rv-compose textarea").value = "Tighter ending";
box.querySelector(".rv-add").click(); await settle();
button(box, /^Send 1 change to the editor$/).click(); await settle();
chk("the pop-up says it's the last round", /last round/i.test(box.querySelector(".rv-confirm").textContent) && /second round/.test(box.querySelector(".rv-confirm").textContent));
button(box.querySelector(".rv-confirm"), /Send it back to the editor/).click(); await settle();
chk("round 2 counted", (await rounds()).n === 2);
await as(ED, "select status from social_editor_mark_delivered($1)", [V]);
chk("the editor's fix of the last round goes to Tait too", (await rounds()).status === "in_review");
op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html", { fetch: fetchDrive });
op.w.operatorReview(V); await settle(); await settle();
chk("…his review shows round 2 of 2, and his button is Approve for posting", /round 2 of 2/.test(op.d.querySelector("#videoModalBox .rv-asked")?.textContent || "") && !!button(op.d.getElementById("videoModalBox"), /^Approve for posting$/));
op.w.closeVideoModal();
op.w.approveEdit(V); await settle();
chk("…the approve form says it goes straight to Ready to post", /straight to Ready to post/.test(op.d.getElementById("videoModalBox").textContent) && op.d.getElementById("aeSave").textContent === "Approve for posting");
op.d.getElementById("aeSave").click(); await settle();
chk("Tait approves it for posting: Ready to post, not back to the client", (await rounds()).status === "ready_to_post");
// If it ever lands back with the client anyway, they can't send a third round.
await db.exec(`update social_videos set status='client_review' where id='${V}'`);
const third = await as(CL, "select status from social_client_video_action(p_video_id => $1, p_action => 'request_revisions', p_note => 'one more')", [V]);
chk("the database refuses a third round", !!third.error && /both rounds/.test(third.error.message), third);
p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
button(card(p), /^Review the video$/).click(); await settle();
box = p.d.getElementById("videoModalBox");
chk("both used: watch and approve only, and email Tait for anything else", !box.querySelector(".rv-compose") && Array.from(box.querySelectorAll(".rv-actions button")).map(b => b.textContent).join("|") === "Approve for posting" && /tait@fullylaunched.com/.test(box.textContent));
button(box, /^Approve for posting$/).click(); await settle();
chk("…and approving still works", (await rounds()).status === "ready_to_post");
p = await openPage("clients/portal.html", CL, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
p.w.openClientVideoModal("22222222-2222-2222-2222-222222222222"); await settle();
chk("approved: its card (from the calendar) still has Watch the video", !!button(p.d.getElementById("videoModalBox"), /^Watch the video$/));
chk("other actions don't count as rounds", (await rounds()).n === 2);
chk("no page errors", !p.ui.errors.length && !p.ui.alerts.length, [p.ui.errors, p.ui.alerts]);

// The operator, in the portal for the client: counted, same pop-up.
await db.exec(`update social_videos set status='client_review', client_revision_rounds=0 where id='${V}'`);
const opp = await openPage("clients/portal.html", OP, "https://fl.test/clients/grad-gig", { fetch: fetchDrive });
button(card(opp), /^Review the video$/).click(); await settle();
box = opp.d.getElementById("videoModalBox");
box.querySelector(".rv-when-all").click();
box.querySelector(".rv-compose textarea").value = "From the call with Luke";
box.querySelector(".rv-add").click(); await settle();
button(box, /^Send 1 change to the editor$/).click(); await settle();
button(box.querySelector(".rv-confirm"), /Send it back to the editor/).click(); await settle();
r = await rounds();
chk("the operator sending changes for the client counts a round too", r.n === 1 && r.status === "with_editor", r);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
if (counts.fail) process.exit(1);
