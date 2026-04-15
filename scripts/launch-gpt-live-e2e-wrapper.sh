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
mac10_load_provider_config "$SOURCE_DIR"
if [ -n "${MAC10_FORCE_PROVIDER:-}" ]; then
  MAC10_AGENT_PROVIDER="$MAC10_FORCE_PROVIDER"
fi
export MAC10_AGENT_PROVIDER
MODEL_NAME="${POSITIONAL_ARGS[1]:-$(mac10_default_deep_model "$MAC10_AGENT_PROVIDER")}"
MAX_CYCLES="${POSITIONAL_ARGS[2]:-10}"

case "$AUDIT_MODE" in
  live|isolated) ;;
  *)
    echo "ERROR: MAC10_LIVE_MODE must be 'live' or 'isolated' (got: $AUDIT_MODE)" >&2
    exit 1
    ;;
esac

# Propagate the audit mode to child scripts.
export MAC10_LIVE_MODE="$AUDIT_MODE"
if [ "$AUDIT_MODE" = "live" ]; then
  export MAC10_LIVE_NO_ISOLATE="1"
else
  export MAC10_LIVE_NO_ISOLATE="0"
fi
ISOLATION_MODE="$AUDIT_MODE"
PIPELINE_ID="${MAC10_LIVE_PIPELINE_ID:-pipeline-$(date -u +%Y%m%dT%H%M%SZ)}"
PIPELINE_DIR="$SOURCE_DIR/status/live-pipelines/$PIPELINE_ID"
STATE_FILE="$PIPELINE_DIR/state.json"
SIGNAL_DIR="$SOURCE_DIR/.claude/signals/live-e2e/$PIPELINE_ID"
CHANGE_LOG="$PIPELINE_DIR/changes.log"
WRAPPER_LOG="$PIPELINE_DIR/wrapper.log"
STOP_SIGNAL="$SIGNAL_DIR/stop.signal"

mkdir -p "$PIPELINE_DIR" "$SIGNAL_DIR"

init_state() {
  PIPELINE_ID="$PIPELINE_ID" SOURCE_DIR="$SOURCE_DIR" STATE_FILE="$STATE_FILE" node - <<'NODE'
const fs = require('fs');
const stateFile = process.env.STATE_FILE;
if (fs.existsSync(stateFile)) process.exit(0);
const now = new Date().toISOString();
const state = {
  pipeline_id: process.env.PIPELINE_ID,
  source_dir: process.env.SOURCE_DIR,
  status: 'initialized',
  created_at: now,
  updated_at: now,
  cycle_count: 0,
  audit_runs: [],
  repair_runs: [],
  event_cursor: 0,
  events: [],
};
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
NODE
}

log_line() {
  local line="$1"
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line" | tee -a "$WRAPPER_LOG"
}

set_state_value() {
  local js="$1"
  STATE_FILE="$STATE_FILE" JS_SNIPPET="$js" node - <<'NODE'
const fs = require('fs');
const stateFile = process.env.STATE_FILE;
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const now = new Date().toISOString();
const fn = new Function('state', 'now', process.env.JS_SNIPPET);
fn(state, now);
state.updated_at = now;
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
NODE
}

append_change_log() {
  CHANGE_LOG="$CHANGE_LOG" STATE_FILE="$STATE_FILE" node - <<'NODE'
const fs = require('fs');
const logPath = process.env.CHANGE_LOG;
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
const changedFiles = Array.isArray(state.last_changed_files) ? state.last_changed_files : [];
const failureArtifacts = Array.isArray(state.pending_failure_artifacts) ? state.pending_failure_artifacts : [];
const lines = [];
lines.push(`[${state.updated_at || new Date().toISOString()}] repair_run=${state.latest_repair_run_id || 'unknown'} failure_count=${failureArtifacts.length}`);
if (failureArtifacts.length > 0) {
  for (const file of failureArtifacts) {
    lines.push(`  failure: ${file}`);
  }
}
if (changedFiles.length > 0) {
  for (const file of changedFiles) {
    lines.push(`  ${file}`);
  }
} else {
  lines.push('  (no changed files recorded)');
}
fs.appendFileSync(logPath, lines.join('\n') + '\n');
NODE
}

