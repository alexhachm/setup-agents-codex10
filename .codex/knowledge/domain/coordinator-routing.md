
## 2026-03-12 — Budget-aware fallback model downscale/restore
- In fallback routing, keep `routing_class` tied to task complexity, but use a separate effective class for model tier selection when budget is constrained.
- Budget constraint gate: downscale only when both `remaining` and `threshold` parse as finite numbers and `remaining <= threshold`.
- Add CLI-level `assign-task` tests to verify routing transitions end-to-end under both constrained and recovered budget state.

## 2026-03-12 — Validation checkpoint
- Before editing routing code, check `cli.test.js` for existing budget-aware coverage; this task’s downgrade/recover cases were already implemented and passing.
- `routeTask` downgrade behavior remains deterministic by gating only `high`/`mid` via `effectiveClass` while preserving original `routing_class` in responses.

## 2026-03-12 — Budget telemetry semantics in fallback assign-task path
- Use explicit enum-like values for fallback downgrade telemetry so downstream consumers can distinguish constrained vs healthy routing (`budget-downgrade:model_*` vs `fallback-routing:model_*`, and `fallback-budget-downgrade:*` vs `fallback-routing:class-default`).
- Mirror `routing_reason` across assign-task response, worker mail payload, and allocator log payload to keep assigned-task records and persisted telemetry consistent.

## 2026-03-12 — Fallback budget routing verification
- Budget downgrade activates only when both `flagship.remaining` and `flagship.threshold` parse as finite numbers and `remaining <= threshold`.
- Keep `routing_class` from complexity while using downgraded effective class for model/effort when constrained; emit downgrade-specific `model_source` and `routing_reason` in assign-task response, mail, and allocator logs.

## 2026-03-12 — Assign-task routing telemetry persistence
- Persist routing telemetry (`routing_class`, `routed_model`, `reasoning_effort`) on `tasks` immediately after `routeTask` so task rows carry the same routing data sent in mail/log/CLI response.
- If assignment spawn fails after routing persistence, include telemetry fields in rollback `db.updateTask` to restore prior values alongside `status`/`assigned_to`.
- Migration safety should cover both existing and fresh databases: add telemetry columns via init-time `PRAGMA table_info(tasks)` checks and allow those fields through `db.updateTask` column validation.

## 2026-03-12 — Telemetry persistence verification workflow
- Before editing `assign-task`, confirm whether routing telemetry persistence already exists in `cli-server.js`, `db.js` allowlist/migrations, and `security.test.js`; this task can be fully satisfied by validation-only when already merged.
- `node --test tests/security.test.js` currently covers both writable telemetry columns and non-null telemetry persistence after assignment (`Atomic task assignment via CLI`).

## 2026-03-12 — Fallback upscale + reasoning key resolution
- In fallback routing, derive `reasoning_effort` from `reasoning_<effective_class>` (for whichever class is actually selected after budget scaling) instead of hardcoded high/low mapping.
- Budget-aware effective class can move both directions while preserving `routing_class`: constrained budget keeps downgrade semantics (`fallback-budget-downgrade:*` / `budget-downgrade:model_*`), healthy budget can upscale high-complexity tasks (`fallback-budget-upgrade:high->xhigh` / `budget-upgrade:model_xhigh`).
- CLI assignment regressions should assert routing metadata parity across response, worker mail payload, and allocator log payload for both downgrade and upgrade transitions.

## 2026-03-12 — Task 5 validation-only checkpoint
- Before editing fallback routing, verify whether `origin/main` already contains PR #51 updates in `coordinator/src/cli-server.js` and `coordinator/tests/cli.test.js`.
- Regression coverage for constrained budget, recovered budget, and per-effective-class reasoning is present in `tests/cli.test.js`; rerun `node --test tests/cli.test.js` to confirm behavior (15/15 passing in this run).

## 2026-03-12 — Fallback model_source attribution for default vs explicit class override
- For fallback routes with no budget shift (`routing_class === effective_class`), set `model_source` to `fallback-default` when `model_<effective_class>` is not explicitly configured and to `config-fallback` when it is explicitly configured with a non-empty value.
- Preserve existing budget shift attribution (`budget-downgrade:model_*` / `budget-upgrade:model_*`) for constrained/healthy transitions.
- Add assign-task regressions that assert `model_source` parity across CLI response and allocator log payloads for both default and override paths.

## 2026-03-12 — Task 6 validation-only confirmation
- Before editing fallback attribution, verify whether PR #53 is already merged into `origin/main`; if present, treat the task as validation-only.
- `node --test tests/cli.test.js` should include the default-vs-override assign-task coverage and pass end-to-end (17/17 in this run).
## 2026-03-12 — Task 7 validation-only checkpoint
- `origin/main` already includes budget-aware fallback downgrade/recovery behavior plus deterministic assign-task CLI regressions for constrained vs recovered `routing_budget_state`.
- Tier-2 validation for this request is satisfied by `cd coordinator && npm test` (currently 88/88 passing in this environment).
## 2026-03-12 — Idle cycle follow-up
- Worker follow-up polling returned no newly assigned coordinator-routing task after the required retry windows.
- Distilled prior checkpoint: this domain’s budget-aware fallback downgrade/recovery coverage remains tracked in existing Task 7 notes.
## 2026-03-12 — Spark model alias support in fallback routing
- Fallback spark model resolution should treat `model_spark` and `model_codex_spark` as aliases: prefer `model_spark` when set, otherwise fall back to `model_codex_spark` before the hard default.
- `set-config` should mirror writes across both spark keys so operators cannot set one spark key that fallback routing ignores.
- Add assign-task CLI regressions for alias-only routing (`model_spark` unset, `model_codex_spark` set) and for routing behavior after setting each spark key via `set-config`.
## 2026-03-12 — Idle cycle follow-up (worker 2)
- Startup/read/distill protocol executed with no assigned task after immediate retry and 15s follow-up check.
- No new coordinator-routing changes were made in this cycle.

## 2026-03-12 — Task 11 validation-only confirmation
- `origin/main` already contains spark alias fallback routing (`model_spark` -> `model_codex_spark` -> default) and mirrored spark key writes in `set-config`.
- Tier-2 validation for this request is satisfied by `cd coordinator && npm test -- --runInBand` (90/90 passing in this run).

## 2026-03-12 — Assign-task telemetry schema alignment
- Even when `assign-task` persistence and `db.updateTask` allowlisting already exist, keep `coordinator/src/schema.sql` in sync by declaring `routing_class`, `routed_model`, and `reasoning_effort` directly on `tasks` for fresh database consistency.
- Runtime safety remains in `ensureTaskRoutingTelemetryColumns`, which preserves compatibility for older DB files missing these columns.

## 2026-03-12 — Spark alias precedence in fallback router
- In fallback routing, resolve spark model as model_codex_spark first, then model_spark, then the default spark model.
- Keep model_source as config-fallback when either spark alias provides the selected model, and assert parity in allocator assignment logs.

## 2026-03-12 — Task 12 validation-only confirmation
- `origin/main` already contains fallback spark alias precedence with `model_codex_spark` preferred and `model_spark` compatibility fallback in `fallbackModelRouter.routeTask`.
- Assign-task regressions in `coordinator/tests/cli.test.js` already verify both codex-key precedence and legacy `model_spark` behavior, including `model_source` telemetry parity in allocator logs.
- Tier-2 validation remains `cd coordinator && npm test -- --runInBand` (91/91 passing in this run).

