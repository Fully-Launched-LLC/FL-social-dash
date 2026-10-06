// The /api functions (api/invite.js, api/voice-memo.js) with every outside
// service faked: Supabase (auth, database, storage), Resend, OpenAI and
// Anthropic. Checks who's allowed, what gets called, and what's saved.
import { createRequire } from "module";
import { checker } from "./harness.mjs";
const require = createRequire(import.meta.url);
const counts = checker();
const chk = (n, cond, x) => counts.check(n, cond, x);

const ENV = { SUPABASE_URL: "https://sb.test", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", PORTAL_URL: "https://social.fullylaunched.com" };
function setEnv(extra = {}) {
  for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PORTAL_URL", "RESEND_API_KEY", "EMAIL_FROM", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"]) delete process.env[k];
  Object.assign(process.env, ENV, extra);
}

// A fake world: users by token, tables, and outside services.
function world(o) {
  const calls = [];
  const json = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => "audio/mp4" }, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), arrayBuffer: async () => new ArrayBuffer(8) });
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), method = init.method || "GET";
    calls.push({ url: u, method, body: init.body, headers: init.headers || {} });
    if (u.endsWith("/auth/v1/user")) { const t = String(init.headers.Authorization).split(" ")[1]; return o.users[t] ? json(o.users[t]) : json({ msg: "bad jwt" }, 401); }
    if (u.includes("/rest/v1/social_operators")) return json(o.operators.filter(id => u.includes(id)).map(id => ({ id })));
    if (u.includes("/rest/v1/social_client_users")) return json((o.clientUsers || []).filter(x => u.includes(x.id)).map(x => ({ client_id: x.client_id })));
    if (u.includes("/rest/v1/social_clients")) return json((o.clients || []).filter(c => u.includes(c.id)));
    if (u.includes("/rest/v1/social_client_onboarding") && method === "GET") return json(o.onboarding ? [o.onboarding] : []);
    if (u.includes("/rest/v1/social_client_documents") && method === "GET") return json(o.docLinks || []);
    if (u.includes("/rest/v1/social_editors") && method === "GET") return json((o.editors || []).filter(e => u.includes(e.id) || u.includes(encodeURIComponent(e.email))));
    if (u.includes("/rest/v1/social_client_generated_docs") && method === "GET" && o.builtDocs) return json(o.builtDocs);
    if (u.includes("/rest/v1/")) return json(null, 201);
    if (u.includes("/auth/v1/admin/generate_link")) return o.generateLink(JSON.parse(init.body), json);
    if (u.startsWith("https://api.resend.com")) return o.resend ? o.resend(JSON.parse(init.body), json) : json({ id: "email_1" });
    if (u.includes("/storage/v1/object/onboarding-audio/")) return json("audio");
    if (u.startsWith("https://api.openai.com")) return o.transcribe ? o.transcribe(json) : json(o.transcript);
    if (u.startsWith("https://api.anthropic.com")) { const p = JSON.parse(init.body).messages[0].content; return json({ content: [{ type: "text", text: p.includes("Customer Data") && p.includes("voice-of-customer") ? o.customerData : o.yourVoice }] }); }
    return json({ error: "unexpected " + u }, 500);
  };
  return calls;
}
async function call(mod, token, body) {
  const req = { method: "POST", headers: token ? { authorization: "Bearer " + token, host: "x.test" } : { host: "x.test" }, body };
  const res = { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await mod(req, res);
  return { status: res.statusCode, body: JSON.parse(res.body) };
}

const invite = require("../api/invite.js");
const build = require("../api/build-documents.js");
const sendDocs = require("../api/send-documents.js");
const inviteEditor = require("../api/invite-editor.js");
const C1 = "11111111-1111-1111-1111-111111111111", C2 = "22222222-2222-2222-2222-222222222222";
const base = {
  users: { opTok: { id: "op1", email: "tait@x" }, clTok: { id: "cl1", email: "pat@x" }, edTok: { id: "ed1", email: "ed@x" } },
  operators: ["op1"], clientUsers: [{ id: "cl1", client_id: C1 }],
  clients: [{ id: C1, name: "NewCo", slug: "newco", contact_name: "Pat Lee", contact_email: "Pat@NewCo.test" }, { id: C2, name: "NoEmail", slug: "noemail", contact_email: null }],
};

// ── invite ──
setEnv();
let calls = world({ ...base, generateLink: (b, json) => json({ action_link: "https://sb.test/verify?type=invite&token=t1" }) });
let r = await call(invite, null, { clientId: C1 });
chk("invite: not signed in → 401", r.status === 401);
r = await call(invite, "clTok", { clientId: C1 });
chk("invite: a client can't send invites → 403", r.status === 403);
r = await call(invite, "opTok", { clientId: C2 });
chk("invite: no contact email → 400 with a clear message", r.status === 400 && /contact email/.test(r.body.error), r.body);
calls = world({ ...base, generateLink: (b, json) => json({ action_link: "https://sb.test/verify?type=invite&token=t1" }) });
r = await call(invite, "opTok", { clientId: C1 });
const gl = calls.find(c => c.url.includes("generate_link"));
chk("invite: new login → invite link to /welcome, email lowercased", JSON.parse(gl.body).type === "invite" && JSON.parse(gl.body).email === "pat@newco.test" && JSON.parse(gl.body).redirect_to === "https://social.fullylaunched.com/welcome?client=newco");
{ const { inviteEmail } = require("../api/_email.js"); const e = inviteEmail({ contactName: "Luke Bothun", clientName: "Grad Gig", link: "https://x", portal: "https://social.fullylaunched.com", returning: false });
  chk("invite: new-client email: logo, 'Welcome to your Fully Social dashboard', 'Hi Luke, we are excited to start working with Grad Gig.', Start here at the bottom", e.subject === "Welcome to your Fully Social dashboard" && e.html.includes("Welcome to your Fully Social dashboard") && e.html.includes("Hi Luke,") && e.html.includes("We are excited to start working with Grad Gig.") && e.html.includes("/assets/logo-white.png") && e.html.trim().endsWith("</html>") && e.html.lastIndexOf(">Start here<") > e.html.lastIndexOf("excited"), e.subject);
  chk("invite: exactly one link in the email (the Start here button)", (e.html.match(/href=/g) || []).length === 1 && e.html.includes('href="https://x"'));
  chk("invite: white outside, navy box inside", /<body style="margin:0;padding:0;background:#ffffff">/.test(e.html) && e.html.includes("background:#04101f;border-radius:16px"));
  chk("invite: plain-text version says the same", e.text.includes("Hi Luke,") && e.text.includes("We are excited to start working with Grad Gig.") && e.text.includes("Start here: https://x"), e.text); }
chk("invite: no email service yet → the link comes back to copy", r.status === 200 && r.body.sent === false && r.body.link.includes("token=t1") && /RESEND_API_KEY/.test(r.body.reason), r.body);
chk("invite: recorded on their onboarding", calls.some(c => c.url.includes("social_client_onboarding?on_conflict=client_id") && JSON.parse(c.body).invite_count === 1));

setEnv({ RESEND_API_KEY: "re_1" });
calls = world({ ...base, generateLink: (b, json) => b.type === "invite" ? json({ msg: "A user with this email address has already been registered" }, 422) : json({ properties: { action_link: "https://sb.test/verify?type=magiclink&token=t2" } }) });
r = await call(invite, "opTok", { clientId: C1 });
const mail = calls.find(c => c.url.startsWith("https://api.resend.com"));
const m = mail && JSON.parse(mail.body);
chk("invite: existing login but onboarding not finished → still the welcome email with Start here", r.body.sent === true && r.body.returning === false && m.subject === "Welcome to your Fully Social dashboard" && m.html.includes(">Start here<") && m.html.includes("token=t2"), m && m.subject);
chk("invite: replies go to Tait", m && /tait@fullylaunched.com/.test(m.reply_to), m && m.reply_to);
{ const c2 = world({ ...base, onboarding: { client_id: C1, invite_count: 1, completed_at: "2026-10-01T00:00:00Z" }, generateLink: (b, json) => b.type === "invite" ? json({ msg: "already registered" }, 422) : json({ properties: { action_link: "https://sb.test/verify?type=magiclink&token=t9" } }) });
  const r2 = await call(invite, "opTok", { clientId: C1 }); const m2 = JSON.parse(c2.find(c => c.url.startsWith("https://api.resend.com")).body);
  chk("invite: existing login who finished onboarding → the sign-in email", r2.body.returning === true && m2.subject === "Your Fully Social dashboard sign-in link" && m2.html.includes(">Sign in<") && !m2.html.includes("Start here"), m2.subject); }
chk("invite: branded email sent from Fully Launched", m && m.to[0] === "pat@newco.test" && /Fully Launched/.test(m.from) && m.html.includes("token=t2") && m.html.includes("https://social.fullylaunched.com/assets/logo-white.png") && m.html.includes("#C4AB82"), m && m.subject);
chk("invite: plain-text version too", m && m.text.includes("token=t2"));

calls = world({ ...base, generateLink: (b, json) => json({ action_link: "https://sb.test/auth/v1/verify?token=t5", hashed_token: "hash5" }) });
r = await call(invite, "opTok", { clientId: C1 });
{ const mm = JSON.parse(calls.find(c => c.url.startsWith("https://api.resend.com")).body);
  chk("invite: Start here links to our own site (no supabase.co link), so it doesn't look like phishing", mm.html.includes('href="https://social.fullylaunched.com/welcome?client=newco&amp;token_hash=hash5&amp;type=invite"') && !mm.html.includes("sb.test") && mm.text.includes("https://social.fullylaunched.com/welcome?client=newco&token_hash=hash5&type=invite"), mm.html.match(/href="[^"]*"/g)); }
setEnv({ RESEND_API_KEY: "re_1", EMAIL_FROM: "Fully Launched <hello@fullylaunched.om>" });
calls = world({ ...base, generateLink: (b, json) => json({ action_link: "https://sb.test/verify?type=invite&token=t3" }),
  resend: (b, json) => b.from.includes("fullylaunched.om>") ? json({ message: "The fullylaunched.om domain is not verified." }, 403) : json({ id: "email_2" }) });
r = await call(invite, "opTok", { clientId: C1 });
const froms = calls.filter(c => c.url.startsWith("https://api.resend.com")).map(c => JSON.parse(c.body).from);
chk("invite: EMAIL_FROM on an unverified domain → resent from the default, with a warning", r.body.sent === true && froms.length === 2 && froms[1] === "Fully Launched <hello@fullylaunched.com>" && /Fix EMAIL_FROM/.test(r.body.warning), r.body);
calls = world({ ...base, generateLink: (b, json) => json({ action_link: "https://sb.test/verify?type=invite&token=t4" }), resend: (b, json) => json({ message: "Rate limited" }, 429) });
r = await call(invite, "opTok", { clientId: C1 });
chk("invite: other Resend errors → the link to copy, no retry", r.body.sent === false && r.body.link.includes("token=t4") && calls.filter(c => c.url.startsWith("https://api.resend.com")).length === 1, r.body);

setEnv(); delete process.env.SUPABASE_SERVICE_ROLE_KEY;
world(base);
r = await call(invite, "opTok", { clientId: C1 });
chk("invite: not set up → 503 naming the missing key", r.status === 503 && /SUPABASE_SERVICE_ROLE_KEY/.test(r.body.error), r.body);

// ── build documents from a pasted transcript ──
const TRANSCRIPT = "Our best customer is a busy parent who never has a minute to spare. They told us we just need somebody we can trust in the house. The dream is that the evenings belong to the family again. ".repeat(3);
const docs = {
  customerData: '# NewCo: Customer Data\n## 1. Pains, verbatim\n1. "never has a minute to spare"\n*Founder, on time.*\n2. "we are drowning in paperwork every single week"\n*Founder.*\n3. "we just need somebody ... trust in the house"\n*Founder.*',
  yourVoice: "# NewCo: Your Voice\n## Pillars (3) [To confirm]\n### Trust — at home\n\"the evenings belong to the family again\"",
};
setEnv({ ANTHROPIC_API_KEY: "sk-a" });
calls = world({ ...base, onboarding: { client_id: C1, brand: { fonts: "Inter" }, answers: { best: "Busy parents" } }, ...docs });
r = await call(build, "clTok", { clientId: C1, transcript: TRANSCRIPT });
chk("build: a client can't → 403 (team only)", r.status === 403);
r = await call(build, "opTok", { clientId: C1, transcript: "too short" });
chk("build: too-short transcript → 400", r.status === 400 && /too short/.test(r.body.error));
calls = world({ ...base, onboarding: { client_id: C1, brand: { fonts: "Inter" }, answers: { best: "Busy parents" } }, ...docs });
r = await call(build, "opTok", { clientId: C1, transcript: TRANSCRIPT });
chk("build: pasted transcript → built", r.status === 200 && r.body.ok === true, r.body);
chk("build: no transcription service is called", !calls.some(c => c.url.startsWith("https://api.openai.com")));
const savedT = calls.find(c => c.url.includes("social_client_onboarding?on_conflict=client_id"));
chk("build: the transcript is saved", savedT && JSON.parse(savedT.body).transcript === TRANSCRIPT.trim());
const prompts = calls.filter(c => c.url.startsWith("https://api.anthropic.com")).map(c => JSON.parse(c.body));
chk("build: Claude builds both documents from the transcript", prompts.length === 2 && prompts.every(p => p.messages[0].content.includes(TRANSCRIPT.slice(0, 60)) && /Never invent/.test(p.messages[0].content)));
chk("build: Customer Data uses Tait's prompt word for word", prompts.some(p => p.messages[0].content.startsWith("You are my voice-of-customer analyst. I am pasting in transcripts from real calls with my customers.")));
chk("build: form notes and brand are context, never quotes", prompts.every(p => p.messages[0].content.includes("Busy parents") && /never as recording quotes/.test(p.messages[0].content)));
const saved = calls.filter(c => c.url.includes("social_client_generated_docs")).map(c => JSON.parse(c.body));
const cd = saved.find(d => d.kind === "customer_data"), yv = saved.find(d => d.kind === "your_voice");
chk("build: both documents saved", cd && yv && cd.title === "NewCo: Customer Data" && yv.title === "NewCo: Your Voice");
chk("build: real quotes pass (with ... cuts)", !/never has a minute to spare" \*\(check/.test(cd.body_md) && !/trust in the house" \*\(check/.test(cd.body_md), cd.body_md);
chk("build: a quote that isn't in the transcript is flagged", /drowning in paperwork every single week" \*\(check: not word for word in the recording\)\*/.test(cd.body_md) && r.body.flaggedQuotes === 1, cd.body_md);
chk("build: no em dashes survive", !yv.body_md.includes("—"));
chk("build: status ready", calls.filter(c => c.method === "PATCH").map(c => JSON.parse(c.body)).at(-1).docs_status === "ready");

calls = world({ ...base, onboarding: { client_id: C1, transcript: TRANSCRIPT }, ...docs });
r = await call(build, "opTok", { clientId: C1 });
chk("build: rebuild uses the saved transcript", r.status === 200 && calls.filter(c => c.url.startsWith("https://api.anthropic.com")).length === 2);

setEnv();
calls = world({ ...base, onboarding: { client_id: C1 }, ...docs });
r = await call(build, "opTok", { clientId: C1, transcript: TRANSCRIPT });
const lastNoKey = calls.filter(c => c.method === "PATCH").map(c => JSON.parse(c.body)).at(-1);
chk("build: no Anthropic key → failed, naming it (OpenAI never needed)", r.status === 503 && /ANTHROPIC_API_KEY/.test(r.body.error) && !/OPENAI/.test(r.body.error) && lastNoKey.docs_status === "failed", r.body);


// ── email them their documents ──
setEnv({ RESEND_API_KEY: "re_1" });
calls = world({ ...base, docLinks: [], builtDocs: [] });
r = await call(sendDocs, "clTok", { clientId: C1 });
chk("documents email: a client can't send it → 403", r.status === 403);
r = await call(sendDocs, "opTok", { clientId: C1 });
chk("documents email: no documents yet → 400 saying to add them", r.status === 400 && /no documents yet/.test(r.body.error), r.body);
calls = world({ ...base, onboarding: { client_id: C1, invited_email: "pat@newco.test" },
  docLinks: [{ title: "NewCo: Customer Data", url: "https://docs.google.com/document/d/cd" }, { title: "NewCo: Your Voice", url: "https://docs.google.com/document/d/yv" }],
  builtDocs: [] });
r = await call(sendDocs, "opTok", { clientId: C1 });
const dm = calls.find(c => c.url.startsWith("https://api.resend.com")); const d = dm && JSON.parse(dm.body);
chk("documents email: sent to the invited email, both documents counted", r.status === 200 && r.body.sent === true && r.body.count === 2 && d.to[0] === "pat@newco.test", r.body);
chk("documents email: branded like the invite, with every document linked and the portal button", d && d.subject === "Here are your important documents, NewCo" && d.html.includes("https://social.fullylaunched.com/assets/logo-white.png") && d.html.includes("#C4AB82") && d.html.includes("Hi Pat,") && d.html.includes("https://docs.google.com/document/d/cd") && d.html.includes("https://docs.google.com/document/d/yv") && d.html.includes("https://social.fullylaunched.com/clients/newco#documents"), d && d.subject);
chk("documents email: plain-text version lists them too", d && d.text.includes("NewCo: Your Voice: https://docs.google.com/document/d/yv"));
// ── invite-editor ──
setEnv({ RESEND_API_KEY: "re_1" });
calls = world({ ...base, generateLink: (b, json) => json({ id: "ed9", email: b.email, hashed_token: "h9" }) });
r = await call(inviteEditor, "clTok", { name: "Sam", email: "sam@x.test" });
chk("invite-editor: a client can't invite editors → 403", r.status === 403);
r = await call(inviteEditor, "opTok", { name: "", email: "sam@x.test" });
chk("invite-editor: needs a name", r.status === 400 && /name/.test(r.body.error));
r = await call(inviteEditor, "opTok", { name: "Sam Rivera", email: "Sam@X.test" });
{ const gl = JSON.parse(calls.find(c => c.url.includes("generate_link")).body);
  chk("invite-editor: link to the editor page's setup, email lowercased", gl.type === "invite" && gl.email === "sam@x.test" && gl.redirect_to === "https://social.fullylaunched.com/editor/dashboard.html?setup=1", gl);
  const up = calls.find(c => c.url.includes("social_editors?on_conflict=id"));
  const row = up && JSON.parse(up.body);
  chk("invite-editor: adds the editor row for the new login, active, invite counted", row && row.id === "ed9" && row.name === "Sam Rivera" && row.email === "sam@x.test" && row.active === true && row.invite_count === 1 && !!row.invited_at, row);
  const m = JSON.parse(calls.find(c => c.url.startsWith("https://api.resend.com")).body);
  chk("invite-editor: 'Welcome to the Fully Launched editor dashboard', 'We are excited to have you on the team.', one 'Click to set up your dashboard' button on our own site",
    r.body.sent === true && m.to[0] === "sam@x.test" && m.subject === "Welcome to the Fully Launched editor dashboard" && m.html.includes("Hi Sam,") && m.html.includes("We are excited to have you on the team.") && m.html.includes(">Click to set up your dashboard<")
    && m.html.includes('href="https://social.fullylaunched.com/editor/dashboard.html?setup=1&amp;token_hash=h9&amp;type=invite"') && (m.html.match(/href=/g) || []).length === 1 && m.text.includes("Click to set up your dashboard: https://social.fullylaunched.com/editor/dashboard.html?setup=1&token_hash=h9&type=invite"), m.subject); }
calls = world({ ...base, editors: [{ id: "ed9", name: "Sam Rivera", email: "sam@x.test", invite_count: 1 }], generateLink: (b, json) => b.type === "invite" ? json({ msg: "already registered" }, 422) : json({ id: "ed9", properties: { hashed_token: "h10" } }) });
r = await call(inviteEditor, "opTok", { editorId: "ed9" });
{ const row = JSON.parse(calls.find(c => c.url.includes("social_editors?on_conflict=id")).body); const m = JSON.parse(calls.find(c => c.url.startsWith("https://api.resend.com")).body);
  chk("invite-editor: Resend uses their row, counts again, sign-in link for an existing login", r.body.sent === true && row.invite_count === 2 && m.html.includes("token_hash=h10&amp;type=email"), [row, r.body]); }
calls = world({ ...base, generateLink: (b, json) => b.type === "invite" ? json({ msg: "already registered" }, 422) : json({ id: "cl1", properties: { hashed_token: "h11" } }) });
r = await call(inviteEditor, "opTok", { name: "Pat", email: "pat@newco.test" });
chk("invite-editor: a client's login can't become an editor (and nothing is saved or sent)", r.status === 400 && /client/.test(r.body.error) && !calls.some(c => c.url.includes("social_editors?on_conflict")) && !calls.some(c => c.url.startsWith("https://api.resend.com")), r.body);

console.log(`${counts.pass} passed, ${counts.fail} failed`);
process.exit(counts.fail ? 1 : 0);
