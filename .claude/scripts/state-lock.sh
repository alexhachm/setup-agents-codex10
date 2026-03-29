#!/usr/bin/env bash
# Usage: state-lock.sh <state-file> <command>
# Acquires an exclusive lock before running <command>, releases after.
set -e

STATE_FILE="$1"
shift

if [ -z "${STATE_FILE:-}" ] || [ "$#" -lt 1 ]; then
  echo "Usage: state-lock.sh <state-file> <command>" >&2
  exit 1
fi

LOCK_DIR="${STATE_FILE}.lockdir"

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

# Stale lock recovery (30s)
if [ -d "$LOCK_DIR" ]; then
  if [[ "$OSTYPE" == darwin* ]]; then
    lock_age=$(( $(date +%s) - $(stat -f %m "$LOCK_DIR" 2>/dev/null || echo 0) ))
  else
    lock_age=$(( $(date +%s) - $(stat -c %Y "$LOCK_DIR" 2>/dev/null || echo 0) ))
  fi
  if [ "$lock_age" -gt 30 ]; then
    echo "WARN: Removing stale lock on $STATE_FILE (${lock_age}s old)" >&2
    rmdir "$LOCK_DIR" 2>/dev/null || rm -rf "$LOCK_DIR"
  fi
fi

if command -v flock >/dev/null 2>&1; then
  LOCK_FILE="${STATE_FILE}.lock"
  exec 200>"$LOCK_FILE"
  flock -w 10 200 || {
    echo "ERROR: Could not acquire lock on $STATE_FILE" >&2
    exit 1
  }
  eval "$@"
  exec 200>&-
else
  attempts=0
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 100 ]; then
      echo "ERROR: Could not acquire lock on $STATE_FILE after 10s" >&2
      exit 1
    fi
    sleep 0.1
  done
  trap cleanup EXIT INT TERM
  eval "$@"
  cleanup
  trap - EXIT INT TERM
fi
