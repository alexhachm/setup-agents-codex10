#!/usr/bin/env bash
# research-sentinel.sh — Runs chatgpt-driver.py with restart/backoff logic.
# Follows the loop-sentinel.sh and worker-sentinel.sh patterns.
# Usage: bash .codex/scripts/research-sentinel.sh [project_dir]
set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/.codex/logs"
LOG_FILE="$LOG_DIR/research-sentinel.log"
HEALTH_FILE="$PROJECT_DIR/.codex/state/codex10.agent-health.json"
DRIVER_SCRIPT="$PROJECT_DIR/.codex/scripts/chatgpt-driver.py"
if [ ! -f "$DRIVER_SCRIPT" ]; then
  DRIVER_SCRIPT="$PROJECT_DIR/scripts/chatgpt-driver.py"
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$HEALTH_FILE")"

BACKOFF=5
MAX_BACKOFF=300
CONSECUTIVE_FAILURES=0
RESEARCH_HEADLESS_MODE="${MAC10_RESEARCH_HEADLESS:-1}"

update_health() {
  local status="$1"
  local now
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  if [ -f "$HEALTH_FILE" ]; then
    python3 -c "
import json, sys
try:
    with open('$HEALTH_FILE', 'r') as f:
        h = json.load(f)
except:
    h = {}
h.setdefault('research-driver', {})
h['research-driver']['status'] = '$status'
h['research-driver']['last_active'] = '$now'
with open('$HEALTH_FILE', 'w') as f:
    json.dump(h, f, indent=2)
" 2>/dev/null || true
  fi
}

LOCK_FILE="$PROJECT_DIR/.codex/state/research-driver.lock"
LOCK_PID_FILE="$PROJECT_DIR/.codex/state/research-driver.pid"

# Clean up a stale lock/pid file left by a crashed driver process.
# flock() on NTFS/DrvFs (WSL2) raises EOPNOTSUPP, so the driver may fall back
# to a PID file. Either way, if the recorded PID is gone the file is stale.
cleanup_stale_lock() {
  for _lf in "$LOCK_FILE" "$LOCK_PID_FILE"; do
    [ -f "$_lf" ] || continue
    _pid=$(cat "$_lf" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$_pid" ] && kill -0 "$_pid" 2>/dev/null; then
      : # Process is alive — leave the lock alone
    else
      echo "[research-sentinel] Removing stale lock file: $_lf (pid=${_pid:-unknown} gone)" | tee -a "$LOG_FILE"
      rm -f "$_lf"
    fi
  done
}

echo "[research-sentinel] Starting in $PROJECT_DIR" | tee -a "$LOG_FILE"
update_health "starting"

while true; do
  cleanup_stale_lock
  echo "[research-sentinel] Launching chatgpt-driver.py (backoff=${BACKOFF}s)..." | tee -a "$LOG_FILE"
  update_health "active"

  START_TIME=$(date +%s)

  if [ "$RESEARCH_HEADLESS_MODE" != "0" ] && command -v xvfb-run >/dev/null 2>&1; then
    env -u DISPLAY -u WAYLAND_DISPLAY -u XAUTHORITY \
      XVFB_RUNNING=1 xvfb-run -a --server-args="-screen 0 1920x1080x24 -ac -nolisten tcp" \
      python3 "$DRIVER_SCRIPT" 2>&1 | tee -a "$LOG_FILE" || true
  else
    python3 "$DRIVER_SCRIPT" 2>&1 | tee -a "$LOG_FILE" || true
  fi
  EXIT_CODE=${PIPESTATUS[0]}

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  echo "[research-sentinel] Driver exited (code=$EXIT_CODE, duration=${DURATION}s)" | tee -a "$LOG_FILE"

  if [ "$DURATION" -lt 10 ]; then
    # Very short run — crash/error, increase backoff
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    BACKOFF=$((BACKOFF * 2))
    if [ "$BACKOFF" -gt "$MAX_BACKOFF" ]; then
      BACKOFF=$MAX_BACKOFF
    fi
    echo "[research-sentinel] Short run (${DURATION}s), failure #${CONSECUTIVE_FAILURES}, backoff → ${BACKOFF}s" | tee -a "$LOG_FILE"
    update_health "backoff"
  else
    # Healthy run — reset backoff
    CONSECUTIVE_FAILURES=0
    BACKOFF=5
    echo "[research-sentinel] Healthy run (${DURATION}s), backoff → ${BACKOFF}s" | tee -a "$LOG_FILE"
  fi

  # If too many consecutive failures, extend backoff significantly
  if [ "$CONSECUTIVE_FAILURES" -ge 10 ]; then
    echo "[research-sentinel] Too many failures ($CONSECUTIVE_FAILURES), extended pause (${MAX_BACKOFF}s)" | tee -a "$LOG_FILE"
    update_health "extended_backoff"
    sleep "$MAX_BACKOFF"
    CONSECUTIVE_FAILURES=0
    BACKOFF=5
    continue
  fi

  update_health "restarting"
  sleep "$BACKOFF"
done
