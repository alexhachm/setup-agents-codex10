#!/usr/bin/env bash

mac10_provider_config_file() {
  local project_dir="$1"
  printf '%s/.claude/state/agent-launcher.env' "$project_dir"
}

mac10_normalize_provider_id() {
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]'
}

mac10_provider_plugin_roots() {
  local project_dir="${1:-}"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  {
    [ -n "${MAC10_PROVIDER_PLUGIN_ROOT:-}" ] && printf '%s\n' "$MAC10_PROVIDER_PLUGIN_ROOT"
    [ -n "${MAC10_SCRIPT_DIR:-}" ] && printf '%s/plugins/agents\n' "$MAC10_SCRIPT_DIR"
    [ -n "$project_dir" ] && printf '%s/plugins/agents\n' "$project_dir"
    printf '%s/plugins/agents\n' "$(cd "$script_dir/.." && pwd)"
    printf '%s/plugins/agents\n' "$(cd "$script_dir/../.." && pwd)"
  } | awk 'NF && !seen[$0]++'
}

mac10_provider_manifest_file() {
  local provider
  local project_dir="${2:-}"
  local root
  local candidate
  provider="$(mac10_normalize_provider_id "$1")"

  while IFS= read -r root; do
    candidate="$root/$provider/plugin.json"
    if [ -f "$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done < <(mac10_provider_plugin_roots "$project_dir")

  return 1
}

mac10_json_field() {
  local file="$1"
  local field_path="$2"
  local fallback="${3:-}"

  if [ ! -f "$file" ]; then
    printf '%s' "$fallback"
    return 0
  fi

  node - "$file" "$field_path" "$fallback" <<'NODE'
const fs = require('fs');
const [file, fieldPath, fallback = ''] = process.argv.slice(2);
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  process.stdout.write(fallback);
  process.exit(0);
}
let value = data;
for (const part of fieldPath.split('.').filter(Boolean)) {
  if (value && Object.prototype.hasOwnProperty.call(value, part)) {
    value = value[part];
  } else {
    value = undefined;
    break;
  }
}
if (value === undefined || value === null) {
  process.stdout.write(fallback);
} else if (Array.isArray(value)) {
  process.stdout.write(value.join(' '));
} else if (typeof value === 'object') {
  process.stdout.write(JSON.stringify(value));
} else {
  process.stdout.write(String(value));
}
NODE
}

