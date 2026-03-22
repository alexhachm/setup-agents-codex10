#!/usr/bin/env bash
# test-research-pipeline.sh — Iterative pipeline test (all 3 modes)
#
# Phase A: Quick iteration with standard mode until stable (2 passes)
# Phase B: Final comprehensive test of all 3 modes:
#   - standard (instant ChatGPT)
#   - thinking (Pro with extended thinking)
#   - deep_research (Deep Research)
#
# Usage: bash test-research-pipeline.sh [max_iterations]
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CODEX10="$PROJECT_DIR/.codex/scripts/codex10"
DRIVER="$PROJECT_DIR/.codex/scripts/chatgpt-driver.py"
LOG_FILE="$PROJECT_DIR/.codex/logs/research-driver.log"
PID_FILE="$PROJECT_DIR/.codex/state/research-driver.pid"
LOCK_FILE="$PROJECT_DIR/.codex/state/research-driver.lock"
TEST_LOG="$PROJECT_DIR/.codex/logs/pipeline-test.log"

MAX_ITERATIONS="${1:-5}"
POLL_INTERVAL=10
STANDARD_TIMEOUT=300     # 5 min for standard
THINKING_TIMEOUT=600     # 10 min for thinking/Pro
DR_TIMEOUT=3600          # 60 min for deep research

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$TEST_LOG"; }
pass() { log "PASS: $*"; }
fail() { log "FAIL: $*"; }

cleanup_driver() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 2
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  rm -f "$LOCK_FILE"
  pkill -f "chatgpt-codex-profile" 2>/dev/null || true
  sleep 1
}

start_driver() {
  cleanup_driver
  mkdir -p "$PROJECT_DIR/.codex/logs"
  nohup python3 "$DRIVER" >> "$LOG_FILE" 2>&1 &
  local dpid=$!
  echo "$dpid" > "$PID_FILE"
  log "Driver started (PID $dpid)"
  sleep 8
  if ! kill -0 "$dpid" 2>/dev/null; then
    fail "Driver died during startup"
    tail -20 "$LOG_FILE" | tee -a "$TEST_LOG"
    return 1
  fi
  return 0
}

