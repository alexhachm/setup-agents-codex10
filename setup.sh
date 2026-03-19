#!/usr/bin/env bash
# mac10 setup — Single entry point installer
# Usage: bash setup.sh <project_dir> [num_workers] [options]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/provider-utils.sh"

print_usage() {
  cat <<USAGE
Usage: bash setup.sh <project_dir> [num_workers] [options]

Options:
  --provider <codex|claude>     Agent provider to launch
  --fast-model <model>          Model used for fast roles (Master-1, Master-3, workers)
  --deep-model <model>          Model used for deep roles (Master-2, loops)
  --economy-model <model>       Model used for economy routing
  --no-launch                   Configure everything but do not open master terminals
  -h, --help                    Show this help text
USAGE
}

check_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' not found. Please install it first."
    exit 1
  fi
}

prompt_default() {
  local label="$1"
  local default_value="$2"
  local reply=""
  read -r -p "$label [$default_value]: " reply || true
  printf '%s' "${reply:-$default_value}"
}

prompt_provider() {
  local default_value="$1"
  local reply=""
  while true; do
    read -r -p "Agent provider [${default_value}] (codex/claude): " reply || true
    reply="${reply:-$default_value}"
    reply="$(printf '%s' "$reply" | tr '[:upper:]' '[:lower:]')"
    case "$reply" in
      codex|claude)
        printf '%s' "$reply"
        return 0
        ;;
    esac
    echo "Please enter 'codex' or 'claude'."
  done
}

merge_settings_file() {
  local target_file="$1"
  local template_file="$SCRIPT_DIR/templates/settings.json"
  node - "$template_file" "$target_file" <<'NODE'
const fs = require('fs');
const [templateFile, targetFile] = process.argv.slice(2);
const dedupe = (...lists) => {
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!out.includes(item)) out.push(item);
    }
  }
  return out;
};
const template = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
let existing = {};
if (fs.existsSync(targetFile)) {
  try {
    existing = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
  } catch {
    existing = {};
  }
}
const merged = { ...template, ...existing };
merged.permissions = {
  allow: dedupe(template.permissions?.allow, existing.permissions?.allow),
  deny: dedupe(existing.permissions?.deny, template.permissions?.deny),
};
merged.trustedDirectories = dedupe(template.trustedDirectories, existing.trustedDirectories);
merged.skipDangerousModePermissionPrompt =
  template.skipDangerousModePermissionPrompt ?? existing.skipDangerousModePermissionPrompt ?? true;
merged.hooks = (() => {
  const tHooks = template.hooks && typeof template.hooks === 'object' ? template.hooks : {};
  const eHooks = existing.hooks && typeof existing.hooks === 'object' ? existing.hooks : {};
  const allTypes = [...new Set([...Object.keys(tHooks), ...Object.keys(eHooks)])];
  const result = {};
  for (const hookType of allTypes) {
    const tArr = Array.isArray(tHooks[hookType]) ? tHooks[hookType] : [];
    const eArr = Array.isArray(eHooks[hookType]) ? eHooks[hookType] : [];
    const seen = new Set();
    const merged = [];
    for (const entry of [...tArr, ...eArr]) {
      const key = JSON.stringify(entry);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(entry);
      }
    }
    result[hookType] = merged;
  }
  return result;
})();
fs.writeFileSync(targetFile, `${JSON.stringify(merged, null, 2)}\n`);
NODE
}

add_trusted_to_settings() {
  local settings_file="$1"
  local trusted_path="$2"
  node - "$settings_file" "$trusted_path" <<'NODE'
const fs = require('fs');
const [settingsFile, trustedPath] = process.argv.slice(2);
let doc = {};
if (fs.existsSync(settingsFile)) {
  try {
    doc = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  } catch {
    doc = {};
  }
}
const dirs = Array.isArray(doc.trustedDirectories) ? doc.trustedDirectories : [];
if (!dirs.includes(trustedPath)) dirs.push(trustedPath);
doc.trustedDirectories = dirs;
fs.writeFileSync(settingsFile, `${JSON.stringify(doc, null, 2)}\n`);
NODE
}