mac10_template_array_nul() {
  local file="$1"
  local field_path="$2"

  if [ ! -f "$file" ]; then
    return 1
  fi

  node - "$file" "$field_path" <<'NODE'
const fs = require('fs');
const [file, fieldPath] = process.argv.slice(2);
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`invalid provider manifest JSON: ${err.message}`);
  process.exit(1);
}
function get(path) {
  let value = data;
  for (const part of path.split('.').filter(Boolean)) {
    if (value && Object.prototype.hasOwnProperty.call(value, part)) {
      value = value[part];
    } else {
      return undefined;
    }
  }
  return value;
}
const value = get(fieldPath);
if (!Array.isArray(value)) {
  console.error(`provider manifest field must be an array: ${fieldPath}`);
  process.exit(1);
}
const vars = {
  MODEL: process.env.MAC10_TEMPLATE_MODEL || '',
  PROMPT_TEXT: process.env.MAC10_TEMPLATE_PROMPT_TEXT || '',
  PROMPT_FILE: process.env.MAC10_TEMPLATE_PROMPT_FILE || '',
  PROJECT_DIR: process.env.MAC10_TEMPLATE_PROJECT_DIR || '',
  WORKTREE_DIR: process.env.MAC10_TEMPLATE_WORKTREE_DIR || '',
  PROVIDER_ID: process.env.MAC10_AGENT_PROVIDER || '',
  CLI: process.env.MAC10_PROVIDER_CLI || '',
};
function substitute(raw) {
  return String(raw).replace(/\$\{([A-Z0-9_]+)\}|\$([A-Z0-9_]+)/g, (match, braced, bare) => {
    const key = braced || bare;
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
for (const item of value) {
  if (item === undefined || item === null) continue;
  process.stdout.write(substitute(item));
  process.stdout.write('\0');
}
NODE
}

mac10_provider_env_ops_nul() {
  local file="$1"

  if [ ! -f "$file" ]; then
    return 1
  fi

  node - "$file" <<'NODE'
const fs = require('fs');
const [file] = process.argv.slice(2);
let data;
try {
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
  console.error(`invalid provider manifest JSON: ${err.message}`);
  process.exit(1);
}
const env = data.environment || {};
const set = env.set && typeof env.set === 'object' && !Array.isArray(env.set) ? env.set : {};
const unset = Array.isArray(env.unset) ? env.unset : [];
const nameRe = /^[A-Za-z_][A-Za-z0-9_]*$/;
const vars = {
  PROJECT_DIR: process.env.MAC10_TEMPLATE_PROJECT_DIR || '',
  WORKTREE_DIR: process.env.MAC10_TEMPLATE_WORKTREE_DIR || '',
  PROVIDER_ID: process.env.MAC10_AGENT_PROVIDER || '',
  CLI: process.env.MAC10_PROVIDER_CLI || '',
};
function substitute(raw) {
  return String(raw).replace(/\$\{([A-Z0-9_]+)\}|\$([A-Z0-9_]+)/g, (match, braced, bare) => {
    const key = braced || bare;
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
function emit(...parts) {
  for (const part of parts) {
    process.stdout.write(String(part));
    process.stdout.write('\0');
  }
}
for (const rawName of unset) {
  const name = String(rawName);
  if (!nameRe.test(name)) {
    console.error(`invalid provider environment variable name: ${name}`);
    process.exit(1);
  }
  emit('unset', name);
}
for (const [rawName, rawValue] of Object.entries(set)) {
  const name = String(rawName);
  if (!nameRe.test(name)) {
    console.error(`invalid provider environment variable name: ${name}`);
    process.exit(1);
  }
  emit('set', name, substitute(rawValue));
}
NODE
}

mac10_provider_available() {
  local provider="$1"
  local project_dir="${2:-}"
  local manifest
  local enabled

  manifest="$(mac10_provider_manifest_file "$provider" "$project_dir" 2>/dev/null || true)"
  [ -n "$manifest" ] || return 1
  enabled="$(mac10_json_field "$manifest" enabled true)"
  [ "$enabled" != "false" ]
}

mac10_list_provider_ids() {
  local project_dir="${1:-}"
  local root
  local manifest
  local id

  while IFS= read -r root; do
    [ -d "$root" ] || continue
    for manifest in "$root"/*/plugin.json; do
      [ -f "$manifest" ] || continue
      id="$(mac10_json_field "$manifest" id "$(basename "$(dirname "$manifest")")")"
      if mac10_provider_available "$id" "$project_dir"; then
        printf '%s\n' "$id"
      fi
    done
  done < <(mac10_provider_plugin_roots "$project_dir") | awk 'NF && !seen[$0]++'
}

mac10_list_provider_catalog() {
  local project_dir="${1:-}"
  local root
  local manifest
  local id
  local enabled
  local display

  while IFS= read -r root; do
    [ -d "$root" ] || continue
    for manifest in "$root"/*/plugin.json; do
      [ -f "$manifest" ] || continue
      id="$(mac10_json_field "$manifest" id "$(basename "$(dirname "$manifest")")")"
      enabled="$(mac10_json_field "$manifest" enabled true)"
      display="$(mac10_json_field "$manifest" display_name "$id")"
      printf '%s\t%s\t%s\t%s\n' "$id" "$enabled" "$display" "$manifest"
    done
  done < <(mac10_provider_plugin_roots "$project_dir") | awk -F '\t' 'NF && !seen[$1]++'
}

mac10_default_provider_id() {
  local project_dir="${1:-${MAC10_PROVIDER_PROJECT_DIR:-}}"
  local configured
  local first

  configured="$(mac10_normalize_provider_id "${MAC10_DEFAULT_AGENT_PROVIDER:-}")"
  if [ -n "$configured" ] && mac10_provider_available "$configured" "$project_dir"; then
    printf '%s' "$configured"
    return 0
  fi

  first="$(mac10_list_provider_ids "$project_dir" | head -n 1 || true)"
  if [ -n "$first" ]; then
    printf '%s' "$first"
    return 0
  fi

  printf 'claude'
}

mac10_requested_provider_id() {
  local project_dir="${1:-${MAC10_PROVIDER_PROJECT_DIR:-}}"
  local requested="${2:-${MAC10_AGENT_PROVIDER:-}}"

  requested="$(mac10_normalize_provider_id "$requested")"
  if [ -n "$requested" ]; then
    printf '%s' "$requested"
    return 0
  fi

  mac10_default_provider_id "$project_dir"
}

mac10_provider_display_name() {
  local provider="$1"
  local project_dir="${2:-${MAC10_PROVIDER_PROJECT_DIR:-}}"
  local manifest
  manifest="$(mac10_provider_manifest_file "$provider" "$project_dir" 2>/dev/null || true)"
  mac10_json_field "$manifest" display_name "$provider"
}

mac10_current_provider_manifest_file() {
  local provider
  local project_dir="${MAC10_PROVIDER_PROJECT_DIR:-}"
  provider="$(mac10_requested_provider_id "$project_dir" "${1:-${MAC10_AGENT_PROVIDER:-}}")"
  if [ -n "${MAC10_PROVIDER_MANIFEST_FILE:-}" ] && [ -f "$MAC10_PROVIDER_MANIFEST_FILE" ]; then
    if [ "$(mac10_json_field "$MAC10_PROVIDER_MANIFEST_FILE" id "$provider")" = "$provider" ]; then
      printf '%s' "$MAC10_PROVIDER_MANIFEST_FILE"
      return 0
    fi
  fi
  mac10_provider_manifest_file "$provider" "$project_dir"
}

mac10_default_model() {
  local provider="$1"
  local model_key="$2"
  local fallback="$3"
  local manifest
  manifest="$(mac10_current_provider_manifest_file "$provider" 2>/dev/null || true)"
  mac10_json_field "$manifest" "models.$model_key" "$fallback"
}

mac10_default_fast_model() {
  mac10_default_model "$1" fast "sonnet"
}

mac10_default_deep_model() {
  mac10_default_model "$1" deep "opus"
}

mac10_default_economy_model() {
  mac10_default_model "$1" economy "haiku"
}

mac10_load_provider_config() {
  local project_dir="$1"
  local config_file
  local requested_provider="${MAC10_AGENT_PROVIDER:-}"
  local previous_loaded_provider="${MAC10_PROVIDER_LOADED_PROVIDER:-}"
  config_file="$(mac10_provider_config_file "$project_dir")"

  if [ -f "$config_file" ]; then
    # shellcheck disable=SC1090
    . "$config_file"
  fi

  if [ -n "$requested_provider" ]; then
    MAC10_AGENT_PROVIDER="$requested_provider"
  fi

  MAC10_AGENT_PROVIDER="$(mac10_requested_provider_id "$project_dir" "${MAC10_AGENT_PROVIDER:-}")"
  if ! mac10_provider_available "$MAC10_AGENT_PROVIDER" "$project_dir"; then
    echo "ERROR: Unsupported MAC10_AGENT_PROVIDER: $MAC10_AGENT_PROVIDER (provider plugin not found or disabled)" >&2
    return 1
  fi

  if [ -n "$previous_loaded_provider" ] && [ "$previous_loaded_provider" != "$MAC10_AGENT_PROVIDER" ]; then
    unset MAC10_FAST_MODEL
    unset MAC10_DEEP_MODEL
    unset MAC10_ECONOMY_MODEL
    unset MAC10_WORKER_MODEL
    unset MAC10_LOOP_MODEL
  fi

  MAC10_PROVIDER_PROJECT_DIR="$project_dir"
  MAC10_PROVIDER_MANIFEST_FILE="$(mac10_provider_manifest_file "$MAC10_AGENT_PROVIDER" "$project_dir")"
  MAC10_PROVIDER_CLI="$(mac10_json_field "$MAC10_PROVIDER_MANIFEST_FILE" cli.command "$MAC10_AGENT_PROVIDER")"
  MAC10_PROVIDER_LOADED_PROVIDER="$MAC10_AGENT_PROVIDER"

  : "${MAC10_FAST_MODEL:=$(mac10_default_fast_model "$MAC10_AGENT_PROVIDER")}"
  : "${MAC10_DEEP_MODEL:=$(mac10_default_deep_model "$MAC10_AGENT_PROVIDER")}"
  : "${MAC10_ECONOMY_MODEL:=$(mac10_default_economy_model "$MAC10_AGENT_PROVIDER")}"
  : "${MAC10_WORKER_MODEL:=$(mac10_json_field "$MAC10_PROVIDER_MANIFEST_FILE" models.worker "$MAC10_FAST_MODEL")}"
  : "${MAC10_LOOP_MODEL:=$(mac10_json_field "$MAC10_PROVIDER_MANIFEST_FILE" models.loop "$MAC10_DEEP_MODEL")}"

  export MAC10_AGENT_PROVIDER
  export MAC10_PROVIDER_PROJECT_DIR
  export MAC10_PROVIDER_MANIFEST_FILE
  export MAC10_PROVIDER_LOADED_PROVIDER
  export MAC10_PROVIDER_CLI
  export MAC10_FAST_MODEL
  export MAC10_DEEP_MODEL
  export MAC10_ECONOMY_MODEL
  export MAC10_WORKER_MODEL
  export MAC10_LOOP_MODEL
}

mac10_provider_cli() {
  if [ -n "${MAC10_PROVIDER_CLI:-}" ]; then
    printf '%s' "$MAC10_PROVIDER_CLI"
    return 0
  fi

  local provider
  local manifest
  provider="$(mac10_requested_provider_id "${MAC10_PROVIDER_PROJECT_DIR:-}" "${MAC10_AGENT_PROVIDER:-}")"
  manifest="$(mac10_current_provider_manifest_file "$provider" 2>/dev/null || true)"
  mac10_json_field "$manifest" cli.command "$provider"
}

mac10_provider_auth_check() {
  local project_dir="${1:-${MAC10_PROVIDER_PROJECT_DIR:-}}"
  local provider
  local manifest
  local auth_command
  local args_file
  local -a auth_args=()

  provider="$(mac10_requested_provider_id "$project_dir" "${2:-${MAC10_AGENT_PROVIDER:-}}")"
  manifest="$(mac10_provider_manifest_file "$provider" "$project_dir" 2>/dev/null || true)"
  if [ -z "$manifest" ]; then
    echo "ERROR: Provider manifest not found for $provider" >&2
    return 1
  fi

  auth_command="$(mac10_json_field "$manifest" cli.auth_check.command "$(mac10_json_field "$manifest" cli.command "$provider")")"
  if [ -z "$auth_command" ]; then
    echo "ERROR: Provider $provider has no cli.command or cli.auth_check.command" >&2
    return 1
  fi
  if ! command -v "$auth_command" >/dev/null 2>&1; then
    echo "ERROR: Provider CLI not found on PATH: $auth_command" >&2
    return 1
  fi

  args_file="$(mktemp)"
  if MAC10_TEMPLATE_PROJECT_DIR="$project_dir" \
      MAC10_TEMPLATE_WORKTREE_DIR="$project_dir" \
      mac10_template_array_nul "$manifest" cli.auth_check.args > "$args_file" 2>/dev/null; then
    mapfile -d '' -t auth_args < "$args_file"
  fi
  rm -f "$args_file"

  "$auth_command" "${auth_args[@]}" >/dev/null 2>&1
}

mac10_provider_health() {
  local project_dir="${1:-${MAC10_PROVIDER_PROJECT_DIR:-}}"
  local provider
  local manifest
  local cli
  local status=0

  provider="$(mac10_requested_provider_id "$project_dir" "${2:-${MAC10_AGENT_PROVIDER:-}}")"
  manifest="$(mac10_provider_manifest_file "$provider" "$project_dir" 2>/dev/null || true)"
  if [ -z "$manifest" ]; then
    echo "provider=$provider"
    echo "manifest=missing"
    return 1
  fi

  cli="$(mac10_json_field "$manifest" cli.command "$provider")"
  echo "provider=$provider"
  echo "display_name=$(mac10_json_field "$manifest" display_name "$provider")"
  echo "manifest=$manifest"
  echo "cli=$cli"

  if command -v "$cli" >/dev/null 2>&1; then
    echo "cli_available=true"
  else
    echo "cli_available=false"
    status=1
  fi

  if mac10_provider_auth_check "$project_dir" "$provider"; then
    echo "auth_check=pass"
  else
    echo "auth_check=fail"
    status=1
  fi

  return "$status"
}

mac10_provider_output_schema() {
  local project_dir="${1:-${MAC10_PROVIDER_PROJECT_DIR:-}}"
  local provider
  local manifest

  provider="$(mac10_requested_provider_id "$project_dir" "${2:-${MAC10_AGENT_PROVIDER:-}}")"
  manifest="$(mac10_provider_manifest_file "$provider" "$project_dir" 2>/dev/null || true)"
  if [ -z "$manifest" ]; then
    echo "ERROR: Provider manifest not found for $provider" >&2
    return 1
  fi

  mac10_json_field "$manifest" output.usage "{}"
}

mac10_resolve_role_model() {
  local alias="$1"
  case "$alias" in
    fast|sonnet) printf '%s' "${MAC10_FAST_MODEL:-}" ;;
    deep|opus) printf '%s' "${MAC10_DEEP_MODEL:-}" ;;
    economy|haiku) printf '%s' "${MAC10_ECONOMY_MODEL:-}" ;;
    worker) printf '%s' "${MAC10_WORKER_MODEL:-${MAC10_FAST_MODEL:-}}" ;;
    loop) printf '%s' "${MAC10_LOOP_MODEL:-${MAC10_DEEP_MODEL:-}}" ;;
    *)
      printf '%s' "$alias"
      ;;
  esac
}

