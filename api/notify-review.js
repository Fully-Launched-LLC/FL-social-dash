// POST /api/notify-review { clientId }  (operators only)
//
// Emails the client's contact "You have N videos ready to review", listing
// every video waiting on their approval (status client_review) with its
// post date, and a button to their portal. Nothing changes in the database.

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
  if (!videos.length) { const e = new Error(`${client.name} has no videos waiting for their review.`); e.status = 400; throw e; }

  need("RESEND_API_KEY");
  const { subject, html, text } = reviewReadyEmail({ contactName: client.contact_name, videos, portal: portalUrl(req), slug: client.slug });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) { const e = new Error("The email didn't send (" + mail.message + ")."); e.status = 502; throw e; }
  return { sent: true, email, count: videos.length, ...(mail.warning ? { warning: mail.warning } : {}) };
});