write_provider_config() {
  local config_file="$1"
  : > "$config_file"
  printf 'MAC10_AGENT_PROVIDER=%q\n' "$MAC10_AGENT_PROVIDER" >> "$config_file"
  printf 'MAC10_FAST_MODEL=%q\n' "$MAC10_FAST_MODEL" >> "$config_file"
  printf 'MAC10_DEEP_MODEL=%q\n' "$MAC10_DEEP_MODEL" >> "$config_file"
  printf 'MAC10_ECONOMY_MODEL=%q\n' "$MAC10_ECONOMY_MODEL" >> "$config_file"
  printf 'MAC10_WORKER_MODEL=%q\n' "$MAC10_WORKER_MODEL" >> "$config_file"
  printf 'MAC10_LOOP_MODEL=%q\n' "$MAC10_LOOP_MODEL" >> "$config_file"
}

seed_coordinator_config() {
  local key="$1"
  local value="$2"
  "$CODEX10_CLI" set-config "$key" "$value" >/dev/null 2>&1 || {
    echo "WARNING: Failed to seed coordinator config: $key=$value"
    return 1
  }
}

ensure_runtime_symlink() {
  local link_path="$1"
  local expected_target="$2"
  local label="$3"
  if [ -L "$link_path" ]; then
    local current_target
    current_target="$(readlink "$link_path" || true)"
    if [ "$current_target" != "$expected_target" ]; then
      echo "ERROR: $link_path points to unexpected target: $current_target"
      echo "  Expected: $expected_target"
      exit 1
    fi
    return 0
  fi
  if [ -e "$link_path" ]; then
    local backup_path="${link_path}.pre-shared-$(date +%Y%m%d%H%M%S)"
    mv "$link_path" "$backup_path"
    echo "  Backed up legacy $label runtime to $backup_path"
  fi
  ln -s "$expected_target" "$link_path"
}

to_windows_path() {
  local unix_path="$1"
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$unix_path"
    return 0
  fi
  if [[ "$unix_path" =~ ^/mnt/([a-zA-Z])(.*)$ ]]; then
    local drive="${BASH_REMATCH[1]^}"
    local rest="${BASH_REMATCH[2]//\//\\}"
    printf '%s' "${drive}:${rest}"
    return 0
  fi
  printf '%s' "$unix_path"
}

PROJECT_DIR=""
NUM_WORKERS="4"
MAX_WORKERS=8
NAMESPACE="codex10"
NO_LAUNCH=false
AGENT_PROVIDER="${MAC10_AGENT_PROVIDER:-}"
FAST_MODEL="${MAC10_FAST_MODEL:-}"
DEEP_MODEL="${MAC10_DEEP_MODEL:-}"
ECONOMY_MODEL="${MAC10_ECONOMY_MODEL:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --provider)
      [ $# -ge 2 ] || { echo "ERROR: --provider requires a value"; exit 1; }
      AGENT_PROVIDER="$2"
      shift 2
      ;;
    --provider=*)
      AGENT_PROVIDER="${1#*=}"
      shift
      ;;
    --fast-model)
      [ $# -ge 2 ] || { echo "ERROR: --fast-model requires a value"; exit 1; }
      FAST_MODEL="$2"
      shift 2
      ;;
    --fast-model=*)
      FAST_MODEL="${1#*=}"
      shift
      ;;
    --deep-model)
      [ $# -ge 2 ] || { echo "ERROR: --deep-model requires a value"; exit 1; }
      DEEP_MODEL="$2"
      shift 2
      ;;
    --deep-model=*)
      DEEP_MODEL="${1#*=}"
      shift
      ;;
    --economy-model)
      [ $# -ge 2 ] || { echo "ERROR: --economy-model requires a value"; exit 1; }
      ECONOMY_MODEL="$2"
      shift 2
      ;;
    --economy-model=*)
      ECONOMY_MODEL="${1#*=}"
      shift
      ;;
    --no-launch)
      NO_LAUNCH=true
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "ERROR: Unknown option: $1"
      print_usage
      exit 1
      ;;
    *)
      if [ -z "$PROJECT_DIR" ]; then
        PROJECT_DIR="$1"
      elif [ "$NUM_WORKERS" = "4" ]; then
        NUM_WORKERS="$1"
      else
        echo "ERROR: Unexpected argument: $1"
        print_usage
        exit 1
      fi
      shift
      ;;
  esac
