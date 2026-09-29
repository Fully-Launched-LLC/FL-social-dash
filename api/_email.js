// The Fully Launched invite email: navy, white and a touch of tan, with the
// logo. Plain tables and inline styles, because that's what email apps
// render reliably.

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function inviteEmail({ contactName, clientName, link, portal, returning }) {
  const first = String(contactName || "").trim().split(/\s+/)[0];
  const hello = first ? `Hi ${esc(first)},` : "Hi,";
  const subject = returning ? `Your Fully Launched sign-in link` : `Welcome to Fully Launched, ${clientName}`;
  const intro = returning
    ? `Here's your link to sign in to ${esc(clientName)}'s Fully Launched portal.`
    : `We're excited to start working with ${esc(clientName)}. Your client portal is ready. Click below to create your password, and we'll walk you through a few quick steps so we can start making content that sounds like you.`;
  const steps = returning ? "" : `
    <tr><td style="padding:0 32px 8px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#ffffff">
      <b style="color:#C4AB82">What happens next</b><br>
      1. Create your password.<br>
      2. Share your brand, if you film your own videos.<br>
      3. Read a few questions about your business and your customers, then answer them in one voice memo on your phone and text it to us.<br>
      4. Drop in any footage you already have.<br>
      5. We turn your voice memo into your first documents and walk you through them.<br>
      6. A quick tour of your portal.
    </td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#04101f">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#04101f;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid rgba(255,255,255,.18);border-radius:16px">
        <tr><td style="padding:28px 32px 8px"><img src="${esc(portal)}/assets/logo-white.png" alt="Fully Launched" width="170" style="display:block;border:0"></td></tr>
        <tr><td style="padding:12px 32px 4px;font:700 22px/1.3 Helvetica,Arial,sans-serif;color:#ffffff">${esc(subject)}</td></tr>
        <tr><td style="padding:8px 32px 18px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#ffffff">${hello}<br><br>${intro}</td></tr>
        ${steps}
        <tr><td style="padding:18px 32px 26px">
          <a href="${esc(link)}" style="display:inline-block;background:#C4AB82;color:#04101f;font:700 15px Helvetica,Arial,sans-serif;text-decoration:none;padding:13px 24px;border-radius:10px">${returning ? "Sign in" : "Create my password"}</a>
          <div style="font:12px/1.5 Helvetica,Arial,sans-serif;color:rgba(255,255,255,.6);padding-top:14px">This link works once and expires in 24 hours. After that, sign in at <a href="${esc(portal)}" style="color:#ffffff">${esc(portal.replace(/^https?:\/\//, ""))}</a>.</div>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,.12);font:12px/1.5 Helvetica,Arial,sans-serif;color:rgba(255,255,255,.6)">Fully Launched · <a href="https://fullylaunched.com" style="color:rgba(255,255,255,.8)">fullylaunched.com</a></td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
  const text = `${first ? "Hi " + first + "," : "Hi,"}\n\n${returning ? `Here's your link to sign in to ${clientName}'s Fully Launched portal.` : `Your Fully Launched client portal for ${clientName} is ready. Create your password here:`}\n\n${link}\n\nThis link works once and expires in 24 hours. After that, sign in at ${portal}.\n\nFully Launched · fullylaunched.com`;
  return { subject, html, text };
}

module.exports = { inviteEmail };
