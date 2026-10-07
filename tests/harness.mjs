// Shared test harness: a fresh PGlite database with the real migrations,
// a supabase-js stand-in that runs every query through it as a given user
// (so RLS and the action functions are real), and a loader that opens a
// built dashboard page in jsdom as that user.
import { PGlite } from "@electric-sql/pglite";
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync } from "fs";

import { fileURLToPath } from "url";
export const REPO = fileURLToPath(new URL("../", import.meta.url));
const MIGRATIONS = ["001_social_os_schema.sql", "002_social_videos_overview_body.sql", "003_social_videos_write_path.sql", "004_social_videos_final_cut_url.sql", "005_social_videos_on_screen_caption.sql", "006_client_journey.sql", "007_client_documents.sql", "008_client_onboarding.sql", "009_voice_memo_by_text.sql", "010_onboarding_uploads.sql", "011_client_questions.sql", "012_team_only_documents.sql", "013_editor_onboarding.sql", "014_video_review.sql"];

export async function freshDb() {
  const passthrough = v => v;
  const db = new PGlite({ parsers: { 1082: passthrough, 1184: passthrough, 1114: passthrough } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  for (const f of MIGRATIONS) await db.exec(readFileSync(REPO + "supabase/migrations/" + f, "utf8"));
  await db.exec(readFileSync(REPO + "supabase/migrations/004_social_videos_final_cut_url.sql", "utf8")); // re-run is safe
  return db;
}

export function makeHarness(db) {
  let inflight = 0;
  async function as(uid, sql, params = []) {
    // PGlite runs one query at a time; serialize so concurrent page requests don't interleave transactions.
    const run = async () => {
      await db.exec("begin");
      try {
        await db.query(`select set_config('role', 'authenticated', true)`);
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid })]);
        const r = await db.query(sql, params);
        await db.exec("commit");
        return { data: r.rows, error: null };
      } catch (e) { await db.exec("rollback"); return { data: null, error: { message: e.message, code: e.code } }; }
    };
    const p = (as.chain = (as.chain || Promise.resolve()).then(run, run));
    return p;
  }

  const JSONB = new Set(["editor_brief"]);
  function makeClient(uid, log) {
    const q = ident => '"' + ident + '"';
    function builder(table) {
      const st = { op: "select", cols: "*", where: [], params: [], order: [], single: false, returning: null, values: null, onConflict: null };
      const p = v => { st.params.push(v); return "$" + st.params.length; };
      const val = (k, v) => JSONB.has(k) ? JSON.stringify(v) : v;
      const b = {
        select(cols = "*") { if (st.op === "select") st.cols = cols; else st.returning = cols; return b; },
        eq(c, v) { st.where.push(`${q(c)} = ${p(v)}`); return b; },
        in(c, arr) { st.where.push(`${q(c)} = any(${p(arr)})`); return b; },
        is(c, v) { if (v === null) st.where.push(`${q(c)} is null`); else throw new Error("unsupported is"); return b; },
        not(c, op, v) { if (op === "is" && v === null) st.where.push(`${q(c)} is not null`); else throw new Error("unsupported not"); return b; },
        order(c, o = {}) { st.order.push(`${q(c)} ${o.ascending === false ? "desc" : "asc"}${o.nullsFirst === false ? " nulls last" : ""}`); return b; },
        maybeSingle() { st.single = true; return b; },
        update(obj) { st.op = "update"; st.values = obj; return b; },
        insert(obj) { st.op = "insert"; st.values = Array.isArray(obj) ? obj : [obj]; return b; },
        upsert(obj, o) { st.op = "upsert"; st.values = [obj]; st.onConflict = o.onConflict; return b; },
        delete() { st.op = "delete"; return b; },
        then(res, rej) { return run().then(res, rej); },
      };
      async function run() {
        inflight++;
        try {
          const cols = c => c === "*" ? "*" : c.split(",").map(x => q(x.trim())).join(",");
          let sql;
          const where = st.where.length ? " where " + st.where.join(" and ") : "";
          if (st.op === "select") sql = `select ${cols(st.cols)} from ${q(table)}${where}${st.order.length ? " order by " + st.order.join(",") : ""}`;
          else if (st.op === "update") sql = `update ${q(table)} set ${Object.entries(st.values).map(([k, v]) => `${q(k)} = ${p(val(k, v))}`).join(",")}${where}`;
          else if (st.op === "delete") sql = `delete from ${q(table)}${where}`;
          else {
            const keys = Array.from(new Set(st.values.flatMap(Object.keys)));
            const rows = st.values.map(r => "(" + keys.map(k => r[k] === undefined ? "default" : p(val(k, r[k]))).join(",") + ")").join(",");
            sql = `insert into ${q(table)} (${keys.map(q).join(",")}) values ${rows}`;
            if (st.op === "upsert") sql += ` on conflict (${q(st.onConflict)}) do update set ` + keys.filter(k => k !== st.onConflict).map(k => `${q(k)} = excluded.${q(k)}`).join(",");
          }
          if (st.op !== "select" && st.returning) sql += ` returning ${cols(st.returning)}`;
          const r = await as(uid, sql, st.params);
          log.push({ table, op: st.op, error: r.error && r.error.message });
          if (r.error) return { data: null, error: r.error };
          if (st.op !== "select" && !st.returning) return { data: null, error: null };
          if (st.single) return { data: r.data[0] || null, error: null };
          return { data: r.data, error: null };
        } finally { inflight--; }
      }
      return b;
    }
    return {
      from: builder,
      async rpc(fn, args) {
        args = args || {};
        inflight++;
        try {
          const names = Object.keys(args);
          const r = await as(uid, `select * from ${q(fn)}(${names.map((n, i) => `${n} => $${i + 1}`).join(",")})`, names.map(n => args[n]));
          log.push({ rpc: fn, error: r.error && r.error.message });
          if (r.error) return { data: null, error: r.error };
          // Like PostgREST: a function returning a plain value (not a row)
          // comes back as that value.
          const row = r.data[0], keys = row ? Object.keys(row) : [];
          return { data: keys.length === 1 && keys[0] === fn ? row[fn] : row, error: null };
        } finally { inflight--; }
      },
      auth: {
        getSession: async () => ({ data: { session: uid ? { user: { id: uid, email: uid + "@test" } } : null } }),
        onAuthStateChange: () => {}, signOut: async () => {},
        signInWithOtp: async o => { log.push({ otp: o }); return { error: null }; }, signInWithPassword: async () => ({}),
        resetPasswordForEmail: async (email, o) => { log.push({ reset: email, opts: o }); return { error: null }; },
        updateUser: async o => { log.push({ updateUser: o }); return { data: {}, error: null }; },
        verifyOtp: async o => { log.push({ verifyOtp: o }); return { data: {}, error: null }; },
      },
      // Storage: uploads are recorded, not stored.
      storage: { from: bucket => ({
        upload: async (path, file, o) => { log.push({ upload: { bucket, path, type: o && o.contentType, size: file && file.size } }); return { data: { path }, error: null }; },
        createSignedUrl: async path => ({ data: { signedUrl: "https://signed/" + path }, error: null }),
        createSignedUrls: async paths => ({ data: paths.map(path => ({ path, signedUrl: "https://signed/" + path })), error: null }),
      }) },
    };
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function settle() {
    let quiet = 0;
    for (let i = 0; i < 2000 && quiet < 4; i++) { await sleep(3); quiet = inflight === 0 ? quiet + 1 : 0; }
  }

  async function openPage(distPath, uid, url, opts = {}) {
    let html = readFileSync(REPO + "dashboards/dist/" + distPath, "utf8");
    html = html.replace(/<script src="https:\/\/cdn[^"]*"><\/script>/g, "").replace(/<script src="\/supabase\/config.js"><\/script>/, "");
    const ui = { alerts: [], prompts: [], promptsShown: [], confirms: [], log: [], errors: [] };
    const vc = new VirtualConsole();
    vc.on("jsdomError", e => ui.errors.push(e.message));
    vc.on("error", e => ui.errors.push(String(e)));
    const dom = new JSDOM(html, {
      url, runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(w) {
        w.SUPABASE_CONFIG = { url: "x", anonKey: "y" };
        w.supabase = { createClient: () => makeClient(uid, ui.log) };
        w.alert = m => ui.alerts.push(String(m));
        w.confirm = m => { ui.confirms.push(String(m)); return true; };
        w.prompt = m => (ui.promptsShown.push(String(m)), ui.prompts.length) ? ui.prompts.shift() : (opts.promptDefault ?? "a note");
        Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async () => {} } });
        // The page's calls to our own /api functions: opts.fetch answers them.
        w.fetch = async (u, o) => { ui.log.push({ fetch: String(u), body: o && o.body }); return opts.fetch ? opts.fetch(String(u), o) : { ok: false, status: 404, json: async () => ({ error: "Not found" }) }; };
      },
    });
    const page = { w: dom.window, d: dom.window.document, ui };
    await settle();
    return page;
  }
  return { as, openPage, settle };
}

export function checker() {
  const c = { pass: 0, fail: 0 };
  c.check = (name, cond, extra) => { if (cond) c.pass++; else { c.fail++; console.log("  FAIL:", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); } };
  return c;
}
