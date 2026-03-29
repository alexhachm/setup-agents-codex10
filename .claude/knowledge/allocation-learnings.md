# Allocation Learnings

Owned by Master-3 (Allocator). Updated during pre-reset distillation.
Budget: ~500 tokens max.

## Domain-Worker Pairings

All 4 workers consistently operate in the **coordinator** domain. No frontend workers active.
- Tasks involving coordinator/src/, coordinator/tests/ have all gone to any available worker.

## Worker Specializations (from observed task affinity)

- worker-1: coordinator domain fixes, merge remediation
- worker-2: coordinator domain, infra tasks (setup.sh, scripts), fast completion
- worker-3: coordinator domain, handles merge/close PR tasks (fix tasks for stale PRs)
- worker-4: coordinator domain, general tasks

## Allocation Patterns

### What works well
- **Drain-and-fill**: When all workers idle after restart, assign greedily.
- **Fix task affinity**: Rule 4 preferred but not mandatory — any idle worker can handle gh CLI workarounds.
- **Stale PR cleanup**: When PR is "not mergeable", fix task closes PR. Merge entry auto-purges at 600 min.
- **Direct integration**: After fix task completes, call `integrate <request_id>` immediately.

### Systemic Issues
- **gh CLI ENOENT**: Merger pipeline requires `gh` CLI but not in PATH initially. Workers must use direct git commands.
- **Stale merge entries**: After direct git merge, PR shows "not mergeable". Merge entry stays in [conflict] — NON-RETRIABLE. Auto-purge at 600 min.
- **Coordinator crashes**: Restart with Node v22 via nvm.
- **merge_failed spam**: Don't call `integrate` multiple times for same stuck request.

## Recently Completed
- task #17 (FIX stale PR #309) → worker-3 — merged as PR #310
- task #18 (setup.sh comment) → worker-2 — merged as PR #315
- req-deb92704 integrated; stale merge #2 in [conflict] — do not re-integrate
- req-8a728d8f: completed (Master-2 handled directly)
- req-a40e1bc3: still [pending] — "Add comment to vite.config.js" (vite.config.js may not exist)
- Sessions since last task: 29 full idle cycles; system fully idle throughout

## Transient Failures
- "Worker tmux window destroyed during coordinator restart" → RETRIABLE. Create new task.
- "GraphQL: Pull Request is not mergeable" → NON-RETRIABLE. Code already on main. Create task to close stale PR.
- "merge_queue:duplicate_pr_owned_by_other_request" → NON-RETRIABLE. Skip.
- Coordinator restart: Use Node v22 with nvm.

### Gotchas
- **agent-health.json corruption**: Always write JSON directly with Python3. Strip non-JSON prefix with regex before parsing.
- **jq not available**: Use Python3 for all JSON reads/writes.
- **completed_task state**: Workers need 6-30s to transition to idle.
- **Don't double-integrate**: Calling integrate twice for a stuck request causes new failing merge entries.
- **merge_failed inbox flood**: Process once, ignore duplicates.
- **Merge entry #2**: branch agent-2 / PR #309 stuck in [conflict]. Code is on main — no fix tasks. Auto-purge confirmed non-functional (well past 600m threshold). Code is on main — no action needed.
- **req-a40e1bc3 [pending]**: Long-stalled. vite.config.js likely doesn't exist. Awaiting Master-2 triage only.
- **Merge entry #2 persists**: Auto-purge timer is non-functional (confirmed across 29 sessions). Will likely persist until coordinator restart.
- **Session count**: 29 consecutive idle sessions (session 28 ended). System fully idle awaiting Master-2 work.

Last updated: 2026-03-25 06:55
