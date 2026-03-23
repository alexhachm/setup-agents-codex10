---
doc_kind: reference
scope: project
owner: handbook
last_verified: 2026-03-22T00:00Z
rot_risk: medium
related_paths:
  - coordinator/src/allocator.js
  - coordinator/src/watchdog.js
  - .codex/commands-codex10/allocate-loop.md
---

# Allocation

Allocation learnings and worker performance patterns.

## Worker Performance

- Same-worker reassignment preserves context across fix chains — prefer re-assigning fixes to the original worker.
- Repeated validator failures (e.g., `npm run build` missing script) produce recurring fix churn regardless of worker quality.
- Workers are most effective when immediately reassigned after idle transitions.
- Workers in `completed_task` state frequently get stuck and never transition to `idle`. Use `reset-worker` to recover them immediately rather than waiting >30s.
- Worker numeric IDs (1-4) must be used with `assign-task`, not the label "worker-1". The CLI expects the numeric id column from the DB.

## Task Duration

- Idle-gated same-worker fixes typically assign within a single polling window once the target worker transitions idle.
- Merge conflict remediation can re-enter the queue repeatedly due to validator-path failures, inflating end-to-end latency.
- Large coordinator-core and coordinator-routing tasks take 5-12 minutes each; orchestration-scripts tasks take 3-8 minutes.

## Allocation Decisions That Work

- Assignment-first throughput with immediate idle-transition assignment clears urgent backlogs quickly.
- Deduplicating by current task state before creating fixes reduces redundant task creation.
- Deferring integration while ready tasks exist prevents merge starvation of assignment.
- When domain-specific tasks are exhausted, assign adjacent-domain tasks with no file overlap to idle workers rather than leaving them idle.
- Use `reset-worker` immediately when a worker is stuck in `completed_task` beyond 30s rather than waiting.

## Fix Cycle Patterns

- **Dominant recurrence (2026-03-18):** merge validator invoking `npm run build` in repos without a build script → false `functional_conflict` spam. Root cause fix: task #117 merged BUT coordinator still running old code until restarted — restart required to pick up new merger.js. For stale merges (>30m), use CONFLICT_UNRESOLVED+fail-task directly; do NOT create fix tasks. Future sessions should NOT create redundant fix tasks when req already ALL DONE.
- **CAUTION: fail-task resets the WORKER, not just the task.** `fail-task <worker_id> <task_id>` resets worker state — if worker is currently on a DIFFERENT task, that task reverts to `ready`. Always verify worker's current task before issuing fail-task.
- Same file-set requests spawn follow-on fixes repeatedly if root cause isn't addressed.
- Duplicate functional_conflicts for the same task: skip if request is already ALL DONE.
- **New (2026-03-16):** `merge_failed` escalation removed. Git conflicts handled by `merge-prep` subagent at worker level. Functional conflicts (non-false-positive) handled by `conflict-resolver` subagent spawned by allocator. No more fix-task creation for merge failures.

## Environment

- **CLAUDECODE=1 in tmux global env breaks worker launches.** Workers fail with "nested Claude Code session" error. Fix: `tmux set-environment -g -u CLAUDECODE` on startup. Unset applies to new windows only; existing windows need `unset CLAUDECODE` sent via `tmux send-keys`. Worker sentinel's `mac10_prepare_cli_env` DOES call `unset CLAUDECODE` but tmux global env overrides it when shells first start.
- Workers in `completed_task` state can take 15-30s to transition to `idle`, but often get stuck permanently. Default: if not idle after 30s, use `reset-worker`.
- Worker tmux windows are in the `codex10-0319c9` session; all 4 worker windows (worker-1 through worker-4) are persistent.
- `assign-task` syntax: `codex10 assign-task <task_id> <numeric_worker_id>` — NOT "worker-1". Use the id field from DB (1, 2, 3, 4).

## Known Coordinator Bugs

- **Cross-request dependency promotion (2026-03-21, session 57):** When a task's `depends_on` references tasks from *different* requests (e.g., task #167 depends on #165 from req-28014143 and #166 from req-2213f99a), `checkAndPromoteTasks` does NOT auto-promote from `pending` to `ready` even when both deps are `completed`. Workaround: manually `UPDATE tasks SET status='ready' WHERE id=<N>` after verifying all deps are completed.
- **Coordinator crashes mid-session (2026-03-21):** Coordinator may crash (socket lost) during prolonged sessions. Detect via `check-completion` returning `Error: Coordinator not running`. Fix: `codex10 start` from project root, then re-verify worker state — workers persist their task assignment in DB even across restart.

## Allocation Decisions That Did Not Work

