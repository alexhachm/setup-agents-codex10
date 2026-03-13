## [119] Fix createLoopRequest duplicate ordering ahead of cooldown/rate-limit — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/state-machine.test.js
- What changed: Reordered createLoopRequest so active exact/similar duplicate detection runs before cooldown and max-per-hour suppression, added explicit dedupe reason metadata, and preserved throughput suppression for non-duplicate traffic. Added state-machine regressions covering immediate exact duplicate, near-identical active duplicate, and non-duplicate cooldown/rate-limit behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/151

## [105] FIX: merge conflict for task #100 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Re-landed conflicted task-100 changes on top of current main by merging loop-request quality-gate normalization logic with dynamic hourly rate-limit retry timing (`retry_after_sec` from oldest in-window request). Updated the CLI regression to disable the quality gate in that scenario so the rate-limit timing path is validated deterministically.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/135

## [55] Reopen failed requests when remediation tasks restart — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/watchdog.js, coordinator/tests/cli.test.js
- What changed: Added request-state reopening on remediation task activation in assign-task/start-task, selecting integrating vs in_progress based on merge queue presence and emitting recovery logs. Added watchdog parity repair for failed requests with active remediation and CLI regressions covering both assign/start reopen paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/94

## [12] Fix spark downscale alias routing + regression coverage — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback spark model resolution to prefer `model_codex_spark` with `model_spark` compatibility fallback before the default spark model, while preserving correct `model_source` telemetry for explicit overrides. Added assign-task regressions proving codex-key precedence and legacy spark-key compatibility, including allocator log assertions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/57

## [11] Fix spark alias resolution and mirror config keys — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion; confirmed `fallbackModelRouter.routeTask` resolves spark via `model_spark` then `model_codex_spark` then default, and `set-config` mirrors writes across both spark keys. Re-ran `cd coordinator && npm test -- --runInBand` with 90/90 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/55

## [10] Persist routing telemetry fields during assign-task — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/src/schema.sql
- What changed: Confirmed assign-task routing telemetry persistence and `db.updateTask` allowlist/migrations were already implemented, then aligned fresh database schema by adding `routing_class`, `routed_model`, and `reasoning_effort` columns to `tasks` in `schema.sql`. Re-ran tier-2 validation command and confirmed full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/56

## [8] Fix spark model alias handling in fallback router + CLI regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added alias-aware spark model resolution in fallback routing so `model_spark` and `model_codex_spark` are both honored, and updated `set-config` to mirror writes across both spark keys. Added CLI assign-task regressions for alias-only fallback and routing via each spark key.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/55

## [4] Implement Master-2 architect loop spec across codex10 command docs — 2026-03-12
- Domain: orchestration-scripts
- Files: templates/commands/architect-loop.md, templates/docs/master-2-role.md
- What changed: Re-synced template mirrors to the canonical codex10 Master-2 spec by restoring `last_activity_epoch`, even-decomposition `curation_due` toggles, executable adaptive signal timeout logic, and the instruction patch target wording (`worker`).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/54

## [4] Implement Master-2 architect loop spec across codex10 command docs — 2026-03-12
- Domain: orchestration-scripts
- Files: .codex/commands-codex10/architect-loop.md, .codex/commands/architect-loop.md, templates/commands/architect-loop.md, .codex/docs/master-2-role.md, templates/docs/master-2-role.md
- What changed: Synced Master-2 loop/role guidance to the current spec across mirrors, including triage-first flow, backlog-drain controls, executable Tier2 task-id capture, codex10-based Tier3 decomposition/clarification commands, and full staleness-reset procedures in templates.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/52

# Change Summaries

Workers append summaries here after completing each task. Newest entries at the top.

## [7] Implement budget-aware routing downgrade/recovery + CLI regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on `origin/main`; confirmed fallback budget-aware downgrade/recovery routing and deterministic CLI coverage for constrained vs recovered `routing_budget_state` are already in place with effective-class model/reasoning transitions. Re-ran `cd coordinator && npm test` and confirmed 88/88 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/51

## [6] Fix fallback model_source attribution and add assign-task routing regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on `origin/main`; confirmed fallback default attribution uses `fallback-default`, explicit `model_high`/`model_spark` overrides report `config-fallback`, and assign-task regression coverage asserts response/log telemetry for both paths. Re-ran `node --test tests/cli.test.js` with 17/17 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/53

## [6] Fix fallback model_source attribution and add assign-task routing regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback routing so non-shift model attribution reports `fallback-default` for default model selection and `config-fallback` when a `model_<class>` override is explicitly configured, while preserving budget upgrade/downgrade attribution. Added assign-task regression tests covering both no override and explicit override paths, and updated the recovered-mid expectation to match the new attribution semantics.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/53

## [5] Fix fallback routing scale + reasoning config in cli-server with regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback router effective-class selection to support both budget-driven downscale and healthy-budget upscale (`high->xhigh`), and made `reasoning_effort` resolve from configurable `reasoning_<effective_class>` keys. Expanded CLI regressions to cover constrained/recovered assignment routing and verify reasoning config application across effective classes and assignment telemetry payloads.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/51

## [3] Persist routing telemetry fields during assign-task — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/security.test.js
- What changed: Verified the requested telemetry persistence, task-column allowlist/migrations, and regression tests are already present on `origin/main`; re-ran `node --test tests/security.test.js` and confirmed full pass (36/36) with no additional code changes required in this branch.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/50

## [3] Persist routing telemetry fields during assign-task — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/security.test.js
- What changed: `assign-task` now persists `routing_class`, `routed_model`, and `reasoning_effort` onto the task row immediately after routing, with rollback restoring prior telemetry on assignment spawn failure. Updated DB task-column allowlist plus init-time migrations to safely add telemetry columns for both existing and newly initialized databases, and added security regression tests covering writable telemetry columns and non-null telemetry persistence after assignment.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/50

## [2] Budget-aware fallback model downscaling in cli-server router — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Verified the requested budget-aware fallback routing behavior and telemetry fields were already implemented (`model_source`, `routing_reason`, `reasoning_effort`) for constrained vs healthy budget states. Re-ran `npm test` in `coordinator` (83/83 passing) to confirm.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/26

## [2] Budget-aware fallback model downscaling in cli-server router — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback routing to emit explicit budget downgrade telemetry (`model_source`, `routing_reason`) while preserving healthy class-to-model behavior; assign-task now consistently propagates routing reason/source in response/mail/log payloads. Expanded CLI tests to verify constrained and recovered routing outcomes and persisted telemetry fields.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/26

## [1] Budget-aware downscale/restore in fallback router — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: No new code changes were required in this run; verified existing implementation downscales `high`/`mid` routing under constrained flagship budget and restores normal mapping after recovery. Confirmed with `node --test tests/cli.test.js` (14/14 passing).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/49

## [1] Budget-aware downscale/restore in fallback router — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added budget-threshold-aware fallback routing that downscales `high` to `mini` and `mid` to `spark` when `flagship.remaining <= flagship.threshold`, then restores normal model mapping/effort once budget recovers. Added CLI tests for constrained-budget downgrade and recovered-budget restore transitions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/49

## [5] Fix fallback routing scale + reasoning config in cli-server with regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only run; confirmed fallback effective-class up/down scaling, per-class reasoning config (`reasoning_xhigh/high/mid/spark/mini`), and assign-task routing metadata are already implemented on `origin/main`. Re-ran CLI regressions successfully (15/15 passing).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/51

## [4] Implement Master-2 architect loop spec across codex10 command docs — 2026-03-12
- Domain: orchestration-scripts
- Files: .claude/commands/architect-loop.md, .claude/docs/master-2-role.md, templates/docs/master-2-role.md
- What changed: Re-synced the tracked Master-2 mirrors to the codex10 architect-loop spec and added missing role-level counter semantics, Tier-3 decomposition protocol, reset threshold wording, and adaptive signal wait guidance.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/54

## [12] Fix spark downscale alias routing + regression coverage — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only run on synced `origin/main`; confirmed fallback spark routing prefers `model_codex_spark` with `model_spark` compatibility fallback and preserves accurate `model_source` telemetry. Re-ran `cd coordinator && npm test -- --runInBand` with 91/91 passing, including assign-task spark alias regressions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/57

## [13] Fix fallback optimization routing behavior + regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on synced `origin/main`; confirmed fallback routing already reports `fallback-default` vs `config-fallback` correctly, derives `reasoning_effort` from `reasoning_<effective_class>` (including `xhigh`/`mini`), and resolves spark as `model_codex_spark` with `model_spark` compatibility fallback. Re-ran `cd coordinator && npm test` and confirmed full pass (91/91).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/57

## [14] Persist routing telemetry fields on task rows during assign-task — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation confirmed telemetry persistence/allowlist logic already present in db and assign-task path; added CLI assign-task regression asserting persisted task-row `routing_class`, `routed_model`, and `reasoning_effort` match routing response after assignment.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/58

## [15] Re-land fallback optimization routing fixes + tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only on synced `origin/main`; confirmed fallback route already reports accurate `model_source` origin, resolves spark as `model_codex_spark` with `model_spark` compatibility fallback, and derives `reasoning_effort` from `reasoning_<effective_class>` including xhigh/mini. Installed missing local dependency and re-ran full coordinator tests successfully (92/92).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/57

## [15] Re-land fallback optimization routing fixes + tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed fallback routing already reports correct model source attribution, resolves spark via `model_codex_spark` then `model_spark`, and derives `reasoning_effort` from `reasoning_<effective_class>` including xhigh/mini. Re-ran coordinator tests with 92/92 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/57

## [16] Sync Master-1 clarification guidance to mailbox inbox flow — 2026-03-12
- Domain: orchestration-prompts
- Files: .codex/commands-codex10/master-loop.md, .codex/commands/master-loop.md, templates/commands/master-loop.md
- What changed: Replaced legacy clarification-queue timeout guidance and wait-cycle polling instructions with codex10 mailbox flow (`codex10 inbox master-1`) in the mirrored Master-1 loop prompt lines. Kept the two edited lines semantically aligned across runtime/template mirrors.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/59

## [16] Sync Master-1 clarification guidance to mailbox inbox flow — 2026-03-12
- Domain: orchestration-prompts
- Files: .codex/commands-codex10/master-loop.md, .codex/commands/master-loop.md, templates/commands/master-loop.md
- What changed: Validation-only completion on synced `origin/main`; confirmed timeout and wait-cycle guidance in all three mirrors references `codex10 inbox master-1` and no `clarification-queue.json` references remain.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/59

