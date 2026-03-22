#!/usr/bin/env bash
# mac10 setup — Single entry point installer
# Usage: bash setup.sh /path/to/your-project [num_workers]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage:
  bash setup.sh <project_dir> [num_workers]
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

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

if ! git -C "$PROJECT_DIR" rev-parse --verify HEAD^{commit} &>/dev/null; then
  echo "ERROR: $PROJECT_DIR has no commits yet."
  echo "  Create an initial commit before launching workers."
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

# --- Create .codex directory structure ---

echo "[3/8] Setting up project directories..."

LEGACY_DIR="$PROJECT_DIR/.claude"
CODEX_DIR="$PROJECT_DIR/.codex"

if [ -d "$LEGACY_DIR" ] && [ ! -e "$CODEX_DIR" ]; then
  mv "$LEGACY_DIR" "$CODEX_DIR"
  echo "  Migrated existing .claude directory to .codex."
fi

# Ensure .claude symlink exists for Claude CLI compatibility.
# Claude auto-discovers settings from .claude/ — without this symlink,
# hooks, permissions, and commands are invisible to Claude agents.
if [ -d "$CODEX_DIR" ] && [ ! -e "$LEGACY_DIR" ]; then
  ln -s "$CODEX_DIR" "$LEGACY_DIR"
  echo "  Created .claude -> .codex symlink for Claude CLI compatibility."
elif [ -L "$LEGACY_DIR" ]; then
  CURRENT_TARGET="$(readlink "$LEGACY_DIR" || true)"
  if [ "$CURRENT_TARGET" != "$CODEX_DIR" ] && [ "$CURRENT_TARGET" != ".codex" ]; then
    rm -f "$LEGACY_DIR"
    ln -s "$CODEX_DIR" "$LEGACY_DIR"
    echo "  Fixed .claude symlink -> .codex."
  fi
fi

mkdir -p "$CODEX_DIR/commands"
mkdir -p "$CODEX_DIR/commands-codex10"
mkdir -p "$CODEX_DIR/state"
mkdir -p "$CODEX_DIR/knowledge/domain"
mkdir -p "$CODEX_DIR/scripts"

# Symlinks are required for shared worker runtime (.worktrees/wt-N/.codex -> .codex).
# No copy fallback by design: fail early if symlinks are unavailable.
SYMLINK_PROBE_DIR="$CODEX_DIR/.symlink-probe-dir"
SYMLINK_PROBE_LINK="$CODEX_DIR/.symlink-probe-link"
rm -rf "$SYMLINK_PROBE_DIR" "$SYMLINK_PROBE_LINK" 2>/dev/null || true
mkdir -p "$SYMLINK_PROBE_DIR"
if ! ln -s "$SYMLINK_PROBE_DIR" "$SYMLINK_PROBE_LINK" 2>/dev/null; then
  echo "ERROR: This environment cannot create symlinks."
  echo "  Worker runtimes now require symlinks (no copy fallback)."
  echo "  On Windows, enable Developer Mode or run with Administrator privileges."
  rm -rf "$SYMLINK_PROBE_DIR" "$SYMLINK_PROBE_LINK" 2>/dev/null || true
  exit 1
fi
rm -rf "$SYMLINK_PROBE_DIR" "$SYMLINK_PROBE_LINK" 2>/dev/null || true

# --- Copy templates ---

echo "[4/8] Copying templates..."

copy_if_needed() {
  local src="$1"
  local dest="$2"
  if [ ! -e "$src" ]; then
    echo "ERROR: Source path not found: $src" >&2
    exit 1
  fi
  if [ -e "$dest" ] && [ "$src" -ef "$dest" ]; then
    return 0
  fi
  cp "$src" "$dest"
}

# Commands (shared) — only copy if not already present
for f in "$SCRIPT_DIR/templates/commands/"*.md; do
  dest="$CODEX_DIR/commands/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
done

# Commands (codex10-isolated) — always refresh to keep codex10 protocol in sync.
for f in "$SCRIPT_DIR/templates/commands/"*.md; do
  cp "$f" "$CODEX_DIR/commands-codex10/$(basename "$f")"
done

# Agent templates — only copy if not already present
mkdir -p "$CODEX_DIR/agents"
for f in "$SCRIPT_DIR/templates/agents/"*.md; do
  dest="$CODEX_DIR/agents/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
done

# Knowledge templates (don't overwrite existing)
for f in "$SCRIPT_DIR/templates/knowledge/"*.md; do
  dest="$CODEX_DIR/knowledge/$(basename "$f")"
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

# Scripts
for s in worker-sentinel.sh loop-sentinel.sh launch-worker.sh signal-wait.sh state-lock.sh provider-utils.sh; do
  dest="$CODEX_DIR/scripts/$s"
  # Skip if already a symlink pointing to canonical scripts/
  [ -L "$dest" ] && continue
  copy_if_needed "$SCRIPT_DIR/scripts/$s" "$dest"
done

# Research runtime assets (optional): install when present in source repo.
for s in research-gaps.sh research-sentinel.sh knowledge-score.sh test-research-pipeline.sh install-chrome.sh \
         chatgpt-driver.py compose-research-prompt.py ingest-research.py requirements-research.txt; do
  src="$SCRIPT_DIR/scripts/$s"
  [ -f "$src" ] || src="$SCRIPT_DIR/.codex/scripts/$s"
  [ -f "$src" ] || continue
  copy_if_needed "$src" "$CODEX_DIR/scripts/$s"
done
chmod +x "$CODEX_DIR/scripts/"*.sh

