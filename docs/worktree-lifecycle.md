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

## Selected Direction

- Keep root `.worktrees/wt-<id>/` directories as worker homes.
- Create disposable per-task sandboxes for actual task edits.
- If multiple tasks are routed to the same worker, the coordinator decides whether the worker receives a fresh task sandbox or a reused sandbox with explicit carried context.
- Reuse is allowed only when the coordinator marks the previous task context as relevant and non-conflicting.
- Completed, superseded, or failed task sandboxes are archived or removed by an explicit coordinator-owned lifecycle command, not by worker improvisation.

## Deferred Implementation Details

- Exact sandbox naming and retention policy.
- How much previous task state may be served back to a worker when the same worker receives related work.
- Whether cleanup runs through watchdog, an explicit `mac10` maintenance command, startup preflight, or a combination of those.
