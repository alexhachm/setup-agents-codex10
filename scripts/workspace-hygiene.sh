#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_DIR="${PWD}"
MODE="status"
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --project)
      PROJECT_DIR="${2:?Missing value for --project}"
      shift 2
      ;;
    --mode)
      MODE="${2:?Missing value for --mode}"
      shift 2
      ;;
    --quiet)
      QUIET=1
      shift
      ;;
    *)
      echo "Usage: workspace-hygiene.sh [--project <dir>] [--mode <status|startup|manual>] [--quiet]" >&2
      exit 1
      ;;
  esac
done

CMD=(node "$REPO_ROOT/coordinator/src/workspace-hygiene.js" --project "$PROJECT_DIR" --mode "$MODE")
if [ "$QUIET" -eq 1 ]; then
  CMD+=(--quiet)
fi

exec "${CMD[@]}"