## [17] Persist routing telemetry fields on assign-task path — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/tests/security.test.js
- What changed: Validation-only checkpoint on synced `origin/main`; confirmed `db.updateTask` allows routing telemetry fields, `assign-task` persists routing decision telemetry on task rows, and security regression coverage asserts non-null persisted telemetry after assignment. Re-ran tier-2 validation (`cd coordinator && npm test -- tests/security.test.js`) with full pass (92/92).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/50

## [9] Harden merge ownership collisions for reused PR URLs — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: queueMergeWithRecovery now rejects cross-request duplicate PR ownership by deleting the duplicate merge row and returning explicit duplicate reason codes. complete-task/integrate now treat these ownership reasons as merge failures (task marked failed, explicit merge_queue_rejected response), and CLI regressions confirm two requests cannot both complete/integrate with the same PR URL.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/60

## [9] Harden merge ownership collisions for reused PR URLs — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed duplicate PR ownership is rejected via explicit reason codes in queue/complete/integrate flows and regressions prevent cross-request PR reuse from completing requests. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with 94/94 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/60

## [22] Reject cross-request duplicate PR ownership and block false completion — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed inserted-row duplicate PR ownership is rejected with explicit reasons, duplicate rows are removed, and complete-task/integrate treat ownership collisions as merge failures that prevent request completion. Re-ran `cd coordinator && npm test` with 94/94 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/60

## [21] Fix fallback router class/reasoning mapping + regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback class resolution to emit direct `xhigh` and `mini` classes from existing task signals, enabling per-class controls for `model_xhigh`/`model_mini` and `reasoning_xhigh`/`reasoning_mini` on active fallback routing. Added CLI regressions that prove `set-config` updates for those model/reasoning keys immediately change `assign-task` routing output.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/61

## [19] Render routing and budget chips in dashboard task/status views — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/styles.css
- What changed: Added resilient task telemetry parsing/rendering for routing class/model/source/reasoning effort chips and a budget snapshot indicator sourced from status/websocket payloads with graceful fallback behavior when telemetry keys are absent. Added compact, responsive chip/budget styles for desktop/mobile readability.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/62

## [18] Expose routing/budget telemetry in web status surfaces — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/src/web-server.js
- What changed: Added a shared status-state builder that enriches tasks with routing telemetry fields (`routing_class`, `routed_model`, `model_source`, `reasoning_effort`) and falls back to latest allocator `task_assigned` activity-log details when task-row telemetry is missing. Extended `/api/status` and websocket init/state payloads to include top-level `routing_budget_state` and `routing_budget_source` derived from config first, then latest assignment log context.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/63

## [19] Render routing and budget chips in dashboard task/status views — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/styles.css
- What changed: Validation-only completion on synced `origin/main`; confirmed routing telemetry chips (routing/model/source/reasoning) and budget snapshot indicator rendering are already implemented with graceful fallback handling and escaped output, plus responsive chip styling. Re-ran coordinator tests (95/95 pass) and verified runtime `/api/status` budget keys and served `app.js` telemetry hooks.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/62

## [23] Implement complete-task usage telemetry persistence — 2026-03-12
- Domain: coordinator-core
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/src/schema.sql, coordinator/src/db.js
- What changed: Added optional structured usage payload support to `complete-task` CLI/server flow, validated usage fields, and persisted usage telemetry (`model`, token counts, `cost_usd`) on task completion. Added task schema columns, startup migrations, and task update allowlist entries so existing and new databases persist usage metrics without breaking completion when usage is omitted.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/64

## [20] Add regression tests for status telemetry payload and dashboard rendering — 2026-03-12
- Domain: coordinator-tests
- Files: coordinator/tests/web-server.test.js, coordinator/tests/dashboard-render.test.js
- What changed: Added deterministic node:test coverage for `/api/status` telemetry contract fields (`routing_budget_state`/`routing_budget_source`) plus task telemetry enrichment and null-default behavior, and added dashboard rendering regressions for routing/budget chips with populated and absent telemetry payloads.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/65

## [25] Prevent premature request completion until all tasks are terminal — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Hardened merger completion gating so request completion now requires both fully merged queue entries and `db.checkRequestCompletion(requestId).all_done` before updating request status or emitting `request_completed`. Added a regression test proving merge-success does not complete the request while a sibling task remains non-terminal, and completion notification/log only occurs after the final task becomes terminal.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/66

## [20] Add regression tests for status telemetry payload and dashboard rendering — 2026-03-12
- Domain: coordinator-tests
- Files: coordinator/tests/web-server.test.js, coordinator/tests/dashboard-render.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed deterministic regression coverage exists for `/api/status` routing budget/task telemetry contract and dashboard routing/budget chip rendering including null-field fallback handling. Re-ran coordinator tests with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/65

## [24] Add regression tests for usage telemetry round-trip — 2026-03-12
- Domain: coordinator-tests
- Files: coordinator/tests/cli.test.js
- What changed: Added complete-task regression coverage that sends a full usage telemetry payload and asserts parser normalization plus persisted task-row fields for model, token/cache metrics, total_tokens, and cost_usd. Extended worker lifecycle completion coverage to assert backward-compatible no-usage completion keeps usage columns null.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/67

## [25] Prevent premature request completion until all tasks are terminal — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed merger completion gating requires both fully merged queue entries and terminal task state via `db.checkRequestCompletion(requestId).all_done`, with regression coverage ensuring no premature `request_completed` mail/log while tasks remain in progress. Re-ran merger suite (and full coordinator suite via test command) with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/66

## [26] Update mac10 usage text for claim/release worker commands — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/bin/mac10
- What changed: Added ALLOCATOR usage lines for `claim-worker <worker_id> [claimer]` and `release-worker <worker_id>` in `printUsage()` so documented commands match existing handlers.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/68

## [24] Add regression tests for usage telemetry round-trip — 2026-03-12
- Domain: coordinator-tests
- Files: coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed complete-task CLI regressions already cover usage telemetry round-trip persistence (model, token/cache metrics, total_tokens, cost_usd) and backward-compatible no-usage completion with null usage columns. Re-ran coordinator test suite with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/67

## [27] Harden merger request-completion gating and idempotency — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Added a transition-based completion helper so request completion side effects emit only when status truly changes to `completed`, and routed both merge-driven and task-driven completion paths through it. Added regression tests covering assigned sibling-task gating and exactly-once `request_completed` emission after final terminal task transition.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/69

## [28] Render usage telemetry chips in dashboard and popout task views — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Added usage telemetry chip rendering for dashboard and popout task cards with tolerant field aliases and null-safe omission behavior, while preserving existing routing/budget chip behavior. Expanded dashboard render regressions to cover populated/absent usage telemetry for both dashboard and popout render paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/70

## [29] Fix request completion gating with failed-task awareness — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Added explicit `all_completed` + revised `all_done` semantics so mixed completed+failed is not considered done, tightened integrate gating to require all-success completion, and updated check-completion CLI labels to reflect mixed/failed states accurately. Added DB/CLI regressions for mixed-state blocking and all-completed integration success.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/71

## [35] Normalize allocator inbox recipient aliasing — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, templates/docs/master-3-role.md
- What changed: Added inbox recipient normalization so `master-3` aliases to canonical `allocator` in both inbox and inbox-block paths, preventing queue splits while preserving backward compatibility. Updated CLI usage/help and Master-3 template docs/examples to use `allocator` and explicitly note alias behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/73

## [31] Add tasks.model_source schema + DB migration support — 2026-03-12
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js
- What changed: Added `model_source` to the `tasks` schema for fresh installs, extended `ensureTaskRoutingTelemetryColumns` to backfill `tasks.model_source` on existing databases, and updated `VALID_COLUMNS.tasks` so update paths can write `model_source` safely.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/72

## [36] Eliminate duplicate architect new_request notifications — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Removed architect mail emission from handoff bridging so request creation relies on DB-owned `new_request` mail, and recorded `request_queued` as a coordinator activity-log event instead. Added CLI regressions covering both `request` and `loop-request` paths to assert exactly one architect `new_request` and one `request_queued` event per created request ID.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/74

## [32] Persist model_source in assign-task update and rollback paths — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js
- What changed: Assign-task now persists `model_source` on the task row alongside existing routing telemetry, and spawn-failure rollback restores `model_source` from the pre-assignment state to avoid stale telemetry.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/75

## [33] Hydrate model_source in /api/tasks and /api/requests/:id — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/src/web-server.js
- What changed: Added shared task telemetry hydration in `web-server.js` and reused it for `/api/tasks`, `/api/requests/:id`, and `/api/status`, so task payloads now consistently include hydrated `model_source` provenance and related routing fields.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/76

## [30] Fix merger false-completion when tasks fail — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Tightened merger completion semantics so requests only complete when all tasks succeed, blocking both no-merge and merge-driven completion when any task is failed. Added merger regressions for mixed/all-failed no-merge states and merged-queue-plus-failed-sibling gating.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/77

## [37] Fix fallback budget scalar key compatibility and add regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback budget-state resolution to derive scalar budget state when `routing_budget_state` is missing, honoring `routing_budget_flagship_*` first then legacy `flagship_budget_*` values with numeric-string parsing via existing budget helpers. Added assign-task regressions for scalar-key constrained downscale, scalar-key healthy upgrade, and JSON-over-scalar precedence to prevent regressions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/78
## [34] Add regression tests for model_source persistence and API parity — 2026-03-12
- Domain: coordinator-tests
- Files: coordinator/tests/cli.test.js, coordinator/tests/web-server.test.js
- What changed: Added CLI regression coverage for assign-task `model_source` persistence and explicit rollback restoration on spawn failure, plus web API parity coverage proving `/api/tasks` and `/api/requests/:id` both return hydrated `model_source` from row fields and allocator-log fallback.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/79

## [33] Hydrate model_source in /api/tasks and /api/requests/:id — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/src/web-server.js
- What changed: Added a shared `listHydratedTasks` helper and routed `/api/status`, `/api/tasks`, and `/api/requests/:id` through it so all task surfaces use the same telemetry hydration path for `model_source` provenance. Preserved existing response shapes while adding consistency.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/80

## [34] Add regression tests for model_source persistence and API parity — 2026-03-12
- Domain: coordinator-tests
- Files: coordinator/tests/cli.test.js, coordinator/tests/web-server.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed CLI assign-task persistence/rollback regression and `/api/tasks` + `/api/requests/:id` model_source hydration parity coverage are present and passing. Re-ran full coordinator suite with 117/117 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/79

