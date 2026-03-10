'use strict';

const db = require('./db');
const tmux = require('./tmux');
const recovery = require('./recovery');

let intervalId = null;
let lastMailPurge = 0;
let startupRecoverySweepPending = true;
// Track last escalation level per worker to avoid duplicate nudge/triage mails
const lastEscalationLevel = new Map();

// Default escalation thresholds (seconds since last heartbeat).
const THRESHOLDS = Object.freeze({
  warn: 60,
  nudge: 90,
  triage: 120,
  terminate: 180,
});
const MERGE_TIMEOUT_SEC = 300;
const MERGE_CONFLICT_GRACE_SEC = 600;
const MERGE_TIMEOUT_ERROR = `Merge timed out after ${MERGE_TIMEOUT_SEC / 60} minutes`;
const SQLITE_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

// Escalation thresholds (seconds since last heartbeat)
// Override via DB config: watchdog_warn_sec, watchdog_nudge_sec, watchdog_triage_sec, watchdog_terminate_sec
function getThresholds() {
  return {
    warn:      parseInt(db.getConfig('watchdog_warn_sec'))      || THRESHOLDS.warn,
    nudge:     parseInt(db.getConfig('watchdog_nudge_sec'))     || THRESHOLDS.nudge,
    triage:    parseInt(db.getConfig('watchdog_triage_sec'))    || THRESHOLDS.triage,
    terminate: parseInt(db.getConfig('watchdog_terminate_sec')) || THRESHOLDS.terminate,
  };
}

function parseTimestampMs(timestamp) {
  if (timestamp instanceof Date) {
    const time = timestamp.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof timestamp === 'number') {
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof timestamp !== 'string') return null;

  const value = timestamp.trim();
  if (!value) return null;

  const sqliteMatch = value.match(SQLITE_DATETIME_PATTERN);
  if (sqliteMatch) {
    const year = Number(sqliteMatch[1]);
    const month = Number(sqliteMatch[2]);
    const day = Number(sqliteMatch[3]);
    const hour = Number(sqliteMatch[4]);
    const minute = Number(sqliteMatch[5]);
    const second = Number(sqliteMatch[6]);
    const millis = sqliteMatch[7] ? Number(sqliteMatch[7].padEnd(3, '0')) : 0;
    const parsed = Date.UTC(year, month - 1, day, hour, minute, second, millis);
    const parsedDate = new Date(parsed);

    // Reject impossible dates/times (Date.UTC auto-normalizes overflows).
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day ||
      parsedDate.getUTCHours() !== hour ||
      parsedDate.getUTCMinutes() !== minute ||
      parsedDate.getUTCSeconds() !== second ||
      parsedDate.getUTCMilliseconds() !== millis
    ) {
      return null;
    }
    return parsed;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getAgeSeconds(now, timestamp, metadata = {}) {
  const parsed = parseTimestampMs(timestamp);
  if (parsed === null) {
    db.log('coordinator', 'watchdog_invalid_timestamp', {
      ...metadata,
      timestamp: String(timestamp).slice(0, 120),
    });
    return null;
  }
  return (now - parsed) / 1000;
}

function start(projectDir) {
  const intervalMs = parseInt(db.getConfig('watchdog_interval_ms')) || 10000;

  runStartupRecoverySweep();

  intervalId = setInterval(() => {
    try {
      tick(projectDir);
    } catch (e) {
      db.log('coordinator', 'watchdog_error', { error: e.message });
    }
  }, intervalMs);

  db.log('coordinator', 'watchdog_started', { interval_ms: intervalMs });
}

function stop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  startupRecoverySweepPending = true;
  lastEscalationLevel.clear();
}

function runStartupRecoverySweep() {
  if (!startupRecoverySweepPending) return;
  const repairedRequests = recoverStaleIntegrations(Date.now(), { source: 'startup_repair_sweep' });
  startupRecoverySweepPending = false;
  if (repairedRequests > 0) {
    db.log('coordinator', 'integration_repair_sweep', {
      source: 'startup',
      repaired_requests: repairedRequests,
    });
  }
}

