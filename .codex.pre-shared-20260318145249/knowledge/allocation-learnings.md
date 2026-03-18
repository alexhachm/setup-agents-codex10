# Allocation Learnings

Owned by Master-3 (Allocator). Updated during pre-reset distillation.
Budget: ~500 tokens max.

## Domain-Worker Pairings
- worker-1: coordinator-surface (mac10 CLI), fallback: orchestration-scripts
- worker-2: coordinator-routing (merger/watchdog routing logic)
- worker-3: coordinator-routing (merger/watchdog routing logic)
- worker-4: coordinator-core (db.js, schema, state machine)

## Allocation Patterns
- `completed_task` is a transitional state; assign-task returns `worker_not_idle` until coordinator transitions to `idle`. Wait 1-3 cycles before retrying.
- Assignment-first gate (defer integration when ready-tasks exist) fires even when all workers are busy. This delays integration unnecessarily when no idle workers remain. Follow the rule but note it can defer integration for many cycles.
- Domain matching is strict — if no tasks match worker's domain, use best-fit (e.g., orchestration-scripts for coordinator-surface when no coord-surface tasks exist).

## Functional Conflict Deadlock (2026-03-18)
- Root cause: `runOverlapValidation` in running merger.js unconditionally calls `npm run build` even when no build script exists in package.json.
- This creates a deadlock: PRs that fix merger.js can't be merged because the running merger rejects them via overlap validation.
- Fix paths attempted: pushed guard fix to agent-1 branch (PR #54), confirmed agent-4 branch already has `getDefaultValidationCommand` fix. Neither takes effect until merged to main.
- Resolution: Failed task #68 as CONFLICT_UNRESOLVED per instructions. Task #51 was "resolved" with a branch push but will retry-fail.
- Next session: escalate this merger.js deadlock to Master-2 for hot-patching the coordinator or bypassing overlap validation.

## Fix Cycle Patterns
- functional_conflict events from broken overlap validation produce unresolvable conflicts — mark CONFLICT_UNRESOLVED and fail, don't loop.
- task_failed echoes from intentional fail-task calls: skip fix-task creation.

## Changelog (last 5)
- 2026-03-18: Documented functional_conflict deadlock pattern; domain-worker pairings confirmed; completed_task wait behavior.
