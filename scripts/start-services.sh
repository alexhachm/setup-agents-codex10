#!/usr/bin/env bash
# Runtime service startup: coordinator, worker registration, master agents.
# Separated from setup.sh so runtime restart doesn't re-run installation.
#
# Usage:
#   bash scripts/start-services.sh <project_dir> [num_workers]
#
# Can also be sourced by setup.sh when the variables are already set.
set -euo pipefail

if [ -z "${_START_SERVICES_SOURCED:-}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  PROJECT_DIR="${1:?Usage: start-services.sh <project_dir> [num_workers]}"
  NUM_WORKERS="${2:-4}"
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/scripts/provider-utils.sh"

  PROJECT_BASENAME="$(basename "$PROJECT_DIR")"
  NAMESPACE="${MAC10_NAMESPACE:-mac10-${PROJECT_BASENAME}}"
  NAMESPACE="$(echo "$NAMESPACE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | cut -c1-20)"

  CLAUDE_DIR="$PROJECT_DIR/.claude"
  MAC10_CLI="$CLAUDE_DIR/scripts/mac10"
  WORKTREE_DIR="$PROJECT_DIR/.worktrees"

  IS_WSL=false
  IS_MSYS=false
  if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    IS_WSL=true
  elif [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
    IS_MSYS=true
  fi

  MAC10_AGENT_PROVIDER="${MAC10_AGENT_PROVIDER:-}"
  if [ -z "$MAC10_AGENT_PROVIDER" ]; then
    CONFIG_FILE="$(mac10_provider_config_file "$PROJECT_DIR")"
    if [ -f "$CONFIG_FILE" ]; then
      # shellcheck disable=SC1090
      . "$CONFIG_FILE"
      MAC10_AGENT_PROVIDER="${MAC10_AGENT_PROVIDER:-}"
    fi
  fi
  if [ -z "$MAC10_AGENT_PROVIDER" ]; then
    MAC10_AGENT_PROVIDER="$(mac10_default_provider_id "$PROJECT_DIR")"
  fi
fi

# --- Runtime utility functions ---

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

pid_env_value() {
  local pid="$1"
  local name="$2"
  if [ -r "/proc/$pid/environ" ]; then
    tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null \
      | sed -n "s/^${name}=//p" \
      | head -n 1
  fi
}

coordinator_pids_for_project() {
  local project_dir="$1"
  ps -eww -o pid= -o args= 2>/dev/null \
    | awk -v project="$project_dir" '
      /coordinator\/src\/index\.js/ && index($0, project) { print $1 }
    '
}

stop_duplicate_project_coordinators() {
  local project_dir="$1"
  local namespace="$2"
  local keep_pid=""
  local pid ns

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    is_pid_alive "$pid" || continue
    ns="$(pid_env_value "$pid" MAC10_NAMESPACE)"
    if [ "$ns" = "$namespace" ] && [ -z "$keep_pid" ]; then
      keep_pid="$pid"
      continue
    fi
    echo "  Stopping duplicate coordinator for this project (PID $pid, namespace ${ns:-unknown})."
    kill "$pid" 2>/dev/null || true
    sleep 0.5
    kill -9 "$pid" 2>/dev/null || true
  done < <(coordinator_pids_for_project "$project_dir")
}

runtime_role_key() {
  local role="${1#/}"
  printf '%s' "$role" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g'
}

find_master_role_pid() {
  local project_dir="$1"
  local role="$2"
  local role_key pid args
  role_key="$(runtime_role_key "$role")"
  pid="$(read_pid_file "$project_dir/.claude/state/agent-runtimes/${role_key}.pid")"
  if is_pid_alive "$pid"; then
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    if printf '%s' "$args" | grep -q 'launch-agent.sh' \
      && printf '%s' "$args" | grep -Fq "$project_dir" \
      && printf '%s' "$args" | grep -Fq "$role"; then
      printf '%s\n' "$pid"
      return
    fi
  fi

  ps -eww -o pid= -o args= 2>/dev/null \
    | awk -v project="$project_dir" -v role="$role" '
      /launch-agent\.sh/ && index($0, project) && index($0, role) { print $1; exit }
    '
}

# --- Start coordinator ---

start_coordinator() {
  echo "[8/8] Starting coordinator..."
  stop_duplicate_project_coordinators "$PROJECT_DIR" "$NAMESPACE"

  local ALREADY_RUNNING=false
  local SOCK_PATH_FILE="$CLAUDE_DIR/state/${NAMESPACE}.sock.path"
  if "$MAC10_CLI" ping &>/dev/null; then
    ALREADY_RUNNING=true
    echo "  Coordinator already running, skipping start."
  elif [ -f "$SOCK_PATH_FILE" ]; then
    rm -f "$SOCK_PATH_FILE" 2>/dev/null || true
  fi

  if [ "$ALREADY_RUNNING" = false ]; then
    nohup env MAC10_NAMESPACE="$NAMESPACE" MAC10_SCRIPT_DIR="$SCRIPT_DIR" \
      node "$SCRIPT_DIR/coordinator/src/index.js" "$PROJECT_DIR" \
      > "$CLAUDE_DIR/state/${NAMESPACE}.coordinator.log" 2>&1 &
    local COORD_PID=$!

    for i in $(seq 1 30); do
      if [ -f "$SOCK_PATH_FILE" ] && [ -S "$(cat "$SOCK_PATH_FILE" 2>/dev/null)" ]; then
        break
      fi
      sleep 0.2
    done

    if ! [ -f "$SOCK_PATH_FILE" ] || ! [ -S "$(cat "$SOCK_PATH_FILE" 2>/dev/null)" ]; then
      echo "WARNING: Coordinator didn't create socket within 6s"
      echo "  Check logs or run: node $SCRIPT_DIR/coordinator/src/index.js $PROJECT_DIR"
    else
      echo "  Coordinator running (PID: $COORD_PID)"
    fi
  fi

  local COORD_READY=false
  for attempt in $(seq 1 10); do
    if "$MAC10_CLI" ping &>/dev/null; then
      COORD_READY=true
      break
    fi
    sleep 1
  done

  if [ "$COORD_READY" = true ]; then
    for i in $(seq 1 "$NUM_WORKERS"); do
      for attempt in 1 2 3; do
        if "$MAC10_CLI" register-worker "$i" "$WORKTREE_DIR/wt-$i" "agent-$i" 2>/dev/null; then
          echo "  Registered worker $i"
          break
        fi
        sleep 1
      done
    done
  else
    echo "WARNING: Coordinator not responsive — workers not registered"
    echo "  Run manually: $MAC10_CLI register-worker <id> <worktree_path> <branch>"
  fi
}

# --- Launch master agents ---

launch_master_agents() {
  echo "Launching master agents..."

  local LAUNCH_SCRIPT="$SCRIPT_DIR/scripts/launch-agent.sh"

  launch_master_role() {
    local title="$1"
    local model="$2"
    local role="$3"
    local existing_pid
    existing_pid="$(find_master_role_pid "$PROJECT_DIR" "$role")"
    if is_pid_alive "$existing_pid"; then
      if [ "$role" = "/master-loop" ]; then
        echo "  $title already running (PID $existing_pid); reopening user-facing terminal."
        pkill -TERM -P "$existing_pid" 2>/dev/null || true
        kill "$existing_pid" 2>/dev/null || true
        sleep 1
        pkill -KILL -P "$existing_pid" 2>/dev/null || true
        kill -9 "$existing_pid" 2>/dev/null || true
        rm -rf "$PROJECT_DIR/.claude/state/agent-runtimes/$(runtime_role_key "$role").lock"
        rm -f "$PROJECT_DIR/.claude/state/agent-runtimes/$(runtime_role_key "$role").pid" \
              "$PROJECT_DIR/.claude/state/agent-runtimes/$(runtime_role_key "$role").env"
      else
      echo "  $title already running (PID $existing_pid); skipping duplicate launch."
      return 0
      fi
    fi

    if [ "$IS_MSYS" = true ]; then
      local win_launch_script
      win_launch_script="$(cygpath -w "$LAUNCH_SCRIPT" 2>/dev/null || printf '%s' "$LAUNCH_SCRIPT")"
      if command -v wt.exe >/dev/null 2>&1; then
        wt.exe -w 0 new-tab --title "$title" bash.exe -l "$win_launch_script" "$PROJECT_DIR" "$model" "$role" &
        echo "  $title terminal opened."
      else
        echo "  Windows Terminal not found — start manually:"
        echo "    bash $win_launch_script $PROJECT_DIR $model $role"
      fi
    elif [ "$IS_WSL" = true ]; then
      local wt_exe="/mnt/c/Users/$USER/AppData/Local/Microsoft/WindowsApps/wt.exe"
      if [ -f "$wt_exe" ]; then
        "$wt_exe" -w 0 new-tab --title "$title" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" "$model" "$role" &
        echo "  $title terminal opened."
      else
        echo "  Windows Terminal not found — start manually:"
        echo "    bash $LAUNCH_SCRIPT $PROJECT_DIR $model $role"
      fi
    else
      echo "  Start manually in a separate terminal:"
      echo "    bash $LAUNCH_SCRIPT $PROJECT_DIR $model $role"
    fi
  }

  launch_master_role "Master-1 (Interface/Fast)" fast /master-loop
  sleep 1
  launch_master_role "Master-2 (Architect/Deep)" deep /architect-loop
  sleep 1
  launch_master_role "Master-3 (Allocator/Fast)" fast /allocate-loop
}

# --- Completion banner ---

print_completion_banner() {
  echo ""
  echo "========================================"
  echo " mac10 Setup Complete!"
  echo "========================================"
  echo ""
  echo "3 Masters launched:"
  echo "  Master-1 (Interface/Fast)  — user's contact point"
  echo "  Master-2 (Architect/Deep)  — triage & decomposition"
  echo "  Master-3 (Allocator/Fast)  — task-worker matching"
  echo ""
  if [ "$PROJECT_DIR" = "$SCRIPT_DIR" ]; then
    echo "Next startup: bash $PROJECT_DIR/START_HERE.sh"
    echo "Stop system:  bash $PROJECT_DIR/START_HERE.sh --stop"
  else
    echo "Next startup: bash $SCRIPT_DIR/start.sh --provider $MAC10_AGENT_PROVIDER $PROJECT_DIR"
    echo "Stop system:  bash $SCRIPT_DIR/start.sh --provider $MAC10_AGENT_PROVIDER --stop $PROJECT_DIR"
  fi
  echo "Submit work:  $MAC10_CLI request \"Add user authentication\""
  echo "Check status: $MAC10_CLI status"
  echo "View logs:    $MAC10_CLI log"
  echo ""
  echo "Workers will be spawned automatically when tasks are assigned."
  echo ""
}

# --- Main ---

if [ -z "${_START_SERVICES_SOURCED:-}" ]; then
  start_coordinator
  launch_master_agents
  print_completion_banner
fi
