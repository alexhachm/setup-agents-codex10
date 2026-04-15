#!/usr/bin/env bash
# Basic provider loop for cleanup work. This intentionally does not use
# `mac10 loop` or coordinator loop state.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/basic-agent-loop.sh [options] [-- <direction>]

Run repeated noninteractive provider turns against this checkout with file-based
operator controls.

Options:
  --project DIR           Project checkout to run in (default: repo root)
  --model ALIAS           Provider model or role alias (default: loop)
  --max-iterations N      Stop after N turns; 0 means until stopped (default: 0)
  --sleep SECONDS         Delay between turns (default: 30)
  --turn-timeout SECONDS  Kill a provider turn after this many seconds; 0 disables (default: 900)
  --branch NAME           Required git branch; use "any" to disable (default: 10.1)
  --direction TEXT        Initial loop direction
  --direction-file FILE   Initial loop direction from a file
  --state-dir DIR         Runtime state directory (default: .claude/state/basic-agent-loop)
  --control-dir DIR       Writable control directory (default: .agent-loop/basic-agent-loop/control)
  --log-dir DIR           Runtime log directory (default: .claude/logs/basic-agent-loop)
  --allow-dirty           Permit starting/continuing with dirty tracked or untracked files
  --dry-run               Render one provider launch without invoking the provider CLI
  -h, --help              Show this help

Runtime controls:
  .agent-loop/basic-agent-loop/control/stop
      Stop before the next turn. The agent may create this after finishing.

  .agent-loop/basic-agent-loop/control/pause
      Pause between turns until the file is removed.

  .agent-loop/basic-agent-loop/control/next-prompt.md
      Replace the direction for the next turn. The wrapper consumes this file
      into active-direction.md at the start of an iteration.

The wrapper exits on provider failure, provider timeout, branch mismatch, or a
dirty worktree after an iteration unless --allow-dirty is set.
USAGE
}

die() {
  echo "[basic-agent-loop] ERROR: $*" >&2
  exit 1
}

log() {
  echo "[basic-agent-loop] $*" >&2
}

timestamp() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

safe_timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL_ALIAS="${MAC10_BASIC_LOOP_MODEL:-loop}"
MAX_ITERATIONS="${MAC10_BASIC_LOOP_MAX_ITERATIONS:-0}"
SLEEP_SECONDS="${MAC10_BASIC_LOOP_SLEEP_SECONDS:-30}"
TURN_TIMEOUT_SECONDS="${MAC10_BASIC_LOOP_TURN_TIMEOUT_SECONDS:-900}"
REQUIRED_BRANCH="${MAC10_BASIC_LOOP_BRANCH:-10.1}"
DIRECTION_TEXT=""
DIRECTION_FILE=""
STATE_DIR=""
CONTROL_DIR=""
LOG_DIR=""
ALLOW_DIRTY=0
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project)
      [ "$#" -ge 2 ] || die "--project requires a directory"
      PROJECT_DIR="$(cd "$2" && pwd)"
      shift 2
      ;;
    --model)
      [ "$#" -ge 2 ] || die "--model requires a value"
      MODEL_ALIAS="$2"
      shift 2
      ;;
    --max-iterations)
      [ "$#" -ge 2 ] || die "--max-iterations requires a number"
      MAX_ITERATIONS="$2"
      shift 2
      ;;
    --sleep)
      [ "$#" -ge 2 ] || die "--sleep requires a number"
      SLEEP_SECONDS="$2"
      shift 2
      ;;
    --turn-timeout)
      [ "$#" -ge 2 ] || die "--turn-timeout requires a number"
      TURN_TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --branch)
      [ "$#" -ge 2 ] || die "--branch requires a branch name"
      REQUIRED_BRANCH="$2"
      shift 2
      ;;
    --direction)
      [ "$#" -ge 2 ] || die "--direction requires text"
      DIRECTION_TEXT="$2"
      shift 2
      ;;
    --direction-file)
      [ "$#" -ge 2 ] || die "--direction-file requires a file"
      DIRECTION_FILE="$2"
      shift 2
      ;;
    --state-dir)
      [ "$#" -ge 2 ] || die "--state-dir requires a directory"
      STATE_DIR="$2"
      shift 2
      ;;
    --control-dir)
      [ "$#" -ge 2 ] || die "--control-dir requires a directory"
      CONTROL_DIR="$2"
      shift 2
      ;;
    --log-dir)
      [ "$#" -ge 2 ] || die "--log-dir requires a directory"
      LOG_DIR="$2"
      shift 2
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      DIRECTION_TEXT="$*"
      break
      ;;
    *)
      if [ -z "$DIRECTION_TEXT" ]; then
        DIRECTION_TEXT="$1"
      else
        DIRECTION_TEXT="$DIRECTION_TEXT $1"
      fi
      shift
      ;;
  esac
