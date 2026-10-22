#!/usr/bin/env python3
"""Fully Social bridge: connects the AI team (Paperclip, on Tait's Mac) to
the dashboard (Supabase). Unify the System, Phase 3 (Tait, 2026-10-21).

It does two things:
1. Watches the dashboard and starts the team's work:
   - a new client with no interview questions -> asks the Account Manager
     to write them
   - a new voice memo or call recording -> transcribes it on this Mac
     (Groq Whisper) and saves the transcript on the client
   - a new transcript -> asks the Account Manager to build the client's
     documents (they land on Tait's desk)
2. Lets agents save their work into the dashboard:
   questions, documents, transcripts.

Secrets live only in ~/.config/fully-social/bridge.env (Tait pastes the
Supabase service-role key there himself; it never goes in this repo):
    SUPABASE_URL=https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=<secret>
The Groq key is read from ~/.config/watch/.env (GROQ_API_KEY), already set
up for the watch skill.

Usage:
    python3 bridge/bridge.py status
    python3 bridge/bridge.py check              # one pass
    python3 bridge/bridge.py watch [--every 120]
    python3 bridge/bridge.py client get --client grad-gig
    python3 bridge/bridge.py transcript get --client grad-gig
    python3 bridge/bridge.py questions put --client grad-gig --file questions.md
    python3 bridge/bridge.py doc put --client grad-gig --kind icp --file icp.md \
        [--status on_desk] [--built-by "Account Manager"] [--sources "voice memo 10/21"]
Only standard-library Python. ffmpeg is needed for transcription.
"""
import argparse, datetime as dt, json, os, pathlib, re, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request, uuid

HOME = pathlib.Path.home()
CONFIG = HOME / ".config" / "fully-social" / "bridge.env"
STATE = HOME / ".config" / "fully-social" / "bridge-state.json"
CACHE = HOME / ".cache" / "fully-social" / "recordings"
WATCH_ENV = HOME / ".config" / "watch" / ".env"
PAPERCLIP = os.environ.get("PAPERCLIP_URL", "http://127.0.0.1:3100")
COMPANY = os.environ.get("PAPERCLIP_COMPANY", "a8bc4c2b-b450-4c5e-848a-f723f2d7117e")
DOC_KINDS = ["brand_guidelines", "icp", "identity", "editing_guidelines", "content_research"]
DOC_TITLES = {"brand_guidelines": "Brand guidelines", "icp": "ICP / Customer data", "identity": "Identity",
              "editing_guidelines": "Editing guidelines", "content_research": "Content research"}
GROQ_MAX_BYTES = 24 * 1024 * 1024   # Groq's upload limit is 25 MB
CHUNK_SECONDS = 40 * 60             # 40-minute pieces at 64 kbps ~ 19 MB


# ── config ──────────────────────────────────────────────────────────────
def read_env(path):
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                if v and not v.startswith("paste-"):   # placeholders like paste-your-key-here = not set
                    out[k.strip()] = v
    return out


def config():
    env = read_env(CONFIG)
    url, key = env.get("SUPABASE_URL", ""), env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key or "paste" in key.lower():
        sys.exit(f"The bridge isn't set up yet: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to {CONFIG}")
    return url.rstrip("/"), key


def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text())
    st = {"since": dt.datetime.now(dt.timezone.utc).isoformat()}
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(st, indent=2))
    return st


# ── Supabase (REST + storage) ───────────────────────────────────────────
class Supabase:
    def __init__(self, url, key):
        self.url, self.key = url, key

    def _req(self, method, path, body=None, headers=None, raw=False):
        h = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        if body is not None and not raw:
            h["Content-Type"] = "application/json"
            body = json.dumps(body).encode()
        h.update(headers or {})
        req = urllib.request.Request(self.url + path, data=body, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Supabase {method} {path.split('?')[0]}: {e.code} {e.read()[:300].decode(errors='replace')}")
        if raw:
            return data
        return json.loads(data) if data else None

    def select(self, table, query="select=*"):
        return self._req("GET", f"/rest/v1/{table}?{query}") or []

    def insert(self, table, row, upsert_on=None):
        q = f"?on_conflict={upsert_on}" if upsert_on else ""
        prefer = "return=representation" + (",resolution=merge-duplicates" if upsert_on else "")
        return self._req("POST", f"/rest/v1/{table}{q}", row, {"Prefer": prefer})

    def update(self, table, match, patch):
        q = "&".join(f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in match.items())
        return self._req("PATCH", f"/rest/v1/{table}?{q}", patch, {"Prefer": "return=representation"})

    def delete(self, table, match):
        q = "&".join(f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in match.items())
        return self._req("DELETE", f"/rest/v1/{table}?{q}")

    def download(self, bucket, path):
        return self._req("GET", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", raw=True)

    def upload(self, bucket, path, data, content_type):
        return self._req("POST", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", data,
                         {"Content-Type": content_type, "x-upsert": "true"}, raw=True)


# ── Paperclip ───────────────────────────────────────────────────────────
def paperclip(method, path, body=None):
    req = urllib.request.Request(PAPERCLIP + "/api" + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or b"null")


def agent_id(name):
    agents = paperclip("GET", f"/companies/{COMPANY}/agents")
    agents = agents.get("agents", agents) if isinstance(agents, dict) else agents
    for a in agents:
        if a["name"] == name:
            return a["id"]
    raise RuntimeError(f"No Paperclip agent named {name}")


def give_task(agent, title, description):
    """Create a Paperclip task for an agent and wake it. Returns the task id (e.g. FUL-31)."""
    aid = agent_id(agent)
    issue = paperclip("POST", f"/companies/{COMPANY}/issues",
                      {"title": title, "description": description, "assigneeAgentId": aid, "status": "todo", "priority": "high"})
    paperclip("POST", f"/agents/{aid}/wakeup", {"source": "on_demand", "reason": title})
    return issue.get("identifier")


# ── what needs doing (pure, tested in bridge/test_bridge.py) ────────────
def plan_jobs(clients, onboardings, recordings, since):
    """Decide the jobs for one pass. Only clients/recordings newer than the
    bridge's install time count, so existing clients are left alone."""
    ob = {o["client_id"]: o for o in onboardings}
    jobs = {"questions": [], "import_memos": [], "transcribe": [], "documents": []}
    rec_paths = {r["storage_path"] for r in recordings}
    for c in clients:
        o = ob.get(c["id"], {})
        if (c.get("created_at", "") > since and not c.get("skip_onboarding") and not c.get("onboarding_questions")
                and not o.get("questions_requested_at")):
            jobs["questions"].append(c)
        p = o.get("voice_memo_path")
        if p and p not in rec_paths and (o.get("voice_memo_uploaded_at") or "") > since:
            jobs["import_memos"].append({"client": c, "path": p})
    jobs["transcribe"] = [r for r in recordings if r.get("transcript_status") == "waiting"]
    by_client = {}
    for r in recordings:
        if r.get("transcript_status") == "done":
            by_client.setdefault(r["client_id"], []).append(r)
    for c in clients:
        done = by_client.get(c["id"], [])
        asked = ob.get(c["id"], {}).get("docs_requested_at") or ""
        if done and max(r.get("transcribed_at") or "" for r in done) > asked:
            jobs["documents"].append(c)
    return jobs


def plan_style_jobs(clients, onboardings, docs, moodboard):
    """Editing guidelines (Phase 4): build them once a client's brand
    guidelines are approved; update them when new moodboard items arrive.
    House moodboard items (client_id null) update the house style."""
    ob = {o["client_id"]: o for o in onboardings}
    have = {(d["client_id"], d["kind"]): d for d in docs}
    jobs = {"build": [], "update": [], "house": False}
    for c in clients:
        brand = have.get((c["id"], "brand_guidelines"))
        guide = have.get((c["id"], "editing_guidelines"))
        asked = ob.get(c["id"], {}).get("style_requested_at") or ""
        fresh = [m for m in moodboard if m.get("client_id") == c["id"] and not m.get("used_at") and (m.get("created_at") or "") > asked]
        if brand and brand.get("status") == "approved" and not guide and not asked:
            jobs["build"].append(c)
        elif fresh and (guide or asked):
            jobs["update"].append(c)
    jobs["house"] = any(m.get("client_id") is None and not m.get("used_at") for m in moodboard)
    return jobs


MOOD_SECTIONS = ("look", "colour", "type", "motion", "editing", "texture", "brand", "words")


def plan_mood_sorts(clients, moodboard, asked):
    """Moodboard (Tait, 2026-10-22): clients and Tait just drop screenshots;
    the Art Director groups each one (fonts, colours, motion graphics,
    style…). A client with items that have no group, newer than when we last
    asked, gets a sort job. asked = {client_id: created_at of the newest
    item already asked about}."""
    out = []
    for c in clients:
        new = [m.get("created_at") or "" for m in moodboard if m.get("client_id") == c["id"] and not m.get("section")]
        if new and max(new) > asked.get(c["id"], ""):
            out.append((c, max(new)))
    return out


# ── ideas: dates, phone messages (pure, tested) ─────────────────────────
def timeline(post):
    """Tait's timing (2026-10-21) from a post date: script approved by P-13,
    filmed by P-10, edit done by P-7."""
    d = dt.date.fromisoformat(str(post)[:10])
    return {"post": d.isoformat(), "script_due": (d - dt.timedelta(days=13)).isoformat(),
            "film_by": (d - dt.timedelta(days=10)).isoformat(), "edit_due": (d - dt.timedelta(days=7)).isoformat()}


def plan_dates(month_first, n, requested=()):
    """n post dates spread evenly over the month's weekdays (Mon-Fri);
    requested dates (special requests) are kept and count toward n."""
    first = dt.date.fromisoformat(str(month_first)[:10]).replace(day=1)
    nxt = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    days = [first + dt.timedelta(days=i) for i in range((nxt - first).days)]
    weekdays = [d for d in days if d.weekday() < 5]
    fixed = sorted({dt.date.fromisoformat(str(r)[:10]) for r in requested if r})
    left = max(0, n - len(fixed))
    free = [d for d in weekdays if d not in fixed]
    picks = []
    if left and free:
        step = len(free) / left
        picks = [free[min(len(free) - 1, int(i * step + step / 2))] for i in range(left)]
    return sorted([d.isoformat() for d in fixed] + [d.isoformat() for d in picks])


def match_client(text, clients):
    """'Grad Gig: idea about snow' or 'grad gig test idea: snow rules' ->
    (client, the rest). The message must start with the client's name or
    portal address (any case, spaces or dashes); a ':' or ' - ' right after
    it is dropped. Returns (None, text) when no client is named."""
    raw = (text or "").strip()
    low = raw.lower()
    best = None
    for c in clients:
        for key in (c.get("name") or "", (c.get("slug") or "").replace("-", " "), c.get("slug") or ""):
            k = key.lower().strip()
            if not k:
                continue
            pattern = r"^" + r"[\s\-_]*".join(re.escape(w) for w in re.split(r"[\s\-_]+", k)) + r"(?![a-z0-9])"
            m = re.match(pattern, low)
            if m and (best is None or m.end() > best[1]):
                best = (c, m.end())
    if not best:
        return None, raw
    rest = re.sub(r"^\s*(?::|-|—)?\s*", "", raw[best[1]:])
    return best[0], rest.strip()


def idea_title(text):
    first = re.split(r"(?<=[.!?])\s|\n", text.strip(), maxsplit=1)[0]
    return (first[:90] + "…") if len(first) > 90 else first


def months_ahead(today=None):
    """The month a plan built today is for (next month), as YYYY-MM-01."""
    today = today or dt.date.today()
    return (today.replace(day=28) + dt.timedelta(days=4)).replace(day=1).isoformat()


def questions_from_text(text):
    """The dashboard's plain-text question format -> onboarding_questions JSON
    (same rules as questionsFromText in dashboards/template/shell.js):
    '## Section', 'Note: ...', '- question', '- [story] prompt'."""
    sections, n = [], 0
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("## "):
            sections.append({"section": s[3:].strip(), "note": "", "items": []})
        elif s.lower().startswith("note:") and sections and not sections[-1]["items"]:
            sections[-1]["note"] = s[5:].strip()
        elif re.match(r"^[-*]\s+", s):
            if not sections:
                sections.append({"section": "Questions", "note": "", "items": []})
            q = re.sub(r"^[-*]\s+", "", s)
            story = q.lower().startswith("[story]")
            q = q[7:].strip() if story else q
            n += 1
            item = {"id": f"q{n}", "q": q}
            if story:
                item["story"] = True
            sections[-1]["items"].append(item)
    for sec in sections:
        if not sec["note"]:
            del sec["note"]
    return [s for s in sections if s["items"]]


# ── transcription (Groq Whisper) ────────────────────────────────────────
def groq_key():
    key = read_env(WATCH_ENV).get("GROQ_API_KEY") or os.environ.get("GROQ_API_KEY")
    if not key:
        raise RuntimeError(f"No GROQ_API_KEY in {WATCH_ENV}")
    return key


def groq_transcribe(path, key):
    boundary = uuid.uuid4().hex
    data = path.read_bytes()
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n'.encode(),
        f'--{boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\ntext\r\n'.encode(),
        f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode(),
        data, f"\r\n--{boundary}--\r\n".encode(),
    ]
    req = urllib.request.Request("https://api.groq.com/openai/v1/audio/transcriptions", data=b"".join(parts), method="POST",
                                 headers={"Authorization": f"Bearer {key}", "Content-Type": f"multipart/form-data; boundary={boundary}",
                                          "User-Agent": "fully-social-bridge"})
    with urllib.request.urlopen(req, timeout=600) as r:
        return r.read().decode().strip()


def transcribe_file(src):
    """Any audio/video file -> text. Shrinks to mono 16 kHz 64 kbps MP3 and
    splits long calls into 40-minute pieces so each fits Groq's limit."""
    key = groq_key()
    with tempfile.TemporaryDirectory() as tmp:
        out = pathlib.Path(tmp) / "part-%03d.mp3"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k",
                        "-f", "segment", "-segment_time", str(CHUNK_SECONDS), str(out)], check=True)
        pieces = sorted(pathlib.Path(tmp).glob("part-*.mp3"))
        if any(p.stat().st_size > GROQ_MAX_BYTES for p in pieces):
            raise RuntimeError("A piece is still over Groq's 25 MB limit")
        return "\n\n".join(groq_transcribe(p, key) for p in pieces)


