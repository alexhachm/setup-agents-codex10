#!/usr/bin/env bash
set -euo pipefail

# Pre-flight ping: verify coordinator is reachable before launching workers.
# Skip for --help so usage text is always available.
if [ "${1:-}" != "-h" ] && [ "${1:-}" != "--help" ]; then
  if ! ./.claude/scripts/mac10 ping >/dev/null 2>&1; then
    echo "ERROR: coordinator unreachable" >&2
    exit 1
  fi
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/start-common.sh" claude "$@"
