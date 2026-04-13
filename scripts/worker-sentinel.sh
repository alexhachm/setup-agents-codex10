#!/usr/bin/env bash
# mac10 worker sentinel — runs in a tmux window.
# Waits for tasks via mac10 inbox, syncs git, launches the worker agent, resets on exit.
set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"

WORKER_ID="${1:?Usage: worker-sentinel.sh <worker_id> <project_dir>}"
PROJECT_DIR="${2:?Usage: worker-sentinel.sh <worker_id> <project_dir>}"

# In sandbox/microVM mode, /workspace IS the worktree (volume-mounted directly).
if [ "${MAC10_SANDBOX:-}" = "1" ]; then
  WORKTREE="$PROJECT_DIR"
else
  WORKTREE="$PROJECT_DIR/.worktrees/wt-$WORKER_ID"
fi

if [ ! -d "$WORKTREE" ]; then
  echo "[sentinel-$WORKER_ID] ERROR: Worktree not found: $WORKTREE" >&2
  exit 1
fi
cd "$WORKTREE"

# Start Xvfb virtual display for headless Chromium (sandbox/Docker only)
XVFB_PID=""
if [ -n "${DISPLAY:-}" ] && command -v Xvfb &>/dev/null; then
  Xvfb "${DISPLAY}" -screen 0 1280x720x24 -ac &>/dev/null &
  XVFB_PID=$!
  echo "[sentinel-$WORKER_ID] Xvfb started on ${DISPLAY} (PID: $XVFB_PID)"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

# Ensure coordinator CLI is on PATH.
# Create namespace-aware shims that call the coordinator binary directly,
# bypassing wrapper scripts in .claude/scripts/ that may hardcode a different
# MAC10_NAMESPACE. The coordinator sets MAC10_NAMESPACE in the environment
# when spawning this sentinel; the shims preserve it.
export PATH="$PROJECT_DIR/.claude/scripts:$PATH"

# Resolve the coordinator binary path from an existing wrapper script
MAC10_BIN=""
for _wrapper in "$PROJECT_DIR/.claude/scripts/mac10"; do
  if [ -f "$_wrapper" ]; then
    _candidate="$(grep -m1 '^MAC10_BIN=' "$_wrapper" 2>/dev/null | cut -d'"' -f2)"
    if [ -n "$_candidate" ] && [ -f "$_candidate" ]; then
      MAC10_BIN="$_candidate"
      break
    fi
  fi
done
if [ -z "$MAC10_BIN" ]; then
  # Fallback: derive from the harness repo structure
  MAC10_BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/coordinator/bin/mac10"
fi

SHIM_DIR="$PROJECT_DIR/.claude/scripts/.ns-shims"
mkdir -p "$SHIM_DIR"
# Generate a shim that calls the coordinator binary directly with the correct namespace.
for _shim_name in mac10; do
  cat > "$SHIM_DIR/$_shim_name" << SHIM
#!/usr/bin/env bash
export MAC10_NAMESPACE="${MAC10_NAMESPACE}"
exec node "${MAC10_BIN}" --project "${PROJECT_DIR}" "\$@"
SHIM
  chmod +x "$SHIM_DIR/$_shim_name"
done
export PATH="$SHIM_DIR:$PATH"
MAC10_CMD="$SHIM_DIR/mac10"

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
  [ -n "${XVFB_PID:-}" ] && kill "$XVFB_PID" 2>/dev/null || true
  echo "[sentinel-$WORKER_ID] Cleaning up..."
  reset_worker_with_context
}
trap cleanup EXIT INT TERM

echo "[sentinel-$WORKER_ID] Ready in $WORKTREE"

launch_worker_agent() {
  # Sync with latest main when possible. Preserve worker state on conflicts;
  # worker-loop will report a task failure instead of the sentinel resetting it.
  if git remote get-url origin >/dev/null 2>&1; then
    git fetch origin 2>/dev/null || true
    if git rev-parse --verify origin/main >/dev/null 2>&1; then
      git rebase origin/main 2>/dev/null || {
        git rebase --abort 2>/dev/null || true
        echo "[sentinel-$WORKER_ID] sync failed; preserving worktree state"
      }
    else
      echo "[sentinel-$WORKER_ID] origin/main unavailable; skipping sync"
    fi
  else
    echo "[sentinel-$WORKER_ID] no origin remote; skipping sync"
  fi

  # Reload provider config so provider/model changes in agent-launcher.env
  # take effect on next launch cycle without restarting the sentinel.
  mac10_load_provider_config "$PROJECT_DIR"
  AGENT_CLI="$(mac10_provider_cli)"
  WORKER_MODEL="$(mac10_resolve_role_model worker)"

  # Launch worker agent for one non-interactive worker-loop cycle.
  PROMPT_FILE="$WORKTREE/.claude/commands/worker-loop.md"
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
