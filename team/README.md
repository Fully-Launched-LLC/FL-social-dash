# AI Content Team

Nine AI employees that take a client from research to a finished, ready-to-post
video, with Tait approving the month's ideas and every edit. Principles:
`team/PRINCIPLES.md`.

| Employee | Agent file | Job |
|---|---|---|
| Team Lead | `.claude/agents/team-lead.md` | runs the team room, decides who works next, brings Tait in at the gates |
| Account Manager | `.claude/agents/account-manager.md` | interview questions + adaptive follow-ups; ICP, brand guidelines, voice docs |
| Content Researcher | `.claude/agents/content-researcher.md` | similar accounts, outlier topics and formats, customer questions from comments and Reddit |
| Content Strategist | `.claude/agents/content-strategist.md` | topic × format pairs, a month of content |
| Content Writer | `.claude/agents/content-writer.md` | per idea: hook, script, outline, interview question |
| Content Expert | `.claude/agents/content-expert.md` | confidence score, "worth filming?", filming instructions |
| Content Editor | `.claude/agents/content-editor.md` | edits footage in Remotion (`editor/`) from the client's Style Profile |
| Content Reviewer | `.claude/agents/content-reviewer.md` | timestamped fix requests until the edit passes |
| Content Poster | `.claude/agents/content-poster.md` | captions, tags, platforms, times (prep only) |

Agent files are added one step at a time (see the roadmap); not all exist yet.

## Where things live

| Path | What | In git? |
|---|---|---|
| `.claude/agents/*.md` | each employee's definition | yes |
| `team/<employee>/` | training kit: playbook, rules, rule proposals, scorecard, examples | **no** (Tait's IP, this Mac only) |
| `team/idea-bank/` | Tait's ideas for any client | no |
| `clients/<slug>/idea-bank/` | Tait's ideas for one client | no |
| `clients/<slug>/team-room/` | board, thread, similar accounts, work in progress | no |
| `clients/<slug>/style-profile.md` | what the client's similar accounts do well | yes |
| `editor/` | the Remotion project (editing building blocks) | yes (not `node_modules/`, `out/`) |

Because this repo is public, everything Tait-only stays out of git. Back up
`team/` and the client idea banks and team rooms (e.g. to Drive's Operator
Only folder) until the repo is made private.

## Running it

From Claude Code in this folder: "Use the content-researcher to find similar
accounts for grad-gig", and so on. Rendering a test video:
`cd editor && npx remotion render MixedHeadlineTest out/test.mp4`.
