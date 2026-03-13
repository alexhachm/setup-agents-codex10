#!/usr/bin/env bash
# mac10 setup — Single entry point installer
# Usage: bash setup.sh /path/to/your-project [num_workers]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:?Usage: bash setup.sh <project_dir> [num_workers]}"
NUM_WORKERS="${2:-4}"
MAX_WORKERS=8
NAMESPACE="codex10"

# Validate NUM_WORKERS is a positive integer within bounds
if ! [[ "$NUM_WORKERS" =~ ^[0-9]+$ ]] || [ "$NUM_WORKERS" -lt 1 ]; then
  echo "ERROR: num_workers must be a positive integer (got: $NUM_WORKERS)"
  exit 1
fi
if [ "$NUM_WORKERS" -gt "$MAX_WORKERS" ]; then
  echo "ERROR: num_workers cannot exceed $MAX_WORKERS (got: $NUM_WORKERS)"
  exit 1
fi

# Resolve to absolute path
PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd || echo "$PROJECT_DIR")"

echo "========================================"
echo " mac10 Multi-Agent Setup"
echo "========================================"
echo "Project:  $PROJECT_DIR"
echo "Workers:  $NUM_WORKERS"
echo "Namespace: $NAMESPACE"
echo ""

# --- WSL shim: expose Windows-side CLIs if running under WSL ---
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
  _wsl_shim codex
  # Ensure nvm node is on PATH
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null
fi

# --- Detect environment ---
IS_WSL=false
IS_MSYS=false
if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
  IS_WSL=true
elif [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  IS_MSYS=true
fi

# --- Preflight checks ---

echo "[1/8] Preflight checks..."

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: '$1' not found. Please install it first."
    exit 1
  fi
}

check_cmd node
check_cmd git
check_cmd gh
# tmux only required for WSL (worker sentinel uses tmux); native Windows uses Windows Terminal tabs
if [ "$IS_WSL" = true ]; then
  check_cmd tmux
fi
check_cmd codex

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found v$(node -v))"
  exit 1
fi

# Check git repo (use git rev-parse to handle worktrees where .git is a file)
if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree &>/dev/null; then
  echo "ERROR: $PROJECT_DIR is not a git repository"
  exit 1
fi

# Check gh auth
if ! gh auth status &>/dev/null; then
  echo "ERROR: GitHub CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi

echo "  All checks passed."

# --- Install coordinator ---

echo "[2/8] Installing coordinator..."

cd "$SCRIPT_DIR/coordinator"
npm install --production 2>&1 | tail -1
echo "  Dependencies installed."

# --- Create .claude directory structure ---

echo "[3/8] Setting up project directories..."

CLAUDE_DIR="$PROJECT_DIR/.claude"
mkdir -p "$CLAUDE_DIR/commands"
mkdir -p "$CLAUDE_DIR/commands-codex10"
mkdir -p "$CLAUDE_DIR/state"
mkdir -p "$CLAUDE_DIR/knowledge/domain"
mkdir -p "$CLAUDE_DIR/scripts"

# --- Copy templates ---

echo "[4/8] Copying templates..."

# Commands (shared) — only copy if not already present
for f in "$SCRIPT_DIR/templates/commands/"*.md; do
  dest="$CLAUDE_DIR/commands/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
done

# Commands (codex10-isolated) — always refresh to keep codex10 protocol in sync.
for f in "$SCRIPT_DIR/templates/commands/"*.md; do
  cp "$f" "$CLAUDE_DIR/commands-codex10/$(basename "$f")"
done

# Agent templates — only copy if not already present
mkdir -p "$CLAUDE_DIR/agents"
for f in "$SCRIPT_DIR/templates/agents/"*.md; do
  dest="$CLAUDE_DIR/agents/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
done

# Knowledge templates (don't overwrite existing)
for f in "$SCRIPT_DIR/templates/knowledge/"*.md; do
  dest="$CLAUDE_DIR/knowledge/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
done

# Docs
mkdir -p "$CLAUDE_DIR/docs"
cp "$SCRIPT_DIR/templates/docs/"*.md "$CLAUDE_DIR/docs/"

# Force-refresh key orchestration prompts/guidance on setup reruns.
cp "$SCRIPT_DIR/templates/commands/allocate-loop.md" "$CLAUDE_DIR/commands/allocate-loop.md"
cp "$SCRIPT_DIR/templates/commands/allocate-loop.md" "$CLAUDE_DIR/commands-codex10/allocate-loop.md"
cp "$SCRIPT_DIR/templates/commands/architect-loop.md" "$CLAUDE_DIR/commands/architect-loop.md"
cp "$SCRIPT_DIR/templates/commands/architect-loop.md" "$CLAUDE_DIR/commands-codex10/architect-loop.md"
cp "$SCRIPT_DIR/templates/docs/master-3-role.md" "$CLAUDE_DIR/docs/master-3-role.md"

