// More than one person on a client's portal (migration 039; Tait,
// 2026-10-26: "it's not just Mark, but it's other people on his board as
// well"). The operator adds a person; their first sign-in links them to the
// client; they make a password and land on the portal's walkthrough; they see
// what the contact sees; one login still opens one portal.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", MARK = "00000000-0000-0000-0000-00000000000d", SAM = "00000000-0000-0000-0000-00000000000e", EVE = "00000000-0000-0000-0000-00000000000f";
const HE = "d44e6fc3-dfea-42dc-902c-54724441040d", GG = "d44e6fc3-dfea-42dc-902c-54724441040e";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${MARK}','mark@hesedea.test',now()),('${SAM}','sam@board.test',now()),('${EVE}','eve@nowhere.test',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email,skip_onboarding) values
    ('${HE}','Hesedea','hesedea','concierge','Mark Johnson','mark@hesedea.test',false), ('${GG}','Grad Gig','grad-gig','self-serve','Luke','luke@gg.test',false);
  insert into social_client_users (id, client_id, name, email) values ('${MARK}','${HE}','Mark Johnson','mark@hesedea.test');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count) values ('${HE}','mark@hesedea.test',now(),1);
  insert into social_videos (client_id,title,status,filmed_by,concept_approved_at,post_date) values ('${HE}','Mark''s introduction','client_review','us',now(),'2026-10-28');
`);
const claim = async uid => {
  await db.exec("begin");
  await db.query(`select set_config('role', 'authenticated', true)`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
  try { return (await db.query(`select social_claim_client_invite() id`)).rows[0].id; } finally { await db.exec("commit"); }
};

// The operator: the client's page → Overview → People with access → Add a person.
let sentTo = null;
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html#clients", {
  fetch: async (u, o) => {
    const b = JSON.parse(o.body); sentTo = b;
    await db.exec(`insert into social_client_members (client_id, email, name, invited_at, invite_count) values ('${b.clientId}', '${b.email}', '${b.name}', now(), 1)`);
    return { ok: true, status: 200, json: async () => ({ sent: true, member: true, email: b.email }) };
  },
});
const hes = Array.from(op.d.querySelectorAll("#allClientsList b.video-card")).find(b => b.textContent.includes("Hesedea"));
hes.click(); await settle();
const people = () => op.d.getElementById("cpPeople");
chk("the client's Overview lists People with access: Mark, the main contact, signed in", /People with access/.test(people().textContent) && /Mark Johnson/.test(people().textContent) && /Main contact/.test(people().textContent) && /Signed in/.test(people().textContent), people() && people().textContent);
op.d.getElementById("addPerson").click(); await settle();
op.d.getElementById("apName").value = "Sam Ruiz"; op.d.getElementById("apEmail").value = " Sam@Board.test ";
op.d.getElementById("apSend").click(); await settle();
chk("Add a person sends their invite through /api/invite, with their name and email", sentTo && sentTo.clientId === HE && sentTo.email === "sam@board.test" && sentTo.name === "Sam Ruiz", sentTo);
chk("…says it's on its way", /on its way to/.test(op.d.getElementById("videoModalBox").textContent) && /create a password/.test(op.d.getElementById("videoModalBox").textContent));
chk("…and they're listed: Team, invited, not signed in yet", /Sam Ruiz/.test(people().textContent) && /Team/.test(people().textContent) && /Invited, not signed in yet/.test(people().textContent) && !!people().querySelector("[data-resend-member]"));
chk("Mark is still the contact", (await db.query(`select contact_email from social_clients where id='${HE}'`)).rows[0].contact_email === "mark@hesedea.test");

// Sam's first sign-in links Sam to Hesedea; a stranger gets nothing.
chk("Sam's login is linked to Hesedea when it opens the invite", (await claim(SAM)) === HE && (await db.query(`select client_id, name from social_client_users where id='${SAM}'`)).rows[0]?.name === "Sam Ruiz");
chk("an email nobody invited isn't linked to anything", (await claim(EVE)) === null);

// The invite link: a password page only (Mark's onboarding isn't Sam's), then the portal's walkthrough.
const w = await openPage("welcome.html", SAM, "https://fl.test/welcome?client=hesedea");
const $ = s => w.d.querySelector(s);
chk("the link opens the password page, with none of the onboarding steps", $("#stepBody [data-current]").dataset.current === "password" && !w.d.querySelectorAll("#steps button").length);
$("#pw1").value = "longenough1"; $("#pw2").value = "longenough1";
w.ui.errors.length = 0;
$("#stepBody [data-next]").click(); await settle();
const ob = (await db.query(`select password_set_at, completed_at from social_client_onboarding where client_id='${HE}'`)).rows[0];
chk("Sam's password is saved, then it heads to the portal", w.ui.log.some(l => l.updateUser && l.updateUser.password === "longenough1") && w.ui.errors.some(e => /navigation/i.test(e)));
chk("…without marking Mark's onboarding done", !ob.password_set_at && !ob.completed_at, ob);

// The portal: Sam sees what Mark sees, even before Mark has made his password, and no "Finish setting up".
const p = await openPage("clients/portal.html", SAM, "https://fl.test/clients/hesedea");
chk("Sam's portal opens (not sent back to the password page)", !p.ui.errors.some(e => /navigation/i.test(e)) && p.d.title === "Hesedea", p.ui.errors);
chk("…with Hesedea's video to review, and no 'Finish setting up' card", !!p.d.querySelector("#listReview .card") && !p.d.getElementById("onboardBanner").textContent.trim());
const mp = await openPage("clients/portal.html", MARK, "https://fl.test/clients/hesedea");
chk("Mark (no password yet) is still sent to make one first", mp.ui.errors.some(e => /navigation/i.test(e)));

// A member can't see another client.
const other = await openPage("clients/portal.html", SAM, "https://fl.test/clients/grad-gig");
chk("Sam can't open Grad Gig's portal", !other.d.querySelector("#listReview .card") && other.d.title !== "Grad Gig");
chk("a client's login can't read the members list", (await (async () => { await db.exec("begin"); await db.query(`select set_config('role','authenticated',true)`); await db.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: MARK })]); try { return (await db.query(`select count(*)::int n from social_client_members`)).rows[0].n; } finally { await db.exec("rollback"); } })()) === 0);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);   // the pages' timers would keep it running
