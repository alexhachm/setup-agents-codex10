---
doc_kind: reference
scope: project
owner: handbook
last_verified: 2026-03-16
rot_risk: low
related_paths:
  - coordinator/src/
  - gui/public/
  - .codex/
---

# Pitfalls

Known mistakes and foot-guns. Read before starting any task.

## Git & PR Creation (Windows/WSL)

- **Worktree PR creation:** `gh pr create` can fail inside worktrees with `fatal: not a git repository`. Run from main repo root with explicit `--repo/--head/--base` flags.
- **Backticks in shell:** Unescaped backticks in `gh pr create --body` trigger bash command substitution. Use single-quoted heredocs (`<<'EOF'`) or `--body-file`.
- **`--body-file` path resolution:** In WSL, both `/tmp/` and `/mnt/` paths can fail. Use inline `--body` text.
- **Symlink commits:** Paths under `.codex/` may be symlink-backed and not committable from worktrees. Treat knowledge updates as runtime notes, not PR files.
- **Branch reuse:** Don't reuse a merged task branch for new work — creates unintentional history. Create a new branch per task.
- **Rebase target:** Never `git rebase origin/agent-N` — pulls in unrelated worker commits. Always `git rebase origin/main`.

## Worker Loop

- **Branch parsing:** Raw `sed 's/agent-//'` breaks on suffixed branches (`agent-1-task...`). Use `sed -E 's/^agent-([0-9]+).*/\1/'`.
- **`my-task` empty result:** Can return empty while a task is still actionable. Verify with `start-task` before treating as idle.
- **`complete-task` normalization:** Normalizes branch metadata to canonical `agent-N`. This is expected — PR URL is the authoritative artifact.
- **Heartbeat timeout:** Watchdog terminates at 180s. Send heartbeats every 30s during long operations.

## Coordinator Code

- **Dual completion paths:** Both `checkRequestCompletion` and `onTaskCompleted` can emit `request_completed`. Guard for idempotency.
- **Ownership guards:** Rebase conflict relands must preserve both `task.assigned_to` and worker-current-task checks.
- **Schema changes:** When adding columns to `db.js`, update both `VALID_COLUMNS` and init-time migration helpers together.
- **Overlap validation:** `npm run build` in merge validator fails if repo has no build script. This repeatedly generates false `functional_conflict` and `merge_failed` events.
- **Merge queue dedupe:** When changing dedupe keys, update both queue insert and `queueMergeWithRecovery` lookup path together.

## Testing

- **Duplicate test names:** Check for existing test coverage before adding assertions — reland commits can create duplicate test blocks.
- **Validation-only tasks:** Check `git diff origin/main -- <files>` first. If zero diff and tests pass, skip PR creation and close as validation-only.
- **Dual regression coverage:** Liveness changes need both healthy-path and stale-path test cases.
- **Pre-existing failures:** `cd coordinator && npm test` may be blocked by pre-existing issues (e.g., duplicate declarations in `db.js`). Check stack traces before attributing to your changes.

## Changelog (last 5)

- 2026-03-16: Consolidated from mistakes.md into living handbook doc, deduplicated and restructured
