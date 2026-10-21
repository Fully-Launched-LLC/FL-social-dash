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
                out[k.strip()] = v.strip().strip('"').strip("'")
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
    desc = f"""**{c['name']}**: {what} (Unify the System stage 3: the client's style guide). You lead; bring in the **Motion Graphics Designer** (motion graphics, text styles) and the **Content Strategist** (video types, pacing) as you need them.

1. Read: their approved brand guidelines `{bridge_cmd()} doc get --client {slug} --kind brand_guidelines`, their identity `--kind identity`, the house style `team/content-editor/house-style.md`, their `clients/{slug}/style-profile.md` and `team-room/feedback-log.md` if they exist.
2. Their moodboard: `{bridge_cmd()} moodboard get --client {slug}` downloads every screenshot and video Tait dropped in and prints his notes and links. Look at every image; watch every video (`watch` skill). Pull out the motion graphics, fonts, text styles, colours, layouts and video styles.
3. Write the guidelines with the `editing-guidelines-doc` skill, save as `clients/{slug}/sources/editing_guidelines.md`, then
   `{bridge_cmd()} doc put --client {slug} --kind editing_guidelines --file clients/{slug}/sources/editing_guidelines.md --status on_desk --built-by "Content Editor" --sources "moodboard (N items), brand guidelines"`
   and `{bridge_cmd()} moodboard used --client {slug}`.
4. Tait approves it on My desk. **No edit for this client starts until it's approved** (Tait's rule)."""
    tid = give_task("Content Editor", f"{c['name']}: {what}", desc)
    sb.insert("social_client_onboarding", {"client_id": c["id"], "style_requested_at": now()}, upsert_on="client_id")
    return tid


def ask_for_house_style(sb):
    desc = f"""Tait added items to the **house moodboard** (every client). Fold them into the house style.

1. `{bridge_cmd()} moodboard get --client house` downloads them with Tait's notes. Look at every image; watch every video.
2. Update `team/content-editor/house-style.md` (the defaults every client's editing guidelines start from): motion graphics, fonts, text styles, colours, video styles. Add only what the items show; Tait is the rule maker, so list anything that would change an existing rule as a question for him.
3. `{bridge_cmd()} moodboard used --client house`, then post one line here."""
    tid = give_task("Content Editor", "House moodboard: fold new items into the house style", desc)
    return tid


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
        mood = sb.select("social_moodboard_items", "select=id,client_id,used_at,created_at")
        obs2 = sb.select("social_client_onboarding", "select=client_id,style_requested_at")
    except RuntimeError:
        mood = None   # migration 028 not run yet
    if mood is not None:
        sj = plan_style_jobs(clients, obs2, docs, mood)
        for c in sj["build"]:
            log.append(f"editing guidelines: {c['name']} -> {ask_for_style(sb, c)}")
        for c in sj["update"]:
            log.append(f"editing guidelines update: {c['name']} -> {ask_for_style(sb, c, update=True)}")
        if sj["house"] and not st.get("house_asked_open"):
            log.append(f"house style -> {ask_for_house_style(sb)}")
            st["house_asked_open"] = True
            STATE.write_text(json.dumps(st, indent=2))
    if verbose:
        print("\n".join(log) or "Nothing new.")
    return log


# ── the Library: shared music and sound effects ─────────────────────────
REPO = pathlib.Path(__file__).resolve().parents[1]
LIBRARY_DIRS = [("music", REPO / "editor/public/clients/_music"), ("sfx", REPO / "editor/public/clients/_sfx/library")]
AUDIO = {".mp3", ".wav", ".m4a", ".aif", ".aiff", ".flac", ".ogg", ".aac"}


def audio_seconds(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True)
    try:
        return round(float(out.stdout.strip()), 1)
    except ValueError:
        return None


def sync_assets(sb):
    """Index the shared music and sound effects folders into
    social_style_assets, with a small MP3 preview in the 'library' bucket
    (music: the first 60 s; sound effects: all of it, up to 15 s)."""
    known = {r["path"] for r in sb.select("social_style_assets", "select=path")}
    added = 0
    for kind, root in LIBRARY_DIRS:
        if not root.exists():
            continue
        for f in sorted(root.rglob("*")):
            if f.suffix.lower() not in AUDIO or f.name.startswith("._"):
                continue
            rel = str(f.relative_to(REPO))
            if rel in known:
                continue
            folder = f.parent.name if f.parent != root else root.name
            preview = f"{kind}/{uuid.uuid5(uuid.NAMESPACE_URL, rel).hex}.mp3"
            with tempfile.TemporaryDirectory() as tmp:
                out = pathlib.Path(tmp) / "p.mp3"
                cut = ["-t", "60"] if kind == "music" else ["-t", "15"]
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(f), *cut, "-ac", "2", "-b:a", "96k", str(out)], check=True)
                sb.upload("library", preview, out.read_bytes(), "audio/mpeg")
            sb.insert("social_style_assets", {"kind": kind, "name": f.stem, "path": rel, "folder": folder,
                                              "preview_path": preview, "duration_s": audio_seconds(f)})
            added += 1
    return f"Library: {added} new file(s) added ({len(known) + added} in all)."


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
    m = sub.add_parser("moodboard"); m.add_argument("action", choices=["get", "used"]); m.add_argument("--client", required=True, help="a portal address, or 'house'")
    s = sub.add_parser("assets"); s.add_argument("action", choices=["sync", "list"]); s.add_argument("--kind", choices=["music", "sfx"])
    s.add_argument("--folder"); s.add_argument("--favourites", action="store_true")
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
        items = sb.select("social_moodboard_items", f"select=*&{filt}&order=created_at")
        folder = HOME / ".cache" / "fully-social" / "moodboards" / a.client
        folder.mkdir(parents=True, exist_ok=True)
        for it in items:
            line = f"- [{it['kind']}] {it.get('name') or ''}"
            if it.get("storage_path"):
                local = folder / pathlib.Path(it["storage_path"]).name
                if not local.exists():
                    local.write_bytes(sb.download("moodboards", it["storage_path"]))
                line += f" -> {local}"
            if it.get("url"):
                line += f" -> {it['url']}"
            if it.get("note"):
                line += f"\n    Tait: {it['note']}"
            if not it.get("used_at"):
                line += "  (new)"
            print(line)
        print(f"{len(items)} item(s). Files in {folder}" if items else "The moodboard is empty.")
    elif a.cmd == "assets":
        if a.action == "sync":
            print(sync_assets(sb))
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