## [38] Fix allocator wake-up contract to mailbox-blocking in loop/docs/templates — 2026-03-12
- Domain: orchestration-docs
- Files: .codex/commands-codex10/allocate-loop.md, .codex/commands/allocate-loop.md, templates/commands/allocate-loop.md, .codex/docs/master-3-role.md, templates/docs/master-3-role.md
- What changed: Replaced allocator signal-wait/completion-signal wake guidance with mailbox blocking via `codex10 inbox allocator --block` plus `ready-tasks`/`worker-status` polling fallback, and removed role-doc completion-signal watch instructions while keeping runtime/template mirrors aligned.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/81
## [39] Fix scalar budget fallback parity in web budget snapshot — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/src/web-server.js, coordinator/tests/cli.test.js
- What changed: Updated web budget snapshot scalar parsing to match CLI fallback semantics by parsing routing scalar values first and falling back to legacy flagship values when parsed routing values are null. Added CLI regression coverage that starts the web API and verifies `/api/status` reports legacy numeric fallback values plus hydrated task telemetry when routing scalar keys are blank/whitespace.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/80

## [38] Fix allocator wake-up contract to mailbox-blocking in loop/docs/templates — 2026-03-12
- Domain: orchestration-docs
- Files: .codex/commands-codex10/allocate-loop.md, .codex/commands/allocate-loop.md, templates/commands/allocate-loop.md, .codex/docs/master-3-role.md, templates/docs/master-3-role.md
- What changed: Added explicit deprecation guidance in allocator loop and Master-3 role docs to avoid `.codex10.task-signal`, `.codex10.fix-signal`, and `.codex10.completion-signal` waiting paths, reinforcing mailbox-blocking (`codex10 inbox allocator --block`) with ready-tasks/worker-status polling fallback.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/82

## [41] Sanitize multiline/control characters in status request rows — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Added shared request-description sanitization in mac10 CLI status and loop-requests renderers so control characters are replaced before 60-char truncation, guaranteeing single-line rows. Added CLI regressions that execute bin/mac10 and verify clean/malicious descriptions cannot inject extra rows or faux status tokens.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/83

## [41] Sanitize multiline/control characters in status request rows — 2026-03-12
- Domain: coordinator-surface
- Files: coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed status and loop-requests summaries sanitize control characters before truncation and preserve single-line rows with regression coverage. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass.
- PR: N/A (already present on origin/main)

## [42] Harden start-task replay handling and add ownership/state regression tests — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added strict `start-task` transition guards that require task ownership and only allow `assigned -> in_progress`, reject terminal replay attempts with `task_not_startable`, and treat same-worker duplicate starts on `in_progress` tasks as idempotent no-ops without extra `task_started` logs. Added CLI regressions for completed-task replay rejection, wrong-worker ownership rejection, and duplicate start idempotency preserving completion metadata.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/84

## [43] Harden backlog-drain pending-row parser predicates — 2026-03-12
- Domain: orchestration-docs
- Files: templates/commands/architect-loop.md, .codex/commands-codex10/architect-loop.md, .codex/commands/architect-loop.md
- What changed: Updated Step 2a backlog-drain shell snippets to parse request rows once and use anchored awk predicates on request-id + status token for pending detection. `pending_count` and `oldest_pending_id` now ignore free-text occurrences of "[pending]" in descriptions while preserving oldest-row semantics.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/85

## [40] Normalize Anthropic cache-key usage aliases in complete-task ingestion — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added alias normalization for `cache_creation_input_tokens` and `cache_read_input_tokens` across CLI parsing and coordinator usage ingestion/mapping so alias and canonical payloads persist identical usage fields while still rejecting unrelated unknown keys. Added regressions for direct API canonical vs CLI alias-only parity plus unknown-key rejection with aliases present.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/86

## [43] Harden backlog-drain pending-row parser predicates — 2026-03-12
- Domain: orchestration-docs
- Files: templates/commands/architect-loop.md, .codex/commands-codex10/architect-loop.md, .codex/commands/architect-loop.md
- What changed: Validation-only completion; confirmed Step 2a uses anchored awk predicates keyed on request-id + status token for both pending_count and oldest_pending_id, preserving oldest pending row selection semantics.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/85

## [44] Enforce worker-task ownership guards for lifecycle commands — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added a shared ownership validator in the worker lifecycle command path and enforced it before any task/worker mutation in `start-task`, `complete-task`, and `fail-task`, with deterministic `ownership_mismatch` rejections plus coordinator `ownership_mismatch` logs. Added regressions for wrong-worker start/complete/fail attempts that assert command rejection and unchanged task/worker state.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/87

## [40] Normalize Anthropic cache-key usage aliases in complete-task ingestion — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed alias normalization for `cache_creation_input_tokens`/`cache_read_input_tokens` to canonical usage keys exists in CLI parsing and server ingestion/mapping, with regression coverage proving canonical-vs-alias parity and unknown-key rejection. Re-ran `npm test -- tests/cli.test.js` (125/125 passing).
- PR: N/A (already present on origin/main)

## [45] FIX: merge conflict for task #44 — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Reapplied worker-task ownership guard logic that failed to rebase by introducing shared lifecycle ownership validation for `start-task`, `complete-task`, and `fail-task`, with coordinator ownership mismatch logging and regression coverage for unauthorized completion/failure paths. Verified with `cd coordinator && npm test -- tests/cli.test.js` (127/127 passing).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/87

## [49] Keep non-conflict merge-failure recovery recoverable while remediation tasks run — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Added active-remediation and grace-window protections to the watchdog `merge_failures` stale-integration path so failed merges remain recoverable while allocator remediation is pending or running. Added regression coverage for delayed remediation task creation after a failed merge and verified request state remains recoverable until remediation goes terminal.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/88

## [51] Route subject-only refactor tasks to mid fallback class — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback routing class detection so `refactor` is recognized from both task subject and description, preserving merge/conflict matching and budget-based effective class behavior. Adjusted CLI regressions to validate subject-only refactor routing and keep description-based refactor routing coverage intact.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/89

## [48] Fix loop sentinel active request precheck JSON parsing — 2026-03-13
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh
- What changed: Updated the tracked loop sentinel precheck to parse `loop-requests --json` and count active statuses from `requests[]` via Node, matching the `.codex` sentinel parsing approach and avoiding table-grep false zeros.
- PR: (not created in this run)

## [50] Accept OpenAI usage aliases and nested cached-token details in complete-task ingestion — 2026-03-13
- Domain: coordinator-surface
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added OpenAI compatibility aliases (`prompt_tokens`, `completion_tokens`) and nested detail flattening (`input_tokens_details.cached_tokens`, `prompt_tokens_details.cached_tokens`) in both CLI and server usage normalization while preserving deterministic duplicate-alias conflict errors and unsupported-key guards. Expanded CLI regressions to verify canonical/Anthropic/OpenAI payload parity and deterministic conflict rejection in both API and CLI paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/91
## [52] FIX: merge conflict for task #47 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Re-landed worker completion instruction updates so `complete-task` docs include optional `[--usage JSON]` telemetry payloads in overlay output, worker-loop Step 8 guidance, and worker template command lists. Added concrete usage JSON examples to reduce missing token/cost reporting.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/90

## [51] Route subject-only refactor tasks to mid fallback class — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only run on synced `origin/main`; confirmed `resolveFallbackRoutingClass` detects `refactor` in both subject and description while preserving merge/conflict and budget-adjusted effective-class behavior. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/89
## [48] Fix loop sentinel active request precheck JSON parsing — 2026-03-13
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh
- What changed: Switched the tracked sentinel ACTIVE_COUNT precheck from table grep parsing to `loop-requests --json` parsing via Node against `requests[]` active statuses (`pending`, `triaging`, `executing_tier1`, `decomposed`, `in_progress`, `integrating`) with safe fallback to zero on parse failure, matching the .codex sentinel approach.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/92

## [54] Fix assign-task claim ownership guard and race regression — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Hardened atomic assign-task worker checks to reject claimed workers with deterministic `worker_claimed` before any task/worker mutations, preserving existing claim metadata. Added CLI regression coverage for claim-worker -> assign-task race, asserting assignment rejection, unchanged worker claim state, and task remaining ready/unassigned.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/93

## [53] FIX: merge conflict for task #47 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Synced worker-loop guidance to codex10 command usage, hardened worker-id extraction for suffixed branch names, and updated worker validation wording to avoid implicit `npm run build` assumptions. Overlay generation now preserves string validation commands and shows explicit validation-command notes.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/95

## [56] Fix merge/conflict fallback routing parity in subject+description — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback routing class resolution so merge/conflict keywords are recognized in both task subject and description (matching refactor parity), preserving existing budget-based effective class behavior. Added CLI regressions for description-only merge/conflict signals to ensure mid-class parity with subject-based cases across default and constrained budget states.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/96

## [57] FIX: functional conflict between tasks #53 and #52 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Merged worker-loop hardening from task #53 with task #52 telemetry docs by adding robust worker-id parsing, codex10 command-path parity, and explicit validation instructions that only task-provided commands should run (no implicit npm build assumption). Overlay validation rendering now handles raw string commands and emits the same explicit no-assumption note.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/97

## [59] Fix docs/typo low-priority routing parity — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback low-priority keyword detection so both `docs` and `typo` are checked symmetrically across task subject and description before routing to `mini`. Added CLI regression coverage proving description-only docs and subject-only typo requests route to `mini` with unchanged fallback routing telemetry semantics.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/98
## [46] FIX: functional conflict between tasks #45 and #44 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added CLI-server bootstrap compatibility that defaults `npm_config_if_present=true` when unset, allowing overlap validation `npm run build` checks to pass when a build script is intentionally absent while preserving explicit env overrides. Added CLI regressions for unset/default and explicit override env behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/100

## [58] Fix complete-task reasoning_tokens usage compatibility — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/src/schema.sql, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Added canonical `reasoning_tokens` support in complete-task usage normalization, including OpenAI detail alias normalization from `completion_tokens_details` and `output_tokens_details`, with deterministic conflict rejection and unchanged unknown-key enforcement. Persisted canonical reasoning usage to `usage_reasoning_tokens` in schema/db migration mapping and expanded CLI regressions for canonical-vs-alias parity and conflict behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/99

## [58] Fix complete-task reasoning_tokens usage compatibility — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/src/schema.sql, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed canonical `reasoning_tokens` is accepted/persisted, OpenAI detail aliases (`completion_tokens_details`/`output_tokens_details`) normalize to the same persisted `usage_reasoning_tokens`, conflict handling stays deterministic, and unsupported usage keys are rejected. Re-ran coordinator CLI suite with full pass (134/134).
- PR: validation-only (no new PR)
## [63] Fix depends_on promotion gating for missing prerequisite task IDs — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/state-machine.test.js
- What changed: Updated `checkAndPromoteTasks` so dependent tasks are promoted only when every dependency ID exists and is completed, preventing missing IDs from being treated as complete. Added regression tests covering nonexistent-only and mixed existing+missing dependency sets to ensure blocked tasks remain pending.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/101

