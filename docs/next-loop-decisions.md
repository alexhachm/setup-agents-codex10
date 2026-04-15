# Next Cleanup Decisions

Purpose: capture the approved default route for the next manual cleanup pass.

## Source Control

- Make a local checkpoint commit before the next implementation loop.
- Do not push automatically.
- Do not rebase, merge, or reset `10.1` against `origin/main` in the next manual pass.
- Keep `10.1` isolated until the cleanup checkpoint is reviewed.

## Execution Mode

Do not use the SQL-backed `mac10 loop` autonomous loop for this cleanup. That loop machinery is known unreliable, and this project is being edited specifically to repair that system.

Allowed exception: `scripts/basic-agent-loop.sh` is a separate file-controlled provider wrapper. It does not create coordinator loop rows, does not use `scripts/loop-sentinel.sh`, and does not sync with origin. It exists only to run bounded provider turns through the provider manifest path while preserving local operator controls.

Default execution guardrails:

- work manually in small inspect/edit/test/commit passes
- require branch `10.1`
- require a clean worktree before each committed slice
- run focused validation before each commit
- run `scripts/preflight.sh` after committed slices when practical
- do not push, rebase, merge, reset, or delete worktrees

The `loop_sync_with_origin=false` guard remains useful for future loop repair, but it is not permission to run the loop during this cleanup.

Basic wrapper controls:

- stop: `.agent-loop/basic-agent-loop/control/stop`
- pause: `.agent-loop/basic-agent-loop/control/pause`
- redirect next turn: `.agent-loop/basic-agent-loop/control/next-prompt.md`
- status: `.claude/state/basic-agent-loop/status.env`
- logs: `.claude/logs/basic-agent-loop/`
- provider turn timeout: `--turn-timeout <seconds>` or `MAC10_BASIC_LOOP_TURN_TIMEOUT_SECONDS` (default 900)

## Next Manual Scope

Run a validation pass first.

Allowed work:

- run the smallest live E2E that exercises request creation through completion
- fix blockers found by that validation
- update the checklist with evidence and failures

Not allowed in this loop:

- provider-plugin implementation
- task-state schema changes
- destructive worktree cleanup
- broad module splitting

## Provider Plugin Route

Use this direction when provider-plugin implementation starts:

- provider path: `plugins/agents/<provider>/`
- provider manifest: `plugins/agents/<provider>/plugin.json`
- first/default provider: `claude`
- Codex returns only as a provider plugin, not as a hardcoded root namespace
- DeepSeek and Gemini are future provider plugins after Claude proves the interface

The coordinator-side provider interface should own:

- provider ID
- launch command
- auth check
- health check
- model defaults by role
- environment setup
- output parsing
- provider selection for each role

## Sandbox Lifecycle Route

Use a hybrid model:

- keep root `.worktrees/wt-<id>/` as each worker home
- create disposable per-task sandboxes for actual task edits
- reuse same-worker context only when the coordinator marks the tasks related and non-conflicting
- let the coordinator own cleanup through an explicit lifecycle or maintenance command
- workers must not delete or prune sandboxes on their own

## Task Reroute Route

Use these semantics before schema work:

- `blocking`: required for request completion
- `non_blocking`: useful but does not block request completion
- `superseded`: replaced by newer work or by already-integrated work
- `failed_needs_reroute`: failed work that should immediately produce a targeted fix task
- `failed_final`: terminal failure after retry/route limits are exhausted

Default behavior:

- incomplete blocking work should be rerouted immediately
- incomplete non-blocking work should not keep a request open
- superseded tasks should be visible in request history but not block completion
- reroute attempts must be bounded by retry count, changed-file scope, and validation result

## Cleanup Policy

- No destructive cleanup in the next manual pass.
- Do not delete `.worktrees/` or `.live-e2e-workspaces/`.
- Do not run `git worktree prune` except as `git worktree prune --dry-run --verbose`.
- Keep generated/runtime artifacts ignored and outside normal agent context.

## Stop Conditions

Stop and report instead of continuing if:

- branch reconciliation is required
- live E2E needs credentials or an external service that is unavailable
- a fix requires changing provider-plugin architecture before validation can run
- a task-state schema migration is needed
- worktree deletion or pruning becomes necessary

## Validation Results

Completed in this loop:

- Local checkpoint commit: `5ab43ca`.
- Full preflight: `scripts/preflight.sh` passed with 619/619 tests, dirty paths 0, tracked generated artifacts 0, and prunable stale worktrees 0.
- Disposable request-completion smoke: `validation-20260411T084842Z`, request `req-96ac979f`, completed.
- Disposable request/task-completion smoke: `task-validation-20260411T084930Z`, request `req-77c59c18`, task `1`, `check-completion` reported `1/1 completed, 0 failed — ALL DONE`.

The full Master-1/provider-agent live audit is still a separate, heavier validation layer; the completed smoke intentionally avoided launching real provider workers.

## Provider Slice Started

The first provider-plugin implementation slice is now underway:

- `plugins/agents/claude/plugin.json` is the active Claude manifest.
- `plugins/agents/codex/plugin.json`, `plugins/agents/deepseek/plugin.json`, and `plugins/agents/gemini/plugin.json` are disabled scaffold manifests.
- Provider utilities resolve provider ID, CLI command, and role model defaults from manifests.
- Setup/start validation checks installed provider manifests instead of hardcoded provider string checks.

Provider-interface progress now also covers:

- provider health/auth check metadata
- provider environment setup
- manifest-rendered interactive and noninteractive launch arguments
- manifest-backed task usage output normalization
- `scripts/provider.sh` commands for listing, health checks, selection, and launch dry-runs
- provider-neutral default selection for startup, setup, provider CLI commands, and preflight
- preflight validation of selected/default provider health and launch-arg rendering
- provider-interface tests for Master 1, worker, loop, research-discovery, live-audit, and live-repair prompt launch paths
- provider-neutral `start.sh` routing, with `start-claude.sh` kept only as a compatibility shim

Non-Claude providers still require local launch/auth smokes and validated output schemas before they can be enabled.