# CLAUDE.md for architect (root) — only if not already present
if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/CLAUDE.md"
else
  echo "  CLAUDE.md already exists, keeping existing."
fi

# Worker CLAUDE.md template
cp "$SCRIPT_DIR/templates/worker-claude.md" "$CLAUDE_DIR/worker-claude.md"

# AGENTS.md compatibility for Codex
if [ ! -f "$PROJECT_DIR/AGENTS.md" ]; then
  cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/AGENTS.md"
fi
cp "$SCRIPT_DIR/templates/worker-claude.md" "$CLAUDE_DIR/worker-agents.md"

# Scripts
extract_loop_precheck_signature() {
  local file="$1"
  awk '
    /# Pre-check: skip Codex spawn if requests are still in-flight/ { in_block=1 }
    in_block {
      gsub(/[[:space:]]+/, "", $0)
      printf "%s", $0
    }
    in_block && /ACTIVE_COUNT="\$\{ACTIVE_COUNT:-0\}"/ { exit }
  ' "$file" 2>/dev/null || true
}

detect_loop_precheck_mode() {
  local file="$1"
  if grep -Eq 'loop-requests[[:space:]]+"\$LOOP_ID"[[:space:]]+--json' "$file" 2>/dev/null && \
     grep -Eq 'node[[:space:]]+-e' "$file" 2>/dev/null; then
    echo "json-node"
    return
  fi

  if grep -Eq 'loop-requests[[:space:]]+"\$LOOP_ID"' "$file" 2>/dev/null && \
     grep -Eq 'grep[[:space:]]+-c' "$file" 2>/dev/null; then
    echo "grep-text"
    return
  fi

  echo "unknown"
}

LOOP_SENTINEL_SOURCE="$SCRIPT_DIR/scripts/loop-sentinel.sh"
RUNTIME_LOOP_SENTINEL="$SCRIPT_DIR/.codex/scripts/loop-sentinel.sh"
if [ -f "$RUNTIME_LOOP_SENTINEL" ]; then
  TRACKED_LOOP_MODE="$(detect_loop_precheck_mode "$LOOP_SENTINEL_SOURCE")"
  RUNTIME_LOOP_MODE="$(detect_loop_precheck_mode "$RUNTIME_LOOP_SENTINEL")"
  TRACKED_LOOP_SIG="$(extract_loop_precheck_signature "$LOOP_SENTINEL_SOURCE")"
  RUNTIME_LOOP_SIG="$(extract_loop_precheck_signature "$RUNTIME_LOOP_SENTINEL")"

  if [ "$RUNTIME_LOOP_MODE" = "json-node" ] && [ "$TRACKED_LOOP_MODE" != "json-node" ]; then
    echo "  WARNING: loop-sentinel parser mode drift detected (tracked=$TRACKED_LOOP_MODE runtime=$RUNTIME_LOOP_MODE); preserving .codex mirror parser during setup copy."
    LOOP_SENTINEL_SOURCE="$RUNTIME_LOOP_SENTINEL"
  elif [ -n "$TRACKED_LOOP_SIG" ] && [ -n "$RUNTIME_LOOP_SIG" ] && [ "$TRACKED_LOOP_SIG" != "$RUNTIME_LOOP_SIG" ]; then
    echo "  WARNING: loop-sentinel parser drift detected (tracked=$TRACKED_LOOP_MODE runtime=$RUNTIME_LOOP_MODE); preserving .codex mirror parser during setup copy."
    LOOP_SENTINEL_SOURCE="$RUNTIME_LOOP_SENTINEL"
  fi
fi

for s in worker-sentinel.sh loop-sentinel.sh launch-worker.sh signal-wait.sh state-lock.sh; do
  SRC="$SCRIPT_DIR/scripts/$s"
  if [ "$s" = "loop-sentinel.sh" ]; then
    SRC="$LOOP_SENTINEL_SOURCE"
  fi
  cp "$SRC" "$CLAUDE_DIR/scripts/"
done
chmod +x "$CLAUDE_DIR/scripts/"*.sh

