#!/usr/bin/env bash
# start-codex.sh — Start the mac10 multi-agent system using Codex as the provider.
#
# Usage:
#   bash start-codex.sh <project_dir> [num_workers]
#   bash start-codex.sh --stop <project_dir>
#   bash start-codex.sh --pause <project_dir>
set -euo pipefail

PROVIDER="codex"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
  cat <<'EOF'
Usage:
  bash start-codex.sh <project_dir> [num_workers]
  bash start-codex.sh --stop <project_dir>
  bash start-codex.sh --pause <project_dir>
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  print_usage
  exit 0
fi

# --- Handle --stop / --pause before requiring positional args ---
if [ "${1:-}" = "--stop" ] || [ "${1:-}" = "--pause" ]; then
  ACTION="$1"
  PROJECT_DIR="${2:?Usage: bash start-codex.sh $ACTION <project_dir>}"
  PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd || echo "$PROJECT_DIR")"
  NAMESPACE="${MAC10_NAMESPACE:-codex10}"
  CODEX_DIR="$PROJECT_DIR/.codex"
  CODEX10_CLI="$CODEX_DIR/scripts/codex10"
  # shellcheck disable=SC1091
  . "$SCRIPT_DIR/scripts/start-common.sh"
  if [ "$ACTION" = "--pause" ]; then
    mac10_pause_system
  else
    mac10_stop_system
  fi
  exit 0
fi

# --- Normal startup ---
PROJECT_DIR="${1:?Usage: bash start-codex.sh <project_dir> [num_workers]}"
NUM_WORKERS="${2:-4}"
MAX_WORKERS=8
NAMESPACE="${MAC10_NAMESPACE:-codex10}"

# Validate
if ! [[ "$NUM_WORKERS" =~ ^[0-9]+$ ]] || [ "$NUM_WORKERS" -lt 1 ]; then
  echo "ERROR: num_workers must be a positive integer (got: $NUM_WORKERS)"
  exit 1
fi
if [ "$NUM_WORKERS" -gt "$MAX_WORKERS" ]; then
  echo "ERROR: num_workers cannot exceed $MAX_WORKERS (got: $NUM_WORKERS)"
  exit 1
fi

PROJECT_DIR="$(cd "$PROJECT_DIR" 2>/dev/null && pwd || echo "$PROJECT_DIR")"

echo "========================================"
echo " mac10 Multi-Agent Setup (Codex)"
echo "========================================"
echo "Project:  $PROJECT_DIR"
echo "Workers:  $NUM_WORKERS"
echo "Provider: $PROVIDER"
echo ""

# shellcheck disable=SC1091
. "$SCRIPT_DIR/scripts/start-common.sh"

mac10_detect_environment
mac10_preflight_checks
mac10_install_coordinator
mac10_setup_directories
mac10_copy_templates
mac10_copy_scripts
mac10_setup_cli_wrappers
mac10_create_worktrees
mac10_add_trusted_directories
mac10_write_provider_config
mac10_start_coordinator
mac10_start_research_driver
mac10_launch_masters
mac10_print_status
mac10_print_banner
