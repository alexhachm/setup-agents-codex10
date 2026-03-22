#!/usr/bin/env bash
# Launch a provider-backed agent in the specified project directory.
# Usage: launch-agent.sh <project-dir> <model-or-alias> <slash-command>
set -uo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: launch-agent.sh <project-dir> <model> <slash-command>" >&2
  exit 1
fi

DIR="$1"
MODEL="$2"
CMD="$3"

if [ ! -d "$DIR" ]; then
  echo "ERROR: Directory not found: $DIR" >&2
  exit 1
fi
cd "$DIR" || {
  echo "ERROR: Cannot cd to $DIR" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

# Ensure codex10 CLI is on PATH (project wrapper + coordinator bin).
export MAC10_NAMESPACE="${MAC10_NAMESPACE:-codex10}"
SHIM_DIR="$DIR/.codex/scripts/.codex10-shims"
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
export PATH="$SCRIPT_DIR/../coordinator/bin:$SHIM_DIR:$DIR/.codex/scripts:$PATH"

# Source nvm if available (ensures consistent Node.js version)
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null

mac10_load_provider_config "$DIR"
CLI_NAME="$(mac10_provider_cli)"
MODEL_RESOLVED="$(mac10_resolve_role_model "$MODEL")"
PROMPT_FILE="$(mac10_resolve_prompt_file "$DIR" "$CMD" "$SCRIPT_DIR" || true)"

if [ -z "${PROMPT_FILE:-}" ]; then
  echo "ERROR: No command template found for '$CMD' (expected .codex/commands/<name>.md)" >&2
  exit 1
fi

if ! command -v "$CLI_NAME" >/dev/null 2>&1; then
  echo "ERROR: '$CLI_NAME' command not found in PATH" >&2
  exit 1
fi

export MAC10_AGENT_ROLE="$CMD"

if [ "$CMD" = "/master-loop" ]; then
  mac10_run_interactive_prompt "$DIR" "$PROMPT_FILE" "$MODEL_RESOLVED"
  exit $?
fi

BACKOFF=3
MAX_BACKOFF=60
while true; do
  START_TIME=$(date +%s)
  mac10_run_noninteractive_prompt "$DIR" "$PROMPT_FILE" "$MODEL_RESOLVED" 2>&1 || true
  END_TIME=$(date +%s)
  ELAPSED=$(( END_TIME - START_TIME ))
  echo "[launch-agent] provider=${MAC10_AGENT_PROVIDER} cli=${CLI_NAME} cmd=${CMD} exited after ${ELAPSED}s"
  if [ "$ELAPSED" -gt 10 ]; then
    BACKOFF=3
  else
    echo "[launch-agent] WARNING: $CMD exited very quickly (${ELAPSED}s)"
    BACKOFF=$(( BACKOFF * 2 > MAX_BACKOFF ? MAX_BACKOFF : BACKOFF * 2 ))
  fi
  echo "[launch-agent] Restarting in ${BACKOFF}s..."
  sleep "$BACKOFF"
done
