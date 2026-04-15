#!/usr/bin/env bash
# Provider-neutral operator entrypoint.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/provider-utils.sh"

PROVIDER_INPUT="${MAC10_AGENT_PROVIDER:-}"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --provider)
      PROVIDER_INPUT="${2:?Missing value for --provider}"
      shift 2
      ;;
    --provider=*)
      PROVIDER_INPUT="${1#--provider=}"
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

set -- "${ARGS[@]}"

if [ "${1:-}" = "--stop" ] || [ "${1:-}" = "--pause" ]; then
  PROJECT_DIR="${2:-$SCRIPT_DIR}"
else
  PROJECT_DIR="${1:-$SCRIPT_DIR}"
fi
if [ ! -d "$PROJECT_DIR" ]; then
  PROJECT_DIR="$SCRIPT_DIR"
fi
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

if [ -z "$PROVIDER_INPUT" ]; then
  CONFIG_FILE="$(mac10_provider_config_file "$PROJECT_DIR")"
  if [ -f "$CONFIG_FILE" ]; then
    # shellcheck disable=SC1090
    . "$CONFIG_FILE"
    PROVIDER_INPUT="${MAC10_AGENT_PROVIDER:-}"
  fi
fi

if [ -n "$PROVIDER_INPUT" ]; then
  PROVIDER="$(mac10_normalize_provider_id "$PROVIDER_INPUT")"
else
  PROVIDER="$(mac10_default_provider_id "$PROJECT_DIR")"
fi
MAC10_AGENT_PROVIDER="$PROVIDER" exec bash "$SCRIPT_DIR/scripts/start-provider.sh" "$PROVIDER" "$@"
