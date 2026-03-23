---
doc_kind: reference
scope: project
owner: domains/coordinator-core
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - coordinator/src/schema.sql
  - coordinator/src/db.js
  - coordinator/src/cli-server.js
  - coordinator/src/index.js
  - coordinator/tests/cli.test.js
  - coordinator/tests/state-machine.test.js
---

# Coordinator Core

## Executive Summary
- Owns the persistence layer (SQLite schema, migrations, DB helpers) and core task/request lifecycle logic.
- New task telemetry or state fields require updating THREE surfaces together: `schema.sql`, migration in `db.js`, and `VALID_COLUMNS.tasks` allowlist.
- `depends_on` promotion must verify dependency existence, not just count unfinished dependencies.
- Loop-request quality gating requires three dimensions: WHAT verb, WHERE file-path, WHY production-risk signal.
- Request lifecycle cleanup is centralized in `db.updateRequest`: terminal-to-active transitions force `completed_at` and `result` to NULL.

## Invariants and Contracts
- **Three-surface rule**: any new column on `tasks` or `workers` must land in `schema.sql`, an idempotent `ensure*Columns` migration in `db.js`, and the relevant `VALID_COLUMNS` allowlist.
- `checkAndPromoteTasks`: must check BOTH `total == uniqueDeps.length` AND `completed == uniqueDeps.length` to prevent nonexistent dependency IDs from incorrectly unblocking tasks.
- `evaluateLoopRequestQuality` requires all three dimensions (WHAT, WHERE, WHY) before accepting a loop request.
- Loop-request dedupe ordering: run active duplicate detection BEFORE throughput suppression (cooldown + max-per-hour).
- Forward-compatible usage: strict validation for known fields, passthrough for unknown provider keys.
- `db.updateRequest` clears `completed_at` and `result` to NULL when status transitions from terminal to active.

## Key Patterns
- **Idempotent migrations**: `PRAGMA table_info(table)` + `includes` guards for column existence checks.
- **Browser offload lifecycle**: dedicated `transitionTaskBrowserOffload` enforces valid state progression and restricts mutable fields.
- **Project memory**: append-only snapshots keyed by `(project_context_key, snapshot_version)`, latest-snapshot index table.
- **Worker claim semantics**: `claimed_by` and `claimed_at` set/cleared atomically together.
- **Burn-rate telemetry**: `getUsageCostBurnRate` aggregates `usage_cost_usd` for BOTH `completed` and `failed` terminal statuses.

## Pitfalls
- Overlap merge-validation tasks: ALWAYS sync to `origin/main` and check scoped `git diff` before editing. If empty, treat as validation-only.
- This repo has no `build` script; `npm run build` failures in overlap tasks should be addressed with explicit scoped test evidence.
- Repeated relands can leave duplicate regressions in test files; keep exactly one canonical test per behavior.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
