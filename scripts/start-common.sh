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

extract_remote_debugging_port() {
  local args="$1"
  printf '%s' "$args" | sed -nE 's/.*--remote-debugging-port=([0-9]{2,5}).*/\1/p' | head -n 1
}

find_driver_pid() {
  local project_dir="$1"
  local lock_file="$project_dir/.codex/state/research-driver.lock"
  local pid
  local args

  pid="$(read_pid_file "$lock_file")"
  if is_pid_alive "$pid"; then
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if printf '%s' "$args" | grep -q 'chatgpt-driver.py'; then
      printf '%s\n' "$pid"
      return
    fi
  fi

  pgrep -f "$project_dir/.codex/scripts/chatgpt-driver.py" 2>/dev/null | head -n 1 || true
}

find_sentinel_pid() {
  local project_dir="$1"
  local pid_file="$project_dir/.codex/state/research-sentinel.pid"
  local pid
  local args

  pid="$(read_pid_file "$pid_file")"
  if is_pid_alive "$pid"; then
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if printf '%s' "$args" | grep -q 'research-sentinel.sh'; then
      printf '%s\n' "$pid"
      return
    fi
  fi

  pgrep -f "$project_dir/.codex/scripts/research-sentinel.sh" 2>/dev/null | head -n 1 || true
}

discover_cdp_port() {
  local project_dir="$1"
  local driver_pid="${2:-}"
  local child_pid
  local args
  local port
  local log_file="$project_dir/.codex/logs/research-driver.log"

  if is_pid_alive "$driver_pid"; then
    while IFS= read -r child_pid; do
      [ -n "$child_pid" ] || continue
      args="$(ps -p "$child_pid" -o args= 2>/dev/null || true)"
      port="$(extract_remote_debugging_port "$args")"
      if [ -n "$port" ]; then
        printf '%s\n' "$port"
        return
      fi
    done < <(pgrep -P "$driver_pid" 2>/dev/null || true)
  fi

  local profile_suffix
  profile_suffix="$(_compute_profile_suffix "$project_dir")"
  while IFS= read -r args; do
    port="$(extract_remote_debugging_port "$args")"
    if [ -n "$port" ]; then
      printf '%s\n' "$port"
      return
    fi
  done < <(ps -eo args= 2>/dev/null | grep -E '(chrome|chromium)' | grep "chatgpt-codex-profile-${profile_suffix}" || true)

  if [ -f "$log_file" ]; then
    port="$(grep -oE '127\.0\.0\.1:[0-9]{2,5}' "$log_file" | tail -n 1 | cut -d: -f2 || true)"
    if [ -n "$port" ]; then
      printf '%s\n' "$port"
      return
    fi
  fi

  # Nodriver often sets a random port, but 9222 is still a useful fallback probe.
  printf '9222\n'
}

probe_cdp_port() {
  local port="${1:-}"
  [ -n "$port" ] || return 1
  curl -fsS --connect-timeout 2 --max-time 3 "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1
}

_compute_profile_suffix() {
  local project_dir="$1"
  printf '%s' "$project_dir" | sha256sum | cut -c1-12
}

kill_profile_chrome_processes() {
  local project_dir="${1:-}"
  local profile_pattern="chatgpt-codex-profile"
  local pid

  # If a project dir is given, only kill Chrome for that project's profile
  if [ -n "$project_dir" ]; then
    local suffix
    suffix="$(_compute_profile_suffix "$project_dir")"
    profile_pattern="chatgpt-codex-profile-${suffix}"
  fi

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill "$pid" 2>/dev/null || true
  done < <(ps -eo pid=,args= 2>/dev/null | awk -v pat="$profile_pattern" '/(chrome|chromium)/ && index($0, pat) {print $1}')

  sleep 1

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill -9 "$pid" 2>/dev/null || true
  done < <(ps -eo pid=,args= 2>/dev/null | awk -v pat="$profile_pattern" '/(chrome|chromium)/ && index($0, pat) {print $1}')
}

