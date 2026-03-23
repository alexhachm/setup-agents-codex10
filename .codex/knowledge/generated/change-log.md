## [184] Replace .codex symlinks with real dirs in all worktrees — 2026-03-23
- Domain: orchestration-scripts
- Files: setup.sh, scripts/start-common.sh
- What changed: Updated setup/start flows to refresh existing worktrees and enforce real `.codex` directory copies (no symlinks), with a `knowledge/` sanity check and post-setup self-healing for incomplete worker `.codex` directories. Remediated runtime state in `wt-1..wt-4` by replacing broken `.codex` entries with full copies.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/306

## [72] Gate loop-checkpoint updates to active loops only — 2026-03-16
- Domain: coordinator-surface
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint after syncing to origin/main; scoped diff for both files was empty and existing loop-checkpoint handler already rejects non-active loops before update. Ran `cd coordinator && npm test` with 215/215 passing, including regression coverage for stopped/paused loop checkpoint immutability.
- PR: validation-only (no code changes)

## [46] FIX: functional conflict between tasks #19 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all task files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [44] FIX: functional conflict between tasks #25 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all task files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [306] FIX: functional conflict between tasks #52 and #259 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [304] FIX: functional conflict between tasks #52 and #254 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [297] FIX: functional conflict between tasks #52 and #248 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [292] FIX: functional conflict between tasks #52 and #242 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [274] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all four files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [275] FIX: merge conflict for task #233 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/bin/mac10, coordinator/src/index.js, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all four files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [271] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all four files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [263] FIX: functional conflict between tasks #169 and #224 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [260] FIX: functional conflict between tasks #169 and #250 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [259] FIX: functional conflict between tasks #52 and #249 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [254] FIX: functional conflict between tasks #52 and #229 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [247] FIX: functional conflict between tasks #169 and #221 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [245] FIX: functional conflict between tasks #169 and #217 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [244] FIX: functional conflict between tasks #52 and #215 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [229] FIX: functional conflict between tasks #52 and #109 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [227] FIX: functional conflict between tasks #52 and #91 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, confirming no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing, including overlap validation command-selection coverage.
- PR: validation-only (no code changes)

## [225] FIX: functional conflict between tasks #169 and #165 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [220] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all four files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing, including overlap validation command-selection coverage.
- PR: validation-only (no code changes)

## [221] FIX: functional conflict between tasks #169 and #159 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` overlap command-selection coverage.
- PR: validation-only (no code changes)

## [207] FIX: functional conflict for task #61 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [204] FIX: functional conflict for task #195 (validation) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 186/186 passing, including overlap validation command-selection coverage for missing build scripts and `task.validation` fallback behavior.
- PR: validation-only (no code changes)

## [196] FIX: functional conflict for task #190 (validation) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 186/186 passing, including overlap validation command-selection coverage for missing build scripts and `task.validation` fallback behavior.
- PR: validation-only (no code changes)

## [195] FIX: functional conflict for task #187 (validation) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [175] FIX: functional conflict chain for merged task #105 (tasks #121/#129) — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap conflict checkpoint after syncing to origin/main; scoped diff for both files was empty. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [174] FIX: merge conflict chain for PR #100 (tasks #159/#163/#165) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge/functional conflict checkpoint after syncing to origin/main; scoped diff was empty for both lifecycle files. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [166] FIX: functional conflict between tasks #105 and #164 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap check after syncing to origin/main; scoped diff was empty for both requested files, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [163] FIX: merge conflict for task #159 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict resolution check after rebase; scoped files already matched origin/main with no conflict markers. Ran tier-2 coordinator suite to confirm merge readiness.
- PR: validation-only (no code changes)

## [119] Fix createLoopRequest duplicate ordering ahead of cooldown/rate-limit — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/state-machine.test.js

## [146] FIX: functional conflict between task #105 and task #143 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap check; scoped files already matched origin/main and required Tier-2 CLI regression suite passed.
- PR: validation-only (no code changes)
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

## [145] FIX: functional conflict between task #52 and task #140 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Hardened overlay validation rendering for string/array/object payloads and documented that `tier2`/`tier3` are metadata, not executable commands. Synced worker loop/template docs for suffix-safe worker ID parsing and optional completion telemetry syntax to prevent implicit `npm run build` assumptions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/153

## [146] FIX: functional conflict between task #105 and task #143 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution; after syncing to origin/main, scoped diff for the target files was empty and tier-2 CLI regression test passed.
- PR: validation-only (no code changes)

## [148] FIX: functional conflict after task #68 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation on synced `origin/main`; scoped files already matched main and no reland edits were required. Re-ran tier-2 validation with `cd coordinator && npm test -- tests/cli.test.js` and confirmed full pass (182/182).
- PR: validation-only (no code changes)

## [149] FIX: functional conflict between tasks #105 and #146 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap conflict resolution on synced `origin/main`; scoped diff for both target files was empty, so no code edits were required. Re-ran `cd coordinator && npm test -- tests/cli.test.js` and confirmed full pass (182/182).
- PR: validation-only (no code changes)

## [147] FIX: functional conflict between task #52 and task #145 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Reconciled worker-loop/template/overlay validation semantics by making worker ID parsing suffix-safe, clarifying that `tier2`/`tier3` are metadata (not shell commands), and explicitly forbidding implicit `npm run build`. Hardened overlay validation rendering across string/array/object payloads so generated worker overlays preserve the same guidance.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/154

## [150] FIX: merge conflict for task #149 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation on synced `origin/main`; scoped diff for both task files was empty so no code edits were required. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with full pass (182/182).
- PR: validation-only (no code changes)

## [148] FIX: functional conflict after task #68 merge validation — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation on synced `origin/main`; scoped files already matched main with no reland edits required. Re-ran tier-2 validation with `cd coordinator && npm test -- tests/cli.test.js` and confirmed full pass (182/182).
- PR: validation-only (no code changes)

## [151] FIX: functional conflict chain after task #45 merge — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only conflict resolution check; scoped files already matched origin/main with `npm_config_if_present` startup defaulting and overlap-validation coverage present. Re-ran Tier-2 validation (`cd coordinator && npm test -- tests/cli.test.js`) and confirmed 182/182 passing.
- PR: validation-only (no code changes)

## [147] FIX: functional conflict between task #52 and task #145 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Confirmed overlap-fix commit is present on branch and reconciles worker-loop validation semantics (tier metadata vs explicit commands), suffix-safe worker ID parsing, and overlay validation rendering across string/array/object payloads.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/154
- Validation: `cd coordinator && npm test -- tests/cli.test.js` passed (182/182).

## [151] FIX: functional conflict chain after task #45 merge — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on synced `origin/main`; confirmed overlap-build compatibility fix is present (`npm_config_if_present` defaults only when unset) and scoped files already match main. Re-ran Tier-2 validation via `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)
## [152] FIX: functional conflict chain after task #52 merge — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Made overlay validation rendering resilient across string/array/object payloads and added explicit guidance that tier shorthand (`tier2`/`tier3`) is metadata only with no implicit `npm run build`. Updated worker-loop/template docs for suffix-safe worker ID parsing and aligned worker completion argument naming.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/155

## [154] FIX: merge conflict for request req-7a344cb6 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap merge resolution; after syncing to origin/main, scoped diff was empty so no code edits were required. Re-ran tier-2 validation command and confirmed full pass (182/182).
- PR: validation-only (no code changes)
## [153] Sync codex10 architect-loop prompt contract + template mirror — 2026-03-13
- Domain: orchestration-docs
- Files: .claude/commands/architect-loop.md, templates/commands/architect-loop.md, setup.sh
- What changed: Synced Step 3b/3c coordinator-native contract in active/template architect-loop prompts, preserved anchored Step 2a pending-row parsing, and added setup force-refresh propagation for architect-loop mirrors.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/156

## [155] FIX: functional conflict chain after task #52 merge — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Hardened overlay validation rendering to support string/array/object payloads, including `tier2`/`tier3` metadata guidance and explicit no-implicit-build notes. Synced worker docs/templates to suffix-safe worker-id parsing and explicit validation semantics so workers run only task-provided commands.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/157

