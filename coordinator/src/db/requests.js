'use strict';

function createRequestRepository(context) {
  const {
    getDb,
    crypto,
    validateColumns,
    shouldClearRequestCompletionMetadata,
    detectAutonomousRequestPayload,
    isTerminalRequestStatus,
    sendMail,
    log,
    getConfig,
    DEFAULT_STALE_DECOMPOSED_RECOVERY_SEC,
  } = context;

  function createRequest(description) {
    const autonomousPayload = detectAutonomousRequestPayload(description);
    if (autonomousPayload) {
      log('coordinator', 'request_rejected_autonomous_payload', {
        ...autonomousPayload,
        description_preview: String(description || '').replace(/\s+/g, ' ').slice(0, 240),
      });
      throw new Error(
        'Request description appears to be autonomous command-template payload; submit a concise issue request instead.'
      );
    }
  
    const id = 'req-' + crypto.randomBytes(4).toString('hex');
    const txn = getDb().transaction(() => {
      getDb().prepare(`
        INSERT INTO requests (id, description) VALUES (?, ?)
      `).run(id, description);
      sendMail('architect', 'new_request', { request_id: id, description });
      sendMail('master-1', 'request_acknowledged', { request_id: id, description });
      log('user', 'request_created', { request_id: id, description });
    });
    txn();
    return id;
  }
  
  function getRequest(id) {
    return getDb().prepare('SELECT * FROM requests WHERE id = ?').get(id);
  }
  
  function updateRequest(id, fields) {
    validateColumns('requests', fields);
    const normalizedFields = { ...fields };
    if (Object.prototype.hasOwnProperty.call(normalizedFields, 'status')) {
      const current = getDb().prepare('SELECT status FROM requests WHERE id = ?').get(id);
      const previousStatus = current && current.status ? current.status : null;
      if (shouldClearRequestCompletionMetadata(previousStatus, normalizedFields.status)) {
        normalizedFields.completed_at = null;
        normalizedFields.result = null;
      }
      // Auto-capture previous_status for observability unless caller explicitly provides it
      if (!Object.prototype.hasOwnProperty.call(normalizedFields, 'previous_status')) {
        normalizedFields.previous_status = previousStatus;
      }
    }
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(normalizedFields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  
  function listRequests(status) {
    if (status) return getDb().prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC').all(status);
    return getDb().prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
  }
  
  function resolveStaleDecomposedRecoveryThresholdSec(explicitThresholdSec = null) {
    const parsedExplicit = Number.parseInt(String(explicitThresholdSec ?? ''), 10);
    if (Number.isInteger(parsedExplicit) && parsedExplicit > 0) return parsedExplicit;
    const configured = Number.parseInt(String(getConfig('watchdog_triage_sec') || ''), 10);
    if (Number.isInteger(configured) && configured > 0) return configured;
    return DEFAULT_STALE_DECOMPOSED_RECOVERY_SEC;
  }
  
  function recoverStaleDecomposedZeroTaskRequests(options = {}) {
    const requestId = options && options.requestId !== undefined && options.requestId !== null
      ? String(options.requestId).trim()
      : '';
    const source = options && typeof options.source === 'string' && options.source.trim()
      ? options.source.trim()
      : 'coordinator_repair';
    const staleThresholdSec = resolveStaleDecomposedRecoveryThresholdSec(
      options ? options.stale_threshold_sec : null
    );
    const requestFilterSql = requestId ? 'AND r.id = ?' : '';
    const staleRows = getDb().prepare(`
      SELECT
        r.id AS request_id,
        r.status AS status,
        r.tier AS tier,
        COALESCE(
          CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', COALESCE(r.updated_at, r.created_at)) AS INTEGER),
          0
        ) AS stale_sec
      FROM requests r
      LEFT JOIN tasks t ON t.request_id = r.id
      WHERE r.status = 'decomposed'
        AND COALESCE(r.tier, 0) >= 3
        ${requestFilterSql}
      GROUP BY r.id
      HAVING COUNT(t.id) = 0
         AND COALESCE(
           CAST(strftime('%s', 'now') AS INTEGER) - CAST(strftime('%s', COALESCE(r.updated_at, r.created_at)) AS INTEGER),
           0
         ) >= ?
    `).all(...(requestId ? [requestId, staleThresholdSec] : [staleThresholdSec]));
    if (!staleRows.length) return [];
  
    const repaired = [];
    const tx = getDb().transaction((rows) => {
      const updateStmt = getDb().prepare(`
        UPDATE requests
        SET status = 'pending', updated_at = datetime('now')
        WHERE id = ?
          AND status = 'decomposed'
      `);
      for (const row of rows) {
        const updateResult = updateStmt.run(row.request_id);
        if (updateResult.changes < 1) continue;
        const staleSec = Number.parseInt(String(row.stale_sec), 10) || staleThresholdSec;
        const detail = {
          request_id: row.request_id,
          previous_status: 'decomposed',
          recovered_status: 'pending',
          stale_sec: staleSec,
          stale_threshold_sec: staleThresholdSec,
          source,
          reason: 'decomposed_zero_tasks_stale',
        };
        repaired.push(detail);
        log('coordinator', 'stale_decomposed_request_recovered', detail);
      }
    });
    tx(staleRows);
  
    return repaired;
  }
  
  function checkRequestCompletion(requestId, options = {}) {
    const recoverStale = !options || options.repair_stale_decomposed !== false;
    const repaired = recoverStale
      ? recoverStaleDecomposedZeroTaskRequests({
        requestId,
        source: options && options.source ? options.source : 'check_request_completion',
        stale_threshold_sec: options ? options.stale_threshold_sec : null,
      })
      : [];
    const request = getDb().prepare(`
      SELECT status
      FROM requests
      WHERE id = ?
    `).get(requestId);
    const requestStatus = request && request.status ? String(request.status) : null;
    const row = getDb().prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(SUM(CASE WHEN status = 'superseded' THEN 1 ELSE 0 END), 0) as superseded,
        COALESCE(SUM(CASE WHEN status = 'failed_needs_reroute' THEN 1 ELSE 0 END), 0) as rerouted,
        COALESCE(SUM(CASE WHEN status = 'failed_final' THEN 1 ELSE 0 END), 0) as failed_final,
        COALESCE(SUM(CASE WHEN status = 'failed' AND COALESCE(blocking, 1) != 0 THEN 1 ELSE 0 END), 0) as blocking_failed,
        COALESCE(SUM(CASE WHEN status = 'failed' AND COALESCE(blocking, 1) = 0 THEN 1 ELSE 0 END), 0) as nonblocking_failed
      FROM tasks WHERE request_id = ?
    `).get(requestId);
    const total = Number(row.total) || 0;
    const completed = Number(row.completed) || 0;
    const failed = Number(row.failed) || 0;
    const superseded = Number(row.superseded) || 0;
    const rerouted = Number(row.rerouted) || 0;
    const failedFinal = Number(row.failed_final) || 0;
    const blockingFailed = Number(row.blocking_failed) || 0;
    const nonblockingFailed = Number(row.nonblocking_failed) || 0;
    const hardFailures = blockingFailed + failedFinal;
    const terminal = completed + failed + superseded + rerouted + failedFinal;
    const zeroTaskCompleted = total === 0 && requestStatus === 'completed';
    const zeroTaskFailed = total === 0 && requestStatus === 'failed';
    const allCompleted = (total > 0 && completed === total) || zeroTaskCompleted;
    const allTerminal = total > 0 && terminal === total;
    const allFailed = (total > 0 && failed === total) || zeroTaskFailed;
    return {
      request_id: requestId,
      request_status: requestStatus,
      total,
      completed,
      failed,
      superseded,
      rerouted,
      failed_final: failedFinal,
      blocking_failed: blockingFailed,
      nonblocking_failed: nonblockingFailed,
      hard_failures: hardFailures,
      all_completed: allCompleted,
      all_terminal: allTerminal,
      all_done: allCompleted || allFailed,
      stale_decomposed_recovered: repaired.length > 0,
    };
  }
  
  function reconcileRequestLifecycle(requestId) {
    const request = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!request) return [];
  
    const changes = [];
  
    // Invariant 1: non-terminal requests must not carry terminal completion metadata.
    if (!isTerminalRequestStatus(request.status)) {
      if (request.completed_at !== null || request.result !== null) {
        const staleFields = {};
        if (request.completed_at !== null) staleFields.completed_at = null;
        if (request.result !== null) staleFields.result = null;
        staleFields.status_cause = 'reconcile_cleared_stale_terminal_metadata';
        getDb()
          .prepare(
            `UPDATE requests SET completed_at = NULL, result = NULL,
              status_cause = 'reconcile_cleared_stale_terminal_metadata',
              updated_at = datetime('now')
             WHERE id = ? AND status NOT IN ('completed','failed')`
          )
          .run(requestId);
        const detail = {
          type: 'cleared_stale_terminal_metadata',
          request_id: requestId,
          previous_status: request.status,
          had_completed_at: request.completed_at !== null,
          had_result: request.result !== null,
        };
        changes.push(detail);
        log('coordinator', 'reconcile_cleared_stale_terminal_metadata', detail);
      }
    }
  
    // Re-read to get current state after potential mutation above
    const current = getDb().prepare('SELECT * FROM requests WHERE id = ?').get(requestId);
    if (!current) return changes;
  
    // Invariant 2: 'in_progress' with all tasks in terminal state
    //   and no pending/running merges → advance to 'integrating' so the merger can
    //   evaluate completion.  This repairs requests that got stuck in 'in_progress'
    //   after their tasks finished but before the merger observed the transition.
    if (current.status === 'in_progress') {
      const taskStats = getDb()
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status IN ('completed','failed','superseded','failed_needs_reroute','failed_final') THEN 1 ELSE 0 END) AS terminal
           FROM tasks WHERE request_id = ?`
        )
        .get(requestId);
      const total = Number(taskStats.total) || 0;
      const terminal = Number(taskStats.terminal) || 0;
      if (total > 0 && terminal === total) {
        const activeMerges = getDb()
          .prepare(
            "SELECT COUNT(*) as cnt FROM merge_queue WHERE request_id = ? AND status IN ('pending','ready','merging')"
          )
          .get(requestId);
        if (Number(activeMerges.cnt) === 0) {
          updateRequest(requestId, {
            status: 'integrating',
            status_cause: 'reconcile_in_progress_all_tasks_terminal',
          });
          const detail = {
            type: 'advanced_in_progress_to_integrating',
            request_id: requestId,
            total_tasks: total,
            terminal_tasks: terminal,
          };
          changes.push(detail);
          log('coordinator', 'reconcile_advanced_in_progress_to_integrating', detail);
        }
      }
    }
  
    return changes;
  }
  
  function reconcileAllActiveRequests() {
    const activeRequests = getDb()
      .prepare("SELECT id FROM requests WHERE status NOT IN ('completed','failed')")
      .all();
    let totalChanges = 0;
    for (const req of activeRequests) {
      const changes = reconcileRequestLifecycle(req.id);
      totalChanges += changes.length;
    }
    return totalChanges;
  }

  return {
    createRequest,
    getRequest,
    updateRequest,
    listRequests,
    recoverStaleDecomposedZeroTaskRequests,
    checkRequestCompletion,
    reconcileRequestLifecycle,
    reconcileAllActiveRequests,
  };
}

module.exports = { createRequestRepository };