## 2026-03-12 — Task 13 validation-only confirmation
- `origin/main` already satisfies fallback routing requirements in `coordinator/src/cli-server.js`: default class picks emit `model_source=fallback-default`, explicit overrides emit `config-fallback`, reasoning effort is read from `reasoning_<effective_class>`, and spark model resolution uses `model_codex_spark` with `model_spark` compatibility fallback.
- Existing regressions in `coordinator/tests/cli.test.js` already cover response/log telemetry parity and spark alias behavior; tier-2 validation remains `cd coordinator && npm test` (91/91 passing in this run).
## 2026-03-12 — Idle follow-up (worker 2)
- Startup protocol completed (knowledge files read + assignment polling), but no task was assigned after immediate retry and 15s follow-up check.
- No code changes were made in this cycle.

## 2026-03-12 — Assign-task telemetry persistence regression in CLI suite
- When routing telemetry persistence is implemented in `assign-task`, keep coverage in `coordinator/tests/cli.test.js` by asserting task-row `routing_class`, `routed_model`, and `reasoning_effort` after assignment.
- Assert persisted task columns against the returned assignment routing payload to avoid brittle expectations tied to specific configured model strings.

## 2026-03-12 — Idle cycle follow-up (worker 2)
- Startup/read/poll/follow-up checks were completed with no assigned task.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Task 15 validation-only reland checkpoint
- After syncing with `origin/main`, fallback routing already satisfies the stale optimization requirements: default-vs-config `model_source`, `model_codex_spark` first with `model_spark` compatibility fallback, and `reasoning_<effective_class>` derivation.
- In fresh worktrees, Tier-2 validation may fail until `cd coordinator && npm install` is run to provide `better-sqlite3`; once installed, `npm test` passed 92/92.

## 2026-03-12 — Task 15 validation-only re-land check
- Synced `origin/main` already contains fallback routing fixes: accurate default-vs-config `model_source`, spark alias resolution (`model_codex_spark` primary, `model_spark` compatibility fallback), and reasoning from `reasoning_<effective_class>`.
- Tier-2 validation for this checkpoint remains `cd coordinator && npm test -- --runInBand` (92/92 passing in this run).

## 2026-03-12 — Task 17 validation-only checkpoint
- On synced `origin/main`, assign-task routing telemetry persistence and tasks-table allowlisting were already in place in `coordinator/src/cli-server.js` and `coordinator/src/db.js`.
- `coordinator/tests/security.test.js` already includes coverage asserting persisted non-null `routing_class`, `routed_model`, and `reasoning_effort` after `assign-task`; tier-2 validation passed with `cd coordinator && npm test -- tests/security.test.js` (92/92).

## 2026-03-12 — Idle cycle follow-up (worker 3)
- Startup/read/poll/follow-up checks completed with no assigned task after immediate retry and 15s wait.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Merge ownership collision hardening
- In `queueMergeWithRecovery`, if a new insert resolves to a `pr_url` already owned by another request/task, delete the just-inserted row and return `duplicate_pr_owned_by_other_request` (or `existing_pr_owned_by_other_request` in pre-existing-owner lookups) instead of treating queueing as success.
- `complete-task` and `integrate` should treat those ownership reasons as merge failure signals: mark the task failed, emit `task_failed` mail, and return `ok:false` with `error=merge_queue_rejected`.
- Regression tests should assert only one merge_queue owner remains for a reused PR URL across requests and that the losing task/request does not advance to completed.

## 2026-03-12 — Task 9 merge ownership collision hardening validation
- `queueMergeWithRecovery` rejects cross-request PR URL ownership collisions with explicit reasons (`existing_pr_owned_by_other_request`, `duplicate_pr_owned_by_other_request`) and removes duplicate inserted rows.
- `complete-task` and `integrate` treat those reasons as merge queue failures (`merge_queue_rejected`), mark affected tasks failed, and prevent stale cross-request PR reuse from advancing request completion.
- Regression coverage in `coordinator/tests/cli.test.js` validates both `complete-task` and `integrate` collision paths; tier-2 validation passed with `cd coordinator && npm test -- tests/cli.test.js`.

## 2026-03-12 — Task 22 validation-only confirmation
- Synced `origin/main` already contains cross-request PR ownership hardening: inserted duplicate merge rows are removed and rejected with `duplicate_pr_owned_by_other_request`, while existing-owner lookups return explicit ownership-collision reasons.
- `complete-task` and `integrate` both convert these collision reasons into `merge_queue_rejected` task failures, preventing reused PR URLs from incorrectly advancing request completion; tier-2 validation remains `cd coordinator && npm test` (94/94 passing in this run).

## 2026-03-12 — Fallback direct class emission for xhigh/mini
- `resolveFallbackRoutingClass` should emit all fallback classes (`xhigh`, `high`, `mid`, `spark`, `mini`) from task signals so operator keys for `model_xhigh`, `model_mini`, and matching `reasoning_*` are reachable without budget-shift side paths.
- Add assign-task regressions that update these config keys twice and assert output changes, to catch stale fallback class mapping regressions.

## 2026-03-12 — Idle follow-up (worker 2)
- Startup/read/poll/follow-up checks completed with no assigned task after immediate retry and 15s wait.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Idle cycle follow-up (worker 1)
- Startup protocol completed; coordinator reports `req-bc997d74`/Task 21 already completed and worker-1 idle.
- Immediate retry and 15s follow-up polling returned no assigned task, so no coordinator-routing code changes were made.

## 2026-03-12 — Request completion gate requires merge + terminal-task consensus
- In `merger.checkRequestCompletion`, require both `all merge_queue rows status=merged` and `db.checkRequestCompletion(requestId).all_done` before setting `requests.status='completed'` or emitting `request_completed` mail/log.
- When all PR merges are done but tasks are still non-terminal, do not emit completion notifications and keep request state non-completed (`integrating`/`in_progress`).
- Regression coverage should exercise `processQueue` merge-success path with one sibling task still non-terminal, then assert completion occurs only after final task reaches terminal state.
## 2026-03-12 — Request completion gating in merger
- `checkRequestCompletion(requestId)` must require both: all `merge_queue` rows are `merged` and `db.checkRequestCompletion(requestId).all_done` confirms all tasks are terminal.
- On merge success with non-terminal sibling tasks, keep request status non-completed (`integrating`/`in_progress`) and do not emit `request_completed` mail/log until the final task reaches terminal state.

## 2026-03-12 — Merger completion idempotency across both completion paths
- `merger` request completion side effects (`request_completed` mail/log) must be guarded by a transition check so they only emit when `requests.status` actually moves into `completed`.
- Apply the transition guard to both completion paths: merge-driven `checkRequestCompletion` and `onTaskCompleted` fallback completion when no pending merges remain.
- Regression coverage should include repeated completion triggers (e.g., duplicate `onTaskCompleted` calls) to ensure exactly-once completion emission.

## 2026-03-12 — Idle cycle follow-up (worker 1)
- Startup/read/poll/follow-up checks completed with no assigned task after immediate retry and 15s wait.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Request completion semantics for failed-aware integrate gating
- `db.checkRequestCompletion` now exposes `all_completed` separately from `all_done`; mixed completed+failed requests must report `all_done=false`.
- Integration should be gated on explicit all-success criteria (`all_completed=true` and `failed=0`) instead of terminal-count checks.
- CLI `check-completion` output should not infer `ALL DONE` from `all_done` alone; mixed and failed-only terminal states need explicit labels.

