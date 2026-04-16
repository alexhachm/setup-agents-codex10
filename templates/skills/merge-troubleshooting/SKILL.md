---
name: merge-troubleshooting
description: Diagnose and resolve merge pipeline issues. Use when merges stall, conflict, or fail; requests stuck in integrating state; or merge queue not draining.
---

# Merge Troubleshooting

Diagnose and resolve merge pipeline issues in the mac10 coordinator.

## Merge Strategy (4-tier)

The merger attempts these strategies in order:

1. **Clean merge** — `git merge --no-edit` (fast-forward or clean 3-way)
2. **Rebase** — `git rebase origin/main` then force-push
3. **AI-resolve** — Worker agent attempts conflict resolution
4. **Redo** — Task re-created with fresh worktree

## Steps

1. Run `mac10 status --merges` to check merge queue state
2. Run `mac10 diagnostics` to check for merge timeout errors (>5 min stalls)
3. If a specific merge is stuck, check the merger.js activity log for error details
4. For conflicts, check if the worker branch has drifted from `origin/main`

## Common Failure Modes

### Merge Timeout (>5 min)
- **Cause**: Large diff, slow CI, or dead merger process
- **Fix**: Verify merger loop is running. Restart coordinator if needed.
- **Auto-recovery**: Watchdog detects after 300s (configurable)

### Functional Conflict
- **Cause**: Two workers edited semantically overlapping code
- **Fix**: Merger escalates to AI-resolve (tier 3), then redo (tier 4).
- **Grace period**: 600s before auto-escalation

### Branch Drift
- **Cause**: Worker branch fell behind `origin/main` during long task
- **Fix**: Auto-sync rebases on next merge attempt

## Research Source
Ref: coordinator rollup (dual-protocol drift), merger.js (4-tier strategy), watchdog.js (merge timeout escalation)
