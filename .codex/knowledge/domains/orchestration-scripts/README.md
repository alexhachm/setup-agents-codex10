---
doc_kind: reference
scope: project
owner: domains/orchestration-scripts
last_verified: 2026-03-16
rot_risk: medium
related_paths:
  - .codex/scripts/loop-sentinel.sh
  - templates/commands/architect-loop.md
  - templates/docs/master-2-role.md
  - coordinator/bin/mac10
---

# Orchestration Scripts

## Executive Summary
- Covers sentinel scripts, architect loop mirrors, and CLI normalization for loop orchestration
- Core concern: keeping tracked mirrors and runtime copies semantically aligned
- Biggest foot-gun: loop-sentinel ACTIVE_COUNT parsers silently defaulting to zero on JSON parse failure

## Invariants and Contracts
- `.codex/commands-codex10/architect-loop.md` must mirror `templates/commands/architect-loop.md`
- Loop-sentinel ACTIVE_COUNT must use `loop-requests <loop_id> --json` plus JSON parsing; never grep human-readable output
- If command execution or JSON parse fails, treat ACTIVE_COUNT as unknown and back off; never default to zero
- Worker worktrees (`.worktrees/wt-N/.codex`) must be real directories containing `knowledge/` and `scripts/codex10`; symlink or partial copies break worker loop startup

## Key Patterns
- **loop-requests normalization**: `coordinator/bin/mac10` must canonicalize loop-request arrays from `requests`, `data.requests`, `data.rows`, `rows`, and raw array payloads
- **Sentinel ACTIVE_COUNT**: prefer the first non-empty array candidate; avoids false zero counts
- **Architect instructions**: avoid hardcoded validation defaults; use script-aware task payload generation
- **Mirror drift detection**: if setup detects drift between tracked and runtime copies, preserve the runtime copy
- **Worktree .codex self-healing**: during setup/start, replace any symlink or incomplete `.codex` worktree entry with a fresh directory copy from project root `.codex`

## Pitfalls
- **False zero active count**: parser failures silently returning zero causes sentinel to exit loops prematurely
- **Mirror drift**: tracked script and runtime copies can diverge silently; always check both after edits
- **Hardcoded validation**: adding default `npm run build` validation for repos without build scripts breaks docs-only tasks
- **Partial .codex after conflict recovery**: interrupted rebase/autosave recovery can leave `.worktrees/wt-N/.codex` missing `knowledge/` and wrappers; always verify worktree copies after conflict handling

## External Project Cleanup

When decommissioning a target project from mac10/codex10:
1. `git worktree prune` + `git worktree remove --force` for each non-main worktree
2. `rm -rf .worktrees .claude .codex CLAUDE.md AGENTS.md`
3. Remove temp PR files: `rm -f .tmp_pr_*.md`
4. Remove Linux-native shared state: `rm -rf /home/owner/Desktop/<project>/.claude-shared-state`

State symlink: `.claude/state` → `/home/owner/Desktop/<project>/.claude-shared-state` (Linux path, separate from Windows mount at `/mnt/c/`).

## Coordinator Recovery

If coordinator crashes (socket/port file exists but no process listening):
- `tmux send-keys -t <session>:0 "node $MAC10_BIN start" Enter`
- Verify: `nc -z 127.0.0.1 <port>`

## Changelog (last 5)
- 2026-03-23: Added `.codex` worktree copy invariants and startup self-healing pattern for symlink/incomplete worktree states
- 2026-03-22: Added external project cleanup procedure and coordinator recovery pattern
- 2026-03-16: Condensed from append-only domain file into living doc