queue_item() {
  local topic="$1"
  local question="$2"
  local mode="${3:-standard}"
  local priority="${4:-urgent}"
  local output
  output=$("$CODEX10" queue-research "$topic" "$question" --mode "$mode" --priority "$priority" 2>&1)
  local item_id
  item_id=$(echo "$output" | grep -oP '#\K\d+' || echo "")
  if [ -z "$item_id" ]; then
    item_id=$(echo "$output" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
  fi
  if [ -z "$item_id" ]; then
    item_id=$("$CODEX10" research-status 2>/dev/null | grep '\[queued\]' | head -1 | grep -oP '#\K\d+' || echo "")
  fi
  echo "$item_id"
}

wait_for_item() {
  local item_id="$1"
  local timeout="$2"
  local label="${3:-item}"
  local elapsed=0
  while [ $elapsed -lt $timeout ]; do
    local status
    status=$("$CODEX10" research-status 2>/dev/null | grep "#${item_id} " | head -1 || echo "")
    if echo "$status" | grep -q '\[completed\]'; then
      pass "$label #${item_id} completed"
      return 0
    fi
    if echo "$status" | grep -q '\[failed\]'; then
      local error
      error=$(echo "$status" | sed 's/.*\[failed\]//')
      fail "$label #${item_id} failed: $error"
      return 1
    fi
    if [ -f "$PID_FILE" ]; then
      local dpid
      dpid=$(cat "$PID_FILE" 2>/dev/null || echo "")
      if [ -n "$dpid" ] && ! kill -0 "$dpid" 2>/dev/null; then
        fail "Driver died while waiting for $label #${item_id}"
        return 1
      fi
    fi
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
    log "  Waiting for $label #${item_id}... (${elapsed}s/${timeout}s)"
  done
  fail "$label #${item_id} timed out after ${timeout}s"
  return 1
}

# --- Main ---
echo "" > "$TEST_LOG"
log "=== Research Pipeline Test Suite (All Modes) ==="
log "Max iterations: $MAX_ITERATIONS"
log ""

# Ensure coordinator is running
if ! "$CODEX10" ping >/dev/null 2>&1; then
  log "Starting coordinator..."
  "$CODEX10" start "$PROJECT_DIR" 2>&1 || true
  sleep 3
fi

iteration=0
passed=0
failed=0

# ================================================================
# PHASE A: Quick iteration with standard mode
# ================================================================
log "============================================"
log " PHASE A: Standard mode quick iteration"
log "============================================"

while [ $iteration -lt "$MAX_ITERATIONS" ]; do
  iteration=$((iteration + 1))
  log ""
  log "--- Iteration $iteration / $MAX_ITERATIONS ---"

  # Queue + process a standard item
  log "[A1] Queuing standard test item..."
  ITEM_ID=$(queue_item "std-test-iter${iteration}" "What is 2+2? Answer in one word." standard urgent)
  log "  Queued item #${ITEM_ID:-unknown}"

  log "[A2] Starting driver..."
  if ! start_driver; then
    failed=$((failed + 1))
    cleanup_driver
    continue
  fi

  if [ -n "$ITEM_ID" ] && wait_for_item "$ITEM_ID" "$STANDARD_TIMEOUT" "Standard"; then
    pass "A2: Standard dispatch works"
  else
    failed=$((failed + 1))
    tail -20 "$LOG_FILE" | tee -a "$TEST_LOG"
    cleanup_driver
    continue
  fi

  # Restart requeue test
  log "[A3] Testing restart recovery..."
  ITEM2_ID=$(queue_item "requeue-iter${iteration}" "What color is the sky? One word." standard urgent)
  log "  Queued requeue item #${ITEM2_ID:-unknown}"
  sleep 30

  log "  Killing driver..."
  cleanup_driver

  log "  Restarting driver..."
  if ! start_driver; then
    failed=$((failed + 1))
    cleanup_driver
    continue
  fi

  if [ -n "$ITEM2_ID" ] && wait_for_item "$ITEM2_ID" "$STANDARD_TIMEOUT" "Requeue"; then
    pass "A3: Restart recovery works"
  else
    failed=$((failed + 1))
    tail -20 "$LOG_FILE" | tee -a "$TEST_LOG"
    cleanup_driver
    continue
  fi

  passed=$((passed + 1))
  cleanup_driver
  log "Iteration $iteration: PASSED"

  if [ $passed -ge 2 ]; then
    log ""
    log "Standard mode proven: $passed consecutive passes"
    break
  fi
done

if [ $passed -lt 2 ]; then
  log ""
  log "========================================="
  log " FINAL REPORT"
  log "========================================="
  log " Standard mode not stable after $iteration iterations"
  log " Passed: $passed  Failed: $failed"
  log " Status: NEEDS INVESTIGATION"
  log "========================================="
  cleanup_driver
  exit 1
fi

# ================================================================
# PHASE B: Comprehensive multi-mode test
# ================================================================
log ""
log "============================================"
log " PHASE B: Comprehensive multi-mode test"
log "============================================"

# Queue one item per mode
log "[B1] Queuing items for all 3 modes..."
STD_ID=$(queue_item "final-standard" "What programming language was created by Guido van Rossum? Answer in one word." standard urgent)
log "  Standard item: #${STD_ID:-unknown}"

THINK_ID=$(queue_item "final-thinking" "Explain step by step why quicksort has O(n log n) average case complexity. Show your reasoning process." thinking urgent)
log "  Thinking item: #${THINK_ID:-unknown}"

DR_ID=$(queue_item "final-deep-research" "What are the latest advances in autonomous coding agents as of early 2026? Provide a brief summary of top tools and approaches." deep_research urgent)
log "  Deep Research item: #${DR_ID:-unknown}"

log "[B2] Starting driver for multi-mode test..."
if ! start_driver; then
  fail "Driver failed to start for multi-mode test"
  cleanup_driver
  exit 1
fi

# Wait for each mode sequentially (standard first, then thinking, then DR)
b_passed=0
b_failed=0

log "[B3] Waiting for Standard item..."
if [ -n "$STD_ID" ] && wait_for_item "$STD_ID" "$STANDARD_TIMEOUT" "Standard-final"; then
  b_passed=$((b_passed + 1))
else
  b_failed=$((b_failed + 1))
  log "  Standard mode FAILED in final test"
  log "  Last 15 driver log lines:"
  tail -15 "$LOG_FILE" | tee -a "$TEST_LOG"
fi

log "[B4] Waiting for Thinking/Pro item..."
if [ -n "$THINK_ID" ] && wait_for_item "$THINK_ID" "$THINKING_TIMEOUT" "Thinking-final"; then
  b_passed=$((b_passed + 1))
else
  b_failed=$((b_failed + 1))
  log "  Thinking/Pro mode FAILED in final test"
  log "  Last 15 driver log lines:"
  tail -15 "$LOG_FILE" | tee -a "$TEST_LOG"
fi

log "[B5] Waiting for Deep Research item..."
if [ -n "$DR_ID" ] && wait_for_item "$DR_ID" "$DR_TIMEOUT" "DeepResearch-final"; then
  b_passed=$((b_passed + 1))
else
  b_failed=$((b_failed + 1))
  log "  Deep Research mode FAILED in final test"
  log "  Last 15 driver log lines:"
  tail -15 "$LOG_FILE" | tee -a "$TEST_LOG"
fi

cleanup_driver

# --- Final Report ---
total_passed=$((passed + b_passed))
total_failed=$((failed + b_failed))

log ""
log "========================================="
log " FINAL REPORT"
log "========================================="
log " Phase A (standard quick):  $passed passes, $failed failures"
log " Phase B modes:"
log "   Standard:       $([ "$b_passed" -ge 1 ] && echo PASS || echo FAIL)"
log "   Thinking/Pro:   $([ "$b_passed" -ge 2 ] && echo PASS || echo FAIL)"
log "   Deep Research:  $([ "$b_passed" -ge 3 ] && echo PASS || echo FAIL)"
log " Total:            $total_passed passed, $total_failed failed"
if [ $b_failed -eq 0 ] && [ $passed -ge 2 ]; then
  log " Status:           ALL MODES PROVEN FUNCTIONAL"
elif [ $b_failed -gt 0 ]; then
  log " Status:           PARTIAL — some modes failed"
fi
log "========================================="
log " Full test log: $TEST_LOG"
log " Driver log:    $LOG_FILE"
log "========================================="

exit $( [ $b_failed -eq 0 ] && [ $passed -ge 2 ] && echo 0 || echo 1 )
