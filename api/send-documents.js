// POST /api/send-documents { clientId }  (operators only)
//
// Once Tait has made a client's important documents (the Google Docs he
// adds on Clients → Edit → Documents, leaving out Team only ones, and any built from their voice memo),
// he clicks "Email them their documents" on their Onboarding panel. This
// sends one branded email listing every document, with a button to their
// portal's Documents page. It goes to the email they were invited at (or
// the client's contact email).

const { need, rest, callerFrom, handler, portalUrl } = require("./_lib");
const { documentsEmail, sendEmail } = require("./_email");

module.exports = handler(async (req, { clientId }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) { const e = new Error("Only operators can send documents."); e.status = 403; throw e; }

  const id = encodeURIComponent(clientId || "");
  const [clients, onboarding, docs, built] = await Promise.all([
    rest("social_clients?select=id,name,slug,contact_name,contact_email&id=eq." + id),
    rest("social_client_onboarding?select=invited_email&client_id=eq." + id),
    rest("social_client_documents?select=title,url&order=position&team_only=eq.false&client_id=eq." + id),
    rest("social_client_generated_docs?select=title&order=kind&client_id=eq." + id),
  ]);
  const client = clients[0];
  if (!client) { const e = new Error("Client not found."); e.status = 404; throw e; }
  const email = String((onboarding[0] && onboarding[0].invited_email) || client.contact_email || "").trim().toLowerCase();
  if (!email) { const e = new Error(`Add ${client.name}'s contact email first.`); e.status = 400; throw e; }
  if (!docs.length && !built.length) { const e = new Error(`${client.name} has no documents yet. Add them on Clients → Edit → Documents first.`); e.status = 400; throw e; }

  const portal = portalUrl(req);
  const { subject, html, text } = documentsEmail({
    contactName: client.contact_name, clientName: client.name, portal,
    docs, portalDocs: built.map(d => d.title),
    portalLink: portal + "/clients/" + encodeURIComponent(client.slug) + "#documents",
  });
  const mail = await sendEmail({ to: email, subject, html, text });
  if (!mail.ok) { const e = new Error("The email didn't send (" + mail.message + ")."); e.status = 502; throw e; }
  return { sent: true, email, count: docs.length + built.length, ...(mail.warning ? { warning: mail.warning } : {}) };
});
