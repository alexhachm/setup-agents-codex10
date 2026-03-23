#!/usr/bin/env bash
# research-gaps.sh — Scans knowledge base and identifies research gaps.
# Outputs JSON array of gaps for auto-queuing.
# Usage: bash .codex/scripts/research-gaps.sh [project_dir]
set -euo pipefail

PROJECT_DIR="${1:-$(pwd)}"
KNOWLEDGE_DIR="$PROJECT_DIR/.codex/knowledge"
RESEARCH_DIR="$KNOWLEDGE_DIR/research/topics"
DOMAINS_DIR="$KNOWLEDGE_DIR/domains"
SIGNALS_DIR="$KNOWLEDGE_DIR/signals/uses"
SCORE_SCRIPT="$PROJECT_DIR/.codex/scripts/knowledge-score.sh"

gaps='[]'

add_gap() {
  local topic="$1" gap_type="$2" question="$3" priority="${4:-normal}" mode="${5:-regular}"
  # Escape JSON strings
  topic=$(printf '%s' "$topic" | sed 's/"/\\"/g')
  question=$(printf '%s' "$question" | sed 's/"/\\"/g')
  gaps=$(printf '%s' "$gaps" | python3 -c "
import sys, json
arr = json.loads(sys.stdin.read())
arr.append({
    'topic': '$topic',
    'gap_type': '$gap_type',
    'suggested_question': '$question',
    'priority': '$priority',
    'mode': '$mode'
})
print(json.dumps(arr))
" 2>/dev/null || printf '%s' "$gaps")
}

# --- Gap Type 1: Domains without research topics ---
if [ -d "$DOMAINS_DIR" ]; then
  for domain_dir in "$DOMAINS_DIR"/*/; do
    [ -d "$domain_dir" ] || continue
    domain_name=$(basename "$domain_dir")
    if [ ! -d "$RESEARCH_DIR/$domain_name" ] && [ ! -f "$RESEARCH_DIR/$domain_name/_rollup.md" ]; then
      add_gap "$domain_name" "domain_without_research" \
        "How do top production systems handle $domain_name concerns (architecture, failure modes, and best practices), and what external patterns should we adopt in this repository?" \
        "normal" "regular"
    fi
  done
fi

# --- Gap Type 2: Stale rollups (>14 days old) ---
if [ -d "$RESEARCH_DIR" ]; then
  current_epoch=$(date +%s)
  fourteen_days=$((14 * 86400))

  for rollup in "$RESEARCH_DIR"/*/_rollup.md; do
    [ -f "$rollup" ] || continue
    topic_name=$(basename "$(dirname "$rollup")")

    # Extract updated date from frontmatter
    updated_date=$(grep -m1 '^updated:' "$rollup" 2>/dev/null | sed 's/^updated:[[:space:]]*//' | tr -d '"' || echo "")
    if [ -n "$updated_date" ]; then
      # Parse date to epoch (handles YYYY-MM-DD format)
      rollup_epoch=$(date -d "$updated_date" +%s 2>/dev/null || echo "0")
      age=$((current_epoch - rollup_epoch))
      if [ "$age" -gt "$fourteen_days" ]; then
        add_gap "$topic_name" "stale_rollup" \
          "Refresh research on $topic_name — the rollup is over 14 days old. What has changed or been learned since the last update?" \
          "low" "regular"
      fi
    fi
  done
fi

# --- Gap Type 3: Unresearched links in notes ---
if [ -d "$RESEARCH_DIR" ]; then
  while IFS= read -r match; do
    [ -n "$match" ] || continue
    file=$(echo "$match" | cut -d: -f1)
    topic_name=$(basename "$(dirname "$file")")
    line=$(echo "$match" | cut -d: -f2-)
    # Extract a brief context
    snippet=$(echo "$line" | head -c 120)
    add_gap "$topic_name" "unresearched_link" \
      "Investigate further: $snippet" \
      "low" "regular"
  done < <(grep -ri "needs further investigation\|TODO.*research\|needs research\|investigate further" "$RESEARCH_DIR" 2>/dev/null | head -10 || true)
fi

# --- Gap Type 4: Failed/incomplete research queue entries ---
# Query SQLite directly to avoid re-entrant socket calls when run via coordinator
DB_FILE="$PROJECT_DIR/.codex/state/codex10.db"
if [ ! -f "$DB_FILE" ]; then
  DB_FILE="$PROJECT_DIR/.codex/state/mac10.db"
fi
if [ -f "$DB_FILE" ] && command -v sqlite3 >/dev/null 2>&1; then
  while IFS='|' read -r topic question; do
    [ -n "$topic" ] || continue
    add_gap "$topic" "failed_retry" \
      "Retry failed research on $topic: $question" \
      "normal" "regular"
  done < <(sqlite3 "$DB_FILE" "SELECT topic, question FROM research_queue WHERE status = 'failed' LIMIT 10;" 2>/dev/null || true)
elif [ -f "$DB_FILE" ]; then
  # Fallback: use node to query if sqlite3 CLI not available
  while IFS='|' read -r topic question; do
    [ -n "$topic" ] || continue
    add_gap "$topic" "failed_retry" \
      "Retry failed research on $topic: $question" \
      "normal" "regular"
  done < <(node -e "
    const Database = require('better-sqlite3');
    const db = new Database('$DB_FILE', { readonly: true });
    try {
      const rows = db.prepare(\"SELECT topic, question FROM research_queue WHERE status = 'failed' LIMIT 10\").all();
      rows.forEach(r => console.log(r.topic + '|' + r.question));
    } catch(e) {} finally { db.close(); }
  " 2>/dev/null || true)
fi

# --- Gap Type 5: Score-based gaps ---
if [ -x "$SCORE_SCRIPT" ]; then
  score_output=$(bash "$SCORE_SCRIPT" --bottom 5 2>/dev/null || echo "")
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # Parse lines like: -3  research/topics/foo/_rollup.md
    score=$(echo "$line" | awk '{print $1}')
    file_path=$(echo "$line" | awk '{print $2}')
    if [ -n "$score" ] && [ -n "$file_path" ] && echo "$file_path" | grep -q "research/"; then
      # Negative score on a research file means it's stale/unused
      if [ "${score:-0}" -lt 0 ] 2>/dev/null; then
        topic_name=$(echo "$file_path" | sed -n 's|.*research/topics/\([^/]*\)/.*|\1|p')
        if [ -n "$topic_name" ]; then
          add_gap "$topic_name" "low_score" \
            "Research on $topic_name has a low quality score ($score). Refresh or validate the existing research." \
            "low" "regular"
        fi
      fi
    fi
  done <<< "$score_output"
fi

# Output the gaps as JSON
printf '%s\n' "$gaps"
