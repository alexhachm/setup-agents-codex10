---
doc_kind: reference
scope: project
owner: handbook
last_verified: 2026-03-16
rot_risk: low
related_paths:
  - .codex/commands-codex10/
  - templates/commands/
---

# Workflow Patterns

Decomposition and allocation patterns. Updated by Architect and Allocator after completing cycles.

## Good Patterns

- **Triage quickly to Tier 2** for single-domain fixes with clear file scope. Include explicit validation commands.
- **Separate queue signals:** Request `pending_count` controls triage order; `ready_count` indicates allocator pressure. They are independent.
- **Serialize same-file tasks** with `depends_on` to avoid overlap thrash.
- **Assignment-first throughput:** Keep workers fed before triggering merges. Defer integration while runnable tasks exist.
- **Atomic assignment:** Use `codex10 assign-task` — if `worker_not_idle`, refresh status and defer. Never spin-retry or queue behind busy workers.
- **Block on inbox:** When all workers are occupied, block on architect inbox for next completion event, then claim first idle worker atomically.
- **Staleness checks during idle:** Can reveal mandatory reset conditions independent of inbox load.
- **Record triage tier:** After Tier 2 task creation, run `codex10 triage <id> 2 "<reason>"` so request status doesn't linger as `[pending]`.
- **Rebuild scan baseline on reset:** Missing `codebase-map.json` forces repeated false-positive full resets.

## Anti-Patterns

- **Continuing after reset thresholds:** Operating past `commits_since >= 20` or broad file churn risks stale decomposition decisions.
- **`codex10 --help` as probe:** Generates a stray request. Use documented commands directly.
- **Infinite fix-task loops:** `merge_failed` → create fix task → worker dies → reassign → repeat. Cap at 2 attempts, then fail.
- **Economy model for reasoning:** Use economy for execution (build-validator, merge-prep, conflict-resolver). Use fast/full for reasoning (architect, allocator).

## Changelog (last 5)

- 2026-03-16: Promoted from patterns.md, added anti-patterns from operational experience
