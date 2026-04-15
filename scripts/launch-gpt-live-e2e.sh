#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/provider-utils.sh"
MODE_OVERRIDE="${MAC10_LIVE_MODE:-}"
if [ -z "$MODE_OVERRIDE" ] && [ -n "${MAC10_LIVE_NO_ISOLATE:-}" ]; then
  if [ "${MAC10_LIVE_NO_ISOLATE}" = "1" ]; then
    MODE_OVERRIDE="live"
  else
    MODE_OVERRIDE="isolated"
  fi
fi
AUDIT_MODE="${MODE_OVERRIDE:-live}"
POSITIONAL_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --live) AUDIT_MODE="live" ;;
    --isolated) AUDIT_MODE="isolated" ;;
    *) POSITIONAL_ARGS+=("$arg") ;;
  esac
done
SOURCE_INPUT="${POSITIONAL_ARGS[0]:-$REPO_DIR}"
SOURCE_DIR="$(cd "$SOURCE_INPUT" && pwd)"

# Resolve provider so we can pick the right default model.
# Load config first, then let MAC10_FORCE_PROVIDER override (config file
# unconditionally sets MAC10_AGENT_PROVIDER, so force must come after).
mac10_load_provider_config "$SOURCE_DIR"
if [ -n "${MAC10_FORCE_PROVIDER:-}" ]; then
  MAC10_AGENT_PROVIDER="$MAC10_FORCE_PROVIDER"
fi
export MAC10_AGENT_PROVIDER
MODEL_NAME="${POSITIONAL_ARGS[1]:-$(mac10_default_deep_model "$MAC10_AGENT_PROVIDER")}"
RUN_ID="${MAC10_LIVE_RUN_ID:-live-e2e-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_DIR="$SOURCE_DIR/status/live-runs/$RUN_ID"

# Harness assets (prompt template, manifest) always come from the harness repo
# (where this script lives), not the target repo being tested.
PROMPT_FILE="$REPO_DIR/templates/commands/live-e2e-gpt-launcher.md"
MANIFEST_FILE="$REPO_DIR/status/live-feature-manifest.json"

case "$AUDIT_MODE" in
  live|isolated) ;;
  *)
    echo "ERROR: MAC10_LIVE_MODE must be 'live' or 'isolated' (got: $AUDIT_MODE)" >&2
    exit 1
    ;;
esac

if [ "$AUDIT_MODE" = "live" ]; then
  TEST_DIR="$SOURCE_DIR"
  ISOLATION_MODE="live"
else
  TEST_DIR="$SOURCE_DIR/.live-e2e-workspaces/$RUN_ID"
  ISOLATION_MODE="isolated"
fi
CHECKLIST_FILE="$RUN_DIR/checklist.json"
SUMMARY_FILE="$RUN_DIR/summary.md"
NOTES_FILE="$RUN_DIR/notes.md"
FAILURES_DIR="$RUN_DIR/failures"
AGENT_LOG_FILE="$RUN_DIR/agent-output.log"
NAMESPACE_SUFFIX="$(printf '%s' "$RUN_ID" | tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]' | tail -c 17)"
TEST_NAMESPACE="livee2e-${NAMESPACE_SUFFIX:-latest}"
MAX_IDLE_SECONDS="${MAC10_LIVE_MAX_IDLE_SECONDS:-300}"
POLL_SECONDS="${MAC10_LIVE_WATCHDOG_POLL_SECONDS:-10}"

PROVIDER_CLI="$(mac10_provider_cli)"
if ! command -v "$PROVIDER_CLI" >/dev/null 2>&1; then
  echo "ERROR: $PROVIDER_CLI CLI not found on PATH (provider=$MAC10_AGENT_PROVIDER)" >&2
  exit 1
fi

mkdir -p "$FAILURES_DIR"

prepare_isolated_workspace() {
  mkdir -p "$SOURCE_DIR/.live-e2e-workspaces"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude '.git/' \
      --exclude 'node_modules/' \
      --exclude '.worktrees/' \
      --exclude '.live-e2e-workspaces/' \
      --exclude 'status/live-runs/' \
      --exclude '.claude/state/' \
      --exclude '.claude/logs/' \
      --exclude 'coordinator.db/' \
      --exclude '__pycache__/' \
      "$SOURCE_DIR/" "$TEST_DIR/"
    return 0
  fi

  tar -C "$SOURCE_DIR" \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='.worktrees' \
    --exclude='.live-e2e-workspaces' \
    --exclude='status/live-runs' \
    --exclude='.claude/state' \
    --exclude='.claude/logs' \
    --exclude='coordinator.db' \
    -cf - . | tar -C "$TEST_DIR" -xf -
}

if [ "$ISOLATION_MODE" = "isolated" ]; then
  prepare_isolated_workspace

  # Claude Code requires a git repo to function; init one in the isolated workspace
  if [ ! -d "$TEST_DIR/.git" ]; then
    git -C "$TEST_DIR" init -q -b main
    git -C "$TEST_DIR" -c user.name="e2e" -c user.email="e2e@localhost" commit -q --allow-empty -m "E2E workspace init"
    git -C "$TEST_DIR" add -A 2>/dev/null || true
    git -C "$TEST_DIR" -c user.name="e2e" -c user.email="e2e@localhost" commit -q -m "E2E workspace snapshot" 2>/dev/null || true
  fi
else
  echo "[live-e2e] running in LIVE mode against real repo (no isolation)"
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: Prompt template not found: $PROMPT_FILE" >&2
  exit 1
fi

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "ERROR: Feature manifest not found: $MANIFEST_FILE" >&2
  exit 1
fi

cp "$MANIFEST_FILE" "$CHECKLIST_FILE"

