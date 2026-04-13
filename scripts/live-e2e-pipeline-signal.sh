#!/usr/bin/env bash
set -euo pipefail

ROLE="${1:-}"
EVENT="${2:-}"
PAYLOAD_INPUT="${3:-}"
SIGNAL_DIR="${MAC10_LIVE_PIPELINE_SIGNAL_DIR:-}"
STATE_FILE="${MAC10_LIVE_PIPELINE_STATE_FILE:-}"
PIPELINE_ID="${MAC10_LIVE_PIPELINE_ID:-}"

if [ -z "$ROLE" ] || [ -z "$EVENT" ]; then
  echo "Usage: bash scripts/live-e2e-pipeline-signal.sh <role> <event> [payload_json_or_file]" >&2
  exit 1
fi

if [ -z "$SIGNAL_DIR" ]; then
  exit 0
fi

mkdir -p "$SIGNAL_DIR"

if [ -n "$PAYLOAD_INPUT" ] && [ -f "$PAYLOAD_INPUT" ]; then
  PAYLOAD_JSON="$(cat "$PAYLOAD_INPUT")"
elif [ -n "$PAYLOAD_INPUT" ]; then
  PAYLOAD_JSON="$PAYLOAD_INPUT"
else
  PAYLOAD_JSON='{}'
fi

if [ -z "$STATE_FILE" ]; then
  STATE_FILE="$SIGNAL_DIR/state.json"
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVENT_FILE="$SIGNAL_DIR/${STAMP}-${ROLE}-${EVENT}.json"
QUEUE_SIGNAL="$SIGNAL_DIR/.queue-signal"

ROLE="$ROLE" \
EVENT="$EVENT" \
PIPELINE_ID="$PIPELINE_ID" \
PAYLOAD_JSON="$PAYLOAD_JSON" \
STATE_FILE="$STATE_FILE" \
EVENT_FILE="$EVENT_FILE" \
node - <<'NODE'
const fs = require('fs');
const role = process.env.ROLE;
const event = process.env.EVENT;
const pipelineId = process.env.PIPELINE_ID || null;
const stateFile = process.env.STATE_FILE;
const eventFile = process.env.EVENT_FILE;

let payload;
try {
  payload = JSON.parse(process.env.PAYLOAD_JSON || '{}');
} catch {
  payload = { raw_payload: process.env.PAYLOAD_JSON || '' };
}

const now = new Date().toISOString();
const record = {
  pipeline_id: pipelineId,
  role,
  event,
  created_at: now,
  payload,
};

fs.writeFileSync(eventFile, JSON.stringify(record, null, 2) + '\n');

let state = {
  pipeline_id: pipelineId,
  status: 'signaled',
  created_at: now,
  updated_at: now,
  last_event: null,
  events: [],
};

if (fs.existsSync(stateFile)) {
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {}
}

state.pipeline_id = state.pipeline_id || pipelineId;
state.updated_at = now;
state.last_event = {
  role,
  event,
  created_at: now,
  event_file: eventFile,
};
state.events = Array.isArray(state.events) ? state.events : [];
state.events.push({
  role,
  event,
  created_at: now,
  event_file: eventFile,
});
if (state.events.length > 200) {
  state.events = state.events.slice(-200);
}

if (role === 'auditor' && payload && payload.run_id) {
  state.latest_audit_run_id = payload.run_id;
}
if (role === 'repairer' && payload && payload.run_id) {
  state.latest_repair_run_id = payload.run_id;
}
if (event === 'repair_requested') {
  state.pending_failure_artifact = null;
  state.pending_failure_artifacts = Array.isArray(payload.failure_artifacts) ? payload.failure_artifacts : [];
  state.status = 'awaiting_repair';
}
if (event === 'audit_requested') {
  state.status = 'awaiting_audit';
}
if (event === 'pipeline_completed') {
  state.status = 'completed';
  state.completed_at = now;
}
if (event === 'pipeline_failed') {
  state.status = 'failed';
  state.failed_at = now;
}
if (payload && Array.isArray(payload.changed_files) && payload.changed_files.length > 0) {
  state.last_changed_files = payload.changed_files;
}

fs.mkdirSync(require('path').dirname(stateFile), { recursive: true });
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
NODE

touch "$QUEUE_SIGNAL"
