// Personal brands (migration 041): Random Video Dump, Idea Drop, and the
// Your voice onboarding.
//
// Random Video Dump (migration 041; Tait, 2026-11-05): a tab on the
// personal brands' portals where they drop spur-of-the-moment videos. Each
// one becomes its own card, straight into editing (edit by +7, posts +14),
// with its file in the 'footage' bucket under <client>/random/ for the
// bridge to move into their "06 Random Video Dump" Drive folder.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e";
const MW = "d44e6fc3-dfea-42dc-902c-54724441040d", GG = "d44e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${CL}','matteo@x.test',now()),('${CL2}','luke@gg.test',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email,skip_onboarding,personal_brand) values
    ('${MW}','Matteo Warren','matteo-warren','self-serve','Matteo Warren','matteo@x.test',true,true),
    ('${GG}','Grad Gig','grad-gig','self-serve','Luke','luke@gg.test',true,false);
  insert into social_client_users (id, client_id, email) values ('${CL}','${MW}','matteo@x.test'), ('${CL2}','${GG}','luke@gg.test');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count, password_set_at, completed_at) values
    ('${MW}','matteo@x.test',now(),1,now(),now()), ('${GG}','luke@gg.test',now(),1,now(),now());
`);
const as = async (uid, sql) => {
  await db.exec("begin");
  await db.query(`select set_config('role', 'authenticated', true)`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; }
  finally { await db.exec("commit"); }
};
const plus = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// The tab: only where it's turned on.
const cp = await openPage("clients/portal.html", CL, "https://fl.test/clients/matteo-warren");
const nav = cp.d.querySelector('.nav-item[data-view="dump"]');
chk("Matteo's portal has a Random Video Dump tab", nav && nav.style.display !== "none" && nav.textContent === "Random Video Dump");
chk("…next to To Do and Content Calendar", Array.from(cp.d.querySelectorAll(".nav-item")).map(n => n.textContent).slice(0, 3).join("|") === "To Do|Content Calendar|Random Video Dump");
chk("…a drop zone that takes videos", cp.d.querySelector("#dumpDrop.dropzone") && cp.d.getElementById("dumpFile").accept === "video/*");
chk("…empty to start", cp.d.getElementById("dumpList").textContent.includes("Nothing here yet"));
const gg = await openPage("clients/portal.html", CL2, "https://fl.test/clients/grad-gig");
chk("a client without it has no tab", gg.d.querySelector('.nav-item[data-view="dump"]').style.display === "none");

// Drop a video.
const pick = cp.d.getElementById("dumpFile");
Object.defineProperty(pick, "files", { value: [new cp.w.File(["mov"], "coffee shop idea.MOV", { type: "video/quicktime" })], configurable: true });
pick.dispatchEvent(new cp.w.Event("change")); await settle();
const cards = (await db.query(`select * from social_videos where client_id='${MW}'`)).rows;
const v = cards[0];
chk("dropping a video makes one card", cards.length === 1, cards);
chk("…titled from the file", v && v.title === "Random video: coffee shop idea", v && v.title);
chk("…straight into editing, visible to them", v && v.status === "ready_to_edit" && !!v.concept_approved_at && v.filmed_by === "client");
chk("…marked as a random video", v && v.editor_brief.source === "random_dump");
chk("…edit in 7 days, posts in 14 (Tait's 7 + 7)", v && String(v.due_to_edit).slice(0, 10) === plus(7) && String(v.post_date).slice(0, 10) === plus(14), v && [v.due_to_edit, v.post_date]);
const clip = (await db.query(`select * from social_footage where video_id='${v && v.id}'`)).rows[0];
chk("…its file is the card's raw footage, under their random folder", clip && clip.kind === "raw" && clip.name === "coffee shop idea.MOV" && clip.storage_path.startsWith(`${MW}/random/`), clip);
chk("…in the footage bucket", cp.ui.log.some(l => l.upload && l.upload.bucket === "footage"));
chk("it shows in their dump list as being edited", cp.d.getElementById("dumpList").textContent.includes("coffee shop idea") && cp.d.getElementById("dumpList").textContent.includes("Being edited"));

// Not a video: nothing happens.
Object.defineProperty(pick, "files", { value: [new cp.w.File(["x"], "notes.pdf", { type: "application/pdf" })], configurable: true });
pick.dispatchEvent(new cp.w.Event("change")); await settle();
chk("a non-video is turned away", (await db.query(`select count(*)::int n from social_videos where client_id='${MW}'`)).rows[0].n === 1 && /isn't a video/.test(cp.d.getElementById("dumpMsg").textContent));

// Rules the database keeps.
chk("a client without the tab can't add one", /isn't turned on/.test((await as(CL2, `select social_client_random_video('a.mov','${GG}/random/a.mov')`)).error || ""));
chk("a file outside their random folder is refused", /isn't in your Random Video Dump/.test((await as(CL, `select social_client_random_video('a.mov','${GG}/random/a.mov')`)).error || ""));
chk("operators can't call it as a client", /Only a client login/.test((await as(OP, `select social_client_random_video('a.mov','${MW}/random/a.mov')`)).error || ""));

// Tait sees it in the pipeline, tagged.
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
chk("the operator dashboard tags it Random video", op.d.body.textContent.includes("Random video: coffee shop idea") && op.d.body.textContent.includes("· Random video"));

// ── Idea Drop ──
const ideasNav = cp.d.querySelector('.nav-item[data-view="ideas"]');
chk("Matteo's portal has an Idea Drop tab", ideasNav && ideasNav.style.display !== "none" && ideasNav.textContent === "Idea Drop");
chk("…not on Grad Gig's", gg.d.querySelector('.nav-item[data-view="ideas"]').style.display === "none");
chk("…empty to start", cp.d.getElementById("ideaList").textContent.includes("No ideas yet"));
cp.d.getElementById("ideaAdd").click(); await settle();
cp.d.getElementById("idSave").click(); await settle();
chk("an empty idea is caught", /Write the idea/.test(cp.d.getElementById("idErr").textContent));
cp.d.getElementById("idBody").value = "The day I almost quit. Then a client called.";
cp.d.getElementById("idLinks").value = "https://www.instagram.com/reel/abc";
const ifl = cp.d.getElementById("idFiles");
Object.defineProperty(ifl, "files", { value: [new cp.w.File(["png"], "screen shot.png", { type: "image/png" })], configurable: true });
cp.d.getElementById("idSave").click(); await settle();
const idea = (await db.query(`select * from social_ideas where client_id='${MW}'`)).rows[0];
chk("the idea is saved for Tait, from the client", idea && idea.source === "client" && idea.status === "new" && idea.title === "The day I almost quit." && idea.links[0] === "https://www.instagram.com/reel/abc", idea);
chk("…with its screenshot in their ideas folder", idea && idea.attachments[0].kind === "image" && idea.attachments[0].path.startsWith(`${MW}/`) && cp.ui.log.some(l => l.upload && l.upload.bucket === "ideas"));
chk("it shows on their Idea Drop", cp.d.getElementById("ideaList").textContent.includes("The day I almost quit") && !!cp.d.querySelector('#ideaList img[src^="https://signed/"]'));
chk("a client without personal brand can't drop one", !!(await as(CL2, `insert into social_ideas (client_id,title,source) values ('${GG}','x','client')`)).error);
chk("a client can't drop one as Tait, or starred", !!(await as(CL, `insert into social_ideas (client_id,title,source) values ('${MW}','x','tait')`)).error
  && !!(await as(CL, `insert into social_ideas (client_id,title,source,starred) values ('${MW}','x','client',true)`)).error);
await db.exec(`insert into social_ideas (client_id,title,source) values ('${MW}','Tait''s own idea','tait')`);
chk("they only see the ideas they dropped", (await as(CL, `select title from social_ideas`)).rows.map(r => r.title).join() === "The day I almost quit.");
const op2 = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
op2.w.renderIdeaDb && await op2.w.renderIdeaDb(); await settle();
chk("Tait sees it in Content Ideas, marked From the client", op2.d.getElementById("ideaDb").textContent.includes("The day I almost quit") && op2.d.getElementById("ideaDb").textContent.includes("From the client"));
cp.d.querySelector("[data-idea-del]").click(); await settle();
cp.d.getElementById("cfYes").click(); await settle();
chk("they can delete an idea", (await db.query(`select count(*)::int n from social_ideas where client_id='${MW}' and source='client'`)).rows[0].n === 0);

// ── Onboarding: Your voice, no footage, straight to the portal ──
const NB = "d44e6fc3-dfea-42dc-902c-54724441040f", CL3 = "00000000-0000-0000-0000-00000000000f";
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${CL3}','elias@x.test',now());
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email,personal_brand) values ('${NB}','Elias O''Neill','elias-oneill','self-serve','Elias','elias@x.test',true);
  insert into social_client_users (id, client_id, email) values ('${CL3}','${NB}','elias@x.test');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count, password_set_at, started_at) values ('${NB}','elias@x.test',now(),1,now(),now());`);
