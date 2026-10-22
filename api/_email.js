// The Fully Launched emails, in the dashboard's liquid glass (Tait,
// 2026-10-22: "make sure the onboarding process and emails have the same
// liquid glass design as the dashboard"): a navy page, the platinum logo
// moving at the top (an animated GIF), and one glass card: a lit navy
// gradient with a bright rim, white text, gold pill buttons. Email apps
// can't blur, so the glass is drawn with gradients and borders; Gmail drops
// the gradients and keeps the solid navy. Plain tables and inline styles,
// because that's what email apps render reliably.

const { env } = require("./_lib");

const DEFAULT_FROM = "Fully Launched <hello@fullylaunched.com>";
// Replies go to a real inbox (a reachable reply address also helps inboxes trust the mail).
const DEFAULT_REPLY_TO = "Tait Allen <tait@fullylaunched.com>";

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const firstName = contactName => String(contactName || "").trim().split(/\s+/)[0];

const BODY = "font:15px/1.6 Helvetica,Arial,sans-serif;color:#ffffff";
const SMALL = "font:12px/1.5 Helvetica,Arial,sans-serif;color:rgba(255,255,255,.6)";
// A gold glass pill: the one action in every email.
const GOLD_PILL = "display:inline-block;background:#C4AB82;background-image:linear-gradient(180deg,#dcc7a1,#C4AB82 55%,#b3976a);color:#04101f;text-decoration:none;border-radius:999px;border:1px solid #e6d6b4;box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 6px 18px rgba(0,0,0,.35)";
const button = (href, label, big) => `<a href="${esc(href)}" style="${GOLD_PILL};font:700 ${big ? 18 : 15}px Helvetica,Arial,sans-serif;padding:${big ? "16px 40px" : "13px 28px"}">${esc(label)}</a>`;

// The shared frame: a navy page, the logo in motion and the wordmark, then
// one glass card holding the title and the email's own rows (and a footer
// link unless footer:false).
function frame({ portal, title, rows, footer = true }) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
  <body style="margin:0;padding:0;background:#04101f" bgcolor="#04101f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#04101f" style="background:#04101f;background-image:radial-gradient(900px 600px at 10% -10%,#1c3a68,#04101f 62%);padding:28px 12px 36px">
    <tr><td align="center">
      <img src="${esc(portal)}/assets/motion/logo-platinum.gif" alt="" width="110" height="110" style="display:block;border:0;margin:0 auto">
      <img src="${esc(portal)}/assets/logo-white.png" alt="Fully Launched" width="170" style="display:block;border:0;margin:2px auto 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#11233d" style="max-width:560px;background:#11233d;background-image:linear-gradient(145deg,#22385a,#0e1f37 55%,#183052);border:1px solid #3d5070;border-top-color:#6d7f9c;border-left-color:#5a6d8c;border-radius:24px;box-shadow:inset 1px 1px 0 rgba(255,255,255,.35),0 18px 40px rgba(0,0,0,.45)">
        <tr><td style="padding:30px 32px 4px;font:700 24px/1.3 Helvetica,Arial,sans-serif;color:#ffffff;letter-spacing:-.01em">${esc(title)}</td></tr>
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
        <tr><td style="padding:12px 32px 32px">${button(link, "Start here", true)}</td></tr>` });
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
        <tr><td style="padding:12px 32px 32px">${button(link, "Click to set up your dashboard", true)}</td></tr>` });
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
function reviewReadyEmail({ contactName, videos, cards = [], portal, slug }) {
  const first = firstName(contactName);
  const hi = first ? `Hi ${first},` : "Hi there,";
  const n = videos.length, m = cards.length;
  const vids = n === 1 ? "1 video" : `${n} videos`, crds = m === 1 ? "1 video card" : `${m} video cards`;
  // (Unify Phase 7) Cards ready to approve can come with the videos.
  const what = n && m ? `${vids} to review and ${crds} to approve` : n ? `${vids} ready to review` : `${crds} ready to approve`;
  const subject = `You have ${what}`;
  const link = portal + "/clients/" + encodeURIComponent(slug);
  const when = d => d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";
  const rows = list => list.map(v => `<tr><td style="padding:3px 32px;${BODY}">&bull; ${esc(v.title)}${v.post_date ? ` <span style="color:rgba(255,255,255,.6)">(posts ${esc(when(v.post_date))})</span>` : ""}</td></tr>`).join("");
  const head = label => `<tr><td style="padding:10px 32px 2px;${SMALL}">${label}</td></tr>`;
  const how = n && m ? "Approve each card or ask for changes, and watch each video, then approve it or leave a note on the moment you'd like changed."
    : n ? "Watch each one, then approve it or leave a note on the moment you'd like changed." : "Read each card, then approve it or ask for changes.";
  const html = frame({ portal, title: subject, rows: `
        <tr><td style="padding:10px 32px 10px;${BODY};font-size:16px">${esc(hi)}<br><br>You have ${esc(what)} in your Fully Social portal.</td></tr>
        ${m && n ? head("Videos to review") : ""}${rows(videos)}
        ${m && n ? head("Video cards to approve") : ""}${rows(cards)}
        <tr><td style="padding:14px 32px 6px;${SMALL}">${how}</td></tr>
        <tr><td style="padding:12px 32px 28px">${button(link, n ? "Review them" : "Open your portal")}</td></tr>` });
  const lines = list => list.map(v => "- " + v.title + (v.post_date ? " (posts " + when(v.post_date) + ")" : "")).join("\n");
  const text = `${hi}\n\nYou have ${what} in your Fully Social portal.\n\n${[lines(videos), lines(cards)].filter(Boolean).join("\n")}\n\n${how}\n\n${n ? "Review them" : "Open your portal"}: ${link}`;
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