## [62] Improve fallback routing classifier using structured task metadata — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback class resolution to parse and use structured `domain`, `files`, and `validation` metadata so generic wording with code-heavy metadata escalates to `mid`, while preserving low-priority docs/typo routing to `mini`. Added CLI regression coverage for metadata-driven escalation, generic baseline parity, and docs/typo stability under code-heavy metadata.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/102

## [62] Improve fallback routing classifier using structured task metadata — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed `resolveFallbackRoutingClass` already uses `domain`/`files`/`validation` metadata to escalate generic code-heavy tasks while preserving low-priority docs/typo mini routing. Re-ran coordinator CLI test coverage and verified metadata-driven escalation regressions remain green.
- PR: - (validation-only; no new code changes required)

## [61] FIX: merge conflict for task #57 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Rebased and resolved worker-loop/overlay drift by enforcing task-provided validation (no implicit `npm run build`), suffix-safe worker ID extraction (`agent-N-*`), and completion telemetry command parity. Confirmed clean conflict-free file states and reran coordinator tests successfully.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/97

## [60] FIX: functional conflict between tasks #46 and #45 — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Defaulted `npm_config_if_present=true` during coordinator CLI server startup only when unset, so overlap validation `npm run build` no-ops in repos without a build script while respecting explicit env overrides. Added CLI regression coverage for defaulting and override-preservation behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/100

## [65] Preserve predicted-output usage telemetry in complete-task — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/src/schema.sql, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Added canonical `accepted_prediction_tokens`/`rejected_prediction_tokens` usage support and normalized `completion_tokens_details` aliases in both CLI and server parsing with deterministic conflict protection retained. Persisted new usage columns through schema+DB migration/allowlist paths and expanded CLI regressions for canonical-vs-alias parity, conflict rejection, and unknown-key rejection.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/103

## [66] Fix stale scalar budget clear-path syncing into routing_budget_state — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated `set-config` scalar budget handling to always sync legacy alias keys and rebuild `routing_budget_state.flagship` from current scalar fallback values so blank/non-numeric clears remove stale JSON constraints. Added CLI regressions for both blank and non-numeric scalar clear paths to prevent stale downgrade/upgrade routing behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/104

## [64] FIX: functional conflict between tasks #52 and #57 — 2026-03-12
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Updated worker-loop/template and overlay guidance to explicitly prohibit implicit npm run build when validation only provides tier shorthand, and kept completion telemetry instructions aligned.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/105

## [65] Preserve predicted-output usage telemetry in complete-task — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/src/schema.sql, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only on synced `origin/main`; verified canonical + `completion_tokens_details` alias handling for `accepted_prediction_tokens`/`rejected_prediction_tokens` is implemented end-to-end through CLI parser, server normalization, schema/db columns, and deterministic conflict/unknown-key guards.
- PR: N/A (validation-only; no code changes required)

## [67] Make overlap validation script-aware and avoid hardcoded build failures — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Updated overlap validation to stop hardcoding `npm run build`; it now runs `task.validation` when provided, selects a default validation command only when `package.json` exposes `scripts.build` or `scripts.test`, and logs explicit skip reasons when no default command is available. Added merger regression tests proving missing scripts no longer produce false functional conflicts and task-level validation commands still execute.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/106

## [68] FIX: functional conflict after task #60 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added startup compatibility default for `npm_config_if_present` (only when unset) so overlap validation `npm run build` no longer fails in repos without a build script, while preserving explicit env overrides. Added CLI regression coverage that verifies both defaulting and explicit override preservation paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/100

## [69] Fix false-positive merge/conflict routing keyword matching — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Replaced merge/conflict substring detection in fallback routing with token-aware keyword matching so embedded substrings (for example in "Emergency"/"Submerge") no longer trigger `mid` escalation. Added CLI regressions confirming low-priority typo/docs subjects with embedded substrings stay on `mini` routing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/107

## [67] Make overlap validation script-aware and avoid hardcoded build failures — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed overlap validation selects task-specific commands, detects default `scripts.build`/`scripts.test` dynamically, and skips defaults with explicit logging when scripts are missing so missing build scripts do not cause false functional conflicts. Re-ran merger regression coverage with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/106

## [68] FIX: functional conflict after task #60 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced branch; confirmed `start()` defaults `npm_config_if_present=true` only when unset and CLI coverage preserves explicit override behavior, preventing overlap validation failures when `npm run build` is absent. Re-ran tier-2 validation (`cd coordinator && npm test -- tests/cli.test.js`) with full pass (143/143).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/100

## [69] Fix false-positive merge/conflict routing keyword matching — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on synced `origin/main`; confirmed `resolveFallbackRoutingClass` uses token-aware merge/conflict detection and regression coverage ensures subject-only substrings (`Emergency`, `Submerge`) stay on low-priority `mini` routing instead of escalating to `mid`. Re-ran CLI suite with full pass (142/142).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/107
## [70] Add reasoning/prediction telemetry chips in dashboard/popout + regression tests — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Added dashboard and popout telemetry chip rendering for usage reasoning/accepted-prediction/rejected-prediction tokens with snake_case, camelCase, and nested usage alias reads. Expanded dashboard and popout render harness tests to assert chip presence when populated and omission when null.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/108

## [70] Add reasoning/prediction telemetry chips in dashboard/popout + regression tests — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed dashboard/popout telemetry chips include reasoning, accepted prediction, and rejected prediction usage tokens with snake_case/camelCase/nested usage alias reads and null-safe omission behavior. Re-ran `cd coordinator && node --test tests/dashboard-render.test.js` with full pass (4/4).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/108

## [72] Fix overlap validation for shell-style task commands — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Updated overlap validation command parsing/execution so string commands run through shell execution (supporting compound operators and quoted args), while retaining structured build/test/lint object support and handling nested JSON-string encodings. Added merger regressions for compound shell commands, quoted-arg command behavior, and structured validation command objects.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/109

## [73] Fix token-boundary fallback routing for typo/refactor signals — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Replaced substring checks for typo/refactor fallback signals with `hasKeywordToken` token matching so embedded substrings no longer misclassify routing. Added CLI regressions proving `typography` and `prefactor` do not trigger typo/refactor fallback paths while standalone keyword behavior remains intact.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/110

## [75] Add cache-creation telemetry chip support in dashboard and popout — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Added cache-creation token telemetry normalization aliases (top-level, nested usage, and camelCase variants) to dashboard and popout readers, and rendered a dedicated `cache-create` chip when present. Extended dashboard/popout render regression assertions for populated and null cache-creation telemetry behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/108

## [76] Bound assignment-priority merge deferral to prevent starvation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Added assignment-priority merge deferral logic gated by `prioritize_assignment_over_merge`, with bounded starvation escape via consecutive-deferral and pending-age thresholds plus defer/escape telemetry logs. Added merger regression coverage proving a pending merge is deferred first and then forced through even while ready tasks remain.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/111

## [75] Add cache-creation telemetry chip support in dashboard and popout — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Verified dashboard/popout telemetry readers already accept cache-creation aliases across top-level and nested usage shapes, then expanded dashboard-render regressions to assert cache-create chip rendering for supported aliases and omission for null values in both dashboard and popout harnesses.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/108

## [77] Fix spark downscale model_source attribution for alias routing — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated fallback mid->spark budget-downgrade attribution to emit the actual spark alias key selected by precedence (`model_codex_spark` vs `model_spark`) while preserving existing model selection behavior. Added constrained-budget routing regressions asserting alias-specific model_source telemetry, including precedence when both spark aliases are configured.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/112

## [76] Bound assignment-priority merge deferral to prevent starvation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed bounded assignment-priority deferral escape (count/age thresholds), coherent defer/escape telemetry, and regression coverage proving pending merges eventually execute while ready tasks exist. Re-ran `cd coordinator && npm test -- tests/merger.test.js` (143/143 passing in this run).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/111

## [64] FIX: functional conflict between tasks #52 and #57 — 2026-03-12
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Hardened worker-loop branch parsing for suffixed agent branches and clarified validation flow to run only task-provided commands with explicit no-implicit-build guidance. Updated overlay validation rendering for string/tier values and aligned worker completion command docs with optional usage telemetry argument naming.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/113

## [71] Add revision-drift telemetry to status surfaces — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Added `source_revision` telemetry to CLI status responses using git metadata with null-safe fallback when git data is unavailable; updated `mac10 status` to display branch/head/origin/ahead-behind/dirty state and emit a warning on drift or dirty worktree. Added CLI regressions covering payload shape, git-unavailable fallback, git-available telemetry, and warning rendering.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/114

## [78] FIX: functional conflict after task #68 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Restored CLI-server startup compatibility default (`npm_config_if_present=true` only when unset) so overlap validation does not fail on repos without a build script, while preserving explicit operator overrides. Added CLI regressions for unset-default and explicit-override startup behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115

## [74] Add fail-task usage telemetry parity with complete-task — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added optional fail-task `--usage` parsing in CLI, normalized fail-task usage through the same canonical+alias path as complete-task, persisted usage_* columns on failed tasks, and propagated usage in task_failed allocator/architect mail plus worker failure logs. Added CLI regressions for canonical/alias acceptance parity and unknown/conflicting usage-key rejection on fail-task.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/116

## [80] FIX: functional conflict between tasks #45 and #78 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Rebased the #78 branch against the shared ownership-guard changes and preserved overlap-validation compatibility by keeping `npm_config_if_present` startup behavior intact, then added CLI regressions that assert defaulting/override behavior through server restarts.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115

## [74] Add fail-task usage telemetry parity with complete-task — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only on synced `origin/main`; confirmed fail-task already accepts canonical+alias usage payloads with conflict/unknown-key rejection parity, persists `usage_*` fields on failed tasks, and propagates usage in task_failed allocator/architect mails and worker log events. Re-ran `cd coordinator && node --test tests/cli.test.js` with 61/61 passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/116

## [79] FIX: functional conflict between tasks #52 and #64 — 2026-03-12
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Re-landed worker-loop validation conflict guidance by hardening suffix-safe worker ID parsing, clarifying no implicit `npm run build` for tier shorthand validation, and updating overlay validation rendering for string/tier metadata. Aligned worker completion command docs to `[pr_url]` optional usage-telemetry signature.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/105

## [81] FIX: merge conflict for task #78 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Defaulted `process.env.npm_config_if_present` to `true` at CLI server startup only when unset, so overlap validation paths tolerate missing `npm run build` scripts while preserving explicit environment overrides. Added CLI regressions for both defaulting and explicit-override behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115

