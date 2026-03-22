# Credit Burn Diagnosis & Fix Tracker

**Created:** 2026-03-16
**Status:** Active — no code changes yet, pending user confirmation

---

## Executive Summary

The system is in a **worker death-respawn spiral**. Workers time out before completing tasks, get killed by the watchdog, tasks get reassigned, new workers spawn, and the cycle repeats. For every 1 task completed, ~3.1 worker sessions are paid for. Combined with aggressive polling loops generating thousands of no-op log entries, this burns credits with minimal output.

---

## Hard Numbers (from codex10.db)

| Metric | Value | Problem? |
|---|---|---|
| Worker spawns | 245 | High |
| Worker deaths (all heartbeat_timeout) | 181 | **73.9% die** |
| Task starts | 266 | |
| Task completions | 79 | **29.7% rate** |
| Task reassignments | 177 | Wasted restarts |
| Avg spawns per completion | 3.1x | **~3x overspend** |
| Requests completed | 19/41 | 46% |
| Requests stuck "integrating" | 13 | Never close out |
| Requests stuck "decomposed" | 8 | Blocked |
| Mail messages | 2,553 | Overhead |
| Activity log entries | 6,906 | Overhead |
| "tasks_available" log spam | 1,519 | Polling waste |
| "merge_deferred" log spam | 1,349 | Polling waste |

---

## Problem Breakdown (Priority Order)

### P1: Worker Death-Respawn Loop (BIGGEST credit burn)

**Root cause:** Watchdog terminate threshold is 180s. Many coding tasks take longer. Workers get killed mid-work, task resets to "ready", new worker spawns, starts over.

**Evidence:** Tasks T#2, T#3, T#67 have been cycling through death loops dozens of times each.

**Current settings:**
- `heartbeat_timeout_s`: 60 (config table, but watchdog uses its own thresholds)
- Watchdog warn: 60s, nudge: 90s, triage: 120s, terminate: 180s
- Grace period for new workers: 60s after launch
- Watchdog polls every 10s (`watchdog_interval_ms: 10000`)

**Code locations:**
- Thresholds: `coordinator/src/watchdog.js` lines 14-19
- Configurable overrides: `watchdog_warn_sec`, `watchdog_nudge_sec`, `watchdog_triage_sec`, `watchdog_terminate_sec`
- Death handler: `coordinator/src/watchdog.js` lines 255-282
- Task reassignment on death: lines 264-273 (sets task back to 'ready', clears assigned_to)
- Worker respawn: `coordinator/src/index.js` lines 89-167
- **No reassignment limit** — tasks can be reassigned infinitely

**Fix needed:**
- [ ] Increase terminate threshold (e.g., 600s or more)
- [ ] Add max reassignment count per task (e.g., 3 attempts then fail)
- [ ] Workers should emit heartbeats during long operations to prove they're alive

---

### P2: Stuck "Integrating" Requests (13 requests)

**Root cause:** Requests move to "integrating" when tasks complete, but the merge step fails or never runs, and recovery is too slow.

**Current behavior:**
- Request set to "integrating" in `coordinator/src/merger.js` lines 80, 94-95
- Merger polls every 5s (hardcoded, line 50)
- `prioritize_assignment_over_merge: true` in config — merger defers to allocator when ready tasks exist
- Watchdog recovery: auto-completes integrating requests with no merge entries after 15 minutes
- Merge stuck in 'merging' > 5 min promoted to 'conflict'

**Code locations:**
- Merger main loop: `coordinator/src/merger.js` lines 42-52
- processQueue: lines 111-172
- Assignment deferral: lines 122-134 (this is likely the blocker — merges deferred 1,349 times!)
- Stale integration recovery: `coordinator/src/watchdog.js` lines 341-532

**Fix needed:**
- [ ] Reduce or remove `prioritize_assignment_over_merge` — it starves the merger
- [ ] Clear the 13 stuck requests (manual DB update or mac10 command)
- [ ] Add merge timeout escalation

---

### P3: Allocator Polling Spam (2,868 combined log entries)

**Root cause:** Allocator polls every 2s, merger every 5s. Even with dedup (10s/15s), they generate massive log/activity noise when conditions persist (ready tasks + idle workers cycling).

**Current settings:**
- `allocator_interval_ms: 2000` (every 2 seconds!)
- Merger interval: 5000ms (hardcoded)
- Allocator dedup: 10s (`NOTIFY_DEDUP_MS` in allocator.js line 8)
- Merger dedup: 15s (`ASSIGNMENT_PRIORITY_DEFERRAL_LOG_MS` in merger.js line 30)

**Code locations:**
- Allocator loop: `coordinator/src/allocator.js` lines 10-22
- "tasks_available" log: allocator.js lines 49-52
- "merge_deferred" log: merger.js lines 122-130

**Fix needed:**
- [ ] Increase allocator interval to 10-15s (from 2s)
- [ ] Increase merger interval to 15-30s (from 5s)
- [ ] Increase dedup intervals or suppress repeated identical logs

---

### P4: Stale Loops Still Running (2 active)

**Current state:**
- Loop#20 (allocator loop) — started 19:27
- Loop#21 (architect loop) — stale 324s, no heartbeat

**Fix needed:**
- [ ] Stop both active loops
- [ ] Investigate why loop heartbeats go stale

---

### P5: Zombie Tasks from Day 1

**Current state:** Tasks T#1 (failed), T#2, T#3 (in_progress cycling), T#4, T#5 (pending) from requests submitted at system start are still in the queue, consuming worker slots.

**Requests involved:**
- `req-387d807e` (decomposed, created 08:11) — "browser research offloading"
- `req-59bfc6fb` (decomposed, created 08:40) — quota-limited deep research
- `req-5d8bea34` (decomposed, created 08:42) — save states for research

**Fix needed:**
- [ ] Cancel or fail these stale requests and their tasks
- [ ] Free up worker slots

---

### P6: No Worker Concurrency Limit Enforcement

**Current state:** `max_workers: 8` in config but only 4 worker worktrees exist. All 4 are "busy" with tasks stuck in the death loop.

**Fix needed:**
- [ ] Ensure worker count matches available worktrees
- [ ] Consider reducing max_workers to 2-3 to reduce parallel credit burn

---

## Recommended Fix Order

1. **STOP** — Kill active loops and free stuck workers (immediate, no code change)
2. **P5** — Cancel zombie tasks/requests (DB cleanup, no code change)
3. **P2** — Clear stuck integrating requests (DB cleanup, no code change)
4. **P1** — Increase watchdog thresholds + add reassignment cap (code change)
5. **P3** — Reduce polling frequencies (config change + small code change)
6. **P6** — Tune max_workers (config change)
7. **P4** — Fix loop heartbeat staleness (code change)

Steps 1-3 are cleanup (no code changes). Steps 4-7 are fixes to prevent recurrence.

---

## Files to Modify

| File | Problems Addressed |
|---|---|
| `coordinator/src/watchdog.js` | P1 (thresholds, reassignment cap), P2 (recovery), P4 (loop stale) |
| `coordinator/src/allocator.js` | P3 (polling interval) |
| `coordinator/src/merger.js` | P2 (deferral), P3 (polling interval) |
| `coordinator/src/index.js` | P1 (respawn logic) |
| `coordinator/src/schema.sql` | P3 (default intervals) |
| `.codex/state/codex10.db` (config table) | P1, P3, P6 (runtime config) |
