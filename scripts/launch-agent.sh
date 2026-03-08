#!/usr/bin/env bash
# Launch a Codex agent in the specified project directory.
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

# Ensure codex10 CLI is on PATH (project wrapper + coordinator bin)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export MAC10_NAMESPACE="${MAC10_NAMESPACE:-codex10}"
SHIM_DIR="$DIR/.claude/scripts/.codex10-shims"
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
export PATH="$SCRIPT_DIR/../coordinator/bin:$SHIM_DIR:$DIR/.claude/scripts:$PATH"

# Source nvm if available (ensures consistent Node.js version)
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null

resolve_model() {
  case "$1" in
    sonnet|opus|fast|deep)
      printf '%s' "gpt-5.3-codex"
      ;;
    haiku|economy)
      printf '%s' "gpt-5.1-codex-mini"
      ;;
    *)
      printf '%s' "$1"
      ;;
  esac
}

resolve_prompt_file() {
  local slash_cmd="$1"
  local name="${slash_cmd#/}"
  local candidate

  # Prefer codex10-local command templates to avoid cross-stack collisions.
  candidate="$DIR/.claude/commands-codex10/${name}.md"
  if [ -f "$candidate" ]; then printf '%s' "$candidate"; return 0; fi

  # Project command templates (legacy behavior).
  candidate="$DIR/.claude/commands/${name}.md"
  if [ -f "$candidate" ]; then printf '%s' "$candidate"; return 0; fi

  # Fallback to codex10 repository templates.
  candidate="$SCRIPT_DIR/../templates/commands/${name}.md"
  if [ -f "$candidate" ]; then printf '%s' "$candidate"; return 0; fi

  return 1
}

MODEL_RESOLVED="$(resolve_model "$MODEL")"
PROMPT_FILE="$(resolve_prompt_file "$CMD" || true)"

if [ -z "${PROMPT_FILE:-}" ]; then
  echo "ERROR: No command template found for '$CMD' (expected .claude/commands/<name>.md)" >&2
  exit 1
fi

export CODEX_PROJECT_DIR="$DIR"
export MAC10_AGENT_ROLE="$CMD"

# Master-1 is user-facing and must remain interactive in the terminal.
# Architect/Allocator are autonomous loops and run non-interactively.
if [ "$CMD" = "/master-loop" ]; then
  PROMPT_TEXT="$(cat "$PROMPT_FILE")"
  codex --dangerously-bypass-approvals-and-sandbox -m "$MODEL_RESOLVED" -C "$DIR" -- "$PROMPT_TEXT"
else
  # Keep autonomous masters alive: if a non-interactive run exits,
  # relaunch after a short backoff.
  while true; do
    codex exec --dangerously-bypass-approvals-and-sandbox -m "$MODEL_RESOLVED" -C "$DIR" - < "$PROMPT_FILE" || true
    echo "[launch-agent] $CMD exited; restarting in 3s..."
    sleep 3
  done
fi
exec bash
