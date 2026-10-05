---
name: industry-primer
description: Learn a new client's industry before writing their voice memo questions or any content. Reads the client's website and researches the industry on the web (what's sold, typical prices, who buys, how they decide, common problems, objections, competitors, industry words, what's changing), and writes research/industry-primer.md. Use as step 2 of the content system, or when Tait asks Claude to "learn the <industry> industry" for a client.
---

# industry-primer

So Claude knows the industry as well as a smart new hire before it asks the
client a single question. The primer makes the voice memo questions sharp
("when a homeowner calls about a leak, what do you do that other roofers
don't?") and gives the research step its search terms.

**It is research, not the client's story.** It says how the industry works
in general and cites where each point came from. It never puts words in the
client's mouth or claims a fact about the client that isn't on their own
website. Content substance still comes only from the client's voice memo
(CLAUDE.md principle 1).

## Inputs

`clients/<slug>/brain.md` (name, website, industry), the saved website copy
in `sources/`, and any call transcript.

## Steps

1. **Their website.** If it isn't saved yet, read it with `WebFetch` (home,
   about, services or products, pricing, FAQ, reviews) and save their words
   to `sources/YYYY-MM-DD-website-copy.md` with the URLs.
2. **The industry.** `WebSearch` and `WebFetch` on trade sites, industry
   associations, review sites, forums and competitors' sites. Aim for
   breadth over depth: 20 to 40 minutes of reading, not a report.
3. **Write `research/industry-primer.md`** in the shape below. Every point
   ends with its source in brackets: `[their site]`, `[call]`, or a short
   name plus link (`[Angi cost guide](https://...)`). A point with no
   source doesn't go in. Plain words, no em dashes.
4. **Hand off:** the top customer problems and questions feed
   `voice-memo-questions`; the competitor names and search words feed
   `research-doc`.

## Shape of the file

```
# <Client>: Industry primer

**Last updated:** YYYY-MM-DD
**What this is:** how the <industry> industry works, from the client's website and public sources. Research only: it says what's typical, not what the client does. Their own story comes from their voice memo.

## The business, from their own site
- What they sell, who for, where, prices if listed. Quoted where possible. [their site]

## How the industry works
- What's sold, typical prices or price ranges, how jobs or sales happen, seasons, how long things take.

## The customer
- Who buys, what sets off the search, how they choose, who else is involved in the decision.

## Common problems and questions customers have
- In customers' own words where a review or forum shows them (quoted, with link).

## Common objections and fears
## What the industry gets wrong (the complaints people repeat)
## Competitors
- Name, link, what they're known for, their social accounts if easy to find.

## Words the industry uses
- Term: plain-words meaning.

## What's changing
- New tech, rules, prices, trends, each with a source.

## Search words for research
- Hashtags, keywords and subreddits to use in `research-doc`.

## Questions this raises for the client
- Things only the client can answer. These go into their voice memo questions.
```

Keep it to what a person could read in ten minutes. Mirror it as the first
section of the client's Research Google Doc (`research-doc` does that).