# Hooks
mkdir -p "$CODEX_DIR/hooks"
if [ -f "$SCRIPT_DIR/.codex/hooks/pre-tool-secret-guard.sh" ]; then
  copy_if_needed "$SCRIPT_DIR/.codex/hooks/pre-tool-secret-guard.sh" "$CODEX_DIR/hooks/pre-tool-secret-guard.sh"
fi
chmod +x "$CODEX_DIR/hooks/"*.sh 2>/dev/null || true

# Settings
SETTINGS_FILE="$CODEX_DIR/settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
  cp "$SCRIPT_DIR/templates/settings.json" "$SETTINGS_FILE"
fi

echo "  Templates copied."

# --- Add codex10 wrapper to PATH ---

echo "[5/8] Setting up codex10 CLI wrapper..."

MAC10_BIN="$SCRIPT_DIR/coordinator/bin/mac10"
chmod +x "$MAC10_BIN"
MAC10_CLI="$CODEX_DIR/scripts/mac10-codex10"
CODEX10_CLI="$CODEX_DIR/scripts/codex10"
MAC10_COMPAT="$CODEX_DIR/scripts/mac10"

# Create a namespaced wrapper script in the project
cat > "$MAC10_CLI" << 'WRAPPER'
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
# Substitute the actual path into the wrapper (quoted heredoc prevents expansion above)
sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$MAC10_CLI"
sed -i "s|PLACEHOLDER_MAC10_PROJECT_DIR|$PROJECT_DIR|" "$MAC10_CLI"
chmod +x "$MAC10_CLI"

# Primary codex wrapper name used by codex-specific prompts/scripts
cp "$MAC10_CLI" "$CODEX10_CLI"
chmod +x "$CODEX10_CLI"

# Compatibility shim: many prompts still invoke `mac10` directly.
# Default to codex10 for this project; callers may override MAC10_NAMESPACE.
cat > "$MAC10_COMPAT" << 'WRAPPER'
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
sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$MAC10_COMPAT"
sed -i "s|PLACEHOLDER_MAC10_PROJECT_DIR|$PROJECT_DIR|" "$MAC10_COMPAT"
chmod +x "$MAC10_COMPAT"

# Add to PATH for this project's agents
export PATH="$SCRIPT_DIR/coordinator/bin:$CODEX_DIR/scripts:$PATH"
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
    echo "  Worktree wt-$i already exists, refreshing runtime links."
  else
    # Create branch if it doesn't exist
    git branch "$BRANCH" "$MAIN_BRANCH" 2>/dev/null || true
    if ! git worktree add "$WT_PATH" "$BRANCH" 2>/dev/null; then
      # Branch might already exist from a previous run
      if ! git worktree add "$WT_PATH" "$BRANCH" --force 2>/dev/null; then
        echo "ERROR: failed to create worktree wt-$i at $WT_PATH"
        echo "  Ensure the repo has a valid HEAD commit and no conflicting worktree state."
        exit 1
      fi
    fi
  fi

  # Copy CLAUDE.md for worker
  cp "$CODEX_DIR/worker-claude.md" "$WT_PATH/CLAUDE.md"
  cp "$CODEX_DIR/worker-agents.md" "$WT_PATH/AGENTS.md"

  # Shared runtime for workers: each worktree links .codex -> project .codex
  if [ -L "$WT_PATH/.codex" ]; then
    CURRENT_TARGET="$(readlink "$WT_PATH/.codex" || true)"
    if [ "$CURRENT_TARGET" != "$CODEX_DIR" ]; then
      rm -f "$WT_PATH/.codex"
      ln -s "$CODEX_DIR" "$WT_PATH/.codex"
      echo "  Fixed wt-$i/.codex symlink -> $CODEX_DIR"
    fi
  elif [ -d "$WT_PATH/.codex" ]; then
    # Stale copy from previous run — remove and replace with symlink
    rm -rf "$WT_PATH/.codex"
    ln -s "$CODEX_DIR" "$WT_PATH/.codex"
    echo "  Replaced stale wt-$i/.codex directory with symlink."
  elif [ ! -e "$WT_PATH/.codex" ]; then
    ln -s "$CODEX_DIR" "$WT_PATH/.codex"
  fi

  # Legacy cleanup: old setups copied runtime into .claude per worktree.
  # Keep only the shared .codex runtime to avoid stale prompts/wrappers.
  LEGACY_WT_RUNTIME="$WT_PATH/.claude"
  if [ -L "$LEGACY_WT_RUNTIME" ]; then
    rm -f "$LEGACY_WT_RUNTIME"
  elif [ -d "$LEGACY_WT_RUNTIME" ]; then
    rm -rf "$LEGACY_WT_RUNTIME"
  fi

  echo "  Worktree wt-$i ready (branch: $BRANCH)"
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
SOCK_PATH_FILE="$CODEX_DIR/state/${NAMESPACE}.sock.path"
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
    > "$CODEX_DIR/state/${NAMESPACE}.coordinator.log" 2>&1 &
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

echo ""
echo "========================================"
echo " mac10 Setup Complete!"
echo "========================================"
echo ""
echo "Coordinator is running. To launch the full system, run one of:"
echo ""
echo "  bash start-claude.sh $PROJECT_DIR $NUM_WORKERS   # Use Claude (sonnet/opus)"
echo "  bash start-codex.sh  $PROJECT_DIR $NUM_WORKERS   # Use Codex (gpt-5.3-codex)"
echo ""
echo "To stop:  bash start-claude.sh --stop $PROJECT_DIR"
echo "To pause: bash start-claude.sh --pause $PROJECT_DIR"
echo ""
