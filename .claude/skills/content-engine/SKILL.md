---
name: content-engine
description: Turn a client's three documents (Identity, Customer Data, Research) and Tait's viral script library into content ideas - each one the client's own story or solution, hooked on a real customer pain, dream, fear or goal, and packaged in a proven framework - written as Hook, Outline, Script (length set by the format) and a Question to ask from behind the camera. Checks every idea, saves them to the Content Ideas doc, and puts Tait's picks on the calendar. Use as step 10 of the content system, or when Tait asks for content ideas, scripts or a month of content for a client. Builds on tasteful-content.
---

# content-engine

Tait's version of `tasteful-content`: everything in its section 1 (the
inviolable rules: the artifact is the source, the founder's voice wins, no
em dashes, no "It's not X, it's Y", no AI words, no fabricated proof) and
its taste pass apply here word for word. Read `tasteful-content` first.
This skill adds frameworks, scripts, story ideas and the calendar.

## The recipe: every idea has three ingredients

| Ingredient | Where it comes from | Rule |
|---|---|---|
| **Substance**: what they say | Identity (`offer.md`, `story-bank.md`, `voice.md`, `positioning.md`) and the transcripts | the client's own story, solution, opinion or result, with a **Seed** quote |
| **Hook**: why the viewer cares | Customer Data (the hooks at the top; pains, dreams, fears, practical goals) and Research (what customers are asking) | the customer's own words where possible |
| **Packaging**: how it's built | Research ("The 10 frameworks for <client>", formats that work) and `library/viral-scripts/frameworks.md` | one named hook formula + one framework |

If any ingredient is missing for an idea, it isn't an idea yet: either
leave it out or keep it with **Needs from you**.

## Read first

`brain.md` (Do / don't, cadence, categories), `sources/identity.md` (and
its parts), `sources/customer-data.md`, `research/content-research.md`,
`library/viral-scripts/frameworks.md` plus the analyses of the scripts it
names (`library/viral-scripts/scripts/`), `concepts/content-ideas.md` (no
repeats), `templates/vid-method.md` and `templates/story-over-value.md`.
If the library is missing on this Mac, rebuild it first
(`viral-script-library`). If Identity or Customer Data is missing, stop
and run those skills.

## The mix

Aim for a spread Tait can film in category batches:

- every category or pillar the client has, evenly;
- **story ideas** for every usable story-bank entry (the story is told on
  camera; see Script below);
- **solution ideas** from their unique solutions and process;
- **question ideas** from Research's "What customers are asking";
- **objection ideas** from `offer.md`;
- **opinion ideas** from their perspectives and "what the industry gets
  wrong";
- for clients who document their build, **behind the scenes** ideas.

## Script length is set by the format

| Format | Spoken length | Script |
|---|---|---|
| Myth or hot take | 20 to 35 s | 50 to 90 words |
| Behind the scenes, voiceover over footage | 20 to 40 s | 50 to 100 words |
| Talking head tip or answer | 30 to 45 s | 80 to 120 words |
| How-to or list | 30 to 60 s | 80 to 150 words |
| Story | 45 to 75 s | 120 to 190 words around the story (the story itself is told live) |
| Interview answer (we film, asked from behind the camera) | 45 to 90 s | the ideal answer in their words, 100 to 200 words; they can talk it instead |
| YouTube long form | 8 to 12 min | 1,200 to 1,800 words in sections: cold open, promise, 3 to 5 sections, recap, CTA |

## Writing an idea

1. Pick the substance (a seed from their words), then the customer hook,
   then the framework whose beats fit the substance.
2. **Hook:** the first line on camera, built on the hook formula, in the
   client's voice, using the customer's words. One sentence, two at most.
3. **Outline:** 3 to 6 bullets, the framework's beats in order, each one
   saying what the person covers. For someone who'd rather talk from
   points.
