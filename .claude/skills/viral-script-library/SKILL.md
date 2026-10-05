---
name: viral-script-library
description: Tait's private library of viral scripts from social media. Takes scripts he collects (files dropped in the Drive inbox folder, text pasted in chat, or video links), analyses each one (hook type, beat-by-beat framework, retention devices, CTA, format, length, why it works), keeps a growing playbook of hook formulas and script frameworks, and exports it all as one file Claude reads (or Tait uploads to a claude.ai Project). content-engine uses it to write new scripts in a client's voice on proven structures. Use when Tait says "add viral scripts", "I dropped scripts in the library", pastes a script or link to save, or asks what frameworks are working.
---

# viral-script-library

One big collection of viral scripts, so every new script for a client is
built on a structure that has already worked: the client's story and
words, a proven framework.

**Private to Tait.** The library lives in Drive → Fully Social OS →
**Operator Only (do not share)** → **Viral Script Library**, and in
`library/viral-scripts/` on this Mac, which is gitignored because the repo
is public on GitHub. Never commit it, never put it on a client's portal.

**Structure, never the words.** These are other creators' scripts. They're
kept for analysis. No line from them goes into a client's content; the
hook formula and the beat structure are what get reused. In the analysis,
quote at most the first line (under 15 words).

## Where things are

| Place | ID / path |
|---|---|
| Drive folder: Viral Script Library | `1DITFB-9Ma_WxS4gXfU2PIKE0H4DYi1ZT` |
| Inbox: "1. Drop new scripts here" | `1vKyYJG3fwWV3Ym6P2i0ptA_jEJnE1yOq` |
| Done: "2. Added to the library" | `1IBVGcaABwinoOj_303c1VrroGqVLFk0V` |
| Google Doc: "Viral Script Library: frameworks and scripts" | `1fqUKDwlfyiYpGjVjzIL64YEKoC_Tpo2FMhAJ_S0qMPw` |
| Local copy | `library/viral-scripts/`: `scripts/VS-<n>.md`, `frameworks.md`, `index.md`, `LIBRARY.md` |

If `library/viral-scripts/` is missing (a new computer), rebuild it from
the Google Doc and the files in "2. Added to the library" before adding
anything.

## Adding scripts

Tait adds scripts any of three ways:

1. **Drops files in the inbox folder** (Google Docs, text, Word, PDF, a
   screenshot of a caption). List the folder with Drive `search_files`
   (`parentId = '<inbox id>'`) and read each with `read_file_content`.
2. **Pastes the script in chat**, ideally with the link, creator, views
   and niche.
3. **Sends a link.** Use Apify (the `apify` connector) to get the post's
   caption, views and creator, and its transcript if an actor for that
   platform offers one (read the actor's input schema first). No
   transcript available: save what there is and ask Tait for the words.

For each script:

1. **Skip duplicates** (same link or same first line as one in
   `index.md`).
2. **Save it** as `library/viral-scripts/scripts/VS-<next n>.md`:

```
# VS-<n>. <short title: what it's about>

- **Creator:** @handle
- **Platform:** TikTok / Instagram / YouTube / Facebook / LinkedIn
- **Link:** <url>
- **Views:** 2.4M (as given, or "n/a"; never guessed)
- **Niche:** <their niche>
- **Format:** talking head / green screen / voiceover over b-roll / skit / POV / list on screen / interview / tutorial / story time
- **Words:** <count> (about <n> seconds spoken)
- **Hook type:** <a hook formula from frameworks.md, e.g. H3 Credibility + promise>
- **Framework:** <a structure from frameworks.md, e.g. F2 Story with a lesson>
- **Added:** YYYY-MM-DD, from <inbox file name / chat / link>

## Hook
"<first line, under 15 words>" · why it stops the scroll, in one line

## The framework, beat by beat
1. **<Beat name>** (0 to 3s): what happens, as a reusable slot: "<I'm [age] and I [result]>"
2. ...

## What keeps people watching
- open loops, stakes, numbers, pattern breaks, payoffs: where each one is

## Call to action
- what it asks, and how soft or direct

## Why it works (our read)
- one to three lines

## Works for
- what kind of client or story could carry this structure

## Full script
<the text exactly as given>
```

3. **Update `frameworks.md`.** If the hook type or structure is new, add
   it with the next ID; if it's known, add this script's ID to its
   examples and raise its count. Keep it as the playbook:

```
# Frameworks and hook formulas

## Hook formulas
### H<n>. <Name> (seen in <count>: VS-1, VS-7)
- **Shape:** "<slot template>"
- **Why it works:** <the psychology, one line>
- **Use when:** <the kind of story or claim it needs; what proof the client must have>

## Script frameworks
### F<n>. <Name> (seen in <count>)
- **Beats:** 1. ... 2. ... 3. ...
- **Length:** usual word count and seconds
- **Best formats:** ...
- **Use when:** ...

## Patterns across the library
- what repeats (written only from what the scripts show, with IDs)

## Quality gates (every new script must pass)
1. Traceable: every claim, story and number comes from the client's own words.
2. Structured: it follows a named hook formula and framework from this file.
3. Theirs: it couldn't belong to another business in another industry. If it could, rewrite it.
4. Clean: no em dashes, no "It's not X, it's Y", none of the AI words in tasteful-content section 1.
```

4. **Move the file** from the inbox to "2. Added to the library" (Drive
   `update_file` with the new `parentId`). Never delete or trash anything.
5. Run `python3 .claude/skills/viral-script-library/scripts/build_library.py`
   to rebuild `index.md` and `LIBRARY.md`.
6. **Mirror to the Google Doc** (`google-workspace` skill rules): the doc
   holds `frameworks.md`, then `index.md`'s list as one line per script,
   then each script's analysis (everything except **Full script**). Build
   a temporary markdown file in that order and use `gdoc_build.py` /
   `gdoc_sync.py` from `.claude/skills/customer-data-doc/scripts/`.
   Before the first write, check `get_file_permissions` shows only Tait.
7. Tell Tait: how many were added, any skipped (and why), new frameworks
   found, and the library's total.

## Using the library

`content-engine` reads `frameworks.md` and the matching scripts' analyses
when it writes scripts; `research-doc` picks the 10 frameworks that fit a
client best. For a chat-style "Claude project", Tait can upload
`library/viral-scripts/LIBRARY.md` to a project on claude.ai and talk to
it there; rebuild and re-upload it after adding scripts.
