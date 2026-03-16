
## 2026-03-12 — Task 23 complete-task usage telemetry
- `bin/mac10` can add optional structured payloads cleanly by stripping command-specific flags (for example `--usage`) before existing positional argument heuristics.
- `cli-server` command schemas only do shallow typing, so nested payloads require explicit normalization/validation in `validateCommand` and reuse in handlers.
- For new task telemetry fields, update all three surfaces together: `schema.sql`, DB startup migration helpers, and `VALID_COLUMNS.tasks` allowlist.

## 2026-03-12 — Task 31 model_source task telemetry persistence
- For task telemetry fields, update all three surfaces together: `coordinator/src/schema.sql` for fresh DBs, `ensureTaskRoutingTelemetryColumns` in `coordinator/src/db.js` for existing DB migrations, and `VALID_COLUMNS.tasks` to keep `updateTask` writes allowed.
- Keeping migration checks idempotent with `PRAGMA table_info(tasks)` + `includes` guards avoids regressions when a column already exists.
## 2026-03-13 — depends_on promotion must require dependency existence
- In `checkAndPromoteTasks`, counting only unfinished dependencies is insufficient because nonexistent IDs are excluded by `IN (...)` and can incorrectly unblock tasks.
- Gate promotion by checking both `total == uniqueDeps.length` and `completed == uniqueDeps.length` for dependency IDs.
- Add regressions for both missing-only dependency sets and mixed existing+missing sets to prevent premature readiness.

## 2026-03-13 — Loop-request WHAT quality-gate verb coverage
- `LOOP_REQUEST_WHAT_SIGNAL_RE` should include concrete optimization verbs beyond fix/update/add/remove; `replace`, `sync`, `align`, `extend`, and `improve` prevent false WHAT suppressions when WHERE/WHY signals are present.
- WHERE signal parsing should accept concrete repo paths with and without filename extensions (for example `coordinator/bin/mac10`) to avoid rejecting valid loop requests.

## 2026-03-13 — Loop-request WHAT verb coverage guardrails
- `LOOP_REQUEST_WHAT_SIGNAL_RE` in `coordinator/src/db.js` now accepts concrete verbs `replace|sync|align|extend|improve` in addition to legacy verbs.
- Quality gating still requires all three dimensions in `evaluateLoopRequestQuality`: WHAT verb, WHERE file-path signal, and WHY production-risk signal.
- Keep a regression in `coordinator/tests/cli.test.js` that starts description with `Replace` and includes file paths + production impact language, plus a vague WHERE-missing rejection test.

## 2026-03-13 — Task 121 merge/integration validation reland
- For overlap merge-fix tasks targeting `coordinator/src/db.js` + `coordinator/tests/cli.test.js`, first verify whether task #100/#105 loop-request quality/rate-limit logic is already present on latest `origin/main`; many relands are validation-only.
- Re-run `git fetch origin && git rebase origin/main` immediately before final validation because `origin/main` may advance during long `npm test` runs.
- Tier-2 validation evidence: `cd coordinator && npm test -- tests/cli.test.js` passed after sync (175/175).

## 2026-03-13 — Task 129 validation-only overlap merge-fix
- For overlap merge-validation tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, run the required tier-2 regression (`cd coordinator && npm test -- tests/cli.test.js`) and complete as validation-only instead of forcing a no-op PR.

## 2026-03-13 — Merge-validation overlap tasks can be validation-only
- For overlap conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, run the tier-2 regression (`cd coordinator && npm test -- tests/cli.test.js`) and complete as validation-only without forcing a no-op PR.

## 2026-03-13 — Task 136 functional conflict merge-validation (task #133)
- For coordinator-core overlap tasks citing `npm run build` failures, first compare scoped files against `origin/main`; if empty, treat as validation-only rather than re-landing stale edits.
- Tier-2 evidence remains `cd coordinator && npm test -- tests/cli.test.js`; current main covers overlap validation command selection and passes without requiring a `build` script.

## 2026-03-13 — loop-request dedupe ordering guard
- In createLoopRequest, run active duplicate detection (exact + similar active) before throughput suppression checks (cooldown + max-per-hour) so immediate duplicate submissions dedupe instead of returning cooldown suppression.
- Keep throughput controls for non-duplicate traffic and assert ordering with state-machine regressions for exact-active and near-identical active duplicate paths.

