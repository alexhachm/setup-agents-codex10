#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-}"
shift || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${MAC10_LIVE_TEST_PROJECT_DIR:-${MAC10_LIVE_REAL_PROJECT_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}}"
RUN_DIR="${MAC10_LIVE_RUN_DIR:-$PROJECT_DIR/status/live-debug}"
NAMESPACE="${MAC10_NAMESPACE:-mac10}"
WINDOW_NAME="${MAC10_MASTER1_WINDOW:-master-1}"
CAPTURE_LINES="${MAC10_MASTER1_CAPTURE_LINES:-220}"
READY_TIMEOUT="${MAC10_MASTER1_READY_TIMEOUT:-90}"
PROMPT_TIMEOUT="${MAC10_MASTER1_PROMPT_TIMEOUT:-120}"
POLL_SECONDS="${MAC10_MASTER1_POLL_SECONDS:-2}"
QUIET_SECONDS="${MAC10_MASTER1_QUIET_SECONDS:-6}"
SNAPSHOT_LIMIT="${MAC10_MASTER1_SNAPSHOT_LIMIT:-15}"
ARTIFACT_DIR="$RUN_DIR/master1"
MAC10_CMD="${MAC10_E2E_MAC10_CMD:-}"

mkdir -p "$ARTIFACT_DIR"

usage() {
  cat <<'EOF' >&2
Usage:
  bash scripts/e2e-master1-driver.sh ready [timeout_s]
  bash scripts/e2e-master1-driver.sh prompt <label> <message> [timeout_s]
EOF
  exit 1
}

if ! command -v tmux >/dev/null 2>&1; then
  if [ -z "$MAC10_CMD" ]; then
    echo '{"ok":false,"error":"tmux not available"}' >&2
    exit 1
  fi
fi

if [ -z "$MAC10_CMD" ]; then
  if [ -x "$PROJECT_DIR/.claude/scripts/mac10" ]; then
    MAC10_CMD="$PROJECT_DIR/.claude/scripts/mac10"
  elif [ -x "$SCRIPT_DIR/../coordinator/bin/mac10" ]; then
    MAC10_CMD="$SCRIPT_DIR/../coordinator/bin/mac10"
  fi
fi

SESSION_NAME="$(PROJECT_DIR="$PROJECT_DIR" NAMESPACE="$NAMESPACE" node - <<'NODE'
const crypto = require('crypto');
const projectDir = process.env.PROJECT_DIR || '';
const namespace = process.env.NAMESPACE || 'mac10';
const hash = crypto.createHash('md5').update(projectDir).digest('hex').slice(0, 6);
process.stdout.write(`${namespace}-${hash}`);
NODE
)"
TARGET="${SESSION_NAME}:${WINDOW_NAME}"

json_escape() {
  VALUE="${1:-}" node - <<'NODE'
process.stdout.write(JSON.stringify(process.env.VALUE || ''));
NODE
}

now_iso() {
  date -u +%Y-%m-%dT%H:%M:%SZ
}

sanitize_label() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-'
}

capture_pane() {
  if [ -n "${MAC10_CMD:-}" ]; then
    local output
    if output="$(cd "$PROJECT_DIR" && MAC10_NAMESPACE="$NAMESPACE" "$MAC10_CMD" master1-capture "--lines=$CAPTURE_LINES" 2>/dev/null)"; then
      JSON_INPUT="$output" node - <<'NODE'
const payload = JSON.parse(process.env.JSON_INPUT || '{}');
process.stdout.write(String(payload.capture || ''));
NODE
      return 0
    fi
  fi
  tmux capture-pane -t "$TARGET" -p -S "-$CAPTURE_LINES" 2>/dev/null || true
}

capture_to_file() {
  local path="$1"
  capture_pane > "$path"
}

pane_exists() {
  if [ -n "${MAC10_CMD:-}" ]; then
    if (cd "$PROJECT_DIR" && MAC10_NAMESPACE="$NAMESPACE" "$MAC10_CMD" master1-capture --lines=1 >/dev/null 2>&1); then
      return 0
    fi
  fi
  tmux list-panes -t "$TARGET" -F '#{pane_pid}' >/dev/null 2>&1
}

