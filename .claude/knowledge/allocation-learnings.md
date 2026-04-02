# Allocation Learnings
<!-- Updated 2026-04-01T15:21:00Z by Master-3 -->

## Worker Performance
- All 4 workers operate in **coordinator** and **coordinator-routing** domains
- worker-1: coordinator-routing domain, idle this session (no new tasks arrived)
- worker-2: coordinator-routing domain, idle this session (no new tasks arrived)
- worker-3: not present in this session
- worker-4: not present in this session

## Task Duration Actuals
- Overlay injection / gap detection retries: ~2-5 min per task
- FIX tasks (merge remediation): ~3-8 min
- Merge conflict resolution tasks: 5-15+ min (Claude Code needs time to load context)
- Context budget: ~50 per task assigned, ~10 per status check
- worker_idle_orphan recovery tasks: 1 reassignment typical, works on 2nd try
- Idle sessions (no tasks): context budget ~50/session; ~120 cycles at ~10s each = ~20 min, context_budget ~1240 (low)
- Fully idle sessions: reset at ~20 min regardless of budget — budget stays low when no tasks arrive

## Allocation Decisions

### What works well
- **Drain-and-fill**: When all workers idle after restart, assign greedily
- **Fix task affinity**: Rule 4 preferred; any idle worker works for merge-fix tasks
- **Sentinel restart**: When sentinels die, `cd PROJECT_ROOT && bash .claude/scripts/worker-sentinel.sh N PROJECT_ROOT` with absolute paths
- **Direct file verification**: Always check if file already exists on main before worrying about merge
- **Stale FIX task bypass**: If request is already [completed], skip creating fix task for task_failed events on that request
- **ready-tasks vs status discrepancy**: `status` may show task as [ready] while `ready-tasks` returns empty (max reassignment count reached). In this case, assign manually with `assign-task <id> <worker>` — it still works
- **Idle session monitoring**: Condensed bash for-loop with 10s timeout blocks is efficient; only print every 5 cycles to reduce noise
- **Coordinator running in tmux foreground**: When coordinator crashes, run it in the `codex10:coordinator` tmux window (not background) to capture crash output
- **jq not available in bash**: Use node/python or the codex10 CLI for JSON manipulation; do not rely on jq in bash scripts
- **Idle reset**: Even idle sessions should reset at 20m — but context_budget stays low (~50 at 98 cycles) so reset is cheap
- **Fully idle sessions (no new tasks)**: context_budget stays very low; ~120 cycles at ~10s = ~20 min session. All requests completed — allocator correctly monitored and detected no work.
- **Batched idle cycles in bash loop**: Running condensed bash loops with 10s inbox blocks, break on activity, print every 5 cycles reduces context noise significantly
- **Health update via node**: `jq` not available in bash; use `node -e "..."` to update JSON health files
- **research_batch_available messages**: These are for the research pipeline, not task allocation. Verify research sentinel is running and ignore these in allocator flow.
- **Idle loop grep fix**: `ready-tasks` output "No ready tasks." contains the word "task" — use `grep -E "^\s*#[0-9]+|priority:"` to detect actual task lines, not "No ready tasks." string
- **check-completion on completed requests**: Shows failed tasks from old retry cycles — does NOT mean work is pending. Cross-check with `status` (shows request-level status) and `merge-status` (shows actual merge state). If both show completed, ignore task-level failures from earlier retries.
- **No task-details command**: Use `status`, `log`, `history <request_id>`, and `merge-status` to investigate task state. There is no `task-details` subcommand.
- **Source revision drift is non-blocking**: `status` may warn "head differs from origin/main or worktree is dirty" — this is informational only when all requests are completed and no tasks are active. Do not act on drift unless a new request arrives that needs fresh main.

### CRITICAL: MAC10_WORKER_BACKEND=sandbox breaks workers
- **Root cause**: If coordinator is started with `MAC10_WORKER_BACKEND=sandbox`, the msb sandbox mounts only the worktree (`wt-N:/workspace`) — NOT the project root
- The sentinel is at `<project_root>/.claude/scripts/worker-sentinel.sh`
- Inside the sandbox, this path doesnt exist → sentinel exits immediately → `msb_sandbox_dead`
- This causes `worker_liveness_stale` → all tasks fail
- **Symptom**: Log shows `worker_spawned_msb` followed by `worker_death: msb_sandbox_dead` within 5s
- **Detection**: `cat /proc/<pid>/environ | tr 0 n | grep BACKEND`
- **Fix**: Kill coordinator, restart WITHOUT `MAC10_WORKER_BACKEND=sandbox` (tmux is default)
  `MAC10_NAMESPACE=codex10 MAC10_FORCE_PROVIDER=claude MAC10_AGENT_PROVIDER=claude MAC10_CLI_HOST=0.0.0.0 MAC10_WORKER_BACKEND=tmux node coordinator/src/index.js <project_root> >> .claude/state/codex10.coordinator.log 2>&1 &`
  Wait 5 seconds then ping to verify: `node coordinator/bin/mac10 --project PROJECT_ROOT ping`