## [156] Fix OpenAI audio-token usage telemetry ingestion parity — 2026-03-13
- Domain: coordinator-telemetry
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/src/schema.sql, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Added canonical input/output audio token usage fields with OpenAI prompt/input and completion/output detail alias normalization parity across mac10 CLI parsing and server ingestion. Extended task persistence schema/migrations/column allowlists for audio usage columns and added CLI regressions proving canonical vs provider-alias payload parity for complete-task and fail-task flows.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/158

## [159] Guard loop-checkpoint to active loops + regression test — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced origin/main; confirmed `loop-checkpoint` rejects non-active loop status without mutating `iteration_count`/`last_checkpoint`, and matching regression coverage exists in CLI tests. Re-ran tier-2 validation command with full pass.
- PR: validation-only (no code changes)
## [158] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Updated worker-loop docs and worker template to treat tier shorthand validation as metadata, avoid implicit npm run build assumptions, and keep complete-task syntax aligned with optional usage telemetry. Hardened overlay validation rendering across string/array/object payloads with explicit tier metadata notes.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/159

## [159] Guard loop-checkpoint to active loops + regression test — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only completion on synced `origin/main`; confirmed `loop-checkpoint` rejects non-active loop status with clear error and no mutation to `iteration_count`/`last_checkpoint` in stopped/non-active states, with regression coverage asserting this behavior.
- PR: validation-only (no code changes)

## [160] FIX: functional conflict during req-7a344cb6 integration — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap check on synced origin/main; scoped file diff was empty and Tier-2 CLI regression suite passed.
- PR: validation-only (no code changes)

## [164] FIX: functional conflict between tasks #105 and #160 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only resolution after syncing to origin/main; scoped file diff against origin/main was empty, so no code reland was needed. Re-ran Tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [162] Re-land fallback routing safeguards in cli-server + regression tests — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on synced `origin/main`; confirmed fallback safeguards are already present in the active fallback path, including scalar budget parsing, budget-aware effective-class shifts, metadata-driven code-heavy escalation, and downgrade routing telemetry semantics.
- PR: validation-only (no code changes)
## [161] Sync Master-2 loop contract to latest triage/backlog/reset spec — 2026-03-13
- Domain: orchestration-docs
- Files: .claude/commands/architect-loop.md, templates/commands/architect-loop.md, .claude/docs/master-2-role.md
- What changed: Re-synced Master-2 role guidance to the current architect-loop contract with explicit triage-first Tier handling, anchored backlog-drain parsing, Tier2 claim/create/assign/release flow, Tier3 overlap plus coordinator-native signaling semantics, and reset/adaptive-wait parity. Architect-loop runtime/template mirrors were verified in-sync.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/160

## [165] FIX: merge conflict for task #163 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict resolution check after syncing to origin/main; scoped diff for target files was empty and no reland edits were required. Re-ran Tier-2 CLI tests to confirm merge readiness.
- PR: validation-only (no code changes)
## [167] FIX: functional conflict chain for merged task #52 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Hardened overlay validation rendering across string/array/object payloads and documented tier shorthand as metadata with explicit no-implicit-build guidance. Synced worker-loop/template docs for suffix-safe worker ID parsing and optional complete-task usage/result syntax parity.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/161

## [170] FIX: functional conflict/merge chain after task #166 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only reconciliation on synced `origin/main`; confirmed scoped diff against origin/main was empty for both files and no reland edits were required. Ran Tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [161] Sync Master-2 loop contract to latest triage/backlog/reset spec — 2026-03-13
- Domain: orchestration-docs
- Files: .claude/commands/architect-loop.md, templates/commands/architect-loop.md, .claude/docs/master-2-role.md
- What changed: Tightened Step 2 triage-first gating, strengthened Step 2a backlog-drain control with anchored re-measure parsing and oldest-first semantics, and aligned role guidance for reset cadence/distillation without changing Tier 2/Tier 3 ordering or signaling semantics.
- PR: local branch update (no PR created in this run)
## [167] FIX: functional conflict chain for merged task #52 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Re-landed worker-loop/overlay parity for suffix-safe worker ID parsing, validation shorthand metadata guidance, and no-implicit-build instructions. Aligned completion syntax to `complete-task <worker_id> <task_id> [pr_url] [branch] [result] [--usage JSON]` across overlay and worker docs.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/161

## [168] Fix loop-sentinel ACTIVE_COUNT parsing with loop-requests --json parity — 2026-03-13
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh, coordinator/bin/mac10
- What changed: Updated both loop-sentinel ACTIVE_COUNT precheck parsers to consume `loop-requests --json` payloads and preserve the non-terminal status set (`pending`, `triaging`, `executing_tier1`, `decomposed`, `in_progress`, `integrating`). Added loop-requests payload normalization/render helper in coordinator CLI so human output and `--json` mode stay aligned for the same request list.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/162

## [169] FIX: merge conflict chain for PR #100 (tasks #159/#163/#165) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict reconciliation after syncing to origin/main; scoped diff for both files was empty, so no reland edits were needed. Re-ran Tier-2 validation (`cd coordinator && npm test -- tests/cli.test.js`) with 182/182 passing.
- PR: validation-only (no code changes)

## [173] FIX: functional conflict between tasks #105 and #170 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution after sync to origin/main; scoped diff against main was empty for both target files. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [171] Fix partial routing_budget_state scalar fallback merge + regressions — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/web-server.js, coordinator/tests/cli.test.js
- What changed: Added partial-object budget normalization so missing/null flagship fields in `routing_budget_state` are filled from scalar fallback keys without overriding explicit object values. Reused the same parser in fallback routing and `/api/status` budget snapshot logic, and added regression tests for mixed object+scalar routing/snapshot parity.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/163
## [172] FIX: functional conflict between tasks #52 and #167 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Hardened overlay validation rendering to support string/array/object payloads, including tier-metadata no-implicit-build guidance. Synced worker-loop/template docs for suffix-safe worker ID parsing and explicit validation semantics, and aligned completion syntax with optional usage telemetry.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/164

## [173] FIX: functional conflict between tasks #105 and #170 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution after syncing to origin/main; scoped diff for both target files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` and confirmed 182/182 passing.
- PR: validation-only (no code changes)

## [174] FIX: merge conflict chain for PR #100 (tasks #159/#163/#165) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty. Ran Tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 182/182 passing.
- PR: validation-only (no code changes)

## [168] Fix loop-sentinel ACTIVE_COUNT parsing with loop-requests --json parity — 2026-03-13
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh, coordinator/bin/mac10
- What changed: Hardened `loop-requests` payload normalization in CLI JSON/human modes to preserve request arrays across response shapes, and updated both sentinel ACTIVE_COUNT parsers to prefer the first non-empty machine-readable request array while keeping the active status allowlist unchanged.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/165

## [179] FIX: functional conflict for task #165 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation after sync to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were needed. Ran `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [178] FIX: functional conflict for task #170 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation after syncing to origin/main; scoped diff for both files was empty. Ran `cd coordinator && npm test -- tests/cli.test.js` and confirmed 184/184 passing.
- PR: validation-only (no code changes)

## [176] FIX: functional conflict chain for merged task #52 (tasks #53/#57/#61) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Added explicit guardrails across overlay + worker docs that `tier2`/`tier3` are metadata and workers must run only task-provided commands, preventing implicit `npm run build` fallback behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/166

## [177] FIX: functional conflict for task #167 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only reconciliation after syncing to origin/main; scoped diff for all requested files was empty, so no reland edits were needed. Ran tier-2 validation with `cd coordinator && npm test -- tests/cli.test.js` and confirmed 184/184 passing.
- PR: validation-only (no code changes)

## [181] FIX: functional conflict for task #179 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation after syncing to origin/main; scoped diff against main was empty for both target files. Ran Tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [168] Fix loop-sentinel ACTIVE_COUNT parsing with loop-requests --json parity — 2026-03-13
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh, coordinator/bin/mac10
- What changed: Updated loop-request payload normalization in `coordinator/bin/mac10` to accept array and nested request-list shapes, and aligned sentinel ACTIVE_COUNT parsing to consume `loop-requests --json` payloads while counting non-terminal statuses (`pending`, `triaging`, `executing_tier1`, `decomposed`, `in_progress`, `integrating`). Verified tracked/runtime sentinel parser parity.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/165