function tick(projectDir) {
  const workers = db.getAllWorkers();
  const now = Date.now();

  for (const worker of workers) {
    // Skip idle workers and clear their escalation tracking
    if (worker.status === 'idle') {
      lastEscalationLevel.delete(worker.id);
      continue;
    }

    // ZFC death detection: check if tmux pane is actually alive
    const windowName = `worker-${worker.id}`;
    const paneAlive = tmux.isPaneAlive(windowName);

    if (!paneAlive && worker.status !== 'idle' && worker.status !== 'completed_task') {
      // Process died unexpectedly
      handleDeath(worker, 'tmux_pane_dead');
      continue;
    }

    // Skip workers just launched (grace period)
    if (worker.launched_at) {
      const launchedAgo = (now - new Date(worker.launched_at).getTime()) / 1000;
      if (launchedAgo < getThresholds().warn) continue;
    }

    // Heartbeat freshness check
    if (worker.last_heartbeat && (worker.status === 'running' || worker.status === 'busy')) {
      const staleSec = (now - new Date(worker.last_heartbeat).getTime()) / 1000;
      escalate(worker, staleSec, projectDir);
    }

    // Check completed_task workers that haven't been reset
    if (worker.status === 'completed_task') {
      const completedAgo = worker.last_heartbeat
        ? (now - new Date(worker.last_heartbeat).getTime()) / 1000
        : getThresholds().terminate;
      if (completedAgo > 30) {
        // Reset to idle so allocator can reuse
        db.updateWorker(worker.id, { status: 'idle', current_task_id: null });
        db.log('coordinator', 'worker_auto_reset', { worker_id: worker.id });
      }
    }
  }

  // Worker context fatigue: workers with 6+ completed tasks should reset
  checkWorkerFatigue();

  // Stale claim cleanup: workers claimed but no task assigned for >2 minutes
  releaseStaleClaimsCheck(now);

  // Orphan task recovery: tasks assigned but worker is idle
  recoverOrphanTasks();

  // Recover stale integrations
  recoverStaleIntegrations(now);

  // Monitor persistent loops
  monitorLoops(projectDir);

  // Periodic mail + log purge (once per hour)
  if (now - lastMailPurge > 3600000) {
    lastMailPurge = now;
    const purged = db.purgeOldMail(7);
    if (purged > 0) {
      db.log('coordinator', 'mail_purged', { count: purged });
    }
    // Purge old activity log entries (>30 days)
    const logPurged = db.getDb().prepare(
      "DELETE FROM activity_log WHERE created_at < datetime('now', '-30 days')"
    ).run();
    if (logPurged.changes > 0) {
      db.log('coordinator', 'activity_log_purged', { count: logPurged.changes });
    }
  }
}

function escalate(worker, staleSec, projectDir) {
  const THRESHOLDS = getThresholds();
  const windowName = `worker-${worker.id}`;
  const prevLevel = lastEscalationLevel.get(worker.id) || 0;

  if (staleSec >= THRESHOLDS.terminate) {
    // Level 4: Terminate and reassign (always fires — destructive action)
    db.log('coordinator', 'watchdog_terminate', {
      worker_id: worker.id,
      stale_sec: staleSec,
    });
    tmux.killWindow(windowName);
    handleDeath(worker, 'heartbeat_timeout');
    lastEscalationLevel.delete(worker.id);

  } else if (staleSec >= THRESHOLDS.triage && prevLevel < 3) {
    // Level 3: Triage — capture output, log for analysis (once per escalation)
    lastEscalationLevel.set(worker.id, 3);
    const output = tmux.capturePane(windowName, 20);
    db.log('coordinator', 'watchdog_triage', {
      worker_id: worker.id,
      stale_sec: staleSec,
      last_output: output.slice(-500),
    });
    db.sendMail(`worker-${worker.id}`, 'nudge', {
      message: 'Heartbeat stale. Send heartbeat or complete task.',
    });

  } else if (staleSec >= THRESHOLDS.nudge && prevLevel < 2) {
    // Level 2: Nudge — send reminder (once per escalation)
    lastEscalationLevel.set(worker.id, 2);
    db.sendMail(`worker-${worker.id}`, 'nudge', {
      message: 'Heartbeat check — please report status.',
    });
    db.log('coordinator', 'watchdog_nudge', {
      worker_id: worker.id,
      stale_sec: staleSec,
    });

  } else if (staleSec >= THRESHOLDS.warn && prevLevel < 1) {
    // Level 1: Warn — log only (once per escalation)
    lastEscalationLevel.set(worker.id, 1);
    db.log('coordinator', 'watchdog_warn', {
      worker_id: worker.id,
      stale_sec: staleSec,
    });
  }
}

