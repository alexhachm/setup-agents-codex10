'use strict';

function createMergeQueueRepository(context) {
  const {
    getDb,
    validateColumns,
    parseCompletedTaskCursor,
    currentSqlTimestamp,
  } = context;

  const VALID_FAILURE_CLASSES = Object.freeze([
    'branch_identity_mismatch',
    'worktree_missing',
    'worktree_dirty',
    'remote_branch_missing',
    'remote_diverged',
    'gh_auth_or_network',
    'textual_merge_conflict',
    'validation_conflict',
  ]);

  function purgeTerminalMerges(days) {
    const result = getDb().prepare(
      `DELETE FROM merge_queue
       WHERE status IN ('failed', 'conflict')
         AND request_id IN (SELECT id FROM requests WHERE status IN ('completed', 'failed'))
         AND updated_at < datetime('now', '-' || ? || ' days')`
    ).run(days);
    return result.changes;
  }
  
  function enqueueMerge({ request_id, task_id, pr_url, branch, priority, completion_checkpoint = null }) {
    const normalizedPriority = Number.isInteger(priority) ? priority : 0;
    const parsedCheckpoint = parseCompletedTaskCursor(completion_checkpoint);
    const normalizedCheckpoint = parsedCheckpoint ? parsedCheckpoint.cursor : null;
    // Atomic dedup+insert scoped to request + PR identity ownership.
    // A request can refresh the same PR+branch entry across follow-up tasks.
    const result = getDb().prepare(`
      INSERT INTO merge_queue (request_id, task_id, pr_url, branch, priority, completion_checkpoint)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM merge_queue
        WHERE request_id = ? AND pr_url = ? AND branch = ?
      )
    `).run(request_id, task_id, pr_url, branch, normalizedPriority, normalizedCheckpoint, request_id, pr_url, branch);
    return {
      inserted: result.changes > 0,
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }
  
  function getNextMerge() {
    return getDb().prepare(`
      SELECT * FROM merge_queue WHERE status = 'pending'
      ORDER BY priority DESC, id ASC LIMIT 1
    `).get();
  }
  
  function updateMerge(id, fields) {
    validateColumns('merge_queue', fields);
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE merge_queue SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  
  function updateMergeIdentity(mergeId, { head_sha, worker_id, head_branch }) {
    const fields = {};
    if (head_sha !== undefined && head_sha !== null) fields.head_sha = String(head_sha).trim() || null;
    if (worker_id !== undefined && worker_id !== null) fields.worker_id = Number.parseInt(String(worker_id), 10) || null;
    if (head_branch !== undefined && head_branch !== null) {
      fields.branch = String(head_branch).trim() || null;
    }
    if (Object.keys(fields).length === 0) return;
    validateColumns('merge_queue', fields);
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(mergeId);
    getDb().prepare(`UPDATE merge_queue SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  
  function getMergeIdentity(mergeId) {
    return getDb().prepare(
      'SELECT id, request_id, task_id, pr_url, branch, head_sha, worker_id, failure_class, retry_count, fingerprint FROM merge_queue WHERE id = ?'
    ).get(mergeId) || null;
  }
  
  function updateMergeFailureClass(mergeId, failureClass) {
    if (failureClass !== null && !VALID_FAILURE_CLASSES.includes(failureClass)) {
      throw new Error(`Invalid failure_class: ${failureClass}`);
    }
    getDb().prepare(
      "UPDATE merge_queue SET failure_class = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(failureClass, mergeId);
  }
  
  function listRecoverableMerges(requestId) {
    return getDb().prepare(`
      SELECT mq.*
      FROM merge_queue mq
      LEFT JOIN merge_circuit_breaker mcb ON mcb.fingerprint = mq.fingerprint
      WHERE mq.request_id = ?
        AND mq.status IN ('pending', 'ready', 'conflict', 'failed')
        AND (mcb.tripped IS NULL OR mcb.tripped = 0)
      ORDER BY mq.priority DESC, mq.id ASC
    `).all(requestId);
  }
  
  function getOrCreateCircuitBreaker(fingerprint) {
    const existing = getDb().prepare(
      'SELECT * FROM merge_circuit_breaker WHERE fingerprint = ?'
    ).get(fingerprint);
    if (existing) return existing;
    getDb().prepare(
      `INSERT OR IGNORE INTO merge_circuit_breaker (fingerprint, failure_count, tripped, first_seen_at, last_seen_at)
       VALUES (?, 1, 0, datetime('now'), datetime('now'))`
    ).run(fingerprint);
    return getDb().prepare('SELECT * FROM merge_circuit_breaker WHERE fingerprint = ?').get(fingerprint);
  }
  
  function getMergeByFingerprint(fingerprint) {
    return getDb().prepare(
      'SELECT * FROM merge_circuit_breaker WHERE fingerprint = ?'
    ).get(fingerprint) || null;
  }
  
  function recordFailure(mergeId, failureClass, fingerprint, normalizedError) {
    if (failureClass !== null && !VALID_FAILURE_CLASSES.includes(failureClass)) {
      throw new Error(`Invalid failure_class: ${failureClass}`);
    }
    const now = currentSqlTimestamp();
  
    getDb().prepare(
      `UPDATE merge_queue
       SET failure_class = ?,
           fingerprint = ?,
           last_fingerprint_at = ?,
           retry_count = retry_count + 1,
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(failureClass, fingerprint, now, mergeId);
  
    getDb().prepare(
      `INSERT INTO merge_circuit_breaker (merge_queue_id, fingerprint, failure_count, tripped, first_seen_at, last_seen_at)
       VALUES (?, ?, 1, 0, ?, ?)
       ON CONFLICT(fingerprint) DO UPDATE SET
         failure_count = failure_count + 1,
         last_seen_at = excluded.last_seen_at,
         merge_queue_id = excluded.merge_queue_id`
    ).run(mergeId, fingerprint, now, now);
  
    const row = getDb().prepare('SELECT failure_count, tripped FROM merge_circuit_breaker WHERE fingerprint = ?').get(fingerprint);
    return { tripped: row ? row.tripped === 1 : false, failure_count: row ? row.failure_count : 1 };
  }
  
  function resetCircuitBreaker(fingerprint) {
    getDb().prepare(
      `UPDATE merge_circuit_breaker SET failure_count = 0, tripped = 0, last_seen_at = datetime('now') WHERE fingerprint = ?`
    ).run(fingerprint);
  }
  
  function incrementMetric(metricName) {
    getDb().prepare(
      `INSERT INTO merge_metrics (metric_name, metric_value, updated_at)
       VALUES (?, 1, datetime('now'))
       ON CONFLICT(metric_name) DO UPDATE SET
         metric_value = metric_value + 1,
         updated_at = datetime('now')`
    ).run(metricName);
  }
  
  function getMetrics() {
    return getDb().prepare('SELECT metric_name, metric_value, updated_at FROM merge_metrics ORDER BY metric_name ASC').all();
  }

  return {
    purgeTerminalMerges,
    enqueueMerge,
    getNextMerge,
    updateMerge,
    updateMergeIdentity,
    getMergeIdentity,
    updateMergeFailureClass,
    getMergeByFingerprint,
    recordFailure,
    resetCircuitBreaker,
    getOrCreateCircuitBreaker,
    incrementMetric,
    getMetrics,
    listRecoverableMerges,
  };
}

module.exports = { createMergeQueueRepository };
