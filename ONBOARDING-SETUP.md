# Turning on client onboarding

Everything is built and tested. These are the steps only you can do: they
need your logins to Supabase, Vercel, your domain, Resend and Anthropic.
About 25 minutes. Do them in order.

**How voice memos work for now:** clients record their answers on their
phone and text the recording to you. You get the transcript yourself, then
paste it on the operator dashboard (Clients → **Onboarding** → paste →
**Save and build documents**), and Claude builds their Customer Data and
Your Voice documents. There's no automatic transcription, so no OpenAI key
is needed.

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
`supabase/migrations/008_client_onboarding.sql`, then
`supabase/migrations/009_voice_memo_by_text.sql`. Both are safe to run more
than once. (Already ran an earlier 008? Just run 009: it switches the
voice memo step from uploading to texting.)

## 3. Where sign-in links may land (Supabase, 1 min)

Supabase → **Authentication → URL Configuration → Redirect URLs** → add:

- `https://social.fullylaunched.com/**`
- `https://fl-social-dash.vercel.app/**`

Leave **Site URL** alone (the CRM uses it). This is what sent Luke to
localhost.

## 4. The web address ✅ done

`social.fullylaunched.com` already serves the dashboard.

## 5. Email from Fully Launched (Resend, 10 min)

1. Sign up at resend.com → **Domains** → add `fullylaunched.com` → add the
   DNS records it shows → wait for Verified.
2. **API Keys** → create one.

## 6. Documents (3 min)

Anthropic (console.anthropic.com → API keys): Claude builds the documents
from the transcript you paste.

## 7. Put the keys in Vercel (3 min)

Vercel → FL-social-dash → **Settings → Environment Variables** → add
(Production):

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key |
| `PORTAL_URL` | `https://social.fullylaunched.com` |
| `RESEND_API_KEY` | from step 5 |
| `EMAIL_FROM` | `Fully Launched <hello@fullylaunched.com>` (any address on the verified domain) |
| `ANTHROPIC_API_KEY` | from step 6 |

Then **Deployments → Redeploy** the latest one so the keys take effect.

## 8. Try it

1. Operator dashboard → **Clients → + New client**: a test client with an
   email you can open (not one that's already an operator or editor login),
   "Send their portal invite now" ticked.
2. Open the email → **Create my password** → walk the steps. At the voice
   memo step, record a minute or two on your phone and tap "I've texted it".
3. Get the transcript (your phone's transcription, or any app), then on the
   dashboard: Clients → **Onboarding** on that client → paste it →
   **Save and build documents**. The documents show up there, in their
   onboarding, and on their portal's Documents page.

Until step 5 is done, invites still work: the dashboard shows the link to
copy and send yourself.

## Your number on the voice memo step

The voice memo step tells clients to text their recording to "Tait". To show
your number (tap-to-text on phones), send it to Claude, or set
`TEXT_MEMO_TO` near the top of the script in
`dashboards/template/welcome.template.html`, then rebuild and deploy.

## Each new client

1. Clients → **+ New client**: name, portal address, contact name and email,
   who films. Tick "Send their portal invite now".
2. When their voice memo comes in: get the transcript, then Clients →
   **Onboarding** → paste → **Save and build documents**.
3. Tell Claude: "make <client>'s Drive folders". Claude creates
   `Fully Social OS/<Client>/` with Important Documents, Previous Content,
   Raw Footage and Finished Videos, and fills the links in on Clients → Edit,
   so the onboarding steps' folder buttons work.