done

if [ -z "$PROJECT_DIR" ]; then
  print_usage
  exit 1
fi

if ! [[ "$NUM_WORKERS" =~ ^[0-9]+$ ]] || [ "$NUM_WORKERS" -lt 1 ]; then
  echo "ERROR: num_workers must be a positive integer (got: $NUM_WORKERS)"
  exit 1
fi
if [ "$NUM_WORKERS" -gt "$MAX_WORKERS" ]; then
  echo "ERROR: num_workers cannot exceed $MAX_WORKERS (got: $NUM_WORKERS)"
  exit 1
fi

PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd || echo "$PROJECT_DIR")"
INTERACTIVE_SETUP=false
if [ -t 0 ] && [ -t 1 ]; then
  INTERACTIVE_SETUP=true
fi

# --- WSL shim: expose Windows-side CLIs if running under WSL ---
if grep -qi microsoft /proc/version 2>/dev/null; then
  _wsl_shim() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
      for p in \
        "/mnt/c/Program Files/GitHub CLI" \
        "/mnt/c/Users/$USER/AppData/Local/Programs" \
        "/mnt/c/ProgramData/chocolatey/bin"
      do
        if [ -f "$p/${cmd}.exe" ]; then
          mkdir -p "$HOME/bin"
          ln -sf "$p/${cmd}.exe" "$HOME/bin/$cmd"
          export PATH="$HOME/bin:$PATH"
          return 0
        fi
      done
    fi
    return 1
  }
  _wsl_shim gh || true
  _wsl_shim codex || true
  _wsl_shim claude || true
  [ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" 2>/dev/null
fi

IS_WSL=false
IS_MSYS=false
if grep -qi microsoft /proc/version 2>/dev/null || [ -n "${WSL_DISTRO_NAME:-}" ]; then
  IS_WSL=true
elif [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  IS_MSYS=true
fi

PROVIDER_CONFIG_FILE="$(mac10_provider_config_file "$PROJECT_DIR")"
EXISTING_PROVIDER=""
EXISTING_FAST_MODEL=""
EXISTING_DEEP_MODEL=""
EXISTING_ECONOMY_MODEL=""
EXISTING_WORKER_MODEL=""
EXISTING_LOOP_MODEL=""
if [ -f "$PROVIDER_CONFIG_FILE" ]; then
  IFS=$'\t' read -r EXISTING_PROVIDER EXISTING_FAST_MODEL EXISTING_DEEP_MODEL EXISTING_ECONOMY_MODEL EXISTING_WORKER_MODEL EXISTING_LOOP_MODEL < <(
    bash -c '. "$1"; printf "%s\t%s\t%s\t%s\t%s\t%s\n" "${MAC10_AGENT_PROVIDER:-}" "${MAC10_FAST_MODEL:-}" "${MAC10_DEEP_MODEL:-}" "${MAC10_ECONOMY_MODEL:-}" "${MAC10_WORKER_MODEL:-}" "${MAC10_LOOP_MODEL:-}"' bash "$PROVIDER_CONFIG_FILE"
  )
fi

HAVE_CODEX=false
HAVE_CLAUDE=false
command -v codex >/dev/null 2>&1 && HAVE_CODEX=true
command -v claude >/dev/null 2>&1 && HAVE_CLAUDE=true

if [ -z "$AGENT_PROVIDER" ]; then
  AGENT_PROVIDER="$EXISTING_PROVIDER"
fi
if [ -z "$AGENT_PROVIDER" ]; then
  if [ "$HAVE_CODEX" = true ] && [ "$HAVE_CLAUDE" = false ]; then
    AGENT_PROVIDER="codex"
  elif [ "$HAVE_CLAUDE" = true ] && [ "$HAVE_CODEX" = false ]; then
    AGENT_PROVIDER="claude"
  elif [ "$HAVE_CLAUDE" = true ] && [ "$HAVE_CODEX" = true ]; then
    AGENT_PROVIDER="codex"
  fi
fi
AGENT_PROVIDER="$(printf '%s' "${AGENT_PROVIDER:-}" | tr '[:upper:]' '[:lower:]')"

if [ "$INTERACTIVE_SETUP" = true ] && [ "$HAVE_CLAUDE" = true ] && [ "$HAVE_CODEX" = true ]; then
  AGENT_PROVIDER="$(prompt_provider "${AGENT_PROVIDER:-codex}")"
fi

case "$AGENT_PROVIDER" in
  codex|claude) ;;
  "")
    echo "ERROR: No supported agent CLI found. Install 'codex' or 'claude', or pass --provider explicitly."
    exit 1
    ;;
  *)
    echo "ERROR: Unsupported provider '$AGENT_PROVIDER'. Use codex or claude."
    exit 1
    ;;
