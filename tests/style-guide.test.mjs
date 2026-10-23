// Moodboards (028, 033: each client's board is shared with the client) and
// Assets (036; Tait, 2026-10-22): every asset across Fully Launched in
// Finder-style folders, five kinds, and each client's own favourites.
import { readFileSync } from "node:fs";
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
    ('sfx','Whoosh 3','editor/public/clients/_sfx/library/Whooshes/Whoosh 3.wav','Whooshes','sfx/d.mp3',1.2),
    ('sfx','Shutter 1','editor/public/clients/_sfx/library/Camera sounds/shutter clicks/Shutter 1.wav','shutter clicks','sfx/e.mp3',0.4),
    ('sfx','Paper','editor/public/clients/_sfx/library/Paper.wav','library','sfx/f.mp3',0.8);
  insert into social_moodboard_items (client_id, kind, url, note) values (null,'link','https://instagram.com/p/kallaway','the swipes');
`);
// Migration 033: a client reads and adds to their own board only.
chk("client can't read the house moodboard", !(await as(CL, `select * from social_moodboard_items`)).data.length);
chk("client can't add to the house moodboard", !!(await as(CL, `insert into social_moodboard_items (client_id,kind,note,added_by_role) values (null,'note','x','client')`)).error);
chk("client can't add as the operator", !!(await as(CL, `insert into social_moodboard_items (client_id,kind,note,added_by_role) values ($1,'note','x','operator')`, [GG])).error);
chk("bad section refused", !!(await as(OP, `insert into social_moodboard_items (client_id,kind,note,section) values ($1,'note','x','nope')`, [GG])).error);
chk("client can't read the Library", !(await as(CL, `select * from social_style_assets`)).data.length);
// 036: folder paths come from where each file sits on the drive.
await db.exec(`update social_style_assets set folder_path = null`);
await db.exec(readFileSync(new URL("../supabase/migrations/036_assets.sql", import.meta.url), "utf8"));
await db.exec(readFileSync(new URL("../supabase/migrations/037_broll.sql", import.meta.url), "utf8"));
const fps = Object.fromEntries((await db.query(`select name, folder_path from social_style_assets`)).rows.map(r => [r.name, r.folder_path]));
chk("folder paths from the drive, nested ones kept", fps["Deep impact"] === "impacts" && fps["Shutter 1"] === "Camera sounds/shutter clicks" && fps["Paper"] === "" && fps["Arrival of the Birds"] === "cinematic", fps);
chk("client can't read anyone's assets list", !(await as(CL, `select * from social_client_assets`)).data.length);
chk("six kinds (B-roll, 037)", !(await as(OP, `insert into social_style_assets (kind,name) values ('lut','Warm glow'),('motion','Lower third'),('font','Inter'),('broll','City drone')`)).error && !!(await as(OP, `insert into social_style_assets (kind,name) values ('poster','x')`)).error);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const d = op.d;
chk("Assets is in the sidebar (was Library)", d.querySelector('.nav-item[data-view="library"]').textContent === "Assets");
d.querySelector('.nav-item[data-view="library"]').click(); await settle();
chk("tabs: Music, Sound effects, LUTs / Powergrades, Motion graphics, Fonts, B-roll; no house moodboard", [...d.querySelectorAll("#libTabs .chip")].map(c => c.textContent.replace(/\d+$/, "").trim()).join("|") === "Music|Sound effects|LUTs / Powergrades|Motion graphics|Fonts|B-roll" && !d.getElementById("libBody").textContent.includes("the swipes"), [...d.querySelectorAll("#libTabs .chip")].map(c => c.textContent));
chk("no second client row and no banner: the top-right picker chooses (Tait, 2026-10-22)", !d.getElementById("assetScope") && !d.getElementById("globalClientBanner") && !d.querySelector("#view-library .page-head p"));
const rows = () => [...d.querySelectorAll("#libBody .lib-row")].map(r => r.querySelector(".nm b").textContent);
const folders = () => [...d.querySelectorAll("#libBody .finder-folder .nm")].map(f => f.textContent);
const rowFor = name => [...d.querySelectorAll("#libBody .lib-row")].find(r => r.textContent.includes(name));
chk("Music opens on its folders", JSON.stringify(folders()) === JSON.stringify(["cinematic"]) && !rows().length, folders());
d.querySelector('#libBody .finder-folder').click(); await settle();
chk("inside a folder: its files, and the path at the top", JSON.stringify(rows()) === JSON.stringify(["Arrival of the Birds", "Kung Fu Fighting"]) && d.querySelector(".finder-path").textContent.includes("cinematic"), [rows(), d.querySelector(".finder-path").outerHTML]);
op.w.HTMLMediaElement.prototype.play = async () => {};
rowFor("Arrival").querySelector(".lib-play").click(); await settle(); await new Promise(r => setTimeout(r, 10));
chk("play loads the preview", (d.getElementById("libAudio").getAttribute("src") || "").includes("music/a.mp3"));
[...rowFor("Arrival").querySelectorAll("button")].find(b => b.textContent.includes("Favorite for")).click(); await settle();
d.querySelector('.asset-menu [data-c]').click(); await settle(); await new Promise(r => setTimeout(r, 10));
chk("♥ Favorite for… Grad Gig saves it to their assets", (await db.query(`select count(*)::int n from social_client_assets where client_id=$1`, [GG])).rows[0].n === 1 && rowFor("Arrival").textContent.includes("♥ Grad Gig"));
d.querySelector('#libTabs [data-lib="sfx"]').click(); await settle();
chk("Sound effects: folders like the drive, loose files at the top", JSON.stringify(folders()) === JSON.stringify(["Camera sounds", "impacts", "Whooshes"]) && JSON.stringify(rows()) === JSON.stringify(["Paper"]), [folders(), rows()]);
[...d.querySelectorAll("#libBody .finder-folder")].find(f => f.textContent.includes("Camera sounds")).click(); await settle();
chk("folders inside folders", JSON.stringify(folders()) === JSON.stringify(["shutter clicks"]) && !rows().length);
d.querySelector("#libBody .finder-folder").click(); await settle();
chk("…down to the file", JSON.stringify(rows()) === JSON.stringify(["Shutter 1"]));
d.querySelector('.finder-path [data-path=""]').click(); await settle();
chk("the path goes back up", folders().includes("Whooshes"));
d.getElementById("libQ").value = "shutter"; d.getElementById("libQ").dispatchEvent(new op.w.Event("input")); await new Promise(r => setTimeout(r, 300)); await settle();
chk("search finds files in any folder", JSON.stringify(rows()) === JSON.stringify(["Shutter 1"]), rows());
d.querySelector(`#globalClientFilter [data-c="${GG}"]`).click(); await settle();
d.querySelector('.nav-item[data-view="library"]').click(); await settle();
d.querySelector('#libTabs [data-lib="music"]').click(); await settle();
chk("Grad Gig: only their assets, in their folders", JSON.stringify(folders()) === JSON.stringify(["cinematic"]) && /Sound effects\s*0/.test(d.getElementById("libTabs").textContent), d.getElementById("libTabs").textContent);
d.querySelector("#libBody .finder-folder").click(); await settle();
chk("…the favourite is there", JSON.stringify(rows()) === JSON.stringify(["Arrival of the Birds"]));
[...rowFor("Arrival").querySelectorAll("button")].find(b => b.textContent === "Remove from Grad Gig").click(); await settle();
chk("Remove from Grad Gig takes it out", !(await db.query(`select 1 from social_client_assets`)).rows.length);
d.querySelector('#globalClientFilter [data-c="all"]').click(); await settle();
chk("All clients at the top right shows everything again", /Music\s*2/.test(d.getElementById("libTabs").textContent), d.getElementById("libTabs").textContent);
// Motion graphics: a still of the graphic you can play, and what it is (Tait, 2026-10-23).
await db.exec(`update social_style_assets set preview_path='motion/k.mp4', notes='Many to one: people narrow into one circle' where name='Lower third'`);
op.w.loadStyleData && await op.w.loadStyleData();
d.querySelector('#libTabs [data-lib="motion"]').click(); await settle();
{ const r = rowFor("Lower third"), img = r && r.querySelector(".lib-thumb img");
  chk("motion graphic shows its still and its note", img && img.dataset.thumb === "motion/k.jpg" && r.querySelector(".lib-notes").textContent.includes("narrow into one circle") && !!r.querySelector("button[onclick*='assetForClientMenu']"), r && r.outerHTML); }