# ── the jobs ────────────────────────────────────────────────────────────
def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def bridge_cmd():
    return f"python3 {pathlib.Path(__file__).resolve()}"


def ask_for_questions(sb, c):
    slug = c["slug"]
    desc = f"""New client: **{c['name']}** (`{slug}`). Write their interview questions (Unify the System stage 1).

1. Read what we know: `{bridge_cmd()} client get --client {slug}` (and their website if the client record has one; run `industry-primer` first).
2. Write 25-30 questions with the `voice-memo-questions` skill: the business and offer, their target customer (problems, fears, dreams, goals, their words), their background and story ([story] prompts), their voice and opinions, and the short **brand section** at the end (colours, fonts, logo, do's and don'ts, brand files).
3. Save them in the dashboard's text format (## Section / Note: / - question / - [story] prompt) to `clients/{slug}/sources/interview-questions.md`, then:
   `{bridge_cmd()} questions put --client {slug} --file clients/{slug}/sources/interview-questions.md`
4. They now show on the client's welcome page and on Clients -> Onboarding for Tait to copy or send. Post one line in this task when done."""
    tid = give_task("Account Manager", f"{c['name']}: write their interview questions", desc)
    sb.insert("social_client_onboarding", {"client_id": c["id"], "questions_requested_at": now()}, upsert_on="client_id")
    return tid


def import_memo(sb, client, path):
    sb.insert("social_onboarding_recordings", {"client_id": client["id"], "kind": "voice_memo", "name": pathlib.Path(path).name,
                                               "storage_path": path, "uploaded_by_role": "client"}, upsert_on="storage_path")


def transcribe_recording(sb, r):
    sb.update("social_onboarding_recordings", {"id": r["id"]}, {"transcript_status": "transcribing"})
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        local = CACHE / f"{r['id']}{pathlib.Path(r['storage_path']).suffix or '.audio'}"
        local.write_bytes(sb.download("onboarding", r["storage_path"]))
        text = transcribe_file(local)
    except Exception as e:
        sb.update("social_onboarding_recordings", {"id": r["id"]}, {"transcript_status": "failed", "transcript_error": str(e)[:500]})
        return False
    stamp = now()
    sb.update("social_onboarding_recordings", {"id": r["id"]}, {"transcript": text, "transcript_status": "done", "transcribed_at": stamp, "transcript_error": None})
    ob = sb.select("social_client_onboarding", f"select=transcript&client_id=eq.{r['client_id']}")
    old = (ob[0].get("transcript") if ob else "") or ""
    label = "Call recording" if r["kind"] == "call" else "Voice memo"
    joined = (old + "\n\n" if old else "") + f"## {label}: {r['name']} ({stamp[:10]})\n\n{text}"
    sb.insert("social_client_onboarding", {"client_id": r["client_id"], "transcript": joined}, upsert_on="client_id")
    return True


def ask_for_documents(sb, c):
    slug = c["slug"]
    desc = f"""**{c['name']}** sent interview answers. Build their documents (Unify the System stage 2). Client words in, no invention: AI organizes, it never makes things up about the client.

1. Read everything: `{bridge_cmd()} transcript get --client {slug}` and `{bridge_cmd()} client get --client {slug}` (brand answers, uploaded brand files, their website).
2. Build each document from your skills, and save each one to Tait's desk:
   - **Brand guidelines**: `brand-guidelines-doc` skill -> `--kind brand_guidelines` (the client sees this one once Tait approves it)
   - **ICP / Customer data**: `customer-data-doc` skill -> `--kind icp`
   - **Identity** (voice, who they are, what they sell, the 3-3-3, formats that might work): `identity-doc` skill -> `--kind identity`
   Save each as `clients/{slug}/sources/<kind>.md`, then:
   `{bridge_cmd()} doc put --client {slug} --kind <kind> --file clients/{slug}/sources/<kind>.md --status on_desk --built-by "Account Manager" --sources "<which recordings>"`
3. Anything the recordings don't answer: mark it `[ask the client]`, never guess. If a document was already approved, save the new version as on_desk and say what changed at the top.
4. Editing guidelines come later (stage 3) and content research later still. Post one line here when done."""
    tid = give_task("Account Manager", f"{c['name']}: build their documents", desc)
    sb.insert("social_client_onboarding", {"client_id": c["id"], "docs_requested_at": now(), "docs_status": "processing"}, upsert_on="client_id")
    return tid


def ask_for_style(sb, c, update=False):
    slug = c["slug"]
    what = "update their editing guidelines with the new moodboard items" if update else "build their editing guidelines"
    desc = f"""**{c['name']}**: {what} (the client's style guide). You lead (Tait, 2026-10-22: the Art Director views the moodboard and tells the editor and motion graphics designer how to do it in the style Tait and the client want). Bring in the **Content Strategist** (video types, pacing) as you need.

1. Read: their approved brand guidelines `{bridge_cmd()} doc get --client {slug} --kind brand_guidelines`, their identity `--kind identity`, the house style `team/content-editor/house-style.md`, their `clients/{slug}/style-profile.md` and `team-room/feedback-log.md` if they exist.
2. Their moodboard (Tait and the client build it together, in sections): `{bridge_cmd()} moodboard get --client {slug}` downloads every item with its section, colours, who added it and their note. Look at every image; watch every video and reel (`watch` skill).
3. Write the guidelines with the `editing-guidelines-doc` skill (including **For the Content Editor** and **For the Motion Graphics Designer**), save as `clients/{slug}/sources/editing_guidelines.md`, then
   `{bridge_cmd()} doc put --client {slug} --kind editing_guidelines --file clients/{slug}/sources/editing_guidelines.md --status on_desk --built-by "Art Director" --sources "moodboard (N items), brand guidelines"`
   and `{bridge_cmd()} moodboard used --client {slug}`.
4. Post the two briefs to the Content Editor and the Motion Graphics Designer. Tait approves the guidelines on My desk. **No edit for this client starts until they're approved** (Tait's rule)."""
    tid = give_task("Art Director", f"{c['name']}: {what}", desc)
    sb.insert("social_client_onboarding", {"client_id": c["id"], "style_requested_at": now()}, upsert_on="client_id")
    return tid


def ask_for_mood_sort(sb, c):
    slug = c["slug"]
    desc = f"""**{c['name']}**: new things were dropped on their moodboard. Group them (Tait, 2026-10-22: "i want my ai agent to organize the moodboard into groupings of fonts, colors, motion graphics, style… i dont want the client to have to organize the file they drop in").

1. `{bridge_cmd()} moodboard get --client {slug}` downloads every item; the new ones say `[new · …]`. Look at each one (Read the image; `watch` a video or reel).
2. Put each new item in its group: `{bridge_cmd()} moodboard place --client {slug} --id <item id> --section <group>`, where group is one of: look (feeling, light, grade, people, places), colour (palettes, colour-led images), type (fonts, captions, text on screen), motion (motion graphics, animation, transitions), editing (how videos are cut and paced), texture (paper, grain, film, surfaces), brand (logos, icons, marks), words (words and phrases). Pick the one thing it's mainly there for.
3. If the new items change the client's style, say so here in one line (the editing guidelines update runs on its own)."""
    return give_task("Art Director", f"{c['name']}: group the new moodboard items", desc)


def ask_for_house_style(sb):
    desc = f"""Tait added items to the **house moodboard** (every client). Fold them into the house style.

1. `{bridge_cmd()} moodboard get --client house` downloads them with Tait's notes. Look at every image; watch every video.
2. Update `team/content-editor/house-style.md` (the defaults every client's editing guidelines start from): motion graphics, fonts, text styles, colours, video styles. Add only what the items show; Tait is the rule maker, so list anything that would change an existing rule as a question for him. Tell the Content Editor and the Motion Graphics Designer what changed.
3. `{bridge_cmd()} moodboard used --client house`, then post one line here."""
    tid = give_task("Art Director", "House moodboard: fold new items into the house style", desc)
    return tid


def ask_for_research(sb, c):
    slug = c["slug"]
    desc = f"""Weekly research for **{c['name']}** (Unify the System stage 4). Find what their customers ask and what's performing in their niche, and add it to their Content Idea Database. Sources (Tait, 2026-10-21): **Reddit, Instagram, YouTube. No TikTok.**

1. Read who their customer is: `{bridge_cmd()} doc get --client {slug} --kind icp` and `--kind identity` (or `clients/{slug}/` files if those aren't built yet).
2. **Reddit (free):** the subreddits their customers use; read `https://www.reddit.com/r/<sub>/search.json?q=<words>&restrict_sr=1&sort=top&t=month` (WebFetch). Real questions only, with the link.
3. **YouTube (free):** `{bridge_cmd()} youtube outliers --query "<niche words>"`: videos far above their channel's usual views.
4. **Instagram (Apify, keep it small: at most ~150 results this week):** comments on niche/competitor posts, and outlier reels (views vs the account's median). If Apify is out of credit, say so here and skip it.
5. Add every good find as an idea, paired with a format and why it should work:
   `{bridge_cmd()} idea add --client {slug} --title "<the idea>" --body "<what to say / the question asked>" --source research --source-detail "<r/sub, @account 12x, YouTube 8x>" --format "<format>" --why "<why it should work>" --link <url>`
   About 5-15 strong ideas; skip anything already in their ideas (`{bridge_cmd()} ideas list --client {slug}`).
6. Post one line here: how many ideas from where."""
    return give_task("Content Researcher", f"{c['name']}: weekly research", desc)


