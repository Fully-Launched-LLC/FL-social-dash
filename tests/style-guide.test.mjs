// Unify Phase 4 (migration 028): moodboards (per client and the house
// moodboard) and the Library of shared music and sound effects. Migration
// 033: each client's moodboard is shared with the client (portal Documents).
import { freshDb, makeHarness, checker, pickFile } from "./harness.mjs";

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
  insert into social_style_assets (kind,name,path,folder,preview_path,duration_s) values
    ('music','Arrival of the Birds','editor/public/clients/_music/cinematic/Arrival.mp3','cinematic','music/a.mp3',212),
    ('music','Kung Fu Fighting','editor/public/clients/_music/cinematic/Kung.mp3','cinematic','music/b.mp3',180),
    ('sfx','Deep impact','editor/public/clients/_sfx/library/impacts/Deep impact.wav','impacts','sfx/c.mp3',2.1),
    ('sfx','Whoosh 3','editor/public/clients/_sfx/library/Whooshes/Whoosh 3.wav','Whooshes','sfx/d.mp3',1.2);
  insert into social_moodboard_items (client_id, kind, url, note) values (null,'link','https://instagram.com/p/kallaway','the swipes');
`);
// Migration 033: a client reads and adds to their own board only.
chk("client can't read the house moodboard", !(await as(CL, `select * from social_moodboard_items`)).data.length);
chk("client can't add to the house moodboard", !!(await as(CL, `insert into social_moodboard_items (client_id,kind,note,added_by_role) values (null,'note','x','client')`)).error);
chk("client can't add as the operator", !!(await as(CL, `insert into social_moodboard_items (client_id,kind,note,added_by_role) values ($1,'note','x','operator')`, [GG])).error);
chk("bad section refused", !!(await as(OP, `insert into social_moodboard_items (client_id,kind,note,section) values ($1,'note','x','nope')`, [GG])).error);
chk("client can't read the Library", !(await as(CL, `select * from social_style_assets`)).data.length);
chk("rating must be favourite or never", !!(await as(OP, `update social_style_assets set rating='maybe'`)).error);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = op.d;
chk("Library is in the sidebar", !!d.querySelector('.nav-item[data-view="library"]'));
d.querySelector('.nav-item[data-view="library"]').click(); await settle();
const rows = () => [...d.querySelectorAll("#libBody .lib-row")].map(r => r.querySelector(".nm b").textContent);
chk("Music tab lists the music", JSON.stringify(rows()) === JSON.stringify(["Arrival of the Birds", "Kung Fu Fighting"]), rows());
const rowFor = name => [...d.querySelectorAll("#libBody .lib-row")].find(r => r.textContent.includes(name));
[...rowFor("Arrival").querySelectorAll("button")].find(b => b.textContent.includes("Favourite")).click(); await settle();
[...rowFor("Kung").querySelectorAll("button")].find(b => b.textContent === "Never use").click(); await settle();
const rated = (await db.query(`select name, rating from social_style_assets where kind='music' order by name`)).rows;
chk("Favourite and Never use save", rated[0].rating === "favourite" && rated[1].rating === "never", rated);
chk("buttons show the rating", rowFor("Arrival").querySelector("button.on").textContent.includes("Favourite"));
[...rowFor("Arrival").querySelectorAll("button")].find(b => b.textContent.includes("Favourite")).click(); await settle();
chk("clicking again clears it", (await db.query(`select rating from social_style_assets where name='Arrival of the Birds'`)).rows[0].rating === null);
op.w.HTMLMediaElement.prototype.play = async () => {};
rowFor("Arrival").querySelector("button").click(); await settle();
chk("play loads the preview", (d.getElementById("libAudio").getAttribute("src") || "").includes("music/a.mp3"));
d.querySelector('#libTabs [data-lib="sfx"]').click(); await settle();
chk("Sound effects tab with folders", rows().length === 2 && d.getElementById("libFolder").textContent.includes("Whooshes"));
d.getElementById("libFolder").value = "impacts"; d.getElementById("libFolder").dispatchEvent(new op.w.Event("change")); await settle();
chk("folder filter", JSON.stringify(rows()) === JSON.stringify(["Deep impact"]), rows());
d.querySelector('#libTabs [data-lib="house"]').click(); await settle();
chk("House moodboard shows its items", d.getElementById("libBody").textContent.includes("the swipes"));

// Client moodboard (shared with the client, migration 033): upload into a
// section, link, words, note, move between sections, remove.
op.w.openClientPage(GG, "moodboard"); await settle();
chk("client page has a Moodboard tab", [...d.querySelectorAll("#cpTabs .chip")].map(c => c.textContent).includes("Moodboard"));
const board = () => d.getElementById("clientMood");
chk("one big board: a paper drop area, no section labels", !!board().querySelector("[data-mb-drop]") && !board().querySelector("[data-mb-sec]"));
pickFile(op, "mbPick-" + GG, "funnel.png", "image/png"); await settle(); await new Promise(r => setTimeout(r, 50)); await settle();
const up = (await db.query(`select client_id, kind, name, storage_path, section, added_by_role from social_moodboard_items where client_id=$1`, [GG])).rows[0];
chk("chosen image saved to the client's board, no group yet (the Art Director groups it), added by the operator", up && up.kind === "image" && up.storage_path.startsWith(GG + "/") && up.section === null && up.added_by_role === "operator", up);
chk("uploaded to the moodboards bucket", op.ui.log.some(l => l.upload && l.upload.bucket === "moodboards"));
chk("tile shows the image, by Tait", board().querySelector('.mb-tile img') && board().querySelector('.mb-tile .mb-who').textContent === "Tait");
const btnIn = (root, label) => [...root.querySelectorAll("button")].find(b => b.textContent === label);
btnIn(board().querySelector(".mb-tile"), "Note").click(); await settle();
d.getElementById("mbText").value = "Love the funnel narrowing to one face"; d.getElementById("mbGo").click(); await settle();
chk("note saved", (await db.query(`select note from social_moodboard_items where client_id=$1`, [GG])).rows[0].note === "Love the funnel narrowing to one face");
// Tait can move a drop to another group by hand (the Art Director usually does).
const id1 = (await db.query(`select id from social_moodboard_items where client_id=$1`, [GG])).rows[0].id;
const mv = board().querySelector(`[data-mb-move="${id1}"]`); mv.value = "colour"; mv.dispatchEvent(new op.w.Event("change", { bubbles: true })); await settle();
chk("moved to the colour group", (await db.query(`select section from social_moodboard_items where id=$1`, [id1])).rows[0].section === "colour");
btnIn(board(), "Add a link").click(); await settle();
d.getElementById("mbUrl").value = "https://www.instagram.com/reel/abc"; d.getElementById("mbText").value = "caption font";
d.getElementById("mbGo").click(); await settle();
const lk = (await db.query(`select section from social_moodboard_items where client_id=$1 and kind='link'`, [GG])).rows[0];
chk("link added, no group to pick", lk && lk.section === null, lk);
btnIn(board(), "Add words").click(); await settle();
d.getElementById("mbText").value = "warm\nhonest, hopeful"; d.getElementById("mbGo").click(); await settle();
chk("words added, one each", (await db.query(`select string_agg(note, ',' order by note) w from social_moodboard_items where client_id=$1 and section='words'`, [GG])).rows[0].w === "honest,hopeful,warm");
chk("words show on the board", [...board().querySelectorAll(".mb-word")].some(w => w.textContent.includes("hopeful")));
btnIn([...board().querySelectorAll(".mb-tile")].find(x => x.textContent.includes("instagram.com")), "Remove").click(); await settle();
chk("remove takes it off", !(await db.query(`select 1 from social_moodboard_items where client_id=$1 and kind='link'`, [GG])).rows.length);

// The client, on their portal's own Moodboard tab: sees the board, drops
// in without choosing a group, and can only remove what they added.
const cl = await openPage("clients/portal.html", CL, "https://fl.test/clients/gg");
cl.d.querySelector('.nav-item[data-view="moodboard"]').click(); await settle();
const cb = () => cl.d.getElementById("portalMood");
chk("client portal: a Moodboard tab; Documents stays hidden", !!cl.d.querySelector('.nav-item[data-view="moodboard"]') && cl.d.getElementById("docsNav").style.display === "none");
chk("client sees the board with Tait's image and words", !!cb().querySelector('.mb-tile img') && cb().textContent.includes("hopeful"));
chk("no Remove, Note or group picker on Tait's items", !cb().querySelector(`[data-mb-id="${id1}"] button`) && !cb().querySelector("[data-mb-move]"));
// A file dropped on the paper.
{ const f = new cl.w.File(["x"], "drop.png", { type: "image/png" }), ev = new cl.w.Event("drop", { bubbles: true, cancelable: true });
  ev.dataTransfer = { files: [f], getData: () => "" }; cb().querySelector("[data-mb-drop]").dispatchEvent(ev); await settle(); await new Promise(r => setTimeout(r, 50)); await settle(); }
const dropped = (await db.query(`select section, added_by_role from social_moodboard_items where name='drop.png'`)).rows[0];
chk("client drops a screenshot anywhere: saved as theirs, no group yet", dropped && dropped.section === null && dropped.added_by_role === "client", dropped);
pickFile(cl, "mbPick-" + GG, "grade.jpg", "image/jpeg"); await settle(); await new Promise(r => setTimeout(r, 50)); await settle();
const mine = (await db.query(`select id, section, added_by, added_by_role from social_moodboard_items where name='grade.jpg'`)).rows[0];
chk("client's upload saved as theirs", mine && mine.added_by === CL && mine.added_by_role === "client", mine);
chk("their tile says You, with Remove", [...cb().querySelectorAll(".mb-tile")].some(t => t.querySelector(".mb-who").textContent === "You" && btnIn(t, "Remove")));
chk("client can't move Tait's item", (await as(CL, `update social_moodboard_items set section='texture' where id=$1 returning id`, [id1])).data.length === 0);
chk("client can't remove Tait's item", (await as(CL, `delete from social_moodboard_items where id=$1 returning id`, [id1])).data.length === 0);
btnIn([...cb().querySelectorAll(".mb-tile")].find(t => t.querySelector(".mb-who").textContent === "You"), "Remove").click(); await settle();
chk("client removes their own", !(await db.query(`select 1 from social_moodboard_items where name='grade.jpg'`)).rows.length);
chk("Tait sees the client's additions as theirs", (await (async () => { await as(CL, `insert into social_moodboard_items (client_id,kind,note,section,added_by_role) values ($1,'note','cosy','words','client')`, [GG]);
  op.w.openClientPage(GG, "moodboard"); await settle(); return board().textContent.includes("cosy"); })()));
chk("no client page errors", !cl.ui.errors.length, cl.ui.errors);
chk("no page errors", !op.ui.errors.length, op.ui.errors);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
