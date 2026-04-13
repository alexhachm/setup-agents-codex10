#!/usr/bin/env bash
# Tested multi-project isolation
# mac10 setup — Single entry point installer
# Usage: bash setup.sh /path/to/your-project [num_workers]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${1:?Usage: bash setup.sh <project_dir> [num_workers]}"
NUM_WORKERS="${2:-4}"
MAX_WORKERS=8

# Derive namespace from project name for multi-project isolation (override with MAC10_NAMESPACE)
PROJECT_BASENAME="$(basename "$PROJECT_DIR" 2>/dev/null || echo 'project')"
NAMESPACE="${MAC10_NAMESPACE:-mac10-${PROJECT_BASENAME}}"
# Sanitize: lowercase, replace non-alnum with dash, truncate to 20 chars
NAMESPACE="$(echo "$NAMESPACE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | cut -c1-20)"
# Export COMPOSE_PROJECT_NAME for Docker Compose multi-project isolation
export COMPOSE_PROJECT_NAME="mac10-$(echo -n "${NAMESPACE}:${PROJECT_DIR}" | md5sum | cut -c1-6)"

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

# --- Source provider utilities ---
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/provider-utils.sh"

# --- Provider selection ---

echo "[0/8] Provider selection..."

AGENT_LAUNCHER_CONFIG="$(mac10_provider_config_file "$PROJECT_DIR")"
AGENT_LAUNCHER_DIR="$(dirname "$AGENT_LAUNCHER_CONFIG")"
mkdir -p "$AGENT_LAUNCHER_DIR"

# Load existing config if present
if [ -f "$AGENT_LAUNCHER_CONFIG" ]; then
  # shellcheck disable=SC1090
  . "$AGENT_LAUNCHER_CONFIG"
fi

mapfile -t AVAILABLE_PROVIDERS < <(mac10_list_provider_ids "$PROJECT_DIR")
if [ "${#AVAILABLE_PROVIDERS[@]}" -eq 0 ]; then
  echo "ERROR: no installed agent provider plugins found"
  exit 1
fi
DEFAULT_PROVIDER="$(mac10_requested_provider_id "$PROJECT_DIR" "${MAC10_AGENT_PROVIDER:-}")"
if ! mac10_provider_available "$DEFAULT_PROVIDER" "$PROJECT_DIR"; then
  DEFAULT_PROVIDER="${AVAILABLE_PROVIDERS[0]}"
