// Tait previewing a client's onboarding (operator login, /welcome?client=…)
// is a dry run (2026-11-05): every step taps through, nothing is saved or
// uploaded.
import { freshDb, makeHarness, checker } from "./harness.mjs";
const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, c, x) => counts.check(n, c, x);
const OP = "00000000-0000-0000-0000-00000000000a", TA = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_email,personal_brand) values ('${TA}','Tait Allen','tait-allen','self-serve','t@x.test',true);
  insert into social_client_onboarding (client_id, started_at) values ('${TA}', now());`);
const before = JSON.stringify((await db.query(`select * from social_client_onboarding`)).rows);
const w = await openPage("welcome.html", OP, "https://fl.test/welcome?client=tait-allen");
const $ = s => w.d.querySelector(s), cur = () => $("#stepBody section")?.dataset.current, nextBtn = () => $("#stepBody [data-next]");
chk("starts at the very first page", cur() === "password" && /nothing is saved/.test($("#opBanner").textContent));
nextBtn().click(); await settle();
chk("then Welcome", cur() === "welcome");
nextBtn().click(); await settle();
chk("then Your voice", cur() === "brand");
w.w.eval(`handleFiles("brand", [1,2,3].map(n => ({ file: new File(["x"], "doc" + n + ".txt", { type: "text/plain" }), rel: "doc" + n + ".txt" })), () => render())`);
await new Promise(r => setTimeout(r, 1200)); await settle();
chk("uploads look done", /3 documents uploaded/.test($("#stepBody").textContent) && !nextBtn().disabled);
nextBtn().click(); await settle();
chk("then the questions", cur() === "questions");
w.w.eval(`saveMemoFile(new File(["a"], "memo.m4a", { type: "audio/mp4" }), () => render())`);
await new Promise(r => setTimeout(r, 800)); await settle();
chk("the memo looks saved", /Your voice memo is saved/.test($("#stepBody").textContent) && !nextBtn().disabled);
nextBtn().click(); await settle();
chk("nothing was uploaded", !w.ui.log.some(l => l.upload), w.ui.log.filter(l => l.upload));
chk("nothing was saved", JSON.stringify((await db.query(`select * from social_client_onboarding`)).rows) === before);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