def ask_for_plan(sb, c, month, size=20):
    slug = c["slug"]
    label = dt.date.fromisoformat(month).strftime("%B %Y")
    desc = f"""Build **{c['name']}'s plan for {label}** (Unify the System stage 4). You run it; Tait's rules: {size} ideas from their Content Idea Database (any mix of Tait's and research), special requests keep their day. If there aren't {size} good ones yet, the Strategist writes the rest from their identity and ICP.

1. **Content Strategist:** pick the {size} strongest ideas from `{bridge_cmd()} ideas list --client {slug} --status new` (ideas with a requested post date must be in), pair each with a format, one line why.
2. **Content Expert:** score each 1-10 (Film it / Fix it); swap out anything under 7 for the next best idea.
3. Write the plan as JSON, `clients/{slug}/team-room/plan-{month[:7]}.json`:
   `[{{"idea_id": "<id>", "format": "...", "why": "...", "score": 8}}, ...]`
   (a brand-new idea instead of an idea_id: `{{"title": "...", "body": "...", "source": "research", "format": "...", "why": "...", "score": 8}}`).
4. **Content Simplifier:** a short brief for Tait (`clients/{slug}/team-room/plan-{month[:7]}-brief.md`): the {size} in a list, the mix, anything he should know, ending with "What we need from Tait".
5. Put it on Tait's desk (it also spreads the post dates over the month's weekdays and keeps special requests):
   `{bridge_cmd()} plan put --client {slug} --month {month[:7]} --file clients/{slug}/team-room/plan-{month[:7]}.json --brief clients/{slug}/team-room/plan-{month[:7]}-brief.md`
Timing to keep in mind: scripts approved 13 days before each post, filmed 10 days before, edit done 7 days before."""
    return give_task("Team Lead", f"{c['name']}: {label} plan ({size} ideas)", desc)


# ── scripts (Phase 6) ───────────────────────────────────────────────────
def script_signature(v):
    """What the Writer last worked from: a new card, or new notes (Tait's
    send-back in editor_brief.scriptNotes, or the client's change request
    in note) mean a new pass."""
    eb = v.get("editor_brief") or {}
    return f"{len(eb.get('scriptNotes') or [])}|{(v.get('note') or '').strip()}"


def plan_script_jobs(videos, asked):
    """Cards in Scripting the Writer hasn't seen in this form yet, by client."""
    out = {}
    for v in videos:
        if v.get("status") == "scripting" and asked.get(v["id"]) != script_signature(v):
            out.setdefault(v["client_id"], []).append(v)
    return out


def ask_for_scripts(sb, c, cards):
    slug = c["slug"]
    lines = "\n".join(f"- `{v['id']}` {v.get('title') or '(untitled)'}" + (f" (posts {v['post_date']})" if v.get("post_date") else "")
                      + (" **changes requested**" if v.get("note") else "") for v in cards)
    desc = f"""Script {len(cards)} card(s) for **{c['name']}** (Unify the System stage 5). You run it: Writer → Content Expert → Content Simplifier → Tait's desk.

{lines}

For each card:
1. `{bridge_cmd()} card get --id <id>`: the idea, its format and why, the dates, and any notes (Tait's send-back notes, or the client's requested changes: fix exactly what they asked, keep the rest).
2. **Content Writer:** hook, outline, script and the questions for whoever's filming (the client answers them if they film themselves), from their identity (`{bridge_cmd()} doc get --client {slug} --kind identity`) and Tait's rules. Unknown facts: `[LUKE: …]`-style placeholders for the person on camera, never invented. Save: `{bridge_cmd()} card put --id <id> --file <card.json>` with `{{"hook": "...", "outline": "...", "script": "...", "camera_questions": "...", "filming_instructions": "..."}}`.
3. **Content Expert:** score it; send weak ones back to the Writer.
4. **Content Simplifier:** one or two lines for Tait (what it is, the score, anything to decide), then `{bridge_cmd()} card ready --id <id> --score <n> --brief "<lines>"` puts it in Tait's Scripts to review.
Timing: scripts are approved 13 days before the post date (each card says when)."""
    return give_task("Team Lead", f"{c['name']}: script {len(cards)} card(s)", desc)


# ── footage: from the dashboard into Google Drive (Phase 6) ─────────────
DRIVE_ROOT = next(iter(sorted((HOME / "Library" / "CloudStorage").glob("GoogleDrive-*"))), None) if (HOME / "Library" / "CloudStorage").exists() else None


def drive_id(path):
    out = subprocess.run(["xattr", "-p", "com.google.drivefs.item-id#S", str(path)], capture_output=True, text=True)
    return out.stdout.strip() or None


def find_drive_folder(folder_id, st):
    """The local Google Drive for desktop folder for a Drive folder id."""
    cache = st.setdefault("drive_paths", {})
    if folder_id in cache and pathlib.Path(cache[folder_id]).exists():
        return pathlib.Path(cache[folder_id])
    if not DRIVE_ROOT:
        return None
    base = DRIVE_ROOT / "My Drive" / "Fully Social OS" / "Clients"
    for p in [base] + list(base.glob("*")) + list(base.glob("*/*")) + list(base.glob("*/*/*")):
        if p.is_dir() and drive_id(p) == folder_id:
            cache[folder_id] = str(p)
            return p
    return None


def folder_id_of(url):
    m = re.search(r"/folders/([A-Za-z0-9_-]+)", url or "")
    return m.group(1) if m else None


def card_folder_name(n, v):
    title = re.sub(r'[\\/:*?"<>|]+', "", v.get("title") or "Untitled").strip()[:80]
    posts = f" (posts {dt.date.fromisoformat(str(v['post_date'])[:10]).strftime('%b %-d')})" if v.get("post_date") else ""
    return f"{n:02d}. {title}{posts}"


def move_footage(sb, st):
    """Clips dropped on a card (the 'footage' bucket) -> that card's folder in
    the client's Google Drive footage folder; then the temporary copy goes."""
    log = []
    try:
        rows = sb.select("social_footage", "select=*&storage_path=not.is.null&drive_url=is.null&kind=eq.raw")
    except RuntimeError:
        return log
    if not rows or not DRIVE_ROOT:
        return log
    links = {r["client_id"]: r for r in sb.select("social_drive_folder_links", "select=client_id,footage_uploads")}
    for f in rows:
        v = (sb.select("social_videos", f"select=id,title,post_date,editor_brief&id=eq.{f['video_id']}") or [None])[0]
        client_folder = find_drive_folder(folder_id_of((links.get(f["client_id"]) or {}).get("footage_uploads")), st)
        if not v or not client_folder:
            log.append(f"footage: no Drive folder for {f['name']}")
            continue
        eb = v.get("editor_brief") or {}
        card = find_drive_folder(folder_id_of(eb.get("rawFootageUrl")), st) if eb.get("rawFootageUrl") else None
        if not card:
            existing = [d for d in client_folder.iterdir() if d.is_dir()]
            prefix = re.sub(r'[\\/:*?"<>|]+', "", v.get("title") or "")[:80].strip()
            card = next((d for d in existing if prefix and prefix in d.name), None) or client_folder / card_folder_name(len(existing) + 1, v)
            card.mkdir(exist_ok=True)
        dest = card / f["name"]
        if dest.exists():
            dest = card / f"{dest.stem}-{f['id'][:6]}{dest.suffix}"
        dest.write_bytes(sb.download("footage", f["storage_path"]))
        fid = drive_id(card)
        url = f"https://drive.google.com/drive/folders/{fid}" if fid else None
        sb.update("social_footage", {"id": f["id"]}, {"drive_url": url or str(dest), "storage_path": None})
        sb._req("DELETE", f"/storage/v1/object/footage/{urllib.parse.quote(f['storage_path'])}", raw=True)
        if url and not eb.get("rawFootageUrl"):
            eb["rawFootageUrl"] = url
            sb.update("social_videos", {"id": v["id"]}, {"editor_brief": eb})
        log.append(f"footage: {f['name']} -> {card.name}")
    return log


# ── editing and reviews (Phase 7) ───────────────────────────────────────
SITE = os.environ.get("FULLY_SOCIAL_SITE", "https://social.fullylaunched.com")


def edit_signature(v, open_comments=0):
    """What the AI Editor last worked from: Tait's revisions, the client's
    request, a new round, or new open comments mean another pass."""
    eb = v.get("editor_brief") or {}
    return f"{(eb.get('revisions') or '').strip()}|{(v.get('note') or '').strip()}|{v.get('client_revision_rounds') or 0}|{open_comments}"


def plan_edit_jobs(videos, approved_guides, pending_clips, asked, open_comments=None):
    """start: footage is in (every clip moved to Drive), no human editor, and
    the client's editing guidelines are approved (Tait: wait for approval).
    waiting: footage in, guidelines not approved yet.
    revise: with the AI Editor, and there's something new to fix."""
    open_comments = open_comments or {}
    jobs = {"start": [], "waiting": [], "revise": []}
    for v in videos:
        eb = v.get("editor_brief") or {}
        if v["status"] == "ready_to_edit" and not v.get("editor_id") and not eb.get("humanEditor"):
            if v["id"] in pending_clips:
                continue
            (jobs["start"] if v["client_id"] in approved_guides else jobs["waiting"]).append(v)
        elif v["status"] == "with_editor" and eb.get("aiEditor") and not v.get("editor_id"):
            sig = edit_signature(v, open_comments.get(v["id"], 0))
            if asked.get(v["id"]) not in (None, sig):
                jobs["revise"].append(v)
            elif v["id"] not in asked:
                jobs["revise"].append(v)   # sent to the AI Editor from the dashboard
    return jobs


def ask_for_edit(sb, c, v, revise=False, notes=None):
    slug = c["slug"]
    what = "revise the edit" if revise else "edit the video"
    fix = ""
    if revise:
        fix = "\n**What to fix** (fix exactly these, change nothing else):\n" + (notes or "(read the comments on the latest version)") + "\n"
    desc = f"""**{c['name']}**: {what} for **{v.get('title')}** (card `{v['id']}`). Unify the System stage 7. You lead; the **Motion Graphics Designer** builds graphics, the **Content Reviewer** checks every render (their checklist) before it goes to Tait.
{fix}
1. `{bridge_cmd()} card get --id {v['id']}` (the script, outline, hook, dates) and the client's **approved** editing guidelines: `{bridge_cmd()} doc get --client {slug} --kind editing_guidelines`, plus brand guidelines and the feedback log.
2. The raw footage is in Google Drive on this Mac: `{bridge_cmd()} footage where --id {v['id']}` prints the folder.
3. Edit in Remotion (`editor/`), music and sound effects from the Library (`{bridge_cmd()} assets list --kind music`; never one marked never). Render to `editor/out/{slug}/{v['id']}.mp4`.
4. Content Reviewer ⇄ you until it passes.
5. Deliver it to Tait's desk: `{bridge_cmd()} video deliver --id {v['id']} --file editor/out/{slug}/{v['id']}.mp4` (a review copy for the player, a copy in their Final Edits Drive folder, and the card moves to Tait's Videos to review).
The edit is due {v.get('due_to_edit') or 'soon'} (7 days before the post date)."""
    return give_task("Content Editor", f"{c['name']}: {what}: {v.get('title')}", desc)


