---
doc_kind: reference
scope: project
owner: domains/coordinator-routing
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - coordinator/src/cli-server.js
  - coordinator/src/merger.js
  - coordinator/src/watchdog.js
  - coordinator/src/db.js
  - coordinator/bin/mac10
  - coordinator/tests/cli.test.js
  - coordinator/tests/merger.test.js
---

# Coordinator Routing

## Executive Summary
- Routes tasks to model tiers based on complexity class, with budget-aware downscale/restore when flagship spend is constrained.
- Fallback routing keeps `routing_class` tied to task complexity but uses a separate `effectiveClass` for model tier selection under budget constraints.
- Budget telemetry (`routing_reason`, `model_source`) must stay consistent across assign-task response, worker mail, and allocator log.
- Merge queue uses `request_id + pr_url + branch` identity for dedupe, NOT `request_id + task_id`.
- Overlap validation must not false-fail on repos without a `build` script; `npm_config_if_present='true'` is the startup guard.

## Invariants and Contracts
- Budget downgrade activates only when BOTH `flagship.remaining` and `flagship.threshold` parse as finite numbers AND `remaining <= threshold`.
- `routing_class` is never mutated by budget state; only `effectiveClass` shifts for model/effort selection.
- `routing_reason` must mirror across: assign-task response, worker mail payload, allocator log payload.
- `routing_budget_state` must be a plain object (not array); invalid shapes fall through to scalar keys (`routing_budget_flagship_*` then legacy `flagship_budget_*`).
- `parseBudgetStateConfig` merges object and scalar sources; `/api/status` and `fallbackModelRouter.getBudgetState` must both consume it.
- `enqueueMerge` dedupes on `request_id + pr_url + branch`; cross-request PR collision guards key on `pr_url` with ownership mismatch on `request_id/branch`.

## Key Patterns
- **Budget-aware routing**: `routeTask` gates `high`/`mid` via `effectiveClass` while preserving original `routing_class` in responses.
- **Overlap validation** (`runOverlapValidation` in `merger.js`): runs task-level validation commands if provided, else picks available scripts (`build` then `test`) from `package.json`; missing scripts skip with explicit log reason.
- **Merge deferral**: `shouldDeferMergeForAssignmentPriority` escapes on stale allocator loop heartbeat (configurable `assignment_priority_allocator_loop_stale_ms`, default 300s), consecutive defer threshold, or pending-age budget.
- **Stalled assignment recovery**: shared `db.recoverStalledAssignments` reclaims tasks from stale/idle/missing workers, bounded by `tasks.liveness_reassign_count` + `watchdog_task_reassign_limit`.
- **Usage normalization**: accepts OpenAI aliases (`prompt_tokens` -> `input_tokens`), Anthropic cache objects, audio tokens; unknown nested keys pass through to `usage_payload_json`.

## Pitfalls
- Do NOT use `last_heartbeat` or `created_at` for stale claim age; `releaseStaleClaimsCheck` must use `workers.claimed_at` only.
- Merge-conflict overlap tasks: always sync to `origin/main` and run scoped `git diff` before editing. If diff is empty, treat as validation-only.
- `assign-task` rollback must return `ok:false, error=worker_claimed` and preserve live `claimed_by`/`claimed_at` instead of restoring stale pre-assignment values.
- In `monitorLoops`, do NOT skip active loops with `tmux_window = null`; evaluate heartbeat staleness via fallback timestamps.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
