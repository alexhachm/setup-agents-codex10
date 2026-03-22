# Decomposition Patterns

Learnings from past task decompositions. Updated by the Architect after completing triage cycles.

## Good Patterns
- **Batch-triage 4 Tier 2 tasks simultaneously** when 4 idle workers available — claim all, create tasks, assign, release in sequence. Maximizes worker utilization.
- **Script-aware validation** is critical: this repo has no `build` script, only `test`. Hardcoded "npm run build" caused 15+ merge failures.
- **Group docs-only Tier 1s strategically**: fix highest-impact docs first (validation defaults > stagger guards > triage steps > help text).
- **Record triage tier after Tier 2 assignment**: prevents requests lingering as `[pending]` and polluting backlog drain counts.

## Good Patterns (cont.)
- **Serialize same-file tasks with depends_on**: tasks touching the same file across different requests (e.g. scripts/loop-sentinel.sh, merger.js, db.js checkAndPromoteTasks) should be chained to avoid merge conflicts.
- **Triage without idle workers**: create task + triage even when no workers are idle. Task enters ready queue for Master-3 allocation.
- **Aggressive curation**: loop-findings.md grew to 52K tokens. Prune to actionable patterns only during curation.
- **Bulk triage builds ready buffer**: triaging all pending requests in one session fills ready queue well above floor.
- **Detect duplicates early**: req-b744636d was identical to req-9f5526cb (same active-state guard fix). Triage as covered to avoid wasted worker cycles.
- **Group related requests**: provider-switching requests (namespace, reload, persistence, umbrella) benefit from joint triage to identify overlaps and proper Tier 3 decomposition.

## Good Patterns (session 2026-03-19)
- **Bootstrap file deadlock detection**: When workers crash because they source a missing file (provider-utils.sh), no worker can create that file. Architect must execute directly as Tier 1 to break the cycle.
- **Stale request detection**: Requests for fixes that already exist on main (e.g. merger tryRebase cleanup) should be verified against current source before task creation.
- **Merge-pipeline bootstrap deadlock**: When the merger can't find `gh` (PATH issue), and the fix for the PATH issue is stuck in the merge queue, architect must apply the PATH fix directly and restart coordinator.
- **Kill stale coordinator processes after restart**: Old coordinator processes can survive `codex10 stop` if they were started under a different namespace or PID file. Always `ps aux | grep index.js` after restart.
- **Worktree dirty state blocks merges**: Untracked files and modified files in worktrees cause rebase failures. Clean with `git checkout -- . && git clean -fd` before retrying.

## Good Patterns (session 2026-03-18 evening)
- **Coordinator must start with absolute path**: Starting coordinator with relative path (`.`) causes worker sentinel spawns to fail because the sentinel path resolves relative to the worktree CWD where scripts don't exist.
- **Escalate to direct execution after 3+ worker cycling failures**: If a worker keeps resetting (sentinel_reset → orphan_task_recovered → respawn loop), execute the task directly rather than burning allocation cycles.
- **Mark task AND request complete**: `tier1-complete` only marks the request. If a task was created and assigned, also call `complete-task` to prevent orphan task cycling.
- **Reject loop-submitted duplicates quickly**: Loop agents can submit the same fix multiple times within minutes. Check PR URLs and recent completions before creating tasks.

## Architectural Patterns (from research-queue-orchestration-patterns)
- **Coordinator-owned state over prompt memory**: Operational counters (tasks_completed, context_budget, domain_lock) must live in SQLite, not model working memory. Memory drifts across resets; DB does not.
- **Tool-layer role enforcement**: Prompt-level "do not edit code" is insufficient for long sessions. Enforce read-only at settings/runtime level for non-worker roles.
- **Typed task envelope**: done_when, non_goals, hazards, validation_profile prevent decomposition ambiguity and improve restart recovery.
- **Distillation events over direct knowledge writes**: Workers in worktrees should not write .codex/knowledge/ directly — submit events for coordinator to merge. Prevents PR conflicts.
- **Structured sentinel exit codes**: idle, completed, budget_reset, validation_failed, fatal_tool_error — persist and use for crash-loop detection and quarantine.
- **Domain-aware validation profiles**: Replace generic npm run build/test with profile-based validation matching actual project scripts.

## Good Patterns (session 2026-03-19 evening)
- **Allocator auto-assigns when architect can't claim**: If worker transitions from completed_task → idle while architect is releasing claims, the allocator (Master-3) will assign the next ready task automatically. Don't fight the race — let the allocator handle it.
- **Bulk triage pending requests early**: Triaging all 8 pending requests immediately (even without idle workers) cleared the backlog and let allocator/workers pick up work as tasks became ready.
- **Duplicate request detection via completed coverage**: req-eb44ed6a duplicated req-3e830acf (same file, same bug). Mark as complete with reference to the covering PR instead of creating duplicate tasks.

## Good Patterns (session 2026-03-21)
- **Run staleness checks even when idle**: `pending_count=0` and `ready_count=0` can still require a mandatory reset when changed-domain breadth crosses the 50% threshold.
- **Record no-op decomposition cycles explicitly**: if no requests were triaged/decomposed before a mandatory reset, capture that outcome to avoid confusing future throughput analysis.

## Anti-Patterns
- **Hardcoded npm run build validation**: caused widespread merge failures. Always use script-aware selection.
- **Skipping triage call for Tier 2**: leaves requests as pending, confuses backlog drain metrics.
- **Using codex10 status for stagger check**: status output has no agent reset fields. Use agent-health.json directly.
- **Uncurated knowledge files**: loop-findings.md at 52K tokens wastes context budget and slows agent reads. Enforce token budgets aggressively.
- **Claim-then-assign race**: If claim-worker succeeds but Master-3 assigns the worker before assign-task, release the claim and let the task enter the ready queue instead.
- **Loop agent duplicate submissions**: COMMAND_SCHEMAS fix submitted 3 times (req-d2cddb2d, req-5b094253, req-c3c94f69) despite being completed on first. Instruction patch staged — loop preflight must check completed requests.
- **String depends_on IDs**: Task dependency promotion may fail when depends_on contains string IDs vs integer IDs. Manual promotion via DB update may be needed.