def ask_for_captions(sb, c, v):
    desc = f"""Draft the posting copy for **{c['name']}: {v.get('title')}** (card `{v['id']}`), now on Tait's desk to review.
Read `{bridge_cmd()} card get --id {v['id']}` and the client's identity (`{bridge_cmd()} doc get --client {c['slug']} --kind identity`). Following your rules (short hook caption, their CTA, Kallaway-style packaging):
`{bridge_cmd()} captions put --id {v['id']} --caption "<post caption>" --on-screen "<on-screen caption>" --cover "<cover idea: frame + text>"`
Tait edits them in "Approve & add captions"."""
    return give_task("Content Poster", f"{c['name']}: captions for {v.get('title')}", desc)


def edit_notes(sb, v):
    """What to fix: Tait's revisions, the client's request, and every note
    left on the latest version (the review window closes them when the cut
    is sent back, so they're read by date, not by open/closed)."""
    eb = v.get("editor_brief") or {}
    lines = []
    if eb.get("revisions"):
        lines.append("Tait: " + eb["revisions"])
    if v.get("note") and v.get("client_revision_rounds"):
        lines.append("Client: " + v["note"])
    try:
        ver = sb.select("social_video_versions", f"select=created_at&video_id=eq.{v['id']}&order=version.desc&limit=1")
        since = f"&created_at=gte.{urllib.parse.quote(ver[0]['created_at'])}" if ver else ""
        for cm in sb.select("social_video_comments", f"select=body,at_seconds,author_role,resolved_at&video_id=eq.{v['id']}{since}&order=at_seconds.nullsfirst"):
            if cm.get("resolved_at"):
                continue
            at = cm.get("at_seconds")
            when = f"{int(float(at)) // 60}:{int(float(at)) % 60:02d}" if at is not None else "Whole video"
            lines.append(f"- {when} ({cm.get('author_role')}): {cm.get('body')}")
    except RuntimeError:
        pass
    return "\n".join(lines)


def desk_items(sb):
    """Everything on Tait's desk, as stable ids (for Telegram notices)."""
    items = {}
    for kind, table, q in (("plan", "social_monthly_plans", "select=id&status=eq.on_desk"),
                           ("doc", "social_client_generated_docs", "select=id&status=eq.on_desk"),
                           ("script", "social_videos", "select=id&status=eq.script_review"),
                           ("video", "social_videos", "select=id&status=eq.in_review"),
                           ("post", "social_videos", "select=id&status=eq.ready_to_post")):
        try:
            items[kind] = [r["id"] for r in sb.select(table, q)]
        except RuntimeError:
            items[kind] = []
    return items


def desk_message(items, new_ids):
    words = {"plan": ("monthly plan", "monthly plans"), "doc": ("document", "documents"), "script": ("script", "scripts"),
             "video": ("video to review", "videos to review"), "post": ("video to post", "videos to post")}
    parts = [f"{len(v)} {words[k][0] if len(v) == 1 else words[k][1]}" for k, v in items.items() if v]
    fresh = sum(1 for k in items for i in items[k] if i in new_ids)
    return f"On your desk: {', '.join(parts)} ({fresh} new).\n{SITE}/operator/dashboard.html#desk"


def notify_tait(sb, st):
    """Text Tait (his Telegram bot) when something new lands on his desk; at
    most every 2 hours, grouped."""
    env = read_env(CONFIG)
    token, chat = env.get("TELEGRAM_BOT_TOKEN"), st.get("telegram_chat")
    if not token or not chat:
        return []
    items = desk_items(sb)
    now_ids = {i for v in items.values() for i in v}
    new = now_ids - set(st.get("desk_seen", []))
    last = st.get("desk_notified_at")
    recent = bool(last) and (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(last)).total_seconds() < 2 * 3600
    if not new:
        st["desk_seen"] = sorted(now_ids)   # things that left the desk drop off
        return []
    if recent:
        return []                           # tell him at the next window
    tg("sendMessage", token, {"chat_id": chat, "text": desk_message(items, new)})
    st["desk_seen"], st["desk_notified_at"] = sorted(now_ids), now()
    return [f"telegram: desk notice ({len(new)} new)"]


def notify_clients(sb, st):
    """Once a day per client: email them when cards are ready to approve or a
    finished video is ready to review (the dashboard's /api/notify-review)."""
    url, key = config()
    log, today = [], dt.date.today().isoformat()
    sent = st.setdefault("client_emailed", {})
    try:
        waiting = sb.select("social_videos", "select=id,client_id,status,concept_approved_at&or=(status.eq.client_review,and(status.eq.concept_pending,concept_approved_at.not.is.null))")
    except RuntimeError:
        return log
    by = {}
    for v in waiting:
        by.setdefault(v["client_id"], set()).add(v["id"])
    for cid, ids in by.items():
        prev = sent.get(cid, {})
        if prev.get("day") == today or not (ids - set(prev.get("ids", []))):
            continue
        req = urllib.request.Request(SITE + "/api/notify-review", data=json.dumps({"clientId": cid}).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                out = json.loads(r.read() or b"{}")
            log.append(f"client email: {out.get('email', cid)} ({out.get('count', '?')})")
        except Exception as e:
            log.append(f"client email {cid}: {e}")
            continue
        sent[cid] = {"day": today, "ids": sorted(ids)}
    return log


# ── the Agent room (Phase 8) ────────────────────────────────────────────
def needs_from_error(err):
    e = (err or "").lower()
    if "apify" in e and ("credit" in e or "limit" in e or "quota" in e):
        return "Apify is out of credit: add some at console.apify.com, then press Try again."
    if "session limit" in e or "usage limit" in e or "rate limit" in e:
        return "Your Claude usage limit was hit. Wait for it to reset (or add usage credits), then press Try again."
    if "not logged in" in e or "authenticate" in e or "401" in e:
        return "A connection needs you to log in again (ask Claude in a terminal which one), then press Try again."
    return None


def agent_rows(agents, issues, last_runs, clients, last_lines=None):
    """Paperclip -> one social_agent_status row per agent (pure, tested)."""
    last_lines = last_lines or {}
    rows = []
    for a in agents:
        mine = [i for i in issues if i.get("assigneeAgentId") == a["id"]]
        active = sorted([i for i in mine if i.get("status") in ("in_progress", "in_review")], key=lambda i: i.get("updatedAt") or "", reverse=True)
        blocked = [i for i in mine if i.get("status") == "blocked"]
        run = last_runs.get(a["id"]) or {}
        err = run.get("error") if run.get("status") in ("failed", "error", "timed_out") else None
        status = "paused" if a.get("status") == "paused" else "stuck" if (a.get("status") == "error" or err) else "working" if (a.get("status") == "running" or active) else "idle"
        cur = (active or blocked or [None])[0]
        client = None
        if cur:
            for c in clients:
                if (cur.get("title") or "").lower().startswith(c["name"].lower()):
                    client = c["id"]
        stuck_on = (err or ("Paperclip shows an error" if a.get("status") == "error" else None))
        waiting = bool(cur and not active and blocked)   # a task waiting on another task isn't "stuck"
        rows.append({"agent": a["name"], "role": a.get("title"), "handoffs": [], "status": status,
                     "working_on": ((cur.get("title") or "") + (" (waiting on another task)" if waiting else "")) if cur else None,
                     "client_id": client, "paperclip_task": cur.get("identifier") if cur else None,
                     "stuck_on": (stuck_on or None) and stuck_on[:240], "needs_from_tait": needs_from_error(err) if err else None,
                     "paused": a.get("status") == "paused", "last_line": last_lines.get(a["id"]),
                     "last_run_at": run.get("finishedAt") or run.get("createdAt")})
    # Live hand-offs for the graph (032): work passed in the last hour, or
    # still in progress / in review, from whoever made the task to whoever has it.
    names = {a["id"]: a["name"] for a in agents}
    byname = {r["agent"]: r for r in rows}
    cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).isoformat()
    for i in issues:
        recent = (i.get("lastActivityAt") or i.get("updatedAt") or "") >= cutoff
        if not (recent or i.get("status") in ("in_progress", "in_review")) or i.get("status") in ("cancelled",):
            continue
        frm = names.get(i.get("createdByAgentId")) or ("Tait" if i.get("createdByUserId") else None)
        to = names.get(i.get("assigneeAgentId")) or ("Tait" if i.get("assigneeUserId") else None)
        if not frm or not to or frm == to:
            continue
        home = byname.get(to) if to != "Tait" else byname.get(frm)
        if home is not None and len(home["handoffs"]) < 6:
            home["handoffs"].append({"from": frm, "to": to, "task": (i.get("title") or "")[:80]})
    return rows


def sync_agents(sb):
    """Fill the dashboard's Agent room from Paperclip, and do what Tait asked
    there (Try again / Pause / Resume)."""
    log = []
    try:
        agents = paperclip("GET", f"/companies/{COMPANY}/agents")
    except Exception:
        return log   # Paperclip isn't running; the room says it's out of date
    agents = agents.get("agents", agents) if isinstance(agents, dict) else agents
    byname = {a["name"]: a for a in agents}
    try:
        reqs = sb.select("social_agent_requests", "select=*&done_at=is.null&order=requested_at")
    except RuntimeError:
        reqs = []
    for r in reqs:
        a = byname.get(r["agent"])
        result = "No agent by that name"
        if a:
            try:
                if r["action"] == "pause":
                    paperclip("POST", f"/agents/{a['id']}/pause", {}); result = "Paused"
                elif r["action"] == "resume":
                    paperclip("POST", f"/agents/{a['id']}/resume", {}); result = "Resumed"
                else:
                    if a.get("status") in ("error", "paused"):
                        paperclip("POST", f"/agents/{a['id']}/resume", {})
                    paperclip("POST", f"/agents/{a['id']}/wakeup", {"source": "on_demand", "reason": "Tait pressed Try again in the Agent room"})
                    result = "Restarted"
            except Exception as e:
                result = f"Didn't work: {e}"
        sb.update("social_agent_requests", {"id": r["id"]}, {"done_at": now(), "result": result})
        log.append(f"agent room: {r['agent']} {r['action']} -> {result}")
    if reqs:
        agents = paperclip("GET", f"/companies/{COMPANY}/agents")
        agents = agents.get("agents", agents) if isinstance(agents, dict) else agents
    issues = paperclip("GET", f"/companies/{COMPANY}/issues?limit=200")
    issues = issues.get("issues", issues) if isinstance(issues, dict) else issues
    runs, lines = {}, {}
    for a in agents:
        try:
            rr = paperclip("GET", f"/companies/{COMPANY}/heartbeat-runs?agentId={a['id']}&limit=1")
            rr = rr.get("runs", rr) if isinstance(rr, dict) else rr
            runs[a["id"]] = rr[0] if rr else {}
        except Exception:
            runs[a["id"]] = {}
        latest = sorted([i for i in issues if i.get("assigneeAgentId") == a["id"]], key=lambda i: i.get("updatedAt") or "", reverse=True)[:1]
        if latest:
            try:
                cs = paperclip("GET", f"/issues/{latest[0]['id']}/comments")
                cs = cs.get("comments", cs) if isinstance(cs, dict) else cs
                mine = [c for c in cs if c.get("authorAgentId") == a["id"]]
                if mine:
                    body = sorted(mine, key=lambda c: c.get("createdAt") or "")[-1].get("body") or ""
                    first = re.sub(r"[*#`_>]", "", body).strip().splitlines()[0] if body.strip() else ""
                    lines[a["id"]] = first[:200]
            except Exception:
                pass
    clients = sb.select("social_clients", "select=id,name")
    for row in agent_rows(agents, issues, runs, clients, lines):
        row["updated_at"] = now()
        try:
            sb.insert("social_agent_status", row, upsert_on="agent")
        except RuntimeError:
            row.pop("handoffs", None)   # before migration 032
            sb.insert("social_agent_status", row, upsert_on="agent")
    return log


