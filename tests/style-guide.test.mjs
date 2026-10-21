// Unify Phase 4 (migration 028): moodboards (per client and the house
// moodboard) and the Library of shared music and sound effects. Operators
// only.
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
chk("client can't read moodboards", !(await as(CL, `select * from social_moodboard_items`)).data.length);
chk("client can't add to moodboards", !!(await as(CL, `insert into social_moodboard_items (client_id,kind,note) values ($1,'note','x')`, [GG])).error);
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

// Client moodboard: upload, link, note, remove.
op.w.openClientPage(GG, "moodboard"); await settle();
chk("client page has a Moodboard tab", [...d.querySelectorAll("#cpTabs .chip")].map(c => c.textContent).includes("Moodboard"));
pickFile(op, "moodPick-" + GG, "funnel.png", "image/png"); await settle(); await new Promise(r => setTimeout(r, 50)); await settle();
const up = (await db.query(`select client_id, kind, name, storage_path from social_moodboard_items where client_id=$1`, [GG])).rows[0];
chk("dropped image saved to the client's moodboard", up && up.kind === "image" && up.storage_path.startsWith(GG + "/"), up);
chk("uploaded to the moodboards bucket", op.ui.log.some(l => l.upload && l.upload.bucket === "moodboards"));
chk("tile shows the image as new", d.querySelector("#clientMood .mood-item img") && d.getElementById("clientMood").textContent.includes("new"));
op.ui.prompts.push("Love the funnel narrowing to one face");
[...d.querySelectorAll("#clientMood .mood-item button")].find(b => b.textContent === "Note").click(); await settle();
chk("note saved", (await db.query(`select note from social_moodboard_items where client_id=$1`, [GG])).rows[0].note === "Love the funnel narrowing to one face");
[...d.querySelectorAll("#clientMood button")].find(b => b.textContent.includes("Add a link")).click(); await settle();
d.getElementById("mlUrl").value = "https://www.instagram.com/reel/abc"; d.getElementById("mlNote").value = "caption font";
d.getElementById("mlGo").click(); await settle();
chk("link added", (await db.query(`select count(*)::int n from social_moodboard_items where client_id=$1`, [GG])).rows[0].n === 2);
[...d.querySelectorAll("#clientMood .mood-item")].find(x => x.textContent.includes("instagram.com/reel/abc")).querySelector("button.reject").click(); await settle();
chk("remove takes it off", (await db.query(`select count(*)::int n from social_moodboard_items where client_id=$1`, [GG])).rows[0].n === 1);
chk("no page errors", !op.ui.errors.length, op.ui.errors);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
