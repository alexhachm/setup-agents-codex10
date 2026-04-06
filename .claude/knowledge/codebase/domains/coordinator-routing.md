# coordinator-routing Domain

Files: coordinator/src/cli-server.js, coordinator/src/allocator.js, coordinator/src/merger.js, coordinator/src/watchdog.js

---

## allocator.js (129L)

**Purpose:** Periodic loop (default 2s) that detects ready tasks + idle workers and notifies Master-3.

**Key functions:**
- start(projectDir) - begins setInterval + runs immediate startup tick
- tick() - core logic:
  1. db.checkAndPromoteTasks() - advance dependency-blocked tasks to ready
  2. db.recoverStalledAssignments() - recover orphaned/heartbeat-stale assignments
  3. If readyTasks + idleWorkers exist - send mail tasks_available to allocator (deduped 10s)
- signalResearchBatchAvailability() - if queued research intents with no running batch, sends research_batch_available mail (deduped 30s)

**Coupling:** db.getReadyTasks(), db.getIdleWorkers(), db.sendMail(), db.recoverStalledAssignments(), insightIngestion.

---

## merger.js (~1009L)

**Purpose:** PR merge pipeline. Consumes merge_queue entries, attempts merge via tiered strategy, handles conflicts and functional validation.

**Key functions:**
- start(projectDir) - starts 5s polling interval calling processQueue()
- onTaskCompleted(taskId) - triggered on task completion; checks if all request tasks done, handles recoverable merge retries, calls completeRequestIfTransition()
- processQueue(projectDir) - serialized merge loop (processing flag, 5-min timeout):
  - Stale conflict recovery sweep + stale entry purge
  - shouldDeferMergeForAssignmentPriority() - defers merge if allocator active and tasks waiting
  - attemptMerge() -> updates entry: merged / conflict / failed
- attemptMerge(entry, projectDir) - 3-tier merge:
  - Tier 1: tryCleanMerge() via gh CLI
  - Tier 2: tryRebase() (rebase in worker worktree + force-push) then retry Tier 1
  - Tier 3: tryDirectGitMerge() when gh CLI unavailable
  - Pre/post runOverlapValidation() - returns functional_conflict if fails
- reconcileMergeQueue(projectDir) - every 5th watchdog tick; audits non-terminal entries for missing worktrees, branch mismatches, missing remote branches; resets to pending

**Key patterns:**
- Assignment-priority deferral: config key prioritize_assignment_over_merge (max 3 deferrals or 120s age)
- Worktree resolution: findWorktreePath() - DB (task->worker->worktree_path) with fallback to agent-N -> .worktrees/wt-N

**Coupling (tightest):** db.getNextMerge(), db.updateMerge(), db.getTask(), db.listTasks(), db.updateRequest(), db.sendMail(), db.getDb().prepare(). Also insightIngestion.

---

## watchdog.js (~1185L)

**Purpose:** Worker health monitor. Escalates stale heartbeats (warn->nudge->triage->terminate), recovers failed/stale state, drives periodic sweeps.

**Key functions:**
- start(projectDir) - startup recovery sweep + 10s interval
- tick(projectDir) - per-worker loop + system sweeps:
  - Per-worker: death detection (tmux/docker/sandbox), grace period, heartbeat -> escalate()
  - System: checkWorkerFatigue(), releaseStaleClaimsCheck(), recoverOrphanTasks(), recoverFailedRequestsWithActiveRemediation(), recoverStaleDecomposedRequests(), db.reconcileAllActiveRequests(), recoverStaleIntegrations(), monitorLoops(), monitorResearchBatches()
  - Every 5th tick: reconcileMergeQueue(projectDir) (merger module)
  - Hourly: purge mail, terminal merges, activity log
- escalate(worker, staleSec) - 60s warn, 90s nudge (mail), 120s triage (tmux output hash), 180s terminate (kill pane + reset worker)

**Thresholds:** DB config keys watchdog_warn_sec, watchdog_nudge_sec, watchdog_triage_sec, watchdog_terminate_sec.

**Coupling:** db.getAllWorkers(), db.updateWorker(), db.sendMail(), tmux.isPaneAlive(), tmux.killPane(), recovery.*, insightIngestion.

---

## cli-server.js (~4848L)

**Purpose:** Unix socket server exposing all mac10 CLI commands. Routes commands to DB, allocator, merger, and model router.

**Server structure:**
- start(projectDir, handlers) - creates Unix socket, accepts connections
- handleCommand(cmd, conn, handlers) - large switch/case over all command names
- validateCommand(cmd) - validates required args/types from COMMAND_SCHEMAS

**Command groups:**

| Group | Commands |
|-------|----------|
| User | request, fix, status, clarify, log, request-history |
| Architect | triage, create-task, tier1-complete, ask-clarification |
| Worker | my-task, start-task, heartbeat, complete-task, fail-task, distill |
| Allocator | assign-task, claim-worker, release-worker, ready-tasks, worker-status, register-worker, reset-worker |
| Merge | integrate, merge-status, check-overlaps, check-completion |
| Loop | loop, stop-loop, loop-status, loop-checkpoint, loop-heartbeat, loop-prompt, loop-request |
| Research | queue-research, research-status, research-requeue-stale |
| Config | set-config, health-check, ping, repair, purge-tasks, add-worker |

**complete-task flow:**
1. Validate worker task ownership
2. Update task to completed, normalize PR URL + branch
3. preQueueOverlapCheck() - detect overlapping pending merges
4. queueMergeWithRecovery() - enqueue merge
5. Reset worker to idle, send mail to allocator + master-1

**Model routing:**
- modelRouter.routeTask(task, opts) with fallback to fallbackModelRouter()
- resolveFallbackRoutingClass: tier>=4->xhigh, tier>=3->high, urgent->xhigh, merge/conflict/refactor->mid, docs/typo low->mini, code-heavy->mid, else->spark
- Budget downscale: constrained budget -> high->mini, mid->spark

**Tightest coupling hotspot:** cli-server.js <-> db.js. Nearly every handler calls db directly (createRequest, createTask, updateTask, getWorker, sendMail, listTasks, getDb().prepare()). No intermediate service layer.

---

## Cross-module coupling

- allocator.js -> db (read/write), insightIngestion
- merger.js -> db (heavy read/write), insightIngestion, execFileSync (git/gh)
- watchdog.js -> db, tmux, recovery, insightIngestion, calls merger.reconcileMergeQueue
- cli-server.js -> db (all commands), modelRouter, calls merger.onTaskCompleted

**Critical invariant:** merger.processQueue serialized by processing flag. 5-min timeout auto-resets if stuck.
