---
doc_kind: reference
scope: project
owner: domains/coordinator-tests
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - coordinator/tests/cli.test.js
  - coordinator/tests/allocator.test.js
  - coordinator/tests/watchdog.test.js
  - coordinator/tests/dashboard-render.test.js
---

# Coordinator Tests

## Executive Summary
- Regression test suite for coordinator CLI, allocator, watchdog, and dashboard rendering
- Tests run deterministically using tmp dirs, seeded DB rows, and VM-based render harnesses
- Biggest foot-gun: merge-conflict tasks on test files often require validation-only closure, not code edits
- Full suite: `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` (215+ tests)

## Invariants and Contracts
- `/api/status` assertions must be deterministic: seed explicit task rows and allocator `task_assigned` logs
- `complete-task` with `--usage JSON` must persist `usage_model`, token/cache counts, `usage_total_tokens`, `usage_cost_usd`
- Backward-compat: `usage_*` columns remain null when no usage payload is provided
- `usage.model` is trimmed before DB write; use whitespace-padded model values to prove normalization

## Key Patterns
- **Web server tests**: start via `webServer.start(tmpDir, 0)` and assert `/api/status` payload over localhost HTTP
- **Dashboard render harness**: extract `renderTasks` from `gui/public/app.js` via `vm` context; assert generated HTML without browser
- **Telemetry hydration**: `model_source` from allocator `task_assigned` log details; routing fields from row with log fallback
- **Rollback regressions**: force `assign-task` failure via `onAssignTask` handler that throws; assert telemetry restoration and worker idle reset

## Pitfalls
- **Merge-conflict validation-only trap**: scoped test overlap tasks often have zero diff vs `origin/main`. Always run `git diff origin/main -- <scoped files>` before editing. If empty, close as validation-only.
- **Validation-only workflow**: rebase onto `origin/main`, run scoped diff, scan for conflict markers, then run tests with explicit pass counts as proof.

## Changelog (last 5)
- 2026-03-16: Condensed from append-only domain file into living doc