## [82] FIX: functional conflict between tasks #45 and #78 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Restored coordinator startup compatibility default so `npm_config_if_present` is set to `true` only when unset, preserving explicit overrides. Added CLI regressions that verify both unset defaulting and explicit override preservation across server restarts.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/117

## [84] FIX: functional conflict between tasks #45 and #81 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Resolved the overlap-validation compatibility conflict by keeping a single startup default for `npm_config_if_present` (set only when unset), preventing duplicate/merged-branch regression while preserving explicit env overrides. Re-ran coordinator CLI regression coverage successfully.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115
## [83] FIX: repeated functional conflict in orchestration-docs merge validation — 2026-03-12
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Added suffix-safe worker ID extraction and explicit no-implicit-build guidance for tier shorthand validation in worker-loop docs/templates. Updated overlay validation rendering to show string/tier payloads and the same no-implicit-build note, plus completion command parity with optional usage telemetry args.
- PR: N/A (local task completion reported via codex10 complete-task)

## [87] Implement reasoning/prediction telemetry chips in dashboard and popout — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Added null-safe parsing and chip rendering for usage reasoning, accepted prediction, and rejected prediction tokens across dashboard and popout task telemetry surfaces. Expanded dashboard render regressions to assert populated alias paths and null omission paths for both surfaces.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/118

## [86] Fix allocator template wake-up guidance regression — 2026-03-13
- Domain: orchestration-docs
- Files: templates/commands/allocate-loop.md, templates/docs/master-3-role.md, setup.sh
- What changed: Added explicit deprecation guidance for legacy allocator signal files in both allocator template surfaces and updated setup propagation to force-refresh allocator command/doc files from templates on reruns.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/119

## [85] FIX: functional conflict between tasks #45 and #82 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Restored CLI-server startup compatibility default (`npm_config_if_present=true` only when unset) to prevent overlap-validation false failures when `npm run build` is missing, while preserving explicit env overrides. Added/kept CLI restart regressions verifying unset-default and explicit-override behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/117

## [89] FIX: functional conflict between tasks #45 and #84 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Confirmed and preserved startup defaulting of `npm_config_if_present=true` (only when unset) so overlap validation no-ops missing build scripts instead of failing, while keeping explicit env overrides intact. Verified the corresponding CLI regression coverage and re-ran tier-2 validation successfully.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115

## [90] Fix overlap-validation command selection in merger — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Confirmed overlap validation already resolves configured task/default commands without forcing an unconditional build step, and added regression coverage for default command selection behavior (`build` priority when present, `test` fallback when `build` is absent).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/120

## [85] FIX: functional conflict between tasks #45 and #82 — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Kept the startup compatibility default that sets `process.env.npm_config_if_present='true'` only when unset and retained CLI regression coverage for unset-default and explicit-override behavior. Rebased on `origin/main` and validated with `cd coordinator && npm test` (158/158 passing), confirming overlap validation no longer fails on missing build scripts.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/117
## [92] Add cache-hit ratio telemetry chip in dashboard and popout — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Added cache-hit percentage telemetry derived from cached/input token counts in dashboard and popout telemetry chips with finite/zero guards. Extended dashboard-render regressions to assert populated ratio rendering and guard paths for zero-input plus null/absent usage telemetry on both surfaces.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/121

## [89] FIX: functional conflict between tasks #45 and #84 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Re-landed/validated coordinator startup default for `npm_config_if_present=true` (only when unset) so overlap validation does not fail on repos missing a build script, while preserving explicit env overrides. Confirmed coverage and behavior with `cd coordinator && npm test -- tests/cli.test.js` (162/162 passing).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115

## [88] Remove duplicate handoff-signal waits in architect loop docs — 2026-03-12
- Domain: orchestration-docs
- Files: .codex/commands-codex10/architect-loop.md, .codex/commands/architect-loop.md, templates/commands/architect-loop.md, .claude/commands/architect-loop.md
- What changed: Kept a single per-iteration handoff signal wait in Step 1 and removed duplicate Step 6 blocking guidance by standardizing loop continuation text. Synced template and .claude mirrors to the current codex10 architect-loop flow with adaptive timeout and existing backlog-drain/tiering instructions preserved.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/122

## [91] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Updated overlay validation rendering to handle string/tier shorthand payloads with explicit no-implicit-build guidance, and aligned worker-loop/worker template docs on suffix-safe worker ID parsing plus optional completion usage telemetry syntax.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/123

## [98] Fix wrapped routing_budget_state parsing in dashboard summaries — 2026-03-12
- Domain: dashboard-ui
- Files: gui/public/app.js, coordinator/tests/dashboard-render.test.js
- What changed: Updated dashboard budget helpers to unwrap wrapped routing_budget_state payloads and derive constrained/healthy summaries from parsed.flagship while preserving direct payload and unknown-shape fallback behavior. Added dashboard render regressions covering wrapped constrained and healthy payloads that previously rendered generic key listings.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/115

## [97] Enrich watchdog Case-4 merge_failed allocator payloads — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Replaced Case-4 aggregate allocator merge_failed notification with per-failed-merge mails carrying merge_id/task_id/branch/pr_url/error plus original_task metadata (subject/domain/files/tier/assigned_to). Added watchdog regression coverage asserting one rich allocator mail per failed merge after grace expiry.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/121

## [99] Sync loop-sentinel active-request parser and setup parity guard — 2026-03-12
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh, setup.sh
- What changed: Hardened loop-sentinel ACTIVE_COUNT parsing for JSON payload shape variance while keeping the active-status set unchanged, and added setup copy safeguards to preserve newer .codex loop-sentinel precheck behavior when drift is detected.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/122

## [96] FIX: merge conflict for request req-592efca7 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Defaulted `npm_config_if_present=true` during `cli-server` startup when unset so overlap validation `npm run build` does not fail in repos without a build script, while preserving explicit environment overrides. Added CLI regressions proving defaulting and override-preservation behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/124

## [93] Expand loop-request WHAT verb detection coverage — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Added loop-request quality-gate evaluation helpers in db with WHAT/WHERE/WHY checks, expanded WHAT verb detection to include replace/sync/align/extend/improve, and normalized loop-request descriptions before persistence. Added CLI regressions to verify Replace-led high-signal requests are accepted and vague WHERE-missing requests are still rejected while keeping existing loop-request output tests valid.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/125

## [97] Enrich watchdog Case-4 merge_failed allocator payloads — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Validation-only confirmation on synced branch; Case-4 now emits one allocator `merge_failed` mail per failed merge with merge/task metadata and `original_task` context while preserving request failure transition/logging semantics. Re-ran `cd coordinator && npm test -- tests/watchdog.test.js` and confirmed full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/121

## [100] Compute dynamic retry_after_sec for loop-request hourly rate limits — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Added loop-request hourly cap handling keyed by `loop_request_max_per_hour` and replaced fixed cooldown timing with dynamic `retry_after_sec` calculated from the oldest in-window request expiry (minimum 1 second). Added CLI regression coverage for mixed-age in-window requests to ensure rate-limit retry tracks real window expiry instead of 3600 seconds.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/126

## [93] Expand loop-request WHAT verb detection coverage — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed loop-request WHAT verb detection includes replace/sync/align/extend/improve and quality gate still requires WHERE/WHY signals. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/125

## [101] FIX: functional conflict between tasks #45 and #96 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion after syncing to origin/main; confirmed startup defaulting of `npm_config_if_present` and existing CLI overlap-validation coverage already resolve the missing-build-script conflict. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with 166/166 passing.
- PR: N/A (validation-only, no code changes)

## [99] Sync loop-sentinel active-request parser and setup parity guard — 2026-03-12
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh, setup.sh
- What changed: Kept the ACTIVE_COUNT precheck JSON parser mirrored between tracked/runtime loop sentinels and hardened parser extraction to accept additional JSON request array shapes while preserving existing backoff behavior. Added setup copy-flow parity detection for parser mode drift so a stale tracked parser cannot silently overwrite a newer `.codex` JSON parser mirror.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/128

## [104] FIX: functional conflict between tasks #45 and #94 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed `cli-server.start()` defaults `npm_config_if_present=true` only when unset and overlap-validation regressions already cover missing-build-script compatibility plus explicit override preservation. Re-ran `cd coordinator && npm test` with full pass (166/166).
- PR: N/A (validation-only, no code changes)

## [95] FIX: functional conflict between tasks #45 and #89 — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed `cli-server` startup already defaults `npm_config_if_present=true` only when unset and preserves explicit overrides, preventing missing-build-script overlap failures. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass (166/166).
- PR: N/A (validation-only)

## [106] Sync allocator-loop wake guidance to real mailbox events and bounded block timeout — 2026-03-13
- Domain: orchestration-docs
- Files: .codex/commands-codex10/allocate-loop.md, .codex/commands/allocate-loop.md, templates/commands/allocate-loop.md
- What changed: Replaced stale allocator event guidance with runtime mailbox events only (`tasks_ready`, `tasks_available`, `task_completed`, `task_failed`, `functional_conflict`, `merge_failed`), added a bounded `inbox allocator --block --timeout=10000` wake example tied to 3s/10s fallback cadence, and synced mailbox contract/message handling wording across all mirrors.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/130

## [107] Sync architect-loop template and claude mirrors to codex adaptive single-wait flow — 2026-03-12
- Domain: orchestration-docs
- Files: templates/commands/architect-loop.md, .claude/commands/architect-loop.md
- What changed: Validation-only completion on synced `origin/main`; confirmed Step 1 uses adaptive wait + inbox check as the single wait location and Step 6 is loop-continuation only with no duplicate wait in both mirrors. Parity checks against `.codex/commands/architect-loop.md` and `.codex/commands-codex10/architect-loop.md` passed.
- PR: N/A (no tracked file changes required)

## [109] FIX: functional conflict between tasks #52 and #102 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Restored suffix-safe worker ID extraction in worker-loop docs and clarified that tier shorthand validation (`tier2`/`tier3`) is metadata, not a shell command, with explicit no-implicit-build guidance. Updated overlay validation rendering to preserve string/array/object payloads and aligned worker completion signature naming to `[pr_url]`.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/131

## [103] Accept Anthropic usage.cache_creation object aliases in complete/fail task flows — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Added nested `usage.cache_creation` alias support for Anthropic `ephemeral_5m_input_tokens`/`ephemeral_1h_input_tokens` in both CLI parsing and server normalization, validating nested values as non-negative integers and folding them into canonical `cache_creation_tokens` while preserving unknown-key rejection and scalar alias compatibility. Extended CLI regressions to verify complete-task/fail-task acceptance and invalid nested-value rejection paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/132
## [111] Harden loop-checkpoint/heartbeat guards for stopped or paused loops — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Added active-state guards in `loop-checkpoint` and `loop-heartbeat` so non-active loops are rejected without mutating checkpoint/heartbeat fields, using consistent operator-facing loop status errors. Added CLI regressions for non-active checkpoint rejection, non-active heartbeat no-mutation, and active-loop behavior parity.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/133

