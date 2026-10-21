# The bridge

Connects the AI team (Paperclip, on Tait's Mac) to the Fully Social
dashboard (Supabase). Unify the System, Phase 3. See `bridge.py`'s header
for everything it does.

**Setup, once (Tait):** open `~/.config/fully-social/bridge.env` and paste
the Supabase secret ("service_role") key after `SUPABASE_SERVICE_ROLE_KEY=`
(Supabase → Project Settings → API Keys). That file is private to this Mac
and never goes in this repo. Then check: `python3 bridge/bridge.py status`.

**Run it:** `bridge/start.sh` starts Paperclip and the bridge together.
It checks the dashboard every 2 minutes while it's open.

**Tests:** `python3 bridge/test_bridge.py` (no network).