## [178] FIX: functional conflict for task #170 — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap reconciliation after syncing to origin/main; scoped diff for both files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [183] FIX: functional conflict between tasks #169 and #181 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [182] FIX: functional conflict between tasks #52 and #177 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after rebase to origin/main; scoped files already included the no-implicit-build validation guidance and completion telemetry syntax parity. Re-ran tier-2 coordinator tests (`npm test -- tests/security.test.js tests/cli.test.js`) with 184/184 passing.
- PR: validation-only (no code changes)

## [184] FIX: functional conflict between tasks #169 and #183 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [185] FIX: functional conflict between tasks #169 and #183 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, confirming no reland edits required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing, including overlap validation command-selection cases for missing build-script handling and `task.validation` fallback.
- PR: validation-only (no code changes)

## [185] FIX: functional conflict between tasks #169 and #183 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both files was empty. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing, including overlap validation command-selection coverage.
- PR: validation-only (no code changes)

## [182] FIX: functional conflict between tasks #52 and #177 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Aligned worker-facing validation guidance so tier shorthand (`tier2`/`tier3`) is treated as workflow metadata and explicit task commands are required, preventing inferred `npm run build` behavior. Synced overlay protocol/default base text with worker-loop/template semantics.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/168

## [187] FIX: functional conflict for task #185 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing, including overlap validation command-selection behavior for missing build scripts and task.validation fallback.
- PR: validation-only (no code changes)

## [186] Add loop prompt refresh command for active loops — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Added a new `loop-set-prompt` coordinator command and CLI surface to update an existing loop prompt without recreating the loop, gated to `active`/`paused` statuses via a DB helper that reuses safe loop update logic. Added loop regressions covering prompt refresh via `loop-prompt`, state preservation (`status`, `iteration_count`, `last_checkpoint`), and rejection for disallowed loop statuses.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/169

## [188] FIX: functional conflict for task #47 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only functional-conflict check after syncing to origin/main; scoped diff for all four files was empty and existing content already includes suffix-safe worker ID parsing, validation-metadata-only guidance, and completion usage syntax parity.
- PR: validation-only (no code changes)

## [180] Forward-compatible usage payload handling for complete/fail task — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated complete-task/fail-task usage normalization to preserve unknown provider usage keys for diagnostics while keeping canonical known-field validation and persistence unchanged. Replaced unknown-key rejection regressions with success-path coverage asserting known metric persistence plus diagnostic capture of `service_tier`, `tool_use_prompt_token_count`, and `thoughts_token_count`.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/170

## [190] FIX: functional conflict for task #159 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing, including overlap validation command-selection cases for missing build scripts and task.validation fallback behavior.
- PR: validation-only (no code changes)

## [189] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [180] Forward-compatible usage payload handling for complete/fail task — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Implemented forward-compatible usage normalization so unknown provider keys no longer reject complete-task/fail-task payloads, while preserving known usage metric validation/persistence and adding regression tests for extra fields (`service_tier`, `tool_use_prompt_token_count`, `thoughts_token_count`).
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/170

## [191] FIX: functional conflict for task #182 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap check after syncing to origin/main; scoped files already contained no-implicit-build validation metadata guidance and completion telemetry syntax parity. Ran `cd coordinator && npm test` with 184/184 passing.
- PR: validation-only (no code changes)

## [193] FIX: merge conflict for request req-d6cdbbf7 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff was empty for both lifecycle files so no reland edits were required. Ran tier-2 CLI regression `cd coordinator && npm test -- tests/cli.test.js` with 184/184 passing.
- PR: validation-only (no code changes)

## [192] FIX: merge conflict for request req-a0b3fcce (2) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all four files was empty, and current content already preserves suffix-safe worker-ID parsing, validation metadata/no-implicit-build guidance, and completion usage syntax parity. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)
## [191] FIX: functional conflict for task #182 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap check after syncing with origin/main; all scoped files already contained tier metadata/no-implicit-build guidance and required parity. Ran `cd coordinator && npm test -- tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [197] FIX: functional conflict for task #189 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [194] Sync allocator role-doc contracts with runtime mailbox and assignment behavior — 2026-03-13
- Domain: orchestration-docs
- Files: .codex/docs/master-3-role.md, templates/docs/master-3-role.md, .claude/docs/master-3-role.md, setup.sh
- What changed: Removed lingering `master-3` inbox recipient wording from allocator role-doc mirrors and kept assignment workflow guidance aligned so `assign-task` remains the worker wake/spawn action without manual `launch-worker` follow-up. Preserved setup reset copy reference to `templates/docs/master-3-role.md` and clarified the force-refresh intent.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/171

## [198] FIX: functional conflict for task #188 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all target files was empty and no reland edits were required. Ran tier-2 regression command (`cd coordinator && npm test -- tests/merger.test.js tests/security.test.js`) with full pass.
- PR: validation-only (no code changes)

## [200] FIX: merge conflict for request req-d6cdbbf7 (validation chain) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [203] FIX: functional conflict for task #192 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap closure after syncing to origin/main; scoped diff for all four target files was empty, so no reland edits were needed. Ran coordinator Tier-2 regressions covering overlay/domain safety and overlap validation command selection with full pass.
- PR: validation-only (no code changes)

## [205] FIX: functional conflict for task #53 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [201] Persist raw task usage payload JSON with mapped usage columns — 2026-03-13
- Domain: coordinator-telemetry
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/src/web-server.js, gui/public/app.js
- What changed: Added `tasks.usage_payload_json` with safe DB migration + allowlist support, persisted normalized complete/fail usage payload JSON (including unknown keys) while keeping existing `usage_*` mapped columns, and exposed parsed payload fallbacks through web/UI telemetry paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/172

## [208] FIX: functional conflict for task #130 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four target files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [209] FIX: functional conflict for task #135 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after sync; scoped diff against origin/main was empty for all requested files, so no reland edits were needed. Ran `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [201] Persist raw task usage payload JSON with mapped usage columns — 2026-03-13
- Domain: coordinator-telemetry
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/src/web-server.js, gui/public/app.js
- What changed: Validation-only follow-up on branch `agent-4-task-201`; confirmed `usage_payload_json` migration/allowlist persistence and parsed API/UI exposure are present, then re-ran tier-2 coordinator tests with full pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/172

## [209] FIX: functional conflict for task #135 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/merger.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [210] FIX: functional conflict between tasks #169 and #190 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after rebasing onto origin/main; scoped diff for both lifecycle files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` and confirmed pass (186/186), including overlap command-selection coverage for missing build scripts and `task.validation` fallback behavior.
- PR: validation-only (no code changes)

## [211] FIX: functional conflict between tasks #52 and #189 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 186/186 passing.
- PR: validation-only (no code changes)

## [212] FIX: functional conflict between tasks #169 and #193 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 186/186 passing, including missing-build-script and `task.validation` fallback overlap command-selection coverage.
- PR: validation-only (no code changes)

## [214] FIX: functional conflict between tasks #169 and #195 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Re-ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` overlap command-selection coverage.
- PR: validation-only (no code changes)

## [215] FIX: functional conflict between tasks #52 and #197 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all requested files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [216] Include failed-task spend in burn-rate aggregation + regression test — 2026-03-13
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/state-machine.test.js
- What changed: Updated getUsageCostBurnRate SQL to aggregate usage spend for terminal task rows with status completed or failed in both global burn windows and request-scoped totals while preserving completed_at filters. Added a state-machine regression that creates in-window completed and failed tasks with usage_cost_usd and verifies both global/request totals include both rows while rows lacking completed_at remain excluded.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/174

## [217] FIX: functional conflict between tasks #169 and #212 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation command-selection coverage.
- PR: validation-only (no code changes)

## [218] FIX: functional conflict between tasks #52 and #213 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all target files was empty and existing wording already enforces validation metadata semantics (`tier2`/`tier3`) with no implicit `npm run build`. Re-ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [219] FIX: functional conflict between tasks #52 and #47 (validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty and existing docs/overlay already state that tier shorthand is metadata-only with no implicit `npm run build`. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [222] Re-land loop-set-prompt command handling for active loops — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all three files was empty, confirming `loop-set-prompt` CLI help/dispatch and server lifecycle-guarded prompt snapshot updates are already present. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including active/paused prompt update success and stopped-loop rejection coverage.
- PR: validation-only (no code changes)

## [221] FIX: functional conflict between tasks #169 and #159 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint on synced origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including overlap validation command-selection coverage for missing build scripts and `task.validation` fallback behavior.
- PR: validation-only (no code changes)

