---
doc_kind: reference
scope: project
owner: domains/coordinator-surface
last_verified: 2026-03-16
rot_risk: low
related_paths:
  - coordinator/src/web-server.js
  - coordinator/src/cli-server.js
  - coordinator/bin/mac10
  - coordinator/tests/cli.test.js
---

# Coordinator Surface (API / CLI / Dashboard)

## Executive Summary
- Covers the web API (`/api/status`, `/api/tasks`, `/api/requests/:id`), CLI rendering (`mac10 status`, `mac10 loop-requests`), and dashboard telemetry hydration.
- All three API endpoints must route through a shared task-hydration helper so routing telemetry is consistent.
- CLI row rendering must sanitize control characters before width truncation to prevent row-injection attacks.
- Budget snapshots prefer `routing_budget_state` config (parsed as plain object), then scalar fallback keys, then allocator-log telemetry.

## Invariants and Contracts
- `/api/status`, `/api/tasks`, `/api/requests/:id` use the same `buildStatePayload` / task-hydration helper.
- `model_source` hydration: prefer task-row value, then fallback to latest `activity_log` `task_assigned` details by `task_id`.
- Budget snapshot derivation order: `routing_budget_state` config -> `routing_budget_flagship_*` scalars -> legacy `flagship_budget_*` scalars -> allocator telemetry.
- CLI row sanitizer strips CR/LF/tab/control chars before truncation.

## Key Patterns
- **Scalar budget fallback**: in `buildBudgetSnapshotFromConfig`, parse routing scalars first; only parse legacy keys when routing scalar is `null`.
- **Usage normalization parity**: `complete-task`/`fail-task` normalize OpenAI, Anthropic, and audio aliases; map known fields to `usage_*` columns, pass unknowns to `usage_payload_json`.

## Pitfalls
- Do NOT use `spawnSync` for CLI rendering regressions; use async execution to avoid deadlocks with in-process test servers.
- Raw-string nullish coalescing on budget keys breaks when routing keys are blank/whitespace (not null); always parse first.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
