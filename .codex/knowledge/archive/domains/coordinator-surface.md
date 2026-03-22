
## 2026-03-12 — Task 18 telemetry status shaping
- Prefer a shared `buildStatePayload` helper in `web-server.js` so `/api/status` and websocket `init/state` stay in sync.
- For routing telemetry display, hydrate `model_source` from latest allocator `task_assigned` log details because tasks table does not persist it.
- When task-row routing fields are null/missing, fallback to latest `activity_log` telemetry by `task_id` without schema changes.
- Budget snapshot can be derived from `routing_budget_state` config first, then allocator telemetry as fallback (`routing_budget_state`/`routing_budget_source`).

## 2026-03-12 — Task 26 usage parity note
- Keep ALLOCATOR help text in `coordinator/bin/mac10` aligned with implemented handlers so `printUsage()` documents `claim-worker` and `release-worker` alongside assignment commands.

## 2026-03-12 — Task 33 API parity for task telemetry hydration
- Reuse a shared task-hydration helper for `/api/status`, `/api/tasks`, and `/api/requests/:id` so routing telemetry (including `model_source`) is derived uniformly from task rows with allocator `task_assigned` fallback.
- `model_source` should prefer task-row value when present, then fallback log telemetry, matching backward-compatible payload shape while improving provenance completeness.

## 2026-03-12 — Task 33 task-endpoint hydration parity
- Keep `/api/status`, `/api/tasks`, and `/api/requests/:id` aligned by routing all three through the same task hydration helper so `model_source` and related routing fields stay consistent.
- Shared hydration should remain backward-compatible by preserving existing task payload shape and only enriching missing telemetry fields.
## 2026-03-12 — scalar budget fallback parity for web status snapshot
- In `buildBudgetSnapshotFromConfig`, parse `routing_budget_flagship_remaining/threshold` first and only parse legacy `flagship_budget_*` keys when the parsed routing scalar is `null`; raw-string nullish coalescing breaks legacy fallback when routing keys are blank/whitespace.
- Regression can live in `coordinator/tests/cli.test.js` by starting `web-server` with `port=0`, requesting `/api/status`, and asserting `routing_budget_state/source` prefer config scalar fallback over allocator-log budget telemetry.

## 2026-03-12 — Task 41 status row sanitization
- For terminal status surfaces in `coordinator/bin/mac10`, sanitize request description fields before truncation/formatting so CR/LF/tab and other control chars cannot break one-row-per-request parsing.
- CLI rendering regressions should execute `bin/mac10` asynchronously from tests (avoid `spawnSync` deadlocks with in-process test servers) and assert both `status` and `loop-requests` outputs stay row-stable with malicious descriptions.

## 2026-03-12 — status/loop request row sanitization parity
- Keep CLI request-row rendering on a shared single-line sanitizer that strips control characters before width truncation to preserve parser-stable one-row output.
- Maintain regression tests that inject newline/tab/control-byte descriptions in both `status` and `loop-requests` CLI output paths to prevent faux row/status token injection.

## 2026-03-13 — complete-task usage normalization compatibility
- Normalize OpenAI usage aliases (`prompt_tokens` -> `input_tokens`, `completion_tokens` -> `output_tokens`) alongside existing Anthropic aliases in both CLI (`bin/mac10`) and server ingestion (`cli-server.js`) to keep persisted task usage fields consistent.
- Flatten nested cached-token details from `input_tokens_details.cached_tokens` and `prompt_tokens_details.cached_tokens` before unsupported-key validation so OpenAI-native usage payloads are accepted without weakening unknown-key guards.
- Keep conflict checks canonical-key based so disagreeing duplicate aliases fail deterministically with stable error keys.

## 2026-03-16 — loop-checkpoint active gating parity
- `loop-checkpoint` should mirror `loop-request` by rejecting non-active loop statuses before any `db.updateLoop` mutation, preserving `last_checkpoint` and `iteration_count` for stopped/paused loops.
- Before relanding coordinator-surface fixes, run `git diff origin/main -- coordinator/src/cli-server.js coordinator/tests/cli.test.js` to avoid redundant no-op edits when regressions are already present.
