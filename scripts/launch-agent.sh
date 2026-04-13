#!/usr/bin/env bash
# Launch an agent in the specified project directory.
# Usage: launch-agent.sh <project-dir> <model-or-alias> <slash-command>
# Avoids semicolons so Windows Terminal doesn't split the command.
set -euo pipefail

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
cd "$DIR"

# Ensure mac10 CLI is on PATH (project wrapper + coordinator bin)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

derive_mac10_namespace() {
  local project_dir="$1"
  local project_name
  project_name="$(basename "$project_dir" 2>/dev/null || echo 'project')"
  printf 'mac10-%s' "$project_name" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9-]/-/g' \
    | cut -c1-20
}

export MAC10_NAMESPACE="${MAC10_NAMESPACE:-$(derive_mac10_namespace "$DIR")}"
export MAC10_AGENT_ROLE="$CMD"

is_pid_alive() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

read_pid_file() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    tr -dc '0-9' < "$pid_file" | head -c 16 || true
  fi
}

runtime_role_key() {
  local role="${1#/}"
  printf '%s' "$role" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g'
}

find_existing_role_launcher() {
  local pid args
  pid="$(read_pid_file "$PID_FILE")"
  if is_pid_alive "$pid"; then
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if printf '%s' "$args" | grep -q 'launch-agent.sh' \
      && printf '%s' "$args" | grep -Fq "$DIR" \
      && printf '%s' "$args" | grep -Fq "$CMD"; then
      printf '%s\n' "$pid"
      return
    fi
  fi

  ps -eww -o pid= -o args= 2>/dev/null \
    | awk -v self="$$" -v project="$DIR" -v role="$CMD" '
      $1 != self && /launch-agent\.sh/ && index($0, project) && index($0, role) { print $1; exit }
    '
}

ROLE_KEY="$(runtime_role_key "$CMD")"
RUNTIME_DIR="$DIR/.claude/state/agent-runtimes"
LOCK_DIR="$RUNTIME_DIR/${ROLE_KEY}.lock"
PID_FILE="$RUNTIME_DIR/${ROLE_KEY}.pid"
INFO_FILE="$RUNTIME_DIR/${ROLE_KEY}.env"
mkdir -p "$RUNTIME_DIR"

EXISTING_PID="$(find_existing_role_launcher)"
if is_pid_alive "$EXISTING_PID"; then
  echo "[launch-agent] $CMD already running for $DIR (PID $EXISTING_PID); refusing duplicate launch."
  exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID="$(read_pid_file "$PID_FILE")"
  if is_pid_alive "$LOCK_PID"; then
    echo "[launch-agent] $CMD already has a live launcher lock for $DIR (PID $LOCK_PID); refusing duplicate launch."
    exit 0
  fi
  rm -rf "$LOCK_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[launch-agent] ERROR: could not acquire launcher lock: $LOCK_DIR" >&2
    exit 1
  fi
fi

printf '%s\n' "$$" > "$PID_FILE"
{
  printf 'project_dir=%s\n' "$DIR"
  printf 'namespace=%s\n' "$MAC10_NAMESPACE"
  printf 'role=%s\n' "$CMD"
  printf 'model=%s\n' "$MODEL"
  printf 'started_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$INFO_FILE"

cleanup_launcher_lock() {
  local current
  current="$(read_pid_file "$PID_FILE")"
  if [ "$current" = "$$" ]; then
    rm -f "$PID_FILE" "$INFO_FILE"
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}
trap cleanup_launcher_lock EXIT INT TERM

# Resolve the coordinator binary path
MAC10_BIN="$SCRIPT_DIR/../coordinator/bin/mac10"

# Create namespace-aware shims that call the coordinator binary directly,
# bypassing wrapper scripts that may hardcode a different MAC10_NAMESPACE.
SHIM_DIR="$DIR/.claude/scripts/.ns-shims"
mkdir -p "$SHIM_DIR"
for _shim_name in mac10; do
  cat > "$SHIM_DIR/$_shim_name" << SHIM
#!/usr/bin/env bash
export MAC10_NAMESPACE="${MAC10_NAMESPACE}"
exec node "${MAC10_BIN}" --project "${DIR}" "\$@"
SHIM
  chmod +x "$SHIM_DIR/$_shim_name"
done
export PATH="$SCRIPT_DIR/../coordinator/bin:$SHIM_DIR:$DIR/.claude/scripts:$PATH"

# Source nvm if available (ensures consistent Node.js version)
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null

resolve_prompt_file() {
  local slash_cmd="$1"
  local name="${slash_cmd#/}"
  local candidate

  candidate="$DIR/.claude/commands/${name}.md"
  if [ -f "$candidate" ]; then printf '%s' "$candidate"; return 0; fi

  candidate="$SCRIPT_DIR/../templates/commands/${name}.md"
  if [ -f "$candidate" ]; then printf '%s' "$candidate"; return 0; fi

  return 1
}

PROMPT_FILE="$(resolve_prompt_file "$CMD" || true)"

if [ -z "${PROMPT_FILE:-}" ]; then
  echo "ERROR: No command template found for '$CMD' (expected .claude/commands/<name>.md)" >&2
  exit 1
fi

# Master-1 is user-facing and must remain interactive in the terminal.
if [ "$CMD" = "/master-loop" ]; then
  mac10_load_provider_config "$DIR"
  MODEL_RESOLVED="$(mac10_resolve_role_model "$MODEL")"
  mac10_run_interactive_prompt "$DIR" "$PROMPT_FILE" "$MODEL_RESOLVED"
  exit $?
fi

# Architect/Allocator are autonomous loops and run non-interactively.
# Reload provider config on each restart so provider/model changes
# in agent-launcher.env take effect without restarting the sentinel.
BACKOFF=3
MAX_BACKOFF=60
while true; do
  mac10_load_provider_config "$DIR"
  CLI_NAME="$(mac10_provider_cli)"
  MODEL_RESOLVED="$(mac10_resolve_role_model "$MODEL")"
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
