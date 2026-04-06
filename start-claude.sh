#!/usr/bin/env bash
set -euo pipefail

if ! ./.claude/scripts/codex10 ping >/dev/null 2>&1; then
  echo "ERROR: coordinator unreachable" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/start-common.sh" claude "$@"
