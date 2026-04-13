# Codebase Fix Checklist

Purpose: track the cleanup needed to make this repo understandable, testable, and safe for agents to edit.

Current audit snapshot:

- Repo size observed: about 13G.
- Tracked files observed: 290.
- Tracked lines observed: about 69,545.
- Initial working branch observed: `main...origin/main [ahead 5, behind 47]`.
- Cleanup branch: `10.1`.
- Previous test baseline observed: `cd coordinator && npm test` -> 614 passing, 3 failing.
- Current coordinator baseline: `cd coordinator && npm test` -> 631 passing, 0 failing.
- Main problem: too many competing sources of truth, generated/runtime state in the repo, stale knowledge, and large god modules.

Current precheck notes:

- Branch: `10.1`.
- Upstream: no upstream configured for `10.1`.
- Generated output is now ignored for new/untracked files: `.live-e2e-workspaces/`, `status/live-*`, Python bytecode, DB backup files, and coordinator-local `.claude` runtime state.
- `git status --short --untracked-files=all` dropped from about 6,031 lines before ignore cleanup to 352 lines after ignore cleanup.
- `git worktree list --porcelain` found 30 registered worktrees: 1 main worktree, 8 root worker worktrees under `.worktrees/`, and 21 nested live-E2E worktrees under `.live-e2e-workspaces/`.
- `git worktree prune --dry-run --verbose` produced no prunable missing-path worktrees.
- Tracked generated cleanup pass removed the 15 tracked generated files under `status/live-*`, `.live-e2e-workspaces/**`, and `scripts/__pycache__/**` from source control. Current tracked generated count: 0.
- Active instruction scan now has no matches for deprecated `.codex`, `codex10`, `commands-codex10`, `start-codex`, `build-validator`, `verify-app`, or destructive `git reset --hard` references in active docs/scripts/source.
- Post-precheck validation: `cd coordinator && npm test` -> 619 passing, 0 failing.
- Local checkpoint commit after GUI/Codex cleanup: `5ab43ca` (`chore: remove gui and codex runtime paths`).
- Post-checkpoint preflight: `scripts/preflight.sh` -> tests pass, dirty paths 0, tracked generated artifacts 0, prunable stale worktrees 0.
- Disposable live validation smoke:
  - Tier-1 request path: `validation-20260411T084842Z`, request `req-96ac979f`, completed with 0/0 tasks.
  - Task lifecycle path: `task-validation-20260411T084930Z`, request `req-77c59c18`, task `1`, completed with 1/1 tasks.
  - Both disposable coordinators were stopped, generated tmux sessions were killed, and the real repo returned to a clean worktree.

## Project Direction From Owner

- Preserve the full multi-agent system. Do not regress to a simpler task runner just because the current implementation is messy.
- Treat Claude agents as the up-to-date path.
- Completely remove the baked-in Codex path from the active system.
- Reintroduce Codex only later through the same provider-plugin interface used for Claude, DeepSeek, Gemini, and other agent runtimes.
- Human communication goes through Master 1. File-level source-of-truth cleanup is about implementation artifacts, not changing the human-facing communication model.
- Hide more context from agents by default. The coordinator should serve targeted context on demand or expose commands that let agents request deeper knowledge when needed.
- Use disposable per-task sandboxes for worker execution, while accounting for the current behavior where multiple tasks may be routed to the same worker.
- Keep agent autonomy, but make external tools, coordinator routing, and task direction more robust so success does not depend on agents improvising everything.
- Treat the external research queue as core infrastructure.
- Fully remove the GUI.
- Replace hardcoded provider-specific paths with one plugin-agent integration path.
- Request completion should reflect integrated successful work. Incomplete/failed/superseded sibling tasks should be rerouted or explicitly marked non-blocking, not leave the request stuck forever.
- Keep durable knowledge, but make it curated, small, current, and governed.
- Keep one top-level full-stack startup path. Internally, make startup phases observable and testable instead of forcing humans to start each subsystem manually.
- Keep automatic conflict resolution, but make it bounded, observable, and knowledge-producing.
- Do not use the SQL-backed `mac10 loop` machinery to repair this cleanup branch until that machinery itself is fixed and proven reliable.
- A separate file-controlled provider wrapper is allowed for bounded cleanup passes because it does not use coordinator loop state and can be stopped or redirected through runtime control files.

## Approved Manual Cleanup Route

- Make a local checkpoint commit before each implementation pass; do not push automatically.
- Do not rebase, merge, or reset `10.1` against `origin/main` in the next manual pass.
- Run a validation pass first: smallest live E2E from request creation to completion, with fixes only for blockers found by that validation.
- Defer provider-plugin implementation until after validation.
- Use `plugins/agents/<provider>/plugin.json` as the provider-plugin direction. Claude is first/default; Codex, DeepSeek, Gemini, and future runtimes return only through that interface.
- Use a hybrid sandbox lifecycle: root `.worktrees/wt-<id>/` as worker home, disposable per-task sandboxes for edits, coordinator-owned cleanup, and coordinator-approved reuse only for related/non-conflicting tasks.
- Use explicit task semantics for reroute work: `blocking`, `non_blocking`, `superseded`, `failed_needs_reroute`, and `failed_final`.
- Do not perform destructive cleanup of registered worktrees or live-E2E directories in the next manual pass.
- If using the basic provider wrapper, use `scripts/basic-agent-loop.sh`; do not invoke `mac10 loop`. Stop, pause, or redirect with files under `.agent-loop/basic-agent-loop/control/`.
- Full detail is recorded in `docs/next-loop-decisions.md`.

## Recommended Path Forward - 2026-04-13

Current judgment: the bounded `10.1` cleanup work is past the highest-risk migration failures. The next risk is no longer a missing fix inside Phase 10; it is landing a green but divergent branch without reintroducing GUI/Codex paths, stale generated artifacts, or old runtime assumptions from `origin/main`. Treat the next work as a landing and validation program, not a new feature loop.

Recommended order:

- [x] Freeze source changes on `10.1` until the landing path is chosen. Only allow documentation/checklist updates, research rollup cleanup, and validation evidence. Frozen as of 2026-04-13.
- [x] Decide whether to keep the current knowledge/research dirt: `.claude/knowledge/codebase/.metadata.json`, `.claude/knowledge/signals/uses/2026-04.md`, and `.claude/knowledge/research/topics/10-1-port-sequential-plan/`. **Decision: keep as planning evidence.** All three are already committed and clean. They document research usage signals and the 10.1 port plan — useful context for the integration phase.
- [x] Create a local checkpoint commit for the current `10.1` state after the dirt decision. Validation gate: `scripts/preflight.sh` -> 658 passing, 0 failing, provider plugins pass, tracked generated artifacts 0, prunable stale worktrees 0.
- [x] Produce a reconciliation report before changing branches: compare `10.1` against `origin/main` with commit lists, changed-file stats, and a short keep/drop callout for GUI, Codex, generated artifacts, provider plugins, task-state schema, and knowledge layout. **Report: `docs/reconciliation-report-10.1.md`.** Summary: 37 commits on 10.1, 47 on origin/main, 22 files changed on both, GUI/Codex/generated artifacts should be dropped from origin/main, provider plugins and task-state schema kept from 10.1, 9 origin/main additions evaluated for cherry-pick.
- [x] Owner decision: choose the landing route. Recommended route is a fresh integration branch from `origin/main` plus ordered cherry-pick/tranche application of the `10.1` cleanup commits. Avoid rebasing or merging the current dirty/divergent `10.1` branch in place unless the reconciliation report proves it is safer. **Decision applied 2026-04-13:** user requested no-human-intervention execution, so the conservative default was selected. Created `integrate-10.1` from current `origin/main` (`8161e76`) without rebasing or merging `10.1` in place.
- [x] Build the integration branch in tranches: generated-artifact cleanup first, GUI/Codex removal second, knowledge/instruction normalization third, provider-plugin interface fourth, runtime/startup hardening fifth, merge/reroute/task-state fixes last. Run focused tests after each tranche and full preflight after the final tranche. **Integration evidence:** commits `86473ad`, `9068786`, `154e612`, `882dd47`, `081bbe5`, `0d8a8ba`, and final snapshot tranche; focused validation `node --test tests/state-machine.test.js tests/merger.test.js tests/cli.test.js tests/watchdog.test.js tests/provider-interface.test.js tests/provider-output.test.js tests/workspace-hygiene.test.js` -> 359 passing, 0 failing; full validation `cd coordinator && npm test` -> 658 passing, 0 failing.
- [x] Run a full provider-backed live audit after integration tests pass: start with `./start.sh --provider claude`, submit one Tier 1 request, one worker-owned task request, one research-queue request, and one merge/reroute scenario. Record request IDs, task IDs, failures, and generated runtime paths in this checklist. **Completed with blockers found 2026-04-13.** See "Live Audit Evidence - 2026-04-13" below.
- [x] Decide the worktree cleanup policy only after the live audit. First pass should be non-destructive: inventory, mark active/inactive, and document owner-approved deletion criteria. Do not prune registered worktrees or delete live-E2E directories until this decision is explicit. **Decision: non-destructive only.** `git worktree prune --dry-run --verbose` reported no prunable missing-path worktrees; registered worker/live-E2E worktrees stay in place until an owner-approved deletion list exists. Policy details are in `docs/worktree-lifecycle.md`.
- [x] **P0: Land the live-audit startup fixes as a checkpoint before more migration work.** Fixed during/after the audit in commits `929be96`, `0506230`, and `db4c564`: setup same-file copy guard and CLI socket close, WSL namespace propagation, coordinator detachment via `setsid`, worker sentinel CLI path resolution, Docker worker entrypoint clearing, Dockerfile `CMD`, Docker root project mount, and `coordinator/tests/worker-backend.test.js`.
- [x] **P0: Make default worker isolation truthful and deterministic.** `coordinator/src/worker-backend.js` now verifies that detached `msb` workers remain `RUNNING` after launch and throws with captured sandbox logs if not. This lets the assignment path fall back to Docker/tmux immediately instead of burning task retries on `msb_sandbox_dead`.
- [x] **P0: Block stale branch/PR reuse during worker completion and merge.** `complete-task` and `integrate` now require an explicit valid PR URL before queueing a merge; branch-based PR recovery is disabled unless a future caller explicitly opts in. Terminal `complete-task` replays are skipped idempotently with `duplicate_terminal_completion`, preserving the first completion result, worker counters, and mail.
- [x] **P0: Replace model-inferred health reports with coordinator-served health context.** `health-check` now returns structured project, namespace, worker/task counts, isolation backend selection, Docker/msb status, and research-driver heartbeat/runtime context. `mac10 health` and `mac10 health-check` expose the same JSON for Tier 1/runtime reports.
- [x] **Upstream reconciliation after P0:** `origin/main` is now two commits ahead via PR `#359` (`agent-1`). Decision: intentionally drop it from `integrate-10.1`; its diff reintroduces GUI/Codex/generated fixture surfaces and removes provider/preflight/workspace-hygiene files that this migration deliberately keeps. Recorded in `docs/reconciliation-report-10.1.md`.
- [x] **P1: Implement disposable per-task sandbox lifecycle as its own bounded phase after landing.** Implemented `task_sandboxes` DB/API state, lifecycle CLI commands, assignment/spawn wiring, and age-gated dry-run-capable cleanup. Focused validation: `node --test coordinator/tests/state-machine.test.js` -> 87 passing; `node --test coordinator/tests/cli.test.js` -> 148 passing.
- [x] **P1: Make Docker worker execution provider-ready.** The worker image now installs the active Claude provider CLI package by default, and `mac10 sandbox-provider-smoke [provider] [--run] [--no-build]` verifies the selected provider inside the Docker worker image: provider manifest load, CLI availability, auth check, and noninteractive worker launch rendering. `--run` adds an actual tiny noninteractive provider execution when container credentials are available. Focused validation: `node --test coordinator/tests/sandbox-manager.test.js coordinator/tests/worker-backend.test.js` -> 18 passing; `node --test coordinator/tests/cli.test.js` -> 150 passing. Live Docker validation after image rebuild: `docker build -t mac10-worker:latest -f sandbox/Dockerfile.worker .` passed; direct `providerSmoke(..., { provider: 'claude', build: false })` returned `cli_available=true`, `auth_check=pass`, `noninteractive_launch=dry_run_pass`, `provider_smoke=pass`. Standalone `mac10 sandbox-provider-smoke` still requires a running coordinator socket, by design.
- [x] **P1: Implement coordinator-served context bundles before broad module splitting.** Added `mac10 task-context <task_id>` / `mac10 context-bundle <task_id>` backed by `coordinator/src/context-bundle.js`. The bundle returns task assignment, active task sandbox, safe edit files, validation commands, relevant domain knowledge/research, known pitfalls, recent related task/merge failures, and structured runtime health for the task. Focused validation: `node --test coordinator/tests/cli.test.js` -> 149 passing.
- [ ] **P2: Split `coordinator/src/cli-server.js` only after the integrated branch is green and live-audited.** Extract one command domain at a time, preserve public CLI behavior, and keep `coordinator/tests/cli.test.js` green after each extraction.
  - [x] Extract sandbox and task-sandbox command execution to `coordinator/src/commands/sandbox.js`, leaving command schemas and socket validation in `cli-server.js`. Focused validation: `node --check coordinator/src/cli-server.js`, `node --check coordinator/src/commands/sandbox.js`, `node --test coordinator/tests/cli.test.js` -> 150 passing, and `node --test coordinator/tests/sandbox-manager.test.js coordinator/tests/worker-backend.test.js` -> 18 passing.
  - [x] Extract memory retrieval command execution to `coordinator/src/commands/memory.js`, leaving command schemas and socket validation in `cli-server.js`. Focused validation: `node --check coordinator/src/cli-server.js`, `node --check coordinator/src/commands/memory.js`, `node --test --test-name-pattern="memory" coordinator/tests/cli.test.js` -> 16 passing.
  - [x] Extract change tracking command execution to `coordinator/src/commands/changes.js`, leaving command schemas and socket validation in `cli-server.js`. Added focused CLI coverage for `log-change`, `list-changes`, and `update-change`. Focused validation: `node --check coordinator/src/cli-server.js`, `node --check coordinator/src/commands/changes.js`, `node --check coordinator/tests/cli.test.js`, `node --test --test-name-pattern="changes" coordinator/tests/cli.test.js` -> 2 passing.
  - [x] Extract merge observability command execution to `coordinator/src/commands/merge-observability.js`, leaving command schemas and socket validation in `cli-server.js`. Added focused CLI coverage for `merge-metrics` and `merge-health`. Focused validation: `node --check coordinator/src/cli-server.js`, `node --check coordinator/src/commands/merge-observability.js`, `node --check coordinator/tests/cli.test.js`, `node --test --test-name-pattern="merge observability" coordinator/tests/cli.test.js` -> 2 passing.
  - [x] Extract microVM command execution to `coordinator/src/commands/microvm.js`, leaving command schemas and socket validation in `cli-server.js`. Added focused CLI coverage for `msb-status` and missing-CLI `msb-setup` behavior using mocked `msb` calls. Focused validation: `node --check coordinator/src/cli-server.js`, `node --check coordinator/src/commands/microvm.js`, `node --check coordinator/tests/cli.test.js`, `node --test --test-name-pattern="microvm" coordinator/tests/cli.test.js` -> 2 passing.
  - [x] Extract knowledge-layer command execution to `coordinator/src/commands/knowledge.js`, leaving command schemas and socket validation in `cli-server.js`. Added focused CLI coverage for `knowledge-status`, `knowledge-health`, `knowledge-increment`, and `knowledge-update-index-timestamp`. Focused validation: `node --check coordinator/src/cli-server.js`, `node --check coordinator/src/commands/knowledge.js`, `node --check coordinator/tests/cli.test.js`, `node --test --test-name-pattern="knowledge" coordinator/tests/cli.test.js` -> 2 passing.
  - [ ] Extract the next command domain only after a checkpoint commit and focused coverage review.
