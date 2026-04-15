#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/provider-utils.sh"

usage() {
  cat >&2 <<'EOF'
Usage:
  provider.sh list [project_dir]
  provider.sh catalog [project_dir]
  provider.sh current [project_dir]
  provider.sh health [provider] [project_dir]
  provider.sh output-schema [provider] [project_dir]
  provider.sh select <provider> [project_dir]
  provider.sh launch-dry-run <interactive|noninteractive> <project_dir> <model> <prompt_file>
  provider.sh validate [provider] [project_dir] [--runtime] [--json]
EOF
}

project_or_pwd() {
  local project_dir="${1:-$(pwd)}"
  cd "$project_dir" 2>/dev/null && pwd
}

command="${1:-}"
[ -n "$command" ] || { usage; exit 1; }
shift || true

case "$command" in
  list)
    project_dir="$(project_or_pwd "${1:-}")"
    while IFS= read -r provider_id; do
      [ -n "$provider_id" ] || continue
      manifest="$(mac10_provider_manifest_file "$provider_id" "$project_dir")"
      printf '%s\t%s\t%s\n' \
        "$provider_id" \
        "$(mac10_provider_display_name "$provider_id" "$project_dir")" \
        "$manifest"
    done < <(mac10_list_provider_ids "$project_dir")
    ;;
  catalog)
    project_dir="$(project_or_pwd "${1:-}")"
    mac10_list_provider_catalog "$project_dir"
    ;;
  current)
    project_dir="$(project_or_pwd "${1:-}")"
    mac10_load_provider_config "$project_dir"
    printf 'provider=%s\n' "$MAC10_AGENT_PROVIDER"
    printf 'cli=%s\n' "$(mac10_provider_cli)"
    printf 'manifest=%s\n' "$MAC10_PROVIDER_MANIFEST_FILE"
    printf 'worker_model=%s\n' "$MAC10_WORKER_MODEL"
    printf 'loop_model=%s\n' "$MAC10_LOOP_MODEL"
    ;;
  health)
    provider="${1:-}"
    project_arg="${2:-}"
    if [ -n "$provider" ] && [ -z "$project_arg" ] && [ -d "$provider" ]; then
      project_arg="$provider"
      provider=""
    fi
    project_dir="$(project_or_pwd "$project_arg")"
    provider="$(mac10_requested_provider_id "$project_dir" "$provider")"
    mac10_provider_health "$project_dir" "$provider"
    ;;
  output-schema)
    provider="${1:-}"
    project_arg="${2:-}"
    if [ -n "$provider" ] && [ -z "$project_arg" ] && [ -d "$provider" ]; then
      project_arg="$provider"
      provider=""
    fi
    project_dir="$(project_or_pwd "$project_arg")"
    provider="$(mac10_requested_provider_id "$project_dir" "$provider")"
    mac10_provider_output_schema "$project_dir" "$provider"
    ;;
  select)
    provider="${1:-}"
    [ -n "$provider" ] || { usage; exit 1; }
    project_dir="$(project_or_pwd "${2:-}")"
    provider="$(mac10_normalize_provider_id "$provider")"
    if ! mac10_provider_available "$provider" "$project_dir"; then
      echo "ERROR: provider is not installed or enabled: $provider" >&2
      exit 1
    fi
    config_file="$(mac10_provider_config_file "$project_dir")"
    mkdir -p "$(dirname "$config_file")"
    printf 'MAC10_AGENT_PROVIDER=%s\n' "$provider" > "$config_file"
    MAC10_AGENT_PROVIDER="$provider" mac10_load_provider_config "$project_dir"
    printf 'selected=%s\n' "$MAC10_AGENT_PROVIDER"
    printf 'config=%s\n' "$config_file"
    ;;
  launch-dry-run)
    mode="${1:-}"
    project_dir="$(project_or_pwd "${2:-}")"
    model="${3:-}"
    prompt_file="${4:-}"
    if [ "$mode" != "interactive" ] && [ "$mode" != "noninteractive" ]; then
      usage
      exit 1
    fi
    if [ -z "$model" ] || [ -z "$prompt_file" ]; then
      usage
      exit 1
    fi
    mac10_load_provider_config "$project_dir"
    resolved_model="$(mac10_resolve_role_model "$model")"
    if [ "$mode" = "interactive" ]; then
      MAC10_LAUNCH_DRY_RUN=1 mac10_run_interactive_prompt "$project_dir" "$prompt_file" "$resolved_model"
    else
      MAC10_LAUNCH_DRY_RUN=1 mac10_run_noninteractive_prompt "$project_dir" "$prompt_file" "$resolved_model"
    fi
    ;;
  validate)
    provider=""
    project_arg=""
    extra_args=()
    while [ $# -gt 0 ]; do
      case "$1" in
        --runtime|--json)
          extra_args+=("$1")
          shift
          ;;
        *)
          if [ -z "$provider" ] && [ ! -d "$1" ]; then
            provider="$1"
          elif [ -z "$project_arg" ]; then
            project_arg="$1"
          fi
          shift
          ;;
      esac
    done
    project_dir="$(project_or_pwd "$project_arg")"
    node_args=("$SCRIPT_DIR/../coordinator/bin/provider-validate.js" "--project-dir" "$project_dir")
    if [ -n "$provider" ]; then
      node_args+=("--provider" "$provider")
    fi
    if [ ${#extra_args[@]} -gt 0 ]; then
      node_args+=("${extra_args[@]}")
    fi
    node "${node_args[@]}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
