#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
#  DOUBLE-CLICK THIS FILE to open the map editor.
#
#  It starts a small web server on this computer and opens the editor in your
#  browser. Nothing is uploaded anywhere and nothing is installed.
#
#  This file exists so that using the editor never requires typing a command.
#  If you are comfortable in a terminal, `node tools/map-editor/serve.js` does
#  exactly the same thing.
# ═══════════════════════════════════════════════════════════════════════════

# Double-clicking opens Terminal in your home folder, not here — so move to
# wherever this file actually lives before doing anything.
cd "$(dirname "$0")" || exit 1

PORT=8750
EDITOR_URL="http://localhost:$PORT/tools/map-editor/"

# `|| true` so this never aborts the script when run somewhere without a
# terminal attached (e.g. from a script rather than a double-click).
clear 2>/dev/null || true
echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │   Shoulders of Giants  ·  Map Editor        │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# ── Is Node installed? ─────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "  ✗ This needs Node.js, which isn't installed on this Mac."
  echo ""
  echo "    1. Go to  https://nodejs.org"
  echo "    2. Download the big green 'LTS' button and run the installer."
  echo "    3. Close this window and double-click this file again."
  echo ""
  echo "  (You only ever have to do this once.)"
  echo ""
  echo "  Press any key to close."
  read -n 1 -s
  exit 1
fi

# ── Is it already running? ─────────────────────────────────────────────────
# Double-clicking twice shouldn't start a second server and fail confusingly.
#
# Ask the server whether it answers, rather than checking whether the port is
# occupied. `lsof -ti:PORT` matches ANY socket touching the port, including
# closed browser connections left behind by a previous session -- which made
# this claim "already running" and open a dead page after the editor was shut
# down. A real HTTP response is the only trustworthy signal.
if curl -s -o /dev/null -m 2 "$EDITOR_URL" 2>/dev/null; then
  echo "  The editor is already running — opening it in your browser."
  echo ""
  open "$EDITOR_URL"
  echo "  You can close this window."
  echo ""
  exit 0
fi

# Port taken by something that ISN'T us (another project's dev server, say).
# Without this the Node server just dies with EADDRINUSE and a stack trace.
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  ✗ Something else on this Mac is already using port $PORT,"
  echo "    so the editor can't start."
  echo ""
  echo "    Restarting your computer will clear it. If it keeps happening,"
  echo "    send this message to Claude and it can move the editor to a"
  echo "    different port."
  echo ""
  echo "  Press any key to close."
  read -n 1 -s
  exit 1
fi

# ── Start ──────────────────────────────────────────────────────────────────
echo "  Starting…"
node tools/map-editor/serve.js &
SERVER_PID=$!

# Give the server a moment to bind the port before pointing a browser at it,
# otherwise the first load can land on "connection refused".
sleep 1

if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo ""
  echo "  ✗ The editor failed to start."
  echo "    Take a screenshot of this window and send it to Claude."
  echo ""
  echo "  Press any key to close."
  read -n 1 -s
  exit 1
fi

open "$EDITOR_URL"

echo ""
echo "  ✓ The editor is open in your browser."
echo ""
echo "    Editor    $EDITOR_URL"
echo "    The game  http://localhost:$PORT/"
echo ""
echo "  ─────────────────────────────────────────────────────────────"
echo "   LEAVE THIS WINDOW OPEN while you work."
echo "   Closing it shuts the editor down."
echo ""
echo "   When you're finished, press  Control + C  or just close it."
echo "  ─────────────────────────────────────────────────────────────"
echo ""

# Shut the server down cleanly if this window is closed or Ctrl-C is pressed,
# so the port is free next time.
trap "kill $SERVER_PID 2>/dev/null; exit 0" INT TERM HUP
wait $SERVER_PID