## [108] FIX: functional conflict between tasks #45 and #101 — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Removed duplicated `npm_config_if_present` startup regressions in the CLI suite while keeping a single canonical default/override startup pair, resolving shared-file merge artifact noise without changing routing behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/127

## [109] FIX: functional conflict between tasks #52 and #102 — 2026-03-12
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Removed remaining implicit build wording from worker base guidance, aligned worker-loop completion docs to optional `[result] [--usage JSON]` syntax, and kept no-implicit-build validation notes consistent across overlays and template docs.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/131

## [111] Harden loop-checkpoint/heartbeat guards for stopped or paused loops — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced origin/main; active-state guards and regression coverage for non-active checkpoint/heartbeat behavior were already present and passed tier-2 CLI validation.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/133

## [110] Enable loop quality/rate knobs in set-config allowlist with range validation parity — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Extended set-config allowlist for loop request quality/rate keys and added explicit validation/normalization for boolean/int/float values using the same bounds used by loop-request parsing, with clear rejection errors for invalid values. Added CLI regressions covering successful updates and out-of-range rejection behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/136

## [114] Add popout routing-budget indicator parity + wrapped payload tests — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Ported dashboard budget snapshot parsing/rendering helpers into popout tasks so wrapped and direct `routing_budget_state` payloads render constrained/healthy budget summaries with source chips. Added popout render regressions covering wrapped constrained/healthy states and source propagation/override behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/137

