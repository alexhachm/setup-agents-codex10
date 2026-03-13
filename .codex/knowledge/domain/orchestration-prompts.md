
## 2026-03-12 — Master-1 clarification mailbox flow
- For Master-1 loop prompts, clarification checks should reference mailbox polling via `codex10 inbox master-1`, not `clarification-queue.json` polling.
- In mirrored prompt files, updating the tracked template can propagate to `.codex` mirrors in this Windows worktree layout.

## 2026-03-12 — Master-1 mailbox clarification guidance
- For master-loop prompt mirrors, timeout and per-wait-cycle clarification checks should reference `codex10 inbox master-1`; legacy `clarification-queue.json` polling is obsolete.
- In this Windows worktree, `.codex` paths are runtime/symlink-backed and may not be commit-friendly; keep PR diffs focused on tracked mirror files (for this task: `templates/commands/master-loop.md`).