record_latest_run_from_state() {
  local role="$1"
  ROLE="$role" STATE_FILE="$STATE_FILE" node - <<'NODE'
const fs = require('fs');
const stateFile = process.env.STATE_FILE;
const role = process.env.ROLE;
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const now = new Date().toISOString();
if (role === 'auditor') {
  state.audit_runs = Array.isArray(state.audit_runs) ? state.audit_runs : [];
  if (state.latest_audit_run_id && !state.audit_runs.includes(state.latest_audit_run_id)) {
    state.audit_runs.push(state.latest_audit_run_id);
  }
}
if (role === 'repairer') {
  state.repair_runs = Array.isArray(state.repair_runs) ? state.repair_runs : [];
  if (state.latest_repair_run_id && !state.repair_runs.includes(state.latest_repair_run_id)) {
    state.repair_runs.push(state.latest_repair_run_id);
  }
}
state.updated_at = now;
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n');
NODE
}

state_event_count() {
  STATE_FILE="$STATE_FILE" node - <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
process.stdout.write(String(Array.isArray(state.events) ? state.events.length : 0));
NODE
}

wait_for_role_signal() {
  local role="$1"
  local timeout="${2:-30}"
  local baseline="${3:-0}"
  local elapsed=0
  local event_json
  while [ "$elapsed" -lt "$timeout" ]; do
    event_json="$(ROLE="$role" BASELINE="$baseline" STATE_FILE="$STATE_FILE" node - <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
const role = process.env.ROLE;
const baseline = Number(process.env.BASELINE || 0);
const events = Array.isArray(state.events) ? state.events : [];
const next = events.slice(baseline).find((event) => event && event.role === role);
if (next) process.stdout.write(JSON.stringify(next));
NODE
)"
    if [ -n "$event_json" ]; then
      printf '%s' "$event_json"
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