## [220] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after sync; scoped diff against origin/main was empty for all target files, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [223] FIX: functional conflict between tasks #169 and #214 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [222] Re-land loop-set-prompt command handling for active loops — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/bin/mac10, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint after sync to origin/main; scoped diff for all target files was empty. Confirmed loop-set-prompt CLI help/dispatch, server lifecycle guard with persisted prompt snapshot update, and active/stopped loop coverage are present; ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [224] FIX: functional conflict between tasks #169 and #163 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback overlap command-selection coverage.
- PR: validation-only (no code changes)

## [226] FIX: functional conflict between tasks #52 and #83 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty and current guidance already treats tier validation shorthand as metadata with no implicit `npm run build`. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [224] FIX: functional conflict between tasks #169 and #163 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [231] FIX: functional conflict between tasks #52 and #118 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty and existing docs/overlay already enforce validation-metadata semantics (`tier2`/`tier3`) with explicit no-implicit-`npm run build` guidance. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [225] FIX: functional conflict between tasks #169 and #165 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only conflict checkpoint after syncing to origin/main; scoped diff for both files was clean so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including overlap command-selection coverage for missing build scripts and `task.validation` fallback behavior.
- PR: validation-only (no code changes)

## [232] FIX: functional conflict between tasks #52 and #130 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing, covering missing-build-script overlap validation behavior.
- PR: validation-only (no code changes)

## [228] FIX: functional conflict between tasks #52 and #102 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all requested files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing, including overlap validation command-selection coverage.
- PR: validation-only (no code changes)

## [230] FIX: functional conflict between tasks #52 and #116 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all target files was empty and existing content already enforces tier-validation metadata semantics with no implicit `npm run build`. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [234] FIX: functional conflict between tasks #52 and #147 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [233] Canonicalize coordinator project identity and block duplicate runtime starts — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/bin/mac10, coordinator/src/index.js, coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only closeout on synced origin/main; requested canonical path normalization, duplicate-runtime guarding, and alias-path regression coverage were already present. Re-ran Tier-2 validation command `cd coordinator && npm test` with 187/187 passing.
- PR: validation-only (no code changes)

## [228] FIX: functional conflict between tasks #52 and #102 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, confirming no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [234] FIX: functional conflict between tasks #52 and #147 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap closure after sync to origin/main; scoped diff for all four files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [236] FIX: functional conflict between tasks #52 and #198 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [235] FIX: functional conflict between tasks #169 and #196 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [237] FIX: functional conflict between tasks #169 and #199 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [236] FIX: functional conflict between tasks #52 and #198 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [239] FIX: functional conflict between tasks #169 and #204 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [238] FIX: functional conflict between tasks #169 and #200 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [240] FIX: functional conflict between tasks #52 and #211 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [239] FIX: functional conflict between tasks #169 and #204 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [241] FIX: functional conflict between tasks #169 and #212 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [242] FIX: functional conflict between tasks #52 and #213 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [243] FIX: functional conflict between tasks #169 and #214 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [246] FIX: functional conflict between tasks #52 and #218 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [248] FIX: functional conflict between tasks #52 and #219 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing, confirming no implicit `npm run build` regression.
- PR: validation-only (no code changes)

## [249] FIX: functional conflict between tasks #52 and #220 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [250] FIX: functional conflict between tasks #169 and #223 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [252] FIX: functional conflict between tasks #52 and #226 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [256] Fix zero-task terminal completion reporting in check-completion — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/db.js, coordinator/bin/mac10, coordinator/tests/allocator.test.js
- What changed: Updated request completion evaluation to include parent request status so zero-task requests become terminal only when request status is completed/failed, added explicit mac10 check-completion labels for those no-task terminal states, and added allocator regressions for pending/completed/failed zero-task request outcomes.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/177
## [255] Sync Master-2 architect loop contract across active/runtime mirrors — 2026-03-13
- Domain: orchestration-docs
- Files: .codex/docs/master-2-role.md, .codex/commands-codex10/architect-loop.md, .codex/commands/architect-loop.md, .claude/docs/master-2-role.md, .claude/commands/architect-loop.md
- What changed: Re-synced codex/claude master-2 role + architect-loop mirrors to a unified codex10-only contract (triage-first flow, anchored backlog-drain parsing, Tier 1 docs-only boundaries, Tier 2 claim/create/assign/release semantics, Tier 3 coordinator-native decomposition boundaries, adaptive wait, and reset/distillation guidance). No tracked code diff was required against origin/main for the .claude mirrors in this worktree.
- PR: validation-only (runtime mirror sync)

## [257] Bound cache-hit telemetry to provider-safe 0-100% logic in dashboard/popout — 2026-03-13
- Domain: dashboard-ui
- Files: gui/public/app.js, gui/public/popout.js, coordinator/tests/dashboard-render.test.js
- What changed: Updated dashboard and popout cache-hit normalization to use a provider-safe denominator when cached tokens exceed input tokens and clamp computed ratios to 0..1 before rendering percentages. Added regression coverage for Anthropic-style payloads in both dashboard and popout render harnesses while keeping normal payload expectations intact.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/178
## [253] FIX: functional conflict between tasks #52 and #227 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty and current guidance already treats tier validation shorthand as metadata with explicit no-implicit-`npm run build` behavior. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)


## [251] FIX: functional conflict between tasks #169 and #224 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [258] FIX: functional conflict between tasks #169 and #247 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [259] FIX: functional conflict between tasks #52 and #249 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all requested files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [260] FIX: functional conflict between tasks #169 and #250 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)
## [261] FIX: functional conflict between tasks #52 and #253 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [262] FIX: functional conflict between tasks #52 and #252 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [264] FIX: functional conflict between tasks #52 and #229 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [265] FIX: functional conflict between tasks #169 and #247 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)
## [266] FIX: functional conflict between tasks #52 and #249 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all requested files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [268] FIX: functional conflict between tasks #52 and #253 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [267] FIX: functional conflict between tasks #169 and #250 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [273] Re-land loop lifecycle write guards for checkpoint/heartbeat — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only reland checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty and active-status guard logic plus non-active mutation regressions were already present. Re-ran Tier-2 validation `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [269] FIX: functional conflict between tasks #52 and #47 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [270] FIX: functional conflict between tasks #169 and #159 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 187/187 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [271] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after sync to origin/main; scoped diff was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 187/187 passing.
- PR: validation-only (no code changes)

## [272] FIX: merge conflict for request req-d6cdbbf7 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 191/191 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [276] FIX: merge conflict for request req-d6cdbbf7 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including overlap validation command-selection coverage for missing build scripts and task.validation fallback behavior.
- PR: validation-only (no code changes)

## [274] FIX: merge conflict for request req-a0b3fcce — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only merge-conflict checkpoint after sync; scoped diff vs origin/main was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [276] FIX: merge conflict for request req-d6cdbbf7 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, confirming missing-build-script overlap handling and task.validation fallback behavior were already present. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [277] FIX: repeated functional conflict chain (npm run build missing script) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after sync to origin/main; scoped diff for all four files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [278] FIX: repeated functional conflict chain (PR #100 / missing build script validation) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [280] FIX: recurring functional-conflict merge chain (missing build script validation) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap closure after syncing to origin/main; scoped diff for all target files was empty, so no reland edits were needed. Ran `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [279] FIX: recurring PR #100 functional-conflict chain (missing build script validation) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only functional-conflict checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback overlap validation coverage.
- PR: validation-only (no code changes)

## [277] FIX: repeated functional conflict chain (npm run build missing script) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after sync to origin/main; scoped diff for all four files was empty and existing docs already state tier shorthand is metadata only with no implicit `npm run build`. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [277] FIX: repeated functional conflict chain (npm run build missing script) — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [279] FIX: recurring PR #100 functional-conflict chain (missing build script validation) — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only functional-conflict checkpoint after syncing to origin/main; scoped diff for both lifecycle files was clean, so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including overlap validation command-selection coverage for missing build scripts and `task.validation` fallback behavior.
- PR: validation-only (no code changes)

