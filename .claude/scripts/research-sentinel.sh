#!/usr/bin/env bash
# research-sentinel.sh — Runs chatgpt-driver.py with restart/backoff logic.
# Follows the loop-sentinel.sh and worker-sentinel.sh patterns.
# Usage: bash .claude/scripts/research-sentinel.sh [project_dir]
set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/.claude/logs"
LOG_FILE="$LOG_DIR/research-sentinel.log"
HEALTH_FILE="$PROJECT_DIR/.claude/state/agent-health.json"
STATE_DIR="$PROJECT_DIR/.claude/state"
SENTINEL_PID_FILE="$STATE_DIR/research-sentinel.pid"
SENTINEL_LOCK_DIR="$STATE_DIR/research-sentinel.lock"
DRIVER_SCRIPT="$PROJECT_DIR/.claude/scripts/chatgpt-driver.py"

mkdir -p "$LOG_DIR"
mkdir -p "$STATE_DIR"

is_pid_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    tr -dc '0-9' < "$pid_file" | head -c 16 || true
  fi
}

if ! mkdir "$SENTINEL_LOCK_DIR" 2>/dev/null; then
  existing_pid="$(read_pid_file "$SENTINEL_PID_FILE")"
  if is_pid_alive "$existing_pid"; then
    echo "[research-sentinel] Already running for $PROJECT_DIR (PID $existing_pid); exiting duplicate." | tee -a "$LOG_FILE"
    exit 0
  fi
  rm -rf "$SENTINEL_LOCK_DIR"
  if ! mkdir "$SENTINEL_LOCK_DIR" 2>/dev/null; then
    echo "[research-sentinel] ERROR: could not acquire sentinel lock: $SENTINEL_LOCK_DIR" | tee -a "$LOG_FILE" >&2
    exit 1
  fi
fi

printf '%s\n' "$$" > "$SENTINEL_PID_FILE"

cleanup_sentinel_lock() {
  current_pid="$(read_pid_file "$SENTINEL_PID_FILE")"
  if [ "$current_pid" = "$$" ]; then
    rm -f "$SENTINEL_PID_FILE"
    rmdir "$SENTINEL_LOCK_DIR" 2>/dev/null || true
  fi
}
stop_sentinel() {
  cleanup_sentinel_lock
  exit 0
}
trap cleanup_sentinel_lock EXIT
trap stop_sentinel INT TERM

BACKOFF=5
MAX_BACKOFF=300
CONSECUTIVE_FAILURES=0

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

echo "[research-sentinel] Starting in $PROJECT_DIR" | tee -a "$LOG_FILE"
update_health "starting"

while true; do
  echo "[research-sentinel] Launching chatgpt-driver.py (backoff=${BACKOFF}s)..." | tee -a "$LOG_FILE"
  update_health "active"

  START_TIME=$(date +%s)

  set +e
  if command -v xvfb-run >/dev/null 2>&1 && [ -z "${DISPLAY:-}" ]; then
    XVFB_RUNNING=1 xvfb-run -a --server-args="-screen 0 1920x1080x24 -ac -nolisten tcp" \
      python3 "$DRIVER_SCRIPT" 2>&1 | tee -a "$LOG_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
  else
    python3 "$DRIVER_SCRIPT" 2>&1 | tee -a "$LOG_FILE"
    EXIT_CODE=${PIPESTATUS[0]}
  fi
  set -e

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
