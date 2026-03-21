#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/start-provider.sh <codex|claude> [project_dir] [num_workers]
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ "${2:-}" = "-h" ] || [ "${2:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ $# -lt 1 ] || [ $# -gt 3 ]; then
  usage >&2
  exit 1
fi

PROVIDER="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
case "$PROVIDER" in
  codex|claude) ;;
  *)
    echo "ERROR: provider must be 'codex' or 'claude' (got: $1)" >&2
    usage >&2
    exit 1
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="${2:-$REPO_ROOT}"
NUM_WORKERS="${3:-}"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: project directory not found: $PROJECT_DIR" >&2
  exit 1
fi

echo "Starting mac10 setup with provider='$PROVIDER' project='$PROJECT_DIR'${NUM_WORKERS:+ workers='$NUM_WORKERS'}"

if [ -n "$NUM_WORKERS" ]; then
  MAC10_FORCE_PROVIDER="$PROVIDER" bash "$REPO_ROOT/setup.sh" "$PROJECT_DIR" "$NUM_WORKERS"
else
  MAC10_FORCE_PROVIDER="$PROVIDER" bash "$REPO_ROOT/setup.sh" "$PROJECT_DIR"
fi