## [282] FIX: functional conflict between tasks #169 and #224 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [283] FIX: functional conflict between tasks #52 and #226 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [281] Harden Master-2 incremental-rescan reports-path creation across docs and setup — 2026-03-13
- Domain: orchestration-docs
- Files: .codex/commands-codex10/architect-loop.md, .codex/docs/master-2-role.md, templates/commands/architect-loop.md, templates/docs/master-2-role.md, setup.sh
- What changed: Added explicit `mkdir -p` guards before incremental rescan report redirection in Master-2 command/role docs and mirror templates, and updated setup provisioning to create `.codex/state/reports` for fresh installs.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/179

## [286] FIX: functional conflict between tasks #169 and #235 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only functional-conflict checkpoint after syncing/rebasing to origin/main; scoped diff for both files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [284] FIX: functional conflict between tasks #52 and #227 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [285] FIX: functional conflict between tasks #52 and #229 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [289] FIX: functional conflict between tasks #169 and #238 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [287] FIX: functional conflict between tasks #52 and #236 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [288] FIX: functional conflict between tasks #169 and #237 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [290] FIX: functional conflict between tasks #52 and #240 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [294] FIX: functional conflict between tasks #52 and #244 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [296] FIX: functional conflict between tasks #52 and #246 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after sync to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)
## [293] FIX: functional conflict between tasks #169 and #243 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and task.validation fallback command-selection coverage.
- PR: validation-only (no code changes)

## [299] FIX: functional conflict between tasks #52 and #249 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)


## [301] FIX: functional conflict between tasks #52 and #252 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap closure after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [295] FIX: functional conflict between tasks #169 and #245 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script handling and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [302] FIX: functional conflict between tasks #52 and #253 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [304] FIX: functional conflict between tasks #52 and #254 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [309] Recover stale decomposed zero-task requests in watchdog — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Added watchdog recovery for requests stuck in decomposed with zero tasks for >=15 minutes, failing them with explicit diagnostics, `stale_decomposition_recovered` telemetry, and `master-1` request_failed notification. Wired recovery into startup sweep and periodic ticks, and added regressions for stale/recent/has-task decomposition scenarios.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/180

## [298] FIX: functional conflict between tasks #169 and #247 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [302] FIX: functional conflict between tasks #52 and #253 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)

## [300] FIX: functional conflict between tasks #169 and #250 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [303] FIX: functional conflict between tasks #169 and #251 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)
## [306] FIX: functional conflict between tasks #52 and #259 — 2026-03-13
- Domain: orchestration-docs
- Files: coordinator/src/overlay.js, .claude/commands/worker-loop.md, templates/commands/worker-loop.md, templates/worker-claude.md
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all four files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/security.test.js tests/cli.test.js` with 193/193 passing.
- PR: validation-only (no code changes)


## [310] Resync template architect-loop to codex10 coordinator-native contract — 2026-03-13
- Domain: orchestration-docs
- Files: templates/commands/architect-loop.md
- What changed: Added Tier-2 coordinator `triage` call after captured `task_id` assignment, and tightened Tier-3 decomposition wording to require captured task IDs for dependency wiring while keeping coordinator-native `triage/create-task/check-overlaps` flow with no manual queue/signal handoffs.
- PR: local completion (no PR created in this environment)
## [305] FIX: functional conflict between tasks #169 and #258 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was clean, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [307] FIX: functional conflict between tasks #169 and #260 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing/rebasing to origin/main; scoped diff for both lifecycle files was clean, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, confirming missing-build-script and `task.validation` fallback command-selection behavior already on main.
- PR: validation-only (no code changes)

## [305] FIX: functional conflict between tasks #169 and #258 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [307] FIX: functional conflict between tasks #169 and #260 — 2026-03-13
- Domain: coordinator-lifecycle
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for both lifecycle files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/cli.test.js` with 193/193 passing, including missing-build-script and `task.validation` fallback command-selection coverage.
- PR: validation-only (no code changes)

## [308] Preserve unknown nested usage-detail keys in complete/fail task normalization — 2026-03-13
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/cli.test.js
- What changed: Updated usage normalization for complete/fail task paths to preserve unmapped nested counters from usage detail objects and cache_creation in usage_payload_json while keeping canonical usage_* mappings unchanged. Added regression coverage for complete-task and fail-task nested-key passthrough and aligned cache_creation validation expectations.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/182

## [17] FIX: Define browser-offload task model and persistence — task failure — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/tests/state-machine.test.js
- What changed: Added persisted browser-offload task model columns in schema + idempotent DB migrations, exposed/allowed browser-offload fields in task updates, and introduced guarded browser-offload lifecycle transition logic. Added state-machine regression tests for valid lifecycle progression and invalid transition rejection.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/183

## [16] Fix: URGENT unblock heartbeat-timeout dependency deadlock — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/state-machine.test.js, coordinator/tests/cli.test.js
- What changed: Added a new `replan-dependency` flow (DB helper + RPC + CLI) to atomically replace blocked dependency IDs across pending tasks and auto-promote newly unblocked tasks. Added regression coverage for successful/global + request-scoped replanning and failed-replacement validation.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/184

## [16] Fix: URGENT unblock heartbeat-timeout dependency deadlock (revalidation) — 2026-03-16
- Domain: unset
- Files: coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/state-machine.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only follow-up on synced origin/main with zero branch diff; re-ran coordinator regression suite and confirmed the dependency-replanning unblock path remains healthy.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/184
## [18] BUG audit follow-up: worker orchestration instability runtime fixes — 2026-03-16
- Domain: unset
- Files: scripts/worker-sentinel.sh, .claude/scripts/worker-sentinel.sh, coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/cli.test.js, coordinator/tests/web-server.test.js
- What changed: Worker sentinel now captures assignment ownership context and sends periodic heartbeats while codex is running, reset-worker now skips context-less/stale resets to prevent assignment clobber races, and request creation rejects autonomous command-template payloads from entering the user request queue. Added CLI/Web regressions for reset ownership and prompt-payload rejection paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/185

## [18] BUG audit follow-up runtime stability hardening (validation) — 2026-03-16
- Domain: coordinator-lifecycle
- Files: scripts/worker-sentinel.sh, .claude/scripts/worker-sentinel.sh, coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/cli.test.js, coordinator/tests/web-server.test.js
- What changed: Validation-only rerun confirmed the durable fixes are present on origin/main: sentinel ownership context passthrough, sentinel-managed heartbeat loop during codex exec, stale reset ownership guards, and autonomous command-template request rejection.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/185

## [18] Fix: worker orchestration instability follow-up (validation) — 2026-03-16
- Domain: unset
- Files: scripts/worker-sentinel.sh, coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/cli.test.js, coordinator/tests/web-server.test.js
- What changed: Validation-only rerun after syncing to origin/main; verified sentinel ownership-context passthrough, sentinel-managed heartbeat loop during codex exec, reset-worker stale ownership guards, and autonomous command-template request rejection are present in tracked runtime paths. Ran Tier-2 regression `cd coordinator && npm test -- tests/cli.test.js tests/web-server.test.js` with 203/203 passing.
- PR: validation-only (no code changes)

## [6] Implement quota-aware batching data model and planner primitives — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/src/index.js
- What changed: Added persisted research intent/batch/stage/fanout schema with dedupe, scoring, batch cap, timeout, and retry-aware partial-failure state. Added DB APIs for enqueue+dedupe, deterministic candidate scoring, bounded staged plan materialization, stage/fanout status transitions, and coordinator planner tick startup/shutdown wiring.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/186

## [18] Fix: BUG audit follow-up runtime stability hardening — 2026-03-16
- Domain: unset
- Files: scripts/worker-sentinel.sh, .claude/scripts/worker-sentinel.sh, coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/cli.test.js, coordinator/tests/web-server.test.js
- What changed: Validation-only checkpoint on synced origin/main confirmed all requested safeguards are present: sentinel ownership-context reset passthrough, sentinel-managed heartbeat loop during codex execution, reset-worker stale context/race guards, and autonomous command-template payload rejection for request creation.
- PR: validation-only (no code changes)

## [10] Design project-memory persistence model and snapshot index — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/src/index.js
- What changed: Added persistent project-memory tables for versioned snapshots, snapshot index, insight artifacts, and lineage links with request/task/run lineage, dedupe fingerprints, relevance scores, and governance metadata fields. Added DB APIs to create/query snapshots/artifacts/lineage, idempotent schema migration wiring, and startup snapshot-index rebuild.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/187

