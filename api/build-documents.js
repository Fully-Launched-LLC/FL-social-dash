// POST /api/build-documents { clientId, transcript? }  (operators only)
//
// Clients text their voice memo to Tait; he gets the transcript himself
// and pastes it on the operator dashboard (Clients → Onboarding). This
// saves it (if given, else uses the one already saved) and has Claude build
// their two documents from it, following the same rules as the
// customer-data-doc and tasteful-content skills:
//   Customer Data  — verbatim pains, dreams and 5 hook phrases
//   Your Voice     — candidate 3-3-3 (marked To confirm) and voice profile
// Nothing is invented: every quote must be in the transcript. After Claude
// writes them, every quote is checked against the transcript word for word,
// and any that isn't found is flagged in the document.
//
// Needs ANTHROPIC_API_KEY. No transcription service is used.
// Saves the documents and sets docs_status to 'ready' (or 'failed' with the
// reason, shown to the operator).

const { env, need, rest, callerFrom, handler } = require("./_lib");

const RULES = `Rules that cannot be broken:
- Never invent anything: no quote, fact, number, story or claim that isn't in the transcript.
- Quotes are copied word for word from the transcript. The only edit allowed inside a quote is [square brackets] to fix an obvious transcription error or add a missing word. Use "..." for words cut from the middle.
- The founder is describing their customer. Label it that way. Never present it as the customer's own words.
- If the transcript doesn't cover something, write "[pending: needs <what>]" instead of filling it in.
- No em dashes anywhere. Use commas, periods or parentheses.
- Never use: delve, unlock, leverage, harness, seamless, robust, elevate, streamline, tapestry, realm, foster, supercharge, game-changing, resonate, pivotal, crucial, testament.
- Never write "It's not X, it's Y".
- Plain, warm, specific language. Output Markdown only, no preamble.`;

function customerDataPrompt(name, transcript, extra) {
  return `You are my voice-of-customer analyst. I am pasting in transcripts from real calls with my customers. Pull their exact language, not your summary of it. Give me two lists. Pains, verbatim: the exact words they used for what is hard, stuck, or draining. Quote them. Dreams, verbatim: the exact words they used for what they want. Quote them.
For each quote, add a one-line note on where it came from.
Then give me the 5 phrases I should use in my hooks and headlines, because they are already how my buyer talks.
Never invent a quote. Only use what is in the transcripts. No em dashes.

Context: the transcript below is a voice memo from the founder of ${name} (transcribed by hand or by an app, so expect spelling slips), describing their business and their customers. It is not a call with a customer.

${RULES}

Write it in exactly this shape:
# ${name}: Customer Data
**Built from:** the founder's onboarding voice memo.
## How to read this
(3 to 5 bullets: quotes are word for word from the recording; what square brackets and "..." mean; who the customer is, in the founder's words; that this is the founder describing the customer, not the customer.)
## 1. Pains, verbatim
(Group under short plain-English theme headings (###). If the business has two kinds of customer, split by customer first. Number the quotes straight through. Each quote on its own numbered line in double quotes, then an italic note line: *Founder, <about what>.*)
## 2. Dreams, verbatim
(Same shape.)
## 3. The 5 phrases to use in hooks and headlines
(Numbered. Each: the phrase in bold quotes, then "*Why:*" one line, then "*As a hook:*" one line that uses the phrase. If there aren't 5 hook-worthy phrases, list fewer and say so.)
${extra}
Transcript:
"""
${transcript}
"""`;
}

function yourVoicePrompt(name, transcript, extra) {
  return `You build a founder's "Your Voice" document from their own words: the 3-3-3 (3 content pillars, 3 video formats, 3 unique perspectives) and their voice profile. You organize and extract. You never create.

Context: the transcript below is the onboarding voice memo from the founder of ${name}.

${RULES}
- The 3-3-3 is decided later by the agency owner, so every pillar, format and perspective you propose is a candidate: mark each **[To confirm]** and put the exact quote it came from under it.

Write it in exactly this shape:
# ${name}: Your Voice
**The 3-3-3 framework and voice profile.** **Built from:** the founder's onboarding voice memo. **[To confirm]** means the agency hasn't decided it yet.
## What this document is
(One short paragraph: every video traces back to one pillar, one format and one perspective. This document shows the candidates from the founder's own words, and how the founder sounds, so every script sounds like them.)
## Who the content is for
(The founder's words about their best customer, quoted.)
## Pillars (3) [To confirm]
(### for each: What it is, What we do, Who it's for, Our angle. Each line quotes the founder.)
## Formats (3) [To confirm]
(Only formats the founder mentioned or clearly uses: stories, how-to's, behind the scenes, answering questions. If they didn't say, write [pending: needs the founder's pick].)
## Unique perspectives (3) [To confirm]
(Non-obvious things the founder believes that others in their space don't. Each with its quote.)
## Voice profile
### How they sound
(3 to 5 bullets about their rhythm and style, each with a short real example line quoted from the transcript.)
### Words and phrases that are theirs
(8 to 10 phrases they actually said, quoted word for word, ideally ones they repeat.)
### Words they never use
(Only what they said they dislike. Otherwise: [pending: needs the founder's list]. Always add: no em dashes, and none of the machine words.)
${extra}
Transcript:
"""
${transcript}
"""`;
}