function handleDeath(worker, reason) {
  db.log('coordinator', 'worker_death', {
    worker_id: worker.id,
    reason,
    task_id: worker.current_task_id,
  });

  // If worker had a task, conditionally mark it for reassignment
  // Uses a single conditional UPDATE to avoid TOCTOU race with worker's complete-task
  if (worker.current_task_id) {
    const result = db.getDb().prepare(
      "UPDATE tasks SET status='ready', assigned_to=NULL, updated_at=datetime('now') WHERE id=? AND status NOT IN ('completed','failed')"
    ).run(worker.current_task_id);
    if (result.changes > 0) {
      db.log('coordinator', 'task_reassigned', {
        task_id: worker.current_task_id,
        reason: `worker-${worker.id} died (${reason})`,
      });
    }
  }

  // Reset worker
  db.updateWorker(worker.id, {
    status: 'idle',
    current_task_id: null,
    pid: null,
  });
}

function checkWorkerFatigue() {
  // Workers with 6+ completed tasks need a context reset
  const fatigued = db.getDb().prepare(
    "SELECT * FROM workers WHERE tasks_completed >= 6 AND status IN ('idle', 'completed_task')"
  ).all();

  for (const worker of fatigued) {
    // Reset their counter and log it
    db.updateWorker(worker.id, { tasks_completed: 0 });
    db.log('coordinator', 'worker_fatigue_reset', {
      worker_id: worker.id,
      tasks_completed: worker.tasks_completed,
    });
  }
}

function releaseStaleClaimsCheck(now) {
  const claimedWorkers = db.getDb().prepare(
    "SELECT * FROM workers WHERE claimed_by IS NOT NULL AND status = 'idle' AND current_task_id IS NULL"
  ).all();

  for (const worker of claimedWorkers) {
    // Use last_heartbeat or created_at as claim timestamp proxy
    const claimTime = worker.last_heartbeat || worker.created_at;
    if (!claimTime) {
      db.releaseWorker(worker.id);
      db.log('coordinator', 'stale_claim_released', { worker_id: worker.id, reason: 'no_timestamp' });
      continue;
    }
    const staleSec = getAgeSeconds(now, claimTime, {
      worker_id: worker.id,
      scope: 'release_stale_claim',
    });
    if (staleSec === null) continue;
    if (staleSec > 120) {
      db.releaseWorker(worker.id);
      db.log('coordinator', 'stale_claim_released', { worker_id: worker.id, stale_sec: staleSec });
    }
  }
}

function recoverOrphanTasks() {
  // Tasks that are 'assigned' or 'in_progress' but their worker is idle
  const orphans = db.getDb().prepare(`
    SELECT t.* FROM tasks t
    JOIN workers w ON t.assigned_to = w.id
    WHERE t.status IN ('assigned', 'in_progress')
      AND w.status = 'idle'
      AND w.current_task_id IS NULL
  `).all();

  for (const task of orphans) {
    db.updateTask(task.id, { status: 'ready', assigned_to: null });
    db.log('coordinator', 'orphan_task_recovered', { task_id: task.id });
  }
}