## 2026-03-12 — Idle follow-up (worker 2)
- Startup knowledge read + assignment polling completed; no task assigned after immediate retry and 15s follow-up check.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Inbox recipient alias normalization for allocator queue
- Normalize inbox recipients in both `inbox` and `inbox-block` handlers so `master-3` maps to canonical `allocator` before calling `db.checkMail`, which prevents split mailbox behavior.
- Mirror aliasing in `coordinator/bin/mac10` inbox argument parsing and update help/docs to present `allocator` as canonical while preserving `master-3` compatibility.

## 2026-03-12 — Architect request notification dedupe in CLI handoff bridge
- `db.createRequest` and `db.createLoopRequest` already emit architect `new_request`; avoid sending additional architect mail in `bridgeToHandoff` to prevent duplicate inbox notifications per request creation.
- Preserve queueing telemetry by logging `coordinator` activity action `request_queued` from bridge flow and cover both `request` and `loop-request` creation paths with regression assertions.

## 2026-03-12 — assign-task model_source persistence parity
- In `assign-task`, persist `model_source` together with `routing_class`, `routed_model`, and `reasoning_effort` immediately after route decision resolution.
- In assign spawn rollback, restore `model_source` from the pre-assignment task snapshot alongside the other routing telemetry fields to prevent stale task-row attribution.

## 2026-03-12 — Merger failed-task completion gating
- `merger.onTaskCompleted` must not run the no-merge completion fast path when any sibling task is `failed`; keep the request non-completed and avoid `request_completed` emission.
- `merger.checkRequestCompletion` should gate merge-driven completion on explicit all-success task state (`all_completed=true` and `failed=0`) rather than `all_done`, because all-failed terminal sets are not success.
- Regression coverage should include: mixed completed+failed with no merges, all-failed no merges, and all-merged queue with a failed sibling task.

## 2026-03-12 — Idle follow-up (worker 1)
- Startup protocol (knowledge read + assignment polling + 15s follow-up) completed with no assigned task.
- `codex10 status` shows worker-1 idle and request `req-66e2644b` already completed; no coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Fallback scalar budget compatibility in assign-task routing
- In `fallbackModelRouter.getBudgetState`, when `routing_budget_state` JSON is missing/unparseable, derive budget from scalar config keys in order: `routing_budget_flagship_*` first, then legacy `flagship_budget_*`.
- Parse scalar values with `parseBudgetNumber` so numeric strings (including whitespace-padded values) are treated the same as existing route-task budget parsing.
- Preserve JSON precedence: if `routing_budget_state` is valid, ignore scalar fallback values and keep existing routing behavior/telemetry semantics.

## 2026-03-12 — Task 37 validation checkpoint
- `fallbackModelRouter.getBudgetState` already derives budget state from scalar keys when `routing_budget_state` is absent, with precedence `routing_budget_flagship_*` then legacy `flagship_budget_*`.
- Parsing uses shared budget-number helpers, so numeric-string inputs and whitespace are handled consistently with route-time budget evaluation.
- CLI regressions already cover constrained scalar downscale, healthy legacy scalar upgrade, and JSON-state precedence over scalar keys (`coordinator/tests/cli.test.js`).

## 2026-03-12 — start-task replay/ownership guards
- `start-task` must load worker and task first, require `task.assigned_to` to match the requesting worker, and only allow a real transition from `assigned` to `in_progress`.
- For already `in_progress` tasks owned by the same worker, return an idempotent success and avoid rewriting task fields or emitting another `task_started` log.
- Terminal `completed`/`failed` tasks should reject replay starts with `ok:false` and `error=task_not_startable`; regression tests should assert ownership mismatch and replay protection explicitly.

## 2026-03-12 — Complete-task usage alias normalization
- For usage telemetry ingestion, normalize Anthropic alias keys `cache_creation_input_tokens` -> `cache_creation_tokens` and `cache_read_input_tokens` -> `cached_tokens` before unknown-key validation so alias-only and canonical payloads are treated identically.
- Keep unknown-key rejection after alias normalization to prevent unrelated usage fields from being accepted.
- For end-to-end coverage, use direct `sendCommand('complete-task', ...)` for API path and async `execFile` invocation of `coordinator/bin/mac10` for CLI path; avoid `execFileSync` because it blocks the test process event loop and can time out the in-process CLI server.

## 2026-03-12 — Task 40 validation-only checkpoint
- `origin/main` already contains complete-task usage alias normalization in both `coordinator/bin/mac10` and `coordinator/src/cli-server.js` (`cache_creation_input_tokens` -> `cache_creation_tokens`, `cache_read_input_tokens` -> `cached_tokens`).
- `coordinator/tests/cli.test.js` already verifies canonical API payload vs alias-only CLI payload parity and preserves unknown-key rejection after alias normalization.
- Tier-2 validation passed via `cd coordinator && npm test -- tests/cli.test.js` (125/125 passing in this run).

## 2026-03-12 — Task 45 merge conflict reland (ownership guards)
- Rebase conflict on commit `988944c` was resolved by reapplying shared ownership validation across worker lifecycle commands (`start-task`, `complete-task`, `fail-task`) in `coordinator/src/cli-server.js`.
- Ownership validation now checks both task assignment (`task.assigned_to`) and worker active pointer (`worker.current_task_id`) against command inputs; mismatches return `ok:false`, `error=ownership_mismatch`, and structured `reason` values.
- Added/updated CLI regressions in `coordinator/tests/cli.test.js` for start-task mismatch behavior and unauthorized complete/fail attempts, including coordinator `ownership_mismatch` log assertions.

## 2026-03-12 — Watchdog merge-failure remediation guard parity
- In `recoverStaleIntegrations`, non-conflict `merge_failures` must use the same allocator remediation protections as conflict handling: keep request recoverable when non-terminal tasks exist and while failure age is still within the grace window.
- A robust regression sequence is: failed merge enters grace window, allocator queues remediation shortly after, request stays `integrating`/`in_progress` while remediation is active, then request can fail only after remediation becomes terminal with unresolved failed merges past grace.

## 2026-03-12 — Idle follow-up (worker 4)
- Startup protocol completed (knowledge read + assignment polling + 15s follow-up) with no assigned task.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-12 — Task 51 validation checkpoint
- `resolveFallbackRoutingClass` on `origin/main` already inspects `refactor` in both `subject` and `description`; merge/conflict triggers remain subject-based and budget-adjusted routing behavior is unchanged.
- Tier-2 validation remains `cd coordinator && npm test -- tests/cli.test.js` (128/128 passing in this run).

## 2026-03-13 — assign-task claim ownership guard
- In `assign-task`, check `freshWorker.claimed_by` inside the same DB transaction before mutating task/worker rows; return deterministic `worker_claimed` when set.
- Do not clear `claimed_by` on rejected assignments; preserve worker claim metadata and keep the task in `ready` with `assigned_to=NULL`.
- Regression coverage should execute `claim-worker` then `assign-task` and assert rejection reason plus unchanged worker/task state.

