// The Fully Launched emails: navy, white and a touch of tan, with the
// logo. Plain tables and inline styles, because that's what email apps
// render reliably. Two emails use the same frame: the portal invite, and
// "here are your important documents" once Tait has made them.

const { env } = require("./_lib");

const DEFAULT_FROM = "Fully Launched <hello@fullylaunched.com>";
// Replies go to a real inbox (a reachable reply address also helps inboxes trust the mail).
const DEFAULT_REPLY_TO = "Tait Allen <tait@fullylaunched.com>";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const firstName = contactName => String(contactName || "").trim().split(/\s+/)[0];

const BODY = "font:15px/1.6 Helvetica,Arial,sans-serif;color:#ffffff";
const SMALL = "font:12px/1.5 Helvetica,Arial,sans-serif;color:rgba(255,255,255,.6)";
const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#C4AB82;color:#04101f;font:700 15px Helvetica,Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:10px">${esc(label)}</a>`;

// The shared frame: a white page with one navy box holding the logo, the
// title, then the email's own rows (and a footer link unless footer:false).
function frame({ portal, title, rows, footer = true }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#04101f;border-radius:16px">
        <tr><td style="padding:32px 32px 8px"><img src="${esc(portal)}/assets/logo-white.png" alt="Fully Launched" width="170" style="display:block;border:0"></td></tr>
        <tr><td style="padding:14px 32px 4px;font:700 24px/1.3 Helvetica,Arial,sans-serif;color:#ffffff">${esc(title)}</td></tr>
        ${rows}
        ${footer ? `<tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,.12);${SMALL}">Fully Launched · <a href="https://fullylaunched.com" style="color:rgba(255,255,255,.8)">fullylaunched.com</a></td></tr>` : ""}
      </table>
    </td></tr>
  </table></body></html>`;
}

// The portal invite (Tait, 2026-10-01): the logo, "Welcome to your Fully
// Social dashboard", "Hi <first name>, we are excited to start working with
// <company>.", and one Start here button at the bottom. Someone who has
// already finished onboarding gets a plain sign-in email instead.
function inviteEmail({ contactName, clientName, link, portal, returning }) {
  const first = firstName(contactName);
  const hi = first ? `Hi ${first},` : "Hi there,";
  if (!returning) {
    const subject = "Welcome to your Fully Social dashboard";
    const html = frame({ portal, title: subject, footer: false, rows: `
        <tr><td style="padding:10px 32px 4px;${BODY};font-size:16px">${esc(hi)}<br><br>We are excited to start working with ${esc(clientName)}.</td></tr>
        <tr><td style="padding:14px 32px 6px;${SMALL}">Click below to set up your account. This link only works once.</td></tr>
        <tr><td style="padding:12px 32px 32px"><a href="${esc(link)}" style="display:inline-block;background:#C4AB82;color:#04101f;font:700 18px Helvetica,Arial,sans-serif;text-decoration:none;padding:16px 40px;border-radius:12px">Start here</a></td></tr>` });
    const text = `Welcome to your Fully Social dashboard\n\n${hi}\n\nWe are excited to start working with ${clientName}.\n\nClick below to set up your account. This link only works once.\n\nStart here: ${link}`;
    return { subject, html, text };
  }
  const subject = "Your Fully Social dashboard sign-in link";
  const html = frame({ portal, title: subject, footer: false, rows: `
        <tr><td style="padding:8px 32px 10px;${BODY}">${esc(hi)}<br><br>Here's your link to sign in to ${esc(clientName)}'s social dashboard. It only works once.</td></tr>
        <tr><td style="padding:12px 32px 32px">${button(link, "Sign in")}</td></tr>` });
  const text = `${hi}\n\nHere's your link to sign in to ${clientName}'s social dashboard. It only works once.\n\n${link}`;
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
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: env("EMAIL_REPLY_TO") || DEFAULT_REPLY_TO }),
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
