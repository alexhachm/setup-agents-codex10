# Allocation Learnings
<!-- Updated 2026-04-10T23:52:36Z by Master-3 -->

## Worker Performance
- worker-1 [infra]: idle all sessions (1-52+), no tasks allocated
- worker-2 [infra]: idle all sessions (1-52+), no tasks allocated
- worker-3 [coordinator-routing]: idle all sessions (1-52+), no tasks allocated
- worker-4 [status]: idle all sessions (1-52+), no tasks allocated

## Task Duration Actuals
- No tasks executed across sessions 1-52+ (all idle)
- Session duration: ~19-21 min (~1272s consistently)
- ~120 polling cycles per session at 10s idle cadence

## Allocation Decisions
- No allocations made -- system idle, all requests completed

## Fix Cycle Patterns
- No fix cycles executed

## System State Notes (2026-04-10)
- System healthy and idle -- awaiting new work from Master-2
- All 4 workers idle, ready for assignment once new work arrives
- Source revision drift: head:82a0e0f322e7 ahead:5 behind:47 vs origin/main -- pre-existing
- Pattern: each session runs ~1272s, resets via scan-codebase-allocator
- research_batch_available messages: NOT allocator contract events; ignore them
- jq not available -- use python3 for JSON manipulation
- Write to /tmp first then cp to avoid heredoc issues with special chars
- Batch polling (for loop + inbox --block) + Monitor tool is optimal idle pattern