## 2026-03-13 — Reopen failed requests on remediation activation
- Add a request-state repair helper in `coordinator/src/cli-server.js` and invoke it from both `assign-task` (after successful assignment/spawn) and `start-task` (`assigned -> in_progress`) so failed requests immediately reopen when remediation becomes active.
- Reopened request status must be merge-aware: `integrating` when any `merge_queue` rows exist for the request, otherwise `in_progress`.
- Emit a coordinator recovery log event (`request_reopened_for_active_remediation`) with trigger/source metadata; CLI regressions should assert both status reopening and event emission for assign/start paths.
## 2026-03-12 — Idle follow-up (worker 6)
- Follow-up polling showed no assigned task after startup + 5s retry + 15s check.
- Verified origin/main already contains Task 55 remediation-reopen fix (PR #94), so no additional coordinator-routing changes were needed in this cycle.


## 2026-03-13 — Merge/conflict description parity in fallback class detection
- `resolveFallbackRoutingClass` should treat `merge` and `conflict` the same way as `refactor`: check both `subject` and `description` so description-only signals still classify as `mid`.
- Keep budget behavior unchanged: constrained budget still downscales `mid -> spark`, and routing telemetry should remain identical between subject-based and description-only merge/conflict triggers.

## 2026-03-13 — Docs/typo low-priority fallback parity
- `resolveFallbackRoutingClass` low-priority keyword matching should treat `docs` and `typo` symmetrically across both `subject` and `description` (not split across different fields).
- Keep regression coverage in `coordinator/tests/cli.test.js` for both parity edge cases: description-only `docs` and subject-only `typo`, each routing to `mini` (not `spark`).

## 2026-03-13 — NPM build-script compatibility for overlap validation
- `runOverlapValidation` executes `npm run build` during overlap checks; in repos without a build script this can create false functional-conflict failures.
- Setting `npm_config_if_present=true` at coordinator process bootstrap allows `npm run build` to no-op when absent while still executing real build scripts when present.
- Preserve explicit environment overrides: only default this flag when unset.

## 2026-03-13 — Complete-task reasoning token canonicalization
- Accept canonical `reasoning_tokens` in complete-task usage and normalize OpenAI detail aliases `completion_tokens_details.reasoning_tokens` and `output_tokens_details.reasoning_tokens` to the same canonical key before unknown-key validation.
- Keep alias conflict handling deterministic by rejecting mismatched canonical-vs-alias values for `reasoning_tokens` while preserving unsupported top-level usage key rejection.
- Persist canonical reasoning usage in `tasks.usage_reasoning_tokens` via schema declaration plus init-time migration/allowlist updates for existing databases.

## 2026-03-13 — Task 58 validation checkpoint (reasoning_tokens compatibility)
- `complete-task` usage handling already accepts canonical `reasoning_tokens` and normalizes OpenAI detail aliases (`completion_tokens_details.reasoning_tokens`, `output_tokens_details.reasoning_tokens`) in both CLI (`coordinator/bin/mac10`) and server (`coordinator/src/cli-server.js`).
- Persistence path is already wired end-to-end through `usage_reasoning_tokens` in schema, db allowlist, and migration helper checks.
- Existing CLI regressions already prove canonical/OpenAI alias parity, deterministic alias conflict rejection, and unknown-key rejection after normalization.

## 2026-03-13 — Metadata-driven fallback escalation for generic tasks
- `resolveFallbackRoutingClass` should parse structured task metadata fields (`domain`, `files`, `validation`) directly from task payloads/DB rows (including JSON-encoded strings).
- Escalate generic wording to `mid` when metadata indicates code-heavy implementation (code-file/path signals plus non-trivial domain/validation hints).
- Keep low-priority docs/typo behavior stable by preserving `mini` precedence ahead of metadata escalation.

## 2026-03-13 — Task 62 validation-only checkpoint (metadata fallback routing)
- `resolveFallbackRoutingClass` already integrates structured metadata via `hasCodeHeavyMetadataSignals(task)` (domain/files/validation) in addition to tier/priority/subject/description.
- Existing regression `should escalate generic tasks when code-heavy metadata is present while preserving docs/typo mini paths` confirms generic wording escalates to `mid` when metadata indicates non-trivial code work, while low-priority docs/typo stays `mini`.
- Tier-2 validation remained green with `cd coordinator && npm test -- tests/cli.test.js` (137/137 passing in this run).

## 2026-03-12 — NPM build-script compatibility for overlap validation
- In `coordinator/src/cli-server.js`, set `process.env.npm_config_if_present = 'true'` during `start()` only when the env key is currently unset.
- This prevents `npm run build` overlap validation from failing in repos without a build script while preserving explicit operator-provided `npm_config_if_present` values.
- Keep CLI coverage in `coordinator/tests/cli.test.js` for both defaulting behavior and explicit override preservation.

## 2026-03-13 — Complete-task predicted-output usage alias compatibility
- Extend complete-task usage detail-alias normalization so one detail object can emit multiple canonical fields; this is required for `completion_tokens_details` to carry `reasoning_tokens`, `accepted_prediction_tokens`, and `rejected_prediction_tokens` together.
- Keep alias conflict handling deterministic by preserving canonical-key strict conflict checks after alias extraction, and run unknown-key rejection only after normalization.
- For persistence parity, update all three layers together: schema task columns, db usage telemetry migration helper + VALID_COLUMNS allowlist, and CLI regression assertions on persisted task rows.

## 2026-03-13 — Scalar budget clear-path synchronization into routing_budget_state
- In `set-config`, writes to `routing_budget_flagship_remaining`/`routing_budget_flagship_threshold` should always mirror to legacy alias keys, even for blank/non-numeric values.
- Rebuild `routing_budget_state.flagship.remaining/threshold` from current scalar fallback values after each routing scalar update so stale numeric JSON cannot continue driving budget downgrade/upgrade decisions.
- Regression tests should cover both blank clears and non-numeric clears and assert routing returns to class-default behavior when budget signal becomes incomplete.

## 2026-03-13 — Idle follow-up (worker 4)
- Startup protocol completed (knowledge read + assignment polling + 15s follow-up) with no task assigned.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-13 — Task 65 validation checkpoint (predicted-output usage compatibility)
- complete-task usage already accepts canonical `accepted_prediction_tokens`/`rejected_prediction_tokens` and OpenAI detail aliases under `completion_tokens_details` in both CLI parser and server normalization.
- Persistence is already wired through `usage_accepted_prediction_tokens` and `usage_rejected_prediction_tokens` in schema, migration helper, and task update allowlist.
- Existing CLI regressions already cover canonical-vs-alias parity, deterministic alias conflict rejection, and unknown-key rejection with alias keys present.

## 2026-03-13 — Overlap validation build-script compatibility
- `runOverlapValidation` invokes `npm run build`; default `process.env.npm_config_if_present='true'` during CLI server startup only when unset so missing build scripts do not fail overlap checks.
- Preserve explicit operator overrides by leaving pre-set `npm_config_if_present` values untouched.
- Keep CLI regression coverage in `coordinator/tests/cli.test.js` to assert both unset-defaulting and explicit override preservation.

## 2026-03-13 — Overlap validation command selection hardening
- In `runOverlapValidation`, do not assume `npm run build` exists; inspect `package.json` scripts and choose `npm run build` first, then `npm run test` when available.
- If neither build nor test scripts exist (or package metadata is unavailable), skip default validation and emit an explicit coordinator log reason instead of failing merge validation.
- Always run `task.validation` commands when present so overlap checks still honor task-specific validation even when project default scripts are missing.

## 2026-03-13 — Token-aware merge/conflict fallback signal matching
- In `resolveFallbackRoutingClass`, prefer token-aware matching for merge/conflict keywords over raw substring checks so embedded text like `Emergency`/`Submerge` does not trigger complexity upscaling.
- Keep low-priority docs/typo precedence intact by asserting subject-only false-positive cases route to `mini` in CLI regressions.

## 2026-03-12 — Overlap validation default command selection
- In `runOverlapValidation`, prefer task-provided validation commands and select default validation only when `package.json` exposes `scripts.build` or `scripts.test`.
- Log `overlap_validation_default_skipped` with an explicit reason (for example `no_build_or_test_script`) when no default script exists so missing scripts do not trigger false functional conflicts.

## 2026-03-13 — Overlap-validation build-script compatibility checkpoint
- For functional-conflict remediation tied to overlap validation, verify `coordinator/src/cli-server.js` sets `process.env.npm_config_if_present = 'true'` only when the env key is unset.
- Keep regression coverage in `coordinator/tests/cli.test.js` that asserts defaulting occurs when unset and explicit env overrides (e.g., `false`) are preserved.
- Tier-2 validation remains `cd coordinator && npm test -- tests/cli.test.js`.

## 2026-03-13 — Merge/conflict token matching false-positive guard
- `resolveFallbackRoutingClass` should detect merge/conflict via token-aware matching (not raw substring checks), so embedded strings like `Emergency` and `Submerge` do not escalate routing class.
- Keep low-priority docs/typo precedence intact (`mini`) and cover subject-only false-positive cases in CLI assignment regressions.

## 2026-03-13 — Overlap validation shell-command execution
- `task.validation` values can be nested JSON-encoded strings in persisted tasks; overlap parsing should decode string payloads iteratively before command extraction.
- Run string validation commands via shell (`sh -c` / `cmd.exe /c`) to preserve quoted args and shell operators like `&&` and redirection.
- Keep structured `build_cmd`/`test_cmd`/`lint_cmd` support intact while sharing a unified runner that handles both shell and exec-style command shapes.

## 2026-03-13 — Idle follow-up (worker 3)
- Startup knowledge read + assignment polling completed; no task assigned after immediate retry, 5s retry, and 15s follow-up check.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-13 — Token-safe typo/refactor fallback signals
- `resolveFallbackRoutingClass` should use `hasKeywordToken` for typo/refactor checks to avoid substring false positives (`typography`, `prefactor`) while preserving standalone `typo`/`refactor` routing behavior.
- Keep merge/conflict token logic aligned with typo/refactor handling so all keyword signals use consistent token-boundary semantics.

## 2026-03-13 — Idle follow-up (worker 2)
- Startup knowledge read + assignment polling completed; no task assigned after immediate retry, 5s retry, and 15s follow-up check.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-13 — Bounded assignment-priority merge deferral escape
- In `merger.processQueue`, when `prioritize_assignment_over_merge` is enabled and ready tasks exist, defer pending merges first but cap deferral using both consecutive defer count and pending age thresholds.
- Emit `merge_deferred_assignment_priority` on each defer and `merge_assignment_priority_starvation_escape` when threshold breach forces one merge, so starvation behavior is observable.
- Keep assignment-first behavior before threshold breach by leaving merge_queue entry in `pending` during deferrals.

## 2026-03-12 — Spark downscale model_source alias attribution
- In fallback `budget-downgrade` paths for `mid -> spark`, keep spark model resolution precedence unchanged (`model_codex_spark` first, then `model_spark`) but derive `model_source` from the alias key actually selected.
- When no explicit spark alias is configured, constrained downscale attribution can fall back to `budget-downgrade:model_spark`; when both aliases are present, attribution should report `budget-downgrade:model_codex_spark`.
- Constrained-budget CLI regressions should assert both alias compatibility and precedence in downgrade flows, while preserving routing model parity.

## 2026-03-13 — Assignment-priority merge starvation guard validation
- `processQueue` in `coordinator/src/merger.js` now bounds assignment-priority deferral with both consecutive-deferral and pending-age thresholds before forcing one merge attempt.
- Telemetry should include both `merge_deferred_assignment_priority` during normal deferral and `merge_assignment_priority_starvation_escape` when threshold breach forces merge progress.
- Regression coverage exists in `coordinator/tests/merger.test.js` under `Assignment-priority merge deferral`, asserting first-pass deferral and second-pass forced merge while ready tasks remain.

## 2026-03-13 — Task 77 validation follow-up
- Branch `task-77-spark-downscale-model-source` already carries the spark-alias attribution fix commit (`budget-downgrade:model_codex_spark` vs `budget-downgrade:model_spark`) with constrained-budget precedence coverage in `coordinator/tests/cli.test.js`.
- Tier-2 validation reconfirmed green via `cd coordinator && npm test` (143/143 passing).

## 2026-03-13 — Status source_revision telemetry + drift warnings
- Add `source_revision` to CLI `status` payload with keys `current_branch`, `head_commit`, `origin_main_commit`, `ahead_count`, `behind_count`, `dirty_worktree`.
- Keep status resilient in non-git contexts by returning null-safe values instead of throwing on git command failures.
- In `bin/mac10` print source revision near project header and emit explicit warning when `head_commit !== origin_main_commit` or `dirty_worktree === true`.
- For deterministic tests in tmp project dirs, initialize a local git repo + bare `origin` and ignore runtime artifacts (`.claude/`, `origin.git`) so clean/dirty assertions are stable.

## 2026-03-13 — Revision-drift status telemetry validation-only checkpoint
- `status` already returns `source_revision` with null-safe fallback keys (`current_branch`, `head_commit`, `origin_main_commit`, `ahead_count`, `behind_count`, `dirty_worktree`) via `getSourceRevision` + guarded git execs.
- CLI `printStatus` already renders source revision near project header and warns on drift (`head_commit` mismatch or dirty worktree).
- Tier-2 validation remains `cd coordinator && npm test -- tests/cli.test.js` (151/151 passing in this run).

## 2026-03-13 — fail-task usage telemetry parity
- To mirror complete-task usage behavior, wire fail-task through the same normalization path (`normalizeCompleteTaskUsagePayload` + `mapUsagePayloadToTaskFields`) in both validation and handler paths.
- Include normalized `usage` in `task_failed` allocator/architect mail payloads and worker `task_failed` activity-log events so downstream consumers have parity telemetry on failure outcomes.
- For CLI parity, parse fail-task `--usage` in both `--usage JSON` and `--usage=JSON` forms while preserving positional error text.

## 2026-03-13 — Fail-task usage telemetry parity verification
- `fail-task` usage telemetry parity with `complete-task` is already present on synced `origin/main` in CLI parsing, server normalization (`normalizeCompleteTaskUsagePayload` + `mapUsagePayloadToTaskFields`), persistence (`usage_*` task fields), and allocator/architect/worker `task_failed` payload propagation.
- Existing CLI regressions in `coordinator/tests/cli.test.js` already cover canonical+alias acceptance plus conflict/unknown-key rejection for fail-task usage.
- Tier-2 validation evidence for this checkpoint: `cd coordinator && node --test tests/cli.test.js` (61/61 passing in this run).

## 2026-03-13 — NPM build-script compatibility defaulting
- Default `process.env.npm_config_if_present` to `true` in `cli-server.start()` only when the env key is unset, so overlap validation commands that invoke `npm run build` no-op cleanly when repos omit a build script.
- Preserve explicit operator overrides by leaving non-undefined `npm_config_if_present` values unchanged; regression coverage should assert both defaulting and override-preservation paths.

## 2026-03-13 — Task 82 startup env compatibility reland
- In `coordinator/src/cli-server.js`, keep `process.env.npm_config_if_present='true'` defaulting in `start()` only when the env key is unset.
- Preserve explicit operator-provided `npm_config_if_present` values; do not overwrite them at startup.
- Keep CLI regressions in `coordinator/tests/cli.test.js` that restart the server to assert both unset-default and explicit-override behavior.

## 2026-03-13 — Task 84 overlap-validation merge conflict resolution
- In `coordinator/src/cli-server.js`, keep only one `npm_config_if_present` startup default guard in `start()` and set it only when the env key is undefined.
- This preserves explicit operator overrides while keeping overlap validation compatible in repos without a `build` script.
- CLI coverage for both defaulting and explicit override behavior should remain green in `coordinator/tests/cli.test.js`.

## 2026-03-13 — Task 85 functional-conflict reland
- Keep `start()` startup compatibility guard for overlap-validation environments: set `process.env.npm_config_if_present='true'` only when the env key is unset.
- Preserve explicit operator overrides (`npm_config_if_present=false`) and verify with CLI-server restart tests.
- In this Windows worktree layout, `gh pr create` can fail in worktrees; use repo-root `gh pr view/create --repo ... --head ...` flow to resolve PR URL.

## 2026-03-13 — Task 89 overlap-build compatibility validation checkpoint
- In this branch state, `cli-server.start()` already defaults `process.env.npm_config_if_present='true'` only when unset, which prevents false overlap-validation failures in projects without a build script.
- Keep explicit operator overrides intact (`npm_config_if_present` values like `false` remain unchanged), and retain CLI tests that cover both defaulting and override-preservation behavior.
- Rebase onto `origin/agent-4` can surface duplicate patch conflicts for this area; when branch already contains the fix, skip redundant replay commits and re-validate.

## 2026-03-13 — Task 89 overlap validation env-default re-land
- Functional conflict root cause remained overlap-validation invoking `npm run build` in repos without a build script; coordinator startup env default `npm_config_if_present=true` avoids false failures while still honoring explicit operator overrides.
- Keep regression coverage focused on startup default/override behavior in `coordinator/tests/cli.test.js`; this task validated full coordinator CLI suite including overlap command-selection tests.

## 2026-03-13 — Watchdog Case-4 per-merge allocator escalation context
- In `recoverStaleIntegrations` Case 4 (`all terminal`, `no conflicts`, `some failed`), send one allocator `merge_failed` mail per failed merge instead of a request-level aggregate payload.
- Each payload should include merge context (`request_id`, `merge_id`, `task_id`, `branch`, `pr_url`, merge-specific `error`) and `original_task` metadata (`subject`, `domain`, `files`, `tier`, `assigned_to`) when the source task exists.
- Keep request-level failure transition side effects unchanged (`requests.status='failed'`, master `request_failed` mail, and `stale_integration_recovered` logging).

## 2026-03-13 — Task 97 validation checkpoint
- `recoverStaleIntegrations` Case 4 emits allocator `merge_failed` mails per failed merge with merge/task identifiers plus nested `original_task` metadata, while preserving request-level failure transition and stale-integration logging.
- Watchdog regression `sends per-merge allocator notifications with rich context for terminal failed merges` confirms payload richness and one-mail-per-failure behavior.

## 2026-03-12 — Task 95 validation-only overlap conflict check
- On synced `origin/main`, `coordinator/src/cli-server.js` already defaults `process.env.npm_config_if_present='true'` only when unset in `start()`, preserving explicit operator overrides.
- `coordinator/tests/cli.test.js` already contains startup default/override regressions; tier-2 verification for this conflict can be satisfied by `cd coordinator && npm test -- tests/cli.test.js`.

## 2026-03-13 — Anthropic cache_creation object alias support in usage normalization
- `usage.cache_creation` can be accepted as an object alias with `ephemeral_5m_input_tokens` and/or `ephemeral_1h_input_tokens` in both CLI parsing (`coordinator/bin/mac10`) and server normalization (`coordinator/src/cli-server.js`).
- Validate each nested object token value with the same non-negative integer strictness as canonical token fields, then fold the sum into canonical `cache_creation_tokens` before unknown-key checks.
- Keep scalar alias compatibility (`cache_creation_input_tokens`) and deterministic conflict rejection when canonical/scalar/object values disagree.

## 2026-03-12 — Duplicate npm_config_if_present regression cleanup
- Repeated relands can leave duplicated startup-env regressions in `coordinator/tests/cli.test.js`; keep one canonical default/override pair to preserve coverage without test bloat.
- Keep `cli-server.start()` as the single runtime guard location for `process.env.npm_config_if_present` defaulting behavior.

## 2026-03-12 — Loop lifecycle guard validation
-  and  should gate on ; non-active states return  and must not mutate /.
- Keep parity tests for both guard paths plus active-path behavior in  so regressions are caught without altering operator-facing command semantics.

## 2026-03-13 — Task 117 task-45/task-101 conflict cleanup
- Runtime compatibility guard remains in `cli-server.start()`: default `process.env.npm_config_if_present='true'` only when the key is unset, so overlap validation does not fail on repos without a build script.
- In reland branches, `coordinator/tests/cli.test.js` can accumulate duplicate startup env-default regressions; keep exactly one default/override pair to avoid redundant coverage while preserving behavior checks.
- Tier-2 validation for this conflict path is covered by `cd coordinator && npm test -- tests/cli.test.js` and should include overlap command-selection assertions.

## 2026-03-13 — Task 123 functional-conflict merge-validation checkpoint
- For task #117 merge-validation conflicts scoped to `coordinator/src/cli-server.js` + `coordinator/tests/cli.test.js`, synced `origin/main` already contained the `npm_config_if_present` startup default/override fix and matching CLI coverage.
- Treat this case as validation-only when no scoped diff remains after `git fetch origin && git rebase origin/main`; complete by re-running tier-2 tests and reporting explicit pass evidence.
- 2026-03-13: Re-landing task-110 on current main can conflict in `coordinator/src/cli-server.js` where helper insertions overlap; preserve both `validateCompleteTaskUsageIntegerField` and `normalizeLoopRequestSetConfigValue` when resolving.
- 2026-03-13: Keep loop-request set-config parity by allowlisting `loop_request_quality_gate`, `loop_request_min_description_chars`, `loop_request_min_interval_sec`, `loop_request_max_per_hour`, and `loop_request_similarity_threshold`, and validate type/range before writing config.

## 2026-03-13 — routing_budget_state plain-object shape enforcement for scalar fallback parity
- Treat `routing_budget_state` as valid only when parsed JSON is a plain object (`typeof value === 'object'` and not an array) across CLI fallback budget parsing and web status budget snapshot parsing.
- Invalid shapes like `[]` must not block scalar fallback thresholds (`routing_budget_flagship_*` then legacy `flagship_budget_*`), and regressions should cover both `assign-task` routing and `/api/status` budget snapshots.

## 2026-03-13 — Task 128 validation-only conflict check (#45 vs #44)
- On synced `origin/main`, overlap-build compatibility was already present: `cli-server.start()` defaults `process.env.npm_config_if_present='true'` only when unset.
- Existing CLI regressions already covered unset defaulting and explicit override preservation, and full `tests/cli.test.js` passed (179/179).
- For this conflict class, confirm zero scoped diff first and prefer validation-only completion when behavior/tests are already merged.

## 2026-03-13 — Task 134 validation-only conflict check (#128 merge validation)
- For overlap-validation merge conflicts scoped to `coordinator/src/cli-server.js` + `coordinator/tests/cli.test.js`, first verify `git diff origin/main -- <scoped files>` is empty after sync; if empty and tier-2 CLI tests pass, complete as validation-only.
- Existing startup guard (`npm_config_if_present` default when unset, explicit override preserved) plus overlap command-selection regressions in `tests/cli.test.js` already cover the missing-build-script incompatibility path.

## 2026-03-13 — Idle follow-up (worker 2)
- Startup/read/poll/follow-up checks completed with no assigned task after 5s retry and 15s check.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-13 — Task 137 validation-only conflict reconciliation
- On synced `origin/main`, functional-conflict task #110 overlap-build failure was already addressed via `process.env.npm_config_if_present` defaulting in `coordinator/src/cli-server.js` (only when unset).
- Scoped regression coverage in `coordinator/tests/cli.test.js` already validates both defaulting and explicit override preservation; tier-2 confirmation remains `cd coordinator && npm test -- tests/cli.test.js`.

## 2026-03-13 — Idle follow-up (worker 3)
- Startup protocol completed (PATH setup, knowledge read, task polling, 15s follow-up).
- No task assigned by coordinator in this cycle; no domain code changes made.

## 2026-03-13 — Task 142 validation-only overlap-build conflict check
- For merge-validation conflicts reporting `npm run build` missing script, first diff scoped files against `origin/main`; if `npm_config_if_present` startup default + tests are already present, treat as validation-only.
- Tier-2 verification for this path is covered by `cd coordinator && npm test -- tests/cli.test.js`, which exercises overlap validation command selection and npm env default/override behavior.

## 2026-03-13 — Task 148 overlap validation-only checkpoint
- For req-592efca7/task 148, scoped overlap files (`coordinator/src/cli-server.js`, `coordinator/tests/cli.test.js`) were already aligned with `origin/main`; no reland edits were required.
- Tier-2 confirmation remained `cd coordinator && npm test -- tests/cli.test.js` with full pass (182/182), including startup `npm_config_if_present` compatibility coverage.

## 2026-03-13 — Task 148 overlap validation checkpoint
- For req-592efca7 overlap reconciliation in coordinator-routing, `origin/main` already contains the npm build-script compatibility guard (`process.env.npm_config_if_present='true'` only when unset) in `coordinator/src/cli-server.js`.
- CLI regression coverage for defaulting and explicit override preservation is already present in `coordinator/tests/cli.test.js`; tier-2 validation remains `cd coordinator && npm test -- tests/cli.test.js`.
- 2026-03-13: For overlap-validation conflict requests scoped to `coordinator/src/cli-server.js` and `coordinator/tests/cli.test.js`, first diff against `origin/main`; if the `npm_config_if_present` startup default and its CLI regressions already exist, handle as validation-only and close with Tier-2 evidence.

## 2026-03-13 — Task 151 validation-only overlap conflict checkpoint
- Synced `origin/main` already contains overlap-build compatibility in `coordinator/src/cli-server.js` (`process.env.npm_config_if_present` defaults to `'true'` only when unset).
- `coordinator/tests/cli.test.js` already includes startup default/override regressions plus overlap validation command-selection coverage guarding missing build-script behavior.
- For this conflict signature (`Missing script: build`), check `git diff origin/main -- coordinator/src/cli-server.js coordinator/tests/cli.test.js` first; if clean, treat as validation-only after Tier-2 CLI suite confirmation.

## 2026-03-13 — Task 162 validation-only fallback safeguards checkpoint
- Synced `origin/main` already contains the requested fallback reland in `coordinator/src/cli-server.js`: scalar budget fallback parsing, budget-aware effective-class shifts, metadata-driven code-heavy escalation, and downgrade routing telemetry (`routing_reason`/`model_source`) semantics.
- Existing regressions in `coordinator/tests/cli.test.js` already cover constrained scalar downscale and metadata-heavy generic-task classification; required validation command passed: `cd coordinator && npm test -- tests/cli.test.js`.

## 2026-03-13 — Idle follow-up (worker 4)
- Startup protocol completed (knowledge read, `my-task` poll + 5s retry + 15s follow-up).
- Coordinator status shows `req-a079b39b` already completed and no active assignment for worker-4; no coordinator-routing code changes made in this cycle.

## 2026-03-13 — Partial routing_budget_state object merge parity
- `parseBudgetStateConfig(raw, getConfig)` now supports merged normalization: when JSON budget objects are present but missing/null scalar-backed flagship fields, fill those gaps from scalar keys (`routing_budget_flagship_*` then legacy `flagship_budget_*`) while preserving explicit object values.
- `fallbackModelRouter.getBudgetState` should consume this merged parser directly so routing/downscale decisions and budget telemetry use the same threshold evaluation semantics.
- `/api/status` budget snapshots should reuse the same parser and keep source attribution as `config:routing_budget_state` whenever an object config exists, even if scalar fallback fills missing fields.

## 2026-03-13 — Idle follow-up (worker 4)
- Startup/read/poll/follow-up checks completed with no assigned task.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-13 — Loop prompt refresh command gating and state preservation
- Add loop prompt refresh as a dedicated command (`loop-set-prompt`) rather than loop recreation, and gate updates by explicit status allowlist (`active`, `paused`).
- Keep prompt refresh write-path in DB helpers (`setLoopPrompt` -> `updateLoop`) so command handlers avoid duplicated SQL/write logic.
- Regression coverage should assert both refreshed `loop-prompt` text and invariant loop progress fields (`status`, `iteration_count`, `last_checkpoint`) across success and rejection paths.

## 2026-03-13 — Idle follow-up (worker 4)
- Startup knowledge read + task polling (initial, 5s retry, 15s follow-up) returned no assigned task.
- No coordinator-routing code changes were required in this cycle.

## 2026-03-13 — Watchdog stale decomposition deadlock recovery
- Add a dedicated watchdog repair pass for `requests.status='decomposed'` with `COUNT(tasks)=0` and stale `updated_at` age >= 900s.
- Recovery should fail the request with explicit diagnostic `result`, emit `stale_decomposition_recovered` log details (`source`, `age_sec`, status transition metadata), and notify `master-1` via `request_failed` so deadlocked requests are visible.
- Run this repair in both startup sweep and regular watchdog ticks alongside existing failed-request reopen and stale-integration recovery passes.

## 2026-03-13 — Nested usage-detail passthrough in usage normalization
- Preserve unknown nested keys under usage detail objects (`input_tokens_details`, `prompt_tokens_details`, `completion_tokens_details`, `output_tokens_details`) and `cache_creation` in normalized usage payloads so they survive into `usage_payload_json`.
- Keep canonical usage mappings unchanged by continuing to map known nested alias counters into canonical fields and usage_* DB columns.
- Unknown nested cache_creation keys are now forward-compatible passthrough values; only known nested cache_creation counters are integer-validated/folded.

## 2026-03-16 — Watchdog stale-claim expiry source of truth
- `releaseStaleClaimsCheck` must compute claim age from `workers.claimed_at` only; do not fall back to `last_heartbeat` or `created_at`.
- If `claimed_by` is set but `claimed_at` is missing, release immediately with diagnostic reason `missing_claimed_at` to prevent wedged claims.
- Regression coverage should include both parity guards: stale heartbeat + fresh `claimed_at` must not release, while stale `claimed_at` must release even with fresh heartbeat.

## 2026-03-16 — Filtered inbox consume semantics
- Extend `db.checkMail(recipient, consume, filters)` with optional `filters.type` and `filters.request_id`; keep defaults so existing callers stay unchanged.
- In consume mode, select by recipient (+ optional type), parse payload, then mark consumed only for rows that match optional `request_id` to avoid consuming unrelated mail.
- Wire `inbox` and `inbox-block` schemas/handlers to accept/pass `type` and `request_id`; polling with filters now waits for matching mail without draining other messages.

## 2026-03-16 — assign-task claimed-worker rollback parity
- In `assign-task`, claim-related spawn rollback should return `ok:false` with `error=worker_claimed` to match direct transaction rejection payloads.
- Preserve live worker claim metadata (`claimed_by`/`claimed_at`) during rollback when the spawn failure indicates claim ownership, instead of blindly restoring stale pre-assignment values.
- Keep regression coverage split across CLI and security suites: direct claimed-idle rejection + claim metadata integrity, and rollback-path claim preservation.

## 2026-03-16 — Task 32 validation-only checkpoint (assign-task claim guard)
- Synced `origin/main` already enforces deterministic `worker_claimed` rejection in `assign-task` when `freshWorker.claimed_by` is set before assignment mutation.
- Rollback path in `assign-task` preserves claim metadata (`claimed_by`, `claimed_at`) and returns `ok:false,error=worker_claimed` when spawn errors indicate claim takeover.
- Regression coverage already exists in both `coordinator/tests/cli.test.js` and `coordinator/tests/security.test.js` for claimed idle worker rejection and claim metadata preservation.

## 2026-03-16 — Merge-driven completion gate via task all_done
- In `merger.checkRequestCompletion`, request completion side effects should run only when all merge_queue rows are merged and `db.checkRequestCompletion(requestId).all_done` is true.
- Preserve `merge_success` logging even when sibling tasks are unfinished; keep request non-completed and suppress `master-1` `request_completed` mail until all tasks become done.
- Regression coverage can live in `coordinator/tests/state-machine.test.js` by driving `merger.processQueue` with one merged task + one assigned sibling, then finalizing the sibling and asserting delayed completion mail emission.

## 2026-03-16 — Idle follow-up (worker 1)
- Startup protocol completed (knowledge read + assignment polling + 5s retry + 15s follow-up) with no assigned task.
- No coordinator-routing code changes were made in this cycle.

## 2026-03-16 — Overlap validation command selection safety
- `runOverlapValidation` in `coordinator/src/merger.js` should run task-level validation commands when provided, otherwise choose only available default scripts (`build` then `test`) from `package.json`.
- Missing build/test scripts must not cause a false `functional_conflict`; default validation should be skipped with an explicit log reason when no script is configured.
- Regression coverage lives in `coordinator/tests/merger.test.js` under `Overlap validation command selection` and should keep merge liveness assertions for repos without build scripts.

## 2026-03-16 — Task 53 merge-conflict validation checkpoint
- For merge-conflict reland requests scoped to specific files, first verify conflict markers and scoped diff vs `origin/main`; if both are clean/empty, treat as validation-only.
- Tier-2 evidence for this checkpoint was `cd coordinator && npm test -- tests/merger.test.js` (215/215 passing).

## 2026-03-16 — Task 54 validation-only merge-conflict checkpoint
- For merger merge-conflict fix tasks scoped to `coordinator/src/merger.js` and `coordinator/tests/merger.test.js`, first verify `git diff origin/main -- <files>` and conflict-marker scan; if empty, complete as validation-only.
- Prefer scoped tier-2 validation with `cd coordinator && node --test tests/merger.test.js` to avoid unrelated full-suite CLI timeout noise.

## 2026-03-16 — Task 54 merge-conflict reland validation (worker 1)
- Scoped merge-conflict files (`coordinator/src/merger.js`, `coordinator/tests/merger.test.js`) can already be resolved on synced `origin/main`; confirm with conflict-marker scan plus `git diff origin/main -- <files>` before editing.
- Tier-2 evidence for this checkpoint: `cd coordinator && npm test -- tests/merger.test.js` (215/215 passing in this run).

## 2026-03-16 — Merger assignment-priority stale-loop liveness escape
- `shouldDeferMergeForAssignmentPriority` now treats stale allocator loop heartbeat as an immediate starvation-escape condition (in addition to bounded deferral count/age).
- Allocator loop detection is based on active loop prompts matching `/allocate-loop`, using heartbeat fallback timestamps (`last_heartbeat` -> `updated_at` -> `created_at`) and configurable stale threshold `assignment_priority_allocator_loop_stale_ms` (default 300000ms).
- Regression coverage in `coordinator/tests/merger.test.js` now asserts both sides: healthy allocator loop still defers, stale allocator loop with ready tasks bypasses deferral and drains merges.

## 2026-03-16 — Task 58 assignment-priority deferral liveness
- Merge deferral should preserve assignment priority during healthy allocator heartbeats, but must escape when no progress signals appear (consecutive defer threshold, pending-age budget, or stale allocator loop heartbeat).
- Regression safety should cover both sides explicitly: healthy loop keeps `merge_deferred_assignment_priority`, stale loop emits `merge_assignment_priority_starvation_escape` and allows pending merges to drain.

## 2026-03-16 — loop-refresh-prompt command path
- Added `loop-refresh-prompt` as an explicit active-loop prompt refresh command, separate from `loop-set-prompt` (active/paused).
- Reused DB loop update flow by introducing `refreshLoopPrompt` -> `setLoopPrompt(..., ['active'])` so persistence still routes through `updateLoop`.
- CLI/server/test parity: parser + help exposure in `coordinator/bin/mac10`, command schema/handler in `cli-server`, and regressions for success + missing-loop + invalid-input handling.

## 2026-03-16 — Task 60 loop-refresh-prompt validation checkpoint
- `loop-refresh-prompt` is wired end-to-end in `coordinator/src/cli-server.js`, `coordinator/bin/mac10`, and `coordinator/src/db.js` via `refreshLoopPrompt -> setLoopPrompt -> updateLoop`, constrained to active loops and returning refreshed prompt payload fields immediately.
- CLI regressions in `coordinator/tests/cli.test.js` cover both success (`loop-prompt` reflects refreshed prompt) and error paths (missing loop + invalid `loop_id`).
- In this environment, `cd coordinator && npm test` repeatedly shows a pre-existing timeout cluster in unrelated `complete-task`/`integrate` lifecycle tests (lines ~590/836/1292/1710/1762/1846), while loop-refresh tests pass.

## 2026-03-16 — Stale loop heartbeat self-healing in watchdog
- In `monitorLoops`, stale heartbeat with a live pane should trigger deterministic sentinel restart (`killWindow` then `createWindow`) and refresh `last_heartbeat` immediately.
- Keep pane-death path single-action by `continue`-ing after respawn to avoid stale-branch duplicate restart attempts in the same tick.
- Regressions should stub tmux methods through `tick()` and assert both stale-live-pane recovery and unchanged pane-death single-respawn semantics.
