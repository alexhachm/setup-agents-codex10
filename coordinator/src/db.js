'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db = null;
const NAMESPACE = process.env.MAC10_NAMESPACE || 'mac10';
const SQLITE_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/;
const ISO_TIMESTAMP_WITHOUT_ZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const ACTIVITY_LOG_LIMIT_MIN = 1;
const ACTIVITY_LOG_LIMIT_MAX = 1000;
const DEFAULT_ACTIVITY_LOG_LIMIT = 50;
const MALFORMED_REQUEST_PLACEHOLDER_DESCRIPTIONS = new Set([
  '[clear description of what the user wants]',
]);
const MALFORMED_TASK_PLACEHOLDER_DESCRIPTIONS = new Set([
  '[clear description of what the user wants]',
  'fix worker-n: [brief description of what needs fixing]',
]);
const MALFORMED_TASK_FIX_DESCRIPTION_RE = /^fix\s+worker-(?:n|\d+)\s*:\s*\[brief description of what needs fixing\]$/;
const MALFORMED_REQUEST_RESULT = 'Malformed scaffold placeholder request was automatically terminalized.';
const MALFORMED_TASK_RESULT = 'Malformed scaffold placeholder task was automatically terminalized.';
const ACTIVE_REQUEST_STATUSES = Object.freeze([
  'pending',
  'triaging',
  'decomposed',
  'in_progress',
  'executing_tier1',
  'integrating',
]);
const ACTIVE_REQUEST_STATUS_SET = new Set(ACTIVE_REQUEST_STATUSES);

function normalizePlaceholderValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function isMalformedScaffoldRequestDescription(description) {
  const normalized = normalizePlaceholderValue(description);
  return MALFORMED_REQUEST_PLACEHOLDER_DESCRIPTIONS.has(normalized)
    || isMalformedScaffoldTaskSignature(normalized);
}

function isMalformedScaffoldTaskSignature(text) {
  const normalized = normalizePlaceholderValue(text);
  if (!normalized) return false;
  return MALFORMED_TASK_PLACEHOLDER_DESCRIPTIONS.has(normalized)
    || MALFORMED_TASK_FIX_DESCRIPTION_RE.test(normalized);
}

