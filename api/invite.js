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
//
// { clientId, email, name } invites someone else on the client's team to the
// same portal (a member, migration 039; Tait, 2026-10-26: "it's not just
// Mark, but it's other people on his board as well"). The contact stays as
// they are; the member gets the same welcome email, in their own name.

const { env, need, rest, callerFrom, handler, portalUrl, signInLink } = require("./_lib");
const { inviteEmail, sendEmail } = require("./_email");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

module.exports = handler(async (req, { clientId, email: memberEmail, name: memberName }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) { const e = new Error("Only operators can send invites."); e.status = 403; throw e; }

  const rows = await rest("social_clients?select=id,name,slug,contact_name,contact_email&id=eq." + encodeURIComponent(clientId || ""));
  const client = rows[0];
  if (!client) { const e = new Error("Client not found."); e.status = 404; throw e; }
  const contactEmail = String(client.contact_email || "").trim().toLowerCase();
  memberEmail = String(memberEmail || "").trim().toLowerCase();
  const portal = portalUrl(req);
  if (memberEmail && memberEmail !== contactEmail) return inviteMember(req, client, memberEmail, String(memberName || "").trim() || null, portal);
  const email = contactEmail;
  if (!email) { const e = new Error(`Add ${client.name}'s contact email first.`); e.status = 400; throw e; }

  // ?client= only matters if the email belongs to a team login (an
  // operator testing their own invite): it opens that client's preview
  // instead of an error. A client's own login ignores it.
  const redirectTo = portal + "/welcome?client=" + encodeURIComponent(client.slug);
  // New login → invite; existing login → a sign-in link (signInLink in _lib).
  const { link, hasLogin } = await signInLink(email, redirectTo);

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

async function inviteMember(req, client, email, name, portal) {
  if (!EMAIL_RE.test(email)) { const e = new Error("That email doesn't look right."); e.status = 400; throw e; }
  const enc = encodeURIComponent(email);
  // One login opens one portal: not someone already on another client, the team, or an editor.
  const [other, users, ops, eds] = await Promise.all([
    rest("social_clients?select=name&contact_email=ilike." + enc + "&id=neq." + client.id),
    rest("social_client_users?select=client_id&email=ilike." + enc),
    rest("social_operators?select=id&email=ilike." + enc),
    rest("social_editors?select=id&email=ilike." + enc),
  ]);
  if (other.length || users.some(u => u.client_id !== client.id) || ops.length || eds.length) {
    const e = new Error(`${email} already opens a different dashboard. One login opens one dashboard: use another email for them.`); e.status = 400; throw e;
  }
  const existing = await rest("social_client_members?select=id,client_id,name,invite_count&email=ilike." + enc);
  if (existing[0] && existing[0].client_id !== client.id) { const e = new Error(`${email} is already on another client's portal.`); e.status = 400; throw e; }
  const now = new Date().toISOString();
  if (existing[0]) {
    await rest("social_client_members?id=eq." + existing[0].id, { method: "PATCH", prefer: "return=minimal",
      body: { invited_at: now, invite_count: (existing[0].invite_count || 0) + 1, ...(name ? { name } : {}) } });
  } else {
    await rest("social_client_members", { method: "POST", prefer: "return=minimal", body: { client_id: client.id, email, name, invited_at: now, invite_count: 1 } });
  }
  const { link, hasLogin } = await signInLink(email, portal + "/welcome?client=" + encodeURIComponent(client.slug));
  // Already signed in once: the short sign-in email; otherwise the full welcome.
  const returning = hasLogin && users.some(u => u.client_id === client.id);
  if (!env("RESEND_API_KEY")) return { sent: false, link, email, member: true, reason: "Email sending isn't set up yet (RESEND_API_KEY). Copy the link and send it yourself." };
  const { subject, html, text } = inviteEmail({ contactName: name || (existing[0] && existing[0].name), clientName: client.name, link, portal, returning });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) return { sent: false, link, email, member: true, reason: "The email didn't send (" + mail.message + "). Copy the link and send it yourself." };
  return { sent: true, email, member: true, returning, ...(mail.warning ? { warning: mail.warning } : {}) };
}
