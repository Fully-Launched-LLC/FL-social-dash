// POST /api/notify-review { clientId }  (operators, or the bridge on Tait's Mac)
//
// Emails the client's contact "You have N videos ready to review", listing
// every video waiting on their approval (status client_review) with its
// post date, plus (Unify Phase 7) every video card waiting for them to
// approve, and a button to their portal. Nothing changes in the database.
// The bridge sends it once a day per client automatically (bridge.py).

const { env, need, rest, callerFrom, handler, portalUrl } = require("./_lib");
const { reviewReadyEmail, sendEmail } = require("./_email");

module.exports = handler(async (req, { clientId }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) { const e = new Error("Only operators can send this email."); e.status = 403; throw e; }

  const rows = await rest("social_clients?select=id,name,slug,contact_name,contact_email&id=eq." + encodeURIComponent(clientId || ""));
  const client = rows[0];
  if (!client) { const e = new Error("Client not found."); e.status = 404; throw e; }
  const email = String(client.contact_email || "").trim().toLowerCase();
  if (!email) { const e = new Error(`Add ${client.name}'s contact email first.`); e.status = 400; throw e; }

  const videos = await rest("social_videos?select=title,post_date&status=eq.client_review&client_id=eq." + client.id + "&order=post_date.asc.nullslast");
  const cards = await rest("social_videos?select=title,post_date&status=eq.concept_pending&concept_approved_at=not.is.null&client_id=eq." + client.id + "&order=post_date.asc.nullslast");
  if (!videos.length && !cards.length) { const e = new Error(`${client.name} has nothing waiting for them.`); e.status = 400; throw e; }

  need("RESEND_API_KEY");
  const { subject, html, text } = reviewReadyEmail({ contactName: client.contact_name, videos, cards, portal: portalUrl(req), slug: client.slug });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) { const e = new Error("The email didn't send (" + mail.message + ")."); e.status = 502; throw e; }
  return { sent: true, email, count: videos.length + cards.length, ...(mail.warning ? { warning: mail.warning } : {}) };
});