esac

if [ "$AGENT_PROVIDER" = "codex" ] && [ "$HAVE_CODEX" = false ]; then
  echo "ERROR: Provider 'codex' selected, but the codex CLI is not installed."
  exit 1
fi
if [ "$AGENT_PROVIDER" = "claude" ] && [ "$HAVE_CLAUDE" = false ]; then
  echo "ERROR: Provider 'claude' selected, but the claude CLI is not installed."
  exit 1
fi

USE_EXISTING_MODEL_DEFAULTS=false
if [ -n "$EXISTING_PROVIDER" ] && [ "$EXISTING_PROVIDER" = "$AGENT_PROVIDER" ]; then
  USE_EXISTING_MODEL_DEFAULTS=true
fi

DEFAULT_FAST_MODEL="$(mac10_default_fast_model "$AGENT_PROVIDER")"
DEFAULT_DEEP_MODEL="$(mac10_default_deep_model "$AGENT_PROVIDER")"
DEFAULT_ECONOMY_MODEL="$(mac10_default_economy_model "$AGENT_PROVIDER")"
if [ "$USE_EXISTING_MODEL_DEFAULTS" = true ] && [ -n "$EXISTING_FAST_MODEL" ]; then
  DEFAULT_FAST_MODEL="$EXISTING_FAST_MODEL"
fi
if [ "$USE_EXISTING_MODEL_DEFAULTS" = true ] && [ -n "$EXISTING_DEEP_MODEL" ]; then
  DEFAULT_DEEP_MODEL="$EXISTING_DEEP_MODEL"
fi
if [ "$USE_EXISTING_MODEL_DEFAULTS" = true ] && [ -n "$EXISTING_ECONOMY_MODEL" ]; then
  DEFAULT_ECONOMY_MODEL="$EXISTING_ECONOMY_MODEL"
fi

if [ "$INTERACTIVE_SETUP" = true ] && [ -z "$FAST_MODEL" ]; then
  FAST_MODEL="$(prompt_default "Fast model" "$DEFAULT_FAST_MODEL")"
fi
if [ "$INTERACTIVE_SETUP" = true ] && [ -z "$DEEP_MODEL" ]; then
  DEEP_MODEL="$(prompt_default "Deep model" "$DEFAULT_DEEP_MODEL")"
fi
if [ "$INTERACTIVE_SETUP" = true ] && [ -z "$ECONOMY_MODEL" ]; then
  ECONOMY_MODEL="$(prompt_default "Economy model" "$DEFAULT_ECONOMY_MODEL")"
fi

FAST_MODEL="${FAST_MODEL:-$DEFAULT_FAST_MODEL}"
DEEP_MODEL="${DEEP_MODEL:-$DEFAULT_DEEP_MODEL}"
ECONOMY_MODEL="${ECONOMY_MODEL:-$DEFAULT_ECONOMY_MODEL}"
WORKER_MODEL="${EXISTING_WORKER_MODEL:-$FAST_MODEL}"
LOOP_MODEL="${EXISTING_LOOP_MODEL:-$DEEP_MODEL}"
if [ "$USE_EXISTING_MODEL_DEFAULTS" = false ]; then
  WORKER_MODEL="$FAST_MODEL"
  LOOP_MODEL="$DEEP_MODEL"
fi