function recoverStaleIntegrations(now, options = {}) {
  const source = options.source || 'watchdog_tick';
  const integratingRequests = db.getDb().prepare(
    "SELECT * FROM requests WHERE status = 'integrating'"
  ).all();
  let repairedRequests = 0;

  for (const req of integratingRequests) {
    const merges = db.getDb().prepare(
      'SELECT * FROM merge_queue WHERE request_id = ?'
    ).all(req.id);

    // Immediate repair path for stranded no-merge requests that are already complete.
    if (merges.length === 0 && recovery.isNoMergeTerminalIntegratingRequest(req)) {
      db.updateRequest(req.id, { status: 'completed' });
      repairedRequests += 1;
      db.log('coordinator', 'stale_integration_recovered', {
        request_id: req.id,
        reason: 'no_merge_terminal_repair',
        source,
      });
      continue;
    }

    // Case 1: No merge_queue entries and integrating > 15 minutes → complete (e.g. tier1 tasks)
    if (merges.length === 0) {
      const integratingAge = getAgeSeconds(now, req.updated_at, {
        request_id: req.id,
        scope: 'integration_age',
      });
      if (integratingAge === null) continue;
      if (integratingAge > 900) { // 15 minutes
        db.updateRequest(req.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          result: 'Completed (no PRs to merge)',
        });
        db.sendMail('master-1', 'request_completed', {
          request_id: req.id,
          result: 'Completed (no PRs to merge)',
        });
        db.log('coordinator', 'stale_integration_recovered', {
          request_id: req.id,
          reason: 'no_merge_entries_timeout',
        });
      }
      continue;
    }

    // Check for merges stuck in 'merging' for > 5 minutes and route as recoverable conflicts.
    // Use updated_at (when status changed to 'merging'), not created_at (when enqueued)
    for (const m of merges) {
      const statusAnchor = m.updated_at || m.created_at;
      if (m.status === 'merging' && statusAnchor) {
        const mergeAge = getAgeSeconds(now, statusAnchor, {
          request_id: req.id,
          merge_id: m.id,
          scope: 'merge_age',
        });
        if (mergeAge === null) continue;
        if (mergeAge > MERGE_TIMEOUT_SEC) {
          const sourceTask = m.task_id ? db.getTask(m.task_id) : null;
          const timeoutError = `Merge timeout promoted to conflict: ${m.branch || 'unknown-branch'} - ${MERGE_TIMEOUT_ERROR}`;
          db.updateMerge(m.id, { status: 'conflict', error: MERGE_TIMEOUT_ERROR });
          db.sendMail('allocator', 'merge_failed', {
            request_id: req.id,
            merge_id: m.id,
            task_id: m.task_id,
            branch: m.branch,
            pr_url: m.pr_url,
            status: 'conflict',
            reason: 'merge_timeout_promoted',
            subject: sourceTask ? sourceTask.subject : null,
            domain: sourceTask ? sourceTask.domain : null,
            files: sourceTask ? sourceTask.files : null,
            tier: sourceTask ? sourceTask.tier : null,
            assigned_to: sourceTask ? sourceTask.assigned_to : null,
            original_task: sourceTask ? {
              subject: sourceTask.subject,
              domain: sourceTask.domain,
              files: sourceTask.files,
              tier: sourceTask.tier,
              assigned_to: sourceTask.assigned_to,
            } : null,
            error: timeoutError,
          });
          db.log('coordinator', 'merge_timeout', {
            merge_id: m.id,
            request_id: req.id,
            transitioned_to: 'conflict',
            stale_sec: Math.round(mergeAge),
          });
        }
      }
    }

    // Re-fetch merges after potential timeout updates
    const freshMerges = db.getDb().prepare(
      'SELECT * FROM merge_queue WHERE request_id = ?'
    ).all(req.id);

    const hasConflicts = freshMerges.some(m => m.status === 'conflict');
    const allTerminal = freshMerges.every(m => ['merged', 'conflict', 'failed'].includes(m.status));
    if (!allTerminal) continue;

    const allMerged = freshMerges.every(m => m.status === 'merged');

    if (allMerged) {
      // Case 2: All merges succeeded → mark request completed
      const result = `All ${freshMerges.length} PR(s) merged successfully`;
      db.updateRequest(req.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        result,
      });
      db.sendMail('master-1', 'request_completed', { request_id: req.id, result });
      db.log('coordinator', 'stale_integration_recovered', {
        request_id: req.id,
        reason: 'all_merged',
      });
    } else if (hasConflicts) {
      // Case 3: Merge conflicts — wait for allocator to create fix tasks
      // Check if there are active tasks that could be fix tasks from the allocator
      const activeTasks = db.listTasks({ request_id: req.id }).filter(
        t => !['completed', 'failed'].includes(t.status)
      );
      if (activeTasks.length > 0) {
        // Fix tasks in progress — don't mark request as failed yet
        continue;
      }

      // No active tasks — give allocator a grace period to create fix tasks
      // Check age of the oldest conflict entry
      const oldestConflict = freshMerges
        .filter(m => m.status === 'conflict')
        .reduce((oldest, m) => {
          const ageSec = getAgeSeconds(now, m.updated_at || m.created_at, {
            request_id: req.id,
            merge_id: m.id,
            scope: 'conflict_age',
          });
          if (ageSec === null) return oldest;
          return ageSec > oldest ? ageSec : oldest;
        }, 0);
      const conflictAgeSec = oldestConflict;

      if (conflictAgeSec < MERGE_CONFLICT_GRACE_SEC) { // 10-minute grace period for allocator
        continue;
      }

      // Grace period expired and no fix tasks — mark as failed
      const failedMerges = freshMerges.filter(m => m.status !== 'merged');
      const details = failedMerges.map(m => `${m.branch}: ${m.status}${m.error ? ' - ' + m.error.slice(0, 100) : ''}`).join('; ');
      db.updateRequest(req.id, {
        status: 'failed',
        result: `Merge failures (allocator did not resolve): ${details}`,
      });
      db.sendMail('master-1', 'request_failed', {
        request_id: req.id,
        error: `Merge failures: ${details}`,
      });
      db.log('coordinator', 'stale_integration_recovered', {
        request_id: req.id,
        reason: 'merge_conflict_unresolved',
        details,
      });
    } else {
      // Case 4: All resolved but some failed (no conflicts) → mark request failed
      const failedMerges = freshMerges.filter(m => m.status !== 'merged');
      const details = failedMerges.map(m => `${m.branch}: ${m.status}${m.error ? ' - ' + m.error.slice(0, 100) : ''}`).join('; ');
      db.updateRequest(req.id, {
        status: 'failed',
        result: `Merge failures: ${details}`,
      });
      db.sendMail('master-1', 'request_failed', {
        request_id: req.id,
        error: `Merge failures: ${details}`,
      });
      db.sendMail('allocator', 'merge_failed', {
        request_id: req.id,
        error: details,
      });
      db.log('coordinator', 'stale_integration_recovered', {
        request_id: req.id,
        reason: 'merge_failures',
        details,
      });
    }
  }

  return repairedRequests;
}

