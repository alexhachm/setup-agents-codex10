'use strict';

const db = require('./db');
const crypto = require('crypto');

// Relevance score lookup by event type
const EVENT_RELEVANCE_SCORES = {
  merge_success: 600,
  conflict_resolution_lesson: 800,
  merge_failed: 750,
  functional_conflict: 850,
  request_completed: 700,
  worker_death: 800,
  loop_respawn: 650,
  stale_integration_recovered: 600,
  research_batch_available: 400,
  merge_deferred: 300,
  task_recovered: 550,
};

const DEFAULT_RELEVANCE_SCORE = 500;
const INGESTION_SOURCE = 'lifecycle_ingestion';

/**
 * Compute a semantic fingerprint for deduplication.
 * Based on project_context_key, event_type, and semantic_key (not full payload),
 * so identical logical events in the same context are treated as duplicates.
 */
function computeSemanticFingerprint(project_context_key, event_type, semantic_key) {
  return crypto
    .createHash('sha256')
    .update(`${project_context_key}::${event_type}::${semantic_key}`)
    .digest('hex');
}

/**
 * Check if an insight with the given fingerprint already exists.
 * Returns the existing artifact if found, null otherwise.
 * Never throws.
 */
function findExistingInsight(project_context_key, event_type, fingerprint) {
  try {
    const existing = db.listInsightArtifacts({
      project_context_key,
      artifact_type: event_type,
      dedupe_fingerprint: fingerprint,
      limit: 1,
    });
    return existing.length > 0 ? existing[0] : null;
  } catch {
    return null;
  }
}

/**
 * Core insight ingestion function.
 *
 * Creates a new insight artifact if not a duplicate.
 * Returns:
 *   { created: true, id }          — new artifact persisted
 *   { created: false, duplicate, id } — identical insight already exists
 *   { created: false, error }      — ingestion failed (partial-failure-safe)
 *
 * Never throws — callers can always proceed regardless of ingestion outcome.
 *
 * @param {object} options
 * @param {string}  options.project_context_key  Domain/context key for the insight
 * @param {string}  options.event_type            Artifact type (event category)
 * @param {object}  options.payload               Full event data to persist
 * @param {string}  [options.semantic_key]        Key fields for dedup fingerprint
 * @param {string}  [options.request_id]          Originating request provenance
 * @param {number}  [options.task_id]             Originating task provenance
 * @param {string}  [options.run_id]              Originating run provenance
 * @param {boolean} [options.partial]             True if from an incomplete run
 * @param {number}  [options.relevance_score]     Override default relevance score
 */
