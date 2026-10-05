// Each client's own voice memo questions (migration 011): the operator pastes
// or edits them on the Onboarding panel, the client sees them on their
// Questions page, story prompts are marked, and "standard" is the fallback.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { as, openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d";
const NC = "d44e6fc3-dfea-42dc-902c-54724441040d";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${CL}','pat@newco.test',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_email) values ('${NC}','NewCo','newco','self-serve','pat@newco.test');
  insert into social_client_users (id,client_id,email) values ('${CL}','${NC}','pat@newco.test');
`);

chk("a client can't write their own questions", !!(await as(CL, `update social_clients set onboarding_questions='[]' where id='${NC}' returning id`)).error
  || !(await as(CL, `update social_clients set onboarding_questions='[]' where id='${NC}' returning id`)).data?.length);

const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
const w = op.w;
const parsed = w.questionsFromText(`## You and your bakery
Note: Talk like you would to a regular.
- Why bread?
1. What do you say when someone asks what you do?

## Your stories
- [story] The morning the oven died.
`);
chk("the text form parses: sections, a note, numbered or dashed questions, story prompts",
  parsed.length === 2 && parsed[0].note === "Talk like you would to a regular." && parsed[0].items.length === 2 && parsed[0].items[1].q === "What do you say when someone asks what you do?"
  && parsed[1].items[0].story === true && parsed[1].items[0].q === "The morning the oven died.", parsed);
chk("…and round-trips", JSON.stringify(w.questionsFromText(w.questionsToText(parsed)).map(s => [s.section, s.note, s.items.map(i => [i.q, !!i.story])])) === JSON.stringify(parsed.map(s => [s.section, s.note, s.items.map(i => [i.q, !!i.story])])));
chk("the standard list has 30 questions, 6 of them story prompts", w.eval("ONBOARDING_QUESTIONS").reduce((n, s) => n + s.items.length, 0) === 30 && w.eval("ONBOARDING_QUESTIONS").reduce((n, s) => n + s.items.filter(i => i.story).length, 0) === 6);

w.openOnboarding(NC); await settle();
const box = () => op.d.getElementById("videoModalBox");
chk("Onboarding panel shows their questions: the standard list for now", box().textContent.includes("Their voice memo questions") && box().textContent.includes("the standard list, 30 questions") && !box().querySelector("#obQReset"));
box().querySelector("#obQText").value = "## You and your bakery\n- Why bread?\n- [story] The morning the oven died.";
box().querySelector("#obQSave").click(); await settle();
const saved = (await db.query(`select onboarding_questions q from social_clients where id='${NC}'`)).rows[0].q;
chk("Save stores their own list", Array.isArray(saved) && saved[0].section === "You and your bakery" && saved[0].items[1].story === true, saved);
chk("the panel reopens on their own list, with a way back to standard", box().textContent.includes("their own list, 2 questions") && !!box().querySelector("#obQReset") && box().querySelector("#obQs").open);
box().querySelector("#obQText").value = "just a heading with no questions\n## Empty";
box().querySelector("#obQText").value = "";
box().querySelector("#obQSave").click(); await settle();
chk("an empty list isn't saved", /at least one question/.test(box().querySelector("#obQMsg").textContent));

// The client's Questions page shows their list.
const wc = await openPage("welcome.html", CL, "https://fl.test/welcome");
wc.w.eval(`current = "questions"; render();`); await settle();
const body = wc.d.getElementById("stepBody");
chk("client sees their own questions, story prompt marked", body.querySelectorAll(".qitem").length === 2 && body.textContent.includes("Why bread?") && body.querySelectorAll(".qitem.story .qstory").length === 1, body.textContent.slice(0, 200));

box().querySelector("#obQReset").click(); await settle();
chk("Go back to the standard questions clears theirs", (await db.query(`select onboarding_questions q from social_clients where id='${NC}'`)).rows[0].q === null && box().textContent.includes("the standard list, 30 questions"));

chk("no page errors", ![...op.ui.errors, ...wc.ui.errors].length, [op.ui.errors, wc.ui.errors]);
console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