fi
FORCED_PROVIDER="$(printf '%s' "${MAC10_FORCE_PROVIDER:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
if [ -n "$FORCED_PROVIDER" ]; then
  if ! mac10_provider_available "$FORCED_PROVIDER" "$PROJECT_DIR"; then
    echo "ERROR: MAC10_FORCE_PROVIDER must be an installed provider ($(mac10_list_provider_ids "$PROJECT_DIR" | paste -sd ', ' -); got: ${MAC10_FORCE_PROVIDER})"
    exit 1
  fi
  MAC10_AGENT_PROVIDER="$FORCED_PROVIDER"
  echo "  Provider forced by MAC10_FORCE_PROVIDER: $MAC10_AGENT_PROVIDER"
else
  echo "  Select agent provider:"
  for provider_index in "${!AVAILABLE_PROVIDERS[@]}"; do
    provider_id="${AVAILABLE_PROVIDERS[$provider_index]}"
    default_marker=""
    if [ "$provider_id" = "$DEFAULT_PROVIDER" ]; then
      default_marker=" (default)"
    fi
    echo "    $((provider_index + 1))) $provider_id - $(mac10_provider_display_name "$provider_id" "$PROJECT_DIR")$default_marker"
  done
  printf "  Provider [%s]: " "$DEFAULT_PROVIDER"
  if [ -t 0 ]; then
    read -r PROVIDER_INPUT
  else
    PROVIDER_INPUT=""
  fi
  PROVIDER_INPUT="$(printf '%s' "${PROVIDER_INPUT:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  if [ -z "$PROVIDER_INPUT" ]; then
    MAC10_AGENT_PROVIDER="$DEFAULT_PROVIDER"
  elif printf '%s' "$PROVIDER_INPUT" | grep -Eq '^[0-9]+$'; then
    provider_index=$((PROVIDER_INPUT - 1))
    if [ "$provider_index" -ge 0 ] && [ "$provider_index" -lt "${#AVAILABLE_PROVIDERS[@]}" ]; then
      MAC10_AGENT_PROVIDER="${AVAILABLE_PROVIDERS[$provider_index]}"
    else
      echo "ERROR: Unknown provider selection: $PROVIDER_INPUT"
      exit 1
    fi
  elif mac10_provider_available "$PROVIDER_INPUT" "$PROJECT_DIR"; then
    MAC10_AGENT_PROVIDER="$PROVIDER_INPUT"
  else
    echo "ERROR: Unknown provider: $PROVIDER_INPUT"
    exit 1
  fi
fi
export MAC10_AGENT_PROVIDER
printf 'MAC10_AGENT_PROVIDER=%s\n' "$MAC10_AGENT_PROVIDER" > "$AGENT_LAUNCHER_CONFIG"
mac10_load_provider_config "$PROJECT_DIR"
if [ "$IS_WSL" = true ] && declare -F _wsl_shim >/dev/null 2>&1; then
  _wsl_shim "$(mac10_provider_cli)"
fi
echo "  Selected provider: $MAC10_AGENT_PROVIDER"
echo ""

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
check_cmd "$(mac10_provider_cli)"
if ! mac10_provider_auth_check "$PROJECT_DIR" "$MAC10_AGENT_PROVIDER"; then
  echo "ERROR: provider health/auth check failed for $MAC10_AGENT_PROVIDER"
  exit 1
fi

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

# Optional: Xvfb for headless research driver (Chrome runs invisibly)
if ! command -v xvfb-run &>/dev/null; then
  echo "  WARNING: xvfb-run not found. Research driver will require a real display."
  echo "  Install with: sudo apt-get install -y xvfb libxi6 libgconf-2-4 fonts-liberation libappindicator3-1 libnss3 libatk-bridge2.0-0 libgtk-3-0"
fi

# Optional: Playwright MCP for visual testing (non-blocking)
if command -v npx &>/dev/null && npx @playwright/mcp@latest --help &>/dev/null 2>&1; then
  echo "  Playwright MCP: available"
else
  echo "  WARNING: Playwright MCP not installed. Visual testing unavailable for tmux workers."
  echo "  Install: npm install -g @playwright/mcp@latest && npx playwright install chromium"
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

# Helper: ensure a path is a directory (repair if it's a plain file from a prior corrupted run)
ensure_is_directory() {
  local p="$1"
  if [ -e "$p" ] && [ ! -d "$p" ]; then
    echo "  WARNING: $p exists as a file, replacing with directory"
    rm -f "$p"
  fi
}

# safe_copy: warn and back up when overwriting a file that differs from its source
safe_copy() {
  local src="$1" dest="$2"
  if [ ! -f "$dest" ]; then
    cp "$src" "$dest"
    return
  fi
  if cmp -s "$src" "$dest"; then
    cp "$src" "$dest"
    return
  fi
  local bak="${dest}.setup-backup"
  cp "$dest" "$bak"
  cp "$src" "$dest"
  echo "  WARNING: $dest was modified — backup saved to $bak"
}

mkdir -p "$CLAUDE_DIR/commands"
mkdir -p "$CLAUDE_DIR/state"
ensure_is_directory "$CLAUDE_DIR/knowledge"
mkdir -p "$CLAUDE_DIR/knowledge/codebase/domains"
mkdir -p "$CLAUDE_DIR/scripts"

# --- Copy templates ---

echo "[4/8] Copying templates..."

# Commands (shared) — only copy if not already present
for f in "$SCRIPT_DIR/templates/commands/"*.md; do
  dest="$CLAUDE_DIR/commands/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
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
for f in "$SCRIPT_DIR/templates/docs/"*.md; do
  safe_copy "$f" "$CLAUDE_DIR/docs/$(basename "$f")"
done

# Force-refresh key orchestration prompts/guidance on setup reruns.
# NOTE: allocate-loop.md is NOT force-copied — it may contain runtime corrections
# (e.g. merge_failed handling, functional_conflict subagent logic) that diverge from
# the template. Only copy if the file does not yet exist.
[ -f "$CLAUDE_DIR/commands/allocate-loop.md" ]         || cp "$SCRIPT_DIR/templates/commands/allocate-loop.md" "$CLAUDE_DIR/commands/allocate-loop.md"
safe_copy "$SCRIPT_DIR/templates/commands/architect-loop.md" "$CLAUDE_DIR/commands/architect-loop.md"
safe_copy "$SCRIPT_DIR/templates/docs/master-3-role.md" "$CLAUDE_DIR/docs/master-3-role.md"

# Root instruction files. AGENTS.md is provider-neutral; CLAUDE.md is kept as
# a compatibility copy for Claude Code.
if [ ! -f "$PROJECT_DIR/AGENTS.md" ]; then
  cp "$SCRIPT_DIR/templates/root-agents.md" "$PROJECT_DIR/AGENTS.md"
fi
if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  cp "$SCRIPT_DIR/templates/root-agents.md" "$PROJECT_DIR/CLAUDE.md"
else
  echo "  CLAUDE.md already exists, keeping existing."
fi

# Worker instruction files. worker-agents.md is canonical; worker-claude.md is
# generated as a compatibility copy for Claude Code.
safe_copy "$SCRIPT_DIR/templates/worker-agents.md" "$CLAUDE_DIR/worker-agents.md"
cp "$CLAUDE_DIR/worker-agents.md" "$CLAUDE_DIR/worker-claude.md"

# Scripts
for s in worker-sentinel.sh loop-sentinel.sh launch-worker.sh signal-wait.sh state-lock.sh provider-utils.sh research-sentinel.sh chatgpt-driver.py ingest-research.py compose-research-prompt.py requirements-research.txt; do
  [ -f "$SCRIPT_DIR/scripts/$s" ] && cp "$SCRIPT_DIR/scripts/$s" "$CLAUDE_DIR/scripts/"
done
chmod +x "$CLAUDE_DIR/scripts/"*.sh 2>/dev/null || true

# Provider plugin manifests. Installed projects use the same root path as the
# setup repo so copied runtime scripts can resolve providers without hardcoded
# setup-repo paths.
if [ -d "$SCRIPT_DIR/plugins/agents" ] && [ "$PROJECT_DIR" != "$SCRIPT_DIR" ]; then
  mkdir -p "$PROJECT_DIR/plugins/agents"
  cp -R "$SCRIPT_DIR/plugins/agents/"* "$PROJECT_DIR/plugins/agents/" 2>/dev/null || true
fi

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

# --- Add mac10 wrapper to PATH ---

echo "[5/8] Setting up mac10 CLI wrapper..."

MAC10_BIN="$SCRIPT_DIR/coordinator/bin/mac10"
chmod +x "$MAC10_BIN"
MAC10_CLI="$CLAUDE_DIR/scripts/mac10"
MAC10_COMPAT="$MAC10_CLI"

# Create a namespaced wrapper script in the project
cat > "$MAC10_CLI" << 'WRAPPER'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Derive project dir: scripts/ -> .claude/ -> project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAC10_BIN="PLACEHOLDER_MAC10_BIN"
if [ ! -f "$MAC10_BIN" ]; then
  echo "ERROR: mac10 CLI not found at $MAC10_BIN" >&2
  echo "  Has the setup-agents repo moved? Re-run setup.sh to fix." >&2
  exit 1
fi
export MAC10_NAMESPACE="${MAC10_NAMESPACE:-PLACEHOLDER_NAMESPACE}"
exec node "$MAC10_BIN" --project "$PROJECT_ROOT" "$@"
WRAPPER
# Substitute the actual path and namespace into the wrapper (quoted heredoc prevents expansion above)
sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|; s|PLACEHOLDER_NAMESPACE|$NAMESPACE|" "$MAC10_CLI"
chmod +x "$MAC10_CLI"

# Add to PATH for this project's agents
export PATH="$SCRIPT_DIR/coordinator/bin:$CLAUDE_DIR/scripts:$PATH"
export MAC10_NAMESPACE="$NAMESPACE"

echo "  mac10 wrapper ready: $MAC10_CLI"

# Global wrappers in ~/.local/bin for shell-wide access
LOCAL_BIN_DIR="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN_DIR"

cat > "$LOCAL_BIN_DIR/mac10" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

pick_by_cwd() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -x "$dir/.claude/scripts/mac10" ]; then
      echo "$dir/.claude/scripts/mac10"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

if target="$(pick_by_cwd)"; then
  exec "$target" "$@"
fi

echo "ERROR: mac10 must be run inside a configured project directory." >&2
exit 1
WRAPPER
chmod +x "$LOCAL_BIN_DIR/mac10"
echo "  Global wrapper ready: $LOCAL_BIN_DIR/mac10"

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
    echo "  Worktree wt-$i already exists, refreshing runtime files."
  else
    # Create branch if it doesn't exist
    git branch "$BRANCH" "$MAIN_BRANCH" 2>/dev/null || true
    git worktree add "$WT_PATH" "$BRANCH" 2>/dev/null || {
      # Branch might already exist from a previous run
      git worktree add "$WT_PATH" "$BRANCH" --force 2>/dev/null || true
    }
  fi

  # Copy canonical worker instructions plus the Claude compatibility filename.
  safe_copy "$CLAUDE_DIR/worker-agents.md" "$WT_PATH/AGENTS.md"
  safe_copy "$CLAUDE_DIR/worker-agents.md" "$WT_PATH/CLAUDE.md"

  # Copy only source/config assets to the worktree. Runtime state directories
  # such as .claude/state, .claude/logs, and .claude/signals are intentionally
  # not copied so workers do not inherit stale provider or coordinator state.
  mkdir -p "$WT_PATH/.claude/commands"
  mkdir -p "$WT_PATH/.claude/knowledge/codebase/domains"
  mkdir -p "$WT_PATH/.claude/scripts"
  mkdir -p "$WT_PATH/.claude/agents"
  mkdir -p "$WT_PATH/.claude/hooks"
  cp "$CLAUDE_DIR/commands/"*.md "$WT_PATH/.claude/commands/"
  cp "$MAC10_CLI" "$WT_PATH/.claude/scripts/mac10"
  cp "$CLAUDE_DIR/scripts/"*.sh "$WT_PATH/.claude/scripts/" 2>/dev/null || true
  chmod +x "$WT_PATH/.claude/scripts/"*.sh 2>/dev/null || true
  cp "$CLAUDE_DIR/agents/"*.md "$WT_PATH/.claude/agents/"
  cp "$CLAUDE_DIR/hooks/"*.sh "$WT_PATH/.claude/hooks/" 2>/dev/null || true
  chmod +x "$WT_PATH/.claude/hooks/"*.sh 2>/dev/null || true

  # Copy knowledge files (will be updated via main project junction/copy)
  while IFS= read -r -d '' kf; do
    [ -f "$kf" ] || continue
    rel="${kf#"$CLAUDE_DIR/knowledge/"}"
    mkdir -p "$WT_PATH/.claude/knowledge/$(dirname "$rel")"
    safe_copy "$kf" "$WT_PATH/.claude/knowledge/$rel"
  done < <(find "$CLAUDE_DIR/knowledge" -type f -print0 2>/dev/null)

  # Copy settings.json to worktree so hooks are active
  safe_copy "$SETTINGS_FILE" "$WT_PATH/.claude/settings.json" 2>/dev/null || true

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

# --- Runtime service startup (coordinator, workers, masters) ---
# Sourced from a separate file so runtime restart doesn't require re-running
# the full install. Variables are already set; _START_SERVICES_SOURCED tells
# the script to skip its own variable derivation.
_START_SERVICES_SOURCED=1
export _START_SERVICES_SOURCED
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/start-services.sh"
start_coordinator
launch_master_agents
print_completion_banner
