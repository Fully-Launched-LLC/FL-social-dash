// POST /api/forgot-password { email }  (anyone, no login needed)
//
// The login page's "Forgot password? Create a new one." (Tait, 2026-10-12):
// emails a one-time link, from Tait, that opens /welcome?mode=reset (the
// "Set a new password" page). It replaced Supabase's own reset email and
// the "No password? Email me a sign-in link" option: only people Tait has
// added get an email at all.
//
// "Added" means an operator, an editor, a client's login, or a client's
// contact email that has been sent an invite. Anyone else gets the same
// answer as everyone, and nothing is sent, so the page never says which
// emails have an account.

const { env, need, rest, handler, portalUrl } = require("./_lib");
const { resetPasswordEmail, sendEmail } = require("./_email");

const SAME_ANSWER = { ok: true, message: "If that email has a Fully Launched login, we just sent it a link to create a new password. Check your inbox." };

// A recovery link for an existing login; none (an error) if there's no
// login for this email. Supabase never creates one here.
async function recoveryLink(email, redirectTo) {
  const res = await fetch(env("SUPABASE_URL") + "/auth/v1/admin/generate_link", {
    method: "POST",
    headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ type: "recovery", email, redirect_to: redirectTo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const hashed = data.hashed_token || (data.properties || {}).hashed_token;
  const user = data.user || data;
  if (!hashed || !user || !user.id) return null;
  // Our own site signs them in with the token (auth.js, verifyOtp), like the invites.
  return { userId: user.id, link: redirectTo + "&token_hash=" + encodeURIComponent(hashed) + "&type=recovery" };
}

async function isAdded(userId, email) {
  const id = encodeURIComponent(userId), em = encodeURIComponent(email);
  const [ops, eds, cus, invited] = await Promise.all([
    rest("social_operators?select=id&id=eq." + id),
    rest("social_editors?select=id&active=eq.true&id=eq." + id),
    rest("social_client_users?select=client_id&id=eq." + id),
    rest("social_client_onboarding?select=client_id&invited_at=not.is.null&invited_email=eq." + em),
  ]);
  return ops.length + eds.length + cus.length + invited.length > 0;
}

module.exports = handler(async (req, { email }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY");
  email = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { const e = new Error("That email doesn't look right."); e.status = 400; throw e; }

  const portal = portalUrl(req);
  const made = await recoveryLink(email, portal + "/welcome?mode=reset");
  if (!made || !(await isAdded(made.userId, email))) return SAME_ANSWER;

  const { subject, html, text } = resetPasswordEmail({ link: made.link, portal });
  const mail = await sendEmail({ to: email, subject, html, text, from: env("RESET_EMAIL_FROM") || "Tait Allen <tait@fullylaunched.com>" });
  if (!mail.ok) throw new Error("We couldn't send the email just now. Try again in a minute.");
  return SAME_ANSWER;
});
