"""Tests for the bridge's decisions (no network): python3 bridge/test_bridge.py"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from bridge import plan_jobs, plan_style_jobs, questions_from_text, timeline, plan_dates, match_client, idea_title, months_ahead
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
c, body = match_client("gradgig: x", cl)
check("portal address works too", c["slug"] == "grad-gig")
c, body = match_client("just an idea with no client", cl)
check("no client named -> ask", c is None and body == "just an idea with no client")
check("idea title is the first sentence", idea_title("Snow rules for seniors. More detail here.") == "Snow rules for seniors.")
check("plans are for next month", months_ahead(dt.date(2026, 10, 21)) == "2026-11-01" and months_ahead(dt.date(2026, 12, 10)) == "2027-01-01")

print("all passed" if not fails else f"{fails} failed")
sys.exit(1 if fails else 0)
