#!/usr/bin/env bash
# Obvious operator entrypoint for this checkout.
# Equivalent to: bash start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/start.sh" "$@"