- [ ] **P2: Split `coordinator/src/db.js` after `cli-server.js` boundaries are stable.** Extract migrations/schema helpers first, then repository/query helpers, then lifecycle services. Each slice needs focused state-machine or migration tests before the next extraction.
- [ ] **P2: Enable non-Claude providers only after the Claude provider path survives the live audit on the integrated branch.** For each provider, require local CLI/auth health, launch dry-run, one noninteractive task smoke, and output-usage schema validation before setting `enabled: true`.

Live Audit Evidence - 2026-04-13:

- Namespace `liveaudit101` found and fixed three startup blockers: setup copied files onto themselves through symlinked knowledge paths, CLI requests could hang until socket write-side close, and WSL-launched master agents lost `MAC10_NAMESPACE`.
- Namespace `liveaudit101` also found Docker worker exit code 126: image `ENTRYPOINT ["bash"]` plus runtime `bash -c ...` executed Bash as a script. Fixed by clearing Docker entrypoint at launch and changing the worker Dockerfile to `CMD ["bash"]`.
- Namespace `liveaudit102` clean startup passed: `./start.sh --provider claude . 4`, post-start `mac10 ping`, `sandbox-status`, worker registration, and research driver health.
- Tier 1 request `req-5d5314b9` completed, but its natural-language health report was partially wrong; direct CLI evidence is the source of truth.
- Worker request `req-d723aa46`, task `#1`, failed with `worker_death:msb_sandbox_dead` after the configured two liveness reassignments. This exercised reroute/retry creation.
- Retry task `#2` started in tmux fallback, completed, and request `req-d723aa46` reached `completed`; this proves non-sandbox worker execution can still work, but also exposed stale PR/branch recovery risk (`agent-1`, PR `#359`) and duplicate `complete-task` acceptance.
- Research queue item `#1` in `liveaudit102` completed for topic `e2e-audit`; evidence note `R-6c58b0` was written under `.claude/knowledge/research/topics/e2e-audit/`.
- P0 follow-up validation after the audit: `git diff --check`, `node --test coordinator/tests/worker-backend.test.js`, `node --test coordinator/tests/cli.test.js`, the broader provider/watchdog/merger/workspace slice, and `scripts/preflight.sh` all passed. Preflight result: 663 passing tests, provider plugins pass, tracked generated artifacts 0, prunable stale worktrees 0. New coverage proves `msb` startup verification, no-PR merge skipping, duplicate completion idempotence, and structured health context.

Stop conditions:

- Stop if reconciliation requires choosing between `origin/main` behavior and a `10.1` cleanup behavior without an obvious winner.
- Stop if a tranche reintroduces active `.codex`, `codex10`, GUI, generated artifact, or destructive `git reset --hard` references.
- Stop if live provider validation requires credentials, paid external services, or browser state that is not available locally.
- Stop if a sandbox/worktree step requires deleting registered worktrees before the owner approves deletion criteria.
- Stop if module splitting starts to change public CLI behavior instead of only moving code behind existing tests.

## Phase 0 - Freeze And Baseline

- [x] Stop broad feature work until the repo has a clean baseline.
- [x] Preserve the current full-system ambition while fixing reliability.
- [x] Decide whether `main` should be rebased, merged, or reset against `origin/main`.
- [x] Save or intentionally discard local uncommitted changes after review.
- [x] Record the current failing test output in one canonical place.
- [x] Fix or explicitly quarantine the three current `watchdog.test.js` failures.
- [x] Get `cd coordinator && npm test` green.

## Phase 1 - Remove Generated Noise From Normal Context

- [x] Add ignore rules for generated live E2E workspaces.
- [x] Add ignore rules for live run and repair artifacts.
- [x] Add ignore rules for `__pycache__/`.
- [x] Stop tracking Codex runtime lock, pid, health, and local env files.
- [x] Remove or migrate `.codex/state/` runtime files as part of Codex removal.
- [x] Move bulky historical artifacts outside the repo or into an archive path agents do not scan.
- [x] Keep only one current E2E summary in normal repo context.

Historical artifact archive:

