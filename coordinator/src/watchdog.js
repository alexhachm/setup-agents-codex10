'use strict';

const crypto = require('crypto');
const db = require('./db');
const tmux = require('./tmux');
const recovery = require('./recovery');
const insightIngestion = require('./insight-ingestion');

let intervalId = null;
let lastMailPurge = 0;
let startupRecoverySweepPending = true;
// Track last escalation level per worker to avoid duplicate nudge/triage mails
const lastEscalationLevel = new Map();
// Track tmux pane output hash at Level 3 triage to detect active workers at Level 4
const lastOutputHash = new Map();

// Default escalation thresholds (seconds since last heartbeat).
const THRESHOLDS = Object.freeze({
  warn: 60,
  nudge: 90,
  triage: 120,
  terminate: 180,
});
const LOOP_SENTINEL_HEARTBEAT_CADENCE_SEC = 30;
const LOOP_STALE_HEARTBEAT_MISSED_BEATS = 12;
const LOOP_STALE_HEARTBEAT_SEC =
  LOOP_SENTINEL_HEARTBEAT_CADENCE_SEC * LOOP_STALE_HEARTBEAT_MISSED_BEATS;
const MERGE_TIMEOUT_SEC = 300;
const MERGE_CONFLICT_GRACE_SEC = 600;
const MERGE_TIMEOUT_ERROR = `Merge timed out after ${MERGE_TIMEOUT_SEC / 60} minutes`;
const FUNCTIONAL_CONFLICT_ERROR_PREFIX = 'functional_conflict:';
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

