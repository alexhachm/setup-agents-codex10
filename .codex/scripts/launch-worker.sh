#!/usr/bin/env bash
# Launch a worker sentinel on demand.
# Usage: launch-worker.sh <worker-number>
set -euo pipefail

WORKER_NUM="${1:-}"
if [ -z "$WORKER_NUM" ]; then
  echo "Usage: launch-worker.sh <worker-number>" >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WORKTREE="$PROJECT_DIR/.worktrees/wt-$WORKER_NUM"
SENTINEL="$PROJECT_DIR/.codex/scripts/worker-sentinel.sh"
WINDOW_NAME="worker-$WORKER_NUM"
NAMESPACE="${MAC10_NAMESPACE:-codex10}"
if command -v md5sum >/dev/null 2>&1; then
  PROJECT_HASH="$(printf '%s' "$PROJECT_DIR" | md5sum | awk '{print substr($1,1,6)}')"
else
  PROJECT_HASH="$(printf '%s' "$PROJECT_DIR" | cksum | awk '{print $1}')"
fi
SESSION="${NAMESPACE}-${PROJECT_HASH}"

if [ ! -d "$WORKTREE" ]; then
  echo "ERROR: Worktree not found: $WORKTREE" >&2
  exit 1
fi
if [ ! -f "$SENTINEL" ]; then
  echo "ERROR: Worker sentinel not found: $SENTINEL" >&2
  exit 1
fi

if command -v tmux >/dev/null 2>&1; then
  tmux has-session -t "$SESSION" 2>/dev/null || tmux new-session -d -s "$SESSION" -n bootstrap "bash"
  if tmux list-windows -t "$SESSION" -F '#{window_name}' | grep -qx "$WINDOW_NAME"; then
    tmux kill-window -t "$SESSION:$WINDOW_NAME" 2>/dev/null || true
  fi
  tmux new-window -t "$SESSION" -n "$WINDOW_NAME" -c "$WORKTREE" "bash \"$SENTINEL\" \"$WORKER_NUM\" \"$PROJECT_DIR\""
  echo "[LAUNCH_WORKER] $WINDOW_NAME launched in tmux session '$SESSION'"
  exit 0
fi

if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
  WT_EXE="/mnt/c/Users/$USER/AppData/Local/Microsoft/WindowsApps/wt.exe"
  if [ -f "$WT_EXE" ]; then
    DISTRO="${WSL_DISTRO_NAME:-Ubuntu}"
    "$WT_EXE" -w workers new-tab --title "Worker-$WORKER_NUM" -- \
      wsl.exe -d "$DISTRO" -- bash "$SENTINEL" "$WORKER_NUM" "$PROJECT_DIR" >/dev/null 2>&1 &
    echo "[LAUNCH_WORKER] $WINDOW_NAME terminal opened via Windows Terminal"
    exit 0
  fi
fi

bash "$SENTINEL" "$WORKER_NUM" "$PROJECT_DIR" >/dev/null 2>&1 &
echo "[LAUNCH_WORKER] $WINDOW_NAME launched in background"