- Moved `claude-reference-index.md` (42KB, generated March 7 from old `setup-agents-mac10` path) to `docs/archive/`.
- Moved `GUI_CODEX_REMOVAL_INVENTORY.md` (6KB, completed removal inventory) to `docs/archive/`.
- Added `docs/archive/` to `docs/agent-context-map.md` "Do Not Edit As Source" list so agents skip it during scans.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.

## Phase 2 - Repair Worktree Hygiene

- [x] List all registered git worktrees.
- [x] Identify stale, nested, or duplicate worktree registrations.
- [ ] Prune worktrees that no longer correspond to active work.
- [x] Ensure `.live-e2e-workspaces/` is not treated as normal development context.
- [x] Ensure workers do not inherit stale provider state files when worktrees are created.
- [ ] Define disposable per-task sandbox lifecycle for workers.
- [ ] Define how multiple tasks routed to the same worker should reuse or replace sandboxes.
- [x] Document the intended lifecycle for root worktrees, worker sandboxes, and live E2E workspaces.

## Phase 3 - Remove Codex As A First-Class Path

- [x] Inventory `.codex` before deletion so useful research, setup, or provider behavior is not accidentally lost.
- [x] Migrate any still-useful `.codex/knowledge/research` content into the canonical research/knowledge location.
- [x] Migrate any still-useful `.codex/scripts` behavior into provider-neutral coordinator/runtime code or the future plugin path.
- [x] Remove hardcoded `codex10`, `mac10-codex10`, `start-codex`, and Codex-specific wrapper paths from active startup.
- [x] Remove setup behavior that copies `.codex` into worker sandboxes.
- [x] Remove root instructions that tell workers to read `.codex/knowledge/*`.
- [x] Remove `.codex/state` from tracked and normal runtime context.
- [x] Remove old `.codex.pre-shared-*` snapshots from normal context.
- [x] Preserve Codex as a future provider plugin concept only, not as a root runtime namespace.
- [x] Document Claude as the active default provider until plugin integration lands.

## Phase 4 - Normalize Knowledge Files

- [x] Create one canonical knowledge layout.
- [x] Resolve the mismatch between old `.codex/knowledge/*` instructions and actual `.claude/knowledge/*` files.
- [x] Pick one domain knowledge path.
- [x] Delete or archive stale domain files that reference another codebase.
- [x] Refresh codebase map metadata after cleanup.
- [x] Add a small knowledge health check that fails when expected files are missing.

Domain knowledge path decision:

- Canonical path: `.claude/knowledge/codebase/domains/<domain>.md` — this is where all active domain files live.
- Legacy fallback 1: `.claude/knowledge/domains/<domain>/README.md` — kept for backward compatibility with older worktrees.
- Legacy fallback 2: `.claude/knowledge/domain/<domain>.md` — kept for backward compatibility with older worktrees.
- `overlay.js` now checks the canonical path first, then falls back to legacy paths.
- `knowledge-metadata.js` already treats `codebase/domains/` as the primary source and `domains/` as legacy.
- The empty `.claude/knowledge/domain/` directory is no longer created by `setup.sh`; `overlay.js` still falls back to legacy paths for older worktrees.
- Renamed `newdomain.md` → `gap-detection.md` (no domain files referenced another codebase; the only stale file was a misleading name).
- Focused validation: `node --test coordinator/tests/overlay-knowledge.test.js` -> 42 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 633 passing, 0 failing.

Codebase map refresh:

- Updated `.claude/state/codebase-map.json` `scanned_at` to `2026-04-11T12:00:00Z`.
- Removed stale `gui` domain (all GUI files deleted in Phase 7).
- Removed stale `coordinator/src/web-server.js`, `coordinator/src/hub.js` from `coordinator-surface` (deleted with GUI).
- Removed stale `coordinator/src/instance-registry.js` from `coordinator-runtime` (deleted).
- Removed stale `status/live-audit-registry.js` and `status/live-audit-fixtures/` from `status` (deleted).
- Removed stale `gui/public/app.js` and `coordinator/src/web-server.js` from `large_files`.
- Removed stale `dashboard-render.test.js`, `web-server.test.js`, `instance-registry.test.js` from `test_files`.
- Added `coordinator/src/provider-output.js` and `coordinator/src/gap-detection.js` to `coordinator-extensions`.
- Added new `provider-plugins` domain with all four plugin manifests.
- Added new `docs` domain with `agent-context-map.md`, `worktree-lifecycle.md`, `current-architecture.md`.
- Added `scripts/start-provider.sh`, `scripts/provider.sh`, `scripts/preflight.sh`, `scripts/basic-agent-loop.sh`, `start.sh`, `START_HERE.sh` to `infra`.
- Added `provider-output.js`↔`plugin.json` to `coupling_hotspots`.
- Added `preflight` and `provider-health` to `launch_commands`.
- Added `start.sh` to `entry_points`.
- Added `provider-interface.test.js` and `provider-output.test.js` to `test_files`.
- Focused validation: `node --test coordinator/tests/knowledge-metadata.test.js` -> 22 passing, 0 failing.

Knowledge health check:

- Added `knowledgeHealthCheck(projectDir)` to `coordinator/src/knowledge-metadata.js`.
- Checks for 5 expected knowledge files (`mistakes.md`, `patterns.md`, `instruction-patches.md`, `worker-lessons.md`, `change-summaries.md`) and 2 expected directories (`codebase/domains/`, `research/topics/`).
- Returns `{ ok, missing, present }` so callers can fail or report.
- Added `knowledge-health` CLI command to `cli-server.js`.
- Added 3 tests in `coordinator/tests/knowledge-metadata.test.js` (all missing, all present, single missing).
- Focused validation: `node --test coordinator/tests/knowledge-metadata.test.js` -> 25 passing, 0 failing.
- CLI validation: `node --test coordinator/tests/cli.test.js` -> 141 passing, 0 failing.

Canonical knowledge layout:

- Added `docs/knowledge-layout.md` documenting the canonical `.claude/knowledge/` structure: 8 required files, 2 required directories, other files, and legacy paths.
- Expanded `EXPECTED_KNOWLEDGE_FILES` in `knowledge-metadata.js` from 5 to 8 files to cover all template-provisioned files: added `allocation-learnings.md`, `codebase-insights.md`, `user-preferences.md`.
- Removed legacy empty `domain/` directory creation from `setup.sh` (both root and worktree paths); `overlay.js` still falls back to legacy paths for older worktrees.
- Focused validation: `node --test coordinator/tests/knowledge-metadata.test.js` -> 25 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.

## Phase 5 - Harden Agent Instructions

- [x] Remove instructions that point to nonexistent files.
- [x] Remove references to deprecated signal files.
- [x] Replace slash-command-only validation steps with real shell commands where possible.
- [x] Rewrite helper-agent instructions so they match the actual supported Claude agent workflow.
- [x] Make worker startup instructions current, testable, and aligned with Master 1 routing.
- [x] Make master, allocator, worker, and sentinel responsibilities non-overlapping.
- [x] Ensure agents are directed by coordinator state and external tools instead of relying on blind improvisation.
- [x] Add explicit recovery paths for missing task context, stale knowledge, failed research, merge conflicts, and validation failures.

