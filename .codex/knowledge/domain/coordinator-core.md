
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