def check(sb, verbose=True):
    st = load_state()
    clients = sb.select("social_clients", "select=id,name,slug,created_at,skip_onboarding,onboarding_questions")
    obs = sb.select("social_client_onboarding", "select=client_id,voice_memo_path,voice_memo_uploaded_at,questions_requested_at,docs_requested_at")
    recs = sb.select("social_onboarding_recordings", "select=*")
    jobs = plan_jobs(clients, obs, recs, st["since"])
    log = []
    for c in jobs["questions"]:
        log.append(f"questions: {c['name']} -> {ask_for_questions(sb, c)}")
    for m in jobs["import_memos"]:
        import_memo(sb, m["client"], m["path"])
        log.append(f"new voice memo: {m['client']['name']}")
    if jobs["import_memos"]:
        recs = sb.select("social_onboarding_recordings", "select=*")
        jobs = plan_jobs(clients, obs, recs, st["since"])
    for r in jobs["transcribe"]:
        log.append(f"transcribe {r['name']}: {'done' if transcribe_recording(sb, r) else 'failed'}")
    if jobs["transcribe"]:
        recs = sb.select("social_onboarding_recordings", "select=*")
        jobs = plan_jobs(clients, sb.select("social_client_onboarding", "select=client_id,voice_memo_path,voice_memo_uploaded_at,questions_requested_at,docs_requested_at"), recs, st["since"])
    for c in jobs["documents"]:
        log.append(f"documents: {c['name']} -> {ask_for_documents(sb, c)}")
    try:
        docs = sb.select("social_client_generated_docs", "select=client_id,kind,status")
        mood = sb.select("social_moodboard_items", "select=id,client_id,used_at,created_at,section")
        obs2 = sb.select("social_client_onboarding", "select=client_id,style_requested_at")
    except RuntimeError:
        mood = None   # migration 028 not run yet
    if mood is not None:
        sj = plan_style_jobs(clients, obs2, docs, mood)
        for c in sj["build"]:
            log.append(f"editing guidelines: {c['name']} -> {ask_for_style(sb, c)}")
        for c in sj["update"]:
            log.append(f"editing guidelines update: {c['name']} -> {ask_for_style(sb, c, update=True)}")
        asked = st.get("mood_sort_asked", {})
        for c, newest in plan_mood_sorts(clients, mood, asked):
            log.append(f"moodboard groups: {c['name']} -> {ask_for_mood_sort(sb, c)}")
            asked[c["id"]] = newest
            st["mood_sort_asked"] = asked
            STATE.write_text(json.dumps(st, indent=2))
        if sj["house"] and not st.get("house_asked_open"):
            log.append(f"house style -> {ask_for_house_style(sb)}")
            st["house_asked_open"] = True
            STATE.write_text(json.dumps(st, indent=2))
    # Ideas (Phase 5): phone ideas, weekly research, the plan on the 10th.
    try:
        log += handle_telegram(sb, st)
    except Exception as e:
        log.append(f"telegram: {e}")
    try:
        active = sb.select("social_clients", "select=id,name,slug,created_at&status=eq.active")
        plans = sb.select("social_monthly_plans", "select=client_id,month")
    except RuntimeError:
        active = None
    if active is not None:
        today = dt.date.today()
        for c in active:
            last = st.setdefault("research_last", {}).get(c["id"])
            # Only clients added after the bridge was set up (Tait, 2026-10-21:
            # "lets only research with new clients that come in when i add them").
            if (c.get("created_at") or "") > st["since"] and (not last or (today - dt.date.fromisoformat(last)).days >= 7):
                log.append(f"research: {c['name']} -> {ask_for_research(sb, c)}")
                st["research_last"][c["id"]] = today.isoformat()
            month = months_ahead(today)
            asked = st.setdefault("plan_asked", {}).get(c["id"])
            if "plans_start" not in st:   # installed after the 10th: start with the following cycle
                st["plans_start"] = month if today.day < 10 else months_ahead(dt.date.fromisoformat(month))
            if today.day >= 10 and month >= st["plans_start"] and asked != month and not any(p["client_id"] == c["id"] and str(p["month"])[:10] == month for p in plans):
                log.append(f"plan {month[:7]}: {c['name']} -> {ask_for_plan(sb, c, month)}")
                st["plan_asked"][c["id"]] = month
        # "Ask the team for next month's plan" on the dashboard: a draft plan with no ideas yet.
        try:
            drafts = sb.select("social_monthly_plans", "select=id,client_id,month&status=eq.draft")
            used = {i["plan_id"] for i in sb.select("social_ideas", "select=plan_id&plan_id=not.is.null")}
        except RuntimeError:
            drafts, used = [], set()
        byid = {c["id"]: c for c in active}
        for pl in drafts:
            done = st.setdefault("plan_drafts_asked", [])
            if pl["id"] not in used and pl["id"] not in done and byid.get(pl["client_id"]):
                log.append(f"plan (asked for): {byid[pl['client_id']]['name']} -> {ask_for_plan(sb, byid[pl['client_id']], str(pl['month'])[:10])}")
                done.append(pl["id"])
        STATE.write_text(json.dumps(st, indent=2))
    # Scripts and footage (Phase 6).
    try:
        scripting = sb.select("social_videos", "select=id,client_id,title,status,note,post_date,editor_brief&status=eq.scripting")
    except RuntimeError:
        scripting = []
    asked = st.setdefault("scripts_asked", {})
    byid = {c["id"]: c for c in clients}
    for cid, cards in plan_script_jobs(scripting, asked).items():
        if byid.get(cid):
            log.append(f"scripts: {byid[cid]['name']} ({len(cards)}) -> {ask_for_scripts(sb, byid[cid], cards)}")
            for v in cards:
                asked[v["id"]] = script_signature(v)
    try:
        log += move_footage(sb, st)
    except Exception as e:
        log.append(f"footage: {e}")
    # Editing and reviews (Phase 7).
    try:
        vids = sb.select("social_videos", "select=id,client_id,title,status,note,editor_id,editor_brief,client_revision_rounds,due_to_edit&status=in.(ready_to_edit,with_editor)")
        guides = {d["client_id"] for d in sb.select("social_client_generated_docs", "select=client_id&kind=eq.editing_guidelines&status=eq.approved")}
        pending = {f["video_id"] for f in sb.select("social_footage", "select=video_id&kind=eq.raw&storage_path=not.is.null")}
        oc = {}
    except RuntimeError:
        vids = []
    edits = st.setdefault("edits_asked", {})
    ej = plan_edit_jobs(vids, guides if vids else set(), pending if vids else set(), edits, oc if vids else {})
    for v in ej["start"]:
        c = byid.get(v["client_id"])
        if not c: continue
        eb = dict(v.get("editor_brief") or {}, aiEditor=True); eb.pop("waitingOn", None)
        sb.update("social_videos", {"id": v["id"]}, {"status": "with_editor", "editor_brief": eb})
        log.append(f"edit: {c['name']}: {v['title']} -> {ask_for_edit(sb, c, v)}")
        edits[v["id"]] = edit_signature(dict(v, editor_brief=eb), oc.get(v["id"], 0))
    for v in ej["waiting"]:
        eb = v.get("editor_brief") or {}
        if eb.get("waitingOn") != "editing guidelines":
            sb.update("social_videos", {"id": v["id"]}, {"editor_brief": dict(eb, waitingOn="editing guidelines")})
            log.append(f"edit waiting on editing guidelines: {v['title']}")
    for v in ej["revise"]:
        c = byid.get(v["client_id"])
        if not c: continue
        first = v["id"] not in edits
        log.append(f"edit{'' if first else ' revise'}: {c['name']}: {v['title']} -> {ask_for_edit(sb, c, v, revise=not first, notes=edit_notes(sb, v))}")
        edits[v["id"]] = edit_signature(v, oc.get(v["id"], 0))
    try:
        log += sync_agents(sb)
    except Exception as e:
        log.append(f"agent room: {e}")
    for fn in (notify_tait, notify_clients):
        try:
            log += fn(sb, st)
        except Exception as e:
            log.append(f"{fn.__name__}: {e}")
    STATE.write_text(json.dumps(st, indent=2))
    if verbose:
        print("\n".join(log) or "Nothing new.")
    return log


# ── Telegram as Tait's main channel (Tait, 2026-10-21) ──────────────────
# "i want to use telegram as my main source of communication, not just a
# place to generate video ideas." A message that starts with "idea" (or 💡)
# is filed as a content idea; everything else goes to Claude's inbox, which
# the Claude session working with Tait reads and answers through the bot.
INBOX = HOME / ".config" / "fully-social" / "telegram-inbox.jsonl"


def is_idea(text):
    return bool(re.match(r"^\s*(idea\b|💡)", text or "", flags=re.I))


def strip_idea(text):
    return re.sub(r"^\s*(idea\b\s*[:\-—]?\s*|💡\s*)", "", text or "", flags=re.I).strip()


def to_inbox(entry):
    INBOX.parent.mkdir(parents=True, exist_ok=True)
    with INBOX.open("a") as f:
        f.write(json.dumps(dict(entry, at=now(), read=False)) + "\n")


def read_inbox(mark=True):
    if not INBOX.exists():
        return []
    rows = [json.loads(l) for l in INBOX.read_text().splitlines() if l.strip()]
    unread = [r for r in rows if not r.get("read")]
    if mark and unread:
        for r in rows:
            r["read"] = True
        INBOX.write_text("".join(json.dumps(r) + "\n" for r in rows))
    return unread


def telegram_send(text, photo=None):
    env, st = read_env(CONFIG), load_state()
    token, chat = env.get("TELEGRAM_BOT_TOKEN"), st.get("telegram_chat")
    if not token or not chat:
        raise RuntimeError("Telegram isn't paired yet (bridge.py telegram pair).")
    if photo:
        subprocess.run(["curl", "-s", "-F", f"chat_id={chat}", "-F", f"photo=@{photo}", "-F", f"caption={text[:1000]}",
                        f"https://api.telegram.org/bot{token}/sendPhoto"], check=True, capture_output=True)
    else:
        for i in range(0, len(text), 4000):
            tg("sendMessage", token, {"chat_id": chat, "text": text[i:i + 4000]})


# ── Telegram: text ideas from the phone ─────────────────────────────────
def tg(method, token, params=None, raw_url=None):
    url = raw_url or f"https://api.telegram.org/bot{token}/{method}"
    data = urllib.parse.urlencode(params).encode() if params else None
    with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=60) as r:
        body = r.read()
    return body if raw_url else json.loads(body)


def tg_file(token, file_id):
    info = tg("getFile", token, {"file_id": file_id})["result"]
    return pathlib.Path(info["file_path"]).name, tg(None, token, raw_url=f"https://api.telegram.org/file/bot{token}/{info['file_path']}")