await db.exec(`update social_style_assets set preview_path='broll/c.mp4' where name='City drone'`);
await op.w.loadStyleData();
d.querySelector('#libTabs [data-lib="broll"]').click(); await settle();
{ const r = rowFor("City drone"), img = r && r.querySelector(".lib-thumb img");
  chk("B-roll: its own tab, each clip with a still you can play", img && img.dataset.thumb === "broll/c.jpg", r && r.outerHTML); }

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
// The Art Director groups every drop; nobody picks a group by hand (Tait, 2026-10-23).
const id1 = (await db.query(`select id from social_moodboard_items where client_id=$1`, [GG])).rows[0].id;
chk("no group picker on the board, even for Tait", !board().querySelector("[data-mb-move]") && !board().querySelector(".mb-tools select"));
btnIn(board(), "Add a link").click(); await settle();
d.getElementById("mbUrl").value = "https://www.instagram.com/reel/abc"; d.getElementById("mbText").value = "caption font";
d.getElementById("mbGo").click(); await settle();
const lk = (await db.query(`select section from social_moodboard_items where client_id=$1 and kind='link'`, [GG])).rows[0];
chk("link added, no group to pick", lk && lk.section === null, lk);
// The bridge adds a picture of the page; the board shows it (Tait, 2026-10-23).
await db.query(`update social_moodboard_items set storage_path=$1 where client_id=$2 and kind='link'`, [GG + "/link-x.jpg", GG]);
op.w.openClientPage(GG, "moodboard"); await settle();
chk("link shows the page's picture", !!board().querySelector(".mb-link.has-pic img") && board().querySelector(".mb-link.has-pic b").textContent.includes("instagram.com"));
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
