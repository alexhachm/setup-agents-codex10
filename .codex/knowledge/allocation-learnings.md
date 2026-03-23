# Allocation Learnings
<!-- Updated 2026-03-21T04:58Z by Master-3 -->

## Domain-Worker Pairings
- worker-1: coordinator-tests
- worker-2: coordinator-routing
- worker-3: coordinator-routing
- worker-4: orchestration-docs / unassigned (flexible)

## Allocation Patterns
- Coordinator runtime auto-handles merges for T2 tasks; integrate returns "0 merges queued" consistently.
- T1/T2 requests bypass allocator entirely.
- w4 often used by Master-2 for direct Tier-2 assignments.
- Extended idle sessions (6+ consecutive) are normal when system awaits new user input.
- jq not available; use python3 -c "import json..." for all JSON ops on agent-health.json.

## Changelog (last 5)
- session 71: ~115 cycles, ~20min, 0 tasks. 17th consecutive idle. All 4 workers idle throughout.
- session 70: ~120 cycles, ~20min, 0 tasks. 16th consecutive idle. All 4 workers idle throughout.
- session 69: ~120 cycles, ~20min, 0 tasks. 15th consecutive idle. All 4 workers idle throughout.
- session 68: ~120 cycles, ~20min, 0 tasks. 14th consecutive idle. All 4 workers idle throughout.
- session 67: ~120 cycles, ~20min, 0 tasks. 13th consecutive idle. All 4 workers idle throughout.
- session 66: ~107 cycles, ~20min, 0 tasks. 12th consecutive idle. All 4 workers idle throughout.
- session 65: 107 cycles, ~20min, 0 tasks. 11th consecutive idle. All 4 workers idle throughout.
- session 64: 108 cycles, ~20min, 0 tasks. 10th consecutive idle. All 4 workers idle throughout.
- session 63: 108 cycles, ~20min, 0 tasks. 9th consecutive idle. All 4 workers idle throughout.
- session 62: 96 cycles, ~20min, 0 tasks. 8th consecutive idle. All 4 workers idle throughout.
- session 61: 126 cycles, ~20min, 0 tasks. 7th consecutive idle. All 4 workers idle throughout.
- session 60: 56 cycles, ~20min, 0 tasks. 6th consecutive idle.
- session 59: 35 cycles, ~15min, 0 tasks. 5th consecutive idle.