Agent responsibility audit:

- Master-1 (Interface): user communication only, never reads code, never decomposes or allocates.
- Master-2 (Architect): triage, Tier 1 docs-only execution, Tier 2 direct assignment, Tier 3 decomposition, knowledge curation. Does not allocate Tier 3 tasks.
- Master-3 (Allocator): Tier 3 task routing, worker lifecycle, integration. Does not triage or decompose.
- Worker: code implementation for assigned tasks only, single domain lock, no coordination state access.
- Sentinels: process lifecycle (launching/relaunching agents), no task-level decisions.
- Tier routing ensures non-overlap: Tier 1/2 bypass Master-3 entirely; Tier 3 bypasses Master-2 after decomposition.
- Knowledge ownership is partitioned: Master-1 owns user-preferences, Master-2 owns codebase-insights/patterns/mistakes curation, Master-3 owns allocation-learnings, workers append to domain knowledge and change-summaries.
- Evidence: full role document audit of `.claude/docs/master-{1,2,3}-role.md`, `.claude/commands/worker-loop.md`, `.claude/scripts/loop-sentinel.sh`, `.claude/scripts/worker-sentinel.sh`.

Recovery paths added to `templates/worker-agents.md`:

- Missing task context: fail the task with explanation; do not guess scope.
- Stale knowledge: verify against current codebase, fix inline, note in change summary.
- Failed research: continue for standard/thinking mode; fail task for critical deep_research.
- Merge conflicts during push: fetch/rebase, abort and fail if conflicts persist; never force-push.
- Unresolvable validation failures: revert changes, fail task with error details after 2 attempts.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.

## Phase 6 - Stabilize Runtime Boundaries

- [x] Stop runtime scripts from mutating tracked files when possible.
- [x] Replace ad hoc wrapper patching with generated files in ignored runtime directories.
- [x] Ensure namespace selection is controlled by environment, not hardcoded wrappers.
- [x] Ensure setup does not overwrite hand-edited files without warning.
- [x] Separate install/setup behavior from live runtime repair behavior.
- [x] Make research driver state local, ignored, and namespace-aware.
- [x] Remove Codex-specific runtime state assumptions from startup.
- [x] Preserve one top-level full-stack startup command.
- [x] Make startup phases visible: coordinator, research driver, sentinels, workers, masters, and health checks.
- [x] Add startup validation that reports which subsystem failed instead of requiring manual log archaeology.
- [x] Treat the research queue as required infrastructure, not an optional fallback.

Startup phase visibility:

- `scripts/start-common.sh` now labels each startup phase with a numbered banner: Phase 1/3 (provider validation), Phase 2/3 (setup), Phase 3/3 (research driver).
- Each phase records its result (ok or error message) and a final `Startup Summary` block reports all phases with `[ok]` or `[FAIL]` status.
- If any phase fails, the summary prints which phase failed and what went wrong, eliminating manual log archaeology.
- Provider validation exits early if the selected provider is unavailable, before setup runs.
- Syntax validation: `bash -n scripts/start-common.sh` -> clean.
- `./start.sh --help` -> usage prints successfully.
- Provider interface tests: `node --test coordinator/tests/provider-interface.test.js` -> 8 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.

Install/runtime separation:

- Extracted runtime service startup (coordinator start, worker registration, master launching) from `setup.sh` into `scripts/start-services.sh`.
- `setup.sh` now sources `start-services.sh` after installation completes, preserving existing behavior.
- `scripts/start-services.sh` can also run standalone with `bash scripts/start-services.sh <project_dir> [num_workers]` for runtime restart without re-running installation.
- Runtime utility functions (`is_pid_alive`, `read_pid_file`, `pid_env_value`, `coordinator_pids_for_project`, `stop_duplicate_project_coordinators`, `runtime_role_key`, `find_master_role_pid`) moved to `start-services.sh`.
- `setup.sh` reduced from ~723 lines to ~507 lines (install-only through step [7/8], then delegates to runtime).
- Syntax validation: `bash -n setup.sh` and `bash -n scripts/start-services.sh` -> both clean.
- `./start.sh --help` -> usage prints successfully.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.

## Phase 7 - Remove GUI, Remove Codex, Then Split Large Modules

- [x] Fully remove GUI server code from the active system.
- [x] Remove GUI tests, routes, static assets, docs, and setup references.
- [x] Keep or replace only the non-GUI health/status endpoints needed by the coordinator.
- [x] Fully remove Codex-specific active runtime code.
- [x] Remove Codex tests, docs, setup references, wrappers, prompt copies, and root instructions.
- [x] Preserve only provider-neutral behavior needed by the future plugin integration.
- [ ] After tests are green, split `coordinator/src/cli-server.js` by command domain.
- [ ] After tests are green, split `coordinator/src/db.js` by schema/migration/query domain.
- [x] Deduplicate `scripts/chatgpt-driver.py` and `scripts/chatgpt-driver (1).py`.
- [ ] Keep public CLI behavior covered while splitting modules.
- [ ] Avoid broad refactors until each step has focused tests.

## Phase 8 - Context Serving And Safer Agent Edits

- [x] Add a preflight command that reports dirty git state, branch divergence, red tests, and stale worktrees.
- [x] Add a "safe files to edit" map for common task domains.
- [x] Add a generated-file detector so agents do not edit copied runtime outputs.
- [x] Add a short "where to start" map for coordinator, prompts, setup, sentinels, and research.
- [x] Add focused smoke tests for assignment, worker startup, research queue, merge completion, and namespace routing.
- [x] Require agents to report which source-of-truth file they edited.
- [ ] Design a coordinator-served context API for agents.
- [ ] Let agents request deeper context through commands instead of scanning the whole repo by default.
- [x] Define small context bundles for task assignment, relevant files, validation commands, known pitfalls, and recent related failures.
- [x] Hide bulky history, generated artifacts, stale runs, and unrelated domains unless explicitly requested.
- [ ] Track when an agent requested extra context and whether it improved task outcome.

## Phase 9 - Rebuild Confidence

- [x] Run the full coordinator test suite.
- [x] Run the smallest live E2E that exercises one request from task creation to completion.
- [x] Run one research-queue scenario.
- [x] Run one multi-worker assignment scenario.
- [x] Run one merge/retry scenario.
- [x] Write a final current architecture note after the cleanup, replacing stale summaries.

## Phase 10 - Robust Merge And Fix Routing