def handle_telegram(sb, st, verbose=True):
    env = read_env(CONFIG)
    token = env.get("TELEGRAM_BOT_TOKEN")
    if not token or "paste" in token.lower():
        return []
    log, owner = [], st.get("telegram_chat")
    upd = tg("getUpdates", token, {"offset": st.get("telegram_offset", 0), "timeout": 0})
    clients = sb.select("social_clients", "select=id,name,slug&status=eq.active")
    for u in upd.get("result", []):
        st["telegram_offset"] = u["update_id"] + 1
        msg = u.get("message") or {}
        chat = (msg.get("chat") or {}).get("id")
        text = (msg.get("text") or msg.get("caption") or "").strip()
        def reply(s):
            try:
                tg("sendMessage", token, {"chat_id": chat, "text": s})
            except Exception:
                pass   # the idea is saved either way; a missed reply isn't worth stopping for
        if not owner:
            if st.get("telegram_code") and text.endswith(st["telegram_code"]):
                st["telegram_chat"] = owner = chat
                st.pop("telegram_code", None)
                reply("Paired. Text me anything and Claude reads it. For a content idea, start with idea, e.g.\nidea Grad Gig: snow shovelling for seniors")
            continue
        if chat != owner:
            continue
        spoken = None
        if (msg.get("voice") or msg.get("audio")) and not text:
            try:   # voice notes: transcribe first, then route like text
                fid = (msg.get("voice") or msg.get("audio"))["file_id"]
                name, data = tg_file(token, fid)
                CACHE.mkdir(parents=True, exist_ok=True)
                local = CACHE / f"tg-{fid[-12:]}-{name}"
                local.write_bytes(data)
                spoken = transcribe_file(local)
            except Exception as e:
                reply(f"I couldn't hear that voice note: {e}")
                continue
        said = text or spoken or ""
        pending = st.get("telegram_pending")
        if not is_idea(said) and not pending:
            files = []
            if msg.get("photo") or msg.get("document"):
                try:
                    fid = msg["photo"][-1]["file_id"] if msg.get("photo") else msg["document"]["file_id"]
                    name, data = tg_file(token, fid)
                    CACHE.mkdir(parents=True, exist_ok=True)
                    local = CACHE / f"tg-{fid[-12:]}-{name}"
                    local.write_bytes(data)
                    files.append(str(local))
                except Exception:
                    pass
            to_inbox({"text": said, "voice": bool(spoken), "files": files})
            reply("Got it, Claude has your message.")
            log.append("telegram: message for Claude")
            continue
        st.pop("telegram_pending", None)
        if spoken and not text:
            msg = dict(msg); msg.pop("voice", None); msg.pop("audio", None)
        text = strip_idea(said) if is_idea(said) else said
        client, body = match_client(text, clients)
        if not client and pending:
            client, _ = match_client(text + ": x", clients)
            if client:
                body, msg = pending["body"], pending["msg"]
        links = re.findall(r"https?://\S+", body or "")
        attachments = []
        try:
            if msg.get("voice") or msg.get("audio"):
                fid = (msg.get("voice") or msg.get("audio"))["file_id"]
                name, data = tg_file(token, fid)
                CACHE.mkdir(parents=True, exist_ok=True)
                local = CACHE / f"tg-{fid[-12:]}-{name}"
                local.write_bytes(data)
                spoken = transcribe_file(local)
                if not client:
                    client, spoken_body = match_client(spoken, clients)
                    spoken = spoken_body if client else spoken
                body = (body + "\n\n" if body else "") + spoken
            if msg.get("photo") or msg.get("document"):
                fid = msg["photo"][-1]["file_id"] if msg.get("photo") else msg["document"]["file_id"]
                name, data = tg_file(token, fid)
                path = f"{client['id'] if client else 'inbox'}/{int(time.time())}-{name}"
                sb.upload("ideas", path, data, "image/jpeg" if msg.get("photo") else (msg["document"].get("mime_type") or "application/octet-stream"))
                attachments.append({"path": path, "kind": "image" if msg.get("photo") else "file", "name": name})
        except Exception as e:
            reply(f"I couldn't read that: {e}")
            continue
        if not client:
            st["telegram_pending"] = {"body": body, "msg": msg}
            st["telegram_pending"] = {"body": body, "msg": msg}
            reply("Which client is this idea for? Reply with the name: " + ", ".join(c["name"] for c in clients))
            continue
        if not (body or attachments or links):
            reply("Send the idea after the client's name, e.g. idea Grad Gig: snow shovelling for seniors")
            continue
        sb.insert("social_ideas", {"client_id": client["id"], "title": idea_title(body) if body else "Idea from Telegram",
                                   "body": body or None, "links": links, "attachments": attachments,
                                   "source": "phone", "created_by": "tait"})
        reply(f"Added to {client['name']}'s ideas ✓")
        log.append(f"telegram idea: {client['name']}")
    STATE.write_text(json.dumps(st, indent=2))
    return log


# ── YouTube outliers (free Data API key) ────────────────────────────────
def youtube_outliers(key, query, days=180, limit=25):
    """Search the niche, then score each video against its channel's usual
    views (channel views / videos). Outlier = several times its channel's norm."""
    api = "https://www.googleapis.com/youtube/v3/"
    after = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    get = lambda path, **q: json.loads(urllib.request.urlopen(api + path + "?" + urllib.parse.urlencode(dict(q, key=key)), timeout=30).read())
    found = get("search", part="snippet", q=query, type="video", order="viewCount", publishedAfter=after, maxResults=min(50, limit * 2))
    vids = [i["id"]["videoId"] for i in found.get("items", [])]
    if not vids:
        return "No videos found."
    stats = get("videos", part="statistics,snippet", id=",".join(vids)).get("items", [])
    chans = {c["id"]: c for c in get("channels", part="statistics,snippet", id=",".join({v["snippet"]["channelId"] for v in stats})).get("items", [])}
    rows = []
    for v in stats:
        views = int(v["statistics"].get("viewCount", 0))
        ch = chans.get(v["snippet"]["channelId"], {}).get("statistics", {})
        norm = int(ch.get("viewCount", 0)) / max(1, int(ch.get("videoCount", 1)))
        rows.append((views / max(1, norm), views, v["snippet"]["title"], v["snippet"]["channelTitle"], v["id"]))
    rows.sort(reverse=True)
    return "\n".join(f"{x:.1f}x · {views:,} views · {title} · {ch} · https://youtu.be/{vid}" for x, views, title, ch, vid in rows[:limit])


# ── Assets: every asset across Fully Launched, and each client's own ─────
# Tait, 2026-10-22: Assets has Music, Sound effects, LUTs/Powergrades,
# Motion graphics and Fonts, in folders like on the drive; any asset can be
# a favourite for a client, and the editors pull from a folder of that
# client's favourites. The files stay on this Mac (editor/public/clients/ is
# gitignored); the page gets a small preview in the private 'library' bucket.
REPO = pathlib.Path(__file__).resolve().parents[1]
ASSET_ROOT = REPO / "editor/public/clients"
LIBRARY_DIRS = [("music", ASSET_ROOT / "_music"), ("sfx", ASSET_ROOT / "_sfx/library"), ("lut", ASSET_ROOT / "_luts"),
                ("motion", ASSET_ROOT / "_motion"), ("font", ASSET_ROOT / "_fonts")]
ASSET_LABEL = {"music": "Music", "sfx": "Sound effects", "lut": "LUTs and Powergrades", "motion": "Motion graphics", "font": "Fonts"}
AUDIO = {".mp3", ".wav", ".m4a", ".aif", ".aiff", ".flac", ".ogg", ".aac"}
ASSET_EXT = {"music": AUDIO, "sfx": AUDIO, "lut": {".cube", ".3dl", ".drx", ".dpx", ".look", ".lut", ".dctl"},
             "motion": {".mov", ".mp4", ".webm", ".m4v", ".mogrt", ".gif", ".png", ".json", ".aep", ".drfx", ".setting"},
             "font": {".ttf", ".otf", ".woff", ".woff2"}}
FONT_MIME = {".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}


def audio_seconds(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True)
    try:
        return round(float(out.stdout.strip()), 1)
    except ValueError:
        return None


def asset_preview(sb, kind, f, rel):
    """A small preview the page can play or show: audio as MP3 (music: the
    first 60 s; sound effects: up to 15 s), motion as a short MP4, a font
    file as itself. LUTs and project files have none."""
    ext = f.suffix.lower()
    key = uuid.uuid5(uuid.NAMESPACE_URL, rel).hex
    if kind in ("music", "sfx"):
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "p.mp3"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-t", "60" if kind == "music" else "15", "-ac", "2", "-b:a", "96k", str(out)], check=True)
            sb.upload("library", f"{kind}/{key}.mp3", out.read_bytes(), "audio/mpeg")
        return f"{kind}/{key}.mp3"
    if kind == "motion" and ext in {".mov", ".mp4", ".webm", ".m4v", ".gif"}:
        with tempfile.TemporaryDirectory() as tmp:
            out = pathlib.Path(tmp) / "p.mp4"
            r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), "-t", "10", "-vf", "scale=480:-2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                                "-movflags", "+faststart", str(out)], capture_output=True)
            if r.returncode == 0:
                sb.upload("library", f"motion/{key}.mp4", out.read_bytes(), "video/mp4")
                return f"motion/{key}.mp4"
    if kind == "font" and ext in FONT_MIME:
        sb.upload("library", f"font/{key}{ext}", f.read_bytes(), FONT_MIME[ext])
        return f"font/{key}{ext}"
    return None


def index_asset(sb, kind, root, f, made_by=None):
    rel = str(f.relative_to(REPO))
    folder_path = str(f.parent.relative_to(root)) if f.parent != root else ""
    row = {"kind": kind, "name": f.stem, "path": rel, "folder": f.parent.name if folder_path else root.name,
           "folder_path": folder_path, "file_type": f.suffix.lower().lstrip("."), "preview_path": asset_preview(sb, kind, f, rel),
           "duration_s": audio_seconds(f) if kind in ("music", "sfx", "motion") else None}
    if made_by:
        row["made_by"] = made_by
    return sb.insert("social_style_assets", row)[0]


def sync_assets(sb):
    """Index every asset folder into social_style_assets (new files only)."""
    known = {r["path"] for r in sb.select("social_style_assets", "select=path")}
    added = 0
    for kind, root in LIBRARY_DIRS:
        root.mkdir(parents=True, exist_ok=True)
        for f in sorted(root.rglob("*")):
            if not f.is_file() or f.suffix.lower() not in ASSET_EXT[kind] or f.name.startswith("._"):
                continue
            if str(f.relative_to(REPO)) in known:
                continue
            index_asset(sb, kind, root, f)
            added += 1
    return f"Assets: {added} new file(s) added ({len(known) + added} in all)."


def find_asset(sb, ref):
    """An asset by id, path, or name (a name has to match just one)."""
    q = urllib.parse.quote(ref)
    if re.fullmatch(r"[0-9a-f-]{36}", ref):
        rows = sb.select("social_style_assets", f"select=*&id=eq.{ref}")
    else:
        rows = sb.select("social_style_assets", f"select=*&path=eq.{q}") or sb.select("social_style_assets", f"select=*&name=ilike.{q}")
    if len(rows) != 1:
        sys.exit(f"{'No asset' if not rows else str(len(rows)) + ' assets'} matching '{ref}'." + (" Use its id or path:\n" + "\n".join(f"  {r['id']} {r['path']}" for r in rows[:10]) if rows else ""))
    return rows[0]


def export_client_assets(sb, c):
    """editor/public/clients/<slug>/_assets/<Kind>/<folder>/<file>: links to
    every asset that's a favourite for the client, rebuilt each time, so an
    editor opens one folder of just that client's assets."""
    out = ASSET_ROOT / c["slug"] / "_assets"
    if out.exists():
        for p in sorted(out.rglob("*"), reverse=True):
            p.unlink() if p.is_symlink() or p.is_file() else p.rmdir()
    ids = [r["asset_id"] for r in sb.select("social_client_assets", f"select=asset_id&client_id=eq.{c['id']}")]
    rows = sb.select("social_style_assets", f"select=kind,folder_path,path&id=in.({','.join(ids)})") if ids else []
    n = 0
    for r in rows:
        src = REPO / r["path"]
        if not src.exists():
            continue
        dest = out / ASSET_LABEL.get(r["kind"], r["kind"]) / (r.get("folder_path") or "") / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.symlink_to(src)
        n += 1
    return out, n