cleanup_stale_research_runtime() {
  local project_dir="$1"
  local stale_driver_pid="${2:-}"
  local lock_file="$project_dir/.codex/state/research-driver.lock"
  local driver_pid_file="$project_dir/.codex/state/research-driver.pid"
  local sentinel_pid_file="$project_dir/.codex/state/research-sentinel.pid"
  local pid

  echo "  Cleaning stale research runtime (driver PID ${stale_driver_pid:-unknown})"

  pid="$(find_sentinel_pid "$project_dir")"
  if is_pid_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$sentinel_pid_file"

  if is_pid_alive "$stale_driver_pid"; then
    kill "$stale_driver_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$stale_driver_pid" 2>/dev/null || true
  fi

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill "$pid" 2>/dev/null || true
  done < <(pgrep -f "$project_dir/.codex/scripts/chatgpt-driver.py" 2>/dev/null || true)

  sleep 1

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill -9 "$pid" 2>/dev/null || true
  done < <(pgrep -f "$project_dir/.codex/scripts/chatgpt-driver.py" 2>/dev/null || true)

  kill_profile_chrome_processes "$project_dir"

  rm -f "$driver_pid_file" "$lock_file"
  echo "  Removed stale lock file: $lock_file"
}

# start_research_sentinel: first definition removed — see canonical definition below

read_research_health_status() {
  local health_file="$1"
  if [ ! -f "$health_file" ]; then
    return 0
  fi
  node - "$health_file" <<'NODE' 2>/dev/null || true
const fs = require('fs');
const p = process.argv[2];
try {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  process.stdout.write(String((j['research-driver'] || {}).status || ''));
} catch {}
NODE
}

wait_for_research_health() {
  local project_dir="$1"
  local health_file="$project_dir/.codex/state/codex10.agent-health.json"
  local attempts="${2:-10}"
  local i
  local status
  local driver_pid
  local cdp_port

  for i in $(seq 1 "$attempts"); do
    status="$(read_research_health_status "$health_file")"
    if [ "$status" = "active" ]; then
      return 0
    fi

    driver_pid="$(find_driver_pid "$project_dir")"
    if [ -n "$driver_pid" ]; then
      cdp_port="$(discover_cdp_port "$project_dir" "$driver_pid")"
      if probe_cdp_port "$cdp_port"; then
        return 0
      fi
    fi

    sleep 1
  done

  return 1
}

ensure_research_driver() {
  local project_dir="$1"
  local driver_pid
  local cdp_port

  echo "Checking research driver health..."

  driver_pid="$(find_driver_pid "$project_dir")"
  if [ -n "$driver_pid" ]; then
    cdp_port="$(discover_cdp_port "$project_dir" "$driver_pid")"
    if probe_cdp_port "$cdp_port"; then
      echo "  Existing research driver is healthy (PID $driver_pid, CDP port $cdp_port)."
      return 0
    fi

    echo "  Existing research driver is stale (PID $driver_pid, CDP port ${cdp_port:-unknown} unreachable)."
    cleanup_stale_research_runtime "$project_dir" "$driver_pid"
  fi

  start_research_sentinel "$project_dir"
  echo "  Waiting for research driver to become healthy..."
  sleep 6

  if wait_for_research_health "$project_dir" 10; then
    driver_pid="$(find_driver_pid "$project_dir")"
    cdp_port="$(discover_cdp_port "$project_dir" "$driver_pid")"
    echo "  Research driver healthy (PID ${driver_pid:-unknown}, CDP port ${cdp_port:-unknown})."
    return 0
  fi

  echo "ERROR: research driver did not become healthy after sentinel startup." >&2
  return 1
}

usage() {
  cat <<EOF2
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
EOF2
}

kill_matching_processes() {
  local pattern="$1"
  local label="$2"

  if pgrep -f "$pattern" >/dev/null 2>&1; then
    pkill -f "$pattern" >/dev/null 2>&1 || true
    sleep 0.5
    pkill -9 -f "$pattern" >/dev/null 2>&1 || true
    echo "  Cleared $label process(es)"
  else
    echo "  No $label processes found"
  fi
}

