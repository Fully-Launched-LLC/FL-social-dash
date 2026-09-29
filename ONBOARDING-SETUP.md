# Turning on client onboarding

Everything is built and tested. These are the steps only you can do: they
need your logins to Supabase, Vercel, your domain, and three services.
About 30 minutes. Do them in order.

## 1. Lock down the CRM (Supabase, 2 min)

Client logins share the CRM's Supabase project. This makes the CRM
team-only so a client can't see it.

1. Supabase → **Table Editor → team_members**: check every person who uses
   the CRM is listed with the exact email they sign in with (seeded: luke@,
   tait@, elias@, matteo@, talon@fullylaunched.com). Anyone missing will see
   an empty CRM until you add them.
2. Supabase → **SQL Editor**: paste and run
   `supabase/crm/013_team_only_access.sql`.

(Same file as migration 013 in the fully-launched-crm repo. It's committed
locally there on branch `team-only-access` but couldn't be pushed: your
GitHub account doesn't have write access to that repo. Ask your cofounder
to add it, or just run it here.)

## 2. Add the onboarding tables (Supabase, 1 min)

Supabase → **SQL Editor**: paste and run
`supabase/migrations/008_client_onboarding.sql`. Safe to run more than once.

## 3. Where sign-in links may land (Supabase, 1 min)

Supabase → **Authentication → URL Configuration → Redirect URLs** → add:

- `https://social.fullylaunched.com/**`
- `https://fl-social-dash.vercel.app/**`

Leave **Site URL** alone (the CRM uses it). This is what sent Luke to
localhost.

## 4. The web address (Vercel + your domain, 5 min)

1. Vercel → the FL-social-dash project → **Settings → Domains** → add
   `social.fullylaunched.com`.
2. Where fullylaunched.com's DNS lives, add the record Vercel shows
   (usually a **CNAME**: `social` → `cname.vercel-dns.com`).

## 5. Email from Fully Launched (Resend, 10 min)

1. Sign up at resend.com → **Domains** → add `fullylaunched.com` → add the
   DNS records it shows → wait for Verified.
2. **API Keys** → create one.

## 6. Transcription and documents (5 min)

- OpenAI (platform.openai.com → API keys): used to transcribe voice memos.
- Anthropic (console.anthropic.com → API keys): Claude builds the documents.

## 7. Put the keys in Vercel (3 min)

Vercel → FL-social-dash → **Settings → Environment Variables** → add
(Production):

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key |
| `PORTAL_URL` | `https://social.fullylaunched.com` |
| `RESEND_API_KEY` | from step 5 |
| `EMAIL_FROM` | `Fully Launched <hello@fullylaunched.com>` (any address on the verified domain) |
| `OPENAI_API_KEY` | from step 6 |
| `ANTHROPIC_API_KEY` | from step 6 |

Then **Deployments → Redeploy** the latest one so the keys take effect.

## 8. Try it

1. Operator dashboard → **Clients → + New client**: a test client with an
   email you can open (not one that's already an operator or editor login),
   "Send their portal invite now" ticked.
2. Open the email → **Create my password** → walk the steps, record a short
   voice memo (a minute or two of real talking).
3. On the dashboard, Clients → **Onboarding** on that client: you'll see
   what they sent, the transcript, and the documents.

Until step 5 is done, invites still work: the dashboard shows the link to
copy and send yourself.

## Each new client

1. Clients → **+ New client**: name, portal address, contact name and email,
   who films. Tick "Send their portal invite now".
2. Tell Claude: "make <client>'s Drive folders". Claude creates
   `Fully Social OS/<Client>/` with Important Documents, Previous Content,
   Raw Footage and Finished Videos, and fills the links in on Clients → Edit,
   so the onboarding steps' folder buttons work.