export MAC10_LIVE_RUN_ID="$RUN_ID"
export MAC10_LIVE_RUN_DIR="$RUN_DIR"
export MAC10_LIVE_FEATURE_MANIFEST="$MANIFEST_FILE"
export MAC10_LIVE_CHECKLIST="$CHECKLIST_FILE"
export MAC10_LIVE_PREFERRED_INTERFACE="${MAC10_LIVE_PREFERRED_INTERFACE:-master1}"
export MAC10_LIVE_MODE="$ISOLATION_MODE"
if [ "$ISOLATION_MODE" = "live" ]; then
  export MAC10_LIVE_NO_ISOLATE="1"
else
  export MAC10_LIVE_NO_ISOLATE="0"
fi
export MAC10_LIVE_HARNESS_DIR="$REPO_DIR"
export MAC10_LIVE_SOURCE_PROJECT_DIR="$SOURCE_DIR"
export MAC10_LIVE_REAL_PROJECT_DIR="$SOURCE_DIR"
export MAC10_LIVE_TEST_PROJECT_DIR="$TEST_DIR"
export MAC10_LIVE_ISOLATION_MODE="$ISOLATION_MODE"
export MAC10_NAMESPACE="$TEST_NAMESPACE"
export MAC10_FORCE_PROVIDER="${MAC10_AGENT_PROVIDER}"
export MAC10_DEFAULT_PROVIDER="${MAC10_AGENT_PROVIDER}"

echo "[live-e2e] run_id=$RUN_ID"
echo "[live-e2e] isolation=$ISOLATION_MODE"
echo "[live-e2e] harness_dir=$REPO_DIR"
echo "[live-e2e] target_dir=$SOURCE_DIR"
echo "[live-e2e] test_dir=$TEST_DIR"
echo "[live-e2e] run_dir=$RUN_DIR"
echo "[live-e2e] namespace=$TEST_NAMESPACE"
echo "[live-e2e] model=$MODEL_NAME"
echo "[live-e2e] provider=$MAC10_AGENT_PROVIDER"

python3 "$TEST_DIR/scripts/live-e2e-artifacts.py" init "Harness initialized run artifacts before agent startup."

record_harness_failure() {
  local message="$1"
  local failure_file="$FAILURES_DIR/harness_stall.md"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  cat > "$failure_file" <<EOF
# harness_stall

- timestamp: $timestamp
- run_id: $RUN_ID
- message: $message
- agent_log: $AGENT_LOG_FILE
EOF

  python3 - "$CHECKLIST_FILE" "$SUMMARY_FILE" "$NOTES_FILE" "$failure_file" "$message" "$timestamp" <<'PY'
import json
import pathlib
import sys

checklist_path = pathlib.Path(sys.argv[1])
summary_path = pathlib.Path(sys.argv[2])
notes_path = pathlib.Path(sys.argv[3])
failure_file = sys.argv[4]
message = sys.argv[5]
timestamp = sys.argv[6]

if checklist_path.exists():
    data = json.loads(checklist_path.read_text())
    scenarios = data.get("scenarios", [])
    target = None
    for scenario in scenarios:
        status = scenario.get("status", "pending")
        if status == "running":
            target = scenario
            break
    if target is None and scenarios:
        target = scenarios[0]
    if target is not None:
        target["status"] = "failed"
        target.setdefault("notes", []).append(message)
        target.setdefault("evidence", []).append(f"failure artifact: {failure_file}")
        target["finished_at"] = timestamp
    checklist_path.write_text(json.dumps(data, indent=2) + "\n")

summary_lines = [
    "# Live E2E Audit Summary",
    "",
    f"**Run ID:** {pathlib.Path(failure_file).parent.parent.name}",
    f"**Updated:** {timestamp}",
    "**Status:** failed",
    "",
    "## Harness failure",
    "",
    f"- {message}",
    f"- Failure artifact: `{failure_file}`",
]
summary_path.write_text("\n".join(summary_lines) + "\n")

with notes_path.open("a", encoding="utf-8") as fh:
    fh.write(f"- **{timestamp}** — HARNESS FAILURE: {message}\n")
PY
}

latest_progress_epoch() {
  python3 - "$RUN_DIR" <<'PY'
import pathlib
import sys

run_dir = pathlib.Path(sys.argv[1])
latest = 0.0
for path in run_dir.rglob('*'):
    if path.is_file():
        try:
            latest = max(latest, path.stat().st_mtime)
        except FileNotFoundError:
            pass
print(int(latest))
PY
}

touch "$AGENT_LOG_FILE"
mac10_run_noninteractive_prompt "$TEST_DIR" "$PROMPT_FILE" "$MODEL_NAME" >> "$AGENT_LOG_FILE" 2>&1 &
agent_pid=$!
last_progress="$(latest_progress_epoch)"

while kill -0 "$agent_pid" 2>/dev/null; do
  sleep "$POLL_SECONDS"
  current_progress="$(latest_progress_epoch)"
  now_epoch="$(date +%s)"
  if [ "$current_progress" -gt "$last_progress" ]; then
    last_progress="$current_progress"
    continue
  fi
  if [ $((now_epoch - last_progress)) -ge "$MAX_IDLE_SECONDS" ]; then
    echo "[live-e2e] ERROR: no artifact progress for ${MAX_IDLE_SECONDS}s; terminating audit" >&2
    kill "$agent_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$agent_pid" 2>/dev/null || true
    record_harness_failure "No artifact progress detected for ${MAX_IDLE_SECONDS}s. The audit runner stalled before updating checklist/notes."
    wait "$agent_pid" 2>/dev/null || true
    exit 1
  fi
done

wait "$agent_pid"
