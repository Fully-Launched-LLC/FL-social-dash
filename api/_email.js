// The Fully Launched emails: navy, white and a touch of tan, with the
// logo. Plain tables and inline styles, because that's what email apps
// render reliably. Two emails use the same frame: the portal invite, and
// "here are your important documents" once Tait has made them.

const { env } = require("./_lib");

const DEFAULT_FROM = "Fully Launched <hello@fullylaunched.com>";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const firstName = contactName => String(contactName || "").trim().split(/\s+/)[0];

const BODY = "font:15px/1.6 Helvetica,Arial,sans-serif;color:#ffffff";
const SMALL = "font:12px/1.5 Helvetica,Arial,sans-serif;color:rgba(255,255,255,.6)";
const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#C4AB82;color:#04101f;font:700 15px Helvetica,Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:10px">${esc(label)}</a>`;

// The shared frame: logo, title, then the email's own rows, then the footer.
function frame({ portal, title, rows }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#04101f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04101f;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid rgba(255,255,255,.18);border-radius:16px">
        <tr><td style="padding:28px 32px 8px"><img src="${esc(portal)}/assets/logo-white.png" alt="Fully Launched" width="170" style="display:block;border:0"></td></tr>
        <tr><td style="padding:12px 32px 4px;font:700 22px/1.3 Helvetica,Arial,sans-serif;color:#ffffff">${esc(title)}</td></tr>
        ${rows}
        <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,.12);${SMALL}">Fully Launched · <a href="https://fullylaunched.com" style="color:rgba(255,255,255,.8)">fullylaunched.com</a></td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function inviteEmail({ contactName, clientName, link, portal, returning }) {
  const first = firstName(contactName);
  const hello = first ? `Hi ${esc(first)},` : "Hi,";
  const subject = returning ? `Your Fully Launched sign-in link` : `Welcome to Fully Launched, ${clientName}`;
  const intro = returning
    ? `Here's your link to sign in to ${esc(clientName)}'s Fully Launched portal.`
    : `We're excited to start working with ${esc(clientName)}. Your client portal is ready. Click below to create your password, and we'll walk you through a few quick steps so we can start making content that sounds like you.`;
  const steps = returning ? "" : `
    <tr><td style="padding:0 32px 8px;${BODY}">
      <b style="color:#C4AB82">What happens next</b><br>
      1. Create your password.<br>
      2. Upload your brand files, if you film your own videos (or we'll make them for you).<br>
      3. Read a few questions about your business and your customers, then answer them in one voice memo on your phone and text it to us.<br>
      4. Drop in any footage you already have.<br>
      5. A quick tour of your portal.<br>
      Then we turn your voice memo into your important documents and email them to you.
    </td></tr>`;
  const html = frame({ portal, title: subject, rows: `
        <tr><td style="padding:8px 32px 18px;${BODY}">${hello}<br><br>${intro}</td></tr>
        ${steps}
        <tr><td style="padding:18px 32px 26px">
          ${button(link, returning ? "Sign in" : "Create my password")}
          <div style="${SMALL};padding-top:14px">This link works once and expires in 24 hours. After that, sign in at <a href="${esc(portal)}" style="color:#ffffff">${esc(portal.replace(/^https?:\/\//, ""))}</a>.</div>
        </td></tr>` });
  const text = `${first ? "Hi " + first + "," : "Hi,"}\n\n${returning ? `Here's your link to sign in to ${clientName}'s Fully Launched portal.` : `Your Fully Launched client portal for ${clientName} is ready. Create your password here:`}\n\n${link}\n\nThis link works once and expires in 24 hours. After that, sign in at ${portal}.\n\nFully Launched · fullylaunched.com`;
  return { subject, html, text };
}

// "Here are your important documents": each document Tait added (Google
// Docs, with links) and any built in the portal, plus a button to the
// portal's Documents page.
function documentsEmail({ contactName, clientName, docs, portalDocs, portal, portalLink }) {
  const first = firstName(contactName);
  const hello = first ? `Hi ${esc(first)},` : "Hi,";
  const subject = `Here are your important documents, ${clientName}`;
  const intro = `Thanks for your voice memo. We turned it into your important documents. They're the foundation for every piece of content we make with you, so read them through and tell us if anything doesn't sound like you.`;
  const docRow = d => `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.12);${BODY}">
      <b>${esc(d.title)}</b><br><a href="${esc(d.url)}" style="color:#C4AB82;font-weight:700;text-decoration:none">Open the document →</a></td></tr>`;
  const portalRow = t => `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.12);${BODY}"><b>${esc(t)}</b><br><span style="color:rgba(255,255,255,.6)">On your portal's Documents page</span></td></tr>`;
  const html = frame({ portal, title: subject, rows: `
        <tr><td style="padding:8px 32px 10px;${BODY}">${hello}<br><br>${intro}</td></tr>
        <tr><td style="padding:0 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${docs.map(docRow).join("")}${portalDocs.map(portalRow).join("")}</table></td></tr>
        <tr><td style="padding:18px 32px 26px">
          ${button(portalLink, "See them in my portal")}
          <div style="${SMALL};padding-top:14px">They're always on your portal's Documents page. Sign in at <a href="${esc(portal)}" style="color:#ffffff">${esc(portal.replace(/^https?:\/\//, ""))}</a>.</div>
        </td></tr>` });
  const text = `${first ? "Hi " + first + "," : "Hi,"}\n\n${intro}\n\n` +
    docs.map(d => `${d.title}: ${d.url}`).concat(portalDocs.map(t => `${t}: on your portal's Documents page`)).join("\n") +
    `\n\nSee them in your portal: ${portalLink}\n\nFully Launched · fullylaunched.com`;
  return { subject, html, text };
}

// Send one email through Resend, from EMAIL_FROM (or the default). If
// EMAIL_FROM is on a domain Resend hasn't verified (e.g. a typo), try once
// more from the default sender and say so.
async function sendEmail({ to, subject, html, text }) {
  const send = from => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  let mail = await send(env("EMAIL_FROM") || DEFAULT_FROM);
  let m = mail.ok ? {} : await mail.json().catch(() => ({}));
  let warning;
  if (!mail.ok && env("EMAIL_FROM") && /not verified/i.test(m.message || "")) {
    warning = `EMAIL_FROM (${env("EMAIL_FROM")}) isn't a verified Resend domain: ${m.message} Sent from ${DEFAULT_FROM} instead. Fix EMAIL_FROM in Vercel.`;
    mail = await send(DEFAULT_FROM);
    m = mail.ok ? {} : await mail.json().catch(() => ({}));
  }
  return mail.ok ? { ok: true, ...(warning ? { warning } : {}) } : { ok: false, message: m.message || String(mail.status) };
}

module.exports = { inviteEmail, documentsEmail, sendEmail, DEFAULT_FROM };