done

case "$MAX_ITERATIONS" in
  ''|*[!0-9]*) die "--max-iterations must be a non-negative integer" ;;
esac
case "$SLEEP_SECONDS" in
  ''|*[!0-9]*) die "--sleep must be a non-negative integer" ;;
esac
case "$TURN_TIMEOUT_SECONDS" in
  ''|*[!0-9]*) die "--turn-timeout must be a non-negative integer" ;;
esac

[ -d "$PROJECT_DIR/.git" ] || die "project is not a git checkout: $PROJECT_DIR"

STATE_DIR="${STATE_DIR:-$PROJECT_DIR/.claude/state/basic-agent-loop}"
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/.claude/logs/basic-agent-loop}"
CONTROL_DIR="${CONTROL_DIR:-$PROJECT_DIR/.agent-loop/basic-agent-loop/control}"
STOP_FILE="$CONTROL_DIR/stop"
PAUSE_FILE="$CONTROL_DIR/pause"
NEXT_PROMPT_FILE="$CONTROL_DIR/next-prompt.md"
ACTIVE_DIRECTION_FILE="$STATE_DIR/active-direction.md"
CURRENT_PROMPT_FILE="$STATE_DIR/current-prompt.md"
STATUS_FILE="$STATE_DIR/status.env"
DIRTY_STATUS_FILE="$STATE_DIR/dirty-status.txt"
SHIM_DIR="$STATE_DIR/shims"

mkdir -p "$CONTROL_DIR" "$LOG_DIR" "$SHIM_DIR"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

write_status() {
  local state="$1"
  local iteration="${2:-0}"
  local exit_code="${3:-}"
  {
    printf 'status=%s\n' "$state"
    printf 'iteration=%s\n' "$iteration"
    printf 'updated_at=%s\n' "$(timestamp)"
    printf 'project_dir=%s\n' "$PROJECT_DIR"
    printf 'branch=%s\n' "$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    printf 'model_alias=%s\n' "$MODEL_ALIAS"
    printf 'turn_timeout_seconds=%s\n' "$TURN_TIMEOUT_SECONDS"
    printf 'provider=%s\n' "${MAC10_AGENT_PROVIDER:-}"
    printf 'exit_code=%s\n' "$exit_code"
  } > "$STATUS_FILE"
}

git_status_short() {
  git -C "$PROJECT_DIR" status --short --branch --untracked-files=normal
}

git_dirty_porcelain() {
  git -C "$PROJECT_DIR" status --porcelain --untracked-files=normal
}

require_branch() {
  local branch
  [ "$REQUIRED_BRANCH" = "any" ] && return 0
  branch="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD)"
  [ "$branch" = "$REQUIRED_BRANCH" ] || die "expected branch $REQUIRED_BRANCH, found $branch"
}

require_clean_worktree() {
  local dirty
  [ "$ALLOW_DIRTY" -eq 1 ] && return 0
  dirty="$(git_dirty_porcelain)"
  if [ -n "$dirty" ]; then
    printf '%s\n' "$dirty" > "$DIRTY_STATUS_FILE"
    die "worktree is dirty; inspect $DIRTY_STATUS_FILE or rerun with --allow-dirty"
  fi
}

write_default_direction() {
  cat > "$ACTIVE_DIRECTION_FILE" <<'DIRECTION'
Continue the codebase fix checklist in small verified passes.

Use the current checklist as the source of truth. Pick the next safe unchecked
item that does not require branch reconciliation, destructive worktree cleanup,
external credentials, or broad module splitting. Inspect first, make the
smallest useful change, run focused validation, update the checklist with
evidence, and commit locally before exiting the turn.

If no safe checklist item remains, create
.agent-loop/basic-agent-loop/control/stop with the reason and exit cleanly.
DIRECTION
}

