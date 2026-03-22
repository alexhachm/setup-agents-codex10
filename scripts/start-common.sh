#!/usr/bin/env bash
# mac10 start-common.sh — Shared startup function library.
# Sourced by start-claude.sh and start-codex.sh.
# Each function is prefixed mac10_ and designed to be called in sequence.
#
# Required caller variables:
#   PROVIDER        — "claude" or "codex"
#   SCRIPT_DIR      — path to the setup-agents repo root
#   PROJECT_DIR     — path to the target project
#   NUM_WORKERS     — number of worktrees/workers (default 4)
#   NAMESPACE       — coordinator namespace (default "codex10")

set -euo pipefail

: "${PROVIDER:?start-common.sh requires PROVIDER (claude|codex)}"
: "${SCRIPT_DIR:?start-common.sh requires SCRIPT_DIR}"
: "${PROJECT_DIR:?start-common.sh requires PROJECT_DIR}"
: "${NUM_WORKERS:=4}"
: "${MAX_WORKERS:=8}"
: "${NAMESPACE:=codex10}"

CODEX_DIR="$PROJECT_DIR/.codex"
MAC10_COORDINATOR_READY=0

# Enable with MAC10_DEBUG=1 for verbose startup diagnostics.
MAC10_DEBUG="${MAC10_DEBUG:-0}"
MAC10_DEBUG_LOG="$CODEX_DIR/state/start-debug.log"

mac10_debug() {
  [ "$MAC10_DEBUG" = "1" ] || return 0
  local ts msg
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  msg="$*"
  mkdir -p "$(dirname "$MAC10_DEBUG_LOG")" 2>/dev/null || true
  printf '[%s] %s\n' "$ts" "$msg" | tee -a "$MAC10_DEBUG_LOG" >&2
}

mac10_copy_if_needed() {
  local src="$1"
  local dest="$2"

  if [ ! -e "$src" ]; then
    echo "ERROR: Source path not found: $src" >&2
    exit 1
  fi

  if [ -e "$dest" ] && [ "$src" -ef "$dest" ]; then
    mac10_debug "copy_if_needed skip same file src=$src dest=$dest"
    return 0
  fi

  cp "$src" "$dest"
}

# Source provider utilities for model resolution and CLI helpers
# shellcheck disable=SC1091
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/provider-utils.sh"

