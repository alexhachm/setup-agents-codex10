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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

# Ensure coordinator CLI is on PATH
export PATH="$PROJECT_DIR/.claude/scripts:$PATH"
if [ "${MAC10_NAMESPACE:-}" = "codex10" ]; then
  SHIM_DIR="$PROJECT_DIR/.claude/scripts/.codex10-shims"
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
  if [ -x "$PROJECT_DIR/.claude/scripts/codex10" ]; then
    MAC10_CMD="$PROJECT_DIR/.claude/scripts/codex10"
  elif [ -x "$PROJECT_DIR/.claude/scripts/mac10-codex10" ]; then
    MAC10_CMD="$PROJECT_DIR/.claude/scripts/mac10-codex10"
  else
    echo "[sentinel-$WORKER_ID] ERROR: Missing codex10 coordinator wrapper (.claude/scripts/codex10)" >&2
    exit 1
  fi
else
  MAC10_CMD="mac10"
fi

RESET_EXPECTED_TASK_ID=""
RESET_EXPECTED_ASSIGNMENT_TOKEN=""
HEARTBEAT_PID=""

read_reset_context() {
  RESET_EXPECTED_TASK_ID=""
  RESET_EXPECTED_ASSIGNMENT_TOKEN=""

  local task_payload parsed
  task_payload=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
  parsed=$(printf '%s' "$task_payload" | node -e '
const fs = require("fs");
let raw = "";
try { raw = fs.readFileSync(0, "utf8"); } catch {}
let task = null;
try {
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object") {
    if (parsed.task && typeof parsed.task === "object") task = parsed.task;
    else if (Object.prototype.hasOwnProperty.call(parsed, "id")) task = parsed;
  }
} catch {}
const taskId = task && Number.isInteger(task.id) ? String(task.id) : "";
const token = task && typeof task.assignment_token === "string"
  ? task.assignment_token.trim()
  : "";
process.stdout.write(`${taskId}|${token}`);
' 2>/dev/null || echo "|")

  if [[ "$parsed" != *"|"* ]]; then
    parsed="|"
  fi
  RESET_EXPECTED_TASK_ID="${parsed%%|*}"
  RESET_EXPECTED_ASSIGNMENT_TOKEN="${parsed#*|}"
}

build_reset_worker_arg() {
  if [ -n "$RESET_EXPECTED_TASK_ID" ] || [ -n "$RESET_EXPECTED_ASSIGNMENT_TOKEN" ]; then
    printf '%s|%s|%s' "$WORKER_ID" "$RESET_EXPECTED_TASK_ID" "$RESET_EXPECTED_ASSIGNMENT_TOKEN"
    return 0
  fi
  printf '%s' "$WORKER_ID"
}

reset_worker_with_context() {
  local reset_arg
  reset_arg="$(build_reset_worker_arg)"
  "$MAC10_CMD" reset-worker "$reset_arg" 2>/dev/null || true
}

stop_heartbeat_loop() {
  if [ -n "${HEARTBEAT_PID:-}" ]; then
    kill "$HEARTBEAT_PID" 2>/dev/null || true
    wait "$HEARTBEAT_PID" 2>/dev/null || true
    HEARTBEAT_PID=""
  fi
}

start_heartbeat_loop() {
  stop_heartbeat_loop
  "$MAC10_CMD" heartbeat "$WORKER_ID" >/dev/null 2>&1 || true
  (
    while true; do
      sleep 25
      "$MAC10_CMD" heartbeat "$WORKER_ID" >/dev/null 2>&1 || true
    done
  ) &
  HEARTBEAT_PID=$!
}

cleanup() {
  stop_heartbeat_loop
  echo "[sentinel-$WORKER_ID] Cleaning up..."
  reset_worker_with_context
}
trap cleanup EXIT INT TERM

echo "[sentinel-$WORKER_ID] Ready in $WORKTREE"

launch_worker_agent() {
  # Sync with latest main
  git fetch origin 2>/dev/null || true
  git rebase origin/main 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    echo "[sentinel-$WORKER_ID] skipping hard reset to preserve worktree state"
  }

  # Reload provider config so provider/model changes in agent-launcher.env
  # take effect on next launch cycle without restarting the sentinel.
  mac10_load_provider_config "$PROJECT_DIR"
  AGENT_CLI="$(mac10_provider_cli)"
  WORKER_MODEL="$(mac10_resolve_role_model worker)"

  # Launch worker agent for one non-interactive worker-loop cycle.
  PROMPT_FILE="$WORKTREE/.claude/commands/worker-loop.md"
  if [ -f "$PROJECT_DIR/.claude/commands-codex10/worker-loop.md" ]; then
    PROMPT_FILE="$PROJECT_DIR/.claude/commands-codex10/worker-loop.md"
  fi
  read_reset_context
  start_heartbeat_loop
  echo "[sentinel-$WORKER_ID] Launching ${AGENT_CLI} (provider=${MAC10_AGENT_PROVIDER} model=${WORKER_MODEL})..."
  mac10_run_noninteractive_prompt "$WORKTREE" "$PROMPT_FILE" "$WORKER_MODEL" 2>&1 || true
  stop_heartbeat_loop

  # Reset worker status to idle after agent exits
  echo "[sentinel-$WORKER_ID] ${AGENT_CLI} exited, resetting to idle..."
  reset_worker_with_context
  RESET_EXPECTED_TASK_ID=""
  RESET_EXPECTED_ASSIGNMENT_TOKEN=""
}

# On startup: check if we already have an assigned task (inbox message may have been missed)
EXISTING=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
if echo "$EXISTING" | grep -q '"id"'; then
  echo "[sentinel-$WORKER_ID] Found existing task on startup — launching immediately"
  launch_worker_agent
fi

while true; do
  # Wait for task assignment (blocks up to 5 minutes)
  echo "[sentinel-$WORKER_ID] Waiting for task..."
  MSGS=$("$MAC10_CMD" inbox "worker-$WORKER_ID" --block --timeout=300000 2>/dev/null || echo "")

  # Check if we got a task_assigned message
  if echo "$MSGS" | grep -q "task_assigned"; then
    echo "[sentinel-$WORKER_ID] Task received, syncing..."
    launch_worker_agent
  else
    # No task received (timeout or empty response) — check for orphaned assignment before looping
    ORPHAN=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
    if echo "$ORPHAN" | grep -q '"id"'; then
      echo "[sentinel-$WORKER_ID] Found orphaned task assignment — launching ${AGENT_CLI:-agent}"
      launch_worker_agent
    else
      echo "[sentinel-$WORKER_ID] No task received, retrying..."
    fi
  fi
done