export MAC10_AGENT_PROVIDER="$AGENT_PROVIDER"
export MAC10_FAST_MODEL="$FAST_MODEL"
export MAC10_DEEP_MODEL="$DEEP_MODEL"
export MAC10_ECONOMY_MODEL="$ECONOMY_MODEL"
export MAC10_WORKER_MODEL="$WORKER_MODEL"
export MAC10_LOOP_MODEL="$LOOP_MODEL"


echo "========================================"
echo " mac10 Multi-Agent Setup"
echo "========================================"
echo "Project:   $PROJECT_DIR"
echo "Workers:   $NUM_WORKERS"
echo "Namespace: $NAMESPACE"
echo "Provider:  $MAC10_AGENT_PROVIDER"
echo "Models:    fast=$MAC10_FAST_MODEL deep=$MAC10_DEEP_MODEL economy=$MAC10_ECONOMY_MODEL"
echo ""

echo "[1/8] Preflight checks..."
check_cmd node
check_cmd git
check_cmd gh
if [ "$IS_WSL" = true ]; then
  check_cmd tmux
fi
check_cmd "$AGENT_PROVIDER"

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "ERROR: Node.js 18+ required (found v$(node -v))"
  exit 1
fi

if ! git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: $PROJECT_DIR is not a git repository"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: GitHub CLI not authenticated. Run 'gh auth login' first."
  exit 1
fi

echo "  All checks passed."

echo "[2/8] Installing coordinator..."
cd "$SCRIPT_DIR/coordinator"
npm install --production 2>&1 | tail -1
echo "  Dependencies installed."

echo "[3/8] Setting up project directories..."
CLAUDE_DIR="$PROJECT_DIR/.claude"
CODEX_DIR="$PROJECT_DIR/.codex"

if [ -d "$CLAUDE_DIR" ] && [ ! -e "$CODEX_DIR" ]; then
  mv "$CLAUDE_DIR" "$CODEX_DIR"
  echo "  Migrated existing .claude directory to .codex."
fi

mkdir -p "$CODEX_DIR/commands" "$CODEX_DIR/commands-codex10" "$CODEX_DIR/state" "$CODEX_DIR/knowledge/domain" "$CODEX_DIR/scripts" "$CODEX_DIR/agents" "$CODEX_DIR/docs" "$CODEX_DIR/hooks"
mkdir -p "$CLAUDE_DIR/commands" "$CLAUDE_DIR/commands-codex10" "$CLAUDE_DIR/state" "$CLAUDE_DIR/knowledge/domain" "$CLAUDE_DIR/scripts" "$CLAUDE_DIR/agents" "$CLAUDE_DIR/docs" "$CLAUDE_DIR/hooks"

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

echo "[4/8] Copying templates..."
for f in "$SCRIPT_DIR/templates/commands/"*.md; do
  dest="$CODEX_DIR/commands/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
  cp "$f" "$CODEX_DIR/commands-codex10/$(basename "$f")"
done
for f in "$CODEX_DIR/commands/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$CLAUDE_DIR/commands/$(basename "$f")"
done
for f in "$CODEX_DIR/commands-codex10/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$CLAUDE_DIR/commands-codex10/$(basename "$f")"
done

for f in "$SCRIPT_DIR/templates/agents/"*.md; do
  dest="$CODEX_DIR/agents/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
done
for f in "$CODEX_DIR/agents/"*.md; do
  [ -f "$f" ] || continue
  cp "$f" "$CLAUDE_DIR/agents/$(basename "$f")"
done

mkdir -p "$CODEX_DIR/knowledge" "$CLAUDE_DIR/knowledge"
for f in "$SCRIPT_DIR/templates/knowledge/"*.md; do
  dest="$CODEX_DIR/knowledge/$(basename "$f")"
  [ -f "$dest" ] || cp "$f" "$dest"
  compat_dest="$CLAUDE_DIR/knowledge/$(basename "$f")"
  [ -f "$compat_dest" ] || cp "$f" "$compat_dest"
done

cp "$SCRIPT_DIR/templates/docs/"*.md "$CODEX_DIR/docs/"
cp "$CODEX_DIR/docs/"*.md "$CLAUDE_DIR/docs/" 2>/dev/null || true

if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/CLAUDE.md"
else
  echo "  CLAUDE.md already exists, keeping existing."
