---
name: content-system
description: Tait's whole AI social media system, start to finish, from one command. "New client: <name>, <website>, <industry>, <call transcript>" sets the client up, learns the industry and writes their voice memo questions. "Build content for <client>" (after their voice memo transcript is in) runs research, builds the three documents (Identity, Customer Data, Research) and turns them into content ideas with hook, outline, script and a question to ask, ready for the calendar. Also "add viral scripts" and "status of <client>". Use whenever Tait starts a new client, sends a voice memo transcript, asks for content for a client, or asks where a client is in the process.
---

# content-system

The one place the whole system runs from. Tait types one of the commands
below; this skill runs every step in order, using the other skills, and
stops only at the two places a human has to decide (his review of the
documents, and his pick of ideas for the calendar).

The rules of CLAUDE.md hold the whole way: substance only from the client's
own words, research decides packaging only, never invent a fact, no em
dashes, Tait approves before anything reaches the client.

## The commands

| Tait types | What runs |
|---|---|
| **New client:** name, website, industry, call transcript (optional), contact name and email | Part A: steps 1 to 4 |
| **Build content for <client>** (with the voice memo transcript pasted, or "it's in the dashboard") | Part B: steps 5 to 10 |
| **More content for <client>** | Steps 6 (refresh research if older than 30 days), 9 and 10 |
| **Add viral scripts** | the `viral-script-library` skill |
| **Status of <client>** | the checklist below, filled in from the files |

If Tait's message fits one of these loosely ("new client Grad Gig, here's
the site"), run it. Ask only for what's missing and needed (a website or
industry for a new client; which client).

## Part A: a new client

**1. Intake.** Make `clients/<slug>/` with `brain.md` (the facts Tait gave:
name, website, industry, contact; everything else `[pending]`). Save a call
transcript verbatim as `sources/YYYY-MM-DD-<who>-call.md`. Save the
website's own words (the `WebFetch` tool, home, about and services pages) as
`sources/YYYY-MM-DD-website-copy.md`, quoted, with the URLs.
Then the dashboard and Drive, from `client-onboarding` ("Before the order:
the client's Drive folders"): the Drive folders, then Tait adds the client
on the operator dashboard (Clients → + New client) with the folder links.
Creating the client sends the invite if "Send their portal invite now" is
on: tell Tait to turn it **off** until step 4 is done, so the client sees
their own questions.

**2. Industry primer** → skill `industry-primer`. What Claude needs to
know about the industry before asking a single question.

**3. Voice memo questions** → skill `voice-memo-questions`. 25 to 30
questions in five parts: their voice, their ideal customer in depth, their
unique solutions, their stories, their offer.

**4. Put the questions on their onboarding page and invite them.** Show
Tait the questions. When he's happy, they go on the operator dashboard:
Clients → **Onboarding** → *Their voice memo questions* → paste → *Save
their questions* (or Claude does it in Tait's signed-in Chrome, if he asks).
Then **Invite to portal**. The client records the voice memo on that page.

Tell Tait what happens next: the client's voice memo arrives on the
Onboarding panel; he transcribes it by hand and pastes the transcript in
the transcript box there (or into chat), then says **Build content for
<client>**.

## Part B: build content (after the voice memo)

**5. Save the transcript.** Verbatim, as
`sources/YYYY-MM-DD-<who>-voice-memo.md` (from chat, or read from the
Onboarding panel's transcript in Tait's signed-in Chrome:
`social_client_onboarding.transcript`). Never tidy it. Ask who is speaking
if it's unclear.

**6. Research** → skill `research-doc`. Apify (Instagram, TikTok, Facebook,
YouTube across industries, Reddit questions), format breakdowns, the 10
best-fitting frameworks from the viral script library. Can run while 7 and
8 are being built.

**7. Customer Data** → skill `customer-data-doc` (unchanged: its format is
Tait's and stays exactly as it is). Its hooks at the top are built from the
pains, dreams, fears and practical goals.

**8. Identity** → skill `identity-doc`. Who they are, what they sell, the
3-3-3, the voice profile, the story bank.

**9. Tait's review (the human gate).** Give him the three Google Doc links
and the short list of everything marked **[pending]**, **[To confirm]** or
**Needs from you**. Wait for his OK or his fixes. Nothing becomes content
before this.

**10. Content ideas** → skill `content-engine`. Ideas with hook, outline,
script (length set by the format) and the question to ask, each built from
the client's own story or solution, a customer pain or dream, and a proven
framework. Tait picks; the picks go on the calendar (dates by the client's
cadence, see `content-engine`) through "Add ideas with Claude".

**After filming and posting:** the feedback loop (Apify reading the
client's own post views every 30 days) isn't built yet; Tait decided to set
it up later.

## Status of a client

Check the files and report in this order, one line each, ✓ or what's next:

1. `brain.md` · 2. `research/industry-primer.md` · 3.
`sources/voice-memo-questions.md` and on the dashboard · 4. invited ·
5. a `*-voice-memo.md` in `sources/` · 6. `research/content-research.md`
updated this month · 7. `sources/customer-data.md` · 8.
`sources/identity.md` · 9. Tait's OK (in `brain.md`, "Documents approved
<date>") · 10. `concepts/content-ideas.md`, and how many are on the
calendar.

## Where everything lives

| What | Repo (public on GitHub) | Google Doc (on the client's portal) |
|---|---|---|
| Industry primer | `research/industry-primer.md` | part of Research |
| Voice memo questions | `sources/voice-memo-questions.md` | the onboarding Questions page |
| Customer Data | `sources/customer-data.md` | `<Client>: Customer Data` |
| Identity | `sources/identity.md` (built from `offer.md`, `positioning.md`, `voice.md`, `story-bank.md`) | `<Client>: Identity` |
| Research | `research/content-research.md` | `<Client>: Content Research` |
| Content ideas | `concepts/content-ideas.md` | `<Client>: Content Ideas` |
| Outlier lists (Tait only) | `research/private/` (gitignored) | private, Drive → Operator Only |
| Viral script library (Tait only) | `library/` (gitignored cache) | private, Drive → Operator Only → Viral Script Library |

The repo is **public**: never commit anything Tait wants private (outlier
lists, the viral script library, anything a client asked to keep private).

## Finish every run

- `grep -c '—'` is 0 on every file you wrote.
- Commit on a branch (never `main`); push and open a PR only when Tait asks.
- Report in plain words: what was made (with links), what's pending and
  who it's waiting on, and the one thing Tait does next.
