#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/provider-utils.sh"
NO_ISOLATE="${MAC10_LIVE_NO_ISOLATE:-0}"
POSITIONAL_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --live) NO_ISOLATE=1 ;;
    *) POSITIONAL_ARGS+=("$arg") ;;
  esac
done
SOURCE_INPUT="${POSITIONAL_ARGS[0]:-$REPO_DIR}"
SOURCE_DIR="$(cd "$SOURCE_INPUT" && pwd)"
FAILURE_INPUT="${POSITIONAL_ARGS[1]:-}"

# Resolve provider so we can pick the right default model.
mac10_load_provider_config "$SOURCE_DIR"
if [ -n "${MAC10_FORCE_PROVIDER:-}" ]; then
  MAC10_AGENT_PROVIDER="$MAC10_FORCE_PROVIDER"
fi
export MAC10_AGENT_PROVIDER
MODEL_NAME="${POSITIONAL_ARGS[2]:-$(mac10_default_deep_model "$MAC10_AGENT_PROVIDER")}"

if [ -z "$FAILURE_INPUT" ]; then
  echo "Usage: bash scripts/launch-gpt-live-e2e-repair.sh <source_dir> <failure_artifact_or_manifest> [model]" >&2
  exit 1
fi

FAILURE_TARGET="$(cd "$SOURCE_DIR" && realpath "$FAILURE_INPUT")"
if [ ! -f "$FAILURE_TARGET" ]; then
  echo "ERROR: Failure artifact or manifest not found: $FAILURE_INPUT" >&2
  exit 1
fi

FAILURE_SET_FILE=""
PRIMARY_FAILURE_ARTIFACT="$FAILURE_TARGET"
if [[ "$FAILURE_TARGET" == *.json ]]; then
  FAILURE_SET_FILE="$FAILURE_TARGET"
  PRIMARY_FAILURE_ARTIFACT="$(FAILURE_SET_FILE="$FAILURE_SET_FILE" node - <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.env.FAILURE_SET_FILE, 'utf8'));
const failures = Array.isArray(manifest.failure_artifacts) ? manifest.failure_artifacts : [];
process.stdout.write(String(failures[0] || ''));
NODE
)"
fi

RUN_ID="${MAC10_LIVE_REPAIR_RUN_ID:-repair-$(date -u +%Y%m%dT%H%M%SZ)}"
RUN_DIR="$SOURCE_DIR/status/live-repairs/$RUN_ID"
# Prompt template always comes from the harness repo, not the target repo.
PROMPT_FILE="$REPO_DIR/templates/commands/live-e2e-gpt-repair.md"

if [ "$NO_ISOLATE" = "1" ]; then
  TEST_DIR="$SOURCE_DIR"
  ISOLATION_MODE="live"
else
  TEST_DIR="$SOURCE_DIR/.live-e2e-workspaces/$RUN_ID"
  ISOLATION_MODE="isolated"
fi
SUMMARY_FILE="$RUN_DIR/summary.md"
NOTES_FILE="$RUN_DIR/notes.md"
NAMESPACE_SUFFIX="$(printf '%s' "$RUN_ID" | tr -cd '[:alnum:]' | tr '[:upper:]' '[:lower:]' | tail -c 17)"
TEST_NAMESPACE="liverepair-${NAMESPACE_SUFFIX:-latest}"

PROVIDER_CLI="$(mac10_provider_cli)"
if ! command -v "$PROVIDER_CLI" >/dev/null 2>&1; then
  echo "ERROR: $PROVIDER_CLI CLI not found on PATH (provider=$MAC10_AGENT_PROVIDER)" >&2
  exit 1
fi

mkdir -p "$RUN_DIR"

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
      --exclude 'status/live-repairs/' \
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
    --exclude='status/live-repairs' \
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
    git -C "$TEST_DIR" -c user.name="e2e" -c user.email="e2e@localhost" commit -q --allow-empty -m "E2E repair workspace init"
    git -C "$TEST_DIR" add -A 2>/dev/null || true
    git -C "$TEST_DIR" -c user.name="e2e" -c user.email="e2e@localhost" commit -q -m "E2E repair workspace snapshot" 2>/dev/null || true
  fi
else
  echo "[live-repair] running in LIVE mode against real repo (no isolation)"
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "ERROR: Prompt template not found: $PROMPT_FILE" >&2
  exit 1
fi

export MAC10_LIVE_REPAIR_RUN_ID="$RUN_ID"
export MAC10_LIVE_REPAIR_RUN_DIR="$RUN_DIR"
export MAC10_LIVE_REPAIR_HARNESS_DIR="$REPO_DIR"
export MAC10_LIVE_REPAIR_SOURCE_PROJECT_DIR="$SOURCE_DIR"
export MAC10_LIVE_REPAIR_TEST_PROJECT_DIR="$TEST_DIR"
export MAC10_LIVE_REPAIR_FAILURE_ARTIFACT="$PRIMARY_FAILURE_ARTIFACT"
export MAC10_LIVE_REPAIR_FAILURE_SET_FILE="$FAILURE_SET_FILE"
export MAC10_LIVE_REPAIR_SUMMARY_FILE="$SUMMARY_FILE"
export MAC10_LIVE_REPAIR_NOTES_FILE="$NOTES_FILE"
export MAC10_LIVE_ISOLATION_MODE="$ISOLATION_MODE"
export MAC10_NAMESPACE="$TEST_NAMESPACE"
export MAC10_FORCE_PROVIDER="${MAC10_AGENT_PROVIDER}"
export MAC10_DEFAULT_PROVIDER="${MAC10_AGENT_PROVIDER}"

echo "[live-repair] run_id=$RUN_ID"
echo "[live-repair] isolation=$ISOLATION_MODE"
echo "[live-repair] harness_dir=$REPO_DIR"
echo "[live-repair] target_dir=$SOURCE_DIR"
echo "[live-repair] test_dir=$TEST_DIR"
echo "[live-repair] run_dir=$RUN_DIR"
echo "[live-repair] failure_artifact=$PRIMARY_FAILURE_ARTIFACT"
echo "[live-repair] failure_set_file=${FAILURE_SET_FILE:-none}"
echo "[live-repair] namespace=$TEST_NAMESPACE"
echo "[live-repair] model=$MODEL_NAME"
echo "[live-repair] provider=$MAC10_AGENT_PROVIDER"

mac10_run_noninteractive_prompt "$TEST_DIR" "$PROMPT_FILE" "$MODEL_NAME"