## [10] Design project-memory persistence model and snapshot index (validation) — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/src/index.js
- What changed: Validation-only checkpoint after syncing to origin/main confirmed scoped diff is empty for all task files. Ran Tier-3 equivalents with `cd coordinator && npm test -- tests/state-machine.test.js` (203/203 pass) and `cd coordinator && node --test tests/web-server.test.js` (5/5 pass).
- PR: validation-only (no code changes)

## [20] Add claimed_at lifecycle support for worker claims — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/schema.sql, coordinator/src/db.js, coordinator/src/cli-server.js
- What changed: Added `workers.claimed_at` to schema plus idempotent migration/backfill for existing DBs, then updated worker claim/release and claim-clearing lifecycle paths so `claimed_by` and `claimed_at` are always updated together.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/188

## [19] Fix stale worker-claim expiry to use claim timestamp — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js, coordinator/src/cli-server.js
- What changed: Added persisted `workers.claimed_at` support (schema + migration + allowlist), switched claim/release to atomically manage claim timestamps, and updated stale-claim cleanup to expire strictly by claim age while safely skipping legacy null-claim rows. Added watchdog/allocator/CLI regressions to prove fresh claims survive old heartbeats until timeout and claim metadata clears consistently across assignment/reset/repair flows.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/189

## [21] Use claimed_at for stale-claim expiry in watchdog — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: `releaseStaleClaimsCheck` now evaluates claim staleness from `workers.claimed_at` only and releases malformed claimed rows missing `claimed_at` with diagnostic reason `missing_claimed_at`. Added watchdog regression coverage for stale/fresh `claimed_at` behavior and missing-`claimed_at` wedge recovery.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/190

## [19] Fix stale worker-claim expiry to use claim timestamp — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Switched watchdog stale-claim release to evaluate `claimed_at` age only (with legacy null-safe skip), and ensured watchdog reset paths clear `claimed_by`/`claimed_at` consistently. Added regressions proving fresh claims survive old-heartbeat workers until claim timeout and claim metadata lifecycle remains consistent across allocator and CLI reset/repair paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/189

## [22] Add regression coverage for fresh-claim/old-heartbeat race — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/src/watchdog.js, coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Added watchdog stale-claim race regressions proving fresh claims survive stale heartbeats until claim-age timeout, and extended allocator/CLI claim lifecycle coverage to assert claimed_at is set on claim and cleared on release, assignment cleanup, and reset flows.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/191

## [23] FIX: functional conflict between tasks #20 and #19 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution after syncing to origin/main; scoped diff for all task files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 203/203 passing.
- PR: validation-only (no code changes)

## [25] FIX: functional conflict between tasks #20 and #19 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all six files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 206/206 passing.
- PR: validation-only (no code changes)

## [25] FIX: functional conflict between tasks #20 and #19 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff across all task files was empty, so no reland edits were required. Re-ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` and confirmed 206/206 passing.
- PR: validation-only (no code changes)

## [26] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution after syncing/rebasing to origin/main; scoped diff for all three test files was empty and no conflict markers were present. Ran `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 206/206 passing.
- PR: validation-only (no code changes)

## [27] Implement filtered inbox consume semantics in DB and CLI server — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/db.js, coordinator/src/cli-server.js
- What changed: Added optional inbox/inbox-block filters (`type`, `request_id`) in CLI command schemas/handlers and forwarded them to DB lookup APIs. Extended `checkMail` consume semantics so only rows matching recipient + optional filters are consumed, preventing filtered waits from consuming unrelated mailbox messages.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/192

## [28] Add inbox filter flags to mac10 CLI and clarify architect wait docs — 2026-03-16
- Domain: coordinator-surface
- Files: coordinator/bin/mac10, .codex/docs/master-2-role.md, templates/docs/master-2-role.md
- What changed: Extended `mac10 inbox` option parsing/usage to support `--type` and `--request-id`, forwarding both filters in blocking and non-blocking inbox payloads. Updated architect role docs to use filtered blocking waits for clarification responses scoped by request ID.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/193

## [29] Add regression tests for filtered inbox consume behavior — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/cli.test.js
- What changed: Added CLI-server integration regressions for inbox type filtering, payload.request_id filtering, and inbox-block filtered wait semantics; assertions verify only matched messages are consumed and unrelated messages remain unconsumed.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/194

## [30] FIX: functional conflict between tasks #25 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all six files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 206/206 passing.
- PR: validation-only (no code changes)

## [31] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 206/206 passing.
- PR: validation-only (no code changes)

## [30] FIX: functional conflict between tasks #25 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing with origin/main; scoped diff for all task files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` and confirmed 206/206 passing.
- PR: validation-only (no code changes)

## [32] Enforce claimed-worker guard in assign-task and add regression tests — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js, coordinator/tests/security.test.js
- What changed: Added claim-aware rollback handling in `assign-task` so claim-related spawn rollback returns `worker_claimed` and preserves live `claimed_by`/`claimed_at` metadata. Expanded CLI/security regressions to verify deterministic rejection of claimed idle workers and metadata integrity across both direct rejection and rollback paths.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/195

## [32] Enforce claimed-worker guard in assign-task and add regression tests — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js, coordinator/tests/security.test.js
- What changed: Validation-only completion on synced origin/main; deterministic claimed-worker assignment rejection and rollback claim-preservation coverage were already present. Verified impacted suites via `cd coordinator && npm test -- tests/cli.test.js tests/security.test.js` (211/211 passing).
- PR: validation-only (no code changes)

## [33] FIX: functional conflict between tasks #23 and #25 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution after syncing to origin/main; scoped diff for all six files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 211/211 passing, including overlap validation command-selection coverage for missing build scripts.
- PR: validation-only (no code changes)

## [34] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 211/211 passing.
- PR: validation-only (no code changes)

## [35] Guard request completion on task-level all_done in merger — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/state-machine.test.js
- What changed: Updated merge-driven request completion in merger to require both all merge rows merged and `db.checkRequestCompletion(requestId).all_done` before completion side effects. Added a state-machine regression that proves merge success does not complete a request or emit `request_completed` while a sibling task is unfinished, and does complete once all tasks are done.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/196

## [36] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after rebasing onto origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [37] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all three files was empty and conflict-marker scan found none. Ran tier-2 validation `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [37] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after rebasing onto origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [39] FIX: functional conflict between tasks #30 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all six files was empty, so no reland edits were required. Ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [38] FIX: functional conflict between tasks #19 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap resolution after sync/rebase; scoped diff against origin/main was empty for all task files, so no reland edits were required. Ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [41] FIX: functional conflict between tasks #38 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap conflict resolution after syncing to origin/main; scoped diff for all task files was empty so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [42] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all three test files was empty and no conflict markers were present. Ran `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [24] Recover decomposed requests stuck at zero tasks — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/cli-server.js, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js
- What changed: Added shared stale decomposed 0-task recovery in DB, wired it into watchdog and check-completion/integrate guards, and moved Tier-3 allocator wakeup mail to first task creation to avoid decomposed 0/0 stalls. Added watchdog and allocator regressions covering stale 0/0 recovery and non-regression when tasks already exist.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/197

## [47] Sync codex10 allocator prompt mirrors to mailbox-driven wake flow — 2026-03-16
- Domain: orchestration-scripts
- Files: .codex/commands-codex10/allocate-loop.md, templates/commands/allocate-loop.md, scripts/launch-agent.sh, setup.sh
- What changed: Synced the runtime codex10 allocator mirror to canonical mailbox-driven wake/completion handling, moved launch prompt resolution to prefer codex10 mirrors/templates ahead of legacy commands, and copied commands-codex10 mirrors into worktrees during setup to avoid stale allocator instructions in fresh sessions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/198

## [40] FIX: functional conflict between tasks #39 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all six files was empty so no reland edits were required. Ran `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [43] FIX: functional conflict between tasks #23 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all requested files was empty so no reland edits were needed. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 212/212 passing.
- PR: validation-only (no code changes)

## [47] Sync codex10 allocator prompt mirrors to mailbox-driven wake flow — 2026-03-16
- Domain: orchestration-scripts
- Files: .codex/commands-codex10/allocate-loop.md, templates/commands/allocate-loop.md, scripts/launch-agent.sh, setup.sh
- What changed: Validation-only checkpoint after syncing to origin/main; scoped files already matched canonical allocator mailbox contract (mailbox `inbox allocator --block`, supported allocator event names, and assignment-first completion behavior), and setup/launch wiring already pointed to refreshed codex10 allocator mirrors.
- PR: validation-only (no code changes)