fi
if [ ! -f "$PROJECT_DIR/AGENTS.md" ]; then
  cp "$SCRIPT_DIR/templates/root-claude.md" "$PROJECT_DIR/AGENTS.md"
fi

cp "$SCRIPT_DIR/templates/worker-claude.md" "$CODEX_DIR/worker-claude.md"
cp "$SCRIPT_DIR/templates/worker-claude.md" "$CODEX_DIR/worker-agents.md"
cp "$CODEX_DIR/worker-claude.md" "$CLAUDE_DIR/worker-claude.md"
cp "$CODEX_DIR/worker-agents.md" "$CLAUDE_DIR/worker-agents.md"

for s in worker-sentinel.sh loop-sentinel.sh launch-worker.sh signal-wait.sh state-lock.sh provider-utils.sh; do
  cp "$SCRIPT_DIR/scripts/$s" "$CODEX_DIR/scripts/"
  cp "$SCRIPT_DIR/scripts/$s" "$CLAUDE_DIR/scripts/"
done
chmod +x "$CODEX_DIR/scripts/"*.sh "$CLAUDE_DIR/scripts/"*.sh

cp "$SCRIPT_DIR/.codex/hooks/pre-tool-secret-guard.sh" "$CODEX_DIR/hooks/" 2>/dev/null || true
cp "$CODEX_DIR/hooks/pre-tool-secret-guard.sh" "$CLAUDE_DIR/hooks/" 2>/dev/null || true
chmod +x "$CODEX_DIR/hooks/"*.sh "$CLAUDE_DIR/hooks/"*.sh 2>/dev/null || true

CODEX_SETTINGS_FILE="$CODEX_DIR/settings.json"
CLAUDE_SETTINGS_FILE="$CLAUDE_DIR/settings.json"
merge_settings_file "$CODEX_SETTINGS_FILE"
merge_settings_file "$CLAUDE_SETTINGS_FILE"
write_provider_config "$PROVIDER_CONFIG_FILE"

echo "  Templates copied."

echo "[5/8] Setting up codex10 CLI wrapper..."
MAC10_BIN="$SCRIPT_DIR/coordinator/bin/mac10"
chmod +x "$MAC10_BIN"
MAC10_CLI="$CODEX_DIR/scripts/mac10-codex10"
CODEX10_CLI="$CODEX_DIR/scripts/codex10"
MAC10_COMPAT="$CODEX_DIR/scripts/mac10"
CLAUDE_COMPAT="$CLAUDE_DIR/scripts/mac10"
CLAUDE_CODEX10="$CLAUDE_DIR/scripts/codex10"
CLAUDE_NAMESPACED="$CLAUDE_DIR/scripts/mac10-codex10"

cat > "$MAC10_CLI" <<'WRAPPER'
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
sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$MAC10_CLI"
chmod +x "$MAC10_CLI"
cp "$MAC10_CLI" "$CODEX10_CLI"
chmod +x "$CODEX10_CLI"

cat > "$MAC10_COMPAT" <<'WRAPPER'
#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAC10_BIN="PLACEHOLDER_MAC10_BIN"
if [ ! -f "$MAC10_BIN" ]; then
  echo "ERROR: mac10 CLI not found at $MAC10_BIN" >&2
  echo "  Has the setup-agents repo moved? Re-run setup.sh to fix." >&2
  exit 1
fi
export MAC10_NAMESPACE="${MAC10_NAMESPACE:-mac10}"
exec node "$MAC10_BIN" "$@"
WRAPPER
sed -i "s|PLACEHOLDER_MAC10_BIN|$MAC10_BIN|" "$MAC10_COMPAT"
chmod +x "$MAC10_COMPAT"

cp "$MAC10_COMPAT" "$CLAUDE_COMPAT"
cp "$CODEX10_CLI" "$CLAUDE_CODEX10"
cp "$MAC10_CLI" "$CLAUDE_NAMESPACED"
chmod +x "$CLAUDE_COMPAT" "$CLAUDE_CODEX10" "$CLAUDE_NAMESPACED"

