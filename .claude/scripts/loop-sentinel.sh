#!/usr/bin/env bash
# mac10 loop sentinel — runs in a tmux window.
# Continuously relaunches codex for a persistent autonomous loop.
# Pre-checks active requests to avoid wasting Codex spawns.
# Adaptive backoff: short runs → exponential backoff, long runs → reset.
set -euo pipefail
export PATH="$HOME/bin:$HOME/.local/bin:$PATH"

LOOP_ID="${1:?Usage: loop-sentinel.sh <loop_id> <project_dir>}"
PROJECT_DIR="${2:?Usage: loop-sentinel.sh <loop_id> <project_dir>}"

cd "$PROJECT_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

# Ensure coordinator CLI is on PATH
export PATH="$PROJECT_DIR/.claude/scripts:$PATH"
export MAC10_LOOP_ID="$LOOP_ID"
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
    echo "[loop-sentinel-$LOOP_ID] ERROR: Missing codex10 coordinator wrapper (.claude/scripts/codex10)" >&2
    exit 1
  fi
else
  MAC10_CMD="mac10"
fi

BACKOFF=5
PRECHECK_BACKOFF=10
RESTART_SIGNAL="$PROJECT_DIR/.codex/signals/.codex10.restart-signal"
LAST_RESTART_TS=0
RESTART_COOLDOWN_SEC=120
HEARTBEAT_INTERVAL=30
LAST_HEARTBEAT_TS=0

_EXEC_HEARTBEAT_PID=""
_stop_exec_heartbeat() {
  if [ -n "$_EXEC_HEARTBEAT_PID" ]; then
    kill "$_EXEC_HEARTBEAT_PID" 2>/dev/null || true
    wait "$_EXEC_HEARTBEAT_PID" 2>/dev/null || true
    _EXEC_HEARTBEAT_PID=""
  fi
}
trap '_stop_exec_heartbeat' EXIT INT TERM

echo "[loop-sentinel-$LOOP_ID] Starting in $PROJECT_DIR"

send_loop_heartbeat() {
  if "$MAC10_CMD" loop-heartbeat "$LOOP_ID" 2>/dev/null; then
    LAST_HEARTBEAT_TS=$(date +%s)
    return 0
  fi

  local exit_code=$?
  if [ "$exit_code" -eq 2 ]; then
    echo "[loop-sentinel-$LOOP_ID] Loop stopped, exiting."
    exit 0
  fi
  return 0
}

maybe_loop_heartbeat() {
  local now elapsed
  now=$(date +%s)
  elapsed=$((now - LAST_HEARTBEAT_TS))
  if [ "$LAST_HEARTBEAT_TS" -eq 0 ] || [ "$elapsed" -ge "$HEARTBEAT_INTERVAL" ]; then
    send_loop_heartbeat
  fi
}

sleep_with_loop_heartbeats() {
  local total_sleep="${1:-0}"
  local remaining chunk

  if [ "$total_sleep" -le 0 ]; then
    return 0
  fi

  remaining="$total_sleep"
  maybe_loop_heartbeat
  while [ "$remaining" -gt 0 ]; do
    chunk="$remaining"
    if [ "$chunk" -gt "$HEARTBEAT_INTERVAL" ]; then
      chunk="$HEARTBEAT_INTERVAL"
    fi
    sleep "$chunk"
    remaining=$((remaining - chunk))
    maybe_loop_heartbeat
  done
}

