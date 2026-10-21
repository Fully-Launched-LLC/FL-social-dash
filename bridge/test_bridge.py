"""Tests for the bridge's decisions (no network): python3 bridge/test_bridge.py"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from bridge import plan_jobs, plan_style_jobs, questions_from_text, timeline, plan_dates, match_client, idea_title, months_ahead, plan_script_jobs, script_signature, card_folder_name, plan_edit_jobs, edit_signature, desk_message, agent_rows, needs_from_error
import datetime as dt

SINCE = "2026-10-21T12:00:00+00:00"
old = {"id": "a", "name": "Grad Gig", "slug": "gg", "created_at": "2026-09-01T00:00:00+00:00", "onboarding_questions": None}
new = {"id": "b", "name": "New Co", "slug": "new", "created_at": "2026-10-21T13:00:00+00:00", "onboarding_questions": None}
skip = {"id": "c", "name": "Skip", "slug": "skip", "created_at": "2026-10-21T13:00:00+00:00", "onboarding_questions": None, "skip_onboarding": True}
fails = 0
def check(name, cond, extra=None):
    global fails
    print(("ok   " if cond else "FAIL ") + name + ("" if cond or extra is None else f"  {extra}"))
    fails += not cond

j = plan_jobs([old, new, skip], [], [], SINCE)
check("only a new client (not skipping onboarding) gets questions", [c["id"] for c in j["questions"]] == ["b"])
j = plan_jobs([new], [{"client_id": "b", "questions_requested_at": "2026-10-21T13:01:00+00:00"}], [], SINCE)
check("questions asked once", j["questions"] == [])
j = plan_jobs([dict(new, onboarding_questions=[{"section": "x", "items": [{"q": "y"}]}])], [], [], SINCE)
check("client with questions already: none asked", j["questions"] == [])

ob_old = {"client_id": "a", "voice_memo_path": "a/voice-memo/old.m4a", "voice_memo_uploaded_at": "2026-09-28T00:00:00+00:00"}
ob_new = {"client_id": "b", "voice_memo_path": "b/voice-memo/new.m4a", "voice_memo_uploaded_at": "2026-10-21T14:00:00+00:00", "questions_requested_at": "x"}
j = plan_jobs([old, new], [ob_old, ob_new], [], SINCE)
check("only voice memos uploaded after install are imported", [m["path"] for m in j["import_memos"]] == ["b/voice-memo/new.m4a"])
rec = {"id": "r1", "client_id": "b", "storage_path": "b/voice-memo/new.m4a", "transcript_status": "waiting"}
j = plan_jobs([old, new], [ob_old, ob_new], [rec], SINCE)
check("imported memo isn't imported twice", j["import_memos"] == [])
check("waiting recording gets transcribed", [r["id"] for r in j["transcribe"]] == ["r1"])
done = dict(rec, transcript_status="done", transcribed_at="2026-10-21T14:05:00+00:00")
j = plan_jobs([old, new], [ob_old, ob_new], [done], SINCE)
check("a new transcript starts the documents", [c["id"] for c in j["documents"]] == ["b"])
j = plan_jobs([old, new], [ob_old, dict(ob_new, docs_requested_at="2026-10-21T14:06:00+00:00")], [done], SINCE)
check("documents asked once per new transcript", j["documents"] == [])
call = {"id": "r2", "client_id": "b", "storage_path": "b/calls/c.m4a", "transcript_status": "done", "transcribed_at": "2026-10-22T10:00:00+00:00"}
j = plan_jobs([old, new], [ob_old, dict(ob_new, docs_requested_at="2026-10-21T14:06:00+00:00")], [done, call], SINCE)
check("a later call recording rebuilds the documents", [c["id"] for c in j["documents"]] == ["b"])

qs = questions_from_text("""## Your business
Note: Talk like you would to a friend.
- What do you sell?
- [story] A time a customer surprised you
## Your brand
- What colours do you use?""")
check("questions parse into sections", [s["section"] for s in qs] == ["Your business", "Your brand"])
check("note kept, story marked, ids unique", qs[0]["note"].startswith("Talk") and qs[0]["items"][1].get("story") is True and len({i["id"] for s in qs for i in s["items"]}) == 3)
check("no-note section has no note key", "note" not in qs[1])
# ── editing guidelines (Phase 4) ──
gg = {"id": "a", "name": "Grad Gig", "slug": "gg"}
brand_ok = {"client_id": "a", "kind": "brand_guidelines", "status": "approved"}
brand_desk = dict(brand_ok, status="on_desk")
guide = {"client_id": "a", "kind": "editing_guidelines", "status": "on_desk"}
j = plan_style_jobs([gg], [], [brand_desk], [])
check("no guidelines until the brand guidelines are approved", j["build"] == [] and j["update"] == [])
j = plan_style_jobs([gg], [], [brand_ok], [])
check("approved brand guidelines start the editing guidelines", [c["id"] for c in j["build"]] == ["a"])
j = plan_style_jobs([gg], [{"client_id": "a", "style_requested_at": "2026-10-21T15:00:00"}], [brand_ok], [])
check("asked once", j["build"] == [] and j["update"] == [])
mb_old = {"client_id": "a", "created_at": "2026-10-21T14:00:00", "used_at": None}
mb_new = {"client_id": "a", "created_at": "2026-10-21T16:00:00", "used_at": None}
j = plan_style_jobs([gg], [{"client_id": "a", "style_requested_at": "2026-10-21T15:00:00"}], [brand_ok, guide], [mb_old])
check("items already there when it was asked aren't a new update", j["update"] == [])
j = plan_style_jobs([gg], [{"client_id": "a", "style_requested_at": "2026-10-21T15:00:00"}], [brand_ok, guide], [mb_old, mb_new])
check("new moodboard items update the guidelines", [c["id"] for c in j["update"]] == ["a"])
j = plan_style_jobs([gg], [], [brand_ok, guide], [{"client_id": None, "created_at": "x", "used_at": None}])
check("house moodboard items update the house style", j["house"] is True and j["update"] == [])

# ── ideas (Phase 5) ──
check("timeline: script P-13, film P-10, edit P-7", timeline("2026-11-20") == {"post": "2026-11-20", "script_due": "2026-11-07", "film_by": "2026-11-10", "edit_due": "2026-11-13"})
d = plan_dates("2026-11-01", 20)
check("20 post dates, all weekdays in November", len(d) == 20 and all(x.startswith("2026-11") and dt.date.fromisoformat(x).weekday() < 5 for x in d) and len(set(d)) == 20)
check("spread across the month", d[0] <= "2026-11-04" and d[-1] >= "2026-11-26", d)
d = plan_dates("2026-11-01", 20, ["2026-11-14"])
check("special request keeps its day (even a Saturday) and counts toward 20", "2026-11-14" in d and len(d) == 20)
cl = [{"name": "Grad Gig", "slug": "grad-gig"}, {"name": "Fully Launched", "slug": "fully-launched"}]
c, body = match_client("Grad Gig: snow shovelling for seniors", cl)
check("client name before a colon", c["slug"] == "grad-gig" and body == "snow shovelling for seniors")
c, body = match_client("fully launched - a hook about founders", cl)
check("lowercase name with a dash", c["slug"] == "fully-launched" and body == "a hook about founders")
c, body = match_client("Grad Gig - x", cl)
check("name with a dash", c["slug"] == "grad-gig" and body == "x")
c, body = match_client("Grad gig test idea: what Wheaton snow rules say", cl)
check("name at the start, colon later", c["slug"] == "grad-gig" and body == "test idea: what Wheaton snow rules say", body)
c, body = match_client("grad-gig snow rules", cl)
check("portal address with a dash, no colon", c["slug"] == "grad-gig" and body == "snow rules", body)
c, body = match_client("Graduation party ideas", cl)
check("a word that only starts like a client isn't a match", c is None)
c, body = match_client("just an idea with no client", cl)
check("no client named -> ask", c is None and body == "just an idea with no client")
check("idea title is the first sentence", idea_title("Snow rules for seniors. More detail here.") == "Snow rules for seniors.")
check("plans are for next month", months_ahead(dt.date(2026, 10, 21)) == "2026-11-01" and months_ahead(dt.date(2026, 12, 10)) == "2027-01-01")

# ── scripts (Phase 6) ──
v1 = {"id": "v1", "client_id": "a", "status": "scripting", "note": None, "editor_brief": {}}
v2 = {"id": "v2", "client_id": "a", "status": "script_review", "note": None, "editor_brief": {}}
j = plan_script_jobs([v1, v2], {})
check("new Scripting cards go to the Writer, grouped by client", list(j) == ["a"] and [v["id"] for v in j["a"]] == ["v1"])
j = plan_script_jobs([v1], {"v1": script_signature(v1)})
check("asked once", j == {})
back = dict(v1, editor_brief={"scriptNotes": [{"note": "punchier"}]})
check("Tait's send-back asks again", list(plan_script_jobs([back], {"v1": script_signature(v1)})) == ["a"])
client = dict(v1, note="change the ending")
check("client's requested changes ask again", list(plan_script_jobs([client], {"v1": script_signature(v1)})) == ["a"])
check("card folder name like Tait's", card_folder_name(20, {"title": 'Snow: rules?', "post_date": "2026-11-14"}) == "20. Snow rules (posts Nov 14)")

# ── editing (Phase 7) ──
r1 = {"id": "e1", "client_id": "a", "status": "ready_to_edit", "editor_id": None, "editor_brief": {}}
j = plan_edit_jobs([r1], {"a"}, set(), {})
check("footage in + guidelines approved -> the AI Editor starts", [v["id"] for v in j["start"]] == ["e1"])
j = plan_edit_jobs([r1], set(), set(), {})
check("guidelines not approved -> it waits (Tait's rule)", j["start"] == [] and [v["id"] for v in j["waiting"]] == ["e1"])
j = plan_edit_jobs([r1], {"a"}, {"e1"}, {})
check("clips still moving to Drive -> not yet", j["start"] == [] and j["waiting"] == [])
j = plan_edit_jobs([dict(r1, editor_id="human")], {"a"}, set(), {})
check("a human editor's card is left alone", j["start"] == [])
w = {"id": "e2", "client_id": "a", "status": "with_editor", "editor_id": None, "editor_brief": {"aiEditor": True}, "client_revision_rounds": 0}
check("with the AI Editor, nothing new -> nothing", plan_edit_jobs([w], {"a"}, set(), {"e2": edit_signature(w)})["revise"] == [])
w2 = dict(w, editor_brief={"aiEditor": True, "revisions": "0:12 louder"})
check("Tait's revisions -> revise", [v["id"] for v in plan_edit_jobs([w2], {"a"}, set(), {"e2": edit_signature(w)})["revise"]] == ["e2"])
w3 = dict(w, note="change the music", client_revision_rounds=1)
check("client's round -> revise", [v["id"] for v in plan_edit_jobs([w3], {"a"}, set(), {"e2": edit_signature(w)})["revise"]] == ["e2"])
check("sent to the AI Editor from the dashboard -> start", [v["id"] for v in plan_edit_jobs([w], {"a"}, set(), {})["revise"]] == ["e2"])
m = desk_message({"plan": [], "doc": ["d"], "script": ["s1", "s2"], "video": ["v"], "post": []}, {"s2"})
check("desk notice groups everything", m.startswith("On your desk: 1 document, 2 scripts, 1 video to review (1 new)."), m)

# ── agent room (Phase 8) ──
ags = [{"id": "e", "name": "Content Editor", "status": "running", "title": "Editor"}, {"id": "r", "name": "Content Researcher", "status": "idle"},
       {"id": "w", "name": "Content Writer", "status": "idle"}, {"id": "p", "name": "Content Poster", "status": "paused"}]
iss = [{"id": "1", "identifier": "FUL-40", "title": "Grad Gig: edit the video: Leaf rules", "status": "in_progress", "assigneeAgentId": "e", "updatedAt": "2"},
       {"id": "2", "identifier": "FUL-41", "title": "New Co: weekly research", "status": "todo", "assigneeAgentId": "r", "updatedAt": "1"}]
runs = {"r": {"status": "failed", "error": "Claude run failed: You've hit your session limit"}}
rows = {r["agent"]: r for r in agent_rows(ags, iss, runs, [{"id": "gg", "name": "Grad Gig"}], {"e": "Rendering v2"})}
check("working agent: its task, client, task id, last line", rows["Content Editor"]["status"] == "working" and rows["Content Editor"]["working_on"].endswith("Leaf rules") and rows["Content Editor"]["client_id"] == "gg" and rows["Content Editor"]["paperclip_task"] == "FUL-40" and rows["Content Editor"]["last_line"] == "Rendering v2")
check("failed run: stuck, and what Tait can do", rows["Content Researcher"]["status"] == "stuck" and "session limit" in rows["Content Researcher"]["stuck_on"] and "usage limit" in rows["Content Researcher"]["needs_from_tait"])
check("idle and paused", rows["Content Writer"]["status"] == "idle" and rows["Content Poster"]["status"] == "paused" and rows["Content Poster"]["paused"] is True)
soon = (dt.datetime.now(dt.timezone.utc)).isoformat()
iss2 = iss + [{"id": "3", "identifier": "FUL-42", "title": "Grad Gig: script 2 cards", "status": "in_progress", "assigneeAgentId": "w", "createdByAgentId": "e", "updatedAt": soon},
              {"id": "4", "identifier": "FUL-43", "title": "Approve: Grad Gig plan", "status": "in_review", "assigneeUserId": "local-board", "createdByAgentId": "w", "updatedAt": soon},
              {"id": "5", "identifier": "FUL-44", "title": "Old work", "status": "done", "assigneeAgentId": "r", "createdByUserId": "local-board", "updatedAt": "2020-01-01"}]
rows2 = {r["agent"]: r for r in agent_rows(ags, iss2, {}, [])}
check("live hand-off between agents is on the receiver", {"from": "Content Editor", "to": "Content Writer", "task": "Grad Gig: script 2 cards"} in rows2["Content Writer"]["handoffs"], rows2["Content Writer"]["handoffs"])
check("hand-off to Tait is on the sender", any(h["to"] == "Tait" for h in rows2["Content Writer"]["handoffs"]))
check("old finished work isn't drawn", rows2["Content Researcher"]["handoffs"] == [])
check("Apify out of credit is something Tait can fix", "Apify" in (needs_from_error("Apify: monthly usage limit exceeded, add credit") or ""))
check("an unknown error needs no action from Tait", needs_from_error("TypeError: x") is None)

print("all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