# Hooks
mkdir -p "$CLAUDE_DIR/hooks"
cp "$SCRIPT_DIR/.claude/hooks/pre-tool-secret-guard.sh" "$CLAUDE_DIR/hooks/" 2>/dev/null || true
chmod +x "$CLAUDE_DIR/hooks/"*.sh 2>/dev/null || true

# Settings
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
  cp "$SCRIPT_DIR/templates/settings.json" "$SETTINGS_FILE"
fi

echo "  Templates copied."

# --- Add codex10 wrapper to PATH ---

echo "[5/8] Setting up codex10 CLI wrapper..."

MAC10_BIN="$SCRIPT_DIR/coordinator/bin/mac10"
chmod +x "$MAC10_BIN"
MAC10_CLI="$CLAUDE_DIR/scripts/mac10-codex10"
CODEX10_CLI="$CLAUDE_DIR/scripts/codex10"
MAC10_COMPAT="$CLAUDE_DIR/scripts/mac10"

# Create a namespaced wrapper script in the project
cat > "$MAC10_CLI" << 'WRAPPER'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC10_BIN="PLACEHOLDER_MAC10_BIN"
if [ ! -f "$MAC10_BIN" ]; then
  echo "ERROR: mac10 CLI not found at $MAC10_BIN" >&2
  echo "  Has the setup-agents repo moved? Re-run setup.sh to fix." >&2
  exit 1
fi
export MAC10_NAMESPACE="codex10"
exec node "$MAC10_BIN" "$@"
WRAPPER
# Substitute the actual path into the wrapper (quoted heredoc prevents expansion above)
sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$MAC10_CLI"
chmod +x "$MAC10_CLI"

# Primary codex wrapper name used by codex-specific prompts/scripts
cp "$MAC10_CLI" "$CODEX10_CLI"
chmod +x "$CODEX10_CLI"

# Compatibility shim: many prompts still invoke `mac10` directly.
# Keep that command namespaced to codex10 inside this project.
cp "$MAC10_CLI" "$MAC10_COMPAT"
chmod +x "$MAC10_COMPAT"

# Add to PATH for this project's agents
export PATH="$SCRIPT_DIR/coordinator/bin:$CLAUDE_DIR/scripts:$PATH"
export MAC10_NAMESPACE="$NAMESPACE"

echo "  codex10 wrapper ready: $CODEX10_CLI"

# --- Create worktrees ---

echo "[6/8] Creating $NUM_WORKERS worktrees..."

WORKTREE_DIR="$PROJECT_DIR/.worktrees"
mkdir -p "$WORKTREE_DIR"

cd "$PROJECT_DIR"
MAIN_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")

for i in $(seq 1 "$NUM_WORKERS"); do
  WT_PATH="$WORKTREE_DIR/wt-$i"
  BRANCH="agent-$i"

  if [ -d "$WT_PATH" ]; then
    echo "  Worktree wt-$i already exists, skipping."
    continue
  fi

  # Create branch if it doesn't exist
  git branch "$BRANCH" "$MAIN_BRANCH" 2>/dev/null || true
  git worktree add "$WT_PATH" "$BRANCH" 2>/dev/null || {
    # Branch might already exist from a previous run
    git worktree add "$WT_PATH" "$BRANCH" --force 2>/dev/null || true
  }

  # Copy CLAUDE.md for worker
  cp "$CLAUDE_DIR/worker-claude.md" "$WT_PATH/CLAUDE.md"
  cp "$CLAUDE_DIR/worker-agents.md" "$WT_PATH/AGENTS.md"

  # Link/copy knowledge, commands, agents, hooks to worktree
  mkdir -p "$WT_PATH/.claude/commands"
  mkdir -p "$WT_PATH/.claude/knowledge/domain"
  mkdir -p "$WT_PATH/.claude/scripts"
  mkdir -p "$WT_PATH/.claude/agents"
  mkdir -p "$WT_PATH/.claude/hooks"
  cp "$CLAUDE_DIR/commands/"*.md "$WT_PATH/.claude/commands/"
  cp "$MAC10_CLI" "$WT_PATH/.claude/scripts/mac10-codex10"
  cp "$CODEX10_CLI" "$WT_PATH/.claude/scripts/codex10"
  cp "$MAC10_COMPAT" "$WT_PATH/.claude/scripts/mac10"
  cp "$CLAUDE_DIR/scripts/"*.sh "$WT_PATH/.claude/scripts/" 2>/dev/null || true
  chmod +x "$WT_PATH/.claude/scripts/"*.sh 2>/dev/null || true
  cp "$CLAUDE_DIR/agents/"*.md "$WT_PATH/.claude/agents/"
  cp "$CLAUDE_DIR/hooks/"*.sh "$WT_PATH/.claude/hooks/" 2>/dev/null || true
  chmod +x "$WT_PATH/.claude/hooks/"*.sh 2>/dev/null || true

  # Copy knowledge files (will be updated via main project junction/copy)
  cp -r "$CLAUDE_DIR/knowledge/"* "$WT_PATH/.claude/knowledge/" 2>/dev/null || true

  # Copy settings.json to worktree so hooks are active
  cp "$SETTINGS_FILE" "$WT_PATH/.claude/settings.json" 2>/dev/null || true

  echo "  Created worktree wt-$i (branch: $BRANCH)"