export PATH="$SCRIPT_DIR/coordinator/bin:$CODEX_DIR/scripts:$PATH"
export MAC10_NAMESPACE="$NAMESPACE"

echo "  codex10 wrapper ready: $CODEX10_CLI"

LOCAL_BIN_DIR="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN_DIR"

cat > "$LOCAL_BIN_DIR/mac10-codex10" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
TARGET="PLACEHOLDER_CODEX10_WRAPPER"
if [ ! -x "$TARGET" ]; then
  echo "ERROR: codex10 wrapper missing at $TARGET" >&2
  echo "  Re-run setup in setup-agents-codex10 to refresh wrappers." >&2
  exit 1
fi
exec "$TARGET" "$@"
WRAPPER
sed -i "s|PLACEHOLDER_CODEX10_WRAPPER|$CODEX10_CLI|" "$LOCAL_BIN_DIR/mac10-codex10"
chmod +x "$LOCAL_BIN_DIR/mac10-codex10"

cat > "$LOCAL_BIN_DIR/mac10-claude10" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail
TARGET="PLACEHOLDER_CLAUDE10_WRAPPER"
if [ ! -x "$TARGET" ]; then
  echo "ERROR: claude10 wrapper missing at $TARGET" >&2
  echo "  Re-run setup in setup-agents-codex10 to refresh wrappers." >&2
  exit 1
fi
exec "$TARGET" "$@"
WRAPPER
sed -i "s|PLACEHOLDER_CLAUDE10_WRAPPER|$CLAUDE_COMPAT|" "$LOCAL_BIN_DIR/mac10-claude10"
chmod +x "$LOCAL_BIN_DIR/mac10-claude10"

cat > "$LOCAL_BIN_DIR/mac10" <<'WRAPPER'
#!/usr/bin/env bash
set -euo pipefail

