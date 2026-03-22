#!/usr/bin/env bash
# mac10 worker sentinel — runs in a tmux window.
# Waits for tasks via mac10 inbox, syncs git, launches the configured coding agent, resets on exit.
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
export PATH="$PROJECT_DIR/.codex/scripts:$PATH"
if [ "${MAC10_NAMESPACE:-}" = "codex10" ]; then
  SHIM_DIR="$PROJECT_DIR/.codex/scripts/.codex10-shims"
  mkdir -p "$SHIM_DIR"
  cat > "$SHIM_DIR/mac10" <<'SHIM'
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

mac10_load_provider_config "$PROJECT_DIR"
AGENT_CLI="$(mac10_provider_cli)"
WORKER_MODEL="$(mac10_resolve_role_model worker)"
CURRENT_EXPECTED_TASK_ID=""
CURRENT_EXPECTED_ASSIGNMENT_TOKEN=""

parse_assignment_field() {
  local json_input="$1"
  local field_name="$2"
  node -e '
const payload = process.argv[1] || "";
const field = process.argv[2] || "";
for (const line of payload.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) continue;
  try {
    const msg = JSON.parse(trimmed);
    const value = msg && msg.payload ? msg.payload[field] : undefined;
    if (value !== undefined && value !== null && String(value) !== "") {
      process.stdout.write(String(value));
      process.exit(0);
    }
  } catch {}
}
process.exit(0);
' "$json_input" "$field_name"
}

set_expected_assignment_from_task_json() {
  local task_json="$1"
  CURRENT_EXPECTED_TASK_ID="$(node -e '
const input = process.argv[1] || "";
try {
  const task = JSON.parse(input);
  if (task && task.id !== undefined && task.id !== null) process.stdout.write(String(task.id));
} catch {}
' "$task_json")"
}

reset_worker_state() {
  local reset_arg="$WORKER_ID"
  if [ -n "$CURRENT_EXPECTED_TASK_ID" ] || [ -n "$CURRENT_EXPECTED_ASSIGNMENT_TOKEN" ]; then
    reset_arg="${WORKER_ID}|${CURRENT_EXPECTED_TASK_ID}|${CURRENT_EXPECTED_ASSIGNMENT_TOKEN}"
  fi
  "$MAC10_CMD" reset-worker "$reset_arg" 2>/dev/null || true
}

cleanup() {
  echo "[sentinel-$WORKER_ID] Cleaning up..."
  reset_worker_state
}
trap cleanup EXIT INT TERM

echo "[sentinel-$WORKER_ID] Ready in $WORKTREE with provider=${MAC10_AGENT_PROVIDER} cli=${AGENT_CLI} model=${WORKER_MODEL}"

refresh_worker_docs() {
  local worker_claude="$PROJECT_DIR/.codex/worker-claude.md"
  local worker_agents="$PROJECT_DIR/.codex/worker-agents.md"

  if [ -f "$worker_claude" ]; then
    cp "$worker_claude" "$WORKTREE/CLAUDE.md"
  fi
  if [ -f "$worker_agents" ]; then
    cp "$worker_agents" "$WORKTREE/AGENTS.md"
  elif [ -f "$worker_claude" ]; then
    cp "$worker_claude" "$WORKTREE/AGENTS.md"
  fi
}

refresh_worker_docs

launch_worker_agent() {
  # Auto-save any local changes before rebase to prevent data loss
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    git add -A
    git commit -m "[auto-save] preserve working changes before rebase" 2>/dev/null || true
    echo "[sentinel-$WORKER_ID] Auto-saved local changes before rebase."
  fi
  git fetch origin 2>/dev/null || true
  git rebase origin/main 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    echo "[sentinel-$WORKER_ID] Rebase failed; changes preserved in commits."
  }

  # Root-level AGENTS/CLAUDE files are auto-loaded by the provider CLIs.
  # Always refresh them from the canonical worker templates so stale task
  # overlays from older assignments cannot override the current my-task result.
  refresh_worker_docs

  PROMPT_FILE="$WORKTREE/.codex/commands/worker-loop.md"
  if [ -f "$PROJECT_DIR/.codex/commands-codex10/worker-loop.md" ]; then
    PROMPT_FILE="$PROJECT_DIR/.codex/commands-codex10/worker-loop.md"
  fi

  (
    while kill -0 $$ 2>/dev/null; do
      "$MAC10_CMD" heartbeat "$WORKER_ID" 2>/dev/null || true
      sleep 30
    done
  ) &
  HEARTBEAT_PID=$!

  echo "[sentinel-$WORKER_ID] Launching ${AGENT_CLI} (heartbeat pid=$HEARTBEAT_PID)..."
  mac10_run_noninteractive_prompt "$WORKTREE" "$PROMPT_FILE" "$WORKER_MODEL" 2>&1 || true

  kill "$HEARTBEAT_PID" 2>/dev/null || true
  wait "$HEARTBEAT_PID" 2>/dev/null || true

  echo "[sentinel-$WORKER_ID] ${AGENT_CLI} exited, resetting to idle..."
  reset_worker_state
}

EXISTING=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
if echo "$EXISTING" | grep -q '"id"'; then
  set_expected_assignment_from_task_json "$EXISTING"
  echo "[sentinel-$WORKER_ID] Found existing task on startup — launching immediately"
  launch_worker_agent
fi

while true; do
  echo "[sentinel-$WORKER_ID] Waiting for task..."
  MSGS=$("$MAC10_CMD" inbox "worker-$WORKER_ID" --block --timeout=300000 2>/dev/null || echo "")

  if echo "$MSGS" | grep -q "task_assigned"; then
    CURRENT_EXPECTED_TASK_ID="$(parse_assignment_field "$MSGS" "task_id")"
    CURRENT_EXPECTED_ASSIGNMENT_TOKEN="$(parse_assignment_field "$MSGS" "assignment_token")"
    echo "[sentinel-$WORKER_ID] Task received, syncing..."
    launch_worker_agent
  else
    ORPHAN=$("$MAC10_CMD" my-task "$WORKER_ID" 2>/dev/null || echo "")
    if echo "$ORPHAN" | grep -q '"id"'; then
      set_expected_assignment_from_task_json "$ORPHAN"
      CURRENT_EXPECTED_ASSIGNMENT_TOKEN=""
      echo "[sentinel-$WORKER_ID] Found orphaned task assignment — launching ${AGENT_CLI}"
      launch_worker_agent
    else
      echo "[sentinel-$WORKER_ID] No task received, retrying..."
    fi
  fi
done