# ── commands agents use ─────────────────────────────────────────────────
def client_by_slug(sb, slug):
    rows = sb.select("social_clients", f"select=*&slug=eq.{urllib.parse.quote(slug)}")
    if not rows:
        sys.exit(f"No client with the portal address '{slug}'")
    return rows[0]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Fully Social bridge (Paperclip <-> dashboard)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("check")
    w = sub.add_parser("watch"); w.add_argument("--every", type=int, default=120)
    for name in ("client", "transcript"):
        p = sub.add_parser(name); p.add_argument("action", choices=["get"]); p.add_argument("--client", required=True)
    q = sub.add_parser("questions"); q.add_argument("action", choices=["put"]); q.add_argument("--client", required=True); q.add_argument("--file", required=True)
    d = sub.add_parser("doc"); d.add_argument("action", choices=["put"]); d.add_argument("--client", required=True)
    d.add_argument("--kind", required=True, choices=DOC_KINDS); d.add_argument("--file", required=True)
    d.add_argument("--status", default="on_desk", choices=["draft", "on_desk"]); d.add_argument("--built-by", default=None); d.add_argument("--sources", default=None)
    dg = sub.add_parser("doc-get"); dg.add_argument("--client", required=True); dg.add_argument("--kind", required=True, choices=DOC_KINDS)
    m = sub.add_parser("moodboard"); m.add_argument("action", choices=["get", "used", "place"]); m.add_argument("--client", required=True, help="a portal address, or 'house'")
    m.add_argument("--id", help="place: the item's id"); m.add_argument("--section", choices=MOOD_SECTIONS, help="place: its group")
    s = sub.add_parser("assets", help="the Assets library: sync, list, add a file, favourite one for a client, build a client's folder")
    s.add_argument("action", choices=["sync", "list", "add", "favorite", "unfavorite", "export"]); s.add_argument("--kind", choices=["music", "sfx", "lut", "motion", "font"])
    s.add_argument("--client", help="a portal address: list/favorite/unfavorite/export for that client")
    s.add_argument("--asset", help="favorite/unfavorite: the asset's id, path or name")
    s.add_argument("--file", help="add: the file to put in the library")
    s.add_argument("--into", default="", help="add: the folder inside the category, e.g. 'Whooshes' or 'Camera sounds/shutter clicks'")
    s.add_argument("--by", help="add: who made it, e.g. 'Sound Designer'")
    s.add_argument("--folder"); s.add_argument("--favourites", action="store_true")
    ia = sub.add_parser("idea"); ia.add_argument("action", choices=["add"]); ia.add_argument("--client", required=True)
    ia.add_argument("--title", required=True); ia.add_argument("--body"); ia.add_argument("--source", default="research", choices=["tait", "phone", "research", "sandcastles", "client"])
    ia.add_argument("--source-detail"); ia.add_argument("--format"); ia.add_argument("--why"); ia.add_argument("--link", action="append", default=[])
    ia.add_argument("--requested-post-date"); ia.add_argument("--by", default=None)
    il = sub.add_parser("ideas"); il.add_argument("action", choices=["list"]); il.add_argument("--client", required=True); il.add_argument("--status")
    pp = sub.add_parser("plan"); pp.add_argument("action", choices=["put"]); pp.add_argument("--client", required=True)
    pp.add_argument("--month", required=True, help="YYYY-MM"); pp.add_argument("--file", required=True); pp.add_argument("--brief")
    yt = sub.add_parser("youtube"); yt.add_argument("action", choices=["outliers"]); yt.add_argument("--query", required=True)
    yt.add_argument("--days", type=int, default=180); yt.add_argument("--max", type=int, default=25)
    tgp = sub.add_parser("telegram"); tgp.add_argument("action", choices=["pair", "send", "inbox"])
    tgp.add_argument("text", nargs="?"); tgp.add_argument("--photo")
    sj = sub.add_parser("start", help="start a stage by hand for any client (existing ones too)")
    sj.add_argument("job", choices=["questions", "documents", "style", "research", "plan"]); sj.add_argument("--client", required=True)
    sj.add_argument("--size", type=int, default=20, help="plan size"); sj.add_argument("--month", help="YYYY-MM (plan; default next month)")
    vd = sub.add_parser("video"); vd.add_argument("action", choices=["deliver"]); vd.add_argument("--id", required=True); vd.add_argument("--file", required=True)
    cp = sub.add_parser("captions"); cp.add_argument("action", choices=["put"]); cp.add_argument("--id", required=True)
    cp.add_argument("--caption"); cp.add_argument("--on-screen"); cp.add_argument("--cover")
    fw = sub.add_parser("footage"); fw.add_argument("action", choices=["where"]); fw.add_argument("--id", required=True)
    cd = sub.add_parser("card"); cd.add_argument("action", choices=["get", "put", "ready"]); cd.add_argument("--id", required=True)
    cd.add_argument("--file"); cd.add_argument("--score", type=int); cd.add_argument("--brief")
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv[:2] == ["doc", "get"]:   # `doc get` reads like `doc put`
        argv = ["doc-get"] + argv[2:]
    a = ap.parse_args(argv)

    sb = Supabase(*config())
    if a.cmd == "status":
        clients = sb.select("social_clients", "select=id")
        print(f"Connected to Supabase: {len(clients)} client(s). State: {STATE}")
        try:
            print("Groq key: found" if groq_key() else "")
        except RuntimeError as e:
            print(e)
        try:
            agent_id("Account Manager"); print("Paperclip: running")
        except Exception:
            print("Paperclip: not running (start it with `npx paperclipai run`)")
    elif a.cmd == "check":
        check(sb)
    elif a.cmd == "watch":
        print(f"Watching every {a.every}s. Ctrl+C to stop.")
        while True:
            try:
                for line in check(sb, verbose=False):
                    print(time.strftime("%H:%M"), line, flush=True)
            except Exception as e:
                print(time.strftime("%H:%M"), "error:", e, flush=True)
            time.sleep(a.every)
    elif a.cmd == "client":
        c = client_by_slug(sb, a.client)
        ob = sb.select("social_client_onboarding", f"select=brand,answers,voice_memo_path,completed_at&client_id=eq.{c['id']}")
        docs = sb.select("social_client_generated_docs", f"select=kind,status,updated_at&client_id=eq.{c['id']}")
        print(json.dumps({"client": c, "onboarding": ob[0] if ob else None, "documents": docs}, indent=2, default=str))
    elif a.cmd == "transcript":
        c = client_by_slug(sb, a.client)
        ob = sb.select("social_client_onboarding", f"select=transcript&client_id=eq.{c['id']}")
        print((ob[0].get("transcript") if ob else "") or "(no transcript yet)")
    elif a.cmd == "questions":
        c = client_by_slug(sb, a.client)
        qs = questions_from_text(pathlib.Path(a.file).read_text())
        if not qs:
            sys.exit("No questions found: use ## Section and - question lines")
        sb.update("social_clients", {"id": c["id"]}, {"onboarding_questions": qs})
        print(f"Saved {sum(len(s['items']) for s in qs)} questions in {len(qs)} sections for {c['name']}.")
    elif a.cmd == "idea":
        c = client_by_slug(sb, a.client)
        row = {"client_id": c["id"], "title": a.title, "body": a.body, "source": a.source, "source_detail": a.source_detail,
               "format": a.format, "why": a.why, "links": a.link, "created_by": a.by or ("tait" if a.source == "tait" else "Content Researcher")}
        if a.requested_post_date:
            row["requested_post_date"] = a.requested_post_date
        r = sb.insert("social_ideas", row)
        print(f"Added idea {r[0]['id']} to {c['name']}.")
    elif a.cmd == "ideas":
        c = client_by_slug(sb, a.client)
        q = f"select=id,title,body,source,source_detail,format,why,status,score,requested_post_date,special_request,links,created_at&client_id=eq.{c['id']}&order=created_at"
        if a.status: q += f"&status=eq.{a.status}"
        rows = sb.select("social_ideas", q)
        for r in rows:
            print(json.dumps(r, default=str))
        print(f"{len(rows)} idea(s).", file=sys.stderr)
    elif a.cmd == "plan":
        c = client_by_slug(sb, a.client)
        month = a.month[:7] + "-01"
        items = json.loads(pathlib.Path(a.file).read_text())
        brief = pathlib.Path(a.brief).read_text() if a.brief else None
        plan = sb.insert("social_monthly_plans", {"client_id": c["id"], "month": month, "status": "on_desk", "brief_md": brief}, upsert_on="client_id,month")[0]
        ids = []
        for it in items:
            if it.get("idea_id"):
                ids.append(it["idea_id"])
                patch = {k: it[k] for k in ("format", "why", "score") if it.get(k) is not None}
                if patch: sb.update("social_ideas", {"id": it["idea_id"]}, patch)
            else:
                r = sb.insert("social_ideas", {"client_id": c["id"], "title": it["title"], "body": it.get("body"), "source": it.get("source", "research"),
                                               "format": it.get("format"), "why": it.get("why"), "score": it.get("score"), "created_by": "Content Strategist"})
                ids.append(r[0]["id"])
        rows = {r["id"]: r for r in sb.select("social_ideas", f"select=id,requested_post_date&id=in.({','.join(ids)})")} if ids else {}
        requested = [rows[i]["requested_post_date"] for i in ids if rows.get(i, {}).get("requested_post_date")]
        dates = plan_dates(month, len(ids), requested)
        free = [d for d in dates if d not in requested]
        for i in ids:
            req = rows.get(i, {}).get("requested_post_date")
            day = str(req)[:10] if req else free.pop(0)
            sb.update("social_ideas", {"id": i}, {"plan_id": plan["id"], "status": "in_plan", "planned_post_date": day})
        print(f"{c['name']}: {len(ids)} ideas for {a.month} on Tait's desk.")
    elif a.cmd == "youtube":
        key = read_env(CONFIG).get("YOUTUBE_API_KEY")
        if not key: sys.exit(f"Add YOUTUBE_API_KEY to {CONFIG} (a free key from Google Cloud).")
        print(youtube_outliers(key, a.query, a.days, a.max))
    elif a.cmd == "telegram" and a.action == "send":
        telegram_send(a.text or sys.stdin.read(), a.photo); print("sent")
    elif a.cmd == "telegram" and a.action == "inbox":
        msgs = read_inbox()
        print("\n\n".join(f"[{m['at'][:16]}]{' (voice)' if m.get('voice') else ''} {m['text']}" + "".join(f"\n  file: {f}" for f in m.get("files", [])) for m in msgs) or "No new messages.")
    elif a.cmd == "telegram":
        st = load_state()
        code = f"{uuid.uuid4().int % 1000000:06d}"
        st["telegram_code"] = code; st.pop("telegram_chat", None); STATE.write_text(json.dumps(st, indent=2))
        print(f"In Telegram, open your bot and send:  /start {code}\nThe bridge pairs on its next check.")
    elif a.cmd == "start":
        c = client_by_slug(sb, a.client)
        if a.job == "questions": tid = ask_for_questions(sb, c)
        elif a.job == "documents": tid = ask_for_documents(sb, c)
        elif a.job == "style": tid = ask_for_style(sb, c)
        elif a.job == "research": tid = ask_for_research(sb, c)
        else: tid = ask_for_plan(sb, c, (a.month + "-01") if a.month else months_ahead(), a.size)
        print(f"Started {a.job} for {c['name']}: {tid}")
    elif a.cmd == "video":
        v = sb.select("social_videos", f"select=*&id=eq.{a.id}")[0]
        c = sb.select("social_clients", f"select=id,name,slug&id=eq.{v['client_id']}")[0]
        src = pathlib.Path(a.file)
        if not src.exists(): sys.exit(f"No file at {src}")
        vers = sb.select("social_video_versions", f"select=version&video_id=eq.{v['id']}&order=version.desc&limit=1")
        n = (vers[0]["version"] + 1) if vers else 1
        path = f"{v['client_id']}/{v['id']}/{int(time.time() * 1000)}-v{n}-{re.sub(r'[^A-Za-z0-9._-]+', '_', src.name)}"
        sb.upload("review", path, src.read_bytes(), "video/mp4")
        op = sb.select("social_operators", "select=id&limit=1")[0]["id"]
        st = load_state()
        drive_note = ""
        link = (sb.select("social_drive_folder_links", f"select=final_edits&client_id=eq.{v['client_id']}") or [{}])[0].get("final_edits")
        folder = find_drive_folder(folder_id_of(link), st) if link else None
        if folder:
            title = re.sub(r'[\\/:*?"<>|]+', "", v.get("title") or "video").strip()[:80]
            dest = folder / f"{title} v{n}{src.suffix}"
            dest.write_bytes(src.read_bytes())
            drive_note = f" Copy in Drive: {dest.name}."
            STATE.write_text(json.dumps(st, indent=2))
        sb.insert("social_video_versions", {"video_id": v["id"], "version": n, "file_name": src.name, "storage_path": path, "created_by": op})
        eb = dict(v.get("editor_brief") or {}); eb.pop("waitingOn", None)
        sb.update("social_videos", {"id": v["id"]}, {"status": "in_review", "editor_brief": eb})
        if n == 1 or not eb.get("captionDraft"):
            try: ask_for_captions(sb, c, v)
            except Exception: pass
        print(f"v{n} of {v['title']} is on Tait's desk (Videos to review).{drive_note}")
    elif a.cmd == "captions":
        v = sb.select("social_videos", f"select=editor_brief&id=eq.{a.id}")[0]
        eb = dict(v.get("editor_brief") or {})
        eb["captionDraft"] = {k: x for k, x in (("caption", a.caption), ("onScreenCaption", a.on_screen), ("cover", a.cover)) if x}
        sb.update("social_videos", {"id": a.id}, {"editor_brief": eb})
        print("Saved the caption draft for Tait.")
    elif a.cmd == "footage":
        v = sb.select("social_videos", f"select=client_id,editor_brief&id=eq.{a.id}")[0]
        st = load_state()
        url = (v.get("editor_brief") or {}).get("rawFootageUrl") or (sb.select("social_drive_folder_links", f"select=footage_uploads&client_id=eq.{v['client_id']}") or [{}])[0].get("footage_uploads")
        folder = find_drive_folder(folder_id_of(url), st) if url else None
        STATE.write_text(json.dumps(st, indent=2))
        print(folder or f"Couldn't find it on this Mac (Drive link: {url}).")
    elif a.cmd == "card":
        rows = sb.select("social_videos", f"select=*&id=eq.{a.id}")
        if not rows: sys.exit("No card with that id.")
        v = rows[0]
        if a.action == "get":
            c = sb.select("social_clients", f"select=name,slug,client_system&id=eq.{v['client_id']}")[0]
            eb = v.get("editor_brief") or {}
            out = {"client": c, "title": v["title"], "idea": v.get("concept"), "format": eb.get("format"), "why": eb.get("why"),
                   "filmed_by": v.get("filmed_by"), "status": v["status"],
                   "timeline": timeline(v["post_date"]) if v.get("post_date") else None,
                   "tait_send_back_notes": eb.get("scriptNotes") or [], "client_requested_changes": v.get("note"),
                   "current": {k: v.get(k) for k in ("hook", "outline", "body", "camera_questions", "filming_instructions")}}
            print(json.dumps(out, indent=2, default=str))
        elif a.action == "put":
            data = json.loads(pathlib.Path(a.file).read_text())
            m = {"hook": "hook", "outline": "outline", "script": "body", "camera_questions": "camera_questions", "filming_instructions": "filming_instructions", "title": "title"}
            patch = {m[k]: v2 for k, v2 in data.items() if k in m}
            sb.update("social_videos", {"id": a.id}, patch)
            print(f"Saved {', '.join(patch)} on {v['title']}.")
        else:
            if v["status"] != "scripting": sys.exit(f"That card is {v['status']}, not in Scripting.")
            if not (v.get("hook") and v.get("body")): sys.exit("Save the hook and script first (card put).")
            eb = v.get("editor_brief") or {}
            if a.score is not None: eb["scriptScore"] = a.score
            if a.brief: eb["scriptBrief"] = a.brief
            if v.get("note"):   # keep the client's request with the card's history
                eb["clientChanges"] = (eb.get("clientChanges") or []) + [{"note": v["note"], "at": now()}]
            sb.update("social_videos", {"id": a.id}, {"status": "script_review", "editor_brief": eb, "note": None})
            print(f"{v['title']} is in Tait's Scripts to review.")
    elif a.cmd == "doc-get":
        c = client_by_slug(sb, a.client)
        rows = sb.select("social_client_generated_docs", f"select=status,body_md,updated_at&client_id=eq.{c['id']}&kind=eq.{a.kind}")
        if not rows:
            sys.exit(f"{c['name']} has no {a.kind} yet.")
        print(f"<!-- {a.kind} · {rows[0]['status']} · {rows[0]['updated_at']} -->\n" + rows[0]["body_md"])
    elif a.cmd == "moodboard":
        house = a.client == "house"
        cid = None if house else client_by_slug(sb, a.client)["id"]
        filt = "client_id=is.null" if house else f"client_id=eq.{cid}"
        if a.action == "used":
            sb._req("PATCH", f"/rest/v1/social_moodboard_items?{filt}&used_at=is.null", {"used_at": now()}, {"Prefer": "return=minimal"})
            if house:
                st = load_state(); st.pop("house_asked_open", None); STATE.write_text(json.dumps(st, indent=2))
            print("Marked used."); return
        if a.action == "place":
            if not (a.id and a.section):
                sys.exit("place needs --id and --section")
            sb._req("PATCH", f"/rest/v1/social_moodboard_items?id=eq.{a.id}&{filt}", {"section": a.section}, {"Prefer": "return=minimal"})
            print(f"Placed in {a.section}."); return
        items = sb.select("social_moodboard_items", f"select=*&{filt}&order=created_at")
        folder = HOME / ".cache" / "fully-social" / "moodboards" / a.client
        folder.mkdir(parents=True, exist_ok=True)
        for it in items:
            sec = it.get("section") or "new"
            line = f"- [{sec} · {it['kind']}] {it.get('name') or ''}  id={it['id']}"
            if it.get("storage_path"):
                local = folder / pathlib.Path(it["storage_path"]).name
                if not local.exists():
                    local.write_bytes(sb.download("moodboards", it["storage_path"]))
                line += f" -> {local}"
            if it.get("url"):
                line += f" -> {it['url']}"
            if it.get("palette"):
                line += f"\n    colours: {' '.join(it['palette'])}"
            if it.get("note"):
                line += f"\n    {'Client' if it.get('added_by_role') == 'client' else 'Tait'}: {it['note']}"
            elif it.get("added_by_role") == "client":
                line += "\n    (added by the client)"
            if not it.get("used_at"):
                line += "  (new)"
            print(line)
        print(f"{len(items)} item(s). Files in {folder}" if items else "The moodboard is empty.")
    elif a.cmd == "assets":
        if a.action == "sync":
            print(sync_assets(sb))
        elif a.action == "add":
            if not (a.kind and a.file):
                sys.exit("add needs --kind and --file (and --into for the folder).")
            src, root = pathlib.Path(a.file).expanduser(), dict(LIBRARY_DIRS)[a.kind]
            if src.suffix.lower() not in ASSET_EXT[a.kind]:
                sys.exit(f"{src.suffix or 'That file'} isn't a {ASSET_LABEL[a.kind]} file ({', '.join(sorted(ASSET_EXT[a.kind]))}).")
            dest = root / a.into.strip("/") / src.name
            if dest.exists():
                sys.exit(f"There's already a {dest.name} in {ASSET_LABEL[a.kind]}/{a.into}.")
            dest.parent.mkdir(parents=True, exist_ok=True)
            import shutil
            shutil.copy2(src, dest)
            r = index_asset(sb, a.kind, root, dest, made_by=a.by)
            print(f"Added {dest.name} to {ASSET_LABEL[a.kind]}/{a.into or ''} ({r['id']}).")
            if a.client:
                c = client_by_slug(sb, a.client)
                sb.insert("social_client_assets", {"client_id": c["id"], "asset_id": r["id"], "added_by": a.by or "tait"}, upsert_on="client_id,asset_id")
                out, n = export_client_assets(sb, c)
                print(f"…and to {c['name']}'s assets ({n} in {out.relative_to(REPO)}).")
        elif a.action in ("favorite", "unfavorite"):
            if not (a.client and a.asset):
                sys.exit(f"{a.action} needs --client and --asset.")
            c, r = client_by_slug(sb, a.client), find_asset(sb, a.asset)
            if a.action == "favorite":
                sb.insert("social_client_assets", {"client_id": c["id"], "asset_id": r["id"], "added_by": a.by or "tait"}, upsert_on="client_id,asset_id")
            else:
                sb.delete("social_client_assets", {"client_id": c["id"], "asset_id": r["id"]})
            out, n = export_client_assets(sb, c)
            print(f"{'Added' if a.action == 'favorite' else 'Removed'} {r['name']} ({ASSET_LABEL.get(r['kind'], r['kind'])}) {'to' if a.action == 'favorite' else 'from'} {c['name']}'s assets. Their folder: {out.relative_to(REPO)} ({n} files).")
        elif a.action == "export":
            for c in ([client_by_slug(sb, a.client)] if a.client else sb.select("social_clients", "select=*")):
                out, n = export_client_assets(sb, c)
                print(f"{c['name']}: {n} file(s) in {out.relative_to(REPO)}")
        elif a.client:
            c = client_by_slug(sb, a.client)
            ids = [r["asset_id"] for r in sb.select("social_client_assets", f"select=asset_id&client_id=eq.{c['id']}")]
            rows = sb.select("social_style_assets", f"select=kind,name,folder_path,path&id=in.({','.join(ids)})&order=kind,folder_path,name") if ids else []
            for r in rows:
                if not a.kind or r["kind"] == a.kind:
                    print(f"{ASSET_LABEL.get(r['kind'], r['kind'])} · {r.get('folder_path') or ''} · {r['name']} · {r['path']}")
            print(f"{len(rows)} asset(s) for {c['name']}.", file=sys.stderr)
        else:
            q = "select=kind,name,folder,path,tags,rating,duration_s&order=folder,name&rating=not.eq.never"
            q = q.replace("&rating=not.eq.never", "") + "&or=(rating.is.null,rating.eq.favourite)"
            if a.kind: q += f"&kind=eq.{a.kind}"
            if a.folder: q += f"&folder=eq.{urllib.parse.quote(a.folder)}"
            if a.favourites: q += "&rating=eq.favourite"
            for r in sb.select("social_style_assets", q):
                print(f"{'★ ' if r.get('rating') == 'favourite' else ''}{r['kind']} · {r.get('folder') or ''} · {r['name']} · {r.get('duration_s') or '?'}s · {r['path']}")
    elif a.cmd == "doc":
        c = client_by_slug(sb, a.client)
        row = {"client_id": c["id"], "kind": a.kind, "title": DOC_TITLES[a.kind],
               "body_md": pathlib.Path(a.file).read_text(), "status": a.status, "built_by": a.built_by, "sources": a.sources,
               "approved_at": None, "approved_by": None}
        sb.insert("social_client_generated_docs", row, upsert_on="client_id,kind")
        print(f"Saved {a.kind} for {c['name']} ({'on Tait’s desk' if a.status == 'on_desk' else 'draft'}).")


if __name__ == "__main__":
    main()