## 2026-03-13 — idle follow-up (worker 6)
- No task assigned after startup retry and follow-up check; no new coordinator-core implementation learnings this cycle.

## 2026-03-13 — Overlap merge-conflict validation-only handling
- For overlap conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and run `git diff origin/main -- <scoped files>` before editing.
- If the scoped diff is empty, treat as validation-only and run `cd coordinator && npm test -- tests/cli.test.js`; avoid forcing no-op reland commits/PRs.

## 2026-03-13 — Task 141 overlap functional-conflict validation-only
- For overlap merge-validation tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, complete as validation-only and run tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` instead of forcing a reland/PR.

## 2026-03-13 — Task 143 overlap functional conflict validation-only
- For overlap conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and run `git diff origin/main -- <scoped files>`.
- If scoped diff is empty, treat as validation-only and run `cd coordinator && npm test -- tests/cli.test.js`; report completion without forcing a no-op PR.
## 2026-03-13 — overlap conflict task 146 validation-only pattern
- For merge-validation conflicts scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and check `git diff origin/main -- <scoped files>`.
- If scoped diff is empty, run `cd coordinator && npm test -- tests/cli.test.js` and complete as validation-only; no reland edits needed.

## 2026-03-13 — Task 146 overlap functional conflict validation-only
- For overlap conflict tasks scoped to `coordinator/src/db.js` + `coordinator/tests/cli.test.js`, sync to `origin/main` and run `git diff origin/main -- <scoped files>` first.
- If scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/cli.test.js` (current full run passed 182/182).
- Use result-only `codex10 complete-task` for validation-only completions to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 149 overlap functional-conflict validation-only
- For overlap conflicts scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main`, check `git diff origin/main -- <scoped files>`, and if empty treat as validation-only.
- Required tier-2 evidence remains `cd coordinator && npm test -- tests/cli.test.js`; if passing, complete with result-only `codex10 complete-task` summary to avoid placeholder PR parsing.

## 2026-03-13 — Task 154 overlap functional conflict validation-only
- For overlap merge-conflict tasks scoped to coordinator/src/db.js and coordinator/tests/cli.test.js, sync to origin/main and check git diff against those files first.
- If scoped diff is empty, resolve as validation-only and run cd coordinator && npm test -- tests/cli.test.js; report completion without forcing no-op reland edits/PRs.

## 2026-03-13 — Task 160 overlap functional conflict validation-only
- For overlap conflicts scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, create a fresh task branch from `origin/main` if the current worker branch is ahead to avoid carrying unrelated history.
- If `git diff origin/main -- <scoped files>` is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/cli.test.js` as Tier-2 evidence.
- Close validation-only tasks with result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 164 overlap functional conflict validation-only
- For overlap conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` and check `git diff origin/main -- <scoped files>` first.
- If scoped diff is empty, treat as validation-only and run `cd coordinator && npm test -- tests/cli.test.js` for Tier-2 evidence.
- Close validation-only tasks with result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 166 overlap functional conflict validation-only
- For overlap functional-conflict tasks in `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, the conflict can be fully resolved by sync + scoped diff validation when main already contains merged behavior.
- Required Tier-2 evidence remains `cd coordinator && npm test -- tests/cli.test.js`; current run passed 182/182 after `git fetch origin && git rebase origin/main`.
- `codex10 complete-task` result-only mode is the safest completion path when no scoped code changes are required.

