'use strict';

const db = require('./db');
const tmux = require('./tmux');
const backend = require('./worker-backend');
const recovery = require('./recovery');
const insightIngestion = require('./insight-ingestion');

let intervalId = null;
let lastMailPurge = 0;
let startupRecoverySweepPending = true;

const TERMINATE_THRESHOLD_SEC = 180;
const LOOP_SENTINEL_HEARTBEAT_CADENCE_SEC = 30;
const LOOP_STALE_HEARTBEAT_MISSED_BEATS = 12;
const LOOP_STALE_HEARTBEAT_SEC =
  LOOP_SENTINEL_HEARTBEAT_CADENCE_SEC * LOOP_STALE_HEARTBEAT_MISSED_BEATS;
const SQLITE_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

// Keep THRESHOLDS for backward compatibility with tests that import it
const THRESHOLDS = Object.freeze({
  warn: 60,
  nudge: 90,
  triage: 120,
  terminate: TERMINATE_THRESHOLD_SEC,
});

function getTerminateThresholdSec() {
  const configured = parseInt(db.getConfig('watchdog_terminate_sec'));
  return configured > 0 ? configured : TERMINATE_THRESHOLD_SEC;
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
  const terminateThreshold = getTerminateThresholdSec();

  for (const worker of workers) {
    if (worker.status === 'idle') continue;

    // ZFC death detection: check if worker process is actually alive.
    if (backend.isAvailable()) {
      const windowName = `worker-${worker.id}`;
      const alive = backend.isWorkerAlive(windowName);

      if (!alive && worker.status !== 'idle' && worker.status !== 'completed_task') {
        handleDeath(worker, 'worker_process_dead');
        continue;
      }
    }

    // Skip workers just launched (grace period)
    if (worker.launched_at) {
      const launchedAgo = (now - new Date(worker.launched_at).getTime()) / 1000;
      if (launchedAgo < terminateThreshold) continue;
    }

    // Single-threshold heartbeat check for running/busy workers
    if (worker.status === 'running' || worker.status === 'busy') {
      if (worker.last_heartbeat) {
        const staleSec = (now - new Date(worker.last_heartbeat).getTime()) / 1000;
        if (staleSec >= terminateThreshold) {
          checkAndTerminate(worker, staleSec);
        }
      }
    }
    // Assigned workers are recovered by recoverOrphanTasks below

    // Check completed_task workers that haven't been reset
    if (worker.status === 'completed_task') {
      const completedAgo = worker.last_heartbeat
        ? (now - new Date(worker.last_heartbeat).getTime()) / 1000
        : terminateThreshold;
      if (completedAgo > 30) {
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

  // Requeue stale in_progress research items
  try {
    const requeued = db.requeueStaleResearch({ max_age_minutes: 30 });
    if (requeued.requeued > 0) {
      db.log('coordinator', 'research_stale_requeued', { count: requeued.requeued });
    }
  } catch {}

  // Reconcile lifecycle invariants
  db.reconcileAllActiveRequests();

  // Recover stale integrations (Cases 1-2 only)
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
    const mergesPurged = db.purgeTerminalMerges(7);
    if (mergesPurged > 0) {
      db.log('coordinator', 'terminal_merges_purged', { count: mergesPurged });
    }
    const logPurged = db.getDb().prepare(
      "DELETE FROM activity_log WHERE created_at < datetime('now', '-30 days')"
    ).run();
    if (logPurged.changes > 0) {
      db.log('coordinator', 'activity_log_purged', { count: logPurged.changes });
    }
  }
}

function checkAndTerminate(worker, staleSec) {
  const windowName = `worker-${worker.id}`;

  // If worker process is alive, the worker is probably just not sending heartbeats — log and skip
  if (backend.isAvailable()) {
    const alive = backend.isWorkerAlive(windowName);
    if (alive) {
      db.log('coordinator', 'watchdog_stale_but_alive', {
        worker_id: worker.id,
        stale_sec: staleSec,
      });
      return;
    }
  }

  // Worker is dead (or no backend available) — terminate
  db.log('coordinator', 'watchdog_terminate', {
    worker_id: worker.id,
    stale_sec: staleSec,
  });
  backend.killWorker(windowName);
  handleDeath(worker, 'heartbeat_timeout');
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
  const fatigued = db.getDb().prepare(
    "SELECT * FROM workers WHERE tasks_completed >= 6 AND status IN ('idle', 'completed_task')"
  ).all();

  for (const worker of fatigued) {
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
    stale_threshold_sec: getTerminateThresholdSec(),
  });
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

    // Case 1: No merge_queue entries and integrating > 15 minutes → complete
    if (merges.length === 0) {
      const integratingAge = getAgeSeconds(now, req.updated_at, {
        request_id: req.id,
        scope: 'integration_age',
      });
      if (integratingAge === null) continue;
      if (integratingAge > 900) {
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

    const allTerminal = merges.every(m => ['merged', 'conflict', 'failed'].includes(m.status));
    if (!allTerminal) continue;

    const allMerged = merges.every(m => m.status === 'merged');

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
      const result = `All ${merges.length} PR(s) merged successfully`;
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
    } else {
      // Cases 3-4 simplified: any terminal non-merged merges → fail the request, notify master-1
      const failedMerges = merges.filter(m => m.status !== 'merged');
      const details = failedMerges.map(m => `${m.branch}: ${m.status}${m.error ? ' - ' + m.error.slice(0, 100) : ''}`).join('; ');
      db.updateRequest(req.id, {
        status: 'failed',
        result: `Merge failures: ${details}`,
      });
      db.sendMail('master-1', 'request_failed', {
        request_id: req.id,
        error: `Merge failures: ${details}`,
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

function respawnLoopSentinel(loop, projectDir, options = {}) {
  const { reason = 'unknown', forceRestart = false } = options;
  const path = require('path');
  const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
  const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');

  try {
    const ns = loop.namespace || process.env.MAC10_NAMESPACE || 'mac10';
    if (!loop.tmux_window) {
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

function monitorLoops(projectDir) {
  const loops = db.listLoops('active');
  const now = Date.now();
  const loopStaleThresholdSec = getLoopHeartbeatStaleThresholdSec();

  for (const loop of loops) {
    if (!loop.tmux_window) {
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
      db.log('coordinator', 'loop_sentinel_dead', { loop_id: loop.id, window: loop.tmux_window });
      respawnLoopSentinel(loop, projectDir, { reason: 'tmux_pane_dead', forceRestart: false });
      continue;
    }

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

// getThresholds kept for backward compatibility
function getThresholds() {
  return {
    warn: 60,
    nudge: 90,
    triage: 120,
    terminate: getTerminateThresholdSec(),
  };
}

module.exports = {
  start,
  stop,
  tick,
  getThresholds,
  THRESHOLDS,
  LOOP_STALE_HEARTBEAT_SEC,
};
