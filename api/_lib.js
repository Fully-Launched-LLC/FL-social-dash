// Shared helpers for the /api functions (Vercel serverless, Node 18+).
// No npm dependencies: everything is a plain fetch to Supabase, Resend,
// or Anthropic. Keys come from Vercel environment variables and
// never reach the browser:
//
//   SUPABASE_URL, SUPABASE_ANON_KEY   already set (the pages use them too)
//   SUPABASE_SERVICE_ROLE_KEY         lets these functions act as admin
//   PORTAL_URL                        e.g. https://social.fullylaunched.com
//   RESEND_API_KEY, EMAIL_FROM        sending the invite email
//   ANTHROPIC_API_KEY, ANTHROPIC_MODEL  building the documents
//
// Every function checks who's calling from their Supabase login (the
// Authorization: Bearer <access token> header) before doing anything.

const env = name => (process.env[name] || "").trim();

function need(...names) {
  const missing = names.filter(n => !env(n));
  if (missing.length) {
    const e = new Error("Not set up yet: add " + missing.join(", ") + " in Vercel → Settings → Environment Variables.");
    e.status = 503; e.missing = missing;
    throw e;
  }
}

// Supabase REST (PostgREST) as the service role: bypasses RLS, so every
// caller is checked first (see callerFrom).
async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
      Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"),
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error("Database: " + ((data && (data.message || data.msg)) || res.status));
  return data;
}

// Who's calling: their Supabase user, and whether they're an operator or
// which client they log in for.
async function callerFrom(req) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) { const e = new Error("Sign in first."); e.status = 401; throw e; }
  const res = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: env("SUPABASE_ANON_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + token },
  });
  if (!res.ok) { const e = new Error("Your sign-in has expired. Sign in again."); e.status = 401; throw e; }
  const user = await res.json();
  const [ops, cus] = await Promise.all([
    rest("social_operators?select=id&id=eq." + user.id),
    rest("social_client_users?select=client_id&id=eq." + user.id),
  ]);
  return { user, isOperator: ops.length > 0, clientId: cus.length ? cus[0].client_id : null };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// Wraps a handler: POST only, JSON body, errors become { error } with the
// right status.
function handler(fn) {
  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "Use POST." });
    try {
      let body = req.body;
      if (typeof body === "string") body = body ? JSON.parse(body) : {};
      const out = await fn(req, body || {});
      send(res, 200, out);
    } catch (e) {
      send(res, e.status || 500, { error: e.message || String(e), missing: e.missing });
    }
  };
}

function portalUrl(req) {
  if (env("PORTAL_URL")) return env("PORTAL_URL").replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return (req.headers["x-forwarded-proto"] || "https") + "://" + host;
}

// A one-time link that signs someone in on our own site. A new email gets
// an "invite" link (it creates their login); an email that already has a
// login gets a sign-in link. The link goes to redirectTo with
// token_hash=…&type=…, and the page signs them in itself (auth.js,
// verifyOtp): a link to a different domain than the sender looks like
// phishing to spam filters. Supabase's own link is the fallback.
async function generateLink(type, email, redirectTo) {
  const res = await fetch(env("SUPABASE_URL") + "/auth/v1/admin/generate_link", {
    method: "POST",
    headers: { apikey: env("SUPABASE_SERVICE_ROLE_KEY"), Authorization: "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({ type, email, redirect_to: redirectTo }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}
async function signInLink(email, redirectTo) {
  let hasLogin = false;
  let r = await generateLink("invite", email, redirectTo);
  if (!r.ok) { hasLogin = true; r = await generateLink("magiclink", email, redirectTo); }
  const props = r.data.properties || {};
  const hashed = r.data.hashed_token || props.hashed_token;
  const link = hashed
    ? redirectTo + (redirectTo.includes("?") ? "&" : "?") + "token_hash=" + encodeURIComponent(hashed) + "&type=" + (hasLogin ? "email" : "invite")
    : (r.data.action_link || props.action_link);
  if (!r.ok || !link) throw new Error("Couldn't make the sign-in link: " + (r.data.msg || r.data.error_description || r.data.message || "unknown error"));
  const user = r.data.user || r.data;
  return { link, hasLogin, userId: user && user.id };
}

module.exports = { env, need, rest, callerFrom, send, handler, portalUrl, signInLink };
