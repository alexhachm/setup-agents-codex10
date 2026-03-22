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

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$HEALTH_FILE")"

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

  python3 "$DRIVER_SCRIPT" 2>&1 | tee -a "$LOG_FILE" || true
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