while true; do
  # Check for restart signal before prompt preflight
  if [ -f "$RESTART_SIGNAL" ]; then
    NOW_TS=$(date +%s)
    if [ $((NOW_TS - LAST_RESTART_TS)) -lt "$RESTART_COOLDOWN_SEC" ]; then
      echo "[loop-sentinel-$LOOP_ID] Restart signal ignored (cooldown active)."
      rm -f "$RESTART_SIGNAL" 2>/dev/null || true
    else
      rm -f "$RESTART_SIGNAL" 2>/dev/null || true
      echo "[loop-sentinel-$LOOP_ID] Restart signal detected; restarting coordinator..."
      "$MAC10_CMD" stop "$PROJECT_DIR" >/dev/null 2>&1 || true
      sleep 2
      if "$MAC10_CMD" start "$PROJECT_DIR" >/dev/null 2>&1; then
        LAST_RESTART_TS="$NOW_TS"
        BACKOFF=5
        PRECHECK_BACKOFF=10
        echo "[loop-sentinel-$LOOP_ID] Coordinator restart complete."
      else
        echo "[loop-sentinel-$LOOP_ID] Coordinator restart failed; retrying after backoff."
        sleep_with_loop_heartbeats "$BACKOFF"
        continue
      fi
    fi
  fi

  # Check if loop is still active
  PROMPT_JSON=$("$MAC10_CMD" loop-prompt "$LOOP_ID" 2>/dev/null || echo "")
  if [ -z "$PROMPT_JSON" ]; then
    echo "[loop-sentinel-$LOOP_ID] Could not reach coordinator, retrying in ${BACKOFF}s..."
    sleep_with_loop_heartbeats "$BACKOFF"
    continue
  fi

  STATUS=$(echo "$PROMPT_JSON" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' || echo "")
  if [ "$STATUS" != "active" ]; then
    echo "[loop-sentinel-$LOOP_ID] Loop status is '$STATUS', exiting."
    exit 0
  fi

  # Pre-check: skip Codex spawn if requests are still in-flight (fail-closed)
  LOOP_REQUESTS_STATUS=0
  LOOP_REQUESTS_JSON=$("$MAC10_CMD" loop-requests "$LOOP_ID" --json 2>/dev/null) || LOOP_REQUESTS_STATUS=$?
  if [ "$LOOP_REQUESTS_STATUS" -ne 0 ]; then
    ACTIVE_COUNT="error:request_count_unavailable"
  elif [ -z "${LOOP_REQUESTS_JSON//[[:space:]]/}" ]; then
    ACTIVE_COUNT="error:empty_response"
  elif ACTIVE_COUNT=$(
    printf '%s' "$LOOP_REQUESTS_JSON" | node -e '
      const fs = require("fs");
      const active = new Set(["pending", "triaging", "executing_tier1", "decomposed", "assigned", "in_progress", "integrating"]);
      const raw = fs.readFileSync(0, "utf8");
      if (!raw.trim()) process.exit(2);
      try {
        const payload = JSON.parse(raw);
        const candidates = [
          payload?.requests,
          payload?.data?.requests,
          payload?.data?.rows,
          payload?.rows,
          Array.isArray(payload?.data) ? payload.data : null,
          Array.isArray(payload) ? payload : null,
        ];
        const hasArrayCandidate = candidates.some((candidate) => Array.isArray(candidate));
        if (!hasArrayCandidate) process.exit(3);
        let requests = [];
        for (const candidate of candidates) {
          if (Array.isArray(candidate) && candidate.length > 0) {
            requests = candidate;
            break;
          }
        }
        if (requests.length === 0) {
          const fallback = candidates.find((candidate) => Array.isArray(candidate));
          requests = Array.isArray(fallback) ? fallback : [];
        }
        const count = requests.filter((request) => {
          const status = typeof request?.status === "string" ? request.status : "";
          return active.has(status.trim().toLowerCase());
        }).length;
        process.stdout.write(String(count));
      } catch (_) {
        process.exit(1);
      }
    '
  ); then
    if [[ ! "$ACTIVE_COUNT" =~ ^[0-9]+$ ]]; then
      ACTIVE_COUNT="error:invalid_count"
    fi
  else
    ACTIVE_COUNT="error:json_parse_failed"
  fi
  if [[ "$ACTIVE_COUNT" == error:* ]]; then
    echo "[loop-sentinel-$LOOP_ID] Active-request precheck failed ($ACTIVE_COUNT); assuming requests are active and backing off (${PRECHECK_BACKOFF}s)."
    sleep_with_loop_heartbeats "$PRECHECK_BACKOFF"
    PRECHECK_BACKOFF=$((PRECHECK_BACKOFF * 2))
    [ "$PRECHECK_BACKOFF" -gt 600 ] && PRECHECK_BACKOFF=600
    continue
  fi
  if [ "$ACTIVE_COUNT" -gt 0 ]; then
    echo "[loop-sentinel-$LOOP_ID] $ACTIVE_COUNT request(s) still active, skipping spawn (backoff=${PRECHECK_BACKOFF}s)"
    sleep_with_loop_heartbeats "$PRECHECK_BACKOFF"
    PRECHECK_BACKOFF=$((PRECHECK_BACKOFF * 2))
    [ "$PRECHECK_BACKOFF" -gt 600 ] && PRECHECK_BACKOFF=600
    continue
  fi

  # Requests cleared — reset pre-check backoff for next cycle
  PRECHECK_BACKOFF=10

  # Sync with latest main (only if not on main branch — avoid nuking main worktree)
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "main")
  if [ "$CURRENT_BRANCH" != "main" ]; then
    git fetch origin 2>/dev/null || true
    git rebase origin/main 2>/dev/null || {
      git rebase --abort 2>/dev/null || true
      git reset --hard origin/main 2>/dev/null || true
    }
  fi

  # Reload provider config so provider/model changes in agent-launcher.env
  # take effect on next launch cycle without restarting the sentinel.
  mac10_load_provider_config "$PROJECT_DIR"
  AGENT_CLI="$(mac10_provider_cli)"
  LOOP_MODEL="$(mac10_resolve_role_model loop)"

  # Launch agent for one iteration
  # Namespace-aware prompt file selection:
  # codex10 namespace → prefer .codex/commands-codex10/loop-agent.md, fallback to .codex/commands/loop-agent.md
  # mac10 namespace   → use .claude/commands/loop-agent.md (uses mac10 commands)
  PROMPT_FILE="$PROJECT_DIR/.claude/commands/loop-agent.md"
  if [ "${MAC10_NAMESPACE:-}" = "codex10" ]; then
    if [ -f "$PROJECT_DIR/.codex/commands-codex10/loop-agent.md" ]; then
      PROMPT_FILE="$PROJECT_DIR/.codex/commands-codex10/loop-agent.md"
    elif [ -f "$PROJECT_DIR/.codex/commands/loop-agent.md" ]; then
      PROMPT_FILE="$PROJECT_DIR/.codex/commands/loop-agent.md"
    fi
  fi
  echo "[loop-sentinel-$LOOP_ID] Launching ${AGENT_CLI} (provider=${MAC10_AGENT_PROVIDER} model=${LOOP_MODEL} backoff=${BACKOFF}s)..."
  START_TIME=$(date +%s)
  (
    while true; do
      sleep 30
      "$MAC10_CMD" loop-heartbeat "$LOOP_ID" 2>/dev/null || true
    done
  ) &
  _EXEC_HEARTBEAT_PID=$!
  mac10_run_noninteractive_prompt "$PROJECT_DIR" "$PROMPT_FILE" "$LOOP_MODEL" 2>&1 || true
  _stop_exec_heartbeat
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  # Adaptive backoff
  if [ "$DURATION" -lt 30 ]; then
    # Short run — likely crashed or empty iteration, increase backoff
    BACKOFF=$((BACKOFF * 2))
    if [ "$BACKOFF" -gt 60 ]; then
      BACKOFF=60
    fi
    echo "[loop-sentinel-$LOOP_ID] Short run (${DURATION}s), backoff → ${BACKOFF}s"
  else
    # Healthy run — set minimum backoff to let pipeline process submissions
    BACKOFF=30
    echo "[loop-sentinel-$LOOP_ID] Healthy run (${DURATION}s), backoff → ${BACKOFF}s (pipeline processing time)"
  fi

  # Check loop status before sleeping (fast exit if stopped), then pulse heartbeats while waiting.
  send_loop_heartbeat
  sleep_with_loop_heartbeats "$BACKOFF"
done
