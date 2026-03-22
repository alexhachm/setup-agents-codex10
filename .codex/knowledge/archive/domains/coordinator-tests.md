
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

## 2026-03-16 — Merge-conflict validation-only workflow
- For coordinator test overlap tasks scoped to existing merged files, first run `git diff origin/main -- <scoped files>` and conflict-marker scan before editing; if diff is empty, treat as validation-only.
- Close the task with tier-2 proof by running `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` and reporting explicit pass counts.

## 2026-03-16 — Merge-conflict validation-only checkpoint (task 36)
- For scoped coordinator test overlap tasks, confirm merge cleanliness by rebasing onto `origin/main`, then running `git diff origin/main -- <scoped files>` plus conflict-marker scan before editing.
- If scoped diff is empty and no markers exist, close as validation-only and provide tier-2 evidence with `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` pass counts.

## 2026-03-16 — Merge-conflict validation-only (task 37)
- For scoped coordinator test overlap merge tasks, sync with `git fetch origin && git rebase origin/main`, then run `git diff origin/main -- <scoped files>` and `rg -n "^(<<<<<<<|=======|>>>>>>>)" <scoped files>` before editing.
- If scoped diff is empty and no conflict markers are found, close as validation-only and provide tier-2 evidence from `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with pass counts.

## 2026-03-16 — Merge-conflict validation-only checkpoint (task 42)
- For coordinator test overlap/merge tasks, rebase onto `origin/main` first, then run scoped checks: `git diff origin/main -- coordinator/tests/allocator.test.js coordinator/tests/watchdog.test.js coordinator/tests/cli.test.js` and `rg -n "^(<<<<<<<|=======|>>>>>>>)"` on the same files.
- If scoped diff is empty and no markers exist, close as validation-only and provide tier-2 evidence with `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` including explicit pass totals (212/212 in this run).

## 2026-03-16 — Merge-conflict validation-only checkpoint (task 50)
- For coordinator test overlap merge tasks, rebase to `origin/main`, then run scoped `git diff origin/main -- coordinator/tests/allocator.test.js coordinator/tests/watchdog.test.js coordinator/tests/cli.test.js` and conflict-marker scans before editing.
- If scoped diff is empty and no markers are found, close as validation-only and validate with `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js`; this run passed 215/215.

## 2026-03-16 — Merge-conflict validation-only workflow (task 50)
- For scoped coordinator test merge-conflict tasks, after `git fetch origin && git rebase origin/main`, run `git diff origin/main -- coordinator/tests/allocator.test.js coordinator/tests/watchdog.test.js coordinator/tests/cli.test.js` plus `rg -n "^(<<<<<<<|=======|>>>>>>>)"` on the same files.
- If diff is empty and no markers are found, close as validation-only and provide tier-2 evidence using `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with explicit pass totals.

## 2026-03-16 — Merge-conflict validation-only checkpoint (task 52)
- For scoped coordinator test merge-conflict tasks, rebase to `origin/main`, then run `git diff origin/main -- coordinator/tests/allocator.test.js coordinator/tests/watchdog.test.js coordinator/tests/cli.test.js` and conflict-marker scans before editing.
- If scoped diff is empty and no markers are found, close as validation-only and validate with `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js`; this run passed 215/215.

## 2026-03-16 — Merge-conflict validation-only checkpoint (task 55)
- For coordinator test overlap merge tasks, sync with `git fetch origin && git rebase origin/main`, then run scoped `git diff origin/main -- coordinator/tests/allocator.test.js coordinator/tests/watchdog.test.js coordinator/tests/cli.test.js` and conflict-marker scans before editing.
- If scoped diff is empty and no markers are found, close as validation-only and validate with `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js`; this run passed 215/215.

## 2026-03-16 — Merge-conflict validation-only (task 55)
- For coordinator test overlap merge-conflict tasks scoped to `allocator.test.js`, `watchdog.test.js`, and `cli.test.js`, rebase onto `origin/main` first, then run scoped `git diff origin/main -- <files>` and conflict-marker scan before editing.
- If scoped diff is empty and markers are absent, treat as validation-only and prove tier-2 with `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` including explicit pass totals.
