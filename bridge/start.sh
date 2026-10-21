#!/bin/bash
# Start the AI team: Paperclip (the agents' office) and the bridge that
# connects it to the Fully Social dashboard. Leave this window open.
cd "$(dirname "$0")/.." || exit 1
if ! curl -s -m 2 http://127.0.0.1:3100/api/health >/dev/null; then
  echo "Starting Paperclip…"
  (cd ~ && DO_NOT_TRACK=1 PAPERCLIP_TELEMETRY_DISABLED=1 npx paperclipai run > /tmp/paperclip.log 2>&1 &)
  for i in $(seq 1 60); do curl -s -m 2 http://127.0.0.1:3100/api/health >/dev/null && break; sleep 2; done
fi
echo "Paperclip: http://127.0.0.1:3100"
python3 bridge/bridge.py status && python3 bridge/bridge.py watch --every 120
