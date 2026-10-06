// POST /api/invite-editor { name, email } or { editorId }  (operators only)
//
// Adds an editor (or re-sends their invite) and emails them "Welcome to
// the Fully Launched editor dashboard" with one button, "Click to set up
// your dashboard" (Tait, 2026-10-06). The link signs them in on the editor
// page, which asks them to create a password and then walks them through
// it (social_editors.setup_at, migration 013).
//
// The login is created by the invite link (or an existing one is used),
// and its social_editors row is added here, so the operator never touches
// Supabase Auth. A client's login can't be made an editor: one login opens
// one dashboard.
//
// If email sending isn't set up yet (no RESEND_API_KEY), it still returns
// the link so the operator can copy it and send it themselves.

const { env, need, rest, callerFrom, handler, portalUrl, signInLink } = require("./_lib");
const { editorInviteEmail, sendEmail } = require("./_email");

const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };

module.exports = handler(async (req, { name, email, editorId }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) fail(403, "Only operators can invite editors.");

  let existing = null;
  if (editorId) {
    existing = (await rest("social_editors?select=*&id=eq." + encodeURIComponent(editorId)))[0];
    if (!existing) fail(404, "Editor not found.");
    name = existing.name; email = existing.email;
  }
  name = String(name || "").trim();
  email = String(email || "").trim().toLowerCase();
  if (!name) fail(400, "Add the editor's name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, "That email doesn't look right.");
  if (!existing) {
    existing = (await rest("social_editors?select=*&email=eq." + encodeURIComponent(email)))[0] || null;
  }

  const portal = portalUrl(req);
  const { link, userId } = await signInLink(email, portal + "/editor/dashboard.html?setup=1");
  if (!userId) throw new Error("Couldn't find the login for " + email + ".");
  const [ops, cus] = await Promise.all([
    rest("social_operators?select=id&id=eq." + userId),
    rest("social_client_users?select=client_id&id=eq." + userId),
  ]);
  if (cus.length) fail(400, `${email} is already a client's login. Use a different email for the editor (for a Gmail address, name+editor@gmail.com reaches the same inbox).`);
  if (ops.length) fail(400, `${email} is an operator login. Operators already see the editor page.`);

  const now = new Date().toISOString();
  await rest("social_editors?on_conflict=id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { id: userId, name, email, active: true, invited_at: now, invite_count: ((existing && existing.invite_count) || 0) + 1 },
  });

  if (!env("RESEND_API_KEY")) return { sent: false, link, email, reason: "Email sending isn't set up yet (RESEND_API_KEY). Copy the link and send it yourself." };
  const { subject, html, text } = editorInviteEmail({ name, link, portal });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) return { sent: false, link, email, reason: "The email didn't send (" + mail.message + "). Copy the link and send it yourself." };
  return { sent: true, email, ...(mail.warning ? { warning: mail.warning } : {}) };
});