mac10_strip_front_matter() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "ERROR: Prompt file not found: $file" >&2
    return 1
  fi
  if head -1 "$file" | grep -q '^---'; then
    awk 'BEGIN{in_fm=1; seen=0} /^---\r?$/{seen++; if (seen == 2) {in_fm=0; next} next} !in_fm { print }' "$file"
  else
    cat "$file"
  fi
}

mac10_resolve_prompt_file() {
  local project_dir="$1"
  local slash_cmd="$2"
  local template_root="$3"
  local name="${slash_cmd#/}"
  local candidate

  candidate="$project_dir/.claude/commands/${name}.md"
  if [ -f "$candidate" ]; then
    printf '%s' "$candidate"
    return 0
  fi

  candidate="$template_root/templates/commands/${name}.md"
  if [ -f "$candidate" ]; then
    printf '%s' "$candidate"
    return 0
  fi

  return 1
}

mac10_prepare_cli_env() {
  local worktree_dir="$1"
  local provider
  local manifest
  local ops_file
  local -a env_ops=()
  local i=0
  local op
  local name
  local value

  provider="$(mac10_requested_provider_id "${MAC10_PROVIDER_PROJECT_DIR:-$worktree_dir}" "${MAC10_AGENT_PROVIDER:-}")"
  manifest="$(mac10_current_provider_manifest_file "$provider" 2>/dev/null || true)"

  if [ -n "$manifest" ]; then
    ops_file="$(mktemp)"
    if MAC10_TEMPLATE_PROJECT_DIR="$worktree_dir" \
        MAC10_TEMPLATE_WORKTREE_DIR="$worktree_dir" \
        mac10_provider_env_ops_nul "$manifest" > "$ops_file"; then
      mapfile -d '' -t env_ops < "$ops_file"
    fi
    rm -f "$ops_file"
  fi

  while [ "$i" -lt "${#env_ops[@]}" ]; do
    op="${env_ops[$i]}"
    i=$((i + 1))
    case "$op" in
      set)
        name="${env_ops[$i]:-}"
        value="${env_ops[$((i + 1))]:-}"
        i=$((i + 2))
        export "$name=$value"
        ;;
      unset)
        name="${env_ops[$i]:-}"
        i=$((i + 1))
        unset "$name" 2>/dev/null || true
        ;;
      *)
        echo "ERROR: Unknown provider environment operation: $op" >&2
        return 1
        ;;
    esac
  done

  # Compatibility fallback for older Claude manifests.
  if [ "$provider" = "claude" ] && [ "${#env_ops[@]}" -eq 0 ]; then
    unset CLAUDECODE 2>/dev/null || true
    export CLAUDE_PROJECT_DIR="$worktree_dir"
  fi
}