send_prompt() {
  local message="$1"
  if [ -n "${MAC10_CMD:-}" ]; then
    if (cd "$PROJECT_DIR" && MAC10_NAMESPACE="$NAMESPACE" "$MAC10_CMD" master1-send "$message" >/dev/null 2>&1); then
      return 0
    fi
  fi
  tmux send-keys -t "$TARGET" -l -- "$message"
  tmux send-keys -t "$TARGET" Enter
}

snapshot_debug() {
  local outfile="$1"
  if [ -n "${MAC10_CMD:-}" ]; then
    if (cd "$PROJECT_DIR" && MAC10_NAMESPACE="$NAMESPACE" "$MAC10_CMD" master1-debug "--limit=$SNAPSHOT_LIMIT" > "$outfile" 2>/dev/null); then
      return 0
    fi
  fi
  bash "$SCRIPT_DIR/e2e-db-check.sh" master1-debug-snapshot "$SNAPSHOT_LIMIT" > "$outfile"
}

hash_file() {
  local path="$1"
  sha256sum "$path" | awk '{print $1}'
}

emit_json_result() {
  local status="$1"
  local metadata_file="$2"
  STATUS="$status" METADATA_FILE="$metadata_file" node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.env.METADATA_FILE, 'utf8'));
payload.ok = process.env.STATUS === 'ok';
process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
NODE
}

command_ready() {
  local timeout="${1:-$READY_TIMEOUT}"
  local deadline=$(( $(date +%s) + timeout ))
  local capture_file="$ARTIFACT_DIR/ready-$(date -u +%Y%m%dT%H%M%SZ).txt"

  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ -n "${MAC10_CMD:-}" ]; then
      local ready_output
      if ready_output="$(cd "$PROJECT_DIR" && MAC10_NAMESPACE="$NAMESPACE" "$MAC10_CMD" master1-ready "--lines=$CAPTURE_LINES" 2>/dev/null)"; then
        local ready_state
        ready_state="$(READY_JSON="$ready_output" node - <<'NODE'
const payload = JSON.parse(process.env.READY_JSON || '{}');
process.stdout.write(payload.ready ? 'true' : 'false');
NODE
)"
        READY_JSON="$ready_output" CAPTURE_FILE="$capture_file" node - <<'NODE'
const fs = require('fs');
const payload = JSON.parse(process.env.READY_JSON || '{}');
const captureFile = process.env.CAPTURE_FILE;
fs.writeFileSync(captureFile, String(payload.capture || ''));
NODE
        if [ "$ready_state" = "true" ]; then
          cat <<EOF
{
  "ok": true,
  "session": $(READY_JSON="$ready_output" node -p "JSON.stringify(JSON.parse(process.env.READY_JSON).session || null)"),
  "window": $(READY_JSON="$ready_output" node -p "JSON.stringify(JSON.parse(process.env.READY_JSON).window || null)"),
  "target": $(READY_JSON="$ready_output" node -p "JSON.stringify(JSON.parse(process.env.READY_JSON).target || null)"),
  "capture_file": $(json_escape "$capture_file"),
  "ready_at": $(json_escape "$(now_iso)")
}
EOF
          return 0
        fi
      fi
    fi
    if pane_exists; then
      capture_to_file "$capture_file"
      if grep -Eq 'I AM MASTER-1|What would you like to do\?|Knowledge layer' "$capture_file"; then
        cat <<EOF
{
  "ok": true,
  "session": $(json_escape "$SESSION_NAME"),
  "window": $(json_escape "$WINDOW_NAME"),
  "target": $(json_escape "$TARGET"),
  "capture_file": $(json_escape "$capture_file"),
  "ready_at": $(json_escape "$(now_iso)")
}
EOF
        return 0
      fi
    fi
    sleep "$POLL_SECONDS"
  done

  cat <<EOF
{
  "ok": false,
  "session": $(json_escape "$SESSION_NAME"),
  "window": $(json_escape "$WINDOW_NAME"),
  "target": $(json_escape "$TARGET"),
  "capture_file": $(json_escape "$capture_file"),
  "error": "master-1 pane did not become ready within ${timeout}s"
}
EOF
  return 1
}