- [x] Keep automatic conflict resolution as a core capability.
- [x] Bound automatic conflict resolution by attempt count, changed-file scope, and validation result.
- [x] When automatic resolution fails, create a targeted follow-up task instead of looping silently.
- [x] Write merge-conflict insights into the task/request history.
- [x] Write successful conflict-resolution lessons into curated knowledge only after validation passes.
- [x] Add explicit task states for blocking, non-blocking, superseded, failed-needs-reroute, and failed-final.
- [x] Immediately reroute incomplete blocking work to a fix task.
- [x] Ensure request completion cannot remain stuck because of stale assigned tasks that should have been rerouted.

Stale task completion guard slice:

- Fixed `onTaskCompleted()` in `merger.js` to use `db.isTerminalTaskStatus()` instead of hardcoded `'completed'`/`'failed'` check. Tasks in `superseded`, `failed_needs_reroute`, or `failed_final` no longer block request advancement.
- Fixed `reconcileRequestLifecycle()` in `db.js` to count all 5 terminal statuses (`completed`, `failed`, `superseded`, `failed_needs_reroute`, `failed_final`) when checking whether an `in_progress` request can advance to `integrating`.
- Existing `recoverStalledAssignments()` already sweeps stale `assigned` tasks back to `ready` (180s threshold + 60s grace), and `recoverOrphanTasks()` runs every watchdog tick — so assigned tasks don't stay stuck indefinitely.
- Added 3 focused tests: reconciler advancement with extended terminal statuses, `onTaskCompleted` completion with superseded/failed_final siblings, and non-completion when a sibling is still assigned.
- Focused validation: `node --test coordinator/tests/merger.test.js coordinator/tests/state-machine.test.js` -> 157 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 658 passing, 0 failing.

Bounded conflict retry slice:

- Automatic conflict recovery remains enabled, but stale `conflict` and legacy `functional_conflict` merge rows now increment `retry_count` each time they are swept back to `pending`.
- Completion-triggered recovery in `onTaskCompleted()` uses the same retry cap, so finishing a fix task cannot silently bypass the bounded retry guard.
- Retry exhaustion is capped by `MAX_MERGE_CONFLICT_RETRIES` in `coordinator/src/merger.js`.
- Exhausted conflicts are marked `failed` with a `conflict_retries_exhausted:` error, a targeted urgent Tier 2 follow-up task is created on the same request, Master 2 receives `merge_conflict_exhausted` mail, and coordinator logs include the follow-up task id.
- Focused validation: `node --check coordinator/src/merger.js` and `node --test coordinator/tests/merger.test.js` -> 71 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 644 passing, 0 failing.

Extended task statuses slice:

- Added `superseded`, `failed_needs_reroute`, `failed_final` to the task status CHECK constraint in `schema.sql` and migrated existing databases via table recreation in `ensureTaskExtendedStatuses()`.
- Added `blocking` column (INTEGER, default 1) to tasks table for distinguishing blocking vs non-blocking tasks.
- Added `TASK_TERMINAL_STATUSES` constant set and `isTerminalTaskStatus()` helper to `db.js`, exported for use by watchdog and other modules.
- Updated `watchdog.js` `releaseMergedRequestSiblingTasks` to set superseded sibling tasks to `superseded` status instead of `failed`.
- Updated `hasActiveRemediationTasks` to use `isTerminalTaskStatus()` instead of hardcoded `['completed', 'failed']`.
- Added 6 focused tests in `state-machine.test.js`: status acceptance for each new state, `isTerminalTaskStatus` classification, blocking column default/update, and watchdog supersession behavior.
- Focused validation: `node --test coordinator/tests/state-machine.test.js` -> 74 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 642 passing, 0 failing.

Task merge history slice:

- Added `merge_history` TEXT column (JSON array) to the tasks table in `schema.sql` with migration in `ensureTaskMergeHistoryColumn()`.
- Added `appendTaskMergeHistory(taskId, entry)` to `db.js` — appends a timestamped merge event entry to the task's JSON history array.
- Added `getRequestMergeHistory(requestId)` to `db.js` — aggregates merge history across all tasks for a request, sorted by recorded timestamp.
- Updated `merger.js` to record merge events (`merge_success`, `functional_conflict`, `merge_conflict`, `merge_failed`, `conflict_retries_exhausted`) into task merge history at each outcome point.
- Each history entry includes event type, merge ID, branch, error (truncated to 500 chars), tier, retry count, and follow-up task ID where applicable.
- Added 4 focused tests in `state-machine.test.js`: append/read entries, null history for untouched tasks, cross-task aggregation, and safe no-op for nonexistent tasks.
- Focused validation: `node --test coordinator/tests/state-machine.test.js` -> 78 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 648 passing, 0 failing.

Conflict resolution lesson slice:

- Added `conflict_resolution_lesson` event type (relevance 800) to `coordinator/src/insight-ingestion.js`.
- Added `ingestConflictResolutionLesson()` function that writes a curated insight with merge ID, branch, retry count, and prior error to the `coordinator:merge_conflict_lessons` context key.
- Updated `processQueue()` in `coordinator/src/merger.js` to call `ingestConflictResolutionLesson()` when a merge succeeds with `retry_count > 0` (i.e., after conflict retries).
- Lessons are only written after merge success (which includes post-merge overlap validation when enabled), ensuring the lesson reflects a validated resolution.
- First-attempt merges (`retry_count == 0`) do not produce lessons, avoiding noise from non-conflicting merges.
- Added conflict resolution lesson assertions to existing stale conflict recovery test.
- Added dedicated test proving no lesson is written for first-attempt merge success.
- Focused validation: `node --test coordinator/tests/merger.test.js` -> 72 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 649 passing, 0 failing.

Blocking failure reroute slice:

- Updated `fail-task` handling so blocking task failures transition the original task to `failed_needs_reroute` and immediately create an urgent ready fix task on the same request.
- Non-blocking task failures remain plain `failed` and do not create fix tasks.
- Added `all_terminal`, `blocking_failed`, `nonblocking_failed`, and `hard_failures` completion fields so rerouted/superseded terminal tasks are visible without changing legacy `all_done` semantics.
- Updated integration gating to allow only terminal requests with at least one completed task and zero hard failures; blocking failures still block, while non-blocking failures can be skipped.
- Focused validation: `node --check coordinator/src/cli-server.js && node --check coordinator/src/db.js && node --check coordinator/src/merger.js` and `node --test coordinator/tests/cli.test.js coordinator/tests/state-machine.test.js coordinator/tests/merger.test.js coordinator/tests/allocator.test.js` -> 330 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 655 passing, 0 failing.

## Phase 11 - Plugin Agent Integration