mac10_provider_launch_args() {
  local mode="$1"
  local worktree_dir="$2"
  local prompt_file="$3"
  local model="$4"
  local prompt_text="$5"
  local provider
  local manifest
  local field_path

  provider="$(mac10_requested_provider_id "${MAC10_PROVIDER_PROJECT_DIR:-$worktree_dir}" "${MAC10_AGENT_PROVIDER:-}")"
  manifest="$(mac10_current_provider_manifest_file "$provider" 2>/dev/null || true)"
  if [ -z "$manifest" ]; then
    echo "ERROR: Provider manifest not found for $provider" >&2
    return 1
  fi

  field_path="launch.${mode}.args"
  MAC10_TEMPLATE_MODEL="$model" \
    MAC10_TEMPLATE_PROMPT_TEXT="$prompt_text" \
    MAC10_TEMPLATE_PROMPT_FILE="$prompt_file" \
    MAC10_TEMPLATE_PROJECT_DIR="$worktree_dir" \
    MAC10_TEMPLATE_WORKTREE_DIR="$worktree_dir" \
    mac10_template_array_nul "$manifest" "$field_path"
}

mac10_run_interactive_prompt() {
  local project_dir="$1"
  local prompt_file="$2"
  local model="$3"
  local cli
  local args_file
  local -a launch_args=()
  cli="$(mac10_provider_cli)"
  mac10_prepare_cli_env "$project_dir"

  local prompt_text
  prompt_text="$(mac10_strip_front_matter "$prompt_file")" || return 1
  args_file="$(mktemp)"
  if ! mac10_provider_launch_args interactive "$project_dir" "$prompt_file" "$model" "$prompt_text" > "$args_file"; then
    rm -f "$args_file"
    return 1
  fi
  mapfile -d '' -t launch_args < "$args_file"
  rm -f "$args_file"
  if [ "${MAC10_LAUNCH_DRY_RUN:-0}" = "1" ]; then
    printf 'provider=%s cli=%s mode=interactive model=%s prompt=%s cwd=%s args=%s\n' \
      "${MAC10_AGENT_PROVIDER:-$(mac10_requested_provider_id "$project_dir" "")}" "$cli" "$model" "$prompt_file" "$project_dir" "${#launch_args[@]}"
    return 0
  fi
  cd "$project_dir" || return 1
  "$cli" "${launch_args[@]}"
}