- **Task #136 persistent assignment drops (sessions 22-24, 2026-03-18):** Task drops from worker every ~2 min across 3 full sessions (>60 cycles). Worker-1 has fresh heartbeat but stays in `[assigned]` state — never transitions to `[busy]`/`[in_progress]`. Pattern: sentinel picks up assignment, attempts to launch Claude, something fails silently, task reverts to ready. This happens repeatedly despite valid heartbeats. Root cause: likely the worker CLI environment issue (CLAUDECODE=1, tmux env) preventing Claude launch. Coordinator restarts don't help. The task itself (setup.sh changes) may be blocking something. Continue reassigning — the sentinel IS trying.
- **Workers 3 & 4 may have running sentinels** — confirmed worker-3 showed heartbeat in session 23. Do not assume workers 3/4 are dead without checking heartbeats first.
- **merge_escalation_skipped + non_functional_conflict_logged_only (2026-03-19 session 46):** When merger logs `non_functional_conflict_logged_only`, it does NOT retry the merge automatically. The request stays `[integrating]` indefinitely. If the task result was "Fix already present" and all tests pass, the request is functionally complete but stuck. This is a known blocker pattern when the main repo has unstaged changes. Main repo modifications (many M files in git status) prevent `git rebase origin/main` in any non-worktree context.

## Session 2026-03-23 Session 11 Observations

- 100 cycles (~20 min). Very active session: tasks #180, #181, #182, #183, #184, #185 all active or completed.
- Task #180 (req-c0024f16): completed at session start. Integration triggered.
- Task #181 (urgent worktree fix for req-facc9bf3): assigned to worker-2, completed cycle ~23 (req-4937cfe7, PR #100). Integration triggered.
- Task #182 (clean all dirty worktrees): assigned to worker-3, completed cycle ~69 (req-8b587c37, no PR URL).
- Task #183 (orchestration-scripts req-8b587c37): auto-assigned worker-2 cycle ~36, completed cycle ~74 (PR #304). req-8b587c37 ALL DONE integrated.
- Task #184 (orchestration-scripts): auto-assigned worker-4 cycle ~53. Still busy at reset.
- Task #185 (coordinator-surface): auto-assigned worker-1 cycle ~74. Still busy at reset.
- Coordinator brief crash/timeout at cycles 72-73 (Node.js stack trace). Recovered automatically — subsequent CLI calls succeeded.
- 3 integrations completed: req-c0024f16, req-4937cfe7, req-8b587c37.
- Merge fix pattern: dirty worktree blocking merges → urgent fix task → still recurring. Pattern escalated to "clean ALL worktrees" in task #182.

## Changelog (last 5)
- 2026-03-23 (session 11): 100 cycles, ~20min. Tasks completed: #180, #181, #182, #183. Tasks in-progress at reset: #184 (worker-4), #185 (worker-1). 3 integrations. context_budget=600.
- 2026-03-22 (session 59): 78 cycles, ~20min. 0 tasks completed. Pure idle session — all 4 workers idle throughout. No ready tasks, no messages, no allocations. System waiting on Master-2. context_budget=260 at reset.
- 2026-03-21 (session 58): 126 cycles, ~20min. 0 tasks completed. Pure idle session — all 4 workers idle throughout. No ready tasks, no messages, no allocations. System waiting on Master-2. context_budget=1200 at reset.
- 2026-03-21 (session 57): 80 cycles, ~20min. 1 task completed: #167 (req-fb524c5d orchestration-scripts, Tier-3, merged via merge #150 by agent-2). 1 integration triggered. Cross-request dependency issue: task #167 depended on tasks #165/#166 in different requests; coordinator didn't auto-promote from pending→ready — required manual DB UPDATE. Coordinator crashed mid-session (cycle 59-60) and was restarted with `codex10 start`. Worker-2 healthy throughout with fresh heartbeats (age 0-24s). Worker-2 in completed_task transitioned to idle within 30s naturally. context_budget=850.
- 2026-03-21 (session 56): 45 cycles, ~20min. 3 tasks completed: #164 (req-31658412 coordinator-surface, PR #295), #166 (req-2213f99a coordinator-routing unblock, PR #296), #98 (req-b66d9a76, auto-completed). 3 integrations triggered (all 0 merges queued). Worker-3 stuck in completed_task >30s → reset-worker applied (effective). Workers 1-4 all cycling through assignment drops initially (CLAUDECODE env issue), then stabilized with workers 1/3 going busy and 2 eventually going busy on #165. Task #165 (launcher audit req-28014143) still in-progress at reset on worker-2. Task #167 (req-fb524c5d) remains [pending] at reset. context_budget=760.
- 2026-03-20 (session 55): 54 cycles, ~18min. 1 task completed (#162 req-cd36fff9 coordinator-routing, Tier-2, PR #293 by worker-3). 1 integration triggered (0 merges queued). Worker-3 completed_task → idle naturally within 30s. Workers 1/2/4 idle throughout; worker-3 busy cycles 30-43. context_budget=100 at reset.