## [115] FIX: functional conflict between tasks #45 and #94 — 2026-03-12
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced ; confirmed  defaults  only when unset and existing overlap-validation regressions cover missing-build-script compatibility plus explicit override preservation. Re-ran 
> mac10-coordinator@1.0.0 test
> node --test tests/*.test.js

▶ Allocator tick (thin notifier)
  ✔ should promote pending tasks to ready (69.729085ms)
  ✔ should send tasks_available mail when ready tasks and idle workers exist (57.163944ms)
  ✔ should not notify when no idle workers (50.576414ms)
  ✔ should skip claimed workers when counting idle (50.474577ms)
✔ Allocator tick (thin notifier) (228.546106ms)
▶ Worker claim/release
  ✔ should claim and release workers (42.655836ms)
  ✔ should not claim busy workers (45.228708ms)
✔ Worker claim/release (88.013311ms)
▶ Request completion tracking
  ✔ should detect when all tasks for a request are completed (48.204818ms)
  ✔ should treat mixed completed and failed tasks as not done (56.202228ms)
✔ Request completion tracking (104.566075ms)
CLI TCP bridge listening on localhost:31467
CLI TCP bridge listening on localhost:31905
▶ CLI Server
  ✔ should respond to ping (150.272851ms)
CLI TCP bridge listening on localhost:31905
CLI TCP bridge listening on localhost:31166
  ✔ should default npm_config_if_present to true when unset (146.409022ms)
CLI TCP bridge listening on localhost:31166
CLI TCP bridge listening on localhost:31769
  ✔ should preserve explicit npm_config_if_present overrides (131.980609ms)
CLI TCP bridge listening on localhost:31208
  ✔ should create a request (86.416119ms)
CLI TCP bridge listening on localhost:31742
  ✔ should emit a single architect new_request mail and one request_queued event for request creation (89.274069ms)
CLI TCP bridge listening on localhost:31019
  ✔ should create an urgent fix (88.83468ms)
CLI TCP bridge listening on localhost:31737
  ✔ should return status (119.451347ms)
CLI TCP bridge listening on localhost:31566
  ✔ should gracefully fallback source_revision when git metadata is unavailable (132.449756ms)
CLI TCP bridge listening on localhost:31708
  ✔ should expose source_revision telemetry when git metadata is available (213.205299ms)
CLI TCP bridge listening on localhost:31170
  ✔ should render source_revision warning in CLI status output when revision drift exists (315.036763ms)
CLI TCP bridge listening on localhost:31170
CLI TCP bridge listening on localhost:31156
  ✔ should default npm_config_if_present on startup when unset (131.810378ms)
CLI TCP bridge listening on localhost:31156
CLI TCP bridge listening on localhost:31837
  ✔ should preserve explicit npm_config_if_present values on startup (143.526376ms)
CLI TCP bridge listening on localhost:31077
  ✔ should keep status request rows single-line and preserve clean descriptions (248.548954ms)
CLI TCP bridge listening on localhost:31971
  ✔ should handle triage (91.493021ms)
CLI TCP bridge listening on localhost:31197
  ✔ should create tasks (95.528915ms)
CLI TCP bridge listening on localhost:31502
  ✔ should handle worker task lifecycle (465.577926ms)
CLI TCP bridge listening on localhost:31161
  ✔ should reject start-task for completed tasks (94.319055ms)
CLI TCP bridge listening on localhost:31096
  ✔ should reject start-task when task is assigned to another worker (90.48358ms)
CLI TCP bridge listening on localhost:31306
  ✔ should treat duplicate start-task calls on owned in-progress task as idempotent (113.84169ms)
CLI TCP bridge listening on localhost:31394
  ✔ should reopen failed requests to integrating when start-task begins remediation with merge queue history (92.813895ms)
CLI TCP bridge listening on localhost:31674
  ✔ should persist complete-task usage telemetry fields end-to-end (485.409966ms)
CLI TCP bridge listening on localhost:31664
  ✔ should reject complete-task when task is assigned to another worker and preserve ownership state (85.0187ms)
CLI TCP bridge listening on localhost:31440
  ✔ should reject fail-task when task is assigned to another worker and preserve ownership state (81.217635ms)
CLI TCP bridge listening on localhost:31833
  ✔ should persist and propagate identical usage values for canonical, Anthropic alias, and OpenAI alias fail-task payloads (209.990864ms)
CLI TCP bridge listening on localhost:31863
  ✔ should reject unknown fail-task usage keys even when alias keys are present (77.282493ms)
CLI TCP bridge listening on localhost:31043
  ✔ should reject conflicting duplicate aliases deterministically for fail-task usage (200.389998ms)
CLI TCP bridge listening on localhost:31824
  ✔ should persist identical usage values for canonical, Anthropic alias, and OpenAI alias complete-task payloads (862.430091ms)
CLI TCP bridge listening on localhost:31267
  ✔ should accept Anthropic cache_creation object aliases and fold them into cache_creation_tokens (405.266192ms)
CLI TCP bridge listening on localhost:31369
  ✔ should reject invalid Anthropic cache_creation object alias values for complete-task and fail-task (210.982869ms)
CLI TCP bridge listening on localhost:31356
  ✔ should reject unknown complete-task usage keys even when alias keys are present (77.736915ms)
CLI TCP bridge listening on localhost:31515
  ✔ should reject conflicting duplicate aliases deterministically for complete-task usage (195.349785ms)
CLI TCP bridge listening on localhost:31405
  ✔ should reject complete-task when a PR URL is already owned by another request (807.937915ms)
CLI TCP bridge listening on localhost:31467
  ✔ should fail integrate when completed tasks reuse a PR URL owned by another request (797.48689ms)
CLI TCP bridge listening on localhost:31768
  ✔ should block integrate when a request has mixed completed and failed tasks (78.817485ms)
CLI TCP bridge listening on localhost:31142
  ✔ should integrate when all request tasks are completed with no failures (793.992242ms)
CLI TCP bridge listening on localhost:31443
  ✔ should handle inbox (81.61039ms)
CLI TCP bridge listening on localhost:31701
  ✔ should repair stuck state (80.390484ms)
CLI TCP bridge listening on localhost:31391
  ✔ should return error for unknown commands (81.25367ms)
CLI TCP bridge listening on localhost:31395
  ✔ should create loop and invoke onLoopCreated hook (78.760367ms)
CLI TCP bridge listening on localhost:31426
  ✔ should stop an active loop (81.997358ms)
CLI TCP bridge listening on localhost:31671
  ✔ should reject loop-checkpoint for non-active loops without mutating loop state (80.980306ms)
CLI TCP bridge listening on localhost:31927
  ✔ should reject loop-heartbeat for non-active loops without mutating last_heartbeat (83.590449ms)
CLI TCP bridge listening on localhost:31628
  ✔ should keep active loop checkpoint and heartbeat behavior unchanged (88.105479ms)
CLI TCP bridge listening on localhost:31178
  ✔ should emit a single architect new_request mail and one request_queued event for loop-request creation (87.089756ms)
CLI TCP bridge listening on localhost:31045
  ✔ should keep loop-requests rows single-line with control-char descriptions (228.497437ms)
CLI TCP bridge listening on localhost:31988
  ✔ should accept Replace-starting loop requests when WHERE/WHY quality signals are present (79.071235ms)
CLI TCP bridge listening on localhost:31394
  ✔ should keep rejecting vague loop requests that lack concrete WHERE signals (83.552346ms)
CLI TCP bridge listening on localhost:31808
  ✔ should reject assign-task for claimed workers without mutating task or claim state (82.565332ms)
CLI TCP bridge listening on localhost:31622
  ✔ should label default fallback assignments as fallback-default in response and logs (83.588824ms)
CLI TCP bridge listening on localhost:31714
  ✔ should persist routing telemetry fields on the task row after assignment (81.806427ms)
CLI TCP bridge listening on localhost:31405
  ✔ should reopen failed requests during assign-task based on merge queue presence (82.980713ms)
CLI TCP bridge listening on localhost:31405
CLI TCP bridge listening on localhost:31075
  ✔ should default npm_config_if_present during server start when unset (133.357533ms)
CLI TCP bridge listening on localhost:31075
CLI TCP bridge listening on localhost:31771
  ✔ should preserve explicit npm_config_if_present override during server start (134.070719ms)
CLI TCP bridge listening on localhost:31771
CLI TCP bridge listening on localhost:31180
  ✔ should rollback model_source and assignment state when assign-task spawn fails (135.011042ms)
CLI TCP bridge listening on localhost:31043
  ✔ should label explicit model overrides as config-fallback in response and logs (84.64418ms)
CLI TCP bridge listening on localhost:31175
  ✔ should prefer model_codex_spark for spark routing when both spark aliases are set (80.180689ms)
CLI TCP bridge listening on localhost:31375
  ✔ should remain compatible with model_spark when model_codex_spark is unset (82.719506ms)
CLI TCP bridge listening on localhost:31098
  ✔ should mirror spark model alias writes for set-config and route using either spark key (84.889762ms)
CLI TCP bridge listening on localhost:31903
  ✔ should downscale high and mid routing when flagship budget is constrained (85.49948ms)
CLI TCP bridge listening on localhost:31783
  ✔ should attribute constrained mid-to-spark downgrades to the selected spark alias key (82.454119ms)
CLI TCP bridge listening on localhost:31362
  ✔ should restore normal routing after flagship budget recovers above threshold (85.980863ms)
CLI TCP bridge listening on localhost:31904
  ✔ should classify description-only merge/conflict signals with subject parity (86.240662ms)
CLI TCP bridge listening on localhost:31977
  ✔ should classify low-priority docs/typo signals symmetrically across subject and description (85.865726ms)
CLI TCP bridge listening on localhost:31951
  ✔ should ignore embedded merge/conflict substrings in low-priority docs/typo subjects (86.493368ms)
CLI TCP bridge listening on localhost:31457
  ✔ should ignore embedded typo/refactor substrings in fallback routing signals (86.979716ms)
CLI TCP bridge listening on localhost:31583
  ✔ should escalate generic tasks when code-heavy metadata is present while preserving docs/typo mini paths (89.176022ms)
CLI TCP bridge listening on localhost:31939
  ✔ should downscale routing from scalar budget keys when routing_budget_state JSON is absent (84.591034ms)
CLI TCP bridge listening on localhost:31527
  ✔ should upgrade routing from legacy scalar budget keys when routing_budget_state JSON is absent (86.172976ms)
CLI TCP bridge listening on localhost:31904
  ✔ should expose legacy scalar fallback budget snapshot in /api/status when routing scalar values are blank (93.124ms)
CLI TCP bridge listening on localhost:31246
  ✔ should keep routing_budget_state JSON precedence over scalar fallback keys (83.21011ms)
CLI TCP bridge listening on localhost:31559
  ✔ should clear stale constrained routing_budget_state values when scalar budget keys are blanked (83.837653ms)
CLI TCP bridge listening on localhost:31555
  ✔ should remove stale scalar remaining from routing_budget_state on non-numeric set-config values (86.904705ms)
CLI TCP bridge listening on localhost:31953
  ✔ should apply reasoning config per selected effective class (95.009417ms)
  ✔ should honor model_xhigh/model_mini and per-class reasoning updates on direct fallback classes (88.957521ms)
✔ CLI Server (12006.562341ms)
▶ Dashboard telemetry rendering
  ✔ renders routing, usage, and budget chips from populated telemetry payloads (6.766219ms)
  ✔ renders constrained and healthy budget summaries from wrapped routing_budget_state payloads (4.572701ms)
  ✔ omits routing, usage, and budget chips when telemetry fields are absent or null (4.189314ms)
✔ Dashboard telemetry rendering (16.115745ms)
▶ Popout telemetry rendering
  ✔ renders usage chips from populated telemetry payloads (3.951784ms)
  ✔ omits usage chips when usage telemetry fields are absent or null (3.835759ms)
✔ Popout telemetry rendering (7.930235ms)
▶ Merge queue
  ✔ should enqueue and dequeue merges in FIFO order (65.347106ms)
  ✔ should respect priority (50.905275ms)
  ✔ should track merge status (46.525904ms)
  ✔ should handle conflict status (49.788508ms)
✔ Merge queue (213.242409ms)
▶ Request completion tracking
  ✔ should detect when all tasks for a request are completed (47.695587ms)
  ✔ should not complete when one task is completed and one is failed with no merge queue entries (51.388815ms)
  ✔ should not emit request_completed when all tasks are failed (47.26257ms)
  ✔ should keep request non-completed when merges are done but a sibling task is failed (53.0068ms)
  ✔ should keep request integrating when merges are done but a sibling task is assigned (51.56563ms)
  ✔ should emit request_completed exactly once when final task becomes terminal (37.457533ms)
✔ Request completion tracking (288.75831ms)
▶ Assignment-priority merge deferral
  ✔ should defer merges first, then process one merge after bounded deferrals (42.405801ms)
✔ Assignment-priority merge deferral (42.495401ms)
▶ Overlap validation command selection
  ✔ should skip default overlap validation when build and test scripts are missing (99.562269ms)
  ✔ should run task.validation during overlap checks even when no default script is available (113.508832ms)
  ✔ should prefer build script for default overlap validation when build and test are both present (172.013197ms)
  ✔ should select test script for default overlap validation when build script is missing (94.460983ms)
  ✔ should execute shell-style task.validation commands with compound operators (109.579833ms)
  ✔ should preserve quoted args in shell-style task.validation commands (88.802411ms)
  ✔ should continue supporting structured build/test/lint validation command objects (123.451427ms)
✔ Overlap validation command selection (801.6564ms)
fatal: not a git repository (or any of the parent directories): .git
GraphQL: Could not resolve to a Repository with the name 'org/repo'. (repository)
GraphQL: Could not resolve to a Repository with the name 'org/repo'. (repository)
fatal: not a git repository (or any of the parent directories): .git
fatal: not a git repository (or any of the parent directories): .git
fatal: not a git repository (or any of the parent directories): .git
CLI TCP bridge listening on localhost:31325
▶ Merger input validation
  ✔ should reject branch names with shell metacharacters (89.675231ms)
  ✔ should reject branch names with backticks (25.81567ms)
  ✔ should reject branch names with $() subshell (39.804011ms)
  ✔ should reject malformed PR URLs (36.188857ms)
  ✔ should reject PR URLs with embedded commands (28.420904ms)
  ✔ should accept valid branch names (1386.491517ms)
✔ Merger input validation (1607.111271ms)
▶ SQL column whitelist enforcement
  ✔ should reject invalid columns in updateRequest (35.257779ms)
  ✔ should reject invalid columns in updateTask (29.337572ms)
  ✔ should reject invalid columns in updateWorker (29.099721ms)
  ✔ should reject invalid columns in updateMerge (36.337326ms)
  ✔ should accept valid columns in updateRequest (40.675838ms)
  ✔ should accept valid columns in updateTask (27.885095ms)
  ✔ should accept routing telemetry columns in updateTask (35.042221ms)
✔ SQL column whitelist enforcement (234.05871ms)
▶ Overlay domain path safety
  ✔ should include domain knowledge for safe domains (26.705939ms)
  ✔ should ignore traversal and separator tokens in domain knowledge lookup (26.167189ms)
✔ Overlay domain path safety (53.023419ms)
CLI TCP bridge listening on localhost:31185
▶ CLI server security
  ✔ should reject missing required fields for request command (85.441499ms)
CLI TCP bridge listening on localhost:31943
  ✔ should reject missing required fields for create-task (91.128149ms)
CLI TCP bridge listening on localhost:31239
  ✔ should reject wrong types for typed fields (94.176235ms)
CLI TCP bridge listening on localhost:31333
  ✔ should strip unknown keys from create-task (100.119471ms)
CLI TCP bridge listening on localhost:31438
  ✔ should reject unsafe domain values for create-task (81.937014ms)
CLI TCP bridge listening on localhost:31999
  ✔ should reject missing command field (78.996961ms)
CLI TCP bridge listening on localhost:31013
  ✔ should reject payloads exceeding 1MB (89.364164ms)
  ✔ should set socket permissions to owner-only (80.025398ms)
✔ CLI server security (701.684011ms)
▶ Web mutation route ID validation
  ✔ rejects malformed preset delete IDs and does not delete matching numeric prefix row (42.525618ms)
  ✔ rejects out-of-range preset delete IDs (44.997298ms)
  ✔ allows valid preset delete IDs (32.025912ms)
  ✔ rejects malformed change patch IDs and does not update matching numeric prefix row (132.045632ms)
  ✔ rejects out-of-range change patch IDs (33.747517ms)
CLI TCP bridge listening on localhost:31396
  ✔ allows valid change patch IDs (34.902487ms)
✔ Web mutation route ID validation (320.62038ms)
CLI TCP bridge listening on localhost:31807
▶ Atomic task assignment via CLI
  ✔ should not double-assign a task when called concurrently (86.88927ms)
CLI TCP bridge listening on localhost:31028
  ✔ should not assign to a worker that is no longer idle (90.070114ms)
CLI TCP bridge listening on localhost:31729
  ✔ should persist non-null routing telemetry on task rows after assign-task (84.007337ms)
✔ Atomic task assignment via CLI (261.241891ms)
▶ Watchdog conditional reassignment
  ✔ should not reassign a task that was already completed (29.048132ms)
  ✔ should reassign a task that was in_progress (28.964774ms)
  ✔ should not reassign a task that already failed (25.899642ms)
✔ Watchdog conditional reassignment (84.071564ms)
▶ Bulk assignment correctness
  ✔ should correctly assign 10 tasks across 4 workers with no double-assignment (86.198965ms)
✔ Bulk assignment correctness (86.32687ms)
▶ Request state machine
  ✔ should create a request in pending state (66.699627ms)
  ✔ should transition through triage states (51.044924ms)
  ✔ should list requests by status (46.232688ms)
✔ Request state machine (164.658705ms)
▶ Task state machine
  ✔ should create tasks linked to requests (43.463478ms)
  ✔ should promote pending tasks with no dependencies to ready (48.088668ms)
  ✔ should respect dependency chains (57.643546ms)
  ✔ should prioritize urgent tasks (50.268913ms)
  ✔ should keep pending tasks blocked when dependency IDs do not exist (46.328401ms)
  ✔ should keep mixed existing and missing dependencies blocked (46.715575ms)
✔ Task state machine (292.888418ms)
▶ Worker state machine
  ✔ should register and track workers (37.960634ms)
  ✔ should track worker assignment lifecycle (39.652945ms)
  ✔ should list idle workers (39.502412ms)
✔ Worker state machine (117.250708ms)
▶ Mail system
  ✔ should send and receive mail (27.155303ms)
  ✔ should consume messages (read-once) (23.609547ms)
  ✔ should support peek (non-consuming) (38.016885ms)
  ✔ should only return mail for specified recipient (33.892981ms)
✔ Mail system (122.835437ms)
▶ Activity log
  ✔ should log and retrieve activities (25.775239ms)
✔ Activity log (25.852784ms)
▶ Config
  ✔ should read and write config (28.601533ms)
  ✔ should have default config values (106.315331ms)
✔ Config (135.03489ms)
▶ Watchdog thresholds
  ✔ should have correct escalation order (73.003693ms)
  ✔ should have default values (42.454172ms)
✔ Watchdog thresholds (115.953877ms)
▶ Orphan task recovery
  ✔ should detect orphaned tasks (56.954742ms)
  ✔ should not flag active assignments as orphans (47.247137ms)
✔ Orphan task recovery (104.345577ms)
▶ Heartbeat staleness
  ✔ should detect stale heartbeats (45.947324ms)
  ✔ should respect launch grace period (48.314673ms)
✔ Heartbeat staleness (94.45663ms)
▶ Stale integration recovery
  ✔ keeps failed merge requests recoverable while remediation is active or just queued (51.269795ms)
  ✔ sends per-merge allocator notifications with rich context for terminal failed merges (53.629163ms)
✔ Stale integration recovery (105.053732ms)
▶ Web status telemetry contract
  ✔ returns routing budget contract fields and enriched task telemetry (73.985656ms)
  ✔ returns null/none telemetry defaults when no budget or routing telemetry exists (39.583407ms)
  ✔ returns hydrated model_source parity for /api/tasks and /api/requests/:id (38.57228ms)
✔ Web status telemetry contract (152.876206ms)
ℹ tests 171
ℹ suites 29
ℹ pass 171
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 12904.737948 with full pass (171/171).
- PR: N/A (validation-only, no code changes)

## [117] FIX: functional conflict between tasks #45 and #101 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Kept the npm build-script compatibility behavior from cli-server startup and removed duplicated `npm_config_if_present` startup regressions from cli.test to avoid overlap reland conflicts while preserving one canonical coverage pair. Re-ran tier-2 CLI validation with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/138

## [120] Sync Master-3 role docs to codex10 mailbox-based guidance — 2026-03-12
- Domain: orchestration-docs
- Files: templates/docs/master-3-role.md, .claude/docs/master-3-role.md
- What changed: Mirrored the canonical .codex master-3 role doc into both tracked mirrors so command wrapper usage, inbox wake contract, allocation workflow order, and worker lifecycle wording are identical.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/139
## [113] Expose burn-rate telemetry in /api/status payload and add regression assertions — 2026-03-13
- Domain: coordinator-surface
- Files: coordinator/src/web-server.js, coordinator/tests/cli.test.js
- What changed: Added additive `/api/status` usage burn-rate telemetry fields (15m/60m/24h plus request totals) wired through the DB burn-rate helper with safe zero-default fallback. Added CLI regressions that assert a non-zero helper-driven payload path and a helper-missing zero-safe default path.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/141

## [120] Sync Master-3 role docs to codex10 mailbox-based guidance — 2026-03-12
- Domain: orchestration-docs
- Files: templates/docs/master-3-role.md, .claude/docs/master-3-role.md
- What changed: Validation-only check on synced `origin/main`; both tracked mirrors already matched `.codex/docs/master-3-role.md` exactly, including mailbox wake contract and allocator inbox guidance. Verified identical SHA-256 across all three files and no doc drift.
- PR: -

## [123] FIX: functional conflict for task #117 (merge validation) — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced `origin/main`; confirmed `npm_config_if_present` startup default/override behavior is present in `cli-server` and covered by CLI regressions, then re-ran tier-2 validation with full pass (173/173).
- PR: validation-only (no code changes required)
## [118] FIX: functional conflict for task #47 (worker completion instructions) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Updated overlay validation rendering to handle string/array/object payloads and explicitly call tier shorthand metadata-only with no implicit npm build assumptions. Synced worker-loop/template docs for suffix-safe worker ID parsing and consistent complete-task syntax including optional usage telemetry.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/142

## [124] Add TTL-specific cache-creation fields to schema/db persistence — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js
- What changed: Added dedicated task usage columns for `cache_creation.ephemeral_5m_input_tokens` and `cache_creation.ephemeral_1h_input_tokens` in fresh schema plus startup migrations for existing DBs, and extended the tasks update allowlist to accept both fields while preserving aggregate `usage_cache_creation_tokens` compatibility.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/143

## [121] FIX: merge/integration conflict for task #100 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only resolution on latest origin/main; confirmed task #100/#105 loop-request quality + retry timing logic is already merged, re-synced branch with `git fetch origin && git rebase origin/main`, and re-ran tier-2 validation successfully.
- PR: none (no code diff required)

## [122] FIX: merge conflict for task #110 (PR #136) — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Re-landed the conflicted task-110 changes on top of current main by adding loop request quality/rate `set-config` key allowlisting plus strict type/range normalization for those knobs. Added CLI regressions covering accepted normalized values and rejection of invalid updates while preserving previously stored config values.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/144

## [127] Harden routing_budget_state JSON shape validation across CLI/web status paths — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/web-server.js, coordinator/tests/cli.test.js
- What changed: Tightened routing budget JSON parsing to accept only plain-object shapes (arrays/primitives now treated as invalid) so scalar fallback thresholds remain active in CLI fallback routing and web status snapshots. Added regressions for invalid array payloads in assign-task and /api/status paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/145
## [125] Map TTL-specific cache-creation usage through CLI ingestion — 2026-03-13
- Domain: coordinator-surface
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Updated complete/fail usage normalization and CLI parsing so `usage.cache_creation` preserves `ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens` alongside aggregate `cache_creation_tokens`, and added schema-tolerant task-field mapping plus regression coverage for detailed and aggregate paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/147

## [131] FIX: functional conflict for task #110 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only conflict reconciliation on synced `origin/main`; verified scoped files already aligned and re-ran tier-2 coordinator validation with full pass (179/179), including overlap build-script compatibility behavior.
- PR: validation-only (no code changes required)

## [129] FIX: functional conflict for task #121 merge validation — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-fix reland on synced `origin/main`; confirmed scoped files already include the merged conflict resolution and no additional code changes were required. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with 179/179 passing.
- PR: validation-only (no PR)

## [128] FIX: functional conflict between tasks #45 and #44 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed startup defaulting of `npm_config_if_present=true` (only when unset) and existing CLI overlap-validation regressions already cover missing-build-script compatibility plus explicit override preservation. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass (179/179).
- PR: N/A (validation-only, no code changes)

## [133] FIX: functional conflict for task #129 merge validation — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced `origin/main`; confirmed scoped files have no delta and existing npm build-script compatibility coverage remains intact. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass (179/179).
- PR: validation-only (no PR)
## [126] Expose TTL-specific cache-creation telemetry in dashboard/popout — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Added dashboard and popout telemetry chip rendering for TTL-specific cache-creation tokens (`cache-create-5m`, `cache-create-1h`) with alias-safe reads from top-level and nested usage payloads while preserving aggregate `cache-create` compatibility. Extended dashboard/popout render harness tests to assert populated TTL chips and null/absent omission behavior without regressions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/148
## [130] FIX: functional conflict for task #118 merge validation — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Updated overlay validation rendering to handle string/array/object payloads and explicitly mark tier shorthand as metadata with no implicit npm build inference. Synced worker-loop/template docs for suffix-safe worker ID parsing plus complete-task optional usage/result syntax parity.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/149

## [134] FIX: functional conflict for task #128 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced `origin/main`; scoped files already contained the npm build-script compatibility behavior (`npm_config_if_present` startup default with explicit override preservation). Re-ran tier-2 CLI validation and confirmed full pass (179/179).
- PR: validation-only (no code changes)
## [132] Sync architect-loop mirrors to codex10 contract — 2026-03-13
- Domain: orchestration-docs
- Files: templates/commands/architect-loop.md, .claude/commands/architect-loop.md
- What changed: Validation-only completion; both tracked mirrors were already aligned with the requested Step 1/2a/3b/3c codex10 contract behavior, including captured task IDs and anchored pending parsing.
- PR: (none, no diff)
## [126] Expose TTL-specific cache-creation telemetry in dashboard/popout — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js
- What changed: Validation-only completion on synced `origin/main`; confirmed aggregate `cache-create` plus TTL chips (`cache-create-5m`, `cache-create-1h`) already render with alias-safe reads and null/absent omission behavior. Re-ran `cd coordinator && node --test tests/dashboard-render.test.js` and `cd coordinator && npm test` with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/148 (existing)

## [137] FIX: functional conflict for task #110 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced `origin/main`; confirmed the `npm_config_if_present` startup compatibility guard and scoped regressions already cover missing-build-script overlap validation behavior. Re-ran tier-2 validation with `cd coordinator && npm test -- tests/cli.test.js` (179/179 passing).
- PR: validation-only (no code changes)

## [136] FIX: functional conflict for task #133 merge validation — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced origin/main; verified scoped overlap files match main with no changes required, and re-ran tier-2 CLI regression suite successfully.
- PR: validation-only (no new PR)

## [135] FIX: functional conflict for task #130 merge validation — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Updated worker loop/template guidance to treat tier shorthand as metadata (not shell commands), switched worker-id parsing to suffix-safe extraction, and removed implicit npm build assumptions. Hardened overlay validation rendering to support string/array/object payloads with explicit no-implicit-build guidance.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/150

## [136] FIX: functional conflict for task #133 merge validation — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced origin/main; scoped files already matched with no code changes needed. Re-ran `cd coordinator && npm test -- tests/cli.test.js` and confirmed 179/179 passing.
- PR: validation-only (no PR)

## [139] FIX: merge conflict for request req-7a344cb6 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap merge check after sync to `origin/main`; confirmed scoped diff was empty for both target files and no reland edits were needed. Re-ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 179/179 passing.
- PR: validation-only (no PR)

## [138] FIX: merge conflict for request req-592efca7 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced `origin/main`; scoped files already matched main with no additional edits required. Re-ran tier-2 validation via `cd coordinator && npm test -- tests/cli.test.js` and confirmed full pass (179/179).
- PR: validation-only (no code changes)

## [141] FIX: functional conflict for task #139 merge validation — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; scoped diff for both target files was empty, and tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` passed (182/182).
- PR: N/A (validation-only)

## [142] FIX: functional conflict for task #138 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on synced `origin/main`; confirmed overlap-validation compatibility is already present via startup defaulting of `npm_config_if_present` (with explicit override preservation) and corresponding CLI regressions. Re-ran tier-2 validation with `cd coordinator && npm test -- tests/cli.test.js` and verified full pass (182/182), so no code changes were required.
- PR: validation-only (no new PR)

## [140] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Hardened overlay validation rendering for string/array/object payloads with explicit no-implicit-build guidance, aligned worker-loop mirrors to suffix-safe worker ID parsing and optional complete-task syntax, and updated worker template validation wording so tier labels are treated as metadata.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/152

## [143] FIX: functional conflict between task #105 and task #141 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution on synced origin/main; no scoped file diffs required. Confirmed integration by running `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [144] FIX: functional conflict between task #45 and task #142 — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed overlap-validation compatibility fix is already present (`start()` defaults `npm_config_if_present=true` only when unset) and regression coverage exists in CLI tests. Re-ran `cd coordinator && npm test` with 182/182 passing; no file edits were required.
- PR: N/A (validation-only)