mac10_run_noninteractive_prompt() {
  local worktree_dir="$1"
  local prompt_file="$2"
  local model="$3"
  local cli
  local args_file
  local -a launch_args=()
  cli="$(mac10_provider_cli)"
  mac10_prepare_cli_env "$worktree_dir"

  local prompt_body
  prompt_body="$(mac10_strip_front_matter "$prompt_file")" || return 1
  if [ -z "$prompt_body" ]; then
    echo "ERROR: Prompt body is empty for $prompt_file" >&2
    return 1
  fi
  args_file="$(mktemp)"
  if ! mac10_provider_launch_args noninteractive "$worktree_dir" "$prompt_file" "$model" "$prompt_body" > "$args_file"; then
    rm -f "$args_file"
    return 1
  fi
  mapfile -d '' -t launch_args < "$args_file"
  rm -f "$args_file"
  if [ "${MAC10_LAUNCH_DRY_RUN:-0}" = "1" ]; then
    printf 'provider=%s cli=%s mode=exec model=%s prompt=%s cwd=%s args=%s\n' \
      "${MAC10_AGENT_PROVIDER:-$(mac10_requested_provider_id "$worktree_dir" "")}" "$cli" "$model" "$prompt_file" "$worktree_dir" "${#launch_args[@]}"
    return 0
  fi
  cd "$worktree_dir" || return 1
  "$cli" "${launch_args[@]}"
}