## 2026-03-13 — Task 170 overlap functional conflict validation-only
- For overlap functional-conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync with `git fetch origin && git rebase origin/main`, then check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/cli.test.js` (current run passed 182/182).
- Close validation-only overlap tasks using result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 173 overlap functional conflict validation-only
- For overlap conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` and run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/cli.test.js` (current run passed 182/182).
- Close validation-only overlaps using result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 173 overlap functional-conflict validation-only
- For overlap conflicts scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync to `origin/main` first and check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/cli.test.js`; avoid no-op reland commits.
- Close validation-only tasks with result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 178 overlap functional conflict validation-only
- For overlap merge-conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync with `git fetch origin && git rebase origin/main` first, then run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/cli.test.js` (current run passed 184/184).
- Close validation-only overlap tasks using result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — Task 178 overlap functional-conflict validation-only
- For overlap conflict tasks scoped to `coordinator/src/db.js` and `coordinator/tests/cli.test.js`, sync with `git fetch origin && git rebase origin/main`, then run `git diff origin/main -- <scoped files>` before editing.
- If the scoped diff is empty, resolve as validation-only and run Tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` (current run passed 184/184).
- Close validation-only completions via result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-13 — forward-compatible usage extras for complete/fail task
- Keep strict canonical validation for known usage token/cost fields, but pass unknown provider keys through usage normalization so complete-task/fail-task do not hard-fail when providers add fields.
- Preserve unknown usage keys for diagnostics by retaining them in normalized `usage` payloads that flow into allocator mail/activity logs, while `mapUsagePayloadToTaskFields` continues persisting only known mapped columns.
- Regression coverage should validate both paths (`complete-task` and `fail-task`) with extra provider fields (`service_tier`, `tool_use_prompt_token_count`, `thoughts_token_count`) and assert known usage columns still persist unchanged.

## 2026-03-13 — Forward-compatible complete/fail usage payloads
- In complete-task/fail-task usage normalization, keep strict type validation + canonical mapping for known usage fields, but do not reject unknown provider-specific fields.
- Preserve unknown usage keys in the usage object so allocator mail/activity-log diagnostics can include provider extras while DB persistence remains known-fields-only.
- Regressions should assert both success-path completion/failure and known usage metric persistence, plus explicit presence of unknown extras in diagnostic payloads.

## 2026-03-13 — Burn-rate terminal-status coverage
- `getUsageCostBurnRate` should aggregate `usage_cost_usd` for both terminal statuses (`completed`, `failed`) in global 15m/60m/24h windows and request totals.
- Keep `completed_at` filters unchanged so rows without completion timestamps are excluded from burn-rate and request-total spend.
- Add regression coverage in `coordinator/tests/state-machine.test.js` to assert completed + failed in-window spend is counted together.

## 2026-03-13 — idle follow-up (worker 6)
- No task assigned after startup retry and follow-up check; no new coordinator-core implementation learnings this cycle.

## 2026-03-16 — browser-offload task persistence/lifecycle baseline
- For new task-level telemetry/state models, update all three persistence surfaces together: `coordinator/src/schema.sql` for fresh DBs, an idempotent `ensure*Columns` migration in `coordinator/src/db.js` for existing DBs, and `VALID_COLUMNS.tasks` so `updateTask` can persist new fields.
- A dedicated transition helper (here `transitionTaskBrowserOffload`) should enforce valid state progression and restrict mutable fields, while still writing via `updateTask` so shared timestamp/update semantics remain consistent.
- Add state-machine regressions that cover both happy-path lifecycle progression and invalid transition rejection to prevent future coordinator regressions.

## 2026-03-16 — project-memory persistence model + snapshot index (task 10)
- Keep new persistence features aligned across all three surfaces: `coordinator/src/schema.sql`, an idempotent `ensure*Schema` migration in `coordinator/src/db.js`, and startup wiring in `coordinator/src/index.js` when runtime index rebuild/bootstrap behavior is required.
- For versioned per-project memory, use append-only snapshot rows (`project_context_key` + `snapshot_version` unique), maintain a lightweight latest-snapshot index table, and provide an explicit `rebuildProjectMemorySnapshotIndex` recovery path for index consistency.
- Insight artifacts should version by (`project_context_key`, `artifact_type`, `dedupe_fingerprint`) and carry governance (`source`, `confidence_score`, `validation_status`, retention) plus lineage (`request_id`, `task_id`, `run_id`) so dedupe/relevance/validation filters stay queryable without destructive updates.

## 2026-03-16 — Task 10 project-memory persistence validation-only checkpoint
- For coordinator-core tasks scoped to `coordinator/src/schema.sql`, `coordinator/src/db.js`, and `coordinator/src/index.js`, sync to `origin/main` first and run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, close as validation-only and run Tier-3 evidence commands: `cd coordinator && npm test -- tests/state-machine.test.js` plus `cd coordinator && node --test tests/web-server.test.js`.
- Use result-only `codex10 complete-task` for validation-only closure to avoid placeholder PR/branch parsing issues.