force_reset_research_runtime() {
  local project_dir="$1"
  local state_dir="$project_dir/.codex/state"
  local driver_pid_file="$state_dir/research-driver.pid"
  local sentinel_pid_file="$state_dir/research-sentinel.pid"
  local driver_lock_file="$state_dir/research-driver.lock"

  echo "Force-clearing stale research runtime state..."

  # Only kill sentinel/driver processes for THIS project (not global)
  kill_matching_processes "$project_dir.*[r]esearch-sentinel.sh" "research sentinel"
  kill_matching_processes "$project_dir.*[c]hatgpt-driver.py" "research driver"

  # Driver Chrome processes are tied to the per-project profile path.
  local profile_suffix
  profile_suffix="$(_compute_profile_suffix "$project_dir")"
  kill_matching_processes "chatgpt-codex-profile-${profile_suffix}" "driver Chrome/chromium"

  rm -f "$driver_lock_file" "$driver_pid_file" "$sentinel_pid_file"
  echo "  Cleared lock/PID files"
}

start_research_sentinel() {
  local project_dir="$1"
  local state_dir="$project_dir/.codex/state"
  local log_dir="$project_dir/.codex/logs"
  local sentinel_script="$project_dir/.codex/scripts/research-sentinel.sh"
  local sentinel_pid_file="$state_dir/research-sentinel.pid"

  if [ ! -f "$sentinel_script" ]; then
    sentinel_script="$project_dir/scripts/research-sentinel.sh"
  fi
  if [ ! -f "$sentinel_script" ]; then
    echo "WARNING: research sentinel script not found (checked .codex/scripts/ and scripts/) (skip startup)" >&2
    return
  fi

  mkdir -p "$state_dir" "$log_dir"
  chmod +x "$sentinel_script" >/dev/null 2>&1 || true

  nohup bash "$sentinel_script" "$project_dir" >/dev/null 2>&1 < /dev/null &
  local sentinel_pid=$!
  echo "$sentinel_pid" > "$sentinel_pid_file"

  echo "Started research sentinel (PID $sentinel_pid)"
  echo "  Log: $project_dir/.codex/logs/research-sentinel.log"
}

ensure_worktree_codex_copies() {
  local project_dir="$1"
  local num_workers="${2:-4}"
  local source_codex="$project_dir/.codex"
  local i wt_path wt_codex

  if [ ! -d "$source_codex" ]; then
    echo "WARNING: .codex source directory not found at $source_codex (skip worktree sync)" >&2
    return 0
  fi

  for i in $(seq 1 "$num_workers"); do
    wt_path="$project_dir/.worktrees/wt-$i"
    [ -d "$wt_path" ] || continue
    wt_codex="$wt_path/.codex"

    if [ -L "$wt_codex" ] || [ ! -d "$wt_codex" ]; then
      rm -rf "$wt_codex"
      cp -a "$source_codex" "$wt_codex"
      echo "  Refreshed $wt_codex"
    fi
    # Repair if knowledge is a file instead of a directory (corruption from prior run)
    if [ -e "$wt_codex/knowledge" ] && [ ! -d "$wt_codex/knowledge" ]; then
      rm -f "$wt_codex/knowledge"
    fi
    mkdir -p "$wt_codex/knowledge"
  done
}

stop_services() {
  local project_dir="$1"
  local lock_file="$project_dir/.codex/state/research-driver.lock"
  local coordinator_cli="$project_dir/.claude/scripts/codex10"
  if [ ! -x "$coordinator_cli" ]; then
    coordinator_cli="$project_dir/.codex/scripts/codex10"
  fi

  echo "Stopping mac10 services for project: $project_dir"

  force_reset_research_runtime "$project_dir"

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill "$pid" 2>/dev/null || true
  done < <(pgrep -f "$project_dir/.codex/scripts/chatgpt-driver.py" 2>/dev/null || true)

  kill_profile_chrome_processes "$project_dir"
  rm -f "$lock_file"

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
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

echo "Starting mac10 setup with provider='$PROVIDER' project='$PROJECT_DIR'${NUM_WORKERS:+ workers='$NUM_WORKERS'}"

if [ -n "$NUM_WORKERS" ]; then
  MAC10_FORCE_PROVIDER="$PROVIDER" bash "$REPO_ROOT/setup.sh" "$PROJECT_DIR" "$NUM_WORKERS"
else
  MAC10_FORCE_PROVIDER="$PROVIDER" bash "$REPO_ROOT/setup.sh" "$PROJECT_DIR"
fi

ensure_worktree_codex_copies "$PROJECT_DIR" "${NUM_WORKERS:-4}"
force_reset_research_runtime "$PROJECT_DIR"
start_research_sentinel "$PROJECT_DIR"
