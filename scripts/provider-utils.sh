#!/usr/bin/env bash

mac10_provider_config_file() {
  local project_dir="$1"
  printf '%s/.codex/state/agent-launcher.env' "$project_dir"
}

mac10_default_fast_model() {
  case "$1" in
    claude) printf '%s' "sonnet" ;;
    *) printf '%s' "gpt-5.3-codex" ;;
  esac
}

mac10_default_deep_model() {
  case "$1" in
    claude) printf '%s' "opus" ;;
    *) printf '%s' "gpt-5.3-codex" ;;
  esac
}

mac10_default_economy_model() {
  case "$1" in
    claude) printf '%s' "haiku" ;;
    *) printf '%s' "gpt-5.1-codex-mini" ;;
  esac
}

mac10_load_provider_config() {
  local project_dir="$1"
  local config_file
  config_file="$(mac10_provider_config_file "$project_dir")"

  MAC10_AGENT_PROVIDER="${MAC10_AGENT_PROVIDER:-codex}"
  if [ -f "$config_file" ]; then
    # shellcheck disable=SC1090
    . "$config_file"
  fi

  MAC10_AGENT_PROVIDER="$(printf '%s' "${MAC10_AGENT_PROVIDER:-codex}" | tr '[:upper:]' '[:lower:]')"
  case "$MAC10_AGENT_PROVIDER" in
    codex|claude) ;;
    *)
      echo "ERROR: Unsupported MAC10_AGENT_PROVIDER: $MAC10_AGENT_PROVIDER" >&2
      return 1
      ;;
  esac

  : "${MAC10_FAST_MODEL:=$(mac10_default_fast_model "$MAC10_AGENT_PROVIDER")}"
  : "${MAC10_DEEP_MODEL:=$(mac10_default_deep_model "$MAC10_AGENT_PROVIDER")}"
  : "${MAC10_ECONOMY_MODEL:=$(mac10_default_economy_model "$MAC10_AGENT_PROVIDER")}"
  : "${MAC10_WORKER_MODEL:=$MAC10_FAST_MODEL}"
  : "${MAC10_LOOP_MODEL:=$MAC10_DEEP_MODEL}"

  export MAC10_AGENT_PROVIDER
  export MAC10_FAST_MODEL
  export MAC10_DEEP_MODEL
  export MAC10_ECONOMY_MODEL
  export MAC10_WORKER_MODEL
  export MAC10_LOOP_MODEL
}

mac10_provider_cli() {
  if [ "${MAC10_AGENT_PROVIDER:-codex}" = "claude" ]; then
    printf '%s' "claude"
  else
    printf '%s' "codex"
  fi
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

  candidate="$project_dir/.codex/commands-codex10/${name}.md"
  if [ -f "$candidate" ]; then
    printf '%s' "$candidate"
    return 0
  fi

  candidate="$project_dir/.codex/commands/${name}.md"
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
  local project_dir="$1"
  # Allow standalone agent launches even when called from within a Claude Code session
  unset CLAUDECODE 2>/dev/null || true
  if [ "${MAC10_AGENT_PROVIDER:-codex}" = "claude" ]; then
    export CLAUDE_PROJECT_DIR="$project_dir"
    unset CODEX_PROJECT_DIR 2>/dev/null || true
  else
    export CODEX_PROJECT_DIR="$project_dir"
    unset CLAUDE_PROJECT_DIR 2>/dev/null || true
  fi
}

mac10_run_interactive_prompt() {
  local project_dir="$1"
  local prompt_file="$2"
  local model="$3"
  local cli
  cli="$(mac10_provider_cli)"
  mac10_prepare_cli_env "$project_dir"

  if [ "${MAC10_LAUNCH_DRY_RUN:-0}" = "1" ]; then
    printf 'provider=%s cli=%s mode=interactive model=%s prompt=%s cwd=%s\n' \
      "${MAC10_AGENT_PROVIDER:-codex}" "$cli" "$model" "$prompt_file" "$project_dir"
    return 0
  fi

  if [ "$cli" = "claude" ]; then
    local prompt_text
    prompt_text="$(mac10_strip_front_matter "$prompt_file")" || return 1
    cd "$project_dir" || return 1
    claude --dangerously-skip-permissions --model "$model" -- "$prompt_text"
  else
    codex --dangerously-bypass-approvals-and-sandbox -m "$model" -C "$project_dir" -- "$(cat "$prompt_file")"
  fi
}

mac10_run_noninteractive_prompt() {
  local worktree_dir="$1"
  local prompt_file="$2"
  local model="$3"
  local cli
  cli="$(mac10_provider_cli)"
  mac10_prepare_cli_env "$worktree_dir"

  if [ "${MAC10_LAUNCH_DRY_RUN:-0}" = "1" ]; then
    printf 'provider=%s cli=%s mode=exec model=%s prompt=%s cwd=%s\n' \
      "${MAC10_AGENT_PROVIDER:-codex}" "$cli" "$model" "$prompt_file" "$worktree_dir"
    return 0
  fi

  if [ "$cli" = "claude" ]; then
    local prompt_body
    prompt_body="$(mac10_strip_front_matter "$prompt_file")" || return 1
    if [ -z "$prompt_body" ]; then
      echo "ERROR: Prompt body is empty for $prompt_file" >&2
      return 1
    fi
    cd "$worktree_dir" || return 1
    claude -p "$prompt_body" \
      --dangerously-skip-permissions \
      --model "$model" \
      --no-session-persistence
  else
    codex exec --dangerously-bypass-approvals-and-sandbox -m "$model" -C "$worktree_dir" - < "$prompt_file"
  fi
}