## 2026-03-16 — worker claim timestamp lifecycle consistency (task 20)
- Add worker claim state fields across all three persistence surfaces together: `coordinator/src/schema.sql`, workers-column migration in `coordinator/src/db.js`, and lifecycle write paths in `coordinator/src/cli-server.js`.
- Keep claim semantics atomic by setting `claimed_by` and `claimed_at` in the same `claimWorker` update, and clear both fields together in release/reset paths to prevent stale reservation timestamps.
- For backward compatibility on existing databases, use idempotent `PRAGMA table_info(workers)` migration guards and normalize pre-existing rows so `claimed_at` is null when `claimed_by` is null.

## 2026-03-16 — Task 23 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and related watchdog/allocator/cli tests, sync with `git fetch origin && git rebase origin/main` first and check `git diff origin/main -- <scoped files>`.
- If scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` for Tier-2 evidence in this repository context.
- Close validation-only completions with result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-16 — Task 25 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and related watchdog/allocator/cli tests, sync first with `git fetch origin && git rebase origin/main` and check `git diff origin/main -- <scoped files>` before editing.
- If the scoped diff is empty, resolve as validation-only and run `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` for Tier-2 evidence.
- Close validation-only overlap tasks with result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-16 — Task 30 overlap functional conflict validation-only
- For overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync first with `git fetch origin && git rebase origin/main` and check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- Close validation-only completions with result-only `codex10 complete-task` to avoid placeholder PR/branch parsing issues.

## 2026-03-16 — Task 33 overlap functional conflict validation-only
- For overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync to `origin/main` first and run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`; current run passed 211/211.
- This repo context may not include a `build` script; rely on overlap validation command selection behavior and explicit test command evidence rather than forcing `npm run build`.

## 2026-03-16 — Task 39 overlap functional conflict validation-only
- For overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync to `origin/main` first and run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`; current run passed 212/212.
- When the reported failure is `npm run build` missing script, close with explicit test-command evidence and result-only `codex10 complete-task`.

## 2026-03-16 — Task 38 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync with `git fetch origin && git rebase origin/main` first and check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- This repo context may not include a build script; rely on explicit scoped regression evidence rather than forcing `npm run build`.

## 2026-03-16 — Task 40 overlap functional conflict validation-only
- For overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync first with `git fetch origin && git rebase origin/main` and check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- When reported failure is missing `npm run build`, provide explicit scoped test evidence and close with result-only `codex10 complete-task`.

## 2026-03-16 — Task 43 overlap functional conflict validation-only
- For coordinator-core overlaps scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync to `origin/main` and run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- Missing `npm run build` script failures should be addressed with explicit scoped regression evidence rather than forcing no-op relands.

## 2026-03-16 — Task 44 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync with `git fetch origin && git rebase origin/main` and run `git diff origin/main -- <scoped files>` first.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- When reported failure is missing `npm run build`, rely on explicit scoped regression evidence and close with result-only `codex10 complete-task`.

## 2026-03-16 — Task 46 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync first with `git fetch origin && git rebase origin/main`, then check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` (current run passed 215/215).
- For missing `npm run build` overlap reports in this repo context, close with explicit scoped test-command evidence and result-only `codex10 complete-task`.

## 2026-03-16 — Task 48 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync first with `git fetch origin && git rebase origin/main`, then run `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- Missing `npm run build` script reports should be closed with explicit scoped regression evidence rather than forcing no-op relands.

## 2026-03-16 — Task 49 overlap functional conflict validation-only
- For coordinator-core overlap conflicts scoped to `coordinator/src/watchdog.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`, and watchdog/allocator/cli tests, sync with `git fetch origin && git rebase origin/main` first, then check `git diff origin/main -- <scoped files>` before editing.
- If scoped diff is empty, resolve as validation-only and run Tier-2 evidence `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js`.
- When the reported failure is missing `npm run build` in this repo context, rely on explicit scoped regression evidence and close via result-only `codex10 complete-task`.