const w = await openPage("welcome.html", CL3, "https://fl.test/welcome");
const $ = s => w.d.querySelector(s);
const cur = () => $("#stepBody section")?.dataset.current;
const nextBtn = () => $("#stepBody [data-next]");
const obRow = async () => (await db.query(`select * from social_client_onboarding where client_id='${NB}'`)).rows[0];
chk("steps: Welcome, Your voice, Your style, The questions (no footage)", Array.from(w.d.querySelectorAll("#steps button")).map(b => b.textContent.replace("✓ ", "")).join("|") === "Welcome|Your voice|Your style|The questions");
chk("opens on Your voice", cur() === "brand" && $("#stepBody h1").textContent === "Your voice");
chk("…asks for three documents of their real voice, not AI", /Upload at least three documents of your real voice, not AI\. This could be emails, papers, or LinkedIn posts\./.test($("#stepBody").textContent));
chk("…a LinkedIn link box and the 'grab it from there' box", !!$("#liUrl") && /My LinkedIn has a lot of my organic voice\. Grab it from there\./.test($("#stepBody").textContent));
chk("continue is off to start", nextBtn().disabled);
w.w.eval(`handleFiles("brand", [1,2].map(n => ({ file: new File(["email"], "email " + n + ".txt", { type: "text/plain" }), rel: "email " + n + ".txt" })), () => render())`); await settle();
chk("two documents aren't enough", nextBtn().disabled && /2 of 3 uploaded/.test($("#stepBody").textContent));
$("#liOk").checked = true; $("#liOk").dispatchEvent(new w.w.Event("change"));
chk("the box without a LinkedIn link asks for the link", nextBtn().disabled && /Paste your LinkedIn link/.test($("#stepBody").textContent));
$("#liUrl").value = "https://www.linkedin.com/in/elias"; $("#liUrl").dispatchEvent(new w.w.Event("input"));
chk("the box with their LinkedIn lets them move on", !nextBtn().disabled);
$("#liOk").checked = false; $("#liOk").dispatchEvent(new w.w.Event("change"));
w.w.eval(`handleFiles("brand", [{ file: new File(["post"], "post.txt", { type: "text/plain" }), rel: "post.txt" }], () => render())`); await settle();
chk("three documents let them move on", !nextBtn().disabled && /3 documents uploaded/.test($("#stepBody").textContent));
nextBtn().click(); await settle();
let ob = await obRow();
chk("Your voice is saved: documents and LinkedIn", ob.brand.voice === true && ob.brand.done === true && ob.brand.uploads.length === 3 && ob.brand.linkedin_url === "https://www.linkedin.com/in/elias" && cur() === "style", ob.brand);
// Your style: accounts or reels they like, or "build my style for me".
chk("Your style asks for an account or example reels", /Drop an account or a few example reels that match the style you want for your personal brand/.test($("#stepBody").textContent) && !!$("#styleLinks"));
chk("…with Build my style for me and skip", $("#stepBody [data-none]").textContent === "Build my style for me and skip");
chk("continue is off until they add one", nextBtn().disabled);
$("#styleLinks").value = "@garyvee\nhttps://www.instagram.com/reel/xyz\nnot a handle!"; $("#styleLinks").dispatchEvent(new w.w.Event("input"));
$("#styleNotes").value = "Fast cuts, talks straight to camera";
chk("an account or a reel turns it on", !nextBtn().disabled);
nextBtn().click(); await settle();
ob = await obRow();
chk("their style is saved, and Your voice is kept", ob.brand.style.done && !ob.brand.style.build_for_me && ob.brand.style.links.join("|") === "@garyvee|https://www.instagram.com/reel/xyz" && ob.brand.style.notes === "Fast cuts, talks straight to camera" && ob.brand.voice === true && cur() === "questions", ob.brand);
chk("the last button takes them to the portal", /take me to my portal/.test(nextBtn().textContent) && nextBtn().disabled);
w.w.eval(`saveMemoFile(new File(["audio-bytes"], "memo.m4a", { type: "audio/mp4" }), () => render())`); await settle();
chk("the voice memo saves", !!(await obRow()).voice_memo_path && /Your voice memo is saved/.test($("#stepBody").textContent));
nextBtn().click(); await settle();
ob = await obRow();
chk("finishing marks onboarding done (no footage step)", !!ob.completed_at && !ob.footage_done_at, ob);

