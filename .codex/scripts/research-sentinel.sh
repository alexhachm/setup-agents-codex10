#!/usr/bin/env bash
# research-sentinel.sh — ChatGPT research driver lifecycle manager.
#
# Orchestrates the driver lifecycle:
#   start → process (poll queue internally) → complete/fail → restart
#
# The driver itself handles all queue polling, item processing, and reporting
# research-complete / research-fail for each item. This sentinel ensures the
# driver stays running, restarts after crashes, and requeues any items left
# stuck in_progress after an unclean exit.
#
# Usage:
#   ./research-sentinel.sh [project_dir]
#
# project_dir defaults to the current directory.

set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
cd "$PROJECT_DIR"

# Ensure codex10 CLI is on PATH
export PATH="$PROJECT_DIR/.codex/scripts:$PATH"

DRIVER="$PROJECT_DIR/.codex/scripts/chatgpt-driver.py"
PYTHON="${PYTHON:-python3}"

# How long to wait between restarts (seconds); grows on consecutive quick exits
RESTART_DELAY=15
MAX_RESTART_DELAY=120
# A run shorter than this is considered a "quick exit" (crash/misconfiguration)
QUICK_EXIT_THRESHOLD=30

log() {
  echo "[research-sentinel] $(date '+%Y-%m-%dT%H:%M:%S') $*"
}

# --- Pre-flight checks -------------------------------------------------------

if [ ! -f "$DRIVER" ]; then
  log "ERROR: Driver not found: $DRIVER"
  exit 1
fi

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  log "ERROR: $PYTHON not found"
  exit 1
fi

# --- Process management -------------------------------------------------------

DRIVER_PID=""

cleanup() {
  log "Sentinel shutting down..."
  if [ -n "${DRIVER_PID:-}" ] && kill -0 "$DRIVER_PID" 2>/dev/null; then
    log "Stopping driver (PID $DRIVER_PID)..."
    kill "$DRIVER_PID" 2>/dev/null || true
    wait "$DRIVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Requeue items stuck in_progress from a previous crash (max age: 30 minutes)
requeue_stale() {
  codex10 research-requeue-stale 30 2>/dev/null || true
}

# --- Main loop ----------------------------------------------------------------

log "Starting research sentinel in $PROJECT_DIR"

CONSECUTIVE_QUICK_EXITS=0
CURRENT_RESTART_DELAY=$RESTART_DELAY

while true; do
  # Requeue any items left in_progress from a previous unclean driver exit
  requeue_stale

  log "Launching research driver..."
  START_TIME=$(date +%s)

  # Start driver in background so we can track it
  "$PYTHON" "$DRIVER" &
  DRIVER_PID=$!
  log "Driver started (PID $DRIVER_PID)"

  # Wait for driver to exit
  EXIT_CODE=0
  wait "$DRIVER_PID" || EXIT_CODE=$?
  DRIVER_PID=""

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  if [ "$EXIT_CODE" -eq 0 ]; then
    log "Driver exited normally (ran ${DURATION}s)"
  else
    log "Driver exited with code $EXIT_CODE (ran ${DURATION}s)"
    # Requeue items that may have been left in_progress by the crashed driver
    requeue_stale
  fi

  # Adaptive backoff: quick exits suggest a configuration or startup problem
  if [ "$DURATION" -lt "$QUICK_EXIT_THRESHOLD" ]; then
    CONSECUTIVE_QUICK_EXITS=$((CONSECUTIVE_QUICK_EXITS + 1))
    CURRENT_RESTART_DELAY=$((RESTART_DELAY * CONSECUTIVE_QUICK_EXITS))
    if [ "$CURRENT_RESTART_DELAY" -gt "$MAX_RESTART_DELAY" ]; then
      CURRENT_RESTART_DELAY=$MAX_RESTART_DELAY
    fi
    log "Quick exit #$CONSECUTIVE_QUICK_EXITS — backing off ${CURRENT_RESTART_DELAY}s before restart"
  else
    CONSECUTIVE_QUICK_EXITS=0
    CURRENT_RESTART_DELAY=$RESTART_DELAY
    log "Normal exit — restarting in ${CURRENT_RESTART_DELAY}s"
  fi

  sleep "$CURRENT_RESTART_DELAY"
done