4. **Script:** the framework's beats, written in the client's voice: their
   phrases from `voice.md`, their rhythm, their real numbers and names.
   Connecting words are yours; every claim, number and story is theirs.
   Never a line from a library script (the checker catches 6 words in a
   row). On a **story idea**, write the setup and the lesson, and put the
   story itself as one line: `[S2: tell the story of <short title> in full,
   the way you would to a friend]`. We don't have the full story yet, so
   it's never written for them.
5. **Ask on camera:** one open question that gets exactly this video out
   of them. On a story idea it's the story bank's prompt. For people who'd
   rather answer than read.
6. **CTA:** one ask, from `offer.md`'s "How people start".

Entry format in `concepts/content-ideas.md` (the tasteful-content format,
plus Framework, Outline and Script):

```
**<ID>. <working title>**
- **Hook:** "<first line>"
- **Category · Format · Perspective:** <category or pillar> · <format> · <perspective>
- **Framework:** <H id> <name> + <F id> <name>
- **Seed:** "<the exact line from their material this comes from>"
- **The idea:** <one line>
- **Outline:**
  - <beat 1>
  - <beat 2>
- **Script (<format>, about <n> seconds):**
  <the script, one paragraph per beat>
- **Ask on camera:** "<question>"
- **CTA:** <one ask>
- **Source:** <file, who said it>; hook from <Customer Data / Research line>
- **Needs from you:** <only if a fact, number or permission is missing>
```

## The gates (every idea, before Tait sees it)

1. **Traceable:** every claim, number and story is in their material; the
   Seed is word for word.
2. **Structured:** it names a hook formula and a framework, and the script
   follows its beats.
3. **Theirs:** it couldn't belong to another business in another industry.
   If it could, rewrite it with their specifics or drop it.
4. **Clean:** the tasteful-content taste pass; no em dashes, no "It's not
   X, it's Y", no AI words; it sounds like them reading it out loud.

Then run the checker and fix everything it lists:

```
python3 .claude/skills/content-engine/scripts/check_ideas.py clients/<slug> --ids <new ids>
```

## Hand to Tait, then the calendar

1. Add the new ideas to `concepts/content-ideas.md` (under their category,
   next free IDs) and mirror them into the Content Ideas Google Doc
   (`tasteful-content`'s mirroring steps: `gdoc_sync.py`, then format only
   the new lines).
2. **Gate 1 is Tait's:** he picks which go on the calendar. Nothing reaches
   the dashboard before he does.
3. **Dates:** the client's cadence from `brain.md` (Fully Launched: 5
   category videos Monday to Friday, 4 documentation videos Tuesday,
   Thursday, Saturday and Sunday, 1 YouTube video a month). Spread
   categories evenly, every week at least one of each where there are
   enough; ready ideas (no Needs from you) first. Film by = post date minus
   14 days, edit by = post date minus 7. Never move a video that's already
   past `concept_pending` without asking.
4. **Titles:** `<Category> · <ID> · <title>` for clients with categories
   (the dashboard groups To film by it), else `<ID> · <title>`.
5. **On the dashboard:** the JSON for "Add ideas with Claude" (keys in
   `BULK_PROMPT`, `dashboards/operator/dashboard.template.html`): `title`,
   `platform`, `hook`, `body` (the script), `outline` (the bullets, one
   string), `filmingDirection` ("<format>, vertical (or horizontal for
   YouTube). Question to ask from behind the camera: \"<question>\""),
   `editorInstructions` ("<format> · <framework name> · CTA: <cta>" plus any
   on-screen text), `filmedBy`, `dueToFilm`, `dueToEdit`, `postDate`. Tait
   pastes it (operator dashboard → Add ideas with Claude), or Claude adds
   it in his signed-in Chrome if he asks. Either way it lands in the
   client's portal at once.

## Done means

- [ ] Every new idea has all three ingredients, passes the four gates and
  the checker
- [ ] Script length matches its format; story ideas leave the story to the
  camera
- [ ] `content-ideas.md` and the Google Doc match
- [ ] Tait picked before anything went on the calendar
