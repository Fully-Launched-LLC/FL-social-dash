// Shared Supabase Auth gate for all three dashboards. Inlined by build.py,
// same as shell.js — keep this framework-free (its one real dependency,
// the supabase-js UMD build, is loaded by its own <script> tag in each
// page's <head>, not bundled here).
//
// Every page's <body> starts with a bare <div id="authGate"></div> and
// wraps its existing sidebar+main in <div id="appShell" class="hidden">.
// This file shows the login form in authGate until Supabase confirms a
// signed-in session AND that login is authorized for this specific page
// (checked by the page's own resolveAccess — see initAuthGate below) —
// only then does appShell come off `hidden` and the page's own render
// functions run. Matches the three login populations in
// supabase/migrations/001_social_os_schema.sql (social_operators /
// social_editors / social_client_users) — there is no self-serve signup
// path into any of them, so this form only ever signs an existing login in.

let sbClient = null;

function authSetMessage(msg, isOk) {
  const el = document.getElementById("authError");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isOk ? "var(--green)" : "var(--red)";
}

function authShowGate(hasSession) {
  const gate = document.getElementById("authGate");
  const shell = document.getElementById("appShell");
  if (gate) gate.classList.remove("hidden");
  if (shell) shell.classList.add("hidden");
  const switchWrap = document.getElementById("authSwitchWrap");
  if (switchWrap) switchWrap.classList.toggle("hidden", !hasSession);
}
function authHideGate() {
  const gate = document.getElementById("authGate");
  const shell = document.getElementById("appShell");
  if (gate) gate.classList.add("hidden");
  if (shell) shell.classList.remove("hidden");
}

function authRenderForm() {
  const gate = document.getElementById("authGate");
  if (!gate || gate.dataset.rendered) return;
  gate.dataset.rendered = "1";
  gate.innerHTML = `
    <div class="auth-card">
      <div class="brand" style="margin-bottom:18px;align-items:center"><img src="/assets/logo-white.png" alt="Fully Launched" style="width:190px"></div>
      <form id="authForm">
        <label>Email<input type="email" id="authEmail" required autocomplete="email" /></label>
        <label>Password<input type="password" id="authPassword" required autocomplete="current-password" /></label>
        <div class="auth-error" id="authError"></div>
        <button type="submit" class="primary" id="authSubmit">Sign in</button>
      </form>
      <a href="#" id="authMagic" class="auth-forgot">No password? Email me a sign-in link</a>
      <a href="#" id="authForgot" class="auth-forgot">Forgot password?</a>
      <div id="authSwitchWrap" class="hidden">
        <a href="#" id="authSwitchBtn" class="auth-forgot">Not the right account? Sign out</a>
      </div>
    </div>
  `;
  document.getElementById("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    authSetMessage("");
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const btn = document.getElementById("authSubmit");
    btn.disabled = true; btn.textContent = "Signing in…";
    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = "Sign in";
    if (error) authSetMessage(error.message, false);
  });
  document.getElementById("authForgot").addEventListener("click", async e => {
    e.preventDefault();
    const email = (document.getElementById("authEmail").value || "").trim();
    if (!email) { authSetMessage('Enter your email above, then click "Forgot password?" again.', false); return; }
    authSetMessage("Sending reset email…", true);
    const { error } = await sbClient.auth.resetPasswordForEmail(email);
    authSetMessage(error ? error.message : "Password reset email sent — check your inbox.", !error);
  });
  // Invited clients sign in this way — the invite email is the same kind
  // of link. Never creates a login: only people already invited (or set
  // up) can get in.
  document.getElementById("authMagic").addEventListener("click", async e => {
    e.preventDefault();
    const email = (document.getElementById("authEmail").value || "").trim();
    if (!email) { authSetMessage("Enter your email above, then click the link again.", false); return; }
    authSetMessage("Sending your sign-in link…", true);
    const { error } = await sbClient.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split("#")[0] } });
    authSetMessage(error ? error.message : "Check your inbox — we sent you a link to sign in.", !error);
  });
  document.getElementById("authSwitchBtn").addEventListener("click", e => { e.preventDefault(); authSignOut(); });
}

// Small "signed in as ..." line a page's sidebar can opt into by including
// an element with id="authUserBadge" (see each template's sidebar).
function authRenderUserBadge(user) {
  const el = document.getElementById("authUserBadge");
  if (!el) return;
  el.innerHTML = `${escapeHtml(user.email || "")} · <a href="#" id="authSignOutBtn" style="color:inherit;text-decoration:underline">Sign out</a>`;
  document.getElementById("authSignOutBtn").onclick = e => { e.preventDefault(); authSignOut(); };
}

async function authSignOut() {
  if (sbClient) await sbClient.auth.signOut();
  location.reload();
}

// opts.resolveAccess(sbClient, user) -> Promise<{ok:true, role, roleRow} | {ok:false, reason}>
//   Page-specific: which role table(s) a login has to appear in to be let
//   into this particular dashboard. See the resolveAccess functions inline
//   in each template for what each page actually checks.
// opts.onReady(user, access) — called once, the first time access is
//   granted. Never called again on a later token refresh for the same
//   session; a sign-out reloads the page instead of trying to reset state
//   in place.
function initAuthGate(opts) {
  authRenderForm();

  if (typeof window.supabase === "undefined") {
    authSetMessage("Supabase library failed to load — check your connection and reload.", false);
    authShowGate(false);
    return;
  }
  if (!window.SUPABASE_CONFIG || !window.SUPABASE_CONFIG.url || !window.SUPABASE_CONFIG.anonKey) {
    authSetMessage("Supabase isn't configured on this machine — see supabase/config.example.js.", false);
    authShowGate(false);
    return;
  }

  sbClient = window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
  window.sbClient = sbClient;

  let ready = false;

  async function evaluate(session) {
    if (!session) { authShowGate(false); return; }
    const access = await opts.resolveAccess(sbClient, session.user);
    if (!access || !access.ok) {
      authSetMessage((access && access.reason) || "This login isn't authorized for this page.", false);
      authShowGate(true);
      return;
    }
    authHideGate();
    authRenderUserBadge(session.user);
    if (!ready) { ready = true; opts.onReady(session.user, access); }
  }

  sbClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") { location.reload(); return; }
    evaluate(session);
  });
  sbClient.auth.getSession().then(({ data }) => evaluate(data.session));
}
