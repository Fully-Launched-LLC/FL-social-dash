// POST /api/notify-film { clientId }  (operators, or the bridge on Tait's Mac)
//
// Emails the client's contact "You have N videos ready to film" (Tait,
// 2026-11-18), listing every video on their portal's To film tab with its
// film-by day, and a button to their portal. To film is the portal's
// needsFilming(): a video (not a LinkedIn post) the client films, that is
// an idea sent to them (gate 1 cleared, not in the idea bank), To film or
// Filmed but not uploaded. Nothing changes in the database. The bridge
// sends it once a week per client while they have videos to film.

const { need, rest, callerFrom, handler, portalUrl } = require("./_lib");
const { filmReminderEmail, sendEmail } = require("./_email");

const toFilm = (v, clientSystem) => {
  const filmedBy = v.filmed_by || (clientSystem === "concierge" ? "us" : "client");
  if (v.content_type === "linkedin_post" || filmedBy !== "client") return false;
  if (v.status === "concept_pending") return !!v.concept_approved_at && !(v.editor_brief && v.editor_brief.ideaBank);
  return v.status === "to_film" || v.status === "filmed";
};

module.exports = handler(async (req, { clientId }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) { const e = new Error("Only operators can send this email."); e.status = 403; throw e; }

  const rows = await rest("social_clients?select=id,name,slug,contact_name,contact_email,client_system&id=eq." + encodeURIComponent(clientId || ""));
  const client = rows[0];
  if (!client) { const e = new Error("Client not found."); e.status = 404; throw e; }
  const email = String(client.contact_email || "").trim().toLowerCase();
  if (!email) { const e = new Error(`Add ${client.name}'s contact email first.`); e.status = 400; throw e; }

  const all = await rest("social_videos?select=title,due_to_film,post_date,status,filmed_by,content_type,concept_approved_at,editor_brief&status=in.(concept_pending,to_film,filmed)&client_id=eq." + client.id + "&order=due_to_film.asc.nullslast,post_date.asc.nullslast");
  const videos = all.filter(v => toFilm(v, client.client_system));
  if (!videos.length) { const e = new Error(`${client.name} has no videos to film.`); e.status = 400; throw e; }

  need("RESEND_API_KEY");
  const { subject, html, text } = filmReminderEmail({ contactName: client.contact_name, videos, portal: portalUrl(req), slug: client.slug });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) { const e = new Error("The email didn't send (" + mail.message + ")."); e.status = 502; throw e; }
  return { sent: true, email, count: videos.length, ...(mail.warning ? { warning: mail.warning } : {}) };
});

module.exports.toFilm = toFilm;