function terminalizeMalformedScaffoldArtifacts() {
  const d = getDb();
  const tx = d.transaction(() => {
    const malformedRequests = d.prepare(`
      SELECT id, status, description
      FROM requests
    `).all().filter((row) => isMalformedScaffoldRequestDescription(row.description));

    const malformedRequestIds = malformedRequests
      .map((row) => row.id)
      .filter((id) => String(id || '').trim() !== '')
      .sort((left, right) => String(left).localeCompare(String(right)));
    const malformedRequestIdSet = new Set(malformedRequestIds);
    const requestsToRepair = malformedRequests
      .filter((row) => !['completed', 'failed'].includes(String(row.status || '').toLowerCase()))
      .map((row) => row.id)
      .sort((left, right) => String(left).localeCompare(String(right)));

    const malformedTasks = d.prepare(`
      SELECT id, request_id, status, assigned_to, subject, description
      FROM tasks
    `).all().filter((task) => {
      if (malformedRequestIdSet.has(task.request_id)) return true;
      return isMalformedScaffoldTaskSignature(task.description)
        || isMalformedScaffoldTaskSignature(task.subject);
    });

    const malformedTaskIds = malformedTasks
      .map((row) => Number.parseInt(row.id, 10))
      .filter((id) => Number.isInteger(id) && id > 0)
      .sort((left, right) => left - right);
    const tasksToTerminalize = malformedTasks
      .filter((row) => !['completed', 'failed'].includes(String(row.status || '').toLowerCase()))
      .map((row) => Number.parseInt(row.id, 10))
      .filter((id) => Number.isInteger(id) && id > 0);
    const detachedTaskAssignments = malformedTasks.reduce((count, task) => {
      return task.assigned_to === null || task.assigned_to === undefined ? count : count + 1;
    }, 0);

    const workerIdSet = new Set();
    for (const task of malformedTasks) {
      const assignedWorkerId = Number.parseInt(task.assigned_to, 10);
      if (Number.isInteger(assignedWorkerId) && assignedWorkerId > 0) {
        workerIdSet.add(assignedWorkerId);
      }
    }
    if (malformedTaskIds.length > 0) {
      const taskPlaceholders = malformedTaskIds.map(() => '?').join(', ');
      const workerRows = d.prepare(`
        SELECT id
        FROM workers
        WHERE current_task_id IN (${taskPlaceholders})
      `).all(...malformedTaskIds);
      for (const row of workerRows) {
        const workerId = Number.parseInt(row.id, 10);
        if (Number.isInteger(workerId) && workerId > 0) workerIdSet.add(workerId);
      }
    }
    const workerIds = Array.from(workerIdSet).sort((left, right) => left - right);

    if (requestsToRepair.length > 0) {
      const placeholders = requestsToRepair.map(() => '?').join(', ');
      d.prepare(`
        UPDATE requests
        SET status = 'failed',
            result = ?,
            completed_at = COALESCE(completed_at, datetime('now')),
            updated_at = datetime('now')
        WHERE id IN (${placeholders})
      `).run(MALFORMED_REQUEST_RESULT, ...requestsToRepair);
    }

    if (malformedTaskIds.length > 0) {
      const placeholders = malformedTaskIds.map(() => '?').join(', ');
      d.prepare(`
        UPDATE tasks
        SET status = CASE
              WHEN status IN ('completed', 'failed') THEN status
              ELSE 'failed'
            END,
            result = CASE
              WHEN status IN ('completed', 'failed') THEN result
              ELSE ?
            END,
            completed_at = CASE
              WHEN status IN ('completed', 'failed') THEN completed_at
              ELSE COALESCE(completed_at, datetime('now'))
            END,
            assigned_to = NULL,
            updated_at = datetime('now')
        WHERE id IN (${placeholders})
      `).run(MALFORMED_TASK_RESULT, ...malformedTaskIds);
    }

    if (workerIds.length > 0) {
      const placeholders = workerIds.map(() => '?').join(', ');
      d.prepare(`
        UPDATE workers
        SET status = CASE
              WHEN status IN ('assigned', 'running', 'busy') THEN 'idle'
              ELSE status
            END,
            current_task_id = NULL,
            claimed_by = NULL,
            claimed_at = NULL
        WHERE id IN (${placeholders})
      `).run(...workerIds);
    }

    return {
      inspected_requests: malformedRequestIds.length,
      repaired_requests: requestsToRepair.length,
      inspected_tasks: malformedTaskIds.length,
      terminalized_tasks: tasksToTerminalize.length,
      detached_task_assignments: detachedTaskAssignments,
      reset_workers: workerIds.length,
    };
  });
  return tx();
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
  tasks: new Set(['request_id', 'subject', 'description', 'domain', 'files', 'priority', 'tier', 'depends_on', 'assigned_to', 'status', 'pr_url', 'branch', 'validation', 'overlap_with', 'started_at', 'completed_at', 'result']),
  workers: new Set(['status', 'domain', 'worktree_path', 'branch', 'tmux_session', 'tmux_window', 'pid', 'current_task_id', 'claimed_by', 'claimed_at', 'last_heartbeat', 'launched_at', 'tasks_completed']),
  merge_queue: new Set(['status', 'priority', 'completion_checkpoint', 'merged_at', 'error']),
  changes: new Set(['description', 'domain', 'file_path', 'function_name', 'tooltip', 'enabled', 'status']),
  loops: new Set(['prompt', 'status', 'iteration_count', 'last_checkpoint', 'tmux_session', 'tmux_window', 'pid', 'last_heartbeat', 'stopped_at']),
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
    db.exec("UPDATE workers SET claimed_at = datetime('now') WHERE claimed_by IS NOT NULL AND claimed_at IS NULL");
  }
  if (existingTables.includes('tasks')) {
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    if (!taskCols.includes('overlap_with')) {
      db.exec("ALTER TABLE tasks ADD COLUMN overlap_with TEXT");
    }
  }
  if (existingTables.includes('requests')) {
    const reqCols = db.prepare("PRAGMA table_info(requests)").all().map(c => c.name);
    if (!reqCols.includes('loop_id')) {
      db.exec("ALTER TABLE requests ADD COLUMN loop_id INTEGER REFERENCES loops(id)");
    }
  }
  if (existingTables.includes('merge_queue')) ensureMergeQueueColumns(db);

  // Now safe to run full schema (CREATE TABLE IF NOT EXISTS + indexes)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  ensureMergeQueueColumns(db);

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
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
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