seed_direction() {
  if [ -n "$DIRECTION_FILE" ]; then
    [ -f "$DIRECTION_FILE" ] || die "direction file not found: $DIRECTION_FILE"
    cp "$DIRECTION_FILE" "$ACTIVE_DIRECTION_FILE"
  elif [ -n "$DIRECTION_TEXT" ]; then
    printf '%s\n' "$DIRECTION_TEXT" > "$ACTIVE_DIRECTION_FILE"
  elif [ ! -s "$ACTIVE_DIRECTION_FILE" ]; then
    write_default_direction
  fi
}

refresh_direction() {
  if [ -s "$NEXT_PROMPT_FILE" ]; then
    cp "$NEXT_PROMPT_FILE" "$ACTIVE_DIRECTION_FILE"
    rm -f "$NEXT_PROMPT_FILE"
    log "consumed next-prompt.md as the active direction"
  fi

  if [ ! -s "$ACTIVE_DIRECTION_FILE" ]; then
    write_default_direction
  fi
}

install_mac10_shim() {
  local mac10_bin="$PROJECT_DIR/coordinator/bin/mac10"
  cat > "$SHIM_DIR/mac10" <<SHIM
#!/usr/bin/env bash
export MAC10_NAMESPACE="\${MAC10_NAMESPACE:-mac10-$(basename "$PROJECT_DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | cut -c1-20)}"
exec node "$mac10_bin" --project "$PROJECT_DIR" "\$@"
SHIM
  chmod +x "$SHIM_DIR/mac10"
  export PATH="$PROJECT_DIR/coordinator/bin:$SHIM_DIR:$PROJECT_DIR/.claude/scripts:$PATH"
}

