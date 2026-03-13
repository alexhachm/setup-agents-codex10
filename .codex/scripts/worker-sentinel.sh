#!/usr/bin/env bash
# mac10 worker sentinel — runs in a tmux window.
# Waits for tasks via mac10 inbox, syncs git, launches codex, resets on exit.
set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"

WORKER_ID="${1:?Usage: worker-sentinel.sh <worker_id> <project_dir>}"
PROJECT_DIR="${2:?Usage: worker-sentinel.sh <worker_id> <project_dir>}"
WORKTREE="$PROJECT_DIR/.worktrees/wt-$WORKER_ID"

if [ ! -d "$WORKTREE" ]; then
  echo "[sentinel-$WORKER_ID] ERROR: Worktree not found: $WORKTREE" >&2
  exit 1
fi
cd "$WORKTREE"

# Ensure coordinator CLI is on PATH
export PATH="$PROJECT_DIR/.codex/scripts:$PATH"
if [ "${MAC10_NAMESPACE:-}" = "codex10" ]; then
  SHIM_DIR="$PROJECT_DIR/.codex/scripts/.codex10-shims"
  mkdir -p "$SHIM_DIR"
  cat > "$SHIM_DIR/mac10" << 'SHIM'
#!/usr/bin/env bash
set -euo pipefail
PROJECT_SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -x "$PROJECT_SCRIPTS/codex10" ]; then
  exec "$PROJECT_SCRIPTS/codex10" "$@"
fi
if [ -x "$PROJECT_SCRIPTS/mac10-codex10" ]; then
  exec "$PROJECT_SCRIPTS/mac10-codex10" "$@"
fi
echo "ERROR: codex10 wrapper missing in $PROJECT_SCRIPTS" >&2
exit 1
SHIM
  chmod +x "$SHIM_DIR/mac10"
  export PATH="$SHIM_DIR:$PATH"
  if [ -x "$PROJECT_DIR/.codex/scripts/codex10" ]; then
    MAC10_CMD="$PROJECT_DIR/.codex/scripts/codex10"
  elif [ -x "$PROJECT_DIR/.codex/scripts/mac10-codex10" ]; then
    MAC10_CMD="$PROJECT_DIR/.codex/scripts/mac10-codex10"
  else
    echo "[sentinel-$WORKER_ID] ERROR: Missing codex10 coordinator wrapper (.codex/scripts/codex10)" >&2
    exit 1
  fi
else
  MAC10_CMD="mac10"
fi

cleanup() {
  echo "[sentinel-$WORKER_ID] Cleaning up..."
  "$MAC10_CMD" reset-worker "$WORKER_ID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[sentinel-$WORKER_ID] Ready in $WORKTREE"

launch_codex() {
  # Sync with latest main
  git fetch origin 2>/dev/null || true
  git rebase origin/main 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    git reset --hard origin/main 2>/dev/null || true
  }

  # Launch Codex worker for one non-interactive worker-loop cycle.
  PROMPT_FILE="$WORKTREE/.codex/commands/worker-loop.md"
  if [ -f "$PROJECT_DIR/.codex/commands-codex10/worker-loop.md" ]; then
    PROMPT_FILE="$PROJECT_DIR/.codex/commands-codex10/worker-loop.md"
  fi
  echo "[sentinel-$WORKER_ID] Launching codex..."
  codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$WORKTREE" - < "$PROMPT_FILE" 2>&1 || true

  # Reset worker status to idle after Codex exits
  echo "[sentinel-$WORKER_ID] Codex exited, resetting to idle..."
  "$MAC10_CMD" reset-worker "$WORKER_ID" 2>/dev/null || true
}

# On startup: check if we already have an assigned task (inbox message may have been missed)
EXISTING=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
if echo "$EXISTING" | grep -q '"id"'; then
  echo "[sentinel-$WORKER_ID] Found existing task on startup — launching immediately"
  launch_codex
fi

while true; do
  # Wait for task assignment (blocks up to 5 minutes)
  echo "[sentinel-$WORKER_ID] Waiting for task..."
  MSGS=$("$MAC10_CMD" inbox "worker-$WORKER_ID" --block --timeout=300000 2>/dev/null || echo "")

  # Check if we got a task_assigned message
  if echo "$MSGS" | grep -q "task_assigned"; then
    echo "[sentinel-$WORKER_ID] Task received, syncing..."
    launch_codex
  else
    # No task received (timeout or empty response) — check for orphaned assignment before looping
    ORPHAN=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
    if echo "$ORPHAN" | grep -q '"id"'; then
      echo "[sentinel-$WORKER_ID] Found orphaned task assignment — launching codex"
      launch_codex
    else
      echo "[sentinel-$WORKER_ID] No task received, retrying..."
    fi
  fi
done