function getLoopHeartbeatStaleThresholdSec() {
  const configured = Number.parseInt(db.getConfig('loop_stale_heartbeat_sec'), 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return LOOP_STALE_HEARTBEAT_SEC;
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
  lastOutputHash.clear();
}

function runStartupRecoverySweep() {
  if (!startupRecoverySweepPending) return;
  const recoveredDecomposed = recoverStaleDecomposedRequests('startup_repair_sweep');
  recoverFailedRequestsWithActiveRemediation('startup_repair_sweep');
  const repairedRequests = recoverStaleIntegrations(Date.now(), { source: 'startup_repair_sweep' });
  startupRecoverySweepPending = false;
  if (repairedRequests > 0 || recoveredDecomposed > 0) {
    db.log('coordinator', 'integration_repair_sweep', {
      source: 'startup',
      repaired_requests: repairedRequests,
      recovered_decomposed_requests: recoveredDecomposed,
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
      lastOutputHash.delete(worker.id);
      continue;
    }

    // ZFC death detection: check if tmux pane is actually alive.
    // Non-tmux environments skip this branch and rely on heartbeat/launched_at staleness.
    if (tmux.isTmuxAvailable()) {
      const windowName = `worker-${worker.id}`;
      const paneAlive = tmux.isPaneAlive(windowName);

      if (!paneAlive && worker.status !== 'idle' && worker.status !== 'completed_task') {
        // Process died unexpectedly
        handleDeath(worker, 'tmux_pane_dead');
        continue;
      }
    }

    // Skip workers just launched (grace period)
    if (worker.launched_at) {
      const launchedAgo = (now - new Date(worker.launched_at).getTime()) / 1000;
      if (launchedAgo < getThresholds().warn) continue;
    }

    // Heartbeat freshness check
    if (worker.status === 'running' || worker.status === 'busy') {
      if (worker.last_heartbeat) {
        const staleSec = (now - new Date(worker.last_heartbeat).getTime()) / 1000;
        escalate(worker, staleSec, projectDir);
      }
    } else if (worker.status === 'assigned') {
      // Escalate assigned workers through warn/nudge/triage using the freshest
      // available timestamp (last_heartbeat → launched_at → created_at).
      // Recovery at the terminate threshold is handled by recoverOrphanTasks
      // below, preserving existing recovery semantics.
      const freshestTs = worker.last_heartbeat || worker.launched_at || worker.created_at;
      if (freshestTs) {
        const staleSec = getAgeSeconds(now, freshestTs, {
          worker_id: worker.id,
          scope: 'assigned_heartbeat_freshness',
        });
        if (staleSec !== null && staleSec < getThresholds().terminate) {
          escalate(worker, staleSec, projectDir);
        }
      }
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

  // Assignment recovery: reclaim orphaned/stalled tasks with bounded retries.
  const recoveredAssignments = recoverOrphanTasks('watchdog_tick');
  if (recoveredAssignments.length > 0) {
    const reassignedCount = recoveredAssignments.filter((entry) => entry.outcome === 'reassigned').length;
    const exhaustedCount = recoveredAssignments.filter((entry) => entry.outcome === 'failed_retry_exhausted').length;
    db.log('coordinator', 'stalled_assignment_recovery', {
      source: 'watchdog_tick',
      recovered_assignments: recoveredAssignments.length,
      reassigned: reassignedCount,
      retry_exhausted: exhaustedCount,
    });
  }

  // Keep failed requests visible to stale-integration recovery when remediation is active.
  recoverFailedRequestsWithActiveRemediation('watchdog_tick');

  // Recover stale tier-3 decomposed requests that never produced tasks.
  recoverStaleDecomposedRequests('watchdog_tick');

  // Reconcile lifecycle invariants: clear stale terminal metadata, advance
  // decomposed→in_progress when tasks exist, in_progress→integrating when all terminal.
  db.reconcileAllActiveRequests();

  // Recover stale integrations
  recoverStaleIntegrations(now);

  // Monitor persistent loops
  monitorLoops(projectDir);

  // Monitor research batches for timeout recovery
  monitorResearchBatches(now);

  // Periodic mail + log purge (once per hour)
  if (now - lastMailPurge > 3600000) {
    lastMailPurge = now;
    const purged = db.purgeOldMail(7);
    if (purged > 0) {
      db.log('coordinator', 'mail_purged', { count: purged });
    }
    const mergesPurged = db.purgeTerminalMerges(7);
    if (mergesPurged > 0) {
      db.log('coordinator', 'terminal_merges_purged', { count: mergesPurged });
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

function recoverStaleDecomposedRequests(source = 'watchdog_tick') {
  const repaired = db.recoverStaleDecomposedZeroTaskRequests({ source });
  return Array.isArray(repaired) ? repaired.length : 0;
}

function escalate(worker, staleSec, projectDir) {
  const THRESHOLDS = getThresholds();
  const windowName = `worker-${worker.id}`;
  const prevLevel = lastEscalationLevel.get(worker.id) || 0;

  if (staleSec >= THRESHOLDS.terminate) {
    // Level 4: Terminate and reassign
    // Fresh-output guard: if tmux pane output has changed since Level 3 triage,
    // the worker is still active despite the stale heartbeat — reset escalation
    // to avoid unnecessary task reassignment churn.
    if (tmux.isTmuxAvailable()) {
      const currentOutput = tmux.capturePane(windowName, 20);
      const currentHash = crypto.createHash('md5').update(currentOutput || '').digest('hex');
      const prevHash = lastOutputHash.get(worker.id);
      if (prevHash !== undefined && currentHash !== prevHash) {
        lastEscalationLevel.delete(worker.id);
        lastOutputHash.delete(worker.id);
        db.log('coordinator', 'watchdog_terminate_aborted', {
          worker_id: worker.id,
          stale_sec: staleSec,
          reason: 'fresh_output_detected',
        });
        return;
      }
      lastOutputHash.set(worker.id, currentHash);
    }
    db.log('coordinator', 'watchdog_terminate', {
      worker_id: worker.id,
      stale_sec: staleSec,
    });
    tmux.killWindow(windowName);
    handleDeath(worker, 'heartbeat_timeout');
    lastEscalationLevel.delete(worker.id);
    lastOutputHash.delete(worker.id);

  } else if (staleSec >= THRESHOLDS.triage && prevLevel < 3) {
    // Level 3: Triage — capture output, log for analysis (once per escalation)
    lastEscalationLevel.set(worker.id, 3);
    const output = tmux.capturePane(windowName, 20);
    // Seed lastOutputHash so Level 4 (60s later) has a valid baseline to compare against.
    // Without seeding here, prevHash is always undefined and the fresh-output guard is a no-op.
    lastOutputHash.set(worker.id, crypto.createHash('md5').update(output || '').digest('hex'));
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
  const assignedTaskId = worker.current_task_id;

  db.log('coordinator', 'worker_death', {
    worker_id: worker.id,
    reason,
    task_id: worker.current_task_id,
  });
  insightIngestion.ingestWatchdogEvent('worker_death', {
    worker_id: worker.id,
    task_id: worker.current_task_id,
    reason,
  });

  // Reset worker
  db.updateWorker(worker.id, {
    status: 'idle',
    current_task_id: null,
    claimed_by: null,
    claimed_at: null,
    pid: null,
    last_heartbeat: new Date().toISOString(),
  });

  if (Number.isInteger(assignedTaskId) && assignedTaskId > 0) {
    db.recoverStalledAssignments({
      source: 'watchdog_worker_death',
      task_id: assignedTaskId,
      worker_id: worker.id,
      include_heartbeat_stale: false,
      include_orphans: true,
      reason_override: `worker_death:${reason}`,
    });
  }
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
    // Claims expire by claimed_at age only. Missing claimed_at is treated as stale
    // so malformed/legacy rows cannot wedge allocator ownership forever.
    if (!worker.claimed_at) {
      db.releaseWorker(worker.id);
      db.log('coordinator', 'stale_claim_released', {
        worker_id: worker.id,
        reason: 'missing_claimed_at',
      });
      continue;
    }
    const staleSec = getAgeSeconds(now, worker.claimed_at, {
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

function recoverOrphanTasks(source = 'watchdog_tick') {
  return db.recoverStalledAssignments({
    source,
    include_orphans: true,
    include_heartbeat_stale: true,
    stale_threshold_sec: getThresholds().terminate,
  });
}

function hasActiveRemediationTasks(requestId) {
  const activeTasks = db.listTasks({ request_id: requestId }).filter(
    t => !['completed', 'failed'].includes(t.status)
  );
  return activeTasks.length > 0;
}

function getRequestReopenState(requestId) {
  const row = db.getDb().prepare(
    'SELECT COUNT(*) as count FROM merge_queue WHERE request_id = ?'
  ).get(requestId);
  const mergeQueueEntries = Number(row && row.count) || 0;
  return {
    status: mergeQueueEntries > 0 ? 'integrating' : 'in_progress',
    merge_queue_entries: mergeQueueEntries,
  };
}

function recoverFailedRequestsWithActiveRemediation(source = 'watchdog_tick') {
  const failedRequests = db.getDb().prepare(
    "SELECT id FROM requests WHERE status = 'failed'"
  ).all();

  for (const req of failedRequests) {
    if (!hasActiveRemediationTasks(req.id)) continue;
    const reopen = getRequestReopenState(req.id);
    db.updateRequest(req.id, { status: reopen.status });
    db.log('coordinator', 'request_reopened_for_active_remediation', {
      request_id: req.id,
      task_id: null,
      worker_id: null,
      trigger: 'watchdog-active-remediation',
      source,
      previous_status: 'failed',
      reopened_status: reopen.status,
      merge_queue_entries: reopen.merge_queue_entries,
    });
  }
}

function isWithinRemediationGraceWindow(now, requestId, merges, failureStatus, ageScope) {
  const oldestFailureAgeSec = merges
    .filter(m => m.status === failureStatus)
    .reduce((oldest, m) => {
      const ageSec = getAgeSeconds(now, m.updated_at || m.created_at, {
        request_id: requestId,
        merge_id: m.id,
        scope: ageScope,
      });
      if (ageSec === null) return oldest;
      return ageSec > oldest ? ageSec : oldest;
    }, 0);
  return oldestFailureAgeSec < MERGE_CONFLICT_GRACE_SEC;
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

    // Guard: treat 'failed' merges with functional_conflict: error prefix as conflict-type
    // so active fix tasks (conflict-remediation in progress) prevent premature request failure.
    const hasConflicts = freshMerges.some(
      m => m.status === 'conflict' ||
           (m.status === 'failed' && typeof m.error === 'string' && m.error.startsWith(FUNCTIONAL_CONFLICT_ERROR_PREFIX))
    );
    const allTerminal = freshMerges.every(m => ['merged', 'conflict', 'failed'].includes(m.status));
    if (!allTerminal) continue;

    const allMerged = freshMerges.every(m => m.status === 'merged');

    if (allMerged) {
      // Case 2: All merges succeeded — guard against non-terminal or failed sibling tasks
      const taskCompletion = db.checkRequestCompletion(req.id);
      if (taskCompletion.total > 0 && (!taskCompletion.all_done || taskCompletion.failed > 0)) {
        db.log('coordinator', 'stale_integration_gated', {
          request_id: req.id,
          reason: !taskCompletion.all_done ? 'non_terminal_tasks' : 'failed_tasks',
          total: taskCompletion.total,
          completed: taskCompletion.completed,
          failed: taskCompletion.failed,
        });
        continue;
      }
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
      insightIngestion.ingestWatchdogEvent('stale_integration_recovered', {
        request_id: req.id,
        reason: 'all_merged',
      });
    } else if (hasConflicts) {
      // Case 3: Merge conflicts — wait for allocator to create fix tasks
      // Check if there are active tasks that could be fix tasks from the allocator
      if (hasActiveRemediationTasks(req.id)) {
        // Fix tasks in progress — don't mark request as failed yet
        continue;
      }

      // No active tasks — give allocator a grace period to create fix tasks
      if (isWithinRemediationGraceWindow(now, req.id, freshMerges, 'conflict', 'conflict_age')) {
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
      if (hasActiveRemediationTasks(req.id)) {
        continue;
      }
      if (isWithinRemediationGraceWindow(now, req.id, freshMerges, 'failed', 'merge_failure_age')) {
        continue;
      }
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
      for (const failedMerge of failedMerges) {
        const sourceTask = failedMerge.task_id ? db.getTask(failedMerge.task_id) : null;
        db.sendMail('allocator', 'merge_failed', {
          request_id: req.id,
          merge_id: failedMerge.id,
          task_id: failedMerge.task_id,
          branch: failedMerge.branch,
          pr_url: failedMerge.pr_url,
          status: failedMerge.status,
          reason: 'stale_integration_terminal_failure',
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
          error: failedMerge.error || `Merge failed: ${failedMerge.status}`,
        });
      }
      db.log('coordinator', 'stale_integration_recovered', {
        request_id: req.id,
        reason: 'merge_failures',
        details,
      });
    }
  }

  return repairedRequests;
}

function respawnLoopSentinel(loop, projectDir, options = {}) {
  const { reason = 'unknown', forceRestart = false } = options;
  const path = require('path');
  const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
  const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');

  try {
    const ns = loop.namespace || process.env.MAC10_NAMESPACE || 'mac10';
    if (!loop.tmux_window) {
      // Non-tmux: spawn via execFile (matches index.js non-tmux launch strategy)
      const { execFile } = require('child_process');
      const child = execFile('bash', [sentinelPath, String(loop.id), projectDir], {
        cwd: projectDir,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, MAC10_NAMESPACE: ns },
      }, (err) => {
        if (err) db.log('coordinator', 'loop_respawn_error', {
          loop_id: loop.id,
          reason,
          forced_restart: false,
          error: err.message,
        });
      });
      if (child && typeof child.unref === 'function') child.unref();
      db.updateLoop(loop.id, { last_heartbeat: new Date().toISOString() });
      db.log('coordinator', 'loop_sentinel_respawned', {
        loop_id: loop.id,
        reason,
        forced_restart: false,
      });
      insightIngestion.ingestWatchdogEvent('loop_respawn', {
        loop_id: loop.id,
        reason,
        forced_restart: false,
      });
      return;
    }

    if (forceRestart) {
      tmux.killWindow(loop.tmux_window);
    }
    tmux.createWindow(loop.tmux_window, `MAC10_NAMESPACE="${ns}" bash "${sentinelPath}" ${loop.id} "${projectDir}"`, projectDir);
    db.updateLoop(loop.id, {
      tmux_session: tmux.SESSION,
      last_heartbeat: new Date().toISOString(),
    });
    db.log('coordinator', 'loop_sentinel_respawned', {
      loop_id: loop.id,
      reason,
      forced_restart: forceRestart,
    });
    insightIngestion.ingestWatchdogEvent('loop_respawn', {
      loop_id: loop.id,
      reason,
      forced_restart: forceRestart,
    });
  } catch (e) {
    db.log('coordinator', 'loop_respawn_error', {
      loop_id: loop.id,
      reason,
      forced_restart: forceRestart,
      error: e.message,
    });
  }
}

function monitorResearchBatches(now) {
  let runningBatches;
  try {
    runningBatches = db.getDb().prepare(
      "SELECT * FROM research_batches WHERE status = 'running'"
    ).all();
  } catch {
    return; // research_batches table may not exist yet
  }

  for (const batch of runningBatches) {
    const startedAt = batch.started_at || batch.updated_at;
    if (!startedAt) continue;
    const ageSec = getAgeSeconds(now, startedAt, {
      batch_id: batch.id,
      scope: 'research_batch_timeout',
    });
    if (ageSec === null) continue;
    const timeoutSec = (Number(batch.timeout_window_ms) || 120000) / 1000;
    if (ageSec <= timeoutSec) continue;

    // Batch has exceeded its timeout — fail running/planned stages so intents can retry
    let stages;
    try {
      stages = db.listResearchBatchStages(batch.id);
    } catch {
      continue;
    }
    const timeoutMsg = `Research batch timed out after ${Math.round(ageSec)}s (limit: ${timeoutSec}s)`;
    for (const stage of stages) {
      if (stage.status === 'running' || stage.status === 'planned') {
        try {
          db.markResearchBatchStage({
            stage_id: stage.id,
            status: 'partial_failed',
            error: timeoutMsg,
          });
        } catch {
          // Stage may already be in a terminal state
        }
      }
    }
    try {
      db.getDb().prepare(
        "UPDATE research_batches SET status = 'timed_out', last_error = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f','now') WHERE id = ?"
      ).run(timeoutMsg, batch.id);
    } catch {
      // Best-effort update
    }
    db.log('coordinator', 'research_batch_timeout', {
      batch_id: batch.id,
      age_sec: Math.round(ageSec),
      timeout_sec: timeoutSec,
    });
  }
}

function monitorLoops(projectDir) {
  const loops = db.listLoops('active');
  const now = Date.now();
  const loopStaleThresholdSec = getLoopHeartbeatStaleThresholdSec();

  for (const loop of loops) {
    if (!loop.tmux_window) {
      // Non-tmux loop: evaluate heartbeat age and relaunch if stale
      if (loop.last_heartbeat) {
        const staleSec = getAgeSeconds(now, loop.last_heartbeat, {
          loop_id: loop.id,
          scope: 'loop_heartbeat_age',
        });
        if (staleSec !== null && staleSec > loopStaleThresholdSec) {
          db.log('coordinator', 'loop_heartbeat_stale', {
            loop_id: loop.id,
            stale_sec: Math.round(staleSec),
            threshold_sec: loopStaleThresholdSec,
          });
          respawnLoopSentinel(loop, projectDir, { reason: 'stale_heartbeat', forceRestart: false });
        }
      }
      continue;
    }

    const paneAlive = tmux.isPaneAlive(loop.tmux_window);

    if (!paneAlive) {
      // Sentinel died — respawn it
      db.log('coordinator', 'loop_sentinel_dead', { loop_id: loop.id, window: loop.tmux_window });
      respawnLoopSentinel(loop, projectDir, { reason: 'tmux_pane_dead', forceRestart: false });
      continue;
    }

    // Stale heartbeat with a live pane means the sentinel is likely wedged; force restart.
    if (loop.last_heartbeat) {
      const staleSec = getAgeSeconds(now, loop.last_heartbeat, {
        loop_id: loop.id,
        scope: 'loop_heartbeat_age',
      });
      if (staleSec === null) continue;
      if (staleSec > loopStaleThresholdSec) {
        db.log('coordinator', 'loop_heartbeat_stale', {
          loop_id: loop.id,
          stale_sec: Math.round(staleSec),
          threshold_sec: loopStaleThresholdSec,
        });
        respawnLoopSentinel(loop, projectDir, { reason: 'stale_heartbeat', forceRestart: true });
      }
    }
  }
}

module.exports = {
  start,
  stop,
  tick,
  getThresholds,
  THRESHOLDS,
  LOOP_STALE_HEARTBEAT_SEC,
};
