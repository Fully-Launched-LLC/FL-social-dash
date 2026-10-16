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

// The editor invite (Tait, 2026-10-06): "Welcome to the Fully Launched
// editor dashboard", "We are excited to have you on the team.", and one
// "Click to set up your dashboard" button.
function editorInviteEmail({ name, link, portal }) {
  const first = firstName(name);
  const hi = first ? `Hi ${first},` : "Hi there,";
  const subject = "Welcome to the Fully Launched editor dashboard";
  const html = frame({ portal, title: subject, footer: false, rows: `
        <tr><td style="padding:10px 32px 4px;${BODY};font-size:16px">${esc(hi)}<br><br>We are excited to have you on the team.</td></tr>
        <tr><td style="padding:14px 32px 6px;${SMALL}">Click below to create your password and see around your dashboard. This link only works once.</td></tr>
        <tr><td style="padding:12px 32px 32px"><a href="${esc(link)}" style="display:inline-block;background:#C4AB82;color:#04101f;font:700 18px Helvetica,Arial,sans-serif;text-decoration:none;padding:16px 32px;border-radius:12px">Click to set up your dashboard</a></td></tr>` });
  const text = `${subject}\n\n${hi}\n\nWe are excited to have you on the team.\n\nClick below to create your password and see around your dashboard. This link only works once.\n\nClick to set up your dashboard: ${link}`;
  return { subject, html, text };
}

// "Forgot password? Create a new one." (Tait, 2026-10-12): sent from Tait,
// one button to the "Set a new password" page (api/forgot-password.js).
function resetPasswordEmail({ link, portal }) {
  const subject = "Forgot your password?";
  const html = frame({ portal, title: "Hey, you forgot your password?", footer: false, rows: `
        <tr><td style="padding:10px 32px 4px;${BODY};font-size:16px">Click right here to change your password.</td></tr>
        <tr><td style="padding:16px 32px 6px">${button(link, "Change my password")}</td></tr>
        <tr><td style="padding:14px 32px 32px;${SMALL}">This link only works once. If you didn't ask for it, ignore this email and your password stays the same.</td></tr>` });
  const text = `Hey, you forgot your password?\n\nClick right here to change your password:\n${link}\n\nThis link only works once. If you didn't ask for it, ignore this email and your password stays the same.`;
  return { subject, html, text };
}

// "Videos ready to review" (Tait, 2026-10-16): sent by the operator from
// the Clients page when the client has finished videos waiting on them.
// Lists each video with its post date, one button to their portal.
function reviewReadyEmail({ contactName, videos, portal, slug }) {
  const first = firstName(contactName);
  const hi = first ? `Hi ${first},` : "Hi there,";
  const n = videos.length;
  const what = n === 1 ? "1 video" : `${n} videos`;
  const subject = `You have ${what} ready to review`;
  const link = portal + "/clients/" + encodeURIComponent(slug);
  const when = d => d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  const list = videos.map(v => `<tr><td style="padding:3px 32px;${BODY}">&bull; ${esc(v.title)}${v.post_date ? ` <span style="color:rgba(255,255,255,.6)">(posts ${esc(when(v.post_date))})</span>` : ""}</td></tr>`).join("");
  const html = frame({ portal, title: subject, rows: `
        <tr><td style="padding:10px 32px 10px;${BODY};font-size:16px">${esc(hi)}<br><br>You have ${esc(what)} ready to review in your Fully Social portal.</td></tr>
        ${list}
        <tr><td style="padding:14px 32px 6px;${SMALL}">Watch each one, then approve it or leave a note on the moment you'd like changed.</td></tr>
        <tr><td style="padding:12px 32px 28px">${button(link, "Review them")}</td></tr>` });
  const text = `${hi}\n\nYou have ${what} ready to review in your Fully Social portal.\n\n${videos.map(v => "- " + v.title + (v.post_date ? " (posts " + when(v.post_date) + ")" : "")).join("\n")}\n\nWatch each one, then approve it or leave a note on the moment you'd like changed.\n\nReview them: ${link}`;
  return { subject, html, text };
}

// Send one email through Resend, from EMAIL_FROM (or the default). If
// EMAIL_FROM is on a domain Resend hasn't verified (e.g. a typo), try once
// more from the default sender and say so.
// `from` overrides both (the password email comes from Tait).
async function sendEmail({ to, subject, html, text, from: fromOverride }) {
  const send = from => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env("RESEND_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: env("EMAIL_REPLY_TO") || DEFAULT_REPLY_TO }),
  });
  const chosen = fromOverride || env("EMAIL_FROM");
  let mail = await send(chosen || DEFAULT_FROM);
  let m = mail.ok ? {} : await mail.json().catch(() => ({}));
  let warning;
  if (!mail.ok && chosen && /not verified/i.test(m.message || "")) {
    warning = `${chosen} isn't a verified Resend domain: ${m.message} Sent from ${DEFAULT_FROM} instead. Fix EMAIL_FROM in Vercel.`;
    mail = await send(DEFAULT_FROM);
    m = mail.ok ? {} : await mail.json().catch(() => ({}));
  }
  return mail.ok ? { ok: true, ...(warning ? { warning } : {}) } : { ok: false, message: m.message || String(mail.status) };
}

module.exports = { inviteEmail, editorInviteEmail, resetPasswordEmail, reviewReadyEmail, sendEmail, DEFAULT_FROM };
