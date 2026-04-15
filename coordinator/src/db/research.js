'use strict';

function createResearchRepository(context) {
  const {
    getDb,
    getConfig,
    log,
    currentSqlTimestamp,
    buildSqlInClause,
    normalizeResearchIntentPayload,
    normalizeResearchPriorityScore,
    normalizeResearchBatchSizeCap,
    normalizeResearchTimeoutWindowMs,
    normalizeResearchFanoutEntries,
    normalizeResearchDedupeFingerprint,
    normalizeResearchStatusList,
    normalizePositiveInt,
    DEFAULT_RESEARCH_BATCH_SIZE_CAP,
    DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS,
    DEFAULT_RESEARCH_CANDIDATE_LIMIT,
    RESEARCH_INTENT_ACTIVE_STATUSES,
    RESEARCH_INTENT_CANDIDATE_STATUSES,
    RESEARCH_INTENT_STAGE_ALLOWED_STATUSES,
    RESEARCH_INTENT_STAGE_ALLOWED_TRANSITIONS,
  } = context;

  function parseIntConfig(key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = getConfig(key);
    if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
    const parsed = Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  function getResearchIntent(id) {
    return getDb().prepare('SELECT * FROM research_intents WHERE id = ?').get(id);
  }

  function getResearchBatch(id) {
    return getDb().prepare('SELECT * FROM research_batches WHERE id = ?').get(id);
  }

  function listResearchBatchStages(batchId) {
    return getDb().prepare(`
      SELECT * FROM research_batch_stages
      WHERE batch_id = ?
      ORDER BY execution_order ASC, id ASC
    `).all(batchId);
  }

  function listResearchIntentFanout(intentId) {
    return getDb().prepare(`
      SELECT * FROM research_intent_fanout
      WHERE intent_id = ?
      ORDER BY fanout_key ASC, id ASC
    `).all(intentId);
  }

  function canTransitionResearchStageStatus(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return true;
    const allowed = RESEARCH_INTENT_STAGE_ALLOWED_TRANSITIONS[currentStatus];
    return Boolean(allowed && allowed.has(nextStatus));
  }

  function upsertResearchIntentFanoutMappings(intentId, fanoutEntries) {
    if (!Array.isArray(fanoutEntries) || fanoutEntries.length === 0) return;
    const d = getDb();
    const now = currentSqlTimestamp();
    const upsert = d.prepare(`
      INSERT INTO research_intent_fanout (
        intent_id, fanout_key, fanout_payload, status, updated_at
      ) VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(intent_id, fanout_key) DO UPDATE SET
        fanout_payload = COALESCE(excluded.fanout_payload, research_intent_fanout.fanout_payload),
        updated_at = excluded.updated_at
    `);
    for (const entry of fanoutEntries) {
      upsert.run(intentId, entry.fanout_key, entry.fanout_payload, now);
    }
  }

  function enqueueResearchIntent({
    request_id = null,
    task_id = null,
    intent_type = 'browser_research',
    intent_payload = null,
    dedupe_fingerprint = null,
    priority_score = null,
    priority = null,
    batch_size_cap = null,
    timeout_window_ms = null,
    fanout_targets = [],
  } = {}) {
    const normalizedIntentType = String(intent_type || 'browser_research').trim().toLowerCase() || 'browser_research';
    const normalizedPayload = normalizeResearchIntentPayload(intent_payload);
    const normalizedPriorityScore = normalizeResearchPriorityScore(priority_score ?? priority);
    const normalizedBatchSizeCap = normalizeResearchBatchSizeCap(batch_size_cap ?? DEFAULT_RESEARCH_BATCH_SIZE_CAP);
    const normalizedTimeoutWindowMs = normalizeResearchTimeoutWindowMs(timeout_window_ms ?? DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS);
    const normalizedFanoutTargets = normalizeResearchFanoutEntries(fanout_targets);
    const normalizedRequestId = request_id === null || request_id === undefined
      ? null
      : (String(request_id).trim() || null);
    const parsedTaskId = Number.parseInt(task_id, 10);
    const normalizedTaskId = Number.isInteger(parsedTaskId) && parsedTaskId > 0 ? parsedTaskId : null;
    const dedupeFingerprint = normalizeResearchDedupeFingerprint(
      normalizedIntentType,
      normalizedPayload,
      dedupe_fingerprint
    );
    const d = getDb();
    const now = currentSqlTimestamp();
    const statusPlaceholders = buildSqlInClause(RESEARCH_INTENT_ACTIVE_STATUSES);
    const activeIntentSql = `
      SELECT *
      FROM research_intents
      WHERE dedupe_fingerprint = ?
        AND intent_type = ?
        AND status IN (${statusPlaceholders})
      ORDER BY created_at ASC, id ASC
      LIMIT 1
    `;

    const result = d.transaction(() => {
      const active = d.prepare(activeIntentSql).get(
        dedupeFingerprint,
        normalizedIntentType,
        ...RESEARCH_INTENT_ACTIVE_STATUSES
      );
      if (active) {
        d.prepare(`
          UPDATE research_intents
          SET
            priority_score = CASE WHEN ? > priority_score THEN ? ELSE priority_score END,
            batch_size_cap = CASE
              WHEN batch_size_cap IS NULL OR batch_size_cap <= 0 THEN ?
              ELSE MIN(batch_size_cap, ?)
            END,
            timeout_window_ms = CASE
              WHEN timeout_window_ms IS NULL OR timeout_window_ms <= 0 THEN ?
              ELSE MIN(timeout_window_ms, ?)
            END,
            request_id = COALESCE(request_id, ?),
            task_id = COALESCE(task_id, ?),
            updated_at = ?
          WHERE id = ?
        `).run(
          normalizedPriorityScore,
          normalizedPriorityScore,
          normalizedBatchSizeCap,
          normalizedBatchSizeCap,
          normalizedTimeoutWindowMs,
          normalizedTimeoutWindowMs,
          normalizedRequestId,
          normalizedTaskId,
          now,
          active.id
        );
        upsertResearchIntentFanoutMappings(active.id, normalizedFanoutTargets);
        return {
          created: false,
          deduplicated: true,
          intent: getResearchIntent(active.id),
        };
      }

      const insertResult = d.prepare(`
        INSERT INTO research_intents (
          request_id,
          task_id,
          intent_type,
          intent_payload,
          dedupe_fingerprint,
          priority_score,
          batch_size_cap,
          timeout_window_ms,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
      `).run(
        normalizedRequestId,
        normalizedTaskId,
        normalizedIntentType,
        normalizedPayload,
        dedupeFingerprint,
        normalizedPriorityScore,
        normalizedBatchSizeCap,
        normalizedTimeoutWindowMs,
        now,
        now
      );
      const intentId = Number(insertResult.lastInsertRowid);
      upsertResearchIntentFanoutMappings(intentId, normalizedFanoutTargets);
      return {
        created: true,
        deduplicated: false,
        intent: getResearchIntent(intentId),
      };
    })();

    log('coordinator', result.deduplicated ? 'research_intent_deduplicated' : 'research_intent_enqueued', {
      intent_id: result.intent.id,
      request_id: normalizedRequestId,
      task_id: normalizedTaskId,
      dedupe_fingerprint: dedupeFingerprint,
      priority_score: normalizedPriorityScore,
      batch_size_cap: normalizedBatchSizeCap,
      timeout_window_ms: normalizedTimeoutWindowMs,
      fanout_count: normalizedFanoutTargets.length,
    });

    return {
      ...result,
      dedupe_fingerprint: dedupeFingerprint,
      fanout_count: normalizedFanoutTargets.length,
    };
  }

  function scoreResearchIntentCandidates({ statuses = RESEARCH_INTENT_CANDIDATE_STATUSES, limit = null } = {}) {
    const normalizedStatuses = normalizeResearchStatusList(statuses, RESEARCH_INTENT_CANDIDATE_STATUSES);
    if (!normalizedStatuses.length) return [];
    const configuredLimit = parseIntConfig(
      'research_batch_candidate_limit',
      DEFAULT_RESEARCH_CANDIDATE_LIMIT,
      { min: 1, max: 5000 }
    );
    const normalizedLimit = normalizePositiveInt(limit, configuredLimit, { min: 1, max: 5000 });
    const placeholders = buildSqlInClause(normalizedStatuses);
    const rows = getDb().prepare(`
      SELECT
        ri.*,
        COALESCE((julianday('now') - julianday(ri.created_at)) * 86400.0, 0) AS age_seconds,
        (ri.priority_score + COALESCE((julianday('now') - julianday(ri.created_at)) * 0.001, 0)) AS candidate_score
      FROM research_intents ri
      WHERE ri.status IN (${placeholders})
      ORDER BY
        candidate_score DESC,
        ri.priority_score DESC,
        datetime(ri.created_at) ASC,
        ri.id ASC
      LIMIT ?
    `).all(...normalizedStatuses, normalizedLimit);
    return rows.map((row, index) => ({
      ...row,
      execution_rank: index + 1,
    }));
  }

  function buildResearchPlanBatches(candidates, globalMaxBatchSize, globalTimeoutWindowMs) {
    const batches = [];
    let current = [];
    let currentBatchCap = globalMaxBatchSize;
    let currentTimeoutWindowMs = globalTimeoutWindowMs;

    const flushCurrent = () => {
      if (!current.length) return;
      const cursor = current.map((intent) => intent.id).join(',');
      batches.push({
        intents: current,
        effective_batch_size_cap: currentBatchCap,
        effective_timeout_window_ms: currentTimeoutWindowMs,
        sequence_cursor: cursor,
      });
      current = [];
      currentBatchCap = globalMaxBatchSize;
      currentTimeoutWindowMs = globalTimeoutWindowMs;
    };

    for (const candidate of candidates) {
      const intentBatchCap = normalizeResearchBatchSizeCap(candidate.batch_size_cap, globalMaxBatchSize);
      const intentTimeoutWindowMs = normalizeResearchTimeoutWindowMs(candidate.timeout_window_ms, globalTimeoutWindowMs);
      const nextBatchCap = Math.min(currentBatchCap, intentBatchCap, globalMaxBatchSize);
      const nextTimeoutWindowMs = Math.min(currentTimeoutWindowMs, intentTimeoutWindowMs, globalTimeoutWindowMs);

      if (current.length > 0 && (current.length + 1) > nextBatchCap) {
        flushCurrent();
      }

      currentBatchCap = Math.min(currentBatchCap, intentBatchCap, globalMaxBatchSize);
      currentTimeoutWindowMs = Math.min(currentTimeoutWindowMs, intentTimeoutWindowMs, globalTimeoutWindowMs);
      current.push(candidate);
    }

    flushCurrent();
    return batches;
  }

  function materializeResearchBatchPlan({
    planner_key = 'default',
    max_batch_size = null,
    timeout_window_ms = null,
    candidate_limit = null,
    candidate_statuses = RESEARCH_INTENT_CANDIDATE_STATUSES,
  } = {}) {
    const configuredMaxBatchSize = parseIntConfig(
      'research_batch_max_size',
      DEFAULT_RESEARCH_BATCH_SIZE_CAP,
      { min: 1, max: 1000 }
    );
    const configuredTimeoutWindowMs = parseIntConfig(
      'research_batch_timeout_ms',
      DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS,
      { min: 1000, max: 7 * 24 * 60 * 60 * 1000 }
    );
    const normalizedMaxBatchSize = normalizeResearchBatchSizeCap(max_batch_size, configuredMaxBatchSize);
    const normalizedTimeoutWindowMs = normalizeResearchTimeoutWindowMs(timeout_window_ms, configuredTimeoutWindowMs);
    const candidates = scoreResearchIntentCandidates({
      statuses: candidate_statuses,
      limit: candidate_limit,
    });
    if (!candidates.length) {
      return {
        planner_key: String(planner_key || 'default'),
        candidate_count: 0,
        batch_count: 0,
        batches: [],
      };
    }

    const plannedBatches = buildResearchPlanBatches(
      candidates,
      normalizedMaxBatchSize,
      normalizedTimeoutWindowMs
    );
    const normalizedPlannerKey = String(planner_key || 'default').trim() || 'default';
    const now = currentSqlTimestamp();
    const d = getDb();

    const persisted = d.transaction(() => {
      const batchRows = [];
      const insertBatch = d.prepare(`
        INSERT INTO research_batches (
          planner_key,
          status,
          max_batch_size,
          timeout_window_ms,
          planned_intent_count,
          sequence_cursor,
          created_at,
          updated_at
        ) VALUES (?, 'planned', ?, ?, ?, ?, ?, ?)
      `);
      const insertStage = d.prepare(`
        INSERT INTO research_batch_stages (
          batch_id,
          intent_id,
          stage_name,
          stage_order,
          execution_order,
          dedupe_fingerprint,
          priority_score,
          timeout_window_ms,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, 'intent_execution', 1, ?, ?, ?, ?, 'planned', ?, ?)
      `);
      const updateIntent = d.prepare(`
        UPDATE research_intents
        SET status = 'planned', latest_batch_id = ?, updated_at = ?, last_error = NULL
        WHERE id = ?
      `);
      const planFanout = d.prepare(`
        UPDATE research_intent_fanout
        SET
          planned_batch_id = ?,
          planned_stage_id = ?,
          status = CASE
            WHEN status IN ('completed', 'cancelled') THEN status
            ELSE 'planned'
          END,
          updated_at = ?
        WHERE intent_id = ?
      `);

      for (const batch of plannedBatches) {
        const batchInsert = insertBatch.run(
          normalizedPlannerKey,
          batch.effective_batch_size_cap,
          batch.effective_timeout_window_ms,
          batch.intents.length,
          batch.sequence_cursor,
          now,
          now
        );
        const batchId = Number(batchInsert.lastInsertRowid);
        const stageIds = [];
        const intentIds = [];

        for (let idx = 0; idx < batch.intents.length; idx += 1) {
          const intent = batch.intents[idx];
          const executionOrder = idx + 1;
          const stageTimeoutWindowMs = Math.min(
            batch.effective_timeout_window_ms,
            normalizeResearchTimeoutWindowMs(intent.timeout_window_ms, batch.effective_timeout_window_ms)
          );
          const stageInsert = insertStage.run(
            batchId,
            intent.id,
            executionOrder,
            intent.dedupe_fingerprint,
            intent.priority_score,
            stageTimeoutWindowMs,
            now,
            now
          );
          const stageId = Number(stageInsert.lastInsertRowid);
          updateIntent.run(batchId, now, intent.id);
          planFanout.run(batchId, stageId, now, intent.id);
          stageIds.push(stageId);
          intentIds.push(intent.id);
        }

        batchRows.push({
          batch_id: batchId,
          intent_ids: intentIds,
          stage_ids: stageIds,
          sequence_cursor: batch.sequence_cursor,
          max_batch_size: batch.effective_batch_size_cap,
          timeout_window_ms: batch.effective_timeout_window_ms,
        });
      }
      return batchRows;
    })();

    log('coordinator', 'research_batch_plan_materialized', {
      planner_key: normalizedPlannerKey,
      candidate_count: candidates.length,
      batch_count: persisted.length,
      batch_ids: persisted.map((batch) => batch.batch_id),
    });
    return {
      planner_key: normalizedPlannerKey,
      candidate_count: candidates.length,
      batch_count: persisted.length,
      batches: persisted,
    };
  }

  function markResearchBatchStage({
    stage_id = null,
    status = null,
    error = null,
    completed_fanout_keys = [],
    failed_fanout_keys = [],
  } = {}) {
    const stageId = Number.parseInt(stage_id, 10);
    if (!Number.isInteger(stageId) || stageId <= 0) {
      throw new Error('stage_id must be a positive integer');
    }
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (!RESEARCH_INTENT_STAGE_ALLOWED_STATUSES.includes(normalizedStatus)) {
      throw new Error(`Invalid research stage status: ${status}`);
    }
    const completedFanoutEntries = normalizeResearchFanoutEntries(completed_fanout_keys);
    const failedFanoutEntries = normalizeResearchFanoutEntries(failed_fanout_keys);
    const completedFanoutKeys = completedFanoutEntries.map((entry) => entry.fanout_key);
    const failedFanoutKeys = failedFanoutEntries.map((entry) => entry.fanout_key);
    const now = currentSqlTimestamp();
    const d = getDb();
    const stageResult = d.transaction(() => {
      const stage = d.prepare(`
        SELECT * FROM research_batch_stages WHERE id = ?
      `).get(stageId);
      if (!stage) throw new Error(`research_batch_stage ${stageId} not found`);
      const currentStatus = String(stage.status || '').trim().toLowerCase() || 'planned';
      if (!canTransitionResearchStageStatus(currentStatus, normalizedStatus)) {
        throw new Error(`Invalid research stage transition from "${currentStatus}" to "${normalizedStatus}"`);
      }

      const updateFanoutStatus = (keys, nextStatus, errorValue) => {
        if (!keys.length) return;
        const placeholders = buildSqlInClause(keys);
        d.prepare(`
          UPDATE research_intent_fanout
          SET
            status = ?,
            attempt_count = attempt_count + 1,
            last_error = ?,
            completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
            updated_at = ?
          WHERE intent_id = ?
            AND fanout_key IN (${placeholders})
        `).run(
          nextStatus,
          errorValue,
          nextStatus,
          now,
          now,
          stage.intent_id,
          ...keys
        );
      };

      updateFanoutStatus(completedFanoutKeys, 'completed', null);
      updateFanoutStatus(failedFanoutKeys, 'partial_failed', error ? String(error) : null);

      if (
        !completedFanoutKeys.length &&
        !failedFanoutKeys.length &&
        (normalizedStatus === 'partial_failed' || normalizedStatus === 'failed')
      ) {
        d.prepare(`
          UPDATE research_intent_fanout
          SET
            status = 'partial_failed',
            attempt_count = attempt_count + 1,
            last_error = ?,
            updated_at = ?
          WHERE intent_id = ?
            AND status IN ('pending', 'planned', 'running')
        `).run(error ? String(error) : null, now, stage.intent_id);
      }

      const fanoutSummary = d.prepare(`
        SELECT
          COUNT(*) AS total_count,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
          COALESCE(SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END), 0) AS unresolved_count
        FROM research_intent_fanout
        WHERE intent_id = ?
      `).get(stage.intent_id);
      const totalFanoutCount = Number(fanoutSummary.total_count) || 0;
      const completedFanoutCount = Number(fanoutSummary.completed_count) || 0;
      const unresolvedFanoutCount = Number(fanoutSummary.unresolved_count) || 0;

      let resolvedStageStatus = normalizedStatus;
      if (
        (normalizedStatus === 'completed' || normalizedStatus === 'failed') &&
        unresolvedFanoutCount > 0
      ) {
        resolvedStageStatus = 'partial_failed';
      }
      if (resolvedStageStatus === 'failed' && totalFanoutCount > 0) {
        resolvedStageStatus = 'partial_failed';
      }

      const stageFailureIncrement = resolvedStageStatus === 'partial_failed' || resolvedStageStatus === 'failed'
        ? 1
        : 0;
      d.prepare(`
        UPDATE research_batch_stages
        SET
          status = ?,
          last_error = ?,
          failure_count = failure_count + ?,
          updated_at = ?,
          completed_at = CASE
            WHEN ? IN ('completed', 'failed', 'cancelled', 'partial_failed') THEN ?
            ELSE completed_at
          END
        WHERE id = ?
      `).run(
        resolvedStageStatus,
        error ? String(error) : null,
        stageFailureIncrement,
        now,
        resolvedStageStatus,
        now,
        stageId
      );

      let nextIntentStatus = 'planned';
      if (resolvedStageStatus === 'running') {
        nextIntentStatus = 'running';
      } else if (resolvedStageStatus === 'cancelled') {
        nextIntentStatus = 'cancelled';
      } else if (resolvedStageStatus === 'completed') {
        nextIntentStatus = 'completed';
      } else if (resolvedStageStatus === 'failed' || resolvedStageStatus === 'partial_failed') {
        nextIntentStatus = unresolvedFanoutCount > 0 ? 'partial_failed' : 'failed';
        if (resolvedStageStatus === 'partial_failed' && unresolvedFanoutCount === 0) {
          nextIntentStatus = 'completed';
        }
      }
      if (totalFanoutCount > 0 && completedFanoutCount === totalFanoutCount) {
        nextIntentStatus = 'completed';
      }
      if (totalFanoutCount > 0 && unresolvedFanoutCount > 0 && nextIntentStatus === 'completed') {
        nextIntentStatus = 'partial_failed';
      }

      const intentFailureIncrement = nextIntentStatus === 'partial_failed' || nextIntentStatus === 'failed'
        ? 1
        : 0;
      d.prepare(`
        UPDATE research_intents
        SET
          status = ?,
          failure_count = failure_count + ?,
          last_error = ?,
          updated_at = ?,
          resolved_at = CASE
            WHEN ? IN ('completed', 'cancelled') THEN ?
            ELSE NULL
          END
        WHERE id = ?
      `).run(
        nextIntentStatus,
        intentFailureIncrement,
        error ? String(error) : null,
        now,
        nextIntentStatus,
        now,
        stage.intent_id
      );

      const batchSummary = d.prepare(`
        SELECT
          COUNT(*) AS total_count,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_count,
          COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS running_count,
          COALESCE(SUM(CASE WHEN status = 'planned' THEN 1 ELSE 0 END), 0) AS planned_count,
          COALESCE(SUM(CASE WHEN status = 'partial_failed' THEN 1 ELSE 0 END), 0) AS partial_failed_count,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_count,
          COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_count
        FROM research_batch_stages
        WHERE batch_id = ?
      `).get(stage.batch_id);

      let nextBatchStatus = 'planned';
      const totalCount = Number(batchSummary.total_count) || 0;
      const completedCount = Number(batchSummary.completed_count) || 0;
      const runningCount = Number(batchSummary.running_count) || 0;
      const plannedCount = Number(batchSummary.planned_count) || 0;
      const partialFailedCount = Number(batchSummary.partial_failed_count) || 0;
      const failedCount = Number(batchSummary.failed_count) || 0;
      const cancelledCount = Number(batchSummary.cancelled_count) || 0;
      if (totalCount > 0 && completedCount === totalCount) {
        nextBatchStatus = 'completed';
      } else if (partialFailedCount > 0 || failedCount > 0) {
        nextBatchStatus = 'partial_failed';
      } else if (runningCount > 0) {
        nextBatchStatus = 'running';
      } else if (cancelledCount === totalCount && totalCount > 0) {
        nextBatchStatus = 'cancelled';
      } else if (plannedCount === totalCount && totalCount > 0) {
        nextBatchStatus = 'planned';
      }

      d.prepare(`
        UPDATE research_batches
        SET
          status = ?,
          last_error = ?,
          started_at = CASE
            WHEN ? = 'running' AND started_at IS NULL THEN ?
            ELSE started_at
          END,
          completed_at = CASE
            WHEN ? IN ('completed', 'failed', 'partial_failed', 'timed_out', 'cancelled') THEN ?
            ELSE completed_at
          END,
          updated_at = ?
        WHERE id = ?
      `).run(
        nextBatchStatus,
        error ? String(error) : null,
        nextBatchStatus,
        now,
        nextBatchStatus,
        now,
        now,
        stage.batch_id
      );

      return {
        stage: getDb().prepare('SELECT * FROM research_batch_stages WHERE id = ?').get(stageId),
        intent: getResearchIntent(stage.intent_id),
        batch: getResearchBatch(stage.batch_id),
        unresolved_fanout_count: unresolvedFanoutCount,
        total_fanout_count: totalFanoutCount,
      };
    })();

    log('coordinator', 'research_batch_stage_marked', {
      stage_id: stageResult.stage.id,
      batch_id: stageResult.batch.id,
      intent_id: stageResult.intent.id,
      status: stageResult.stage.status,
      unresolved_fanout_count: stageResult.unresolved_fanout_count,
    });
    return stageResult;
  }

  function getResearchQueueItems({ status = null, topic = null, limit = 50 } = {}) {
    const d = getDb();
    const conditions = [];
    const params = [];
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (topic) {
      conditions.push("json_extract(intent_payload, '$.topic') = ?");
      params.push(topic);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT *, json_extract(intent_payload, '$.topic') AS topic,
             json_extract(intent_payload, '$.question') AS question,
             json_extract(intent_payload, '$.mode') AS mode
      FROM research_intents
      ${where}
      ORDER BY priority_score DESC, created_at ASC, id ASC
      LIMIT ?
    `;
    params.push(limit);
    return d.prepare(sql).all(...params);
  }

  function startResearchItem(id) {
    const now = currentSqlTimestamp();
    const result = getDb().prepare(
      "UPDATE research_intents SET status = 'running', updated_at = ? WHERE id = ? AND status = 'queued'"
    ).run(now, id);
    return result.changes > 0;
  }

  function completeResearchItem(intentId, resultText) {
    const now = currentSqlTimestamp();
    const result = getDb().prepare(
      "UPDATE research_intents SET status = 'completed', resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'running'"
    ).run(now, now, intentId);
    return result.changes > 0;
  }

  function failResearchItem(intentId, error) {
    const now = currentSqlTimestamp();
    const result = getDb().prepare(
      "UPDATE research_intents SET status = 'failed', last_error = ?, failure_count = failure_count + 1, resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'running'"
    ).run(error || null, now, now, intentId);
    return result.changes > 0;
  }

  function requeueFailedResearch({ topic = null, include_running = false } = {}) {
    const d = getDb();
    const now = currentSqlTimestamp();
    const statuses = include_running ? ['failed', 'running'] : ['failed'];
    const statusPlaceholders = buildSqlInClause(statuses);
    const conditions = [`status IN (${statusPlaceholders})`];
    const params = [...statuses];
    if (topic) {
      conditions.push("json_extract(intent_payload, '$.topic') = ?");
      params.push(topic);
    }
    const where = conditions.join(' AND ');
    const items = d.prepare(`SELECT id FROM research_intents WHERE ${where}`).all(...params);
    const ids = items.map(r => r.id);
    if (ids.length > 0) {
      const placeholders = buildSqlInClause(ids);
      d.prepare(
        `UPDATE research_intents SET status = 'queued', failure_count = 0, last_error = NULL, resolved_at = NULL, updated_at = ? WHERE id IN (${placeholders})`
      ).run(now, ...ids);
    }
    return { requeued_count: ids.length, ids };
  }

  function requeueStaleResearch({ max_age_minutes = 60 } = {}) {
    const d = getDb();
    const now = currentSqlTimestamp();
    const stale = d.prepare(
      "SELECT id FROM research_intents WHERE status = 'running' AND updated_at < datetime('now', '-' || ? || ' minutes')"
    ).all(max_age_minutes);
    const ids = stale.map(r => r.id);
    if (ids.length > 0) {
      const placeholders = buildSqlInClause(ids);
      d.prepare(
        `UPDATE research_intents SET status = 'queued', updated_at = ? WHERE id IN (${placeholders})`
      ).run(now, ...ids);
    }
    return { requeued_count: ids.length, ids };
  }

  return {
    enqueueResearchIntent,
    getResearchIntent,
    scoreResearchIntentCandidates,
    materializeResearchBatchPlan,
    getResearchQueueItems,
    startResearchItem,
    completeResearchItem,
    failResearchItem,
    requeueFailedResearch,
    requeueStaleResearch,
    getResearchBatch,
    listResearchBatchStages,
    listResearchIntentFanout,
    markResearchBatchStage,
  };
}

module.exports = { createResearchRepository };