build_prompt() {
  local iteration="$1"
  local branch
  local direction
  local status
  branch="$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD)"
  direction="$(cat "$ACTIVE_DIRECTION_FILE")"
  status="$(git_status_short)"

  cat > "$CURRENT_PROMPT_FILE" <<PROMPT
# Basic Agent Loop Iteration

You are running inside \`scripts/basic-agent-loop.sh\`. This is a thin provider
runner, not \`mac10 loop\`, not the SQL-backed coordinator loop, and not the
old autonomous cleanup wrapper.

Current iteration: $iteration
Project: $PROJECT_DIR
Branch: $branch

## Direction

$direction

## Runtime Controls

- To stop after this turn, write a reason to:
  \`$STOP_FILE\`
- To pause before the next turn, create:
  \`$PAUSE_FILE\`
- To replace the next turn's direction, write:
  \`$NEXT_PROMPT_FILE\`

## Guardrails

- Work in one bounded slice.
- Inspect before editing.
- Finish or stop before the wrapper turn timeout of ${TURN_TIMEOUT_SECONDS}s.
- Do not invoke \`mac10 loop\` or the coordinator loop machinery.
- Do not push, rebase, merge, reset, delete worktrees, or prune worktrees.
- Do not perform destructive cleanup.
- Keep edits scoped to the checklist item you choose.
- Run the smallest relevant validation and record evidence in \`CODEBASE_FIX_CHECKLIST.md\`.
- Commit locally before ending the turn. If you cannot commit, write the stop file with the reason.
- If human direction is needed, write the stop file and exit cleanly.

## Current Git Status

\`\`\`
$status
\`\`\`
PROMPT
}

kill_process_tree() {
  local root_pid="$1"
  local signal="${2:-TERM}"
  local child

  while IFS= read -r child; do
    [ -n "$child" ] || continue
    kill_process_tree "$child" "$signal"
  done < <(pgrep -P "$root_pid" 2>/dev/null || true)

  kill "-$signal" "$root_pid" 2>/dev/null || true
}

run_provider_turn() {
  local iteration="$1"
  local log_file="$2"
  local timeout_marker="$STATE_DIR/turn-${iteration}-timeout.env"
  local provider_pid
  local timeout_pid=""
  local exit_code

  rm -f "$timeout_marker"
  set +e
  (
    mac10_run_noninteractive_prompt "$PROJECT_DIR" "$CURRENT_PROMPT_FILE" "$MODEL_RESOLVED"
  ) > >(tee "$log_file") 2>&1 &
  provider_pid="$!"

  if [ "$TURN_TIMEOUT_SECONDS" -gt 0 ]; then
    (
      sleep "$TURN_TIMEOUT_SECONDS"
      if kill -0 "$provider_pid" 2>/dev/null; then
        {
          printf 'timeout_at=%s\n' "$(timestamp)"
          printf 'iteration=%s\n' "$iteration"
          printf 'pid=%s\n' "$provider_pid"
          printf 'timeout_seconds=%s\n' "$TURN_TIMEOUT_SECONDS"
        } > "$timeout_marker"
        printf '\n[basic-agent-loop] ERROR: provider turn timed out after %ss\n' "$TURN_TIMEOUT_SECONDS" >> "$log_file"
        kill_process_tree "$provider_pid" TERM
        sleep 5
        if kill -0 "$provider_pid" 2>/dev/null; then
          kill_process_tree "$provider_pid" KILL
        fi
      fi
    ) &
    timeout_pid="$!"
  fi

  wait "$provider_pid"
  exit_code="$?"
  if [ -n "$timeout_pid" ]; then
    kill "$timeout_pid" 2>/dev/null || true
    wait "$timeout_pid" 2>/dev/null || true
  fi
  if [ -f "$timeout_marker" ]; then
    exit_code=124
  fi
  set -e
  return "$exit_code"
}

require_branch
seed_direction
install_mac10_shim
mac10_load_provider_config "$PROJECT_DIR"
MODEL_RESOLVED="$(mac10_resolve_role_model "$MODEL_ALIAS")"
[ -n "$MODEL_RESOLVED" ] || die "could not resolve model for alias: $MODEL_ALIAS"

if [ "$DRY_RUN" -eq 1 ]; then
  refresh_direction
  build_prompt 1
  write_status "dry_run" 1 0
  MAC10_LAUNCH_DRY_RUN=1 mac10_run_noninteractive_prompt "$PROJECT_DIR" "$CURRENT_PROMPT_FILE" "$MODEL_RESOLVED"
  exit 0
fi

require_clean_worktree
write_status "starting" 0
log "starting provider loop in $PROJECT_DIR (model=$MODEL_ALIAS resolved=$MODEL_RESOLVED max_iterations=$MAX_ITERATIONS turn_timeout=${TURN_TIMEOUT_SECONDS}s)"
log "controls: $CONTROL_DIR"

ITERATION=0
while true; do
  require_branch

  if [ -e "$STOP_FILE" ]; then
    write_status "stopped" "$ITERATION" 0
    log "stop file present; exiting"
    exit 0
  fi

  while [ -e "$PAUSE_FILE" ]; do
    write_status "paused" "$ITERATION" 0
    log "pause file present; sleeping ${SLEEP_SECONDS}s"
    sleep "$SLEEP_SECONDS"
  done

  if [ "$MAX_ITERATIONS" -gt 0 ] && [ "$ITERATION" -ge "$MAX_ITERATIONS" ]; then
    write_status "max_iterations_reached" "$ITERATION" 0
    log "max iterations reached; exiting"
    exit 0
  fi

  require_clean_worktree
  refresh_direction
  ITERATION=$((ITERATION + 1))
  build_prompt "$ITERATION"

  LOG_FILE="$LOG_DIR/iteration-$(printf '%04d' "$ITERATION")-$(safe_timestamp).log"
  write_status "running" "$ITERATION"
  log "launching iteration $ITERATION; log=$LOG_FILE"

  if run_provider_turn "$ITERATION" "$LOG_FILE"; then
    write_status "iteration_completed" "$ITERATION" 0
  else
    EXIT_CODE="$?"
    write_status "provider_failed" "$ITERATION" "$EXIT_CODE"
    if [ "$EXIT_CODE" -eq 124 ]; then
      die "provider turn timed out after ${TURN_TIMEOUT_SECONDS}s; inspect $LOG_FILE"
    fi
    die "provider turn failed with exit code $EXIT_CODE; inspect $LOG_FILE"
  fi

  if [ -e "$STOP_FILE" ]; then
    write_status "stopped" "$ITERATION" 0
    log "agent created stop file; exiting"
    exit 0
  fi

  if [ "$ALLOW_DIRTY" -ne 1 ]; then
    DIRTY_AFTER="$(git_dirty_porcelain)"
    if [ -n "$DIRTY_AFTER" ]; then
      printf '%s\n' "$DIRTY_AFTER" > "$DIRTY_STATUS_FILE"
      write_status "dirty_after_iteration" "$ITERATION" 2
      die "iteration left a dirty worktree; inspect $DIRTY_STATUS_FILE and $LOG_FILE"
    fi
  fi

  if [ "$SLEEP_SECONDS" -gt 0 ]; then
    write_status "sleeping" "$ITERATION" 0
    sleep "$SLEEP_SECONDS"
  fi
done