- [x] Create one provider plugin path, proposed: `plugins/agents/<provider>/`.
- [x] Define a provider manifest, proposed: `plugins/agents/<provider>/plugin.json`.
- [x] Define a single runtime-side provider interface for Claude, Codex, DeepSeek, Gemini, and future runtimes.
- [x] Make Claude the first built-in/default provider plugin.
- [x] Add Codex back only as a plugin provider, not as a hardcoded root namespace.
- [x] Add DeepSeek as a provider plugin.
- [x] Add Gemini as a provider plugin.
- [x] Move provider-specific launch commands, auth checks, health checks, environment setup, and model defaults behind the provider interface.
- [x] Move provider-specific output parsing behind the provider interface.
- [x] Replace hardcoded `claude`, `codex`, `codex10`, and wrapper-specific assumptions with provider IDs.
- [x] Add commands to list providers, inspect provider health, select a provider, and dry-run launch through the provider interface.
- [x] Add tests proving Master 1, workers, research, and repair loops can launch through the provider interface.
- [x] Document how to add a new provider plugin without modifying coordinator core logic.

Initial provider-plugin slice:

- Added `plugins/agents/claude/plugin.json`.
- Routed `scripts/provider-utils.sh` and `.claude/scripts/provider-utils.sh` through provider manifests for provider ID, CLI command, and role model defaults.
- Updated setup/start preflight to validate installed provider manifests instead of hardcoding only string equality against `claude`.
- Added provider plugin visibility to `scripts/preflight.sh`.
- Scope note: non-Claude providers need manifests and local launch/health smokes before they can be enabled.

Provider-interface slice:

- `plugins/agents/claude/plugin.json` now declares CLI health/auth check, provider environment setup, interactive and noninteractive launch args, and task-completion output metadata.
- `scripts/provider-utils.sh` and `.claude/scripts/provider-utils.sh` now render launch argv and environment from provider manifests instead of hardcoding Claude CLI flags.
- `scripts/provider.sh` now lists active providers, catalogs all provider manifests, reports current provider config, checks provider health, selects a provider, exposes output schemas, and dry-runs launch paths.
- `scripts/preflight.sh` now resolves the selected/default provider through the provider interface and validates that provider's health and manifest launch-arg rendering.
- Setup provider selection now lists installed provider plugins dynamically instead of presenting a Claude-only hardcoded menu.
- Codex, DeepSeek, and Gemini remain intentionally disabled until their local CLI/auth, launch, and output-schema behavior are validated through the same interface.

Provider launch-test slice:

- Added `coordinator/tests/provider-interface.test.js`.
- `launch-dry-run` now validates prompt loading and manifest launch-arg rendering without invoking the provider CLI.
- Tests cover Master 1 interactive launch plus worker, loop, research-discovery, live-audit, and live-repair noninteractive launch args.
- Focused validation: `node --test coordinator/tests/provider-interface.test.js` -> 8 passing, 0 failing.

Provider-catalog slice:

- Added disabled provider scaffold manifests at `plugins/agents/codex/plugin.json`, `plugins/agents/deepseek/plugin.json`, and `plugins/agents/gemini/plugin.json`.
- `scripts/provider.sh catalog` now inventories enabled and disabled provider manifests, while `scripts/provider.sh list` remains active-provider-only.
- Disabled provider scaffolds cannot be selected until their `enabled` flag is set after local smokes.
- Focused validation: `node --test coordinator/tests/provider-interface.test.js` -> 8 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 631 passing, 0 failing.

Provider-neutral startup slice:

- `start.sh` now resolves the configured provider and delegates through `scripts/start-provider.sh <provider>` instead of calling `start-claude.sh`.
- `START_HERE.sh` now uses `start.sh`; `start-claude.sh` remains only as a compatibility shim.
- Startup docs, setup output, and Master 1 startup shortcuts now point to `start.sh`.
- Provider-interface tests cover `start.sh`, `START_HERE.sh`, and the compatibility shim help path.

Provider-default/preflight slice:

- `mac10_normalize_provider_id` now only normalizes input; provider defaulting lives in `mac10_default_provider_id` and `mac10_requested_provider_id`.
- `start.sh`, `setup.sh`, `scripts/provider.sh`, `scripts/preflight.sh`, and copied `.claude/scripts/provider-utils.sh` now resolve blank provider input through the active provider catalog instead of defaulting inline to Claude.
- Provider config loading now resets generated model defaults when the loaded provider changes, preventing one provider's exported model aliases from leaking into another provider.
- WSL CLI shimming now targets the selected provider CLI instead of always probing for `claude`.
- Preflight now prints the provider catalog, validates the selected/default provider, and renders launch args for that provider.
- Focused validation: `node --test coordinator/tests/provider-interface.test.js coordinator/tests/provider-output.test.js` -> 12 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 631 passing, 0 failing.

Provider-neutral instruction-template slice:

- Renamed root and worker instruction templates to `templates/root-agents.md` and `templates/worker-agents.md`.
- `setup.sh` now installs `AGENTS.md` and `.claude/worker-agents.md` from provider-neutral templates, then creates `CLAUDE.md` and `.claude/worker-claude.md` as Claude compatibility copies.
- Worker worktree creation now copies canonical worker instructions into both `AGENTS.md` and `CLAUDE.md`, instead of preferring `worker-claude.md`.
- Coordinator `add-worker` now treats `.claude/worker-agents.md` as the source of truth and falls back to `.claude/worker-claude.md` only for older installs.
- Focused validation: `node --test coordinator/tests/cli.test.js coordinator/tests/overlay-knowledge.test.js` -> 181 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 631 passing, 0 failing.

Autonomous loop guardrail slice:

- Added coordinator config `loop_sync_with_origin` so loop sentinels can skip `origin/main` fetch/rebase behavior without relying on the coordinator process environment.
- `loop-prompt` now reports the effective loop sync setting to the sentinel.
- `scripts/loop-sentinel.sh` and the installed `.claude/scripts/loop-sentinel.sh` now preserve the current branch when loop sync is disabled.
- Removed the checklist-loop operator wrapper from the active path after owner clarification that the loop is non-working for this cleanup.
- Cleanup work continues manually; loop guardrails remain only for future loop repair.
- Syntax validation: `bash -n scripts/loop-sentinel.sh .claude/scripts/loop-sentinel.sh` and `node --check coordinator/src/cli-server.js`.
- Focused validation: `node --test coordinator/tests/cli.test.js` -> 141 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 631 passing, 0 failing.

Basic provider-loop wrapper slice:

- Added `scripts/basic-agent-loop.sh` as a thin provider-manifest runner for repeated cleanup turns without using `mac10 loop` or coordinator loop rows.
- Runtime controls live under `.agent-loop/basic-agent-loop/control/`: `stop`, `pause`, and `next-prompt.md`.
- The wrapper requires branch `10.1` by default, refuses dirty worktrees unless `--allow-dirty` is supplied, and stops if an iteration leaves uncommitted changes.
- The wrapper now has a per-turn timeout (`--turn-timeout`, default 900 seconds) so a provider that commits useful work but hangs before returning cannot stall the whole run forever.
- Control files moved out of `.claude/state/` because provider-side write permissions blocked the agent from creating its own stop file there.
- Each generated prompt tells the agent to work one bounded checklist item, validate, update this checklist, and commit locally before the next iteration.
- Validation: `bash -n scripts/basic-agent-loop.sh`, `scripts/basic-agent-loop.sh --dry-run --allow-dirty --turn-timeout 5 --max-iterations 1 --sleep 0 -- "Continue the checklist safely."`, `git diff --check`, and `cd coordinator && npm test` -> 631 passing, 0 failing.