# ---------------------------------------------------------------------------
# mac10_detect_environment — IS_WSL/IS_MSYS detection + WSL shims
# ---------------------------------------------------------------------------
mac10_detect_environment() {
  IS_WSL=false
  IS_MSYS=false

  if grep -qi microsoft /proc/version 2>/dev/null; then
    _wsl_shim() {
      local cmd="$1"
      if ! command -v "$cmd" &>/dev/null; then
        for p in "/mnt/c/Program Files/GitHub CLI" "/mnt/c/Users/$USER/AppData/Local/Programs" "/mnt/c/ProgramData/chocolatey/bin"; do
          if [ -f "$p/${cmd}.exe" ]; then
            mkdir -p "$HOME/bin"
            ln -sf "$p/${cmd}.exe" "$HOME/bin/$cmd"
            export PATH="$HOME/bin:$PATH"
            return
          fi
        done
      fi
    }
    _wsl_shim gh
    _wsl_shim "$PROVIDER"
    [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null
  fi

  if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
    IS_WSL=true
  elif [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
    IS_MSYS=true
  fi

  export IS_WSL IS_MSYS
}

# ---------------------------------------------------------------------------
# mac10_preflight_checks — node/git/gh/tmux + provider CLI check
# ---------------------------------------------------------------------------
mac10_preflight_checks() {
  echo "[1/8] Preflight checks..."

  _check_cmd() {
    if ! command -v "$1" &>/dev/null; then
      echo "ERROR: '$1' not found. Please install it first."
      exit 1
    fi
  }

  _check_cmd node
  _check_cmd git
  _check_cmd gh
  if [ "$IS_WSL" = true ]; then
    _check_cmd tmux
  fi
  _check_cmd "$PROVIDER"

  local node_ver
  node_ver=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_ver" -lt 18 ]; then
    echo "ERROR: Node.js 18+ required (found v$(node -v))"
    exit 1
  fi

  if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
    echo "ERROR: $PROJECT_DIR is not a git repository"
    exit 1
  fi

  if ! git -C "$PROJECT_DIR" rev-parse --verify HEAD^{commit} &>/dev/null; then
    echo "ERROR: $PROJECT_DIR has no commits yet."
    echo "  Create an initial commit before launching workers."
    exit 1
  fi

  if ! gh auth status &>/dev/null; then
    echo "ERROR: GitHub CLI not authenticated. Run 'gh auth login' first."
    exit 1
  fi

  echo "  All checks passed."
}

# ---------------------------------------------------------------------------
# mac10_install_coordinator — npm install (skip if node_modules fresh)
# ---------------------------------------------------------------------------
mac10_install_coordinator() {
  echo "[2/8] Installing coordinator..."

  local nm_dir="$SCRIPT_DIR/coordinator/node_modules"
  local pkg_json="$SCRIPT_DIR/coordinator/package.json"

  if [ -d "$nm_dir" ] && [ "$nm_dir" -nt "$pkg_json" ]; then
    echo "  Dependencies already up to date."
    return 0
  fi

  cd "$SCRIPT_DIR/coordinator"
  npm install --production 2>&1 | tail -1
  cd "$PROJECT_DIR"
  echo "  Dependencies installed."
}

# ---------------------------------------------------------------------------
# mac10_setup_directories — mkdir + symlink probe
# ---------------------------------------------------------------------------
mac10_setup_directories() {
  echo "[3/8] Setting up project directories..."

  local legacy_dir="$PROJECT_DIR/.claude"
  if [ -d "$legacy_dir" ] && [ ! -L "$legacy_dir" ] && [ ! -e "$CODEX_DIR" ]; then
    mv "$legacy_dir" "$CODEX_DIR"
    echo "  Migrated existing .claude directory to .codex."
  fi

  # Ensure .claude symlink exists for Claude CLI compatibility.
  if [ -d "$CODEX_DIR" ] && [ ! -e "$legacy_dir" ]; then
    ln -s "$CODEX_DIR" "$legacy_dir"
    echo "  Created .claude -> .codex symlink for Claude CLI compatibility."
  elif [ -L "$legacy_dir" ]; then
    local current_target
    current_target="$(readlink "$legacy_dir" || true)"
    if [ "$current_target" != "$CODEX_DIR" ] && [ "$current_target" != ".codex" ]; then
      rm -f "$legacy_dir"
      ln -s "$CODEX_DIR" "$legacy_dir"
      echo "  Fixed .claude symlink -> .codex."
    fi
  fi

  mkdir -p "$CODEX_DIR/commands"
  mkdir -p "$CODEX_DIR/commands-codex10"
  mkdir -p "$CODEX_DIR/state"
  mkdir -p "$CODEX_DIR/knowledge/domain"
  mkdir -p "$CODEX_DIR/scripts"

  local probe_dir="$CODEX_DIR/.symlink-probe-dir"
  local probe_link="$CODEX_DIR/.symlink-probe-link"
  rm -rf "$probe_dir" "$probe_link" 2>/dev/null || true
  mkdir -p "$probe_dir"
  if ! ln -s "$probe_dir" "$probe_link" 2>/dev/null; then
    echo "ERROR: This environment cannot create symlinks."
    echo "  Worker runtimes now require symlinks (no copy fallback)."
    echo "  On Windows, enable Developer Mode or run with Administrator privileges."
    rm -rf "$probe_dir" "$probe_link" 2>/dev/null || true
    exit 1
  fi
  rm -rf "$probe_dir" "$probe_link" 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# mac10_copy_templates — commands, agents, knowledge, docs, settings
# ---------------------------------------------------------------------------
mac10_copy_templates() {
  echo "[4/8] Copying templates..."

  # Commands (shared) — only copy if not already present
  for f in "$SCRIPT_DIR/templates/commands/"*.md; do
    local dest="$CODEX_DIR/commands/$(basename "$f")"
    [ -f "$dest" ] || cp "$f" "$dest"
  done

  # Commands (codex10-isolated) — always refresh
  for f in "$SCRIPT_DIR/templates/commands/"*.md; do
    cp "$f" "$CODEX_DIR/commands-codex10/$(basename "$f")"
  done

  # Agent templates — only copy if not already present
  mkdir -p "$CODEX_DIR/agents"
  for f in "$SCRIPT_DIR/templates/agents/"*.md; do
    local dest="$CODEX_DIR/agents/$(basename "$f")"
    [ -f "$dest" ] || cp "$f" "$dest"
  done

  # Knowledge templates (don't overwrite existing)
  for f in "$SCRIPT_DIR/templates/knowledge/"*.md; do
    local dest="$CODEX_DIR/knowledge/$(basename "$f")"
    [ -f "$dest" ] || cp "$f" "$dest"
  done

  # Docs
  mkdir -p "$CODEX_DIR/docs"
  cp "$SCRIPT_DIR/templates/docs/"*.md "$CODEX_DIR/docs/"

  # CLAUDE.md for architect (root) — only if not already present
  if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
    cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/CLAUDE.md"
  else
    echo "  CLAUDE.md already exists, keeping existing."
  fi

  # Worker CLAUDE.md template
  cp "$SCRIPT_DIR/templates/worker-claude.md" "$CODEX_DIR/worker-claude.md"

  # AGENTS.md compatibility for Codex
  if [ ! -f "$PROJECT_DIR/AGENTS.md" ]; then
    cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/AGENTS.md"
  fi
  cp "$SCRIPT_DIR/templates/worker-claude.md" "$CODEX_DIR/worker-agents.md"

  # Settings
  local settings_file="$CODEX_DIR/settings.json"
  if [ ! -f "$settings_file" ]; then
    cp "$SCRIPT_DIR/templates/settings.json" "$settings_file"
  fi

  echo "  Templates copied."
}

# ---------------------------------------------------------------------------
# mac10_copy_scripts — Copy canonical scripts + hooks to .codex/scripts/
# ---------------------------------------------------------------------------
mac10_copy_scripts() {
  for s in worker-sentinel.sh loop-sentinel.sh launch-worker.sh signal-wait.sh state-lock.sh provider-utils.sh; do
    local dest="$CODEX_DIR/scripts/$s"
    # Skip if already a symlink pointing to canonical scripts/
    if [ -L "$dest" ]; then
      continue
    fi
    mac10_copy_if_needed "$SCRIPT_DIR/scripts/$s" "$dest"
  done

  # Research runtime assets (optional): install when present in source repo.
  local s src
  for s in research-gaps.sh research-sentinel.sh knowledge-score.sh test-research-pipeline.sh install-chrome.sh \
           chatgpt-driver.py compose-research-prompt.py ingest-research.py requirements-research.txt; do
    src="$SCRIPT_DIR/scripts/$s"
    [ -f "$src" ] || src="$SCRIPT_DIR/.codex/scripts/$s"
    [ -f "$src" ] || continue
    mac10_copy_if_needed "$src" "$CODEX_DIR/scripts/$s"
    mac10_debug "copied optional runtime asset $s from $src"
  done
  chmod +x "$CODEX_DIR/scripts/"*.sh

  # Hooks
  mkdir -p "$CODEX_DIR/hooks"
  if [ -f "$SCRIPT_DIR/.codex/hooks/pre-tool-secret-guard.sh" ]; then
    mac10_copy_if_needed \
      "$SCRIPT_DIR/.codex/hooks/pre-tool-secret-guard.sh" \
      "$CODEX_DIR/hooks/pre-tool-secret-guard.sh"
  fi
  chmod +x "$CODEX_DIR/hooks/"*.sh 2>/dev/null || true
}

# ---------------------------------------------------------------------------
# mac10_setup_cli_wrappers — Generate mac10/codex10 wrappers
# ---------------------------------------------------------------------------
mac10_setup_cli_wrappers() {
  echo "[5/8] Setting up codex10 CLI wrapper..."
  mac10_debug "setup_cli_wrappers begin provider=$PROVIDER project=$PROJECT_DIR namespace=$NAMESPACE"

  local mac10_bin="$SCRIPT_DIR/coordinator/bin/mac10"
  chmod +x "$mac10_bin"
  local mac10_cli="$CODEX_DIR/scripts/mac10-codex10"
  local codex10_cli="$CODEX_DIR/scripts/codex10"
  local mac10_compat="$CODEX_DIR/scripts/mac10"

  cat > "$mac10_cli" << 'WRAPPER'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC10_BIN="PLACEHOLDER_MAC10_BIN"
MAC10_PROJECT_DIR="PLACEHOLDER_MAC10_PROJECT_DIR"
if [ ! -f "$MAC10_BIN" ]; then
  echo "ERROR: mac10 CLI not found at $MAC10_BIN" >&2
  echo "  Has the setup-agents repo moved? Re-run setup.sh to fix." >&2
  exit 1
fi
if [ ! -d "$MAC10_PROJECT_DIR" ]; then
  echo "ERROR: mac10 project directory not found at $MAC10_PROJECT_DIR" >&2
  echo "  Re-run setup.sh to regenerate wrappers for this project." >&2
  exit 1
fi
export MAC10_NAMESPACE="codex10"
export MAC10_PROJECT_DIR
cd "$MAC10_PROJECT_DIR" || {
  echo "ERROR: failed to enter $MAC10_PROJECT_DIR" >&2
  exit 1
}
exec node "$MAC10_BIN" "$@"
WRAPPER
  sed -i "s|PLACEHOLDER_MAC10_BIN|$mac10_bin|" "$mac10_cli"
  sed -i "s|PLACEHOLDER_MAC10_PROJECT_DIR|$PROJECT_DIR|" "$mac10_cli"
  chmod +x "$mac10_cli"

  cp "$mac10_cli" "$codex10_cli"
  chmod +x "$codex10_cli"

  cat > "$mac10_compat" << 'WRAPPER'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC10_BIN="PLACEHOLDER_MAC10_BIN"
MAC10_PROJECT_DIR="PLACEHOLDER_MAC10_PROJECT_DIR"
if [ ! -f "$MAC10_BIN" ]; then
  echo "ERROR: mac10 CLI not found at $MAC10_BIN" >&2
  echo "  Has the setup-agents repo moved? Re-run setup.sh to fix." >&2
  exit 1
fi
if [ ! -d "$MAC10_PROJECT_DIR" ]; then
  echo "ERROR: mac10 project directory not found at $MAC10_PROJECT_DIR" >&2
  echo "  Re-run setup.sh to regenerate wrappers for this project." >&2
  exit 1
fi
export MAC10_NAMESPACE="${MAC10_NAMESPACE:-codex10}"
export MAC10_PROJECT_DIR
cd "$MAC10_PROJECT_DIR" || {
  echo "ERROR: failed to enter $MAC10_PROJECT_DIR" >&2
  exit 1
}
exec node "$MAC10_BIN" "$@"
WRAPPER
  sed -i "s|PLACEHOLDER_MAC10_BIN|$mac10_bin|" "$mac10_compat"
  sed -i "s|PLACEHOLDER_MAC10_PROJECT_DIR|$PROJECT_DIR|" "$mac10_compat"
  chmod +x "$mac10_compat"

  export PATH="$SCRIPT_DIR/coordinator/bin:$CODEX_DIR/scripts:$PATH"
  export MAC10_NAMESPACE="$NAMESPACE"

  CODEX10_CLI="$codex10_cli"
  mac10_debug "setup_cli_wrappers done codex10_cli=$CODEX10_CLI mac10_cli=$mac10_cli compat=$mac10_compat"
  echo "  codex10 wrapper ready: $codex10_cli"
}

# ---------------------------------------------------------------------------
# mac10_create_worktrees — Create/refresh worker worktrees
# ---------------------------------------------------------------------------
mac10_create_worktrees() {
  echo "[6/8] Creating $NUM_WORKERS worktrees..."

  local worktree_dir="$PROJECT_DIR/.worktrees"
  mkdir -p "$worktree_dir"

  cd "$PROJECT_DIR"
  local main_branch
  main_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

  local i wt_path branch
  for i in $(seq 1 "$NUM_WORKERS"); do
    wt_path="$worktree_dir/wt-$i"
    branch="agent-$i"

    if [ -d "$wt_path" ]; then
      echo "  Worktree wt-$i already exists, refreshing runtime links."
    else
      git branch "$branch" "$main_branch" 2>/dev/null || true
      if ! git worktree add "$wt_path" "$branch" 2>/dev/null; then
        if ! git worktree add "$wt_path" "$branch" --force 2>/dev/null; then
          echo "ERROR: failed to create worktree wt-$i at $wt_path"
          echo "  Ensure the repo has a valid HEAD commit and no conflicting worktree state."
          exit 1
        fi
      fi
    fi

    cp "$CODEX_DIR/worker-claude.md" "$wt_path/CLAUDE.md"
    cp "$CODEX_DIR/worker-agents.md" "$wt_path/AGENTS.md"

    if [ -L "$wt_path/.codex" ]; then
      local current_target
      current_target="$(readlink "$wt_path/.codex" || true)"
      if [ "$current_target" != "$CODEX_DIR" ]; then
        rm -f "$wt_path/.codex"
        ln -s "$CODEX_DIR" "$wt_path/.codex"
        echo "  Fixed wt-$i/.codex symlink -> $CODEX_DIR"
      fi
    elif [ -d "$wt_path/.codex" ]; then
      # Stale copy from previous run — remove and replace with symlink
      rm -rf "$wt_path/.codex"
      ln -s "$CODEX_DIR" "$wt_path/.codex"
      echo "  Replaced stale wt-$i/.codex directory with symlink."
    elif [ ! -e "$wt_path/.codex" ]; then
      ln -s "$CODEX_DIR" "$wt_path/.codex"
    fi

    # Legacy cleanup
    local legacy_wt="$wt_path/.claude"
    if [ -L "$legacy_wt" ]; then
      rm -f "$legacy_wt"
    elif [ -d "$legacy_wt" ]; then
      rm -rf "$legacy_wt"
    fi

    echo "  Worktree wt-$i ready (branch: $branch)"
  done

  WORKTREE_DIR="$worktree_dir"
}

# ---------------------------------------------------------------------------
# mac10_add_trusted_directories — Add project + worktree dirs to settings
# ---------------------------------------------------------------------------
mac10_add_trusted_directories() {
  echo "[7/8] Configuring trusted directories..."

  local settings_file="$CODEX_DIR/settings.json"
  local user_settings_file=""
  local worktree_dir="$PROJECT_DIR/.worktrees"

  if [ "$PROVIDER" = "claude" ]; then
    user_settings_file="$HOME/.claude/settings.json"
  fi

  _add_trusted_to_file() {
    local target_file="$1"
    local p="$2"
    [ -n "$target_file" ] || return 0
    if command -v python3 &>/dev/null; then
      python3 - "$target_file" "$p" << 'PYEOF'
import json, os, sys
f, p = sys.argv[1], sys.argv[2]
os.makedirs(os.path.dirname(f), exist_ok=True)
try:
    with open(f) as fp:
        d = json.load(fp)
except (FileNotFoundError, json.JSONDecodeError):
    d = {}
dirs = d.setdefault('trustedDirectories', [])
if p not in dirs: dirs.append(p)
with open(f, 'w') as fp:
    json.dump(d, fp, indent=2)
    fp.write('\n')
PYEOF
    fi
  }

  _add_trusted() {
    local p="$1"
    _add_trusted_to_file "$settings_file" "$p"
    _add_trusted_to_file "$user_settings_file" "$p"
  }

  _add_trusted "$PROJECT_DIR"
  local i
  for i in $(seq 1 "$NUM_WORKERS"); do
    _add_trusted "$worktree_dir/wt-$i"
  done

  if [ "$IS_WSL" = true ]; then
    local win_project
    win_project=$(echo "$PROJECT_DIR" | sed 's|^/mnt/\(.\)|\U\1:|; s|/|\\\\|g')
    _add_trusted "$win_project"
    for i in $(seq 1 "$NUM_WORKERS"); do
      local win_wt
      win_wt=$(echo "$worktree_dir/wt-$i" | sed 's|^/mnt/\(.\)|\U\1:|; s|/|\\\\|g')
      _add_trusted "$win_wt"
    done
  elif [ "$IS_MSYS" = true ]; then
    local win_project
    win_project="$(cygpath -w "$PROJECT_DIR" 2>/dev/null || true)"
    [ -n "$win_project" ] && _add_trusted "$win_project"
    for i in $(seq 1 "$NUM_WORKERS"); do
      local win_wt
      win_wt="$(cygpath -w "$worktree_dir/wt-$i" 2>/dev/null || true)"
      [ -n "$win_wt" ] && _add_trusted "$win_wt"
    done
  fi

  echo "  Trusted directories configured."
}

# ---------------------------------------------------------------------------
# mac10_write_provider_config — Write agent-launcher.env
# ---------------------------------------------------------------------------
mac10_write_provider_config() {
  mkdir -p "$CODEX_DIR/state"
  cat > "$CODEX_DIR/state/agent-launcher.env" << EOF
# Auto-generated by start-${PROVIDER}.sh
MAC10_AGENT_PROVIDER=${PROVIDER}
EOF
  echo "  Provider config written: MAC10_AGENT_PROVIDER=${PROVIDER}"
}

# ---------------------------------------------------------------------------
# mac10_start_coordinator — Start coordinator + register workers
# ---------------------------------------------------------------------------
mac10_start_coordinator() {
  echo "[8/8] Starting coordinator..."

  local sock_path_file="$CODEX_DIR/state/${NAMESPACE}.sock.path"
  local already_running=false
  mac10_debug "start_coordinator begin cwd=$PWD cli=$CODEX10_CLI sock_file=$sock_path_file"

  if "$CODEX10_CLI" ping &>/dev/null; then
    already_running=true
    mac10_debug "start_coordinator ping succeeded before launch (already running)"
    echo "  Coordinator already running, skipping start."
  elif [ -f "$sock_path_file" ]; then
    mac10_debug "start_coordinator removing stale socket pointer $sock_path_file"
    rm -f "$sock_path_file" 2>/dev/null || true
  fi

  if [ "$already_running" = false ]; then
    mac10_debug "start_coordinator launching via cli wrapper namespace=$NAMESPACE project=$PROJECT_DIR"
    if "$CODEX10_CLI" start "$PROJECT_DIR" >/dev/null 2>&1; then
      local pid_file="$CODEX_DIR/state/${NAMESPACE}.pid"
      local coord_pid=""
      coord_pid="$(cat "$pid_file" 2>/dev/null || true)"
      mac10_debug "start_coordinator cli start succeeded pid=${coord_pid:-unknown}"
      if [ -n "$coord_pid" ]; then
        echo "  Coordinator running (PID: $coord_pid)"
      else
        echo "  Coordinator running."
      fi
    else
      mac10_debug "start_coordinator cli start failed"
      echo "WARNING: Coordinator failed to start via cli wrapper"
      echo "  Check logs or run: $CODEX10_CLI start $PROJECT_DIR"
    fi
  fi

  # Wait for coordinator to be responsive
  local coord_ready=false
  local attempt
  for attempt in $(seq 1 10); do
    if "$CODEX10_CLI" ping &>/dev/null; then
      coord_ready=true
      mac10_debug "start_coordinator ping succeeded attempt=$attempt"
      break
    fi
    mac10_debug "start_coordinator ping failed attempt=$attempt"
    sleep 1
  done

  local worktree_dir="$PROJECT_DIR/.worktrees"
  if [ "$coord_ready" = true ]; then
    MAC10_COORDINATOR_READY=1
    # Recover stale research items
    "$CODEX10_CLI" research-requeue-stale 120 >/dev/null 2>&1 || true

    local i
    for i in $(seq 1 "$NUM_WORKERS"); do
      local reg_attempt
      for reg_attempt in 1 2 3; do
        if "$CODEX10_CLI" register-worker "$i" "$worktree_dir/wt-$i" "agent-$i" 2>/dev/null; then
          echo "  Registered worker $i"
          mac10_debug "register_worker success worker=$i attempt=$reg_attempt"
          break
        fi
        mac10_debug "register_worker retry worker=$i attempt=$reg_attempt"
        sleep 1
      done
    done
  else
    MAC10_COORDINATOR_READY=0
    mac10_debug "start_coordinator coordinator not responsive after retries"
    echo "WARNING: Coordinator not responsive — workers not registered"
    echo "  Run manually: $CODEX10_CLI register-worker <id> <worktree_path> <branch>"
  fi
}

# ---------------------------------------------------------------------------
# mac10_start_research_driver — Launch chatgpt-driver.py background process
# ---------------------------------------------------------------------------
mac10_start_research_driver() {
  local driver="$CODEX_DIR/scripts/chatgpt-driver.py"
  local driver_pid_file="$CODEX_DIR/state/research-driver.pid"

  if [ ! -f "$driver" ]; then
    echo "  Research driver not found, skipping."
    return 0
  fi

  echo "Starting ChatGPT research driver..."

  if [ -f "$driver_pid_file" ]; then
    local existing_pid
    existing_pid=$(cat "$driver_pid_file" 2>/dev/null || echo "")
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      echo "  Research driver already running (PID $existing_pid)."
      return 0
    else
      rm -f "$driver_pid_file"
    fi
  fi

  mkdir -p "$CODEX_DIR/logs"
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup python3 "$driver" > /dev/null 2>> "$CODEX_DIR/logs/research-driver.log" < /dev/null &
  else
    nohup python3 "$driver" > /dev/null 2>> "$CODEX_DIR/logs/research-driver.log" < /dev/null &
  fi
  local driver_pid=$!
  echo "$driver_pid" > "$driver_pid_file"
  echo "  Research driver started (PID $driver_pid)"
  echo "  Log: .codex/logs/research-driver.log"
  sleep 3
  if ! kill -0 "$driver_pid" 2>/dev/null; then
    echo "  WARNING: research driver exited during startup."
    tail -n 40 "$CODEX_DIR/logs/research-driver.log" 2>/dev/null || true
    rm -f "$driver_pid_file"
  fi
}

# ---------------------------------------------------------------------------
# mac10_launch_masters — Launch 3 masters via launch-agent.sh
# ---------------------------------------------------------------------------
mac10_launch_masters() {
  if [ "${MAC10_COORDINATOR_READY:-0}" != "1" ]; then
    echo "Skipping master launch because coordinator is not ready."
    return 1
  fi
  echo "Launching master agents..."
  mac10_debug "launch_masters provider=$PROVIDER is_wsl=$IS_WSL is_msys=$IS_MSYS"

  local launch_script="$SCRIPT_DIR/scripts/launch-agent.sh"

  if [ "$IS_MSYS" = true ]; then
    local win_launch
    win_launch="$(cygpath -w "$launch_script" 2>/dev/null || printf '%s' "$launch_script")"
    if command -v wt.exe >/dev/null 2>&1; then
      wt.exe -w 0 new-tab --title "Master-1 (Interface)" bash.exe -l "$win_launch" "$PROJECT_DIR" fast /master-loop &
      echo "  Master-1 (Interface/Fast) terminal opened."
      sleep 1
      wt.exe -w 0 new-tab --title "Master-2 (Architect)" bash.exe -l "$win_launch" "$PROJECT_DIR" deep /architect-loop &
      echo "  Master-2 (Architect/Deep) terminal opened."
      sleep 1
      wt.exe -w 0 new-tab --title "Master-3 (Allocator)" bash.exe -l "$win_launch" "$PROJECT_DIR" fast /allocate-loop &
      echo "  Master-3 (Allocator/Fast) terminal opened."
    else
      _print_manual_launch_instructions
    fi
  elif [ "$IS_WSL" = true ]; then
    local wt_exe="/mnt/c/Users/$USER/AppData/Local/Microsoft/WindowsApps/wt.exe"
    if [ -f "$wt_exe" ]; then
      mac10_debug "launch_masters using windows terminal at $wt_exe"
      "$wt_exe" -w 0 new-tab --title "Master-1 (Interface)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$launch_script" "$PROJECT_DIR" fast /master-loop &
      echo "  Master-1 (Interface/Fast) terminal opened."
      sleep 1
      "$wt_exe" -w 0 new-tab --title "Master-2 (Architect)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$launch_script" "$PROJECT_DIR" deep /architect-loop &
      echo "  Master-2 (Architect/Deep) terminal opened."
      sleep 1
      "$wt_exe" -w 0 new-tab --title "Master-3 (Allocator)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$launch_script" "$PROJECT_DIR" fast /allocate-loop &
      echo "  Master-3 (Allocator/Fast) terminal opened."
    else
      mac10_debug "launch_masters wt.exe missing; falling back to manual instructions"
      _print_manual_launch_instructions
    fi
  else
    mac10_debug "launch_masters non-WSL/non-MSYS environment; manual instructions only"
    _print_manual_launch_instructions
  fi
}

_print_manual_launch_instructions() {
  local cli_name
  cli_name="$(mac10_provider_cli 2>/dev/null || echo "$PROVIDER")"
  echo "  Start manually in separate terminals:"
  if [ "$PROVIDER" = "claude" ]; then
    echo "    cd $PROJECT_DIR && claude --dangerously-skip-permissions --model opus -- \"\$(cat .codex/commands-codex10/master-loop.md)\""
    echo "    cd $PROJECT_DIR && claude -p \"\$(cat .codex/commands-codex10/architect-loop.md)\" --dangerously-skip-permissions --model opus --no-session-persistence"
    echo "    cd $PROJECT_DIR && claude -p \"\$(cat .codex/commands-codex10/allocate-loop.md)\" --dangerously-skip-permissions --model sonnet --no-session-persistence"
  else
    echo "    cd $PROJECT_DIR && codex --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR -- \"\$(cat .codex/commands-codex10/master-loop.md)\""
    echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .codex/commands-codex10/architect-loop.md"
    echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .codex/commands-codex10/allocate-loop.md"
  fi
}

# ---------------------------------------------------------------------------
# mac10_stop_system — Stop research driver + coordinator
# ---------------------------------------------------------------------------
mac10_stop_system() {
  echo "Stopping mac10 system..."
  local mac10_cmd="$CODEX_DIR/scripts/codex10"
  local driver_pid_file="$CODEX_DIR/state/research-driver.pid"
  mac10_debug "stop_system cmd=$mac10_cmd project=$PROJECT_DIR"

  # Stop research driver
  if [ -f "$driver_pid_file" ]; then
    local pid
    pid=$(cat "$driver_pid_file" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "  Research driver stopped (PID $pid)"
    fi
    rm -f "$driver_pid_file"
  fi
  # Stop coordinator
  "$mac10_cmd" stop "$PROJECT_DIR" 2>/dev/null || true
  mac10_debug "stop_system coordinator stop requested"
  echo "  Coordinator stopped"
  echo "Done."
}

# ---------------------------------------------------------------------------
# mac10_pause_system — Stop + normalize DB state
# ---------------------------------------------------------------------------
mac10_pause_system() {
  echo "Pausing mac10 system..."
  mac10_debug "pause_system begin"
  mac10_stop_system
  (
    cd "$SCRIPT_DIR/coordinator"
    node -e "const Database=require('better-sqlite3');const db=new Database('$CODEX_DIR/state/${NAMESPACE}.db');db.prepare(\"UPDATE loops SET status='stopped', stopped_at=COALESCE(stopped_at,datetime('now')), updated_at=datetime('now') WHERE status='active'\").run();db.prepare(\"UPDATE research_queue SET status='queued', started_at=NULL, error='Re-queued during pipeline pause' WHERE status='in_progress'\").run();"
  ) >/dev/null 2>&1 || true
  (
    cd "$PROJECT_DIR"
    node -e "const fs=require('fs');const p='$CODEX_DIR/state/${NAMESPACE}.agent-health.json';let j={};try{j=JSON.parse(fs.readFileSync(p,'utf8'));}catch{};const now=new Date().toISOString();j['master-1']={...(j['master-1']||{}),status:'paused'};j['master-2']={...(j['master-2']||{}),status:'paused'};j['master-3']={...(j['master-3']||{}),status:'paused'};j['research-driver']={status:'paused',last_active:now};fs.writeFileSync(p,JSON.stringify(j,null,2));"
  ) >/dev/null 2>&1 || true
  echo "Paused. Loops stopped, in-progress research re-queued, health marked paused."
  mac10_debug "pause_system complete"
}

# ---------------------------------------------------------------------------
# mac10_print_status — Ping, loop-status, research-status
# ---------------------------------------------------------------------------
mac10_print_status() {
  mac10_debug "print_status via $CODEX10_CLI"
  echo ""
  echo "=== System Status ==="
  local ping_output=""
  local ping_attempt
  for ping_attempt in $(seq 1 10); do
    if ping_output="$("$CODEX10_CLI" ping 2>&1)"; then
      break
    fi
    sleep 1
  done
  if [ -n "$ping_output" ]; then
    printf '%s\n' "$ping_output"
  fi
  echo ""
  "$CODEX10_CLI" loop-status 2>&1 || echo "  No active loops"
  local research_output=""
  research_output="$("$CODEX10_CLI" research-status 2>&1 || true)"
  if [ -n "$research_output" ] && [[ "$research_output" != Unknown\ command:* ]]; then
    echo ""
    printf '%s\n' "$research_output"
  fi
}

# ---------------------------------------------------------------------------
# mac10_print_banner — Final summary
# ---------------------------------------------------------------------------
mac10_print_banner() {
  local dashboard_url
  dashboard_url="$(node - "$PROJECT_DIR" "$NAMESPACE" <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const projectDir = path.resolve(process.argv[2] || '.');
const namespace = (process.argv[3] || 'mac10').trim() || 'mac10';
const registryPath = path.join(os.tmpdir(), 'mac10-instances.json');
try {
  const entries = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const match = entries.find((e) =>
    path.resolve(e.projectDir || '') === projectDir &&
    ((e.namespace || 'mac10') === namespace) &&
    Number.isInteger(e.port)
  );
  if (match) process.stdout.write(`http://localhost:${match.port}`);
} catch {}
NODE
  )"
  if [ -z "$dashboard_url" ]; then
    dashboard_url="http://localhost:3100"
  fi

  echo ""
  echo "========================================"
  echo " mac10 System Ready (provider: $PROVIDER)"
  echo "========================================"
  echo ""
  echo "3 Masters launched:"
  echo "  Master-1 (Interface/Fast)  — user's contact point"
  echo "  Master-2 (Architect/Deep)  — triage & decomposition"
  echo "  Master-3 (Allocator/Fast)  — task-worker matching"
  echo ""
  echo "Dashboard:    $dashboard_url"
  echo "Submit work:  $CODEX10_CLI request \"Add user authentication\""
  echo "Check status: $CODEX10_CLI status"
  echo "View logs:    $CODEX10_CLI log"
  echo ""
  echo "Workers will be spawned automatically when tasks are assigned."
  echo ""
}
