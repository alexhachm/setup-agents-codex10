#!/usr/bin/env bash
# Usage: signal-wait.sh <signal-file> [timeout_seconds]
# Waits until a signal file is touched/created. Falls back to polling.
set -e

SIGNAL_FILE="$1"
TIMEOUT="${2:-30}"

if [ -z "${SIGNAL_FILE:-}" ]; then
  echo "Usage: signal-wait.sh <signal-file> [timeout_seconds]" >&2
  exit 1
fi

mkdir -p "$(dirname "$SIGNAL_FILE")"

if command -v fswatch >/dev/null 2>&1; then
  fswatch -1 --event Created --event Updated --event Renamed "$SIGNAL_FILE" &
  WATCH_PID=$!
  (sleep "$TIMEOUT" && kill "$WATCH_PID" 2>/dev/null) &
  TIMER_PID=$!
  wait "$WATCH_PID" 2>/dev/null || true
  kill "$TIMER_PID" 2>/dev/null || true
elif command -v inotifywait >/dev/null 2>&1; then
  inotifywait -t "$TIMEOUT" -e modify,create "$SIGNAL_FILE" 2>/dev/null || true
else
  elapsed=0
  last_mod="0"
  if [ -f "$SIGNAL_FILE" ]; then
    if [[ "$OSTYPE" == darwin* ]]; then
      last_mod=$(stat -f %m "$SIGNAL_FILE" 2>/dev/null || echo "0")
    else
      last_mod=$(stat -c %Y "$SIGNAL_FILE" 2>/dev/null || echo "0")
    fi
  fi

  while [ "$elapsed" -lt "$TIMEOUT" ]; do
    sleep 2
    elapsed=$((elapsed + 2))
    if [ -f "$SIGNAL_FILE" ]; then
      if [[ "$OSTYPE" == darwin* ]]; then
        current_mod=$(stat -f %m "$SIGNAL_FILE" 2>/dev/null || echo "0")
      else
        current_mod=$(stat -c %Y "$SIGNAL_FILE" 2>/dev/null || echo "0")
      fi
      if [ "$current_mod" != "$last_mod" ]; then
        break
      fi
    fi
  done
fi
