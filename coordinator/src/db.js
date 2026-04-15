'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const migrations = require('./db/migrations');
const { createRequestRepository } = require('./db/requests');
const { createTaskRepository } = require('./db/tasks');
const { createWorkerRepository } = require('./db/workers');
const { createMergeQueueRepository } = require('./db/merge-queue');
const { createMailRepository } = require('./db/mail');
const { createConfigRepository } = require('./db/config');
const { createLogRepository } = require('./db/log');
const { createBrowserRepository } = require('./db/browser');
const { createMemoryRepository } = require('./db/memory');
const { createResearchRepository } = require('./db/research');
const { createChangesRepository } = require('./db/changes');
const { createLoopsRepository } = require('./db/loops');
const { createDomainAnalysisRepository } = require('./db/domain-analysis');
const { createExtendedResearchRepository } = require('./db/extended-research');

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
const TASK_TERMINAL_STATUSES = new Set(['completed', 'failed', 'superseded', 'failed_needs_reroute', 'failed_final']);
const TASK_PRIORITY_RANK = Object.freeze({ urgent: 0, high: 1, normal: 2, low: 3 });
const PRIORITY_OVERRIDE_MARKER_RE = /\bpriority\s+override\b/i;
const REQUEST_ID_TOKEN_RE = /\breq-[a-f0-9]{8}\b/gi;
const AUTONOMOUS_REQUEST_SIGNATURES = Object.freeze([
  Object.freeze({ id: 'master2_header', pattern: /You are \*\*Master-2: Architect\*\*/i }),
  Object.freeze({ id: 'worker_header', pattern: /You are a coding worker in the mac10 multi-agent system/i }),
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

function isTerminalTaskStatus(status) {
  if (status === null || status === undefined) return false;
  const normalized = String(status).trim().toLowerCase();
  return TASK_TERMINAL_STATUSES.has(normalized);
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
  requests: new Set(['description', 'tier', 'status', 'result', 'completed_at', 'loop_id', 'status_cause', 'previous_status']),
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
    'started_at', 'completed_at', 'result', 'blocking',
  ]),
  workers: new Set(['status', 'domain', 'worktree_path', 'branch', 'tmux_session', 'tmux_window', 'pid', 'current_task_id', 'claimed_by', 'claimed_at', 'last_heartbeat', 'launched_at', 'tasks_completed', 'backend']),
  task_sandboxes: new Set([
    'task_id', 'request_id', 'worker_id', 'backend', 'status', 'sandbox_name',
    'sandbox_path', 'worktree_path', 'branch', 'metadata', 'error',
    'started_at', 'stopped_at', 'cleaned_at',
  ]),
  merge_queue: new Set([
    'status', 'priority', 'completion_checkpoint', 'merged_at', 'error',
    'head_sha', 'worker_id', 'failure_class', 'retry_count', 'fingerprint', 'last_fingerprint_at',
  ]),
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

const TASK_SANDBOX_STATUSES = new Set([
  'allocated', 'preparing', 'ready', 'running', 'stopped', 'failed', 'cleaned',
]);
const TASK_SANDBOX_BACKENDS = new Set(['pending', 'tmux', 'docker', 'sandbox', 'none']);
const TASK_SANDBOX_ALLOWED_TRANSITIONS = Object.freeze({
  allocated: new Set(['preparing', 'ready', 'running', 'failed', 'cleaned']),
  preparing: new Set(['ready', 'running', 'failed', 'cleaned']),
  ready: new Set(['running', 'stopped', 'failed', 'cleaned']),
  running: new Set(['stopped', 'failed', 'cleaned']),
  stopped: new Set(['cleaned']),
  failed: new Set(['cleaned']),
  cleaned: new Set(),
});

// --- Browser offload persistence schema and constants ---

const BROWSER_SESSION_STATUS_SEQUENCE = Object.freeze([
  'initializing', 'active', 'idle', 'expiring', 'expired', 'terminated',
]);
const BROWSER_SESSION_ALLOWED_TRANSITIONS = Object.freeze({
  initializing: new Set(['active', 'terminated']),
  active: new Set(['idle', 'expiring', 'terminated']),
  idle: new Set(['active', 'expiring', 'terminated']),
  expiring: new Set(['expired', 'terminated']),
  expired: new Set(),
  terminated: new Set(),
});
const BROWSER_SESSION_SAFE_UPDATE_KEYS = new Set([
  'auth_token', 'session_token', 'auth_expires_at', 'session_expires_at',
  'safety_policy', 'safety_policy_state', 'metadata', 'terminated_at',
]);

const BROWSER_RESEARCH_JOB_STATUS_SEQUENCE = Object.freeze([
  'pending', 'queued', 'running', 'awaiting_callback', 'completed', 'failed', 'cancelled',
]);
const BROWSER_RESEARCH_JOB_ALLOWED_TRANSITIONS = Object.freeze({
  pending: new Set(['queued', 'cancelled']),
  queued: new Set(['running', 'failed', 'cancelled']),
  running: new Set(['awaiting_callback', 'completed', 'failed', 'cancelled']),
  awaiting_callback: new Set(['completed', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
});
const BROWSER_RESEARCH_JOB_SAFE_UPDATE_KEYS = new Set([
  'result_payload', 'error', 'attempt_count', 'started_at', 'completed_at',
]);

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
  migrations.runPreSchemaMigrations(db);

  // Now safe to run full schema (CREATE TABLE IF NOT EXISTS + indexes)
  migrations.applySchema(db);
  migrations.runPostSchemaMigrations(db, {
    researchDefaults: {
      researchBatchSizeCap: DEFAULT_RESEARCH_BATCH_SIZE_CAP,
      researchTimeoutWindowMs: DEFAULT_RESEARCH_TIMEOUT_WINDOW_MS,
      researchCandidateLimit: DEFAULT_RESEARCH_CANDIDATE_LIMIT,
    },
  });

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

const logRepository = createLogRepository({
  getDb,
});

const {
  log,
  getLog,
} = logRepository;

const configRepository = createConfigRepository({
  getDb,
});

const {
  getConfig,
  setConfig,
  savePreset,
  listPresets,
  getPreset,
  deletePreset,
} = configRepository;

const mailRepository = createMailRepository({
  getDb,
});

const {
  sendMail,
  checkMail,
  checkMailBlocking,
  purgeOldMail,
} = mailRepository;

const mergeQueueRepository = createMergeQueueRepository({
  getDb,
  validateColumns,
  parseCompletedTaskCursor,
  currentSqlTimestamp,
});

const {
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
} = mergeQueueRepository;

const requestRepository = createRequestRepository({
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
});

const workerRepository = createWorkerRepository({
  getDb,
  validateColumns,
  parsePositiveInt,
  coordinatorAgeMs,
  getConfig,
  sendMail,
  log,
  DEFAULT_STALLED_ASSIGNMENT_RECOVERY_SEC,
  DEFAULT_TASK_LIVENESS_MAX_REASSIGNMENTS,
});

const {
  registerWorker,
  getWorker,
  updateWorker,
  getIdleWorkers,
  getAllWorkers,
  claimWorker,
  releaseWorker,
  recoverStalledAssignments,
} = workerRepository;

const taskRepository = createTaskRepository({
  getDb,
  validateColumns,
  buildSqlInClause,
  log,
  getWorker,
  REQUEST_TERMINAL_STATUSES,
  TASK_PRIORITY_RANK,
  PRIORITY_OVERRIDE_MARKER_RE,
  REQUEST_ID_TOKEN_RE,
  TASK_SANDBOX_STATUSES,
  TASK_SANDBOX_BACKENDS,
  TASK_SANDBOX_ALLOWED_TRANSITIONS,
});

const {
  createTask,
  getTask,
  updateTask,
  createTaskSandbox,
  getTaskSandbox,
  getActiveTaskSandboxForTask,
  updateTaskSandbox,
  transitionTaskSandbox,
  listTaskSandboxes,
  cleanupTaskSandboxes,
  appendTaskMergeHistory,
  getRequestMergeHistory,
  listTasks,
  getReadyTasks,
  checkAndPromoteTasks,
  replanTaskDependency,
} = taskRepository;

const {
  createRequest,
  getRequest,
  updateRequest,
  listRequests,
  recoverStaleDecomposedZeroTaskRequests,
  checkRequestCompletion,
  reconcileRequestLifecycle,
  reconcileAllActiveRequests,
} = requestRepository;

const browserRepository = createBrowserRepository({
  getDb,
  getTask,
  updateTask,
  currentSqlTimestamp,
  BROWSER_OFFLOAD_STATUS_SEQUENCE,
  BROWSER_OFFLOAD_ALLOWED_TRANSITIONS,
  BROWSER_SESSION_STATUS_SEQUENCE,
  BROWSER_SESSION_ALLOWED_TRANSITIONS,
  BROWSER_SESSION_SAFE_UPDATE_KEYS,
  BROWSER_RESEARCH_JOB_STATUS_SEQUENCE,
  BROWSER_RESEARCH_JOB_ALLOWED_TRANSITIONS,
  BROWSER_RESEARCH_JOB_SAFE_UPDATE_KEYS,
});

const {
  transitionTaskBrowserOffload,
  createBrowserSession,
  getBrowserSession,
  updateBrowserSession,
  transitionBrowserSession,
  createBrowserResearchJob,
  getBrowserResearchJob,
  updateBrowserResearchJob,
  transitionBrowserResearchJob,
  appendBrowserCallbackEvent,
  getBrowserCallbackEvents,
} = browserRepository;

const memoryRepository = createMemoryRepository({
  getDb,
  log,
  currentSqlTimestamp,
  normalizeStructuredPayload,
  normalizeOptionalLineageId,
  normalizeProjectMemoryLineageType,
  normalizeProjectMemoryFingerprint,
  normalizeProjectMemoryRelevanceScore,
  normalizeOptionalText,
  normalizeProjectMemoryConfidenceScore,
  normalizeProjectMemoryValidationStatus,
  normalizePositiveInt,
});

const {
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
} = memoryRepository;

const researchRepository = createResearchRepository({
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
});

const {
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
} = researchRepository;

const changesRepository = createChangesRepository({
  getDb,
  validateColumns,
});

const {
  createChange,
  getChange,
  listChanges,
  updateChange,
} = changesRepository;

const loopsRepository = createLoopsRepository({
  getDb,
  crypto,
  validateColumns,
  getConfig,
  log,
  sendMail,
  coordinatorAgeMs,
  parsePositiveInt,
  computeLoopRequestRetryAfterSec,
  DEFAULT_LOOP_REQUEST_SIMILARITY_THRESHOLD,
  LOOP_REQUEST_SIMILAR_RECENT_WINDOW_HOURS,
  LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT,
});

const {
  createLoop,
  getLoop,
  updateLoop,
  setLoopPrompt,
  refreshLoopPrompt,
  listLoops,
  stopLoop,
  evaluateLoopRequestQuality,
  createLoopRequest,
  listLoopRequests,
} = loopsRepository;

const domainAnalysisRepository = createDomainAnalysisRepository({
  getDb,
  log,
  currentSqlTimestamp,
});

const {
  createDomainAnalysis,
  updateDomainAnalysis,
  getDomainAnalysis,
  getLatestDomainAnalysis,
  listDomainAnalyses,
  approveDomainAnalysis,
  rejectDomainAnalysis,
  getAuthoritativeFeedback,
} = domainAnalysisRepository;

const extendedResearchRepository = createExtendedResearchRepository({
  getDb,
  log,
  currentSqlTimestamp,
});

const {
  createExtendedResearchTopic,
  getExtendedResearchTopic,
  listExtendedResearchTopics,
  reviewExtendedResearchTopic,
  getPendingReviewItems,
} = extendedResearchRepository;

// --- Browser session helpers ---

// --- Browser research job helpers ---

// --- Browser callback event helpers ---

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

// --- Loop helpers ---

// --- Loop-request helpers ---

// --- Request lifecycle reconciliation ---

/**
 * Reconcile invariants for a single request:
 * 1. Non-terminal requests must not retain terminal completion metadata.
 * 2. A 'decomposed' request that already has tasks should advance to 'in_progress'.
 * 3. An 'in_progress' request with all tasks in terminal state and no pending/running
 *    merges should advance to 'integrating' so the merger can complete it.
 *
 * Returns an array of change descriptors (empty if nothing was repaired).
 */
/**
 * Run reconcileRequestLifecycle for all non-terminal requests.
 * Called periodically by the watchdog to heal stale lifecycle state.
 * Returns the total number of repairs made.
 */
// --- Research queue bridge functions (used by CLI commands) ---

// --- Domain analysis functions ---

// --- Extended research topic functions ---

// --- Combined review items ---

module.exports = {
  init, close, getDb,
  coordinatorAgeMs,
  createRequest, getRequest, updateRequest, listRequests,
  createTask, getTask, updateTask, transitionTaskBrowserOffload, appendTaskMergeHistory, getRequestMergeHistory,
  createTaskSandbox, getTaskSandbox, getActiveTaskSandboxForTask,
  updateTaskSandbox, transitionTaskSandbox, listTaskSandboxes, cleanupTaskSandboxes,
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
  getResearchQueueItems, startResearchItem, completeResearchItem, failResearchItem, requeueFailedResearch, requeueStaleResearch,
  getResearchBatch, listResearchBatchStages, listResearchIntentFanout, markResearchBatchStage,
  listTasks, getReadyTasks, checkAndPromoteTasks, replanTaskDependency,
  registerWorker, getWorker, updateWorker, getIdleWorkers, getAllWorkers, claimWorker, releaseWorker,
  recoverStalledAssignments,
  recoverStaleDecomposedZeroTaskRequests, checkRequestCompletion,
  reconcileRequestLifecycle, reconcileAllActiveRequests,
  getUsageCostBurnRate, getRequestLatestCompletedTaskCursor, hasRequestCompletedTaskProgressSince,
  sendMail, checkMail, checkMailBlocking, purgeOldMail, purgeTerminalMerges,
  enqueueMerge, getNextMerge, updateMerge,
  updateMergeIdentity, getMergeIdentity, updateMergeFailureClass,
  getMergeByFingerprint, recordFailure, resetCircuitBreaker, getOrCreateCircuitBreaker,
  incrementMetric, getMetrics,
  listRecoverableMerges,
  log, getLog,
  getConfig, setConfig,
  savePreset, listPresets, getPreset, deletePreset,
  findOverlappingTasks, getOverlapsForRequest, hasOverlappingMergedTasks,
  createChange, getChange, listChanges, updateChange,
  createLoop, getLoop, updateLoop, setLoopPrompt, refreshLoopPrompt, listLoops, stopLoop,
  evaluateLoopRequestQuality,
  createLoopRequest, listLoopRequests,
  createBrowserSession, getBrowserSession, updateBrowserSession, transitionBrowserSession,
  createBrowserResearchJob, getBrowserResearchJob, updateBrowserResearchJob, transitionBrowserResearchJob,
  appendBrowserCallbackEvent, getBrowserCallbackEvents,
  createDomainAnalysis, updateDomainAnalysis, getDomainAnalysis, getLatestDomainAnalysis,
  listDomainAnalyses, approveDomainAnalysis, rejectDomainAnalysis, getAuthoritativeFeedback,
  createExtendedResearchTopic, getExtendedResearchTopic, listExtendedResearchTopics, reviewExtendedResearchTopic,
  getPendingReviewItems,
  isTerminalTaskStatus,
  TASK_TERMINAL_STATUSES,
};