function ingestInsight({
  project_context_key,
  event_type,
  payload,
  semantic_key,
  request_id = null,
  task_id = null,
  run_id = null,
  partial = false,
  relevance_score = null,
} = {}) {
  try {
    const contextKey = String(project_context_key || '').trim();
    if (!contextKey) {
      db.log('coordinator', 'insight_ingestion_failed', {
        event_type,
        error: 'missing project_context_key',
      });
      return { created: false, error: 'missing project_context_key' };
    }

    const semanticKey = String(semantic_key || event_type);
    const fingerprint = computeSemanticFingerprint(contextKey, event_type, semanticKey);

    // Deduplication: skip if an identical logical event was already ingested
    const existing = findExistingInsight(contextKey, event_type, fingerprint);
    if (existing) {
      return { created: false, duplicate: true, id: existing.id };
    }

    const score =
      relevance_score !== null
        ? relevance_score
        : (EVENT_RELEVANCE_SCORES[event_type] || DEFAULT_RELEVANCE_SCORE);

    const governanceMetadata = {
      ingested_at: new Date().toISOString(),
      ...(partial ? { partial: true, status_annotation: 'incomplete_run' } : {}),
    };

    const artifact = db.createInsightArtifact({
      project_context_key: contextKey,
      artifact_type: event_type,
      artifact_payload: payload,
      dedupe_fingerprint: fingerprint,
      relevance_score: score,
      request_id,
      task_id,
      run_id,
      source: INGESTION_SOURCE,
      validation_status: partial ? 'pending' : 'unvalidated',
      lineage_type: 'origin',
      governance_metadata: governanceMetadata,
    });

    return { created: true, id: artifact.id };
  } catch (e) {
    // Partial-failure safe: log the error but never propagate it to callers
    try {
      db.log('coordinator', 'insight_ingestion_failed', {
        event_type,
        project_context_key,
        error: e.message,
        partial,
      });
    } catch {
      // If even the log fails, stay silent — ingestion is best-effort
    }
    return { created: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Merger lifecycle events
// ---------------------------------------------------------------------------

/**
 * Ingest a merge lifecycle event (success, failure, conflict, request completion).
 * Called by merger.js after processing a merge queue entry.
 */
function ingestMergeEvent(eventType, data) {
  const { merge_id, request_id, task_id, branch, error, tier, result } = data || {};
  // Semantic key: per merge entry + outcome — deduplicates retries for the same merge
  const semanticKey = `merge_id:${merge_id}:event:${eventType}`;

  const payload = {
    event_type: eventType,
    merge_id,
    request_id,
    task_id,
    branch,
    ...(error != null ? { error: String(error).slice(0, 500) } : {}),
    ...(tier !== undefined ? { tier } : {}),
    ...(result !== undefined ? { result: String(result).slice(0, 500) } : {}),
  };

  return ingestInsight({
    project_context_key: 'coordinator:merge_lifecycle',
    event_type: eventType,
    payload,
    semantic_key: semanticKey,
    request_id: request_id || null,
    task_id: task_id || null,
  });
}

function ingestConflictResolutionLesson(data) {
  const { merge_id, request_id, task_id, branch, retry_count, prior_error } = data || {};
  const semanticKey = `merge_id:${merge_id}:conflict_resolved`;

  const payload = {
    event_type: 'conflict_resolution_lesson',
    merge_id,
    request_id,
    task_id,
    branch,
    retry_count,
    ...(prior_error != null ? { prior_error: String(prior_error).slice(0, 500) } : {}),
    resolved_at: new Date().toISOString(),
  };

  return ingestInsight({
    project_context_key: 'coordinator:merge_conflict_lessons',
    event_type: 'conflict_resolution_lesson',
    payload,
    semantic_key: semanticKey,
    request_id: request_id || null,
    task_id: task_id || null,
  });
}

// ---------------------------------------------------------------------------
// Watchdog lifecycle events
// ---------------------------------------------------------------------------

/**
 * Ingest a watchdog lifecycle event (worker death, loop respawn, integration recovery, etc.).
 * Called by watchdog.js at key recovery/escalation points.
 */
function ingestWatchdogEvent(eventType, data) {
  const { worker_id, task_id, reason, request_id, loop_id, run_id, batch_id } = data || {};

  let semanticKey;
  if (eventType === 'worker_death') {
    semanticKey = `worker:${worker_id}:task:${task_id}:reason:${reason}`;
  } else if (eventType === 'loop_respawn') {
    semanticKey = `loop:${loop_id}:reason:${reason}`;
  } else if (eventType === 'stale_integration_recovered') {
    semanticKey = `request:${request_id}:event:${eventType}`;
  } else if (eventType === 'research_batch_timeout') {
    semanticKey = `batch:${batch_id}:event:${eventType}`;
  } else {
    semanticKey = `${eventType}:worker:${worker_id || 'none'}:task:${task_id || 'none'}`;
  }

  // Shallow copy of data with long strings truncated for storage efficiency
  const payload = { event_type: eventType };
  if (data && typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      if (typeof val === 'string' && val.length > 500) {
        payload[key] = val.slice(0, 500);
      } else {
        payload[key] = val;
      }
    }
  }

  return ingestInsight({
    project_context_key: 'coordinator:watchdog_lifecycle',
    event_type: eventType,
    payload,
    semantic_key: semanticKey,
    request_id: request_id || null,
    task_id: task_id != null ? task_id : null,
    run_id: run_id || null,
  });
}

// ---------------------------------------------------------------------------
// Allocator lifecycle events
// ---------------------------------------------------------------------------

/**
 * Ingest an allocator lifecycle event (research batch available, etc.).
 * Called by allocator.js when notable scheduling signals occur.
 */
function ingestAllocatorEvent(eventType, data) {
  const { queued_intent_count, batch_id, run_id } = data || {};

  let semanticKey;
  if (eventType === 'research_batch_available') {
    // Bucket by count so bursts don't each produce a separate duplicate entry,
    // but meaningful scale changes still generate a new insight.
    const bucket =
      !queued_intent_count || queued_intent_count <= 5
        ? 'small'
        : queued_intent_count <= 20
        ? 'medium'
        : 'large';
    semanticKey = `${eventType}:count_bucket:${bucket}`;
  } else if (batch_id) {
    semanticKey = `${eventType}:batch:${batch_id}`;
  } else {
    // 1-minute time bucket prevents flooding while still capturing recurrence
    semanticKey = `${eventType}:ts:${Math.floor(Date.now() / 60000)}`;
  }

  const payload = {
    event_type: eventType,
    ...(data && typeof data === 'object' ? data : {}),
  };

  return ingestInsight({
    project_context_key: 'coordinator:allocator_lifecycle',
    event_type: eventType,
    payload,
    semantic_key: semanticKey,
    run_id: run_id || null,
  });
}

module.exports = {
  ingestInsight,
  ingestMergeEvent,
  ingestConflictResolutionLesson,
  ingestWatchdogEvent,
  ingestAllocatorEvent,
  // Exported for testing
  computeSemanticFingerprint,
};