done

# --- Add trusted directories ---

echo "[7/8] Configuring trusted directories..."

# Detect platform for path format
add_trusted() {
  local p="$1"
  # Add to settings.json trustedDirectories array
  if command -v python3 &>/dev/null; then
    python3 - "$SETTINGS_FILE" "$p" << 'PYEOF'
import json, sys
f, p = sys.argv[1], sys.argv[2]
with open(f) as fp: d = json.load(fp)
dirs = d.setdefault('trustedDirectories', [])
if p not in dirs: dirs.append(p)
with open(f, 'w') as fp: json.dump(d, fp, indent=2)
PYEOF
  fi
}

add_trusted "$PROJECT_DIR"
for i in $(seq 1 "$NUM_WORKERS"); do
  add_trusted "$WORKTREE_DIR/wt-$i"
done

# On Windows, also add Windows-format paths for trusted directories
if [ "$IS_WSL" = true ]; then
  WIN_PROJECT=$(echo "$PROJECT_DIR" | sed 's|^/mnt/\(.\)|\U\1:|; s|/|\\\\|g')
  add_trusted "$WIN_PROJECT"
  for i in $(seq 1 "$NUM_WORKERS"); do
    WIN_WT=$(echo "$WORKTREE_DIR/wt-$i" | sed 's|^/mnt/\(.\)|\U\1:|; s|/|\\\\|g')
    add_trusted "$WIN_WT"
  done
elif [ "$IS_MSYS" = true ]; then
  WIN_PROJECT="$(cygpath -w "$PROJECT_DIR" 2>/dev/null || true)"
  [ -n "$WIN_PROJECT" ] && add_trusted "$WIN_PROJECT"
  for i in $(seq 1 "$NUM_WORKERS"); do
    WIN_WT="$(cygpath -w "$WORKTREE_DIR/wt-$i" 2>/dev/null || true)"
    [ -n "$WIN_WT" ] && add_trusted "$WIN_WT"
  done
fi

echo "  Trusted directories configured."

# --- Initialize coordinator ---

echo "[8/8] Starting coordinator..."

# Check if coordinator is already running (e.g. launched by GUI)
ALREADY_RUNNING=false
SOCK_PATH_FILE="$CLAUDE_DIR/state/${NAMESPACE}.sock.path"
if "$CODEX10_CLI" ping &>/dev/null; then
  ALREADY_RUNNING=true
  echo "  Coordinator already running, skipping start."
elif [ -f "$SOCK_PATH_FILE" ]; then
  # Stale namespaced socket pointer from a dead coordinator
  rm -f "$SOCK_PATH_FILE" 2>/dev/null || true
fi

if [ "$ALREADY_RUNNING" = false ]; then
  nohup env MAC10_NAMESPACE="$NAMESPACE" MAC10_SCRIPT_DIR="$SCRIPT_DIR" \
    node "$SCRIPT_DIR/coordinator/src/index.js" "$PROJECT_DIR" \
    > "$CLAUDE_DIR/state/${NAMESPACE}.coordinator.log" 2>&1 &
  COORD_PID=$!

  # Wait for socket (on WSL, socket is in /tmp/ — check via mac10.sock.path)
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

# Wait for coordinator to be responsive (regardless of who started it)
COORD_READY=false
for attempt in $(seq 1 10); do
  if "$CODEX10_CLI" ping &>/dev/null; then
    COORD_READY=true
    break
  fi
  sleep 1
done

if [ "$COORD_READY" = true ]; then
  # Register workers (with retry) — always runs even if coordinator was pre-started
  for i in $(seq 1 "$NUM_WORKERS"); do
    for attempt in 1 2 3; do
      if "$CODEX10_CLI" register-worker "$i" "$WORKTREE_DIR/wt-$i" "agent-$i" 2>/dev/null; then
        echo "  Registered worker $i"
        break
      fi
      sleep 1
    done
  done
