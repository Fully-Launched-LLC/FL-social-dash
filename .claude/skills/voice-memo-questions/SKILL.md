---
name: voice-memo-questions
description: Write one client's 25 to 30 voice memo questions, built so the answers give Tait everything the system needs - the client's real voice (how they talk), their ideal customer in depth (who exactly, pains, fears, dreams, practical goals, objections, the words customers use), their unique solutions, a bank of stories to tell on camera, and their offer. Saves them to the repo and in the dashboard's text format for the client's onboarding Questions page. Use as step 3 of the content system, or when Tait asks for interview or voice memo questions for a client.
---

# voice-memo-questions

The voice memo is the raw material for everything: Identity, Customer Data
and every content idea. These questions decide what's in it. One memo,
about 30 to 45 minutes of talking, has to give us five things:

1. **Their voice.** How they really talk: their words, rhythm, stories,
   humor. We get it from *how* they answer, so questions ask them to
   explain and tell, never to describe their own style in marketing terms.
2. **Their ideal customer, in depth.** Who exactly, what tips them over,
   their pains, fears, dreams, practical goals, what they've tried, what
   they wrongly believe, their objections, and their words. This fills the
   Customer Data document.
3. **Their unique solutions.** How *they* solve the customer's problems,
   step by step, and why it's different.
4. **Their stories.** Short prompts that only *name* a story. The full
   story is told on camera, when the same prompt is asked from behind the
   camera.
5. **Their offer.** What they sell, prices, results, objections, how
   people start.

## Read first

`clients/<slug>/brain.md`, `research/industry-primer.md` (its customer
problems, objections and "Questions this raises for the client"), the
website copy and any call transcript in `sources/`. Start from the standard
list (`ONBOARDING_QUESTIONS` in `dashboards/template/shell.js`, 30
questions) and make it theirs.

## How to write them

- **Make them specific to this client.** Swap general words for their
  world: "customer" becomes "homeowner" or "bride"; "the problem" becomes
  the primer's top problem ("When someone calls about a roof leak in the
  middle of winter, what do you do first?"). Use what the call or website
  already told you so you don't ask what we know; ask them to go deeper.
- **One question, one thing.** Short, plain, the way a friend would ask.
  No double questions, no jargon, no leading ("Why are you the best?").
- **Open, so they talk.** "Walk us through", "tell us about", "what do you
  say when". Those answers carry the voice.
- **Never invite a claim they can't make.** Hold every question against
  the Do / don't list in `brain.md` (Grad Gig: nothing that invites
  "background checks").
- **No em dashes.**

## The five parts (25 to 30 questions)

**1. You and your business (4 to 6), voice first.** Note at the top:
"Answer the way you'd talk to a friend. How you talk is part of what we're
listening for, so don't read anything out."
Must include: explain the business as you would at dinner; why you started
and what you did before; what you say when someone asks "so what do you
do?"; phrases you catch yourself saying; marketing that makes you cringe.

**2. Your ideal customer (10 to 12).** Note: "Picture one real customer
while you answer." Cover every one of these, in their industry's words:
- who exactly (one real person: age, job or business, life, where they are)
- which kind of customer they want more of
- the trigger: what just happened before they started looking
- the problems they arrive with, in the customer's words
- a bad day because of it (the pain they feel)
- fears and the worst case
- what they're frustrated or embarrassed about but won't say
- the dream, a year after working together
- practical goals (numbers, deadlines, results)
- what they tried that didn't work
- what they believe that isn't true
- the questions and doubts heard before buying (objections)

**3. Your way of solving it (3 to 5).** What they do better and why it
can't be copied; their process step by step; what the industry gets wrong;
what they believe that others don't. Add one or two built on the primer's
top problems.

**4. Your stories (5 to 7), each marked `[story]`.** Note at the top:
"Just name each story in a sentence or two. Don't tell it in full: we'll
ask you on camera and you'll tell the whole story then."
Prompts that people relate to: a customer you're proud of; a time something
went wrong and what you learned; the moment you knew you had to start; a
customer who almost walked away; something from life outside work that
shaped how you work; a funny or surprising moment on the job; plus one or
two from their industry ("the worst job you ever walked into").

**5. What you sell (3 to 4).** Each offer with what's included and rough
price; real results with numbers; how people usually start and the first
step they'd want a viewer to take; the objection they hear most and how
they answer it.

## Output

1. **`clients/<slug>/sources/voice-memo-questions.md`**: a header (client,
   date, built from which files), then the questions in the dashboard's
   text format, exactly:

```
## You and your business
Note: Answer the way you'd talk to a friend. How you talk is part of what we're listening for, so don't read anything out.
- What does <client> do, in plain words? Explain it the way you would to a friend at dinner.
- ...

## Your stories
Note: Just name each story in a sentence or two. Don't tell it in full: we'll ask you on camera and you'll tell the whole story then.
- [story] A customer you're proud of: what was going on when they came to you, and what changed?
```

   Under the questions, a short **Why these** list: for each part, which
   primer point or call detail shaped which question, so Tait can judge.

2. **Show Tait the questions** (just the list) and ask for changes.

3. **On his OK, put them on the dashboard:** Clients → **Onboarding** →
   *Their voice memo questions* → paste the text block → *Save their
   questions*. That's what the client sees on their Questions page, with
   story prompts marked "Story". If Tait asks Claude to do it: in his
   signed-in Chrome on the operator dashboard, run
   `sbClient.from("social_clients").update({ onboarding_questions: questionsFromText(TEXT) }).eq("id", <client id>)`
   and check the panel shows "their own list".

## After the memo comes back

Every `[story]` prompt the client named a story for goes into their story
bank (`identity-doc`), with the sentence they said, so `content-engine` can
use the same prompt as the on-camera question.
