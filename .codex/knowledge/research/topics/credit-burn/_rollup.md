---
kind: topic_rollup
scope: project
topic: credit-burn
updated: 2026-03-16
top_notes:
  - R-cb01
---

# Credit Burn

## Current Status

Worker death-respawn spiral identified and partially fixed. 3.1x overspend per task completion due to watchdog timeouts at 180s killing workers mid-work. P1 fix (reassignment cap) implemented. P2 fix (merger deferral removed) implemented. Merge-prep subagent added to prevent fix-task loops.

## Key Findings

- 73.9% of worker sessions die from heartbeat_timeout
- 29.7% task completion rate (79 of 266 starts)
- Allocator polled every 2s generating 1,519 "tasks_available" spam entries
- Merger deferred 1,349 times due to `prioritize_assignment_over_merge`
- 13 requests stuck in "integrating" state, 8 stuck in "decomposed"

## Decision Hooks

- If worker death rate exceeds 50% → check watchdog thresholds and heartbeat frequency
- If merge_failed events spike → check if merge-prep subagent is running at worker level
- If "integrating" requests accumulate → check merger interval and deferral config

## What Worked

- Max reassignment cap (3 attempts then fail) stops infinite death loops
- Removing merge deferral unblocked 1,349 stalled merges
- merge-prep subagent handles git conflicts at worker level, preventing escalation loops

## What Did NOT Work

- Creating fix tasks for merge_failed → new worker with zero context → dies from timeout → repeat (36 fix tasks, 85 mails, ~0% resolution)

## Evidence

- R-cb01: Full diagnosis with hard numbers from codex10.db (2026-03-16)