## [45] FIX: functional conflict between tasks #30 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all task files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [48] FIX: functional conflict between tasks #45 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all task files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [49] FIX: functional conflict between tasks #46 and #20/#21 — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/watchdog.js, coordinator/src/db.js, coordinator/src/schema.sql, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only overlap checkpoint after syncing to origin/main; scoped diff for all task files was empty, so no reland edits were required. Ran tier-2 regression `cd coordinator && npm test -- tests/watchdog.test.js tests/allocator.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [50] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after rebasing onto origin/main; scoped diff for all three files was empty and conflict-marker scan returned none. Ran `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [50] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing with origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [51] Fix overlap merge validation command selection and missing-build handling — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only checkpoint after syncing to origin/main; overlap validation already selected task-specific/default available commands and skipped absent build/test scripts without false functional-conflict failures. Re-ran `cd coordinator && npm test -- tests/merger.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [52] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after rebasing to origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [53] FIX: merge conflict for task #51 — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped files already matched main with no conflict markers, so no reland edits were needed. Ran tier-2 validation `cd coordinator && npm test -- tests/merger.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [54] FIX: merge conflict for task #51 — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped files already matched main with no conflict markers, so no reland edits were required. Ran tier-2 scoped validation `cd coordinator && node --test tests/merger.test.js` with 18/18 passing.
- PR: validation-only (no code changes)

## [55] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [54] FIX: merge conflict for task #51 — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for both files was empty and no conflict markers were present. Ran `cd coordinator && npm test -- tests/merger.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [55] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for all three files was empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [58] Prevent merger starvation when assignment deferral has no progress — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Added allocator-loop heartbeat staleness as an additional assignment-priority starvation escape in merger deferral, while keeping bounded deferral behavior for healthy assignment activity. Expanded merger regressions to prove healthy-loop deferral still holds and stale-loop + ready-task conditions now continue merge processing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/199

## [58] Prevent merger starvation when assignment deferral has no progress — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Confirmed branch commit `356b7f8` implements assignment-priority liveness escape via bounded deferrals, merge-age budget, and allocator-loop heartbeat staleness detection while preserving healthy-loop deferral behavior. Revalidated regression coverage for stale-loop and healthy-loop paths in `tests/merger.test.js` and full tier-2 suite pass.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/199

## [59] Replace hardcoded npm run build validation defaults in architect instruction mirrors — 2026-03-16
- Domain: orchestration-scripts
- Files: .codex/commands/architect-loop.md, .codex/commands-codex10/architect-loop.md, templates/commands/architect-loop.md, .codex/docs/master-2-role.md, templates/docs/master-2-role.md
- What changed: Updated Tier-1 guidance to script-aware validation (test-first with script fallback) and replaced hardcoded Tier-2/Tier-3 create-task validation examples with dynamic validation_field generation so defaults no longer force missing build scripts.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/200

## [59] Replace hardcoded npm run build validation defaults in architect instruction mirrors — 2026-03-16
- Domain: orchestration-scripts
- Files: .codex/commands/architect-loop.md, .codex/commands-codex10/architect-loop.md, templates/commands/architect-loop.md, .codex/docs/master-2-role.md, templates/docs/master-2-role.md
- What changed: Confirmed mirrors use script-aware validation defaults (test-first with build fallback) and removed any hardcoded default validation:"npm run build" guidance in Tier-1/Tier-2/Tier-3 instructions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/200

## [60] Add loop-refresh-prompt command for active loop prompt updates — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Added explicit `loop-refresh-prompt` command wiring in CLI server and mac10 CLI, backed by a DB helper that reuses loop `updateLoop` flow for active loops. Added regressions for successful refresh + immediate `loop-prompt` readback and missing-loop/invalid-input errors.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/201

## [60] Add loop-refresh-prompt command for active loop prompt updates — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Validation-only checkpoint on existing task branch/PR. Confirmed `loop-refresh-prompt` command wiring, DB update flow via `updateLoop`, CLI exposure/help output, lifecycle logging, immediate `loop-prompt` readback behavior, and error handling tests are present and passing.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/201

## [61] Fix loop sentinel active-request precheck to use JSON-aware active count — 2026-03-16
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh
- What changed: Replaced precheck counting with JSON-driven request status parsing from loop-requests --json using first-non-empty request-array selection, and added explicit safe fallback/backoff when command/JSON parsing fails so sentinel never treats parser failure as zero active work. Verified runtime repros for two integrating requests and invalid JSON fallback.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/new/agent-2-task61-loop-sentinel-active-count

## [61] Fix loop sentinel active-request precheck to use JSON-aware active count — 2026-03-16
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh
- What changed: Hardened ACTIVE_COUNT precheck by requiring non-empty JSON command output and explicit JSON parse/shape validation before counting active request statuses. Empty/invalid/unavailable JSON now maps to explicit error states that force deterministic backoff instead of incorrectly proceeding with ACTIVE_COUNT=0.
- PR: https://github.com/alexhachm/setup-agents-codex10/compare/main...agent-2-task61-loop-sentinel-active-count

## [63] Add stale-loop recovery for stale heartbeat in watchdog monitorLoops — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Watchdog now force-restarts active loops when heartbeat staleness exceeds the threshold even if the tmux pane is still alive, while preserving single-respawn pane-death handling. Added regressions that assert stale live-pane recovery and non-duplicate pane-death recovery behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/new/agent-1-task63-stale-loop-recovery

## [56] FIX: merge conflict for task #22 — 2026-03-16
- Domain: coordinator-tests
- Files: coordinator/tests/allocator.test.js, coordinator/tests/watchdog.test.js, coordinator/tests/cli.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diffs for all three files were empty and no conflict markers were present. Ran tier-2 regression `cd coordinator && npm test -- tests/allocator.test.js tests/watchdog.test.js tests/cli.test.js` with 215/215 passing.
- PR: validation-only (no code changes)

## [64] Fix: PRIORITY OVERRIDE: Execute request req-b78f6d2b immediately as top priority — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/state-machine.test.js
- What changed: Added active priority-override request targeting to ready-task ordering so tasks for override-targeted requests are scheduled ahead of normal backlog priority until the target request reaches a terminal state. Added regressions proving override precedence and terminal-state fallback ordering.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/202

## [62] Filter ready-task discovery/promotion to active requests only — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/allocator.test.js, coordinator/tests/merger.test.js
- What changed: Updated ready-task discovery and pending-to-ready promotion to exclude tasks attached to completed/failed requests. Added allocator and merger regressions ensuring stale terminal-request pending/ready tasks do not affect ready counts or assignment-priority merge deferral.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/203

## [71] Clear stale request completion metadata on terminal->active transitions — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/tests/state-machine.test.js, coordinator/tests/merger.test.js, coordinator/tests/cli.test.js
- What changed: Centralized request lifecycle cleanup in `updateRequest` so transitions from terminal statuses (`completed`/`failed`) to active statuses clear stale `completed_at`/`result`. Added regressions for direct state-machine transitions, merger `onTaskCompleted` integrating transitions, CLI `integrate` transitions, and failed-request reopen flows.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/204

## [71] Clear stale request completion metadata on terminal->active transitions — 2026-03-16
- Domain: coordinator-core
- Files: coordinator/src/db.js, coordinator/src/merger.js, coordinator/src/cli-server.js, coordinator/tests/state-machine.test.js, coordinator/tests/merger.test.js, coordinator/tests/cli.test.js
- What changed: Centralized request transition behavior in `updateRequest` now clears `completed_at` and `result` whenever a request moves from terminal (`completed`/`failed`) back to any active lifecycle status. Added regressions in state-machine, merger, and CLI integrate/reopen flows to prove stale completion metadata is cleared on terminal->integrating/in_progress transitions.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/204

## [65] Fix: UNBLOCK NOW: allocator/architect loops are stale and not assigning work — 2026-03-16
- Domain: coordinator-control-plane
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js, coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Re-landed control-plane liveness safeguards by adding allocator-loop heartbeat staleness as an assignment-priority merge deferral escape and adding watchdog stale-loop self-healing that force-restarts active loop sentinels when heartbeat telemetry is stale despite a live pane. Added dual regression coverage for healthy-vs-stale assignment-priority behavior and stale-loop recovery/pane-death single-respawn behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/205

