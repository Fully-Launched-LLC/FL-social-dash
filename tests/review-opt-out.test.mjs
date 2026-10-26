// A client can opt out of reviewing (migration 038; Tait, 2026-10-26: "they
// can click 'Opt out of the reviewing process,' and that means they trust us
// completely"). The box on To review, its walkthrough step, what opting out
// does to waiting and future videos and carousels, and opting back in.
import { freshDb, makeHarness, checker } from "./harness.mjs";

const db = await freshDb();
const { openPage, settle } = makeHarness(db);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const OP = "00000000-0000-0000-0000-00000000000a", CL = "00000000-0000-0000-0000-00000000000d", CL2 = "00000000-0000-0000-0000-00000000000e";
const HE = "d44e6fc3-dfea-42dc-902c-54724441040d", GG = "d44e6fc3-dfea-42dc-902c-54724441040e";
const V1 = "a0000000-0000-0000-0000-000000000001", V2 = "a0000000-0000-0000-0000-000000000002", C1 = "c0000000-0000-0000-0000-000000000001";
await db.exec(`
  insert into auth.users (id, email, email_confirmed_at) values ('${OP}','tait@x',now()),('${CL}','mark@hesedea.test',now()),('${CL2}','luke@gg.test',now());
  insert into social_operators values ('${OP}','Tait','tait@x');
  insert into social_clients (id,name,slug,client_system,contact_name,contact_email,skip_onboarding) values
    ('${HE}','Hesedea','hesedea','concierge','Mark','mark@hesedea.test',true), ('${GG}','Grad Gig','grad-gig','self-serve','Luke','luke@gg.test',false);
  insert into social_client_users (id, client_id, email) values ('${CL}','${HE}','mark@hesedea.test'), ('${CL2}','${GG}','luke@gg.test');
  insert into social_client_onboarding (client_id, invited_email, invited_at, invite_count, password_set_at, completed_at) values ('${HE}','mark@hesedea.test',now(),1,now(),now());
  insert into social_videos (id,client_id,title,status,filmed_by,concept_approved_at,post_date) values
    ('${V1}','${HE}','Mark''s introduction','client_review','us',now(),'2026-10-28'),
    ('${V2}','${HE}','He was abandoned at six years old','in_review','us',now(),'2026-11-04');
  insert into social_carousels (id, client_id, position, title, status, slides, post_date) values ('${C1}','${HE}',1,'Hesed','client_review','[{"text":"One","photo":""}]','2026-11-02');
`);
const status = async (t, id) => (await db.query(`select status from ${t} where id='${id}'`)).rows[0].status;
const optedOut = async id => (await db.query(`select skip_client_review from social_clients where id='${id}'`)).rows[0].skip_client_review;
const readAs = async (uid, sql) => {
  await db.exec("begin");
  await db.query(`select set_config('role', 'authenticated', true)`);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { error: e.message }; }
  finally { await db.exec("commit"); }
};

// The walkthrough points at the box.
const tp = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea?tour=1");
const tc = () => tp.d.getElementById("tourCard");
const seen = {};
for (let k = 0; k < 20 && tc() && tc().querySelector("[data-tour-next]"); k++) {
  const h = tc().querySelector("h2").textContent;
  seen[h] = { text: tc().textContent, spot: tp.d.querySelector("#reviewOptOut .card") };
  tc().querySelector("[data-tour-next]").click(); await settle();
}
chk("the walkthrough has an 'Or skip reviewing' step about the opt-out button", /Opt out of the reviewing process/.test(seen["Or skip reviewing"]?.text || ""), Object.keys(seen));
tc()?.querySelector("[data-tour-done]")?.click(); await settle();

// The box on To review.
const p = await openPage("clients/portal.html", CL, "https://fl.test/clients/hesedea");
const $ = s => p.d.querySelector(s);
p.d.querySelector('#videoTabs .chip[data-tab="review"]').click(); await settle();
const btn = () => $("#reviewOptOut [data-opt-out]");
chk("To review has the box with 'Opt out of the reviewing process'", btn()?.textContent === "Opt out of the reviewing process" && /trust us completely/.test($("#reviewOptOut").textContent));
btn().click(); await settle();
chk("it asks first, and says the 2 waiting now will be approved too", /Opt out of reviewing\?/.test($("#videoModalBox").textContent) && /The 2 videos waiting for you now will be approved too/.test($("#videoModalBox").textContent));
p.d.querySelector("#videoModalBox .modal-actions button").click(); await settle();
chk("Cancel changes nothing", !(await optedOut(HE)) && (await status("social_videos", V1)) === "client_review");
btn().click(); await settle();
$("#optOutYes").click(); await settle();
chk("Yes: saved on the client", await optedOut(HE));
chk("…the waiting video is approved for posting, and the carousel approved", (await status("social_videos", V1)) === "ready_to_post" && (await status("social_carousels", C1)) === "approved");
chk("…a thank-you, then To review is empty but for the box, now 'Opt back in'", /You're opted out/.test($("#videoModalBox").textContent)
  && !p.d.querySelector("#listReview .card") && btn().textContent === "Opt back in" && /You've opted out of reviewing/.test($("#reviewOptOut").textContent));
chk("no page errors", !p.ui.errors.length && !p.ui.alerts.length, [p.ui.errors, p.ui.alerts]);

// From now on, Tait's approval sends it straight to Ready to post, whichever way it's made.
await db.exec(`update social_videos set status='client_review' where id='${V2}'`);
chk("a video Tait sends to an opted-out client goes straight to Ready to post", (await status("social_videos", V2)) === "ready_to_post");
await db.exec(`update social_carousels set status='to_review' where id='${C1}'; update social_carousels set status='client_review' where id='${C1}'`);
chk("…and a carousel straight to approved", (await status("social_carousels", C1)) === "approved");

// The operator's Approve button says so.
await db.exec(`update social_videos set status='in_review' where id='${V2}'`);
const op = await openPage("operator/dashboard.html", OP, "https://fl.test/operator/dashboard.html");
op.w.approveEdit(V2); await settle();
chk("the operator's approve says 'Approve for posting' and why", /They opted out of reviewing/.test(op.d.getElementById("videoModalBox").textContent) && op.d.getElementById("aeSave").textContent === "Approve for posting");

// Only their own account; an operator can do it for them.
chk("another client can't opt Hesedea back in", /Not your account/.test((await readAs(CL2, `select social_set_client_review_opt_out('${HE}', false)`)).error || "") && await optedOut(HE));
await readAs(OP, `select social_set_client_review_opt_out('${HE}', false)`);
chk("an operator can (for a client who asks by text)", !(await optedOut(HE)));

// Opted back in: new videos wait for them again.
await db.exec(`update social_videos set status='client_review' where id='${V2}'`);
chk("opted back in, new videos wait for their review again", (await status("social_videos", V2)) === "client_review");
chk("Grad Gig never opted out: its review is unchanged", !(await optedOut(GG)));

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);   // the pages' timers would keep it running
