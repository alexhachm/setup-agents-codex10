# Worktree Lifecycle

Purpose: separate durable source worktrees from disposable runtime sandboxes so agents do not treat generated history as codebase context.

## Current State

- The main project worktree is the coordinator source of truth.
- Root worker worktrees live under `.worktrees/wt-<id>/`.
- Live E2E workspaces live under `.live-e2e-workspaces/` and are generated test/run artifacts, not normal development context.
- Worker creation copies only `.claude` source/config assets: commands, knowledge, scripts, agents, hooks, settings, canonical `AGENTS.md`, and Claude compatibility `CLAUDE.md`.
- Worker creation must not copy `.claude/state/`, `.claude/logs/`, `.claude/signals/`, DB files, live E2E outputs, or Python bytecode.

## Current Safety Rules

- Check `bash scripts/preflight.sh --skip-tests` before broad cleanup.
- Do not edit `.worktrees/` or `.live-e2e-workspaces/` as source.
- Do not run `git worktree prune`, remove worktrees, or delete live E2E directories unless the task explicitly says those registrations are disposable.
- Use `git worktree prune --dry-run --verbose` first and record the output before any destructive cleanup.

## Cleanup Policy

- Default cleanup mode is inventory-only.
- A worktree may be deleted only when it is both unregistered or explicitly listed in an owner-approved deletion plan, and it has no unique commits or uncommitted source changes that need preservation.
- A live E2E directory may be deleted only when its run ID is documented as disposable and no checklist, report, or regression fixture references it.
- `git worktree prune --dry-run --verbose` is required before any prune. If the dry run reports no prunable paths, no prune command should be run.
- Worker homes under `.worktrees/wt-<id>/` are not task sandboxes. They are durable launch homes and may be dirty from old runs; cleanup must not assume they are disposable.
- Disposable task sandboxes have coordinator-owned lifecycle metadata in `task_sandboxes`: task ID, request ID, worker ID, backend, status, sandbox name/path, worker home path, branch, timestamps, metadata, and error.
- Cleanup automation is limited to `task-sandbox-cleanup`: it supports `--dry-run`, age-gates candidates, and only marks stopped/failed task sandboxes as cleaned. It does not delete root worker homes or live-E2E directories.

## Live Audit Findings - 2026-04-13

- `git worktree list --porcelain` found one main worktree, root worker worktrees, and nested live-E2E worktrees; `git worktree prune --dry-run --verbose` found no prunable missing-path worktrees.
- A provider-backed worker smoke in namespace `liveaudit102` failed first in `msb` isolation (`worker_death:msb_sandbox_dead`), then completed through tmux fallback. This means the execution plane should not treat "msb server is running" as enough evidence to select `msb` for a task.
- The same smoke recovered a stale worker branch/PR (`agent-1`, PR `#359`) during completion. Merge eligibility must be tied to the current task assignment token and task-created branch, not merely the worker home branch.
- Until disposable task sandboxes exist, root worker worktrees should be treated as shared, stateful launch homes and excluded from broad source cleanup.

## Selected Direction

- Keep root `.worktrees/wt-<id>/` directories as worker homes.
- Create disposable per-task sandboxes for actual task edits.
- If multiple tasks are routed to the same worker, the coordinator decides whether the worker receives a fresh task sandbox or a reused sandbox with explicit carried context.
- Reuse is allowed only when the coordinator marks the previous task context as relevant and non-conflicting.
- Completed, superseded, or failed task sandboxes are archived or removed by an explicit coordinator-owned lifecycle command, not by worker improvisation.
- Assignment now allocates a `task_sandboxes` row and passes it to the worker spawn path. The spawn path records the effective backend (`sandbox`, `docker`, `tmux`, or `none`) and marks spawn rollback as failed.

## Deferred Implementation Details

- How much previous task state may be served back to a worker when the same worker receives related work.
- Whether cleanup runs through watchdog/startup preflight in addition to the explicit `mac10 task-sandbox-cleanup` maintenance command.
