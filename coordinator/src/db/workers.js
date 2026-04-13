'use strict';

function createWorkerRepository(context) {
  const {
    getDb,
    validateColumns,
    parsePositiveInt,
    coordinatorAgeMs,
    getConfig,
    sendMail,
    log,
    DEFAULT_STALLED_ASSIGNMENT_RECOVERY_SEC,
    DEFAULT_TASK_LIVENESS_MAX_REASSIGNMENTS,
  } = context;

  function registerWorker(id, worktreePath, branch) {
    getDb().prepare(`
      INSERT OR REPLACE INTO workers (id, worktree_path, branch, status)
      VALUES (?, ?, ?, 'idle')
    `).run(id, worktreePath, branch);
  }
  
  function getWorker(id) {
    return getDb().prepare('SELECT * FROM workers WHERE id = ?').get(id);
  }
  
  function updateWorker(id, fields) {
    validateColumns('workers', fields);
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(id);
    getDb().prepare(`UPDATE workers SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  
  function getIdleWorkers() {
    return getDb().prepare("SELECT * FROM workers WHERE status = 'idle' ORDER BY id").all();
  }
  
  function getAllWorkers() {
    return getDb().prepare('SELECT * FROM workers ORDER BY id').all();
  }
  
  function resolveStalledAssignmentRecoveryThresholdSec(explicitThresholdSec = null) {
    const parsedExplicit = parsePositiveInt(explicitThresholdSec);
    if (parsedExplicit !== null) return parsedExplicit;
    const configured = parsePositiveInt(getConfig('watchdog_stalled_assignment_sec'));
    if (configured !== null) return configured;
    const terminateThreshold = parsePositiveInt(getConfig('watchdog_terminate_sec'));
    if (terminateThreshold !== null) return terminateThreshold;
    return DEFAULT_STALLED_ASSIGNMENT_RECOVERY_SEC;
  }
  
  function resolveTaskLivenessMaxReassignments(explicitMaxReassignments = null) {
    const parsedExplicit = parsePositiveInt(explicitMaxReassignments);
    if (parsedExplicit !== null) return parsedExplicit;
    const configured = parsePositiveInt(getConfig('watchdog_task_reassign_limit'));
    if (configured !== null) return configured;
    return DEFAULT_TASK_LIVENESS_MAX_REASSIGNMENTS;
  }
  
  function resolveAssignmentLivenessAgeMs(assignment, nowMs) {
    const heartbeatAgeMs = coordinatorAgeMs(assignment.last_heartbeat, nowMs);
    const launchedAgeMs = coordinatorAgeMs(assignment.launched_at, nowMs);
    if (heartbeatAgeMs === null && launchedAgeMs === null) return null;
    if (heartbeatAgeMs === null) return launchedAgeMs;
    if (launchedAgeMs === null) return heartbeatAgeMs;
    return Math.min(heartbeatAgeMs, launchedAgeMs);
  }
  
  function normalizeRecoverySource(source, fallback = 'coordinator_recovery') {
    if (typeof source !== 'string') return fallback;
    const trimmed = source.trim();
    return trimmed || fallback;
  }
  
  function recoverStalledAssignments(options = {}) {
    const source = normalizeRecoverySource(options.source, 'coordinator_recovery');
    const nowMsCandidate = Number(options.now_ms);
    const nowMs = Number.isFinite(nowMsCandidate) ? nowMsCandidate : Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const includeHeartbeatStale = options.include_heartbeat_stale !== false;
    const includeOrphans = options.include_orphans !== false;
    const staleThresholdSec = resolveStalledAssignmentRecoveryThresholdSec(options.stale_threshold_sec);
    const maxReassignments = resolveTaskLivenessMaxReassignments(options.max_reassignments);
    const reasonOverride = typeof options.reason_override === 'string' && options.reason_override.trim()
      ? options.reason_override.trim()
      : null;
    const taskIdFilter = parsePositiveInt(options.task_id);
    const workerIdFilter = parsePositiveInt(options.worker_id);
  
    let sql = `
      SELECT
        t.id AS task_id,
        t.request_id,
        t.subject,
        t.domain,
        t.files,
        t.tier,
        t.status AS task_status,
        t.assigned_to,
        COALESCE(t.liveness_reassign_count, 0) AS liveness_reassign_count,
        w.id AS worker_id,
        w.status AS worker_status,
        w.current_task_id,
        w.last_heartbeat,
        w.launched_at
      FROM tasks t
      LEFT JOIN workers w ON w.id = t.assigned_to
      WHERE t.status IN ('assigned', 'in_progress')
        AND t.assigned_to IS NOT NULL
    `;
    const vals = [];
    if (taskIdFilter !== null) {
      sql += ' AND t.id = ?';
      vals.push(taskIdFilter);
    }
    if (workerIdFilter !== null) {
      sql += ' AND t.assigned_to = ?';
      vals.push(workerIdFilter);
    }
    sql += ' ORDER BY t.id ASC';
  
    const candidates = getDb().prepare(sql).all(...vals);
    if (!candidates.length) return [];
  
    const recovered = [];
    const tx = getDb().transaction((rows) => {
      const markReadyStmt = getDb().prepare(`
        UPDATE tasks
        SET
          status = 'ready',
          assigned_to = NULL,
          started_at = NULL,
          liveness_reassign_count = ?,
          liveness_last_reassign_at = ?,
          liveness_last_reassign_reason = ?,
          updated_at = datetime('now')
        WHERE id = ?
          AND assigned_to = ?
          AND status IN ('assigned', 'in_progress')
      `);
      const markFailedStmt = getDb().prepare(`
        UPDATE tasks
        SET
          status = 'failed',
          assigned_to = NULL,
          result = ?,
          completed_at = ?,
          liveness_last_reassign_at = ?,
          liveness_last_reassign_reason = ?,
          updated_at = datetime('now')
        WHERE id = ?
          AND assigned_to = ?
          AND status IN ('assigned', 'in_progress')
      `);
      const resetWorkerStmt = getDb().prepare(`
        UPDATE workers
        SET
          status = 'idle',
          current_task_id = NULL,
          claimed_by = NULL,
          claimed_at = NULL,
          pid = NULL,
          last_heartbeat = ?
        WHERE id = ?
          AND (current_task_id IS NULL OR current_task_id = ?)
          AND status IN ('assigned', 'busy', 'running', 'idle')
      `);
  
      for (const candidate of rows) {
        const taskId = Number(candidate.task_id);
        const assignedWorkerId = Number(candidate.assigned_to);
        const reassignCount = Number(candidate.liveness_reassign_count) || 0;
        const currentTaskId = parsePositiveInt(candidate.current_task_id);
        const workerStatus = String(candidate.worker_status || '').trim().toLowerCase();
        const livenessAgeMs = resolveAssignmentLivenessAgeMs(candidate, nowMs);
        const staleSec = livenessAgeMs === null ? null : livenessAgeMs / 1000;
        const hasWorkerRow = candidate.worker_id !== null && candidate.worker_id !== undefined;
  
        let reason = reasonOverride;
        if (!reason) {
          if (!hasWorkerRow) {
            reason = 'worker_missing';
          } else if (includeOrphans) {
            // Grace period: skip orphan detection if the worker's heartbeat is still
            // fresh.  When a sentinel resets a worker after the agent exits, the
            // heartbeat timestamp is updated to "now".  Without this guard the very
            // next watchdog tick would mark the task as orphaned before the allocator
            // has a chance to re-assign it.  A 60-second window covers the typical
            // sentinel restart + agent spin-up time.
            const orphanGraceSec = 60;
            const withinGracePeriod = staleSec !== null && staleSec < orphanGraceSec;
  
            if (workerStatus === 'idle' && currentTaskId !== taskId && !withinGracePeriod) {
              reason = 'worker_idle_orphan';
            } else if (currentTaskId !== null && currentTaskId !== taskId) {
              reason = 'worker_task_pointer_mismatch';
            }
          }
        }
        if (!reason && includeHeartbeatStale) {
          if (livenessAgeMs === null) {
            reason = 'missing_worker_liveness_anchor';
          } else if (staleSec >= staleThresholdSec) {
            reason = 'worker_liveness_stale';
          }
        }
        if (!reason) continue;
  
        const diagnosticsBase = {
          source,
          task_id: taskId,
          request_id: candidate.request_id,
          worker_id: hasWorkerRow ? Number(candidate.worker_id) : null,
          reason,
          stale_sec: staleSec === null ? null : Math.round(staleSec),
          stale_threshold_sec: staleThresholdSec,
          reassignment_count: reassignCount,
          max_reassignments: maxReassignments,
          task_status: candidate.task_status,
          worker_status: workerStatus || null,
          worker_current_task_id: currentTaskId,
        };
  
        if (reassignCount >= maxReassignments) {
          const failureResultText = `Liveness recovery exhausted after ${reassignCount} reassignments (${reason})`;
          const failResult = markFailedStmt.run(
            failureResultText,
            nowIso,
            nowIso,
            reason,
            taskId,
            assignedWorkerId
          );
          if (failResult.changes < 1) continue;
  
          if (hasWorkerRow && (currentTaskId === null || currentTaskId === taskId)) {
            resetWorkerStmt.run(nowIso, Number(candidate.worker_id), taskId);
          }
  
          const failedDetail = {
            ...diagnosticsBase,
            outcome: 'failed_retry_exhausted',
            result: failureResultText,
          };
          recovered.push(failedDetail);
          log('coordinator', 'task_liveness_retry_exhausted', failedDetail);
          sendMail('allocator', 'task_failed', {
            worker_id: hasWorkerRow ? Number(candidate.worker_id) : null,
            task_id: taskId,
            request_id: candidate.request_id,
            error: failureResultText,
            subject: candidate.subject || null,
            domain: candidate.domain || null,
            files: candidate.files || null,
            tier: candidate.tier || null,
            assigned_to: hasWorkerRow ? Number(candidate.worker_id) : null,
            original_task: {
              subject: candidate.subject || null,
              domain: candidate.domain || null,
              files: candidate.files || null,
              tier: candidate.tier || null,
              assigned_to: hasWorkerRow ? Number(candidate.worker_id) : null,
            },
          });
          continue;
        }
  
        const nextReassignCount = reassignCount + 1;
        const reassignResult = markReadyStmt.run(
          nextReassignCount,
          nowIso,
          reason,
          taskId,
          assignedWorkerId
        );
        if (reassignResult.changes < 1) continue;
  
        if (hasWorkerRow && (currentTaskId === null || currentTaskId === taskId)) {
          resetWorkerStmt.run(nowIso, Number(candidate.worker_id), taskId);
        }
  
        const recoveredDetail = {
          ...diagnosticsBase,
          outcome: 'reassigned',
          reassignment_count: nextReassignCount,
        };
        recovered.push(recoveredDetail);
        log('coordinator', 'task_liveness_recovered', recoveredDetail);
        if (reason === 'worker_idle_orphan' || reason === 'worker_task_pointer_mismatch') {
          log('coordinator', 'orphan_task_recovered', recoveredDetail);
        } else {
          log('coordinator', 'task_reassigned', recoveredDetail);
        }
      }
    });
    tx(candidates);
  
    return recovered;
  }
  
  function claimWorker(workerId, claimer) {
    const claimedAt = new Date().toISOString();
    const result = getDb().prepare(
      "UPDATE workers SET claimed_by = ?, claimed_at = ? WHERE id = ? AND status = 'idle' AND claimed_by IS NULL"
    ).run(claimer, claimedAt, workerId);
    return result.changes > 0;
  }
  
  function releaseWorker(workerId) {
    getDb().prepare('UPDATE workers SET claimed_by = NULL, claimed_at = NULL WHERE id = ?').run(workerId);
  }

  return {
    registerWorker,
    getWorker,
    updateWorker,
    getIdleWorkers,
    getAllWorkers,
    claimWorker,
    releaseWorker,
    recoverStalledAssignments,
  };
}

module.exports = { createWorkerRepository };