function monitorLoops(projectDir) {
  const loops = db.listLoops('active');
  const now = Date.now();

  for (const loop of loops) {
    if (!loop.tmux_window) continue;

    const paneAlive = tmux.isPaneAlive(loop.tmux_window);

    if (!paneAlive) {
      // Sentinel died — respawn it
      db.log('coordinator', 'loop_sentinel_dead', { loop_id: loop.id, window: loop.tmux_window });

      const path = require('path');
      const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
      const namespace = process.env.MAC10_NAMESPACE || 'mac10';
      const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');

      try {
        tmux.createWindow(
          loop.tmux_window,
          `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${loop.id} "${projectDir}"`,
          projectDir
        );
        db.updateLoop(loop.id, {
          tmux_session: tmux.SESSION,
          last_heartbeat: new Date().toISOString(),
        });
        db.log('coordinator', 'loop_sentinel_respawned', { loop_id: loop.id });
      } catch (e) {
        db.log('coordinator', 'loop_respawn_error', { loop_id: loop.id, error: e.message });
      }
    }

    // Log warning for stale heartbeats (>5 min) but don't terminate — sentinel auto-restarts
    if (loop.last_heartbeat) {
      const staleSec = getAgeSeconds(now, loop.last_heartbeat, {
        loop_id: loop.id,
        scope: 'loop_heartbeat_age',
      });
      if (staleSec === null) continue;
      if (staleSec > 300) {
        db.log('coordinator', 'loop_heartbeat_stale', {
          loop_id: loop.id,
          stale_sec: Math.round(staleSec),
        });
      }
    }
  }
}

module.exports = { start, stop, tick, getThresholds, THRESHOLDS };
