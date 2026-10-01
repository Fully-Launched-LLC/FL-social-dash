// POST /api/invite { clientId }  (operators only)
//
// Makes a one-time sign-in link for the client's contact email that lands
// on /welcome (their onboarding), and emails it from Fully Launched. A new
// email gets an "invite" link (it creates their login; they set a password
// on the first step); an email that already has a login gets a sign-in link.
// The login is tied to the client the first time they open it
// (social_claim_client_invite, migration 006).
//
// If email sending isn't set up yet (no RESEND_API_KEY), it still returns
// the link so the operator can copy it and send it themselves.

const { env, need, rest, callerFrom, handler, portalUrl } = require("./_lib");
const { inviteEmail, sendEmail } = require("./_email");

async function generateLink(type, email, redirectTo) {
  const res = await fetch(env("SUPABASE_URL") + "/auth/v1/admin/generate_link", {
    method: "POST",
    headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ type, email, redirect_to: redirectTo }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

module.exports = handler(async (req, { clientId }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) { const e = new Error("Only operators can send invites."); e.status = 403; throw e; }

  const rows = await rest("social_clients?select=id,name,slug,contact_name,contact_email&id=eq." + encodeURIComponent(clientId || ""));
  const client = rows[0];
  if (!client) { const e = new Error("Client not found."); e.status = 404; throw e; }
  const email = String(client.contact_email || "").trim().toLowerCase();
  if (!email) { const e = new Error(`Add ${client.name}'s contact email first.`); e.status = 400; throw e; }

  const portal = portalUrl(req);
  // ?client= only matters if the email belongs to a team login (an
  // operator testing their own invite): it opens that client's preview
  // instead of an error. A client's own login ignores it.
  const redirectTo = portal + "/welcome?client=" + encodeURIComponent(client.slug);
  // New login → invite; existing login → magic link to sign in.
  let hasLogin = false;
  let r = await generateLink("invite", email, redirectTo);
  if (!r.ok) { hasLogin = true; r = await generateLink("magiclink", email, redirectTo); }
  // The button links to our own site (social.fullylaunched.com/welcome?
  // token_hash=…), and the page signs them in itself (auth.js, verifyOtp).
  // A link to a different domain than the sender looks like phishing to
  // spam filters. Supabase's own link is the fallback.
  const props = r.data.properties || {};
  const hashed = r.data.hashed_token || props.hashed_token;
  const link = hashed
    ? redirectTo + "&token_hash=" + encodeURIComponent(hashed) + "&type=" + (hasLogin ? "email" : "invite")
    : (r.data.action_link || props.action_link);
  if (!r.ok || !link) throw new Error("Couldn't make the sign-in link: " + (r.data.msg || r.data.error_description || r.data.message || "unknown error"));

  // Record the invite on their onboarding.
  const existing = await rest("social_client_onboarding?select=invite_count,completed_at&client_id=eq." + client.id);
  // The full welcome email (steps, "Create my password") goes to anyone who
  // hasn't finished onboarding, even if their email already has a login
  // (e.g. from an earlier invite). Only someone who has finished gets the
  // short sign-in email.
  const returning = hasLogin && !!(existing[0] && existing[0].completed_at);
  await rest("social_client_onboarding?on_conflict=client_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { client_id: client.id, invited_email: email, invited_at: new Date().toISOString(), invite_count: ((existing[0] && existing[0].invite_count) || 0) + 1, updated_at: new Date().toISOString() },
  });

  if (!env("RESEND_API_KEY")) return { sent: false, link, email, reason: "Email sending isn't set up yet (RESEND_API_KEY). Copy the link and send it yourself." };

  const { subject, html, text } = inviteEmail({ contactName: client.contact_name, clientName: client.name, link, portal, returning });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) return { sent: false, link, email, reason: "The email didn't send (" + mail.message + "). Copy the link and send it yourself." };
  return { sent: true, email, returning, ...(mail.warning ? { warning: mail.warning } : {}) };
});