else
  echo "WARNING: Coordinator not responsive — workers not registered"
  echo "  Run manually: $CODEX10_CLI register-worker <id> <worktree_path> <branch>"
fi

# --- Launch all 3 masters ---

echo "Launching master agents..."

LAUNCH_SCRIPT="$SCRIPT_DIR/scripts/launch-agent.sh"

if [ "$IS_MSYS" = true ]; then
  # Native Windows (Git Bash) — use wt.exe with bash.exe, no wsl.exe
  WIN_LAUNCH_SCRIPT="$(cygpath -w "$LAUNCH_SCRIPT" 2>/dev/null || printf '%s' "$LAUNCH_SCRIPT")"
  if command -v wt.exe >/dev/null 2>&1; then
    wt.exe -w 0 new-tab --title "Master-1 (Interface)" bash.exe -l "$WIN_LAUNCH_SCRIPT" "$PROJECT_DIR" fast /master-loop &
    echo "  Master-1 (Interface/Fast) terminal opened."
    sleep 1
    wt.exe -w 0 new-tab --title "Master-2 (Architect)" bash.exe -l "$WIN_LAUNCH_SCRIPT" "$PROJECT_DIR" deep /architect-loop &
    echo "  Master-2 (Architect/Deep) terminal opened."
    sleep 1
    wt.exe -w 0 new-tab --title "Master-3 (Allocator)" bash.exe -l "$WIN_LAUNCH_SCRIPT" "$PROJECT_DIR" fast /allocate-loop &
    echo "  Master-3 (Allocator/Fast) terminal opened."
  else
    echo "  Windows Terminal not found — start manually:"
    echo "    cd $PROJECT_DIR && codex --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR -- \"\$(cat .claude/commands-codex10/master-loop.md)\""
    echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .claude/commands-codex10/architect-loop.md"
    echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .claude/commands-codex10/allocate-loop.md"
  fi
elif [ "$IS_WSL" = true ]; then
  # WSL — use wt.exe with wsl.exe
  WT_EXE="/mnt/c/Users/$USER/AppData/Local/Microsoft/WindowsApps/wt.exe"
  if [ -f "$WT_EXE" ]; then
    "$WT_EXE" -w 0 new-tab --title "Master-1 (Interface)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" fast /master-loop &
    echo "  Master-1 (Interface/Fast) terminal opened."
    sleep 1
    "$WT_EXE" -w 0 new-tab --title "Master-2 (Architect)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" deep /architect-loop &
    echo "  Master-2 (Architect/Deep) terminal opened."
    sleep 1
    "$WT_EXE" -w 0 new-tab --title "Master-3 (Allocator)" -- wsl.exe -d "$WSL_DISTRO_NAME" -- bash "$LAUNCH_SCRIPT" "$PROJECT_DIR" fast /allocate-loop &
    echo "  Master-3 (Allocator/Fast) terminal opened."
  else
    echo "  Windows Terminal not found — start manually:"
    echo "    cd $PROJECT_DIR && codex --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR -- \"\$(cat .claude/commands-codex10/master-loop.md)\""
    echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .claude/commands-codex10/architect-loop.md"
    echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .claude/commands-codex10/allocate-loop.md"
  fi
else
  # macOS / Linux — use native terminal
  echo "  Start manually in separate terminals:"
  echo "    cd $PROJECT_DIR && codex --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR -- \"\$(cat .claude/commands-codex10/master-loop.md)\""
  echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .claude/commands-codex10/architect-loop.md"
  echo "    cd $PROJECT_DIR && codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.3-codex -C $PROJECT_DIR - < .claude/commands-codex10/allocate-loop.md"
fi

echo ""
echo "========================================"
echo " mac10 Setup Complete!"
echo "========================================"
echo ""
DASHBOARD_URL="$(node - "$PROJECT_DIR" "$NAMESPACE" <<'NODE'
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
if [ -z "$DASHBOARD_URL" ]; then
  DASHBOARD_URL="http://localhost:3100"
fi

echo "3 Masters launched:"
echo "  Master-1 (Interface/Fast)  — user's contact point"
echo "  Master-2 (Architect/Deep)  — triage & decomposition"
echo "  Master-3 (Allocator/Fast)  — task-worker matching"
echo ""
echo "Dashboard:    $DASHBOARD_URL"
echo "Submit work:  $CODEX10_CLI request \"Add user authentication\""
echo "Check status: $CODEX10_CLI status"
echo "View logs:    $CODEX10_CLI log"
echo ""
echo "Workers will be spawned automatically when tasks are assigned."
echo ""