event_field() {
  local event_json="$1"
  local expr="$2"
  EVENT_JSON="$event_json" EXPR="$expr" node - <<'NODE'
const event = JSON.parse(process.env.EVENT_JSON);
const expr = process.env.EXPR;
const fn = new Function('event', `return ${expr};`);
const value = fn(event);
if (value === undefined || value === null) process.exit(1);
if (typeof value === 'object') {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
NODE
}

build_failure_manifest_from_state() {
  local failure_manifest="$1"
  SOURCE_DIR="$SOURCE_DIR" STATE_FILE="$STATE_FILE" FAILURE_MANIFEST="$failure_manifest" node - <<'NODE'
const fs = require('fs');
const path = require('path');
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
const runId = state.latest_audit_run_id || null;
const failureArtifacts = Array.isArray(state.pending_failure_artifacts) ? state.pending_failure_artifacts.filter(Boolean) : [];
if (!runId || failureArtifacts.length === 0) process.exit(1);
const runDir = path.join(process.env.SOURCE_DIR, 'status', 'live-runs', runId);
const manifest = {
  pipeline_id: state.pipeline_id || null,
  audit_run_id: runId,
  audit_run_dir: runDir,
  checklist: path.join(runDir, 'checklist.json'),
  created_at: new Date().toISOString(),
  failure_artifacts: failureArtifacts,
};
fs.writeFileSync(process.env.FAILURE_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
NODE
}

determine_resume_plan() {
  STATE_FILE="$STATE_FILE" node - <<'NODE'
const fs = require('fs');
const state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8'));
const lastEvent = state.last_event || {};
const cycle = Number(state.cycle_count || 0);
let nextAction = 'audit';
let nextCycle = cycle > 0 ? cycle : 1;
let reuseLastEvent = '0';
let reason = 'fresh_start';

if (state.status === 'completed') {
  nextAction = 'done';
  reason = 'already_completed';
} else if (state.status === 'failed' && state.failure_reason === 'missing_auditor_signal' && lastEvent.role === 'auditor' && lastEvent.event === 'repair_requested') {
  nextAction = 'repair';
  nextCycle = cycle > 0 ? cycle : 1;
  reuseLastEvent = '1';
  reason = 'resume_after_missed_auditor_signal';
} else if (state.status === 'failed' && state.failure_reason === 'missing_repairer_signal' && lastEvent.role === 'repairer' && lastEvent.event === 'audit_requested') {
  nextAction = 'audit';
  nextCycle = cycle > 0 ? cycle + 1 : 1;
  reason = 'resume_after_missed_repairer_signal';
} else if (state.status === 'running_repair' || state.status === 'awaiting_repair') {
  nextAction = 'repair';
  nextCycle = cycle > 0 ? cycle : 1;
  reason = 'resume_repair_phase';
} else if (state.status === 'running_audit' || state.status === 'awaiting_audit' || state.status === 'initialized') {
  nextAction = 'audit';
  nextCycle = cycle > 0 ? cycle : 1;
  reason = 'resume_audit_phase';
} else if (state.status === 'failed') {
  nextAction = 'failed';
  reason = state.failure_reason || 'failed_state';
}

process.stdout.write([nextAction, String(nextCycle), reuseLastEvent, reason].join('\t'));
NODE
}

launch_auditor() {
  log_line "launching auditor (provider=$MAC10_AGENT_PROVIDER)"
  MAC10_LIVE_PIPELINE_ID="$PIPELINE_ID" \
  MAC10_LIVE_PIPELINE_SIGNAL_DIR="$SIGNAL_DIR" \
  MAC10_LIVE_PIPELINE_STATE_FILE="$STATE_FILE" \
  MAC10_FORCE_PROVIDER="$MAC10_AGENT_PROVIDER" \
  bash "$SCRIPT_DIR/launch-gpt-live-e2e.sh" "$SOURCE_DIR" "$MODEL_NAME"
}

launch_repairer() {
  local failure_manifest="$1"
  log_line "launching repairer for failure set $failure_manifest (provider=$MAC10_AGENT_PROVIDER)"
  MAC10_LIVE_PIPELINE_ID="$PIPELINE_ID" \
  MAC10_LIVE_PIPELINE_SIGNAL_DIR="$SIGNAL_DIR" \
  MAC10_LIVE_PIPELINE_STATE_FILE="$STATE_FILE" \
  MAC10_FORCE_PROVIDER="$MAC10_AGENT_PROVIDER" \
  bash "$SCRIPT_DIR/launch-gpt-live-e2e-repair.sh" "$SOURCE_DIR" "$failure_manifest" "$MODEL_NAME"
}

init_state
log_line "pipeline initialized provider=$MAC10_AGENT_PROVIDER model=$MODEL_NAME max_cycles=$MAX_CYCLES isolation=$ISOLATION_MODE harness=$REPO_DIR target=$SOURCE_DIR"
set_state_value 'if (state.status === "initialized") state.status = "awaiting_audit";'

IFS=$'\t' read -r next_action cycle reuse_last_event resume_reason <<< "$(determine_resume_plan)"

if [ "$next_action" = "done" ]; then
  log_line "pipeline already completed"
  exit 0
fi

if [ "$next_action" = "failed" ]; then
  log_line "pipeline in unrecoverable state: $resume_reason"
  exit 1
fi

if [ "$reuse_last_event" = "1" ]; then
  log_line "resuming from $resume_reason cycle=$cycle action=$next_action"
fi

while [ "$cycle" -le "$MAX_CYCLES" ]; do
  if [ "$next_action" = "audit" ]; then
    set_state_value "state.cycle_count = $cycle; state.status = 'running_audit'; delete state.failure_reason; delete state.failed_at;"
    audit_signal_count="$(state_event_count)"
    launch_auditor
    audit_signal="$(wait_for_role_signal auditor 60 "$audit_signal_count" || true)"
    if [ -z "${audit_signal:-}" ]; then
      log_line "no auditor signal received"
      set_state_value 'state.status = "failed"; state.failure_reason = "missing_auditor_signal"; state.failed_at = now;'
      touch "$STOP_SIGNAL"
      exit 1
    fi

    record_latest_run_from_state auditor
    set_state_value "state.event_cursor = $(state_event_count);"
    audit_event="$(event_field "$audit_signal" 'event.event')"
    log_line "auditor signaled $audit_event"

    if [ "$audit_event" = "pipeline_completed" ]; then
      set_state_value 'state.status = "completed"; state.completed_at = now;'
      touch "$STOP_SIGNAL"
      log_line "pipeline completed with no remaining logged errors"
      exit 0
    fi

    if [ "$audit_event" != "repair_requested" ]; then
      set_state_value "state.status = 'failed'; state.failure_reason = 'unexpected_auditor_event:${audit_event}'; state.failed_at = now;"
      touch "$STOP_SIGNAL"
      exit 1
    fi

    next_action="repair"
    reuse_last_event=0
    continue
  fi

  if [ "$next_action" != "repair" ]; then
    set_state_value "state.status = 'failed'; state.failure_reason = 'unexpected_next_action:${next_action}'; state.failed_at = now;"
    touch "$STOP_SIGNAL"
    exit 1
  fi

  failure_manifest="$PIPELINE_DIR/pending-failures.json"
  rm -f "$failure_manifest"
  if ! build_failure_manifest_from_state "$failure_manifest"; then
    set_state_value 'state.status = "failed"; state.failure_reason = "missing_failure_manifest"; state.failed_at = now;'
    touch "$STOP_SIGNAL"
    exit 1
  fi

  failure_artifacts_json="$(FAILURE_MANIFEST="$failure_manifest" node - <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync(process.env.FAILURE_MANIFEST, 'utf8'));
process.stdout.write(JSON.stringify(Array.isArray(manifest.failure_artifacts) ? manifest.failure_artifacts : []));
NODE
)"
  set_state_value "state.cycle_count = $cycle; state.status = 'running_repair'; delete state.failure_reason; delete state.failed_at; state.pending_failure_artifact = null; state.pending_failure_artifacts = ${failure_artifacts_json}; state.pending_failure_manifest = ${failure_manifest@Q};"
  repair_signal_count="$(state_event_count)"
  launch_repairer "$failure_manifest"
  repair_signal="$(wait_for_role_signal repairer 60 "$repair_signal_count" || true)"
  if [ -z "${repair_signal:-}" ]; then
    log_line "no repairer signal received"
    set_state_value 'state.status = "failed"; state.failure_reason = "missing_repairer_signal"; state.failed_at = now;'
    touch "$STOP_SIGNAL"
    exit 1
  fi

  record_latest_run_from_state repairer
  append_change_log
  set_state_value "state.event_cursor = $(state_event_count);"
  repair_event="$(event_field "$repair_signal" 'event.event')"
  log_line "repairer signaled $repair_event"

  if [ "$repair_event" = "pipeline_failed" ]; then
    set_state_value 'state.status = "failed"; state.failed_at = now;'
    touch "$STOP_SIGNAL"
    exit 1
  fi

  if [ "$repair_event" != "audit_requested" ]; then
    set_state_value "state.status = 'failed'; state.failure_reason = 'unexpected_repairer_event:${repair_event}'; state.failed_at = now;"
    touch "$STOP_SIGNAL"
    exit 1
  fi

  next_action="audit"
  reuse_last_event=0
  cycle=$((cycle + 1))
done

set_state_value 'state.status = "failed"; state.failure_reason = "max_cycles_exceeded";'
touch "$STOP_SIGNAL"
exit 1
