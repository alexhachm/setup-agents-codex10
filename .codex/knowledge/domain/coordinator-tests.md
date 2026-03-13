
## 2026-03-12 — Task 20 telemetry regression coverage
- `web-server` status contract tests can run deterministically by starting `webServer.start(tmpDir, 0)` and asserting `/api/status` payload via localhost HTTP requests.
- Task-level `model_source` is hydrated from allocator `task_assigned` log details, while `routing_class`/`routed_model`/`reasoning_effort` can come from row fields with log fallback.
- Dashboard rendering helpers can be regression-tested without browser/network by evaluating the render-function slice from `gui/public/app.js` in a `vm` context and asserting generated `tasks-list` HTML.

## 2026-03-12 — Telemetry contract regression coverage
- Keep `/api/status` assertions deterministic by seeding explicit task rows and allocator `task_assigned` logs, then validating both config-driven budget snapshots and `none` defaults.
- For dashboard rendering harness tests, isolate `renderTasks` via VM snippet extraction and assert both populated telemetry chip output and complete chip omission when telemetry fields are null/absent.

## 2026-03-12 — complete-task usage telemetry regressions
- For deterministic CLI coverage, assert usage telemetry persistence via `db.getTask(taskId)` fields after `sendCommand('complete-task', { usage })`.
- Use a whitespace-padded usage model in tests to prove command payload normalization (`usage.model` is trimmed) before DB write.
- Backward-compatibility path should explicitly assert `usage_*` columns remain null when no usage payload is provided.

## 2026-03-12 — complete-task usage telemetry coverage
- `coordinator/tests/cli.test.js` already includes deterministic end-to-end complete-task usage assertions for parser normalization and persisted DB fields (`usage_model`, token/cache counts, `usage_total_tokens`, `usage_cost_usd`).
- Backward-compat behavior is covered by the worker lifecycle completion test asserting null usage columns when no usage payload is provided.

## 2026-03-12 — Task 34 model_source persistence + API parity regressions
- CLI rollback regressions can force assign-task failure by restarting `cliServer.start(...)` with an `onAssignTask` handler that throws, then asserting task telemetry restoration (`routing_class`, `routed_model`, `model_source`, `reasoning_effort`) and worker idle reset.
- API parity for hydrated routing telemetry is best asserted by comparing `/api/tasks` and `/api/requests/:id` task maps for the same request, with one task seeded from task-row `model_source` and another from allocator `task_assigned` log fallback.
