// Run: npm i --no-save @electric-sql/pglite && node supabase/tests/013_team_only_access.test.mjs
// CRM migration 013: only team members (confirmed email on team_members) can
// read or change CRM tables; any other login (a client or editor from the
// social dashboard) sees nothing and can't write.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "fs";
const CRM = new URL("../", import.meta.url).pathname;
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated; grant execute on all functions in schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
const files = ["schema.sql", ...readdirSync(CRM + "migrations").filter(f => f.endsWith(".sql")).sort().map(f => "migrations/" + f)];
for (const f of files) {
  try { await db.exec(readFileSync(CRM + f, "utf8")); } catch (e) { console.log("LOAD FAIL", f, e.message); process.exit(1); }
}
await db.exec(`grant all on all tables in schema public to anon, authenticated;`);
const T = "00000000-0000-0000-0000-0000000000a1", C = "00000000-0000-0000-0000-0000000000c1", U = "00000000-0000-0000-0000-0000000000d1";
await db.exec(`
  insert into auth.users values ('${T}','Tait@FullyLaunched.com', now()), ('${C}','gradgig2@gmail.com', now()), ('${U}','tait2@fullylaunched.com', null);
  insert into team_members (name, email, role) values ('Tait','tait@fullylaunched.com','Admin') on conflict (email) do update set role='Admin';
  insert into projects (client_name) values ('Acme');
`);
async function as(uid, email, sql) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('role','authenticated',true)`);
    await db.query(`select set_config('request.jwt.claim.sub',$1,true)`, [uid]);
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: uid, email })]);
    const r = await db.query(sql); await db.exec("commit"); return { rows: r.rows, affected: r.affectedRows };
  } catch (e) { await db.exec("rollback"); return { error: e.message }; }
}
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) pass++; else { fail++; console.log("FAIL:", n, JSON.stringify(x)); } };
const tables = ["team_members", "project_tasks", "projects", "leads", "contacts", "contact_merges", "calls", "call_projects", "transactions"];
for (const t of tables) {
  const r = await as(C, "gradgig2@gmail.com", `select count(*)::int n from ${t}`);
  chk(`client login sees nothing in ${t}`, !r.error && r.rows[0].n === 0, r);
}
chk("team member (email in any case) still reads projects", (await as(T, "Tait@FullyLaunched.com", "select count(*)::int n from projects")).rows[0].n === 1);
chk("team member still reads team_members", (await as(T, "Tait@FullyLaunched.com", "select count(*)::int n from team_members")).rows[0].n >= 1);
const ins = await as(C, "gradgig2@gmail.com", "insert into projects (client_name) values ('Hack')");
chk("client login can't insert", !!ins.error, ins);
const upd = await as(C, "gradgig2@gmail.com", "update projects set client_name='X'");
chk("client login can't update", !upd.error && upd.affected === 0, upd);
const del = await as(C, "gradgig2@gmail.com", "delete from projects");
chk("client login can't delete", !del.error && del.affected === 0, del);
chk("team member can insert", !(await as(T, "Tait@FullyLaunched.com", "insert into projects (client_name) values ('Beta')")).error);
const unconf = await as(U, "tait2@fullylaunched.com", "select count(*)::int n from projects");
chk("unconfirmed email sees nothing", unconf.rows[0].n === 0, unconf);
const call = await as(C, "gradgig2@gmail.com", `select public.assign_call_to_project(gen_random_uuid(), gen_random_uuid())`);
chk("client login can't assign calls", /Only team members/.test(call.error || ""), call);
const call2 = await as(T, "Tait@FullyLaunched.com", `select public.assign_call_to_project(gen_random_uuid(), gen_random_uuid())`);
chk("team member gets past the team check", /Call not found/.test(call2.error || ""), call2);
await db.exec(readFileSync(CRM + "migrations/013_team_only_access.sql", "utf8"));
chk("013 is safe to re-run", true);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
