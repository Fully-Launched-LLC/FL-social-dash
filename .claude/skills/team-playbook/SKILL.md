---
name: team-playbook
description: Claude does the AI content team's jobs itself, using everything Tait trained the agents on (Paperclip is off since 2026-11-05). Maps each kind of request (interview questions, documents, research, ideas, scripts, a month of cards, rewrites, edits, captions) to the role whose training applies and the files to read first, and keeps the training growing from Tait's feedback. Use whenever Tait asks for content work for any client, or says "do what the <agent> did".
---

# team-playbook

Tait, 2026-11-05: "I don't actually need Paperclip to work autonomously. I
just want you to take all the information that I trained the agents on so
that I can tell you to do things, and you do them when they're ready."

So Claude is the whole team. Nothing runs on its own: Tait asks, Claude
does the job the way the trained role would, and stops at Tait's gates.
The bridge runs with `PAPERCLIP=off` (it still moves footage, transcribes
voice memos and sends notifications).

## Always, before any job

1. `team/PRINCIPLES.md` (Tait is the only rule maker; substance only from
   the client's own words; never invent; Tait's gates).
2. The client's `clients/<slug>/brain.md` and everything in `sources/`.
3. The role files below: `team/<role>/rules.md`, `playbook.md`,
   `scorecard.md` (if there is one), and `.claude/agents/<role>.md`.
   `team/` is private (gitignored): read it, never copy it into public files.

## Which role for which job

| Tait asks for | Act as | Then run |
|---|---|---|
| interview / voice memo questions | Account Manager | `voice-memo-questions` |
| Customer Data (ICP) | Account Manager | `customer-data-doc` (verify_quotes must pass) |
| Identity (offer, 3-3-3, voice, stories) | Account Manager | `identity-doc` |
| Research, outliers, formats | Content Researcher | `research-doc` (Apify; say the cost first) |
| content ideas, a monthly plan | Content Strategist, then Content Expert scores | `content-engine` |
| scripts, hooks, a month of cards | Content Writer, then Content Expert | `content-engine` + `content-system` step 10b |
| a card a client sent back | Content Writer (fix exactly what they asked) | `bridge.py card get/put` |
| short summaries for Tait | Content Simplifier | |
| editing, motion, sound, colour | Content Editor, Motion Designer, Sound Designer, Color Grader, Art Director | their playbooks + `editor/` |
| reviewing an edit | Content Reviewer | `team/content-reviewer/checklist.md` |
| captions, cover, posting prep | Content Poster | |

Every script also follows `team/viral-structure.md` (teaching) or Tait's
5-part story (`team/storytelling-methods.md`), `library/retention/tension-loops.md`
(read all of it), `team/kallaway-style-guide.md` and `team/content-rules-2026.md`.
Run the skill's own checker before showing Tait anything.

## Tait's gates (unchanged)

Documents go on his desk (`bridge.py doc put ... --status on_desk`); cards
go to Scripts to review (`bridge.py cards add`); nothing reaches a client
without his OK.

## Keep learning (principle 14)

When Tait gives feedback or a new rule, write it into every role it applies
to (`team/<role>/rules.md`, his words as the why) and add a line to
`team/TRAINING-LOG.md`. That's how the training keeps growing without
the agents.
