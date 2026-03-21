#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "ERROR: provider argument is required (codex|claude)" >&2
  exit 1
fi

PROVIDER="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
shift || true

case "$PROVIDER" in
  codex|claude) ;;
  *)
    echo "ERROR: provider must be 'codex' or 'claude' (got: $PROVIDER)" >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<EOF
Usage:
  ./start-${PROVIDER}.sh [project_dir] [num_workers]
  ./start-${PROVIDER}.sh --stop [project_dir]
  ./start-${PROVIDER}.sh --pause [project_dir]
  ./start-${PROVIDER}.sh --help

Examples:
  ./start-${PROVIDER}.sh
  ./start-${PROVIDER}.sh /path/to/project 6
  ./start-${PROVIDER}.sh --stop
  ./start-${PROVIDER}.sh --pause /path/to/project
EOF
}

stop_services() {
  local project_dir="$1"
  local driver_pid_file="$project_dir/.codex/state/research-driver.pid"
  local coordinator_cli="$project_dir/.codex/scripts/codex10"

  echo "Stopping mac10 services for project: $project_dir"

  if [ -f "$driver_pid_file" ]; then
    local pid
    pid="$(cat "$driver_pid_file" 2>/dev/null || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "  Research driver stopped (PID $pid)"
    fi
    rm -f "$driver_pid_file"
  fi

  if [ -x "$coordinator_cli" ]; then
    "$coordinator_cli" stop "$project_dir" >/dev/null 2>&1 || true
    echo "  Coordinator stop requested"
  else
    echo "  Coordinator CLI not found at $coordinator_cli (skip coordinator stop)"
  fi
}

pause_services() {
  local project_dir="$1"
  local db_file="$project_dir/.codex/state/codex10.db"
  local health_file="$project_dir/.codex/state/codex10.agent-health.json"

  stop_services "$project_dir"

  if [ -f "$db_file" ]; then
    (
      cd "$REPO_ROOT/coordinator"
      node - "$db_file" <<'NODE'
const Database = require('better-sqlite3');
const dbPath = process.argv[2];
const db = new Database(dbPath);
db.prepare("UPDATE loops SET status='stopped', stopped_at=COALESCE(stopped_at,datetime('now')), updated_at=datetime('now') WHERE status='active'").run();
db.prepare("UPDATE research_queue SET status='queued', started_at=NULL, error='Re-queued during pipeline pause' WHERE status='in_progress'").run();
NODE
    ) >/dev/null 2>&1 || true
  fi

  node - "$health_file" <<'NODE' >/dev/null 2>&1 || true
const fs = require('fs');
const path = require('path');
const p = process.argv[2];
let j = {};
try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
const now = new Date().toISOString();
j['master-1'] = { ...(j['master-1'] || {}), status: 'paused' };
j['master-2'] = { ...(j['master-2'] || {}), status: 'paused' };
j['master-3'] = { ...(j['master-3'] || {}), status: 'paused' };
j['research-driver'] = { status: 'paused', last_active: now };
fs.mkdirSync(path.dirname(p), { recursive: true });
fs.writeFileSync(p, JSON.stringify(j, null, 2));
NODE

  echo "Paused. Loops stopped, in-progress research re-queued, health marked paused."
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "${1:-}" = "--stop" ] || [ "${1:-}" = "--pause" ]; then
  if [ $# -gt 2 ]; then
    usage >&2
    exit 1
  fi
  MODE="$1"
  PROJECT_DIR="${2:-$REPO_ROOT}"
  if [ ! -d "$PROJECT_DIR" ]; then
    echo "ERROR: project directory not found: $PROJECT_DIR" >&2
    exit 1
  fi
  if [ "$MODE" = "--stop" ]; then
    stop_services "$PROJECT_DIR"
  else
    pause_services "$PROJECT_DIR"
  fi
  exit 0
fi

if [ $# -gt 2 ]; then
  usage >&2
  exit 1
fi

PROJECT_DIR="${1:-$REPO_ROOT}"
NUM_WORKERS="${2:-}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: project directory not found: $PROJECT_DIR" >&2
  exit 1
fi

echo "Starting mac10 setup with provider='$PROVIDER' project='$PROJECT_DIR'${NUM_WORKERS:+ workers='$NUM_WORKERS'}"

if [ -n "$NUM_WORKERS" ]; then
  MAC10_FORCE_PROVIDER="$PROVIDER" bash "$REPO_ROOT/setup.sh" "$PROJECT_DIR" "$NUM_WORKERS"
else
  MAC10_FORCE_PROVIDER="$PROVIDER" bash "$REPO_ROOT/setup.sh" "$PROJECT_DIR"
fi
