#!/usr/bin/env bash
# knowledge-score.sh — compute quality scores for knowledge files from signal logs
#
# Usage:
#   knowledge-score.sh                    # score all files
#   knowledge-score.sh <file-path>        # score a specific file
#   knowledge-score.sh --top N            # show top N files
#   knowledge-score.sh --bottom N         # show bottom N files (prune candidates)
#
# Scoring formula:
#   score = uses + (upvotes * 2) - (downvotes * 2) - staleness_penalty
#   staleness_penalty = floor(days_since_last_verified / 7)

set -euo pipefail

KNOWLEDGE_DIR="$(cd "$(dirname "$0")/../knowledge" && pwd)"
SIGNALS_DIR="$KNOWLEDGE_DIR/signals/uses"

# Parse args
TARGET=""
MODE="all"
LIMIT=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --top)   MODE="top";    LIMIT="${2:-10}"; shift 2 ;;
    --bottom) MODE="bottom"; LIMIT="${2:-10}"; shift 2 ;;
    *)       TARGET="$1";   MODE="single";    shift ;;
  esac
done

# Collect all signal files
if [ ! -d "$SIGNALS_DIR" ] || [ -z "$(ls -A "$SIGNALS_DIR" 2>/dev/null)" ]; then
  echo "No signal data yet. Scores require agents to emit signals to $SIGNALS_DIR/"
  exit 0
fi

# Count uses and votes per file
count_signals() {
  local file_pattern="$1"
  local uses=0
  local upvotes=0
  local downvotes=0

  for sig in "$SIGNALS_DIR"/*.md; do
    [ -f "$sig" ] || continue
    local u v_up v_down
    # Count "used:" lines mentioning this file
    u=$(grep -c "used:.*${file_pattern}" "$sig" 2>/dev/null || true)
    # Count "+1" votes
    v_up=$(grep -c "vote: .*${file_pattern}.* +1" "$sig" 2>/dev/null || true)
    # Count "-1" votes
    v_down=$(grep -c "vote: .*${file_pattern}.* -1" "$sig" 2>/dev/null || true)
    # Strip non-numeric chars (\r, spaces, etc.) to prevent arithmetic errors
    u="${u//[!0-9]/}"; u="${u:-0}"
    v_up="${v_up//[!0-9]/}"; v_up="${v_up:-0}"
    v_down="${v_down//[!0-9]/}"; v_down="${v_down:-0}"
    uses=$((uses + u))
    upvotes=$((upvotes + v_up))
    downvotes=$((downvotes + v_down))
  done

  echo "$uses $upvotes $downvotes"
}

# Get staleness penalty from frontmatter last_verified
staleness_penalty() {
  local file="$1"
  local last_verified
  last_verified=$(grep -m1 "^last_verified:" "$file" 2>/dev/null | sed 's/last_verified: *//' | tr -d ' \r\n')
  if [ -z "$last_verified" ]; then
    echo 4  # default penalty if no date
    return
  fi
  local verified_epoch
  verified_epoch=$(date -d "$last_verified" +%s 2>/dev/null || echo 0)
  verified_epoch="${verified_epoch//[!0-9]/}"; verified_epoch="${verified_epoch:-0}"
  local now_epoch
  now_epoch=$(date +%s)
  local days_stale=$(( (now_epoch - verified_epoch) / 86400 ))
  echo $(( days_stale / 7 ))
}

# Score a single file
score_file() {
  local filepath="$1"
  local relpath="${filepath#$KNOWLEDGE_DIR/}"
  local signals
  signals=$(count_signals "$relpath")
  local uses=$(echo "$signals" | cut -d' ' -f1)
  local upvotes=$(echo "$signals" | cut -d' ' -f2)
  local downvotes=$(echo "$signals" | cut -d' ' -f3)
  local penalty
  penalty=$(staleness_penalty "$filepath")
  local score=$(( uses + (upvotes * 2) - (downvotes * 2) - penalty ))
  echo "$score $uses $upvotes $downvotes $penalty $relpath"
}

# Run scoring
if [ "$MODE" = "single" ]; then
  if [ -f "$TARGET" ]; then
    score_file "$TARGET"
  elif [ -f "$KNOWLEDGE_DIR/$TARGET" ]; then
    score_file "$KNOWLEDGE_DIR/$TARGET"
  else
    echo "File not found: $TARGET"
    exit 1
  fi
else
  # Score all knowledge files (handbook + domains + research rollups)
  {
    find "$KNOWLEDGE_DIR/handbook" -name "*.md" 2>/dev/null
    find "$KNOWLEDGE_DIR/domains" -name "README.md" 2>/dev/null
    find "$KNOWLEDGE_DIR/research" -name "_rollup.md" 2>/dev/null
  } | while read -r f; do
    score_file "$f"
  done | sort -rn | {
    if [ "$MODE" = "top" ] && [ "$LIMIT" -gt 0 ]; then
      head -n "$LIMIT"
    elif [ "$MODE" = "bottom" ] && [ "$LIMIT" -gt 0 ]; then
      tail -n "$LIMIT"
    else
      cat
    fi
  } | column -t
fi