// "Build my style for me and skip" moves on with nothing to fill in.
const w3 = await openPage("welcome.html", CL3, "https://fl.test/welcome");
w3.w.eval(`go("style")`); await settle();
w3.d.querySelector("#stepBody [data-none]").click(); await settle();
const st3 = (await obRow()).brand.style;
chk("Build my style for me and skip is saved and moves on", st3.build_for_me === true && st3.done && w3.d.querySelector("#stepBody section").dataset.current === "questions", st3);
// Tait sees it on the Onboarding panel.
await db.exec(`update social_client_onboarding set brand = brand || '{"style":{"links":["@garyvee"],"notes":"Fast cuts","done":true}}' where client_id='${NB}'`);
const op3 = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
op3.w.openOnboarding(NB); await settle();
const panel = op3.d.getElementById("videoModalBox").textContent;
chk("Tait's Onboarding panel shows their voice and their style", panel.includes("Their voice") && panel.includes("Their style") && panel.includes("@garyvee") && panel.includes("Fast cuts"), panel.slice(0, 400));

// A failed voice memo save keeps the recording, with Try saving again.
const w2 = await openPage("welcome.html", CL3, "https://fl.test/welcome");
w2.w.eval(`go("questions")`); await settle();
w2.w.eval(`sbClient.storage.from = () => ({ upload: async () => ({ error: { message: "Payload too large" } }) }); saveMemoFile(new File(["a"], "memo.m4a", { type: "audio/mp4" }), () => render())`); await settle();
chk("a failed save says why and keeps the recording", /didn't save \(Payload too large\)/.test(w2.d.getElementById("stepBody").textContent) && !!w2.d.querySelector("[data-memo-retry]"));

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