Provider-output slice:

- `coordinator/src/provider-output.js` now owns task usage normalization and maps provider manifest usage aliases to canonical task usage columns.
- `plugins/agents/claude/plugin.json` now declares Claude-compatible Anthropic/OpenAI usage aliases, cache creation object handling, and task usage column mapping.
- `coordinator/bin/mac10` and `coordinator/src/cli-server.js` now share the provider-backed output normalizer instead of carrying duplicate hardcoded usage parsing tables.
- `scripts/provider.sh output-schema <provider>` exposes the provider output schema for local smoke checks.
- Focused validation: `node --test coordinator/tests/provider-output.test.js` -> 4 passing, 0 failing.
- Regression validation: `cd coordinator && npm test` -> 631 passing, 0 failing.

Hardcoded provider assumption cleanup:

- Removed dead Claude-specific compatibility fallback from `mac10_prepare_cli_env()` in `scripts/provider-utils.sh` — the Claude manifest already declares `environment.set.CLAUDE_PROJECT_DIR` and `environment.unset.CLAUDECODE`, so the hardcoded fallback was unreachable.
- The `.claude/scripts/provider-utils.sh` copy is generated by `setup.sh` and will pick up the change on next setup run.
- Remaining `|| 'claude'` fallbacks in `provider-output.js` and `provider-utils.sh` are intentional last-resort defaults (Claude is the active default provider per owner direction).
- `start-claude.sh` remains as a documented compatibility shim that always delegates to `start.sh` with the claude provider.
- Syntax validation: `bash -n scripts/provider-utils.sh` -> clean.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.

## Resolved Red Flag - Watchdog Stale Integration Completion

- [x] Reconcile `watchdog.js` stale integration completion logic with `watchdog.test.js`.
- [x] Define the product rule for request completion before changing the implementation.
- [x] Encode stale incomplete sibling tasks as non-blocking cleanup when merged work has already completed the request.

Resolved failure area:

- `coordinator/src/watchdog.js`
- `coordinator/tests/watchdog.test.js`

Outcome: stale integration recovery now completes a request when all merges are merged and at least one task has completed. Non-terminal sibling tasks are released as superseded non-blocking work, existing failed siblings are recorded in recovery telemetry, and completion remains gated with `no_completed_tasks` when no task produced completed work.

Validation:

- `node --check coordinator/src/watchdog.js`
- `cd coordinator && node --test tests/watchdog.test.js` -> 43 passing, 0 failing.
- `cd coordinator && node --test tests/state-machine.test.js tests/allocator.test.js tests/cli.test.js` -> 241 passing, 0 failing.
- `cd coordinator && npm test` -> 617 passing, 0 failing.

## Latest Manual Cleanup Notes

Completed safe mechanical work:

- Removed tracked generated live-E2E and bytecode artifacts from source control.
- Added `scripts/preflight.sh` for branch/upstream, dirty tree, generated artifact, worktree, stale registration, and coordinator test reporting.
- Added `docs/agent-context-map.md` and `docs/worktree-lifecycle.md` so agents have source-of-truth edit guidance before scanning the whole repo.
- Added `docs/current-architecture.md` as the current architecture note after GUI/Codex removal.
- Added generated-artifact classification to `coordinator/src/workspace-hygiene.js` with focused tests.
- Added a worker-startup smoke test proving `add-worker` copies source/config assets without copying runtime provider state.
- Hardened worker/architect instructions to use `mac10`, `.claude/knowledge`, real validation commands, local commits, and no deprecated helper agents.
- Removed destructive sentinel sync behavior and runtime `sed -i` patching of tracked wrapper scripts; namespace shims are generated under ignored `.claude/scripts/.ns-shims/`.
- Removed the duplicate dead `start_research_sentinel` function and made missing research sentinel startup a hard startup failure.

Latest focused validation:

- `rg` scan for deprecated active references -> no matches for `.codex`, `codex10`, `commands-codex10`, `start-codex`, `build-validator`, `verify-app`, or `git reset --hard`.
- `node --check coordinator/src/cli-server.js`
- `node --check coordinator/src/workspace-hygiene.js`
- `bash -n` on changed startup/sentinel/preflight scripts.
- `cd coordinator && node --test tests/cli.test.js` -> 141 passing, 0 failing.
- `cd coordinator && node --test tests/workspace-hygiene.test.js` -> 4 passing, 0 failing.
- `./start.sh --help` -> usage prints successfully.
- `scripts/preflight.sh` -> tests pass, dirty paths 0, tracked generated artifacts 0, prunable stale worktrees 0.
- `cd coordinator && npm test` -> 619 passing, 0 failing.
- Disposable coordinator smoke, request creation to Tier-1 completion -> request `req-96ac979f` completed.
- Disposable coordinator smoke, request/task lifecycle -> request `req-77c59c18`, task `1`, `check-completion` reported `1/1 completed, 0 failed — ALL DONE`.

Safety-deferred items after approved route:

- Branch reconciliation is deferred: no rebase, merge, or reset in the next manual pass.
- Destructive cleanup is deferred: no worktree/live-E2E deletion or non-dry-run prune in the next manual pass.
- Provider-plugin coding is deferred until after the validation loop, but the default route is now selected.
- Task-state schema coding is deferred until after validation, but the default semantics are now selected.
- Large-module splits remain deferred until after provider/sandbox/task-state boundaries are stable.

Setup overwrite protection:

- Added `safe_copy()` helper to `setup.sh` that detects when a destination file differs from its source template, creates a `.setup-backup` copy, and prints a warning before overwriting.
- Applied to: docs templates, architect-loop.md force-refresh, master-3-role.md force-refresh, worker-agents.md, worktree AGENTS.md/CLAUDE.md, worktree knowledge files, and worktree settings.json.
- Files that matched their source are silently overwritten (no backup noise). New files are copied without backup.
- Worktree knowledge copy switched from bulk `cp -r` to per-file `safe_copy` via `find -print0` to catch individual hand-edited knowledge files.
- Scripts, hooks, mac10 wrapper, and plugin manifests remain unconditional overwrites since they are always generated and should not be hand-edited.
- Syntax validation: `bash -n setup.sh` -> clean.
- Regression validation: `cd coordinator && npm test` -> 636 passing, 0 failing.