async function claude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env("ANTHROPIC_MODEL") || "claude-sonnet-5", max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Claude: " + ((data.error && data.error.message) || res.status));
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
}

// Every "quote" of 12+ characters must appear in the transcript word for
// word (ignoring case, punctuation, [bracketed] fixes and "..." cuts).
// Quotes that don't are flagged right in the document.
const norm = s => s.toLowerCase().replace(/\[[^\]]*\]/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
function flagUnverifiedQuotes(md, transcript) {
  const t = norm(transcript);
  let flagged = 0;
  const out = md.replace(/"([^"\n]{12,})"/g, (whole, q) => {
    const parts = q.split(/\.\.\.|…/).map(norm).filter(p => p.length >= 4);
    if (!parts.length || parts.every(p => t.includes(p))) return whole;
    flagged++;
    return whole + " *(check: not word for word in the recording)*";
  });
  return { md: out.replace(/—/g, ","), flagged };
}

function extraContext(ob) {
  const lines = [];
  const b = ob.brand || {};
  if (b.fonts || (b.colors || []).length || b.aesthetic) lines.push(`Brand (from their onboarding form, not the recording, so don't quote it as speech): fonts ${b.fonts || "not given"}; colors ${(b.colors || []).join(", ") || "not given"}; look and feel ${b.aesthetic || "not given"}.`);
  const a = ob.answers || {};
  const notes = Object.entries(a).filter(([, v]) => v);
  if (notes.length) lines.push("Written notes from their onboarding form (you may use these, labelled as 'written note', never as recording quotes):\n" + notes.map(([k, v]) => `- ${k}: ${v}`).join("\n"));
  return lines.length ? "\n" + lines.join("\n\n") + "\n" : "";
}

async function saveDoc(clientId, kind, title, body_md) {
  await rest("social_client_generated_docs?on_conflict=client_id,kind", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { client_id: clientId, kind, title, body_md, updated_at: new Date().toISOString() },
  });
}

const run = async (req, { clientId, transcript: pasted }) => {
  need("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
  const caller = await callerFrom(req);
  if (!caller.isOperator) { const e = new Error("Only the Fully Launched team can build documents."); e.status = 403; throw e; }
  const [client] = await rest("social_clients?select=id,name&id=eq." + encodeURIComponent(clientId || ""));
  if (!client) { const e = new Error("Client not found."); e.status = 404; throw e; }
  const [existing] = await rest("social_client_onboarding?select=*&client_id=eq." + client.id);
  const ob = existing || {};
  const transcript = String(pasted != null ? pasted : ob.transcript || "").trim();
  if (transcript.length < 200) { const e = new Error(transcript ? "That transcript is too short to build documents from (" + transcript.length + " characters). Paste the whole thing." : "Paste the transcript first."); e.status = 400; throw e; }
  // Save the transcript (creating their onboarding row if there isn't one).
  const now = () => new Date().toISOString();
  await rest("social_client_onboarding?on_conflict=client_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { client_id: client.id, transcript, docs_status: "processing", docs_error: null, updated_at: now() },
  });
  const mark = body => rest("social_client_onboarding?client_id=eq." + client.id, { method: "PATCH", prefer: "return=minimal", body: { ...body, updated_at: now() } });

  try {
    need("ANTHROPIC_API_KEY");
    const extra = extraContext(ob);
    const [cd, yv] = await Promise.all([claude(customerDataPrompt(client.name, transcript, extra)), claude(yourVoicePrompt(client.name, transcript, extra))]);
    const cdChecked = flagUnverifiedQuotes(cd, transcript);
    const yvChecked = flagUnverifiedQuotes(yv, transcript);
    await saveDoc(client.id, "customer_data", client.name + ": Customer Data", cdChecked.md);
    await saveDoc(client.id, "your_voice", client.name + ": Your Voice", yvChecked.md);
    await mark({ docs_status: "ready", docs_built_at: now(), docs_error: null });
    return { ok: true, transcriptChars: transcript.length, flaggedQuotes: cdChecked.flagged + yvChecked.flagged };
  } catch (e) {
    await mark({ docs_status: "failed", docs_error: e.message || String(e) }).catch(() => {});
    throw e;
  }
};

module.exports = handler(run);
module.exports._test = { flagUnverifiedQuotes, customerDataPrompt, yourVoicePrompt, extraContext };