pick_by_cwd() {
  local dir="$PWD"
  while [ "$dir" != "/" ]; do
    if [ -x "$dir/.codex/scripts/codex10" ]; then
      echo "$dir/.codex/scripts/codex10"
      return 0
    fi
    if [ -x "$dir/.claude/scripts/mac10" ]; then
      echo "$dir/.claude/scripts/mac10"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

if [ "${MAC10_TARGET:-}" = "codex10" ]; then
  exec mac10-codex10 "$@"
fi
if [ "${MAC10_TARGET:-}" = "claude10" ]; then
  exec mac10-claude10 "$@"
fi

if target="$(pick_by_cwd)"; then
  exec "$target" "$@"
fi

if command -v mac10-codex10 >/dev/null 2>&1 && ! command -v mac10-claude10 >/dev/null 2>&1; then
  exec mac10-codex10 "$@"
fi
if command -v mac10-claude10 >/dev/null 2>&1 && ! command -v mac10-codex10 >/dev/null 2>&1; then
  exec mac10-claude10 "$@"
fi

echo "ERROR: mac10 target is ambiguous outside a project directory." >&2
echo "  Use one of:" >&2
echo "    mac10-codex10 <command>" >&2
echo "    mac10-claude10 <command>" >&2
echo "  Or set MAC10_TARGET=codex10|claude10." >&2
exit 1
WRAPPER
chmod +x "$LOCAL_BIN_DIR/mac10"
echo "  Global wrappers ready: $LOCAL_BIN_DIR/mac10, $LOCAL_BIN_DIR/mac10-codex10, $LOCAL_BIN_DIR/mac10-claude10"

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
    git branch "$BRANCH" "$MAIN_BRANCH" 2>/dev/null || true
    git worktree add "$WT_PATH" "$BRANCH" 2>/dev/null || {
      git worktree add "$WT_PATH" "$BRANCH" --force 2>/dev/null || true
    }
  fi

  cp "$CODEX_DIR/worker-claude.md" "$WT_PATH/CLAUDE.md"
  cp "$CODEX_DIR/worker-agents.md" "$WT_PATH/AGENTS.md"

  ensure_runtime_symlink "$WT_PATH/.codex" "$CODEX_DIR" ".codex"
  ensure_runtime_symlink "$WT_PATH/.claude" "$CLAUDE_DIR" ".claude"

  echo "  Worktree wt-$i ready (branch: $BRANCH)"
done

echo "[7/8] Configuring trusted directories..."
add_trusted() {
  local trusted_path="$1"
  add_trusted_to_settings "$CODEX_SETTINGS_FILE" "$trusted_path"
  add_trusted_to_settings "$CLAUDE_SETTINGS_FILE" "$trusted_path"
}

add_trusted "$PROJECT_DIR"
for i in $(seq 1 "$NUM_WORKERS"); do
  add_trusted "$WORKTREE_DIR/wt-$i"
done

if [ "$IS_WSL" = true ]; then
  WIN_PROJECT="$(to_windows_path "$PROJECT_DIR")"
  add_trusted "$WIN_PROJECT"
  for i in $(seq 1 "$NUM_WORKERS"); do
    WIN_WT="$(to_windows_path "$WORKTREE_DIR/wt-$i")"
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

echo "[8/8] Starting coordinator..."
ALREADY_RUNNING=false
SOCK_PATH_FILE="$CODEX_DIR/state/${NAMESPACE}.sock.path"
if "$CODEX10_CLI" ping >/dev/null 2>&1; then
  ALREADY_RUNNING=true
  echo "  Coordinator already running, skipping start."
elif [ -f "$SOCK_PATH_FILE" ]; then
  rm -f "$SOCK_PATH_FILE" 2>/dev/null || true
fi

if [ "$ALREADY_RUNNING" = false ]; then
  nohup env MAC10_NAMESPACE="$NAMESPACE" MAC10_SCRIPT_DIR="$SCRIPT_DIR" \
    node "$SCRIPT_DIR/coordinator/src/index.js" "$PROJECT_DIR" \
    > "$CODEX_DIR/state/${NAMESPACE}.coordinator.log" 2>&1 &
  COORD_PID=$!

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

COORD_READY=false
for attempt in $(seq 1 10); do
  if "$CODEX10_CLI" ping >/dev/null 2>&1; then
    COORD_READY=true
    break
  fi
  sleep 1
done

if [ "$COORD_READY" = true ]; then
  seed_coordinator_config max_workers "$NUM_WORKERS" || true
  seed_coordinator_config model_flagship "$MAC10_DEEP_MODEL" || true
  seed_coordinator_config model_high "$MAC10_DEEP_MODEL" || true
  seed_coordinator_config model_xhigh "$MAC10_DEEP_MODEL" || true
  seed_coordinator_config model_mid "$MAC10_FAST_MODEL" || true
  seed_coordinator_config model_spark "$MAC10_FAST_MODEL" || true
  seed_coordinator_config model_codex_spark "$MAC10_FAST_MODEL" || true
  seed_coordinator_config model_mini "$MAC10_ECONOMY_MODEL" || true

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

LAUNCH_SCRIPT="$SCRIPT_DIR/scripts/launch-agent.sh"
launch_manual() {
  echo "  Start manually in separate terminals:"
  echo "    bash \"$LAUNCH_SCRIPT\" \"$PROJECT_DIR\" fast /master-loop"
  echo "    bash \"$LAUNCH_SCRIPT\" \"$PROJECT_DIR\" deep /architect-loop"
  echo "    bash \"$LAUNCH_SCRIPT\" \"$PROJECT_DIR\" fast /allocate-loop"
}

if [ "$NO_LAUNCH" = false ]; then
  echo "Launching master agents..."
  if [ "$IS_MSYS" = true ]; then
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
      echo "  Windows Terminal not found."
      launch_manual
    fi
  elif [ "$IS_WSL" = true ]; then
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
      echo "  Windows Terminal not found."
      launch_manual
    fi
  else
    launch_manual
  fi
else
  echo "Skipping master launch (--no-launch)."
  launch_manual
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

echo "Active provider: $MAC10_AGENT_PROVIDER"
echo "Role models:     fast=$MAC10_FAST_MODEL deep=$MAC10_DEEP_MODEL economy=$MAC10_ECONOMY_MODEL"
echo "Worker/loop:     worker=$MAC10_WORKER_MODEL loop=$MAC10_LOOP_MODEL"
echo "Provider config: $PROVIDER_CONFIG_FILE"
echo ""
echo "3 Masters configured:"
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