command_prompt() {
  [ "$#" -ge 2 ] || usage
  local raw_label="$1"
  local message="$2"
  local timeout="${3:-$PROMPT_TIMEOUT}"
  local label
  label="$(sanitize_label "$raw_label")"
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local prompt_id="${stamp}-${label}"
  local prompt_dir="$ARTIFACT_DIR/$prompt_id"
  local before_file="$prompt_dir/pane-before.txt"
  local after_file="$prompt_dir/pane-after.txt"
  local before_snapshot="$prompt_dir/debug-before.json"
  local after_snapshot="$prompt_dir/debug-after.json"
  local delta_file="$prompt_dir/debug-delta.json"
  local metadata_file="$prompt_dir/metadata.json"
  local prompt_file="$prompt_dir/prompt.txt"
  local status="ok"
  local error=""
  local deadline
  local changed=0
  local stable_for=0
  local last_hash=""
  local current_hash=""
  local started_at
  local finished_at

  mkdir -p "$prompt_dir"
  started_at="$(now_iso)"

  if ! pane_exists; then
    error="master-1 pane not available at $TARGET"
    status="failed"
  else
    printf '%s\n' "$message" > "$prompt_file"
    capture_to_file "$before_file"
    snapshot_debug "$before_snapshot"
    last_hash="$(hash_file "$before_file")"
    send_prompt "$message"
    deadline=$(( $(date +%s) + timeout ))

    while [ "$(date +%s)" -lt "$deadline" ]; do
      sleep "$POLL_SECONDS"
      capture_to_file "$after_file"
      current_hash="$(hash_file "$after_file")"
      if [ "$current_hash" != "$last_hash" ]; then
        changed=1
        stable_for=0
        last_hash="$current_hash"
      elif [ "$changed" -eq 1 ]; then
        stable_for=$((stable_for + POLL_SECONDS))
        if [ "$stable_for" -ge "$QUIET_SECONDS" ]; then
          break
        fi
      fi
    done

    if [ "$changed" -eq 0 ]; then
      status="failed"
      error="master-1 pane did not change after prompt within ${timeout}s"
      capture_to_file "$after_file"
    elif [ "$stable_for" -lt "$QUIET_SECONDS" ]; then
      status="failed"
      error="master-1 pane did not reach a quiet state within ${timeout}s"
    fi

    snapshot_debug "$after_snapshot"
  fi

  finished_at="$(now_iso)"

  BEFORE_SNAPSHOT="$before_snapshot" \
  AFTER_SNAPSHOT="$after_snapshot" \
  DELTA_FILE="$delta_file" \
  python3 - <<'PY'
import json
import os
from pathlib import Path

before_path = Path(os.environ["BEFORE_SNAPSHOT"])
after_path = Path(os.environ["AFTER_SNAPSHOT"])
delta_path = Path(os.environ["DELTA_FILE"])

def load(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text())

before = load(before_path)
after = load(after_path)
delta = {}
for key in ("requests", "loops", "research_intents", "mail", "activity"):
    before_rows = before.get(key) or []
    after_rows = after.get(key) or []
    before_ids = {row.get("id") for row in before_rows}
    new_rows = [row for row in after_rows if row.get("id") not in before_ids]
    delta[key] = {
        "before_count": len(before_rows),
        "after_count": len(after_rows),
        "new_ids": [row.get("id") for row in new_rows],
        "new_rows": new_rows,
    }
delta_path.write_text(json.dumps(delta, indent=2) + "\n")
PY

  cat > "$metadata_file" <<EOF
{
  "status": $(json_escape "$status"),
  "prompt_id": $(json_escape "$prompt_id"),
  "label": $(json_escape "$label"),
  "session": $(json_escape "$SESSION_NAME"),
  "window": $(json_escape "$WINDOW_NAME"),
  "target": $(json_escape "$TARGET"),
  "prompt": $(json_escape "$message"),
  "prompt_file": $(json_escape "$prompt_file"),
  "before_file": $(json_escape "$before_file"),
  "after_file": $(json_escape "$after_file"),
  "before_snapshot": $(json_escape "$before_snapshot"),
  "after_snapshot": $(json_escape "$after_snapshot"),
  "delta_file": $(json_escape "$delta_file"),
  "started_at": $(json_escape "$started_at"),
  "finished_at": $(json_escape "$finished_at"),
  "quiet_seconds_required": $QUIET_SECONDS,
  "pane_changed": $changed,
  "error": $(json_escape "$error")
}
EOF

  if [ "$status" = "ok" ]; then
    emit_json_result ok "$metadata_file"
    return 0
  fi

  emit_json_result failed "$metadata_file"
  return 1
}

case "$COMMAND" in
  ready)
    command_ready "$@"
    ;;
  prompt)
    command_prompt "$@"
    ;;
  *)
    usage
    ;;
esac