## [73] Prevent loop-heartbeat writes for stopped/paused loops — 2026-03-16
- Domain: coordinator-surface
- Files: coordinator/src/cli-server.js, coordinator/tests/cli.test.js
- What changed: Updated `loop-heartbeat` to return current loop status for `stopped`/`paused` without mutating `last_heartbeat`, while keeping active heartbeat updates and failed-loop rejection behavior. Added regression coverage asserting stopped/paused heartbeat no-op status responses plus failed-loop immutability/error behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/206

## [57] Deduplicate merge queue rows by request + PR identity — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/cli.test.js
- What changed: Switched merge enqueue dedupe from request/task to request+PR ownership identity (`request_id + pr_url + branch`) and updated queue recovery refresh behavior to reuse a single row across repeat completion cycles while rebinding latest task metadata. Added CLI regression coverage proving repeated complete-task calls for the same request/PR ownership keep one refreshed merge queue row.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/207

## [66] Harden merger execution with preflight, non-fatal cleanup, retry taxonomy, and circuit breakers — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/src/recovery.js, coordinator/tests/merger.test.js
- What changed: Added explicit merge failure taxonomy/policy helpers, preflight infra readiness checks before merge-state mutation, policy-driven retry handling with per-merge circuit-breakers, and non-fatal async post-merge cleanup so cleanup failures no longer flip successful merges to failed/conflict. Added merger regressions for cleanup false-conflict prevention, deterministic preflight infra classification, and repeated-failure retry/circuit-break behavior.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/208

## [63] Add stale-loop recovery for stale heartbeat in watchdog monitorLoops — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Added deterministic stale-heartbeat recovery for active loops by force-restarting wedged sentinels when tmux pane is still alive, while keeping pane-death respawn behavior as-is. Added a watchdog regression test asserting stale live-pane loops are restarted and heartbeat state is refreshed automatically.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/209

## [76] Enforce triage request existence and rows-changed validation — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/db.js, coordinator/tests/cli-server.test.js
- What changed: Updated triage to fail with "Request not found" when request updates affect zero rows and to log architect triage events only after a successful request-state update. `db.updateRequest` now returns row-change metadata, and new CLI-server regressions assert unknown-ID triage fails without audit logs while known-ID triage still succeeds with a single log entry.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/210

## [74] Emit periodic loop heartbeats during sentinel wait/backoff windows — 2026-03-16
- Domain: orchestration-scripts
- Files: scripts/loop-sentinel.sh, .codex/scripts/loop-sentinel.sh
- What changed: Added bounded heartbeat helpers that pulse `loop-heartbeat` during precheck/backoff sleep windows and long post-run sleeps while capping cadence to 30s. Preserved fast stop behavior by keeping the immediate pre-sleep heartbeat exit check and mirrored the same heartbeat/sleep logic in both sentinel variants.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/211

## [77] Monitor and recover stale non-tmux loops in watchdog — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Removed monitorLoops early-skip behavior for non-tmux loops, added explicit non-tmux stale-heartbeat detection with fallback timestamp aging and detached sentinel relaunch flow, and preserved tmux stale monitoring behavior. Added watchdog regressions for non-tmux stale recovery and tmux stale monitoring parity.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/212

## [78] FIX: merge conflict for PR #54 (task #53/#54) — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing to origin/main; scoped diff for both files was empty and no conflict markers were present. Ran tier-2 validation `cd coordinator && npm test -- tests/merger.test.js` with 217/217 passing.
- PR: validation-only (no code changes)

## [3] Add browser launch/attach APIs and websocket callback bridge — 2026-03-16
- Domain: coordinator-surface
- Files: coordinator/src/web-server.js, coordinator/src/index.js, coordinator/src/hub.js
- What changed: Added browser offload HTTP surfaces for launch/attach/status/callback with per-session credentials, callback auth and chatgpt origin checks, timeout-driven failure transitions, and explicit websocket lifecycle events plus state payload session snapshots. Wired coordinator logging hook for browser events and disabled bridge routes in hub mode.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/213

## [2] Implement coordinator command channel for research offload — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/bin/mac10, coordinator/tests/cli.test.js, coordinator/tests/security.test.js
- What changed: Added browser research orchestration command channel end-to-end (session create/attach, guided job start, callback chunk ingest, complete/fail, and status) with strict validation, chatgpt.com workflow allow-listing, callback token auth, size limits, replay-safe idempotency keys, and coordinator log visibility. Added CLI command contracts plus new CLI/security regression coverage for happy paths and malformed/unauthorized inputs.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/214

## [75] Align watchdog stale-heartbeat threshold with sentinel cadence and add regression coverage — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/tests/watchdog.test.js
- What changed: Updated loop stale-heartbeat thresholding to derive from sentinel cadence semantics (30s cadence with missed-beat tolerance), exposed threshold metadata in stale telemetry logs, and added regression coverage ensuring healthy long-backoff heartbeat loops do not emit `loop_heartbeat_stale` while truly stale loops still respawn.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/215

## [79] FIX: merge conflict for task #51 — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only merge-conflict resolution by preserving/restoring local unstaged workspace changes via stash, then confirming `git fetch origin && git rebase origin/main` succeeds cleanly. Verified scoped files have no conflict markers and no diff vs origin/main; tier-2 test invocation is currently blocked by a pre-existing `coordinator/src/db.js` duplicate declaration (`REQUEST_TERMINAL_STATUSES`).
- PR: validation-only (no code changes)

## [4] Build dashboard workflow for browser research offload — 2026-03-16
- Domain: dashboard-ui
- Files: gui/public/index.html, gui/public/app.js, gui/public/styles.css, gui/public/popout.js
- What changed: Added a Browser Offload workflow panel in the dashboard with launch/attach/refresh/retry/cancel controls, live websocket callback timeline, auth/session state rendering, and summarized final result output. Added popout support for `panel=browser` to monitor offload sessions and callback events without affecting existing workers/requests/tasks/log panels.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/216

## [67] Implement bounded liveness retries and safe reassignment for stalled worker/task flows — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/watchdog.js, coordinator/src/allocator.js, coordinator/src/db.js, coordinator/tests/watchdog.test.js, coordinator/tests/allocator.test.js
- What changed: Added shared DB-backed stalled-assignment recovery with bounded reassignment counts, stale heartbeat/orphan detection, retry exhaustion fail-safe behavior, and structured recovery diagnostics. Watchdog and allocator now both invoke this recovery path, and regressions cover stale heartbeat recovery, orphan/stalled reassignment, and retry bounds.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/217

## [79] FIX: merge conflict for task #51 — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/merger.js, coordinator/tests/merger.test.js
- What changed: Validation-only merge-conflict checkpoint after syncing and rebasing onto origin/main; scoped merger files already matched main with no conflict markers or reland diffs. Re-ran tier-2 validation command, which is currently blocked by a pre-existing duplicate `REQUEST_TERMINAL_STATUSES` declaration in `coordinator/src/db.js` unrelated to this task scope.
- PR: validation-only (no code changes)

## [7] Add staged batch orchestration and result fan-out in command channel — 2026-03-16
- Domain: coordinator-routing
- Files: coordinator/src/cli-server.js, coordinator/src/allocator.js, coordinator/src/watchdog.js
- What changed: Added research-orchestration command flow covering enqueue/plan/dispatch/monitor/collect/status with deterministic per-origin fan-out delivery, staged lifecycle transition logs, and partial-failure fallback controls (`retry`/`defer`/`fail`) plus max-batch/max-run-time command-path settings. Extended allocator to auto-plan queued intents and emit research batch availability, and extended watchdog to enforce running-batch timeouts with recoverable fallback propagation.
- PR: https://github.com/alexhachm/setup-agents-codex10/pull/218

## [169] Inspect and clean legacy setup-agent artifacts from external projects — 2026-03-22
- Domain: orchestration-scripts
- Files: /mnt/c/Users/Owner/Desktop/my-app, /mnt/c/Users/Owner/Desktop/KalshiAlpha (external)
- What changed: Removed all legacy setup-agent artifacts (.claude, .worktrees, CLAUDE.md, AGENTS.md, .codex) from both external project directories. Also removed shared state at /home/owner/Desktop/my-app/.claude-shared-state and a temp PR body file (.tmp_pr_task150_body.md) from my-app.
- PR: no-pr-no-remote
