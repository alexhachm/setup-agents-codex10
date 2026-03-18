#!/usr/bin/env bash
# start.sh — One-command startup for the entire mac10 system.
#
# Launches:
#   1. Coordinator (mac10 daemon)
#   2. ChatGPT research driver (multi-tab pool)
#   3. Reports status
#
# Usage:
#   bash start.sh          # Start everything
#   bash start.sh --stop   # Stop everything
#   bash start.sh --pause  # Stop and normalize runtime state
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC10_CMD="$PROJECT_DIR/.codex/scripts/codex10"
DRIVER="$PROJECT_DIR/.codex/scripts/chatgpt-driver.py"
DRIVER_PID_FILE="$PROJECT_DIR/.codex/state/research-driver.pid"

# --- Pause mode (stop + state normalization) ---
if [ "${1:-}" = "--pause" ]; then
  echo "Pausing mac10 system..."
  bash "$PROJECT_DIR/start.sh" --stop
  (
    cd "$PROJECT_DIR/coordinator"
    node -e "const Database=require('better-sqlite3');const db=new Database('../.codex/state/codex10.db');db.prepare(\"UPDATE loops SET status='stopped', stopped_at=COALESCE(stopped_at,datetime('now')), updated_at=datetime('now') WHERE status='active'\").run();db.prepare(\"UPDATE research_queue SET status='queued', started_at=NULL, error='Re-queued during pipeline pause' WHERE status='in_progress'\").run();"
  ) >/dev/null 2>&1 || true
  (
    cd "$PROJECT_DIR"
    node -e "const fs=require('fs');const p='.codex/state/codex10.agent-health.json';let j={};try{j=JSON.parse(fs.readFileSync(p,'utf8'));}catch{};const now=new Date().toISOString();j['master-1']={...(j['master-1']||{}),status:'paused'};j['master-2']={...(j['master-2']||{}),status:'paused'};j['master-3']={...(j['master-3']||{}),status:'paused'};j['research-driver']={status:'paused',last_active:now};fs.writeFileSync(p,JSON.stringify(j,null,2));"
  ) >/dev/null 2>&1 || true
  echo "Paused. Loops stopped, in-progress research re-queued, health marked paused."
  exit 0
fi

# --- Stop mode ---
if [ "${1:-}" = "--stop" ]; then
  echo "Stopping mac10 system..."
  # Stop research driver
  if [ -f "$DRIVER_PID_FILE" ]; then
    PID=$(cat "$DRIVER_PID_FILE" 2>/dev/null || echo "")
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      echo "  Research driver stopped (PID $PID)"
    fi
    rm -f "$DRIVER_PID_FILE"
  fi
  # Stop coordinator
  "$MAC10_CMD" stop "$PROJECT_DIR" 2>/dev/null || true
  echo "  Coordinator stopped"
  echo "Done."
  exit 0
fi

# --- Start mode ---
echo "=== mac10 System Startup ==="
echo ""

# 1. Coordinator
echo "[1/2] Starting coordinator..."
if "$MAC10_CMD" ping 2>/dev/null | grep -q "pong"; then
  echo "  Coordinator already running."
else
  "$MAC10_CMD" start "$PROJECT_DIR" 2>&1
fi
# Recover queue items stranded in in_progress from prior crashes.
"$MAC10_CMD" research-requeue-stale 120 >/dev/null 2>&1 || true
echo ""

# 2. Research driver
echo "[2/2] Starting ChatGPT research driver..."
if [ -f "$DRIVER_PID_FILE" ]; then
  EXISTING_PID=$(cat "$DRIVER_PID_FILE" 2>/dev/null || echo "")
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "  Research driver already running (PID $EXISTING_PID)."
  else
    rm -f "$DRIVER_PID_FILE"
  fi
fi

if [ ! -f "$DRIVER_PID_FILE" ]; then
  mkdir -p "$PROJECT_DIR/.codex/logs"
  nohup python3 "$DRIVER" > /dev/null 2>> "$PROJECT_DIR/.codex/logs/research-driver.log" < /dev/null &
  DRIVER_PID=$!
  echo "$DRIVER_PID" > "$DRIVER_PID_FILE"
  echo "  Research driver started (PID $DRIVER_PID)"
  echo "  Log: .codex/logs/research-driver.log"
  sleep 3
  if ! kill -0 "$DRIVER_PID" 2>/dev/null; then
    echo "  ERROR: research driver exited during startup."
    echo "  Last log lines:"
    tail -n 40 "$PROJECT_DIR/.codex/logs/research-driver.log" || true
    rm -f "$DRIVER_PID_FILE"
    exit 1
  fi
fi
echo ""

# 3. Status report
echo "=== System Status ==="
"$MAC10_CMD" ping 2>&1 || true
echo ""
"$MAC10_CMD" loop-status 2>&1 || echo "  No active loops"
echo ""
"$MAC10_CMD" research-status 2>&1 || echo "  Research queue empty"
echo ""
echo "Ready. Use 'bash start.sh --stop' to shut down."
