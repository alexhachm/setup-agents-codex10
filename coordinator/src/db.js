'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db = null;
const NAMESPACE = process.env.MAC10_NAMESPACE || 'mac10';
const SQLITE_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/;
const ISO_TIMESTAMP_WITHOUT_ZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const LOOP_REQUEST_RATE_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_LOOP_REQUEST_RETRY_AFTER_SEC = 3600;
const DEFAULT_LOOP_REQUEST_SIMILARITY_THRESHOLD = 0.82;
const LOOP_REQUEST_SIMILAR_RECENT_WINDOW_HOURS = 6;
const LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT = 50;
const DEFAULT_STALE_DECOMPOSED_RECOVERY_SEC = 120;
const DEFAULT_STALLED_ASSIGNMENT_RECOVERY_SEC = 180;
const DEFAULT_TASK_LIVENESS_MAX_REASSIGNMENTS = 2;
const REQUEST_TERMINAL_STATUSES = new Set(['completed', 'failed']);
const TASK_PRIORITY_RANK = Object.freeze({ urgent: 0, high: 1, normal: 2, low: 3 });
const PRIORITY_OVERRIDE_MARKER_RE = /\bpriority\s+override\b/i;
const REQUEST_ID_TOKEN_RE = /\breq-[a-f0-9]{8}\b/gi;
const AUTONOMOUS_REQUEST_SIGNATURES = Object.freeze([
  Object.freeze({ id: 'master2_header', pattern: /You are \*\*Master-2: Architect\*\*/i }),
  Object.freeze({ id: 'worker_header', pattern: /You are a coding worker in the (?:mac10|codex10) multi-agent system/i }),
  Object.freeze({ id: 'protocol_exact', pattern: /Follow this protocol exactly\./i }),
  Object.freeze({ id: 'internal_counters', pattern: /^##\s+Internal Counters\b/m }),
  Object.freeze({ id: 'step1_startup', pattern: /^##\s+Step 1: Startup\b/m }),
  Object.freeze({ id: 'phase_followup', pattern: /^##\s+Phase: Follow-Up Check\b/m }),
  Object.freeze({ id: 'phase_reset_exit', pattern: /^##\s+Phase: Budget\/Reset Exit\b/m }),
  Object.freeze({ id: 'slash_architect_loop', pattern: /\/architect-loop\b/i }),
  Object.freeze({ id: 'slash_worker_loop', pattern: /\/worker-loop\b/i }),
  Object.freeze({ id: 'slash_allocate_loop', pattern: /\/allocate-loop\b/i }),
]);
const BROWSER_OFFLOAD_STATUS_SEQUENCE = Object.freeze([
  'not_requested',
  'requested',
  'queued',
  'launching',
  'attached',
  'running',
  'awaiting_callback',
  'completed',
  'failed',
  'cancelled',
]);
const BROWSER_OFFLOAD_ALLOWED_TRANSITIONS = Object.freeze({
  not_requested: new Set(['requested']),
  requested: new Set(['queued', 'failed', 'cancelled']),
  queued: new Set(['launching', 'failed', 'cancelled']),
  launching: new Set(['attached', 'failed', 'cancelled']),
  attached: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['awaiting_callback', 'failed', 'cancelled']),
  awaiting_callback: new Set(['completed', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
});
const DEFAULT_RESEARCH_PRIORITY_SCORE = 500;
const DEFAULT_RESEARCH_BATCH_SIZE_CAP = 5;
const DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS = 120000;
const DEFAULT_RESEARCH_CANDIDATE_LIMIT = 200;
const RESEARCH_PRIORITY_LABEL_SCORES = Object.freeze({
  urgent: 1000,
  high: 800,
  normal: 500,
  low: 200,
});
const RESEARCH_INTENT_CANDIDATE_STATUSES = Object.freeze(['queued', 'partial_failed']);
const RESEARCH_INTENT_ACTIVE_STATUSES = Object.freeze([
  'queued',
  'planned',
  'running',
  'partial_failed',
]);
const RESEARCH_INTENT_STAGE_ALLOWED_STATUSES = Object.freeze([
  'planned',
  'running',
  'completed',
  'partial_failed',
  'failed',
  'cancelled',
]);
const RESEARCH_INTENT_STAGE_ALLOWED_TRANSITIONS = Object.freeze({
  planned: new Set(['running', 'completed', 'partial_failed', 'failed', 'cancelled']),
  running: new Set(['completed', 'partial_failed', 'failed', 'cancelled']),
  partial_failed: new Set(['planned', 'running', 'completed', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
});
const PROJECT_MEMORY_VALIDATION_STATUSES = Object.freeze([
  'unvalidated',
  'pending',
  'validated',
  'rejected',
  'superseded',
]);
const PROJECT_MEMORY_LINEAGE_TYPES = Object.freeze([
  'origin',
  'derived_from',
  'supports',
  'supersedes',
  'validated_by',
  'consumed_by',
]);

function normalizeRequestLifecycleStatus(status) {
  if (status === null || status === undefined) return null;
  const normalized = String(status).trim().toLowerCase();
  return normalized || null;
}

function isTerminalRequestStatus(status) {
  const normalized = normalizeRequestLifecycleStatus(status);
  return normalized !== null && REQUEST_TERMINAL_STATUSES.has(normalized);
}

function shouldClearRequestCompletionMetadata(previousStatus, nextStatus) {
  const normalizedNext = normalizeRequestLifecycleStatus(nextStatus);
  if (normalizedNext === null) return false;
  return isTerminalRequestStatus(previousStatus) && !isTerminalRequestStatus(normalizedNext);
}

function currentSqlTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'null';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}

function normalizeStructuredPayload(payload, fallback = '{}') {
  if (payload === null || payload === undefined) return fallback;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return fallback;
    try {
      return stableStringify(JSON.parse(trimmed));
    } catch {
      return stableStringify(trimmed);
    }
  }
  return stableStringify(payload);
}

function normalizeResearchIntentPayload(payload) {
  return normalizeStructuredPayload(payload, '{}');
}

function normalizeResearchPriorityScore(score) {
  if (score === null || score === undefined || score === '') return DEFAULT_RESEARCH_PRIORITY_SCORE;
  if (typeof score === 'string') {
    const label = score.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(RESEARCH_PRIORITY_LABEL_SCORES, label)) {
      return RESEARCH_PRIORITY_LABEL_SCORES[label];
    }
  }
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return DEFAULT_RESEARCH_PRIORITY_SCORE;
  return Math.max(0, numeric);
}

function normalizePositiveInt(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function normalizeResearchBatchSizeCap(value, fallback = DEFAULT_RESEARCH_BATCH_SIZE_CAP) {
  return normalizePositiveInt(value, fallback, { min: 1, max: 1000 });
}

function normalizeResearchTimeoutWindowMs(value, fallback = DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS) {
  return normalizePositiveInt(value, fallback, { min: 1000, max: 7 * 24 * 60 * 60 * 1000 });
}

function normalizeResearchStatusList(statuses, fallback = RESEARCH_INTENT_CANDIDATE_STATUSES) {
  const list = Array.isArray(statuses) ? statuses : fallback;
  const normalized = [];
  for (const status of list) {
    const value = String(status || '').trim().toLowerCase();
    if (!value) continue;
    normalized.push(value);
  }
  return [...new Set(normalized)];
}

function normalizeResearchFanoutEntries(fanoutTargets) {
  if (fanoutTargets === null || fanoutTargets === undefined) return [];
  if (!Array.isArray(fanoutTargets)) {
    throw new Error('fanout_targets must be an array when provided');
  }
  const normalized = [];
  for (const target of fanoutTargets) {
    if (typeof target === 'string') {
      const key = target.trim();
      if (!key) continue;
      normalized.push({ fanout_key: key, fanout_payload: null });
      continue;
    }
    if (target && typeof target === 'object') {
      const key = String(target.fanout_key || target.key || '').trim();
      if (!key) continue;
      const payload = Object.prototype.hasOwnProperty.call(target, 'fanout_payload')
        ? target.fanout_payload
        : (Object.prototype.hasOwnProperty.call(target, 'payload') ? target.payload : null);
      normalized.push({
        fanout_key: key,
        fanout_payload: payload === null || payload === undefined ? null : normalizeResearchIntentPayload(payload),
      });
      continue;
    }
    throw new Error('fanout_targets entries must be strings or objects');
  }
  const deduped = [];
  const seen = new Set();
  for (const entry of normalized) {
    if (seen.has(entry.fanout_key)) continue;
    seen.add(entry.fanout_key);
    deduped.push(entry);
  }
  return deduped;
}

function normalizeResearchDedupeFingerprint(intentType, payloadText, providedFingerprint) {
  const provided = String(providedFingerprint || '').trim();
  if (provided) return provided;
  return crypto
    .createHash('sha256')
    .update(`${String(intentType || 'browser_research').toLowerCase()}::${payloadText}`)
    .digest('hex');
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeOptionalLineageId(value, fieldName) {
  if (fieldName === 'task_id') {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return normalizeOptionalText(value);
}

function normalizeProjectMemoryValidationStatus(value, fallback = 'unvalidated') {
  const candidate = String(value || fallback).trim().toLowerCase() || fallback;
  if (!PROJECT_MEMORY_VALIDATION_STATUSES.includes(candidate)) {
    throw new Error(`Invalid project-memory validation_status: ${value}`);
  }
  return candidate;
}

function normalizeProjectMemoryLineageType(value, fallback = 'origin') {
  const candidate = String(value || fallback).trim().toLowerCase() || fallback;
  if (!PROJECT_MEMORY_LINEAGE_TYPES.includes(candidate)) {
    throw new Error(`Invalid project-memory lineage_type: ${value}`);
  }
  return candidate;
}

function normalizeProjectMemoryConfidenceScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`confidence_score must be numeric when provided: ${value}`);
  }
  return Math.max(0, Math.min(1, parsed));
}

function normalizeProjectMemoryRelevanceScore(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, parsed);
}

function normalizeProjectMemoryFingerprint(scope, payloadText, providedFingerprint) {
  const provided = String(providedFingerprint || '').trim();
  if (provided) return provided;
  return crypto
    .createHash('sha256')
    .update(`${String(scope || 'project_memory').toLowerCase()}::${payloadText}`)
    .digest('hex');
}

function buildSqlInClause(values) {
  return values.map(() => '?').join(',');
}

function parseCoordinatorTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Tolerate both epoch-seconds and epoch-milliseconds inputs.
    const epochMs = Math.abs(value) < 1e11 ? value * 1000 : value;
    const date = new Date(epochMs);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  const sqliteMatch = raw.match(SQLITE_TIMESTAMP_RE);
  if (sqliteMatch) {
    const normalized = `${sqliteMatch[1]}T${sqliteMatch[2]}${sqliteMatch[3] || ''}Z`;
    const sqliteDate = new Date(normalized);
    return Number.isNaN(sqliteDate.getTime()) ? null : sqliteDate;
  }

  if (ISO_TIMESTAMP_WITHOUT_ZONE_RE.test(raw)) {
    const implicitUtcDate = new Date(`${raw}Z`);
    return Number.isNaN(implicitUtcDate.getTime()) ? null : implicitUtcDate;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function coordinatorAgeMs(timestamp, nowMs = Date.now()) {
  const parsed = parseCoordinatorTimestamp(timestamp);
  if (!parsed) return null;
  return Math.max(0, nowMs - parsed.getTime());
}

function parsePositiveInt(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function computeLoopRequestRetryAfterSec(oldestCreatedAt, nowMs = Date.now()) {
  const oldestDate = parseCoordinatorTimestamp(oldestCreatedAt);
  if (!oldestDate) return DEFAULT_LOOP_REQUEST_RETRY_AFTER_SEC;
  const oldestExpiryMs = oldestDate.getTime() + LOOP_REQUEST_RATE_WINDOW_MS;
  const remainingMs = oldestExpiryMs - nowMs;
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

function detectAutonomousRequestPayload(description) {
  const normalized = String(description || '').replace(/\r/g, '').trim();
  if (!normalized) return null;

  const matchedSignalIds = AUTONOMOUS_REQUEST_SIGNATURES
    .filter((signature) => signature.pattern.test(normalized))
    .map((signature) => signature.id);
  const headingCount = (normalized.match(/^##\s+/gm) || []).length;
  const codeFenceCount = (normalized.match(/```/g) || []).length;
  const lineCount = normalized.split('\n').length;
  const signalCount = matchedSignalIds.length;
  const appearsAutonomousTemplate = (
    (signalCount >= 3 && (lineCount >= 8 || normalized.length >= 700)) ||
    (signalCount >= 2 && headingCount >= 2 && codeFenceCount >= 2) ||
    (signalCount >= 1 && normalized.length >= 4000)
  );

  if (!appearsAutonomousTemplate) return null;
  return {
    reason: 'autonomous_prompt_payload',
    matched_signal_ids: matchedSignalIds,
    heading_count: headingCount,
    code_fence_count: codeFenceCount,
    line_count: lineCount,
    length: normalized.length,
  };
}

function buildCompletedTaskCursor(timestampValue, taskId = 0) {
  const parsedTimestamp = parseCoordinatorTimestamp(timestampValue);
  if (!parsedTimestamp) return null;
  const parsedTaskId = Number.parseInt(taskId, 10);
  const normalizedTaskId = Number.isInteger(parsedTaskId) && parsedTaskId > 0 ? parsedTaskId : 0;
  return `${parsedTimestamp.toISOString()}|${normalizedTaskId}`;
}

function parseCompletedTaskCursor(cursorValue) {
  if (cursorValue === null || cursorValue === undefined) return null;
  const rawCursor = String(cursorValue).trim();
  if (!rawCursor) return null;

  const separatorIndex = rawCursor.lastIndexOf('|');
  const timestampPart = separatorIndex >= 0 ? rawCursor.slice(0, separatorIndex).trim() : rawCursor;
  const taskIdPart = separatorIndex >= 0 ? rawCursor.slice(separatorIndex + 1).trim() : '';
  const parsedTimestamp = parseCoordinatorTimestamp(timestampPart);
  if (!parsedTimestamp) return null;

  const parsedTaskId = Number.parseInt(taskIdPart, 10);
  const normalizedTaskId = Number.isInteger(parsedTaskId) && parsedTaskId > 0 ? parsedTaskId : 0;
  return {
    cursor: `${parsedTimestamp.toISOString()}|${normalizedTaskId}`,
    timestampMs: parsedTimestamp.getTime(),
    taskId: normalizedTaskId,
  };
}

function compareCompletedTaskCursors(left, right) {
  if (!left || !right) return 0;
  if (left.timestampMs < right.timestampMs) return -1;
  if (left.timestampMs > right.timestampMs) return 1;
  if (left.taskId < right.taskId) return -1;
  if (left.taskId > right.taskId) return 1;
  return 0;
}

const VALID_COLUMNS = Object.freeze({
  requests: new Set(['description', 'tier', 'status', 'result', 'completed_at', 'loop_id']),
  tasks: new Set([
    'request_id', 'subject', 'description', 'domain', 'files', 'priority', 'tier', 'depends_on',
    'assigned_to', 'status', 'pr_url', 'branch', 'validation', 'overlap_with',
    'liveness_reassign_count', 'liveness_last_reassign_at', 'liveness_last_reassign_reason',
    'routing_class', 'routed_model', 'model_source', 'reasoning_effort',
    'browser_offload_status', 'browser_session_id', 'browser_channel',
    'browser_offload_payload', 'browser_offload_result', 'browser_offload_error',
    'browser_offload_updated_at',
    'usage_model', 'usage_payload_json', 'usage_input_tokens', 'usage_output_tokens', 'usage_input_audio_tokens', 'usage_output_audio_tokens', 'usage_reasoning_tokens',
    'usage_accepted_prediction_tokens', 'usage_rejected_prediction_tokens', 'usage_cached_tokens',
    'usage_cache_creation_tokens',
    'usage_cache_creation_ephemeral_5m_input_tokens',
    'usage_cache_creation_ephemeral_1h_input_tokens',
    'usage_total_tokens', 'usage_cost_usd',
    'started_at', 'completed_at', 'result',
  ]),
  workers: new Set(['status', 'domain', 'worktree_path', 'branch', 'tmux_session', 'tmux_window', 'pid', 'current_task_id', 'claimed_by', 'claimed_at', 'last_heartbeat', 'launched_at', 'tasks_completed']),
  merge_queue: new Set(['status', 'priority', 'completion_checkpoint', 'merged_at', 'error']),
  changes: new Set(['description', 'domain', 'file_path', 'function_name', 'tooltip', 'enabled', 'status']),
  loops: new Set(['prompt', 'status', 'iteration_count', 'last_checkpoint', 'namespace', 'tmux_session', 'tmux_window', 'pid', 'last_heartbeat', 'stopped_at']),
});

function validateColumns(table, fields) {
  const allowed = VALID_COLUMNS[table];
  if (!allowed) throw new Error(`Unknown table: ${table}`);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid column "${key}" for table "${table}"`);
    }
  }
}

function ensureMergeQueueColumns(database) {
  const mergeCols = database.prepare("PRAGMA table_info(merge_queue)").all().map((column) => column.name);
  if (mergeCols.length === 0) return;

  if (!mergeCols.includes('updated_at')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN updated_at TEXT");
  }
  if (!mergeCols.includes('completion_checkpoint')) {
    database.exec("ALTER TABLE merge_queue ADD COLUMN completion_checkpoint TEXT");
  }

  if (mergeCols.includes('created_at')) {
    database.exec("UPDATE merge_queue SET updated_at = COALESCE(updated_at, created_at, datetime('now')) WHERE updated_at IS NULL");
    database.exec("UPDATE merge_queue SET completion_checkpoint = COALESCE(completion_checkpoint, updated_at, created_at, datetime('now')) WHERE completion_checkpoint IS NULL");
    return;
  }
  database.exec("UPDATE merge_queue SET updated_at = COALESCE(updated_at, datetime('now')) WHERE updated_at IS NULL");
  database.exec("UPDATE merge_queue SET completion_checkpoint = COALESCE(completion_checkpoint, updated_at, datetime('now')) WHERE completion_checkpoint IS NULL");
}

function ensureTaskRoutingTelemetryColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('routing_class')) {
    database.exec("ALTER TABLE tasks ADD COLUMN routing_class TEXT");
  }
  if (!taskCols.includes('routed_model')) {
    database.exec("ALTER TABLE tasks ADD COLUMN routed_model TEXT");
  }
  if (!taskCols.includes('model_source')) {
    database.exec("ALTER TABLE tasks ADD COLUMN model_source TEXT");
  }
  if (!taskCols.includes('reasoning_effort')) {
    database.exec("ALTER TABLE tasks ADD COLUMN reasoning_effort TEXT");
  }
}

function ensureTaskLivenessRecoveryColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('liveness_reassign_count')) {
    database.exec("ALTER TABLE tasks ADD COLUMN liveness_reassign_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!taskCols.includes('liveness_last_reassign_at')) {
    database.exec("ALTER TABLE tasks ADD COLUMN liveness_last_reassign_at TEXT");
  }
  if (!taskCols.includes('liveness_last_reassign_reason')) {
    database.exec("ALTER TABLE tasks ADD COLUMN liveness_last_reassign_reason TEXT");
  }
}

function ensureTaskUsageTelemetryColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('usage_model')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_model TEXT");
  }
  if (!taskCols.includes('usage_payload_json')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_payload_json TEXT");
  }
  if (!taskCols.includes('usage_input_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_input_tokens INTEGER");
  }
  if (!taskCols.includes('usage_output_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_output_tokens INTEGER");
  }
  if (!taskCols.includes('usage_input_audio_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_input_audio_tokens INTEGER");
  }
  if (!taskCols.includes('usage_output_audio_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_output_audio_tokens INTEGER");
  }
  if (!taskCols.includes('usage_reasoning_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_reasoning_tokens INTEGER");
  }
  if (!taskCols.includes('usage_accepted_prediction_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_accepted_prediction_tokens INTEGER");
  }
  if (!taskCols.includes('usage_rejected_prediction_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_rejected_prediction_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cached_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cached_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cache_creation_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cache_creation_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cache_creation_ephemeral_5m_input_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cache_creation_ephemeral_5m_input_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cache_creation_ephemeral_1h_input_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cache_creation_ephemeral_1h_input_tokens INTEGER");
  }
  if (!taskCols.includes('usage_total_tokens')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_total_tokens INTEGER");
  }
  if (!taskCols.includes('usage_cost_usd')) {
    database.exec("ALTER TABLE tasks ADD COLUMN usage_cost_usd REAL");
  }
}

function ensureTaskBrowserOffloadColumns(database) {
  const taskCols = database.prepare("PRAGMA table_info(tasks)").all().map((column) => column.name);
  if (taskCols.length === 0) return;

  if (!taskCols.includes('browser_offload_status')) {
    database.exec(`
      ALTER TABLE tasks ADD COLUMN browser_offload_status TEXT
      CHECK (browser_offload_status IN (
        'not_requested',
        'requested',
        'queued',
        'launching',
        'attached',
        'running',
        'awaiting_callback',
        'completed',
        'failed',
        'cancelled'
      ))
      DEFAULT 'not_requested'
    `);
  }
  if (!taskCols.includes('browser_session_id')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_session_id TEXT");
  }
  if (!taskCols.includes('browser_channel')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_channel TEXT");
  }
  if (!taskCols.includes('browser_offload_payload')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_payload TEXT");
  }
  if (!taskCols.includes('browser_offload_result')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_result TEXT");
  }
  if (!taskCols.includes('browser_offload_error')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_error TEXT");
  }
  if (!taskCols.includes('browser_offload_updated_at')) {
    database.exec("ALTER TABLE tasks ADD COLUMN browser_offload_updated_at TEXT");
  }

  database.exec(`
    UPDATE tasks
    SET browser_offload_status = COALESCE(browser_offload_status, 'not_requested')
    WHERE browser_offload_status IS NULL
  `);
}

function ensureResearchBatchingSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS research_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      planner_key TEXT NOT NULL DEFAULT 'default',
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','running','completed','partial_failed','failed','timed_out','cancelled')),
      max_batch_size INTEGER NOT NULL CHECK (max_batch_size > 0),
      timeout_window_ms INTEGER NOT NULL CHECK (timeout_window_ms > 0),
      planned_intent_count INTEGER NOT NULL DEFAULT 0,
      sequence_cursor TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS research_intents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      intent_type TEXT NOT NULL DEFAULT 'browser_research',
      intent_payload TEXT NOT NULL,
      dedupe_fingerprint TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 500,
      batch_size_cap INTEGER NOT NULL DEFAULT 5 CHECK (batch_size_cap > 0),
      timeout_window_ms INTEGER NOT NULL DEFAULT 120000 CHECK (timeout_window_ms > 0),
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','planned','running','completed','partial_failed','failed','cancelled')),
      latest_batch_id INTEGER REFERENCES research_batches(id),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS research_batch_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES research_batches(id) ON DELETE CASCADE,
      intent_id INTEGER NOT NULL REFERENCES research_intents(id) ON DELETE CASCADE,
      stage_name TEXT NOT NULL DEFAULT 'intent_execution',
      stage_order INTEGER NOT NULL DEFAULT 1,
      execution_order INTEGER NOT NULL,
      dedupe_fingerprint TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 0,
      timeout_window_ms INTEGER NOT NULL CHECK (timeout_window_ms > 0),
      status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned','running','completed','partial_failed','failed','cancelled')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(batch_id, intent_id, stage_order)
    );

    CREATE TABLE IF NOT EXISTS research_intent_fanout (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      intent_id INTEGER NOT NULL REFERENCES research_intents(id) ON DELETE CASCADE,
      fanout_key TEXT NOT NULL,
      fanout_payload TEXT,
      planned_batch_id INTEGER REFERENCES research_batches(id) ON DELETE SET NULL,
      planned_stage_id INTEGER REFERENCES research_batch_stages(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','planned','running','completed','partial_failed','failed','cancelled')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(intent_id, fanout_key)
    );

    CREATE INDEX IF NOT EXISTS idx_research_intents_status_score
      ON research_intents(status, priority_score DESC, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_research_intents_active_dedupe
      ON research_intents(dedupe_fingerprint, intent_type)
      WHERE status IN ('queued','planned','running','partial_failed');
    CREATE INDEX IF NOT EXISTS idx_research_batches_status
      ON research_batches(status, created_at ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_research_batch_stages_batch_status
      ON research_batch_stages(batch_id, status, execution_order ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_research_batch_stages_execution
      ON research_batch_stages(status, execution_order ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_research_intent_fanout_intent_status
      ON research_intent_fanout(intent_id, status, fanout_key);
    CREATE INDEX IF NOT EXISTS idx_research_intent_fanout_retry
      ON research_intent_fanout(status, updated_at ASC, id ASC)
      WHERE status IN ('partial_failed','failed');
  `);

  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_planner_interval_ms',
    '5000'
  );
  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_batch_max_size',
    String(DEFAULT_RESEARCH_BATCH_SIZE_CAP)
  );
  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_batch_timeout_ms',
    String(DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS)
  );
  database.prepare("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)").run(
    'research_batch_candidate_limit',
    String(DEFAULT_RESEARCH_CANDIDATE_LIMIT)
  );
}

function ensureProjectMemoryPersistenceSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_memory_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_context_key TEXT NOT NULL,
      snapshot_version INTEGER NOT NULL CHECK (snapshot_version > 0),
      iteration INTEGER NOT NULL DEFAULT 1 CHECK (iteration > 0),
      parent_snapshot_id INTEGER REFERENCES project_memory_snapshots(id) ON DELETE SET NULL,
      snapshot_payload TEXT NOT NULL,
      dedupe_fingerprint TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      run_id TEXT,
      source TEXT,
      confidence_score REAL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
      validation_status TEXT NOT NULL DEFAULT 'unvalidated'
        CHECK (validation_status IN ('unvalidated','pending','validated','rejected','superseded')),
      retention_policy TEXT NOT NULL DEFAULT 'retain',
      retention_until TEXT,
      governance_metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_context_key, snapshot_version)
    );

    CREATE TABLE IF NOT EXISTS project_memory_snapshot_index (
      project_context_key TEXT PRIMARY KEY,
      latest_snapshot_id INTEGER NOT NULL REFERENCES project_memory_snapshots(id) ON DELETE CASCADE,
      latest_snapshot_version INTEGER NOT NULL CHECK (latest_snapshot_version > 0),
      latest_iteration INTEGER NOT NULL DEFAULT 1 CHECK (latest_iteration > 0),
      latest_snapshot_created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS insight_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_context_key TEXT NOT NULL,
      snapshot_id INTEGER REFERENCES project_memory_snapshots(id) ON DELETE SET NULL,
      artifact_type TEXT NOT NULL DEFAULT 'research_insight',
      artifact_key TEXT,
      artifact_version INTEGER NOT NULL DEFAULT 1 CHECK (artifact_version > 0),
      artifact_payload TEXT NOT NULL,
      dedupe_fingerprint TEXT NOT NULL,
      relevance_score REAL NOT NULL DEFAULT 0,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      run_id TEXT,
      source TEXT,
      confidence_score REAL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
      validation_status TEXT NOT NULL DEFAULT 'unvalidated'
        CHECK (validation_status IN ('unvalidated','pending','validated','rejected','superseded')),
      retention_policy TEXT NOT NULL DEFAULT 'retain',
      retention_until TEXT,
      governance_metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_context_key, artifact_type, dedupe_fingerprint, artifact_version)
    );

    CREATE TABLE IF NOT EXISTS project_memory_lineage_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER REFERENCES project_memory_snapshots(id) ON DELETE CASCADE,
      insight_artifact_id INTEGER REFERENCES insight_artifacts(id) ON DELETE CASCADE,
      request_id TEXT REFERENCES requests(id),
      task_id INTEGER REFERENCES tasks(id),
      run_id TEXT,
      lineage_type TEXT NOT NULL DEFAULT 'origin'
        CHECK (lineage_type IN ('origin','derived_from','supports','supersedes','validated_by','consumed_by')),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (snapshot_id IS NOT NULL OR insight_artifact_id IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_project_memory_snapshots_context_version
      ON project_memory_snapshots(project_context_key, snapshot_version DESC, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_project_memory_snapshots_dedupe
      ON project_memory_snapshots(project_context_key, dedupe_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_project_memory_snapshots_lineage
      ON project_memory_snapshots(request_id, task_id, run_id);
    CREATE INDEX IF NOT EXISTS idx_insight_artifacts_context_relevance
      ON insight_artifacts(project_context_key, relevance_score DESC, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_insight_artifacts_dedupe
      ON insight_artifacts(project_context_key, artifact_type, dedupe_fingerprint, artifact_version DESC);
    CREATE INDEX IF NOT EXISTS idx_insight_artifacts_lineage
      ON insight_artifacts(request_id, task_id, run_id, validation_status);
    CREATE INDEX IF NOT EXISTS idx_project_memory_lineage_snapshot
      ON project_memory_lineage_links(snapshot_id, created_at DESC, id DESC)
      WHERE snapshot_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_project_memory_lineage_insight
      ON project_memory_lineage_links(insight_artifact_id, created_at DESC, id DESC)
      WHERE insight_artifact_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_project_memory_lineage_request_task_run
      ON project_memory_lineage_links(request_id, task_id, run_id, lineage_type);
  `);
}

function getDbPath(projectDir) {
  const stateDir = path.join(projectDir, '.claude', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const dbFile = NAMESPACE === 'mac10' ? 'mac10.db' : `${NAMESPACE}.db`;
  return path.join(stateDir, dbFile);
}

function init(projectDir) {
  if (db) return db;
  const dbPath = getDbPath(projectDir);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.pragma('wal_autocheckpoint = 1000');

  // Run migrations BEFORE schema (schema creates indexes on columns that
  // may not exist in older databases; migrations must add them first).
  const existingTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (existingTables.includes('workers')) {
    const cols = db.prepare("PRAGMA table_info(workers)").all().map(c => c.name);
    if (!cols.includes('claimed_by')) {
      db.exec("ALTER TABLE workers ADD COLUMN claimed_by TEXT");
    }
    if (!cols.includes('claimed_at')) {
      db.exec("ALTER TABLE workers ADD COLUMN claimed_at TEXT");
    }
    db.exec("UPDATE workers SET claimed_at = NULL WHERE claimed_by IS NULL AND claimed_at IS NOT NULL");
    db.exec("UPDATE workers SET claimed_at = COALESCE(claimed_at, datetime('now')) WHERE claimed_by IS NOT NULL");
  }
  if (existingTables.includes('tasks')) {
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    if (!taskCols.includes('overlap_with')) {
      db.exec("ALTER TABLE tasks ADD COLUMN overlap_with TEXT");
    }
    ensureTaskLivenessRecoveryColumns(db);
    ensureTaskRoutingTelemetryColumns(db);
    ensureTaskBrowserOffloadColumns(db);
    ensureTaskUsageTelemetryColumns(db);
  }
  if (existingTables.includes('requests')) {
    const reqCols = db.prepare("PRAGMA table_info(requests)").all().map(c => c.name);
    if (!reqCols.includes('loop_id')) {
      db.exec("ALTER TABLE requests ADD COLUMN loop_id INTEGER REFERENCES loops(id)");
    }
  }
  if (existingTables.includes('merge_queue')) ensureMergeQueueColumns(db);
  if (existingTables.includes('loops')) {
    const loopCols = db.prepare("PRAGMA table_info(loops)").all().map(c => c.name);
    if (!loopCols.includes('namespace')) {
      db.exec("ALTER TABLE loops ADD COLUMN namespace TEXT");
    }
  }

  // Now safe to run full schema (CREATE TABLE IF NOT EXISTS + indexes)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  ensureMergeQueueColumns(db);
  ensureTaskLivenessRecoveryColumns(db);
  ensureTaskRoutingTelemetryColumns(db);
  ensureTaskBrowserOffloadColumns(db);
  ensureTaskUsageTelemetryColumns(db);
  ensureResearchBatchingSchema(db);
  ensureProjectMemoryPersistenceSchema(db);

  // Store project dir in config
  db.prepare('UPDATE config SET value = ? WHERE key = ?').run(projectDir, 'project_dir');
  return db;
}

function close() {
  if (db) { db.close(); db = null; }
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call init(projectDir) first.');
  return db;
}

// --- Request helpers ---

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
    if (shouldClearRequestCompletionMetadata(current && current.status, normalizedFields.status)) {
      normalizedFields.completed_at = null;
      normalizedFields.result = null;
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

// --- Task helpers ---

function createTask({ request_id, subject, description, domain, files, priority, tier, depends_on, validation }) {
  const result = getDb().prepare(`
    INSERT INTO tasks (request_id, subject, description, domain, files, priority, tier, depends_on, validation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    request_id, subject, description,
    domain || null,
    files ? JSON.stringify(files) : null,
    priority || 'normal',
    tier || 3,
    depends_on ? JSON.stringify(depends_on) : null,
    validation ? JSON.stringify(validation) : null
  );
  log('coordinator', 'task_created', { task_id: result.lastInsertRowid, request_id, subject });
  return result.lastInsertRowid;
}

function getTask(id) {
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function updateTask(id, fields) {
  validateColumns('tasks', fields);
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  getDb().prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function normalizeBrowserOffloadStatus(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  return BROWSER_OFFLOAD_STATUS_SEQUENCE.includes(normalized) ? normalized : null;
}

function canTransitionBrowserOffloadStatus(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const allowed = BROWSER_OFFLOAD_ALLOWED_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.has(nextStatus));
}

function transitionTaskBrowserOffload(taskId, nextStatus, updates = {}) {
  const normalizedNextStatus = normalizeBrowserOffloadStatus(nextStatus);
  if (!normalizedNextStatus) {
    throw new Error(`Invalid browser offload status: ${nextStatus}`);
  }
  if (updates.browser_offload_status !== undefined) {
    throw new Error('transitionTaskBrowserOffload does not accept browser_offload_status in updates');
  }

  const allowedUpdateKeys = new Set([
    'browser_session_id',
    'browser_channel',
    'browser_offload_payload',
    'browser_offload_result',
    'browser_offload_error',
  ]);
  for (const key of Object.keys(updates)) {
    if (!allowedUpdateKeys.has(key)) {
      throw new Error(`Invalid browser offload update field: ${key}`);
    }
  }

  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const currentStatus = normalizeBrowserOffloadStatus(task.browser_offload_status) || 'not_requested';
  if (!canTransitionBrowserOffloadStatus(currentStatus, normalizedNextStatus)) {
    throw new Error(
      `Invalid browser offload transition from "${currentStatus}" to "${normalizedNextStatus}"`
    );
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  updateTask(taskId, {
    ...updates,
    browser_offload_status: normalizedNextStatus,
    browser_offload_updated_at: timestamp,
  });
  return getTask(taskId);
}

function normalizeProjectContextKey(projectContextKey) {
  const normalized = String(projectContextKey || '').trim();
  if (!normalized) {
    throw new Error('project_context_key is required');
  }
  return normalized;
}

function upsertProjectMemorySnapshotIndexEntry(database, snapshotRow) {
  database.prepare(`
    INSERT INTO project_memory_snapshot_index (
      project_context_key,
      latest_snapshot_id,
      latest_snapshot_version,
      latest_iteration,
      latest_snapshot_created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_context_key) DO UPDATE SET
      latest_snapshot_id = excluded.latest_snapshot_id,
      latest_snapshot_version = excluded.latest_snapshot_version,
      latest_iteration = excluded.latest_iteration,
      latest_snapshot_created_at = excluded.latest_snapshot_created_at,
      updated_at = excluded.updated_at
  `).run(
    snapshotRow.project_context_key,
    snapshotRow.id,
    snapshotRow.snapshot_version,
    snapshotRow.iteration,
    snapshotRow.created_at,
    currentSqlTimestamp()
  );
}

function insertProjectMemoryLineageLink(
  database,
  {
    snapshot_id = null,
    insight_artifact_id = null,
    request_id = null,
    task_id = null,
    run_id = null,
    lineage_type = 'origin',
    metadata = null,
  } = {}
) {
  const parsedSnapshotId = Number.parseInt(snapshot_id, 10);
  const normalizedSnapshotId = Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0
    ? parsedSnapshotId
    : null;
  const parsedInsightId = Number.parseInt(insight_artifact_id, 10);
  const normalizedInsightArtifactId = Number.isInteger(parsedInsightId) && parsedInsightId > 0
    ? parsedInsightId
    : null;
  if (!normalizedSnapshotId && !normalizedInsightArtifactId) {
    throw new Error('snapshot_id or insight_artifact_id is required for lineage link');
  }
  const normalizedRequestId = normalizeOptionalLineageId(request_id, 'request_id');
  const normalizedTaskId = normalizeOptionalLineageId(task_id, 'task_id');
  const normalizedRunId = normalizeOptionalLineageId(run_id, 'run_id');
  const normalizedLineageType = normalizeProjectMemoryLineageType(lineage_type, 'origin');
  const normalizedMetadata = metadata === null || metadata === undefined
    ? null
    : normalizeStructuredPayload(metadata, '{}');
  const result = database.prepare(`
    INSERT INTO project_memory_lineage_links (
      snapshot_id,
      insight_artifact_id,
      request_id,
      task_id,
      run_id,
      lineage_type,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedSnapshotId,
    normalizedInsightArtifactId,
    normalizedRequestId,
    normalizedTaskId,
    normalizedRunId,
    normalizedLineageType,
    normalizedMetadata
  );
  return Number(result.lastInsertRowid);
}

function createProjectMemorySnapshot({
  project_context_key = null,
  snapshot_payload = null,
  snapshot_version = null,
  iteration = null,
  parent_snapshot_id = null,
  dedupe_fingerprint = null,
  relevance_score = null,
  request_id = null,
  task_id = null,
  run_id = null,
  source = null,
  confidence_score = null,
  validation_status = 'unvalidated',
  retention_policy = 'retain',
  retention_until = null,
  governance_metadata = null,
  lineage_type = 'origin',
  lineage_metadata = null,
} = {}) {
  const normalizedProjectContextKey = normalizeProjectContextKey(project_context_key);
  const normalizedSnapshotPayload = normalizeStructuredPayload(snapshot_payload, '{}');
  const normalizedFingerprint = normalizeProjectMemoryFingerprint(
    `snapshot:${normalizedProjectContextKey}`,
    normalizedSnapshotPayload,
    dedupe_fingerprint
  );
  const normalizedRelevanceScore = normalizeProjectMemoryRelevanceScore(relevance_score, 0);
  const normalizedRequestId = normalizeOptionalLineageId(request_id, 'request_id');
  const normalizedTaskId = normalizeOptionalLineageId(task_id, 'task_id');
  const normalizedRunId = normalizeOptionalLineageId(run_id, 'run_id');
  const normalizedSource = normalizeOptionalText(source);
  const normalizedConfidenceScore = normalizeProjectMemoryConfidenceScore(confidence_score);
  const normalizedValidationStatus = normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated');
  const normalizedRetentionPolicy = normalizeOptionalText(retention_policy) || 'retain';
  const normalizedRetentionUntil = normalizeOptionalText(retention_until);
  const normalizedGovernanceMetadata = governance_metadata === null || governance_metadata === undefined
    ? null
    : normalizeStructuredPayload(governance_metadata, '{}');
  const now = currentSqlTimestamp();
  const d = getDb();

  const created = d.transaction(() => {
    const latest = d.prepare(`
      SELECT *
      FROM project_memory_snapshots
      WHERE project_context_key = ?
      ORDER BY snapshot_version DESC, datetime(created_at) DESC, id DESC
      LIMIT 1
    `).get(normalizedProjectContextKey);
    const latestVersion = Number(latest?.snapshot_version) || 0;
    const parsedSnapshotVersion = Number.parseInt(String(snapshot_version ?? ''), 10);
    const normalizedSnapshotVersion = Number.isInteger(parsedSnapshotVersion) && parsedSnapshotVersion > 0
      ? parsedSnapshotVersion
      : (latestVersion + 1);
    if (normalizedSnapshotVersion <= latestVersion) {
      throw new Error(
        `snapshot_version ${normalizedSnapshotVersion} must be greater than latest version ${latestVersion}`
      );
    }

    const parsedParentSnapshotId = Number.parseInt(String(parent_snapshot_id ?? ''), 10);
    const normalizedParentSnapshotId = Number.isInteger(parsedParentSnapshotId) && parsedParentSnapshotId > 0
      ? parsedParentSnapshotId
      : (latest ? latest.id : null);
    if (normalizedParentSnapshotId) {
      const parentSnapshot = d.prepare('SELECT id FROM project_memory_snapshots WHERE id = ?').get(normalizedParentSnapshotId);
      if (!parentSnapshot) {
        throw new Error(`parent_snapshot_id ${normalizedParentSnapshotId} not found`);
      }
    }

    const parsedIteration = Number.parseInt(String(iteration ?? ''), 10);
    const normalizedIteration = Number.isInteger(parsedIteration) && parsedIteration > 0
      ? parsedIteration
      : normalizedSnapshotVersion;

    const insertResult = d.prepare(`
      INSERT INTO project_memory_snapshots (
        project_context_key,
        snapshot_version,
        iteration,
        parent_snapshot_id,
        snapshot_payload,
        dedupe_fingerprint,
        relevance_score,
        request_id,
        task_id,
        run_id,
        source,
        confidence_score,
        validation_status,
        retention_policy,
        retention_until,
        governance_metadata,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedProjectContextKey,
      normalizedSnapshotVersion,
      normalizedIteration,
      normalizedParentSnapshotId,
      normalizedSnapshotPayload,
      normalizedFingerprint,
      normalizedRelevanceScore,
      normalizedRequestId,
      normalizedTaskId,
      normalizedRunId,
      normalizedSource,
      normalizedConfidenceScore,
      normalizedValidationStatus,
      normalizedRetentionPolicy,
      normalizedRetentionUntil,
      normalizedGovernanceMetadata,
      now
    );
    const snapshotId = Number(insertResult.lastInsertRowid);
    const snapshot = d.prepare('SELECT * FROM project_memory_snapshots WHERE id = ?').get(snapshotId);
    upsertProjectMemorySnapshotIndexEntry(d, snapshot);
    const lineageLinkId = (
      normalizedRequestId || normalizedTaskId || normalizedRunId
    )
      ? insertProjectMemoryLineageLink(d, {
        snapshot_id: snapshotId,
        request_id: normalizedRequestId,
        task_id: normalizedTaskId,
        run_id: normalizedRunId,
        lineage_type,
        metadata: lineage_metadata,
      })
      : null;
    return {
      ...snapshot,
      lineage_link_id: lineageLinkId,
    };
  })();

  log('coordinator', 'project_memory_snapshot_created', {
    snapshot_id: created.id,
    project_context_key: created.project_context_key,
    snapshot_version: created.snapshot_version,
    dedupe_fingerprint: created.dedupe_fingerprint,
    request_id: created.request_id,
    task_id: created.task_id,
    run_id: created.run_id,
  });
  return created;
}

function getProjectMemorySnapshot(id) {
  return getDb().prepare('SELECT * FROM project_memory_snapshots WHERE id = ?').get(id);
}

function getLatestProjectMemorySnapshot(project_context_key) {
  const normalizedProjectContextKey = normalizeProjectContextKey(project_context_key);
  const indexed = getDb().prepare(`
    SELECT pms.*
    FROM project_memory_snapshot_index pmsi
    JOIN project_memory_snapshots pms ON pms.id = pmsi.latest_snapshot_id
    WHERE pmsi.project_context_key = ?
  `).get(normalizedProjectContextKey);
  if (indexed) return indexed;
  return getDb().prepare(`
    SELECT *
    FROM project_memory_snapshots
    WHERE project_context_key = ?
    ORDER BY snapshot_version DESC, datetime(created_at) DESC, id DESC
    LIMIT 1
  `).get(normalizedProjectContextKey) || null;
}

function listProjectMemorySnapshots({
  project_context_key = null,
  request_id = null,
  task_id = null,
  run_id = null,
  dedupe_fingerprint = null,
  validation_status = null,
  min_relevance_score = null,
  limit = 100,
  offset = 0,
} = {}) {
  const normalizedLimit = normalizePositiveInt(limit, 100, { min: 1, max: 1000 });
  const normalizedOffset = normalizePositiveInt(offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
  let sql = 'SELECT * FROM project_memory_snapshots WHERE 1=1';
  const vals = [];
  if (project_context_key !== null && project_context_key !== undefined && String(project_context_key).trim()) {
    sql += ' AND project_context_key = ?';
    vals.push(normalizeProjectContextKey(project_context_key));
  }
  if (request_id !== null && request_id !== undefined && String(request_id).trim()) {
    sql += ' AND request_id = ?';
    vals.push(String(request_id).trim());
  }
  const parsedTaskId = Number.parseInt(String(task_id ?? ''), 10);
  if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
    sql += ' AND task_id = ?';
    vals.push(parsedTaskId);
  }
  if (run_id !== null && run_id !== undefined && String(run_id).trim()) {
    sql += ' AND run_id = ?';
    vals.push(String(run_id).trim());
  }
  if (dedupe_fingerprint !== null && dedupe_fingerprint !== undefined && String(dedupe_fingerprint).trim()) {
    sql += ' AND dedupe_fingerprint = ?';
    vals.push(String(dedupe_fingerprint).trim());
  }
  if (validation_status !== null && validation_status !== undefined && String(validation_status).trim()) {
    sql += ' AND validation_status = ?';
    vals.push(normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated'));
  }
  if (min_relevance_score !== null && min_relevance_score !== undefined && min_relevance_score !== '') {
    sql += ' AND relevance_score >= ?';
    vals.push(normalizeProjectMemoryRelevanceScore(min_relevance_score, 0));
  }
  sql += ' ORDER BY project_context_key ASC, snapshot_version DESC, datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
  vals.push(normalizedLimit, normalizedOffset);
  return getDb().prepare(sql).all(...vals);
}

function createInsightArtifact({
  project_context_key = null,
  snapshot_id = null,
  artifact_type = 'research_insight',
  artifact_key = null,
  artifact_version = null,
  artifact_payload = null,
  dedupe_fingerprint = null,
  relevance_score = null,
  request_id = null,
  task_id = null,
  run_id = null,
  source = null,
  confidence_score = null,
  validation_status = 'unvalidated',
  retention_policy = 'retain',
  retention_until = null,
  governance_metadata = null,
  lineage_type = 'origin',
  lineage_metadata = null,
} = {}) {
  const normalizedArtifactType = String(artifact_type || 'research_insight').trim().toLowerCase() || 'research_insight';
  const normalizedArtifactPayload = normalizeStructuredPayload(artifact_payload, '{}');
  const normalizedArtifactKey = normalizeOptionalText(artifact_key);
  const normalizedSource = normalizeOptionalText(source);
  const normalizedRequestId = normalizeOptionalLineageId(request_id, 'request_id');
  const normalizedTaskId = normalizeOptionalLineageId(task_id, 'task_id');
  const normalizedRunId = normalizeOptionalLineageId(run_id, 'run_id');
  const normalizedConfidenceScore = normalizeProjectMemoryConfidenceScore(confidence_score);
  const normalizedValidationStatus = normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated');
  const normalizedRetentionPolicy = normalizeOptionalText(retention_policy) || 'retain';
  const normalizedRetentionUntil = normalizeOptionalText(retention_until);
  const normalizedGovernanceMetadata = governance_metadata === null || governance_metadata === undefined
    ? null
    : normalizeStructuredPayload(governance_metadata, '{}');
  const parsedSnapshotId = Number.parseInt(String(snapshot_id ?? ''), 10);
  const normalizedSnapshotId = Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0
    ? parsedSnapshotId
    : null;
  const now = currentSqlTimestamp();
  const d = getDb();

  const created = d.transaction(() => {
    let inferredContextKey = normalizeOptionalText(project_context_key);
    if (normalizedSnapshotId) {
      const snapshot = d.prepare('SELECT id, project_context_key FROM project_memory_snapshots WHERE id = ?').get(normalizedSnapshotId);
      if (!snapshot) throw new Error(`snapshot_id ${normalizedSnapshotId} not found`);
      if (inferredContextKey && inferredContextKey !== snapshot.project_context_key) {
        throw new Error(
          `project_context_key ${inferredContextKey} does not match snapshot context ${snapshot.project_context_key}`
        );
      }
      inferredContextKey = snapshot.project_context_key;
    }
    const normalizedProjectContextKey = normalizeProjectContextKey(inferredContextKey);
    const normalizedFingerprint = normalizeProjectMemoryFingerprint(
      `insight:${normalizedProjectContextKey}:${normalizedArtifactType}`,
      normalizedArtifactPayload,
      dedupe_fingerprint
    );
    const normalizedRelevanceScore = normalizeProjectMemoryRelevanceScore(relevance_score, 0);
    const latestVersionRow = d.prepare(`
      SELECT MAX(artifact_version) AS max_version
      FROM insight_artifacts
      WHERE project_context_key = ?
        AND artifact_type = ?
        AND dedupe_fingerprint = ?
    `).get(normalizedProjectContextKey, normalizedArtifactType, normalizedFingerprint);
    const latestVersion = Number(latestVersionRow?.max_version) || 0;
    const parsedArtifactVersion = Number.parseInt(String(artifact_version ?? ''), 10);
    const normalizedArtifactVersion = Number.isInteger(parsedArtifactVersion) && parsedArtifactVersion > 0
      ? parsedArtifactVersion
      : (latestVersion + 1);
    if (normalizedArtifactVersion <= latestVersion) {
      throw new Error(
        `artifact_version ${normalizedArtifactVersion} must be greater than latest version ${latestVersion}`
      );
    }

    const insertResult = d.prepare(`
      INSERT INTO insight_artifacts (
        project_context_key,
        snapshot_id,
        artifact_type,
        artifact_key,
        artifact_version,
        artifact_payload,
        dedupe_fingerprint,
        relevance_score,
        request_id,
        task_id,
        run_id,
        source,
        confidence_score,
        validation_status,
        retention_policy,
        retention_until,
        governance_metadata,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedProjectContextKey,
      normalizedSnapshotId,
      normalizedArtifactType,
      normalizedArtifactKey,
      normalizedArtifactVersion,
      normalizedArtifactPayload,
      normalizedFingerprint,
      normalizedRelevanceScore,
      normalizedRequestId,
      normalizedTaskId,
      normalizedRunId,
      normalizedSource,
      normalizedConfidenceScore,
      normalizedValidationStatus,
      normalizedRetentionPolicy,
      normalizedRetentionUntil,
      normalizedGovernanceMetadata,
      now,
      now
    );
    const insightArtifactId = Number(insertResult.lastInsertRowid);
    const artifact = d.prepare('SELECT * FROM insight_artifacts WHERE id = ?').get(insightArtifactId);
    const lineageLinkId = (
      normalizedRequestId || normalizedTaskId || normalizedRunId || normalizedSnapshotId
    )
      ? insertProjectMemoryLineageLink(d, {
        snapshot_id: normalizedSnapshotId,
        insight_artifact_id: insightArtifactId,
        request_id: normalizedRequestId,
        task_id: normalizedTaskId,
        run_id: normalizedRunId,
        lineage_type,
        metadata: lineage_metadata,
      })
      : null;
    return {
      ...artifact,
      lineage_link_id: lineageLinkId,
    };
  })();

  log('coordinator', 'insight_artifact_created', {
    insight_artifact_id: created.id,
    project_context_key: created.project_context_key,
    artifact_type: created.artifact_type,
    artifact_version: created.artifact_version,
    dedupe_fingerprint: created.dedupe_fingerprint,
    relevance_score: created.relevance_score,
  });
  return created;
}

function getInsightArtifact(id) {
  return getDb().prepare('SELECT * FROM insight_artifacts WHERE id = ?').get(id);
}

function listInsightArtifacts({
  project_context_key = null,
  snapshot_id = null,
  artifact_type = null,
  dedupe_fingerprint = null,
  request_id = null,
  task_id = null,
  run_id = null,
  validation_status = null,
  min_relevance_score = null,
  limit = 100,
  offset = 0,
} = {}) {
  const normalizedLimit = normalizePositiveInt(limit, 100, { min: 1, max: 1000 });
  const normalizedOffset = normalizePositiveInt(offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
  let sql = 'SELECT * FROM insight_artifacts WHERE 1=1';
  const vals = [];
  if (project_context_key !== null && project_context_key !== undefined && String(project_context_key).trim()) {
    sql += ' AND project_context_key = ?';
    vals.push(normalizeProjectContextKey(project_context_key));
  }
  const parsedSnapshotId = Number.parseInt(String(snapshot_id ?? ''), 10);
  if (Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0) {
    sql += ' AND snapshot_id = ?';
    vals.push(parsedSnapshotId);
  }
  if (artifact_type !== null && artifact_type !== undefined && String(artifact_type).trim()) {
    sql += ' AND artifact_type = ?';
    vals.push(String(artifact_type).trim().toLowerCase());
  }
  if (dedupe_fingerprint !== null && dedupe_fingerprint !== undefined && String(dedupe_fingerprint).trim()) {
    sql += ' AND dedupe_fingerprint = ?';
    vals.push(String(dedupe_fingerprint).trim());
  }
  if (request_id !== null && request_id !== undefined && String(request_id).trim()) {
    sql += ' AND request_id = ?';
    vals.push(String(request_id).trim());
  }
  const parsedTaskId = Number.parseInt(String(task_id ?? ''), 10);
  if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
    sql += ' AND task_id = ?';
    vals.push(parsedTaskId);
  }
  if (run_id !== null && run_id !== undefined && String(run_id).trim()) {
    sql += ' AND run_id = ?';
    vals.push(String(run_id).trim());
  }
  if (validation_status !== null && validation_status !== undefined && String(validation_status).trim()) {
    sql += ' AND validation_status = ?';
    vals.push(normalizeProjectMemoryValidationStatus(validation_status, 'unvalidated'));
  }
  if (min_relevance_score !== null && min_relevance_score !== undefined && min_relevance_score !== '') {
    sql += ' AND relevance_score >= ?';
    vals.push(normalizeProjectMemoryRelevanceScore(min_relevance_score, 0));
  }
  sql += ' ORDER BY relevance_score DESC, datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
  vals.push(normalizedLimit, normalizedOffset);
  return getDb().prepare(sql).all(...vals);
}

function createProjectMemoryLineageLink({
  snapshot_id = null,
  insight_artifact_id = null,
  request_id = null,
  task_id = null,
  run_id = null,
  lineage_type = 'origin',
  metadata = null,
} = {}) {
  const d = getDb();
  const result = d.transaction(() => {
    const parsedSnapshotId = Number.parseInt(snapshot_id, 10);
    const normalizedSnapshotId = Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0
      ? parsedSnapshotId
      : null;
    const parsedInsightArtifactId = Number.parseInt(insight_artifact_id, 10);
    const normalizedInsightArtifactId = Number.isInteger(parsedInsightArtifactId) && parsedInsightArtifactId > 0
      ? parsedInsightArtifactId
      : null;
    if (!normalizedSnapshotId && !normalizedInsightArtifactId) {
      throw new Error('snapshot_id or insight_artifact_id is required');
    }
    if (normalizedSnapshotId) {
      const snapshot = d.prepare('SELECT id FROM project_memory_snapshots WHERE id = ?').get(normalizedSnapshotId);
      if (!snapshot) throw new Error(`snapshot_id ${normalizedSnapshotId} not found`);
    }
    if (normalizedInsightArtifactId) {
      const artifact = d.prepare('SELECT id FROM insight_artifacts WHERE id = ?').get(normalizedInsightArtifactId);
      if (!artifact) throw new Error(`insight_artifact_id ${normalizedInsightArtifactId} not found`);
    }
    const lineageLinkId = insertProjectMemoryLineageLink(d, {
      snapshot_id: normalizedSnapshotId,
      insight_artifact_id: normalizedInsightArtifactId,
      request_id,
      task_id,
      run_id,
      lineage_type,
      metadata,
    });
    return d.prepare('SELECT * FROM project_memory_lineage_links WHERE id = ?').get(lineageLinkId);
  })();

  log('coordinator', 'project_memory_lineage_link_created', {
    lineage_link_id: result.id,
    snapshot_id: result.snapshot_id,
    insight_artifact_id: result.insight_artifact_id,
    request_id: result.request_id,
    task_id: result.task_id,
    run_id: result.run_id,
    lineage_type: result.lineage_type,
  });
  return result;
}

function listProjectMemoryLineageLinks({
  snapshot_id = null,
  insight_artifact_id = null,
  request_id = null,
  task_id = null,
  run_id = null,
  lineage_type = null,
  limit = 200,
  offset = 0,
} = {}) {
  const normalizedLimit = normalizePositiveInt(limit, 200, { min: 1, max: 5000 });
  const normalizedOffset = normalizePositiveInt(offset, 0, { min: 0, max: Number.MAX_SAFE_INTEGER });
  let sql = 'SELECT * FROM project_memory_lineage_links WHERE 1=1';
  const vals = [];
  const parsedSnapshotId = Number.parseInt(String(snapshot_id ?? ''), 10);
  if (Number.isInteger(parsedSnapshotId) && parsedSnapshotId > 0) {
    sql += ' AND snapshot_id = ?';
    vals.push(parsedSnapshotId);
  }
  const parsedInsightArtifactId = Number.parseInt(String(insight_artifact_id ?? ''), 10);
  if (Number.isInteger(parsedInsightArtifactId) && parsedInsightArtifactId > 0) {
    sql += ' AND insight_artifact_id = ?';
    vals.push(parsedInsightArtifactId);
  }
  if (request_id !== null && request_id !== undefined && String(request_id).trim()) {
    sql += ' AND request_id = ?';
    vals.push(String(request_id).trim());
  }
  const parsedTaskId = Number.parseInt(String(task_id ?? ''), 10);
  if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
    sql += ' AND task_id = ?';
    vals.push(parsedTaskId);
  }
  if (run_id !== null && run_id !== undefined && String(run_id).trim()) {
    sql += ' AND run_id = ?';
    vals.push(String(run_id).trim());
  }
  if (lineage_type !== null && lineage_type !== undefined && String(lineage_type).trim()) {
    sql += ' AND lineage_type = ?';
    vals.push(normalizeProjectMemoryLineageType(lineage_type, 'origin'));
  }
  sql += ' ORDER BY datetime(created_at) DESC, id DESC LIMIT ? OFFSET ?';
  vals.push(normalizedLimit, normalizedOffset);
  return getDb().prepare(sql).all(...vals);
}

function rebuildProjectMemorySnapshotIndex() {
  const d = getDb();
  const result = d.transaction(() => {
    d.prepare('DELETE FROM project_memory_snapshot_index').run();
    const latestSnapshots = d.prepare(`
      SELECT pms.*
      FROM project_memory_snapshots pms
      JOIN (
        SELECT project_context_key, MAX(snapshot_version) AS max_snapshot_version
        FROM project_memory_snapshots
        GROUP BY project_context_key
      ) latest
      ON latest.project_context_key = pms.project_context_key
      AND latest.max_snapshot_version = pms.snapshot_version
      ORDER BY pms.project_context_key ASC, datetime(pms.created_at) DESC, pms.id DESC
    `).all();
    const insert = d.prepare(`
      INSERT INTO project_memory_snapshot_index (
        project_context_key,
        latest_snapshot_id,
        latest_snapshot_version,
        latest_iteration,
        latest_snapshot_created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_context_key) DO UPDATE SET
        latest_snapshot_id = excluded.latest_snapshot_id,
        latest_snapshot_version = excluded.latest_snapshot_version,
        latest_iteration = excluded.latest_iteration,
        latest_snapshot_created_at = excluded.latest_snapshot_created_at,
        updated_at = excluded.updated_at
    `);
    const seenContexts = new Set();
    let indexedCount = 0;
    for (const snapshot of latestSnapshots) {
      if (seenContexts.has(snapshot.project_context_key)) continue;
      seenContexts.add(snapshot.project_context_key);
      insert.run(
        snapshot.project_context_key,
        snapshot.id,
        snapshot.snapshot_version,
        snapshot.iteration,
        snapshot.created_at,
        currentSqlTimestamp()
      );
      indexedCount += 1;
    }
    return {
      indexed_count: indexedCount,
      project_context_count: seenContexts.size,
    };
  })();
  log('coordinator', 'project_memory_snapshot_index_rebuilt', result);
  return result;
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

function listTasks(filters = {}) {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const vals = [];
  if (filters.status) { sql += ' AND status = ?'; vals.push(filters.status); }
  if (filters.request_id) { sql += ' AND request_id = ?'; vals.push(filters.request_id); }
  if (filters.assigned_to) { sql += ' AND assigned_to = ?'; vals.push(filters.assigned_to); }
  sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 WHEN \'low\' THEN 3 END, id';
  return getDb().prepare(sql).all(...vals);
}

function getTaskPriorityRank(priority) {
  return Object.prototype.hasOwnProperty.call(TASK_PRIORITY_RANK, priority)
    ? TASK_PRIORITY_RANK[priority]
    : Number.MAX_SAFE_INTEGER;
}

function extractPriorityOverrideTargetRequestId(description, sourceRequestId = null) {
  const text = String(description || '');
  if (!PRIORITY_OVERRIDE_MARKER_RE.test(text)) return null;

  const sourceId = typeof sourceRequestId === 'string' ? sourceRequestId.toLowerCase() : null;
  const requestIds = text.match(REQUEST_ID_TOKEN_RE) || [];
  for (const requestId of requestIds) {
    const normalizedId = requestId.toLowerCase();
    if (!sourceId || normalizedId !== sourceId) return normalizedId;
  }
  return null;
}

function getActivePriorityOverrideTargetRequestIds() {
  const requests = getDb().prepare(`
    SELECT id, description, status, created_at
    FROM requests
    ORDER BY datetime(created_at) DESC, id DESC
  `).all();
  if (!requests.length) return [];

  const requestStatusById = new Map();
  for (const request of requests) {
    requestStatusById.set(request.id, String(request.status || '').toLowerCase());
  }

  const orderedTargets = [];
  const seenTargets = new Set();
  for (const request of requests) {
    const targetRequestId = extractPriorityOverrideTargetRequestId(request.description, request.id);
    if (!targetRequestId || seenTargets.has(targetRequestId)) continue;
    const targetStatus = requestStatusById.get(targetRequestId);
    if (!targetStatus || REQUEST_TERMINAL_STATUSES.has(targetStatus)) continue;
    seenTargets.add(targetRequestId);
    orderedTargets.push(targetRequestId);
  }
  return orderedTargets;
}

function getReadyTasks() {
  // Tasks that are ready and have no unfinished dependencies,
  // excluding tasks whose parent request has reached a terminal state.
  const readyTasks = getDb().prepare(`
    SELECT t.* FROM tasks t
    JOIN requests r ON t.request_id = r.id
    WHERE t.status = 'ready' AND t.assigned_to IS NULL
      AND r.status NOT IN ('completed', 'failed')
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.id
  `).all();

  const priorityOverrideTargetIds = getActivePriorityOverrideTargetRequestIds();
  if (!priorityOverrideTargetIds.length || readyTasks.length <= 1) return readyTasks;

  const overrideRankByRequestId = new Map(priorityOverrideTargetIds.map((requestId, index) => [requestId, index]));
  return readyTasks.slice().sort((leftTask, rightTask) => {
    const leftOverrideRank = overrideRankByRequestId.has(leftTask.request_id)
      ? overrideRankByRequestId.get(leftTask.request_id)
      : Number.MAX_SAFE_INTEGER;
    const rightOverrideRank = overrideRankByRequestId.has(rightTask.request_id)
      ? overrideRankByRequestId.get(rightTask.request_id)
      : Number.MAX_SAFE_INTEGER;
    if (leftOverrideRank !== rightOverrideRank) return leftOverrideRank - rightOverrideRank;

    const leftPriorityRank = getTaskPriorityRank(leftTask.priority);
    const rightPriorityRank = getTaskPriorityRank(rightTask.priority);
    if (leftPriorityRank !== rightPriorityRank) return leftPriorityRank - rightPriorityRank;
    return leftTask.id - rightTask.id;
  });
}

function checkAndPromoteTasks() {
  const d = getDb();
  // Batch promote pending tasks with no dependencies in a single SQL statement,
  // but only for tasks whose parent request is still active (not completed or failed).
  d.prepare(`
    UPDATE tasks SET status = 'ready', updated_at = datetime('now')
    WHERE status = 'pending' AND (depends_on IS NULL OR depends_on = '[]')
      AND request_id IN (SELECT id FROM requests WHERE status NOT IN ('completed', 'failed'))
  `).run();

  // For tasks with dependencies, check each one (also excluding terminal-request tasks).
  const pending = d.prepare(
    `SELECT id, depends_on FROM tasks
     WHERE status = 'pending' AND depends_on IS NOT NULL AND depends_on != '[]'
       AND request_id IN (SELECT id FROM requests WHERE status NOT IN ('completed', 'failed'))`
  ).all();
  for (const task of pending) {
    let deps;
    try {
      deps = JSON.parse(task.depends_on);
    } catch (e) {
      updateTask(task.id, { status: 'failed', result: `Invalid depends_on JSON: ${e.message}` });
      continue;
    }
    if (!Array.isArray(deps)) {
      const msg = `Malformed depends_on for task ${task.id}: expected array, got ${JSON.stringify(deps)}`;
      console.error(`[db] checkAndPromoteTasks: ${msg}`);
      updateTask(task.id, { status: 'failed', result: msg });
      continue;
    }
    if (!deps.length) {
      updateTask(task.id, { status: 'ready' });
      continue;
    }
    const invalidDep = deps.find((d) => typeof d !== 'number' || !Number.isInteger(d) || d <= 0);
    if (invalidDep !== undefined) {
      const msg = `Malformed depends_on for task ${task.id}: invalid element ${JSON.stringify(invalidDep)}`;
      console.error(`[db] checkAndPromoteTasks: ${msg}`);
      updateTask(task.id, { status: 'failed', result: msg });
      continue;
    }
    const uniqueDeps = [...new Set(deps)];
    const depStatus = d.prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed
       FROM tasks
       WHERE id IN (${uniqueDeps.map(() => '?').join(',')})`
    ).get(...uniqueDeps);
    if (depStatus.total === uniqueDeps.length && depStatus.completed === uniqueDeps.length) {
      updateTask(task.id, { status: 'ready' });
    }
  }
}

function replanTaskDependency({ fromTaskId, toTaskId, requestId = null } = {}) {
  const fromId = Number(fromTaskId);
  const toId = Number(toTaskId);
  if (!Number.isInteger(fromId) || fromId <= 0) {
    throw new Error('fromTaskId must be a positive integer');
  }
  if (!Number.isInteger(toId) || toId <= 0) {
    throw new Error('toTaskId must be a positive integer');
  }
  if (fromId === toId) {
    throw new Error('fromTaskId and toTaskId must be different');
  }

  const fromTask = getTask(fromId);
  if (!fromTask) {
    throw new Error(`Task ${fromId} not found`);
  }
  const replacementTask = getTask(toId);
  if (!replacementTask) {
    throw new Error(`Task ${toId} not found`);
  }
  if (replacementTask.status === 'failed') {
    throw new Error(`Task ${toId} is failed and cannot be used as a replacement dependency`);
  }

  const normalizedRequestId = requestId === null || requestId === undefined
    ? null
    : String(requestId).trim() || null;
  const d = getDb();
  const replanned = d.transaction(() => {
    const queryBase = `
      SELECT id, depends_on
      FROM tasks
      WHERE status = 'pending'
        AND depends_on IS NOT NULL
        AND depends_on != '[]'
    `;
    const scopedSql = normalizedRequestId
      ? `${queryBase} AND request_id = ? ORDER BY id`
      : `${queryBase} ORDER BY id`;
    const rows = normalizedRequestId
      ? d.prepare(scopedSql).all(normalizedRequestId)
      : d.prepare(scopedSql).all();

    const updatedTaskIds = [];
    const promotedTaskIds = [];
    for (const row of rows) {
      let deps;
      try {
        deps = JSON.parse(row.depends_on);
      } catch {
        continue;
      }
      if (!Array.isArray(deps) || deps.length === 0) continue;
      const touchesSource = deps.some((dep) => Number(dep) === fromId);
      if (!touchesSource) continue;

      const seen = new Set();
      const rewritten = [];
      for (const dep of deps) {
        const candidate = Number(dep) === fromId ? toId : dep;
        const dedupeKey = String(candidate);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        rewritten.push(candidate);
      }
      updateTask(row.id, { depends_on: rewritten.length ? JSON.stringify(rewritten) : null });
      updatedTaskIds.push(row.id);
    }

    checkAndPromoteTasks();
    for (const taskId of updatedTaskIds) {
      const task = getTask(taskId);
      if (task && task.status === 'ready') {
        promotedTaskIds.push(taskId);
      }
    }
    return { updatedTaskIds, promotedTaskIds };
  })();

  log('coordinator', 'dependency_replanned', {
    request_id: normalizedRequestId,
    from_task_id: fromId,
    to_task_id: toId,
    updated_task_ids: replanned.updatedTaskIds,
    promoted_task_ids: replanned.promotedTaskIds,
  });
  return {
    request_id: normalizedRequestId,
    from_task_id: fromId,
    to_task_id: toId,
    updated_task_ids: replanned.updatedTaskIds,
    promoted_task_ids: replanned.promotedTaskIds,
    updated_count: replanned.updatedTaskIds.length,
    promoted_count: replanned.promotedTaskIds.length,
  };
}

// --- Worker helpers ---

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
          if (workerStatus === 'idle' && currentTaskId !== taskId) {
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
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
    FROM tasks WHERE request_id = ?
  `).get(requestId);
  const total = Number(row.total) || 0;
  const completed = Number(row.completed) || 0;
  const failed = Number(row.failed) || 0;
  const zeroTaskCompleted = total === 0 && requestStatus === 'completed';
  const zeroTaskFailed = total === 0 && requestStatus === 'failed';
  const allCompleted = (total > 0 && completed === total) || zeroTaskCompleted;
  const allFailed = (total > 0 && failed === total) || zeroTaskFailed;
  return {
    request_id: requestId,
    request_status: requestStatus,
    total,
    completed,
    failed,
    all_completed: allCompleted,
    all_done: allCompleted || allFailed,
    stale_decomposed_recovered: repaired.length > 0,
  };
}

function normalizeUsdNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getUsageCostBurnRate(requestId = null) {
  const burnWindowRow = getDb().prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN completed_at >= datetime('now', '-15 minutes') THEN COALESCE(usage_cost_usd, 0)
        ELSE 0
      END), 0) AS usd_15m,
      COALESCE(SUM(CASE
        WHEN completed_at >= datetime('now', '-60 minutes') THEN COALESCE(usage_cost_usd, 0)
        ELSE 0
      END), 0) AS usd_60m,
      COALESCE(SUM(COALESCE(usage_cost_usd, 0)), 0) AS usd_24h
    FROM tasks
    WHERE status IN ('completed', 'failed')
      AND completed_at IS NOT NULL
      AND completed_at >= datetime('now', '-24 hours')
  `).get() || {};

  let normalizedRequestId = null;
  let requestTotalUsd = 0;
  if (requestId !== null && requestId !== undefined) {
    const trimmedRequestId = String(requestId).trim();
    if (trimmedRequestId) {
      normalizedRequestId = trimmedRequestId;
      const requestRow = getDb().prepare(`
        SELECT COALESCE(SUM(COALESCE(usage_cost_usd, 0)), 0) AS total_usd
        FROM tasks
        WHERE request_id = ?
          AND status IN ('completed', 'failed')
          AND completed_at IS NOT NULL
      `).get(trimmedRequestId) || {};
      requestTotalUsd = normalizeUsdNumber(requestRow.total_usd);
    }
  }

  return {
    usd_15m: normalizeUsdNumber(burnWindowRow.usd_15m),
    usd_60m: normalizeUsdNumber(burnWindowRow.usd_60m),
    usd_24h: normalizeUsdNumber(burnWindowRow.usd_24h),
    request_id: normalizedRequestId,
    request_total_usd: requestTotalUsd,
  };
}

function getRequestLatestCompletedTaskCursor(requestId) {
  if (requestId === null || requestId === undefined) return null;
  const normalizedRequestId = String(requestId).trim();
  if (!normalizedRequestId) return null;

  const row = getDb().prepare(`
    SELECT id, completed_at, updated_at, created_at
    FROM tasks
    WHERE request_id = ?
      AND status = 'completed'
    ORDER BY COALESCE(completed_at, updated_at, created_at) DESC, id DESC
    LIMIT 1
  `).get(normalizedRequestId);
  if (!row) return null;

  return buildCompletedTaskCursor(
    row.completed_at || row.updated_at || row.created_at,
    row.id
  );
}

function hasRequestCompletedTaskProgressSince(requestId, beforeCursor, afterCursor = undefined) {
  if (requestId === null || requestId === undefined) return false;
  const normalizedRequestId = String(requestId).trim();
  if (!normalizedRequestId) return false;

  const parsedBefore = parseCompletedTaskCursor(beforeCursor);
  if (!parsedBefore) return false;

  let parsedAfter = parseCompletedTaskCursor(afterCursor);
  if (!parsedAfter && afterCursor === undefined) {
    parsedAfter = parseCompletedTaskCursor(getRequestLatestCompletedTaskCursor(normalizedRequestId));
  }
  if (!parsedAfter) return false;

  return compareCompletedTaskCursors(parsedBefore, parsedAfter) < 0;
}

// --- Mail helpers ---

function sendMail(recipient, type, payload = {}) {
  getDb().prepare(`
    INSERT INTO mail (recipient, type, payload) VALUES (?, ?, ?)
  `).run(recipient, type, JSON.stringify(payload));
}

function normalizeMailFilters(filters) {
  if (!filters || typeof filters !== 'object') return {};
  const normalized = {};
  if (typeof filters.type === 'string') normalized.type = filters.type;
  if (typeof filters.request_id === 'string') normalized.request_id = filters.request_id;
  return normalized;
}

function parseMailRows(rows) {
  return rows.map((m) => {
    try {
      return { ...m, payload: JSON.parse(m.payload) };
    } catch (e) {
      return { ...m, payload: { _raw: m.payload, _parse_error: true } };
    }
  });
}

function filterMailRows(rows, filters) {
  if (!Object.prototype.hasOwnProperty.call(filters, 'request_id')) return rows;
  const desiredRequestId = filters.request_id;
  return rows.filter((row) => {
    const payload = row.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
    const requestId = payload.request_id;
    if (requestId === null || requestId === undefined) return false;
    return String(requestId) === desiredRequestId;
  });
}

function prepareMailLookup(d, recipient, filters) {
  let sql = 'SELECT * FROM mail WHERE recipient = ? AND consumed = 0';
  const params = [recipient];
  if (Object.prototype.hasOwnProperty.call(filters, 'type')) {
    sql += ' AND type = ?';
    params.push(filters.type);
  }
  sql += ' ORDER BY id';
  return { stmt: d.prepare(sql), params };
}

function checkMail(recipient, consume = true, filters = {}) {
  const d = getDb();
  const normalizedFilters = normalizeMailFilters(filters);
  const { stmt, params } = prepareMailLookup(d, recipient, normalizedFilters);
  const loadMatchingMessages = () => {
    const parsed = parseMailRows(stmt.all(...params));
    return filterMailRows(parsed, normalizedFilters);
  };

  let messages;
  if (consume) {
    // Atomic read-and-consume: transaction prevents two consumers reading the same messages
    const txn = d.transaction(() => {
      const msgs = loadMatchingMessages();
      if (msgs.length > 0) {
        const ids = msgs.map(m => m.id);
        d.prepare(
          `UPDATE mail SET consumed = 1 WHERE id IN (${ids.map(() => '?').join(',')})`
        ).run(...ids);
      }
      return msgs;
    });
    messages = txn();
  } else {
    messages = loadMatchingMessages();
  }
  return messages;
}

function purgeOldMail(days) {
  const result = getDb().prepare(
    "DELETE FROM mail WHERE consumed = 1 AND created_at < datetime('now', '-' || ? || ' days')"
  ).run(days);
  return result.changes;
}

function checkMailBlocking(recipient, timeoutMs = 300000, pollMs = 1000, consume = true, filters = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = checkMail(recipient, consume, filters);
    if (msgs.length > 0) return msgs;
    // Sync sleep for polling (used by CLI, not coordinator)
    const waitMs = Math.min(pollMs, deadline - Date.now());
    if (waitMs > 0) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
    }
  }
  return [];
}

// --- Merge queue helpers ---

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

// --- Activity log ---

function log(actor, action, details = {}) {
  getDb().prepare(`
    INSERT INTO activity_log (actor, action, details) VALUES (?, ?, ?)
  `).run(actor, action, JSON.stringify(details));
}

function getLog(limit = 50, actor) {
  if (actor) {
    return getDb().prepare('SELECT * FROM activity_log WHERE actor = ? ORDER BY id DESC LIMIT ?').all(actor, limit);
  }
  return getDb().prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit);
}

// --- Config helpers ---

function getConfig(key) {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setConfig(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value));
}

// --- Preset helpers ---

function savePreset(name, projectDir, githubRepo, numWorkers) {
  getDb().prepare(`
    INSERT INTO presets (name, project_dir, github_repo, num_workers)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      project_dir = excluded.project_dir,
      github_repo = excluded.github_repo,
      num_workers = excluded.num_workers,
      updated_at = datetime('now')
  `).run(name, projectDir, githubRepo || '', numWorkers || 4);
}

function listPresets() {
  return getDb().prepare('SELECT * FROM presets ORDER BY updated_at DESC').all();
}

function getPreset(id) {
  return getDb().prepare('SELECT * FROM presets WHERE id = ?').get(id);
}

function deletePreset(id) {
  const result = getDb().prepare('DELETE FROM presets WHERE id = ?').run(id);
  return result.changes > 0;
}

// --- Overlap detection helpers ---

function findOverlappingTasks(requestId, files) {
  if (!files || files.length === 0) return [];
  // Normalize paths: strip leading './'
  const normalize = (f) => f.replace(/^\.\//, '');
  const normalizedFiles = files.map(normalize);

  // Find other tasks in the same request that have overlapping files
  const tasks = getDb().prepare(
    "SELECT id, files, overlap_with FROM tasks WHERE request_id = ? AND files IS NOT NULL"
  ).all(requestId);

  const overlaps = [];
  for (const task of tasks) {
    let taskFiles;
    try { taskFiles = JSON.parse(task.files).map(normalize); } catch { continue; }
    const shared = normalizedFiles.filter(f => taskFiles.includes(f));
    if (shared.length > 0) {
      overlaps.push({ task_id: task.id, shared_files: shared, count: shared.length });
    }
  }
  return overlaps;
}

function getOverlapsForRequest(requestId) {
  const tasks = getDb().prepare(
    "SELECT id, subject, files, overlap_with FROM tasks WHERE request_id = ? AND overlap_with IS NOT NULL"
  ).all(requestId);

  const pairs = [];
  const seen = new Set();
  for (const task of tasks) {
    let overlapIds;
    try { overlapIds = JSON.parse(task.overlap_with); } catch { continue; }
    for (const otherId of overlapIds) {
      const key = [Math.min(task.id, otherId), Math.max(task.id, otherId)].join('-');
      if (seen.has(key)) continue;
      seen.add(key);

      const other = getDb().prepare("SELECT id, subject, files FROM tasks WHERE id = ?").get(otherId);
      if (!other) continue;

      // Calculate shared files
      const normalize = (f) => f.replace(/^\.\//, '');
      let filesA, filesB;
      try { filesA = JSON.parse(task.files).map(normalize); } catch { continue; }
      try { filesB = JSON.parse(other.files).map(normalize); } catch { continue; }
      const shared = filesA.filter(f => filesB.includes(f));
      const severity = shared.length >= 3 ? 'critical' : shared.length >= 2 ? 'high' : 'low';

      pairs.push({
        task_a: task.id,
        task_b: other.id,
        subject_a: task.subject,
        subject_b: other.subject,
        shared_files: shared,
        severity,
      });
    }
  }
  return pairs;
}

function hasOverlappingMergedTasks(taskId) {
  const task = getDb().prepare("SELECT overlap_with FROM tasks WHERE id = ?").get(taskId);
  if (!task || !task.overlap_with) return [];

  let overlapIds;
  try { overlapIds = JSON.parse(task.overlap_with); } catch { return []; }
  if (overlapIds.length === 0) return [];

  // Check which overlapping tasks have been merged
  const merged = getDb().prepare(`
    SELECT t.id, t.subject, t.branch, mq.status as merge_status
    FROM tasks t
    JOIN merge_queue mq ON mq.task_id = t.id
    WHERE t.id IN (${overlapIds.map(() => '?').join(',')})
      AND mq.status = 'merged'
  `).all(...overlapIds);

  return merged;
}

// --- Change tracking helpers ---

function createChange({ description, domain, file_path, function_name, tooltip, status }) {
  const result = getDb().prepare(`
    INSERT INTO changes (description, domain, file_path, function_name, tooltip, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    description,
    domain || null,
    file_path || null,
    function_name || null,
    tooltip || null,
    status || 'active'
  );
  return result.lastInsertRowid;
}

function getChange(id) {
  return getDb().prepare('SELECT * FROM changes WHERE id = ?').get(id);
}

function listChanges(filters = {}) {
  let sql = 'SELECT * FROM changes WHERE 1=1';
  const vals = [];
  if (filters.domain) { sql += ' AND domain = ?'; vals.push(filters.domain); }
  if (filters.status) { sql += ' AND status = ?'; vals.push(filters.status); }
  sql += ' ORDER BY id DESC';
  return getDb().prepare(sql).all(...vals);
}

function updateChange(id, fields) {
  validateColumns('changes', fields);
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  getDb().prepare(`UPDATE changes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

// --- Loop helpers ---

function createLoop(prompt) {
  const result = getDb().prepare(`
    INSERT INTO loops (prompt) VALUES (?)
  `).run(prompt);
  log('coordinator', 'loop_created', { loop_id: result.lastInsertRowid, prompt: prompt.slice(0, 200) });
  return result.lastInsertRowid;
}

function getLoop(id) {
  return getDb().prepare('SELECT * FROM loops WHERE id = ?').get(id);
}

function updateLoop(id, fields) {
  validateColumns('loops', fields);
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  sets.push("updated_at = datetime('now')");
  vals.push(id);
  getDb().prepare(`UPDATE loops SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function setLoopPrompt(id, prompt, allowedStatuses = ['active', 'paused']) {
  const normalizedPrompt = String(prompt || '');
  if (!normalizedPrompt.trim()) {
    return { ok: false, error: 'prompt must be a non-empty string' };
  }
  const allowed = Array.isArray(allowedStatuses)
    ? allowedStatuses.map((status) => String(status))
    : ['active', 'paused'];
  const txn = getDb().transaction(() => {
    const loop = getLoop(id);
    if (!loop) return { ok: false, error: 'Loop not found' };
    if (!allowed.includes(loop.status)) {
      return { ok: false, error: `Loop is ${loop.status}, prompt can only be updated for active or paused loops` };
    }
    updateLoop(id, { prompt: normalizedPrompt });
    const updated = getLoop(id);
    return { ok: true, loop: updated };
  });
  return txn();
}

function refreshLoopPrompt(id, prompt) {
  return setLoopPrompt(id, prompt, ['active']);
}

function listLoops(status) {
  if (status) return getDb().prepare('SELECT * FROM loops WHERE status = ? ORDER BY id DESC').all(status);
  return getDb().prepare('SELECT * FROM loops ORDER BY id DESC').all();
}

function stopLoop(id) {
  getDb().prepare(`
    UPDATE loops SET status = 'stopped', stopped_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
  `).run(id);
  log('coordinator', 'loop_stopped', { loop_id: id });
}

// --- Loop-request helpers ---

const LOOP_REQUEST_FILE_SIGNAL_RE = /\b(?:[a-z0-9._-]+\/)+[a-z0-9._-]+(?:\.[a-z0-9]{1,12})?\b/i;
const LOOP_REQUEST_WHAT_SIGNAL_RE = /\b(add|remove|update|fix|prevent|refactor|validate|guard|handle|enforce|dedup|dedupe|retry|throttle|cache|instrument|harden|optimi[sz]e|replace|sync|align|extend|improve)\b/i;
const LOOP_REQUEST_WHY_SIGNAL_RE = /\b(production|prod|incident|outage|risk|regression|failure|downtime|availability|integrity|security|data\s+loss|overspend|latency|throughput)\b/i;

function normalizeLoopRequestText(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIntConfig(key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = getConfig(key);
  if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number.parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseFloatConfig(key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = getConfig(key);
  if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
  const parsed = Number.parseFloat(String(raw).trim());
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function buildSimilarityNgrams(value) {
  const tokens = normalizeLoopRequestText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
  if (tokens.length <= 1) return tokens;
  const ngrams = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    ngrams.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return ngrams;
}

function buildFrequencyMap(values) {
  const freq = new Map();
  for (const value of values) {
    freq.set(value, (freq.get(value) || 0) + 1);
  }
  return freq;
}

function computeLoopRequestSimilarity(left, right) {
  const leftNgrams = buildSimilarityNgrams(left);
  const rightNgrams = buildSimilarityNgrams(right);
  if (leftNgrams.length === 0 || rightNgrams.length === 0) return 0;

  const leftFreq = buildFrequencyMap(leftNgrams);
  const rightFreq = buildFrequencyMap(rightNgrams);
  const leftTotal = leftNgrams.length;
  const rightTotal = rightNgrams.length;
  let overlap = 0;
  for (const [ngram, leftCount] of leftFreq.entries()) {
    const rightCount = rightFreq.get(ngram) || 0;
    overlap += Math.min(leftCount, rightCount);
  }
  return (2 * overlap) / (leftTotal + rightTotal);
}

function findMostSimilarLoopRequest(candidates, targetDescription, threshold) {
  let bestMatch = null;
  for (const candidate of candidates) {
    const similarity = computeLoopRequestSimilarity(candidate.description, targetDescription);
    if (similarity < threshold) continue;
    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { ...candidate, similarity };
    }
  }
  return bestMatch;
}

function evaluateLoopRequestQuality(description, minDescriptionChars = 180) {
  const text = normalizeLoopRequestText(description);
  const issues = [];
  if (text.length < minDescriptionChars) {
    issues.push(`description too short (${text.length} < ${minDescriptionChars})`);
  }
  if (!LOOP_REQUEST_FILE_SIGNAL_RE.test(text)) {
    issues.push('missing concrete file path signal (WHERE)');
  }
  if (!LOOP_REQUEST_WHAT_SIGNAL_RE.test(text)) {
    issues.push('missing concrete change verb (WHAT)');
  }
  if (!LOOP_REQUEST_WHY_SIGNAL_RE.test(text)) {
    issues.push('missing production impact/risk signal (WHY)');
  }
  return { ok: issues.length === 0, issues };
}

function createLoopRequest(description, loopId) {
  const normalizedDescription = normalizeLoopRequestText(description);
  const qualityGateEnabled = String(getConfig('loop_request_quality_gate') || 'true').toLowerCase() !== 'false';
  const minDescriptionChars = parseIntConfig('loop_request_min_description_chars', 180, { min: 80, max: 5000 });
  const loopRequestMinIntervalSec = parseIntConfig('loop_request_min_interval_sec', 0, { min: 0, max: 86400 });
  const loopRequestMaxPerHour = parsePositiveInt(getConfig('loop_request_max_per_hour'));
  const loopRequestSimilarityThreshold = parseFloatConfig(
    'loop_request_similarity_threshold',
    DEFAULT_LOOP_REQUEST_SIMILARITY_THRESHOLD,
    { min: 0.5, max: 0.99 }
  );

  if (qualityGateEnabled) {
    const quality = evaluateLoopRequestQuality(normalizedDescription, minDescriptionChars);
    if (!quality.ok) {
      log('loop', 'loop_request_rejected_quality', {
        loop_id: loopId,
        reason: quality.issues.join('; '),
        description: normalizedDescription.slice(0, 300),
      });
      return {
        id: null,
        deduplicated: true,
        suppressed: true,
        reason: 'quality_gate',
        details: quality.issues,
      };
    }
  }

  const d = getDb();
  const txn = d.transaction(() => {
    // Check for active (non-completed/failed) request from same loop with same description
    const existing = d.prepare(`
      SELECT id FROM requests
      WHERE loop_id = ? AND description = ? AND status NOT IN ('completed', 'failed')
    `).get(loopId, normalizedDescription);
    if (existing) {
      return {
        id: existing.id,
        deduplicated: true,
        suppressed: false,
        reason: 'exact_active_duplicate',
      };
    }

    const activeCandidates = d.prepare(`
      SELECT id, description
      FROM requests
      WHERE loop_id = ? AND status NOT IN ('completed', 'failed')
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `).all(loopId, LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT);
    const similarActive = findMostSimilarLoopRequest(activeCandidates, normalizedDescription, loopRequestSimilarityThreshold);
    if (similarActive) {
      return {
        id: similarActive.id,
        deduplicated: true,
        suppressed: false,
        reason: 'similar_active_duplicate',
      };
    }

    if (loopRequestMinIntervalSec > 0) {
      const mostRecent = d.prepare(`
        SELECT id, created_at
        FROM requests
        WHERE loop_id = ?
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT 1
      `).get(loopId);
      if (mostRecent) {
        const ageMs = coordinatorAgeMs(mostRecent.created_at);
        const cooldownMs = loopRequestMinIntervalSec * 1000;
        if (ageMs !== null && ageMs < cooldownMs) {
          const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - ageMs) / 1000));
          log('loop', 'loop_request_suppressed', {
            loop_id: loopId,
            reason: 'cooldown',
            retry_after_sec: retryAfterSec,
            min_interval_sec: loopRequestMinIntervalSec,
          });
          return {
            id: null,
            deduplicated: false,
            suppressed: true,
            reason: 'cooldown',
            retry_after_sec: retryAfterSec,
          };
        }
      }
    }

    if (loopRequestMaxPerHour !== null) {
      const recentWindow = d.prepare(`
        SELECT COUNT(*) AS request_count, MIN(created_at) AS oldest_created_at
        FROM requests
        WHERE loop_id = ? AND created_at >= datetime('now', '-1 hour')
      `).get(loopId);
      const requestCount = Number.parseInt(String(recentWindow?.request_count ?? 0), 10) || 0;
      if (requestCount >= loopRequestMaxPerHour) {
        const retryAfterSec = computeLoopRequestRetryAfterSec(recentWindow?.oldest_created_at ?? null);
        log('loop', 'loop_request_suppressed', {
          loop_id: loopId,
          reason: 'rate_limit',
          retry_after_sec: retryAfterSec,
          max_per_hour: loopRequestMaxPerHour,
        });
        return {
          id: null,
          deduplicated: false,
          suppressed: true,
          reason: 'rate_limit',
          retry_after_sec: retryAfterSec,
        };
      }
    }

    const recentSimilarCandidates = d.prepare(`
      SELECT id, description, status
      FROM requests
      WHERE loop_id = ?
        AND status IN ('completed', 'failed')
        AND created_at >= datetime('now', ?)
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT ?
    `).all(loopId, `-${LOOP_REQUEST_SIMILAR_RECENT_WINDOW_HOURS} hours`, LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT);
    const similarRecent = findMostSimilarLoopRequest(
      recentSimilarCandidates,
      normalizedDescription,
      loopRequestSimilarityThreshold
    );
    if (similarRecent) {
      log('loop', 'loop_request_suppressed', {
        loop_id: loopId,
        reason: 'similar_recent_duplicate',
        duplicate_of: similarRecent.id,
        duplicate_status: similarRecent.status,
      });
      return {
        id: similarRecent.id,
        deduplicated: true,
        suppressed: true,
        reason: 'similar_recent_duplicate',
      };
    }

    const id = 'req-' + crypto.randomBytes(4).toString('hex');
    d.prepare(`
      INSERT INTO requests (id, description, loop_id) VALUES (?, ?, ?)
    `).run(id, normalizedDescription, loopId);
    sendMail('architect', 'new_request', { request_id: id, description: normalizedDescription, loop_id: loopId });
    sendMail('master-1', 'request_acknowledged', { request_id: id, description: normalizedDescription, loop_id: loopId });
    log('loop', 'loop_request_created', { request_id: id, loop_id: loopId, description: normalizedDescription });
    return { id, deduplicated: false, suppressed: false };
  });
  return txn();
}

function listLoopRequests(loopId) {
  return getDb().prepare('SELECT * FROM requests WHERE loop_id = ? ORDER BY created_at DESC').all(loopId);
}

module.exports = {
  init, close, getDb,
  coordinatorAgeMs,
  createRequest, getRequest, updateRequest, listRequests,
  createTask, getTask, updateTask, transitionTaskBrowserOffload,
  createProjectMemorySnapshot,
  getProjectMemorySnapshot,
  getLatestProjectMemorySnapshot,
  listProjectMemorySnapshots,
  createInsightArtifact,
  getInsightArtifact,
  listInsightArtifacts,
  createProjectMemoryLineageLink,
  listProjectMemoryLineageLinks,
  rebuildProjectMemorySnapshotIndex,
  enqueueResearchIntent, getResearchIntent, scoreResearchIntentCandidates, materializeResearchBatchPlan,
  getResearchBatch, listResearchBatchStages, listResearchIntentFanout, markResearchBatchStage,
  listTasks, getReadyTasks, checkAndPromoteTasks, replanTaskDependency,
  registerWorker, getWorker, updateWorker, getIdleWorkers, getAllWorkers, claimWorker, releaseWorker,
  recoverStalledAssignments,
  recoverStaleDecomposedZeroTaskRequests, checkRequestCompletion,
  getUsageCostBurnRate, getRequestLatestCompletedTaskCursor, hasRequestCompletedTaskProgressSince,
  sendMail, checkMail, checkMailBlocking, purgeOldMail,
  enqueueMerge, getNextMerge, updateMerge,
  log, getLog,
  getConfig, setConfig,
  savePreset, listPresets, getPreset, deletePreset,
  findOverlappingTasks, getOverlapsForRequest, hasOverlappingMergedTasks,
  createChange, getChange, listChanges, updateChange,
  createLoop, getLoop, updateLoop, setLoopPrompt, refreshLoopPrompt, listLoops, stopLoop,
  evaluateLoopRequestQuality,
  createLoopRequest, listLoopRequests,
};