function listTasks(filters = {}) {
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const vals = [];
  if (filters.status) { sql += ' AND status = ?'; vals.push(filters.status); }
  if (filters.request_id) { sql += ' AND request_id = ?'; vals.push(filters.request_id); }
  if (filters.assigned_to) { sql += ' AND assigned_to = ?'; vals.push(filters.assigned_to); }
  sql += ' ORDER BY CASE priority WHEN \'urgent\' THEN 0 WHEN \'high\' THEN 1 WHEN \'normal\' THEN 2 WHEN \'low\' THEN 3 END, id';
  return getDb().prepare(sql).all(...vals);
}

function isRequestAssignableStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return ACTIVE_REQUEST_STATUS_SET.has(normalized);
}

function getReadyTasks() {
  // Tasks that are ready and have no unfinished dependencies
  return getDb().prepare(`
    SELECT t.*
    FROM tasks t
    INNER JOIN requests r ON r.id = t.request_id
    WHERE t.status = 'ready'
      AND t.assigned_to IS NULL
      AND lower(coalesce(r.status, '')) IN ('pending', 'triaging', 'decomposed', 'in_progress', 'executing_tier1', 'integrating')
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, t.id
  `).all();
}

function checkAndPromoteTasks() {
  const d = getDb();
  terminalizeMalformedScaffoldArtifacts();
  // Batch promote pending tasks with no dependencies in a single SQL statement
  d.prepare(`
    UPDATE tasks SET status = 'ready', updated_at = datetime('now')
    WHERE status = 'pending' AND (depends_on IS NULL OR depends_on = '[]')
  `).run();

  // For tasks with dependencies, check each one
  const pending = d.prepare(
    "SELECT id, depends_on FROM tasks WHERE status = 'pending' AND depends_on IS NOT NULL AND depends_on != '[]'"
  ).all();
  for (const task of pending) {
    let deps;
    try {
      deps = JSON.parse(task.depends_on);
    } catch (e) {
      updateTask(task.id, { status: 'failed', result: `Invalid depends_on JSON: ${e.message}` });
      continue;
    }
    if (!deps.length) {
      updateTask(task.id, { status: 'ready' });
      continue;
    }
    const unfinished = d.prepare(
      `SELECT COUNT(*) as cnt FROM tasks WHERE id IN (${deps.map(() => '?').join(',')}) AND status != 'completed'`
    ).get(...deps);
    if (unfinished.cnt === 0) {
      updateTask(task.id, { status: 'ready' });
    }
  }
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

function claimWorker(workerId, claimer) {
  const result = getDb().prepare(
    "UPDATE workers SET claimed_by = ?, claimed_at = datetime('now') WHERE id = ? AND status = 'idle' AND claimed_by IS NULL"
  ).run(claimer, workerId);
  return result.changes > 0;
}

function releaseWorker(workerId) {
  getDb().prepare('UPDATE workers SET claimed_by = NULL, claimed_at = NULL WHERE id = ?').run(workerId);
}

function checkRequestCompletion(requestId) {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed
    FROM tasks WHERE request_id = ?
  `).get(requestId);
  return {
    request_id: requestId,
    total: row.total,
    completed: row.completed,
    failed: row.failed,
    all_done: row.completed + row.failed >= row.total && row.total > 0,
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

function checkMail(recipient, consume = true) {
  const d = getDb();
  let messages;
  if (consume) {
    // Atomic read-and-consume: transaction prevents two consumers reading the same messages
    const txn = d.transaction(() => {
      const msgs = d.prepare(`
        SELECT * FROM mail WHERE recipient = ? AND consumed = 0 ORDER BY id
      `).all(recipient);
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
    messages = d.prepare(`
      SELECT * FROM mail WHERE recipient = ? AND consumed = 0 ORDER BY id
    `).all(recipient);
  }
  return messages.map(m => {
    try {
      return { ...m, payload: JSON.parse(m.payload) };
    } catch (e) {
      return { ...m, payload: { _raw: m.payload, _parse_error: true } };
    }
  });
}

function purgeOldMail(days) {
  const result = getDb().prepare(
    "DELETE FROM mail WHERE consumed = 1 AND created_at < datetime('now', '-' || ? || ' days')"
  ).run(days);
  return result.changes;
}

function checkMailBlocking(recipient, timeoutMs = 300000, pollMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = checkMail(recipient);
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
  // Atomic dedup+insert scoped to request/task ownership.
  // This prevents cross-request PR dedupe from rebinding existing rows.
  const result = getDb().prepare(`
    INSERT INTO merge_queue (request_id, task_id, pr_url, branch, priority, completion_checkpoint)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM merge_queue
      WHERE request_id = ? AND task_id = ?
    )
  `).run(request_id, task_id, pr_url, branch, normalizedPriority, normalizedCheckpoint, request_id, task_id);
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

function normalizeActivityLogLimit(limit, fallback = DEFAULT_ACTIVITY_LOG_LIMIT) {
  const safeFallback = Number.isSafeInteger(fallback)
    ? Math.max(ACTIVITY_LOG_LIMIT_MIN, Math.min(fallback, ACTIVITY_LOG_LIMIT_MAX))
    : DEFAULT_ACTIVITY_LOG_LIMIT;
  const parsed = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isSafeInteger(parsed)) return safeFallback;
  return Math.max(ACTIVITY_LOG_LIMIT_MIN, Math.min(parsed, ACTIVITY_LOG_LIMIT_MAX));
}

function getLog(limit = 50, actor) {
  const normalizedLimit = normalizeActivityLogLimit(limit);
  if (actor) {
    return getDb().prepare('SELECT * FROM activity_log WHERE actor = ? ORDER BY id DESC LIMIT ?').all(actor, normalizedLimit);
  }
  return getDb().prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(normalizedLimit);
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

function createLoopRequest(description, loopId) {
  const d = getDb();
  const txn = d.transaction(() => {
    // Check for active (non-completed/failed) request from same loop with same description
    const existing = d.prepare(`
      SELECT id FROM requests
      WHERE loop_id = ? AND description = ? AND status NOT IN ('completed', 'failed')
    `).get(loopId, description);
    if (existing) {
      return { id: existing.id, deduplicated: true };
    }
    const id = 'req-' + crypto.randomBytes(4).toString('hex');
    d.prepare(`
      INSERT INTO requests (id, description, loop_id) VALUES (?, ?, ?)
    `).run(id, description, loopId);
    sendMail('architect', 'new_request', { request_id: id, description, loop_id: loopId });
    sendMail('master-1', 'request_acknowledged', { request_id: id, description, loop_id: loopId });
    log('loop', 'loop_request_created', { request_id: id, loop_id: loopId, description });
    return { id, deduplicated: false };
  });
  return txn();
}

function listLoopRequests(loopId) {
  return getDb().prepare('SELECT * FROM requests WHERE loop_id = ? ORDER BY created_at DESC').all(loopId);
}

module.exports = {
  init, close, getDb,
  coordinatorAgeMs,
  terminalizeMalformedScaffoldArtifacts,
  createRequest, getRequest, updateRequest, listRequests,
  createTask, getTask, updateTask, listTasks, getReadyTasks, isRequestAssignableStatus, checkAndPromoteTasks,
  registerWorker, getWorker, updateWorker, getIdleWorkers, getAllWorkers, claimWorker, releaseWorker,
  checkRequestCompletion, getRequestLatestCompletedTaskCursor, hasRequestCompletedTaskProgressSince,
  sendMail, checkMail, checkMailBlocking, purgeOldMail,
  enqueueMerge, getNextMerge, updateMerge,
  log, getLog,
  getConfig, setConfig,
  savePreset, listPresets, getPreset, deletePreset,
  findOverlappingTasks, getOverlapsForRequest, hasOverlappingMergedTasks,
  createChange, getChange, listChanges, updateChange,
  createLoop, getLoop, updateLoop, listLoops, stopLoop,
  createLoopRequest, listLoopRequests,
};
