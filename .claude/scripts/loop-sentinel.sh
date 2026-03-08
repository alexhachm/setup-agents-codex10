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

echo "[loop-sentinel-$LOOP_ID] Starting in $PROJECT_DIR"

while true; do
  # Check if loop is still active
  PROMPT_JSON=$("$MAC10_CMD" loop-prompt "$LOOP_ID" 2>/dev/null || echo "")
  if [ -z "$PROMPT_JSON" ]; then
    echo "[loop-sentinel-$LOOP_ID] Could not reach coordinator, retrying in ${BACKOFF}s..."
    sleep "$BACKOFF"
    continue
  fi

  STATUS=$(echo "$PROMPT_JSON" | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)"/\1/' || echo "")
  if [ "$STATUS" != "active" ]; then
    echo "[loop-sentinel-$LOOP_ID] Loop status is '$STATUS', exiting."
    exit 0
  fi

  # Pre-check: skip Codex spawn if requests are still in-flight
  ACTIVE_COUNT=$("$MAC10_CMD" loop-requests "$LOOP_ID" 2>/dev/null | grep -c '"status"[[:space:]]*:[[:space:]]*"\(pending\|triaging\|executing_tier1\|decomposed\|in_progress\|integrating\)"' || true)
  ACTIVE_COUNT="${ACTIVE_COUNT:-0}"
  if [ "$ACTIVE_COUNT" -gt 0 ]; then
    echo "[loop-sentinel-$LOOP_ID] $ACTIVE_COUNT request(s) still active, skipping spawn (backoff=${PRECHECK_BACKOFF}s)"
    sleep "$PRECHECK_BACKOFF"
    PRECHECK_BACKOFF=$((PRECHECK_BACKOFF * 2))
    [ "$PRECHECK_BACKOFF" -gt 120 ] && PRECHECK_BACKOFF=120
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

  # Launch Codex for one iteration
  PROMPT_FILE="$PROJECT_DIR/.claude/commands/loop-agent.md"
  if [ -f "$PROJECT_DIR/.claude/commands-codex10/loop-agent.md" ]; then
    PROMPT_FILE="$PROJECT_DIR/.claude/commands-codex10/loop-agent.md"
  fi
  echo "[loop-sentinel-$LOOP_ID] Launching codex (iteration backoff=${BACKOFF}s)..."
  START_TIME=$(date +%s)
  codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C "$PROJECT_DIR" - < "$PROMPT_FILE" 2>&1 || true
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

  # Check loop status before sleeping (fast exit if stopped)
  "$MAC10_CMD" loop-heartbeat "$LOOP_ID" 2>/dev/null || {
    EXIT_CODE=$?
    if [ "$EXIT_CODE" -eq 2 ]; then
      echo "[loop-sentinel-$LOOP_ID] Loop stopped, exiting."
      exit 0
    fi
  }

  sleep "$BACKOFF"
done
