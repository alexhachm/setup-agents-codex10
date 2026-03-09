'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let db = null;
const NAMESPACE = process.env.MAC10_NAMESPACE || 'mac10';
const SQL_NOW_UTC_ISO = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const SQLITE_UTC_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/;
const ISO_TIMESTAMP_WITHOUT_ZONE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

const VALID_COLUMNS = Object.freeze({
  requests: new Set(['description', 'tier', 'status', 'result', 'completed_at', 'loop_id']),
  tasks: new Set(['request_id', 'subject', 'description', 'domain', 'files', 'priority', 'tier', 'depends_on', 'assigned_to', 'status', 'pr_url', 'branch', 'validation', 'overlap_with', 'started_at', 'completed_at', 'result']),
  workers: new Set(['status', 'domain', 'worktree_path', 'branch', 'tmux_session', 'tmux_window', 'pid', 'current_task_id', 'claimed_by', 'last_heartbeat', 'launched_at', 'tasks_completed']),
  merge_queue: new Set(['status', 'priority', 'merged_at', 'error']),
  changes: new Set(['description', 'domain', 'file_path', 'function_name', 'tooltip', 'enabled', 'status']),
  loops: new Set(['prompt', 'status', 'iteration_count', 'last_checkpoint', 'tmux_session', 'tmux_window', 'pid', 'last_heartbeat', 'stopped_at']),
});

function parseCoordinatorTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== 'string') return null;

  const raw = value.trim();
  if (!raw) return null;

  const sqliteMatch = raw.match(SQLITE_UTC_TIMESTAMP_RE);
  if (sqliteMatch) {
    const normalized = `${sqliteMatch[1]}T${sqliteMatch[2]}${sqliteMatch[3] || ''}Z`;
    const sqliteDate = new Date(normalized);
    return Number.isNaN(sqliteDate.getTime()) ? null : sqliteDate;
  }

  if (ISO_TIMESTAMP_WITHOUT_ZONE_RE.test(raw)) {
    const implicitUtcDate = new Date(`${raw}Z`);
    return Number.isNaN(implicitUtcDate.getTime()) ? null : implicitUtcDate;
  }

  const isoDate = new Date(raw);
  return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}

function coordinatorAgeMs(timestamp, nowMs = Date.now()) {
  const parsed = parseCoordinatorTimestamp(timestamp);
  if (!parsed) return null;
  return Math.max(0, nowMs - parsed.getTime());
}

function coordinatorAgeSeconds(timestamp, nowMs = Date.now()) {
  const ageMs = coordinatorAgeMs(timestamp, nowMs);
  if (ageMs === null) return null;
  return ageMs / 1000;
}

function validateColumns(table, fields) {
  const allowed = VALID_COLUMNS[table];
  if (!allowed) throw new Error(`Unknown table: ${table}`);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key)) {
      throw new Error(`Invalid column "${key}" for table "${table}"`);
    }
  }
}

function getDbPath(projectDir) {
  const stateDir = path.join(projectDir, '.claude', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const dbFile = NAMESPACE === 'mac10' ? 'mac10.db' : `${NAMESPACE}.db`;
  return path.join(stateDir, dbFile);
}

function ensureMergeQueueUpdatedAt() {
  if (!db) return;
  const mergeQueueExists = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='merge_queue'"
  ).get();
  if (!mergeQueueExists) return;

  const mergeCols = db.prepare("PRAGMA table_info(merge_queue)").all().map(c => c.name);
  if (!mergeCols.includes('updated_at')) {
    db.exec("ALTER TABLE merge_queue ADD COLUMN updated_at TEXT");
  }

  if (mergeCols.includes('created_at')) {
    db.exec(`UPDATE merge_queue SET updated_at = COALESCE(updated_at, created_at, ${SQL_NOW_UTC_ISO}) WHERE updated_at IS NULL`);
  } else {
    db.exec(`UPDATE merge_queue SET updated_at = COALESCE(updated_at, ${SQL_NOW_UTC_ISO}) WHERE updated_at IS NULL`);
  }
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
  ensureMergeQueueUpdatedAt();

  // Now safe to run full schema (CREATE TABLE IF NOT EXISTS + indexes)
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Store project dir in config
  db.prepare('UPDATE config SET value = ? WHERE key = ?').run(projectDir, 'project_dir');
  return db;
}

function close() {
  if (db) { db.close(); db = null; }
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call init(projectDir) first.');
  ensureMergeQueueUpdatedAt();
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
  sets.push(`updated_at = ${SQL_NOW_UTC_ISO}`);
  vals.push(id);
  getDb().prepare(`UPDATE requests SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function listRequests(status) {
  if (status) return getDb().prepare('SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC').all(status);
  return getDb().prepare('SELECT * FROM requests ORDER BY created_at DESC').all();
}

// --- Task helpers ---

function normalizeDependsOn(depends_on) {
  if (depends_on === null || depends_on === undefined) return [];
  let deps = depends_on;
  if (typeof deps === 'string') {
    try {
      deps = JSON.parse(deps);
    } catch (e) {
      throw new Error(`depends_on must be a JSON array of task ids: ${e.message}`);
    }
  }
  if (!Array.isArray(deps)) {
    throw new Error('depends_on must be an array of positive integer task ids');
  }
  const normalized = [];
  const seen = new Set();
  for (const depId of deps) {
    if (!Number.isInteger(depId) || depId <= 0) {
      throw new Error('depends_on must contain only positive integer task ids');
    }
    if (!seen.has(depId)) {
      seen.add(depId);
      normalized.push(depId);
    }
  }
  return normalized;
}

function canonicalizeFilePath(filePath) {
  if (typeof filePath !== 'string') return '';
  let normalized = filePath.trim();
  if (!normalized) return '';
  normalized = normalized.replace(/\\/g, '/');
  normalized = normalized.replace(/\/{2,}/g, '/');
  normalized = normalized.replace(/^(?:\.\/)+/, '');
  return normalized;
}

function normalizeTaskFiles(files) {
  if (!Array.isArray(files)) return [];
  const normalized = [];
  const seen = new Set();
  for (const file of files) {
    const canonical = canonicalizeFilePath(file);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }
  return normalized;
}

function createTask({ request_id, subject, description, domain, files, priority, tier, depends_on, validation }) {
  const deps = normalizeDependsOn(depends_on);
  const normalizedFiles = normalizeTaskFiles(files);
  if (deps.length > 0) {
    const d = getDb();
    const depRows = d.prepare(
      `SELECT id, request_id FROM tasks WHERE id IN (${deps.map(() => '?').join(',')})`
    ).all(...deps);
    const depById = new Map(depRows.map(row => [row.id, row]));
    const missingIds = deps.filter(depId => !depById.has(depId));
    if (missingIds.length > 0) {
      throw new Error(`depends_on contains unknown task ids: ${missingIds.join(', ')}`);
    }
    const crossRequestDeps = depRows
      .filter(row => row.request_id !== request_id)
      .map(row => `${row.id}(${row.request_id})`);
    if (crossRequestDeps.length > 0) {
      throw new Error(`depends_on contains cross-request task ids: ${crossRequestDeps.join(', ')}`);
    }
  }

  const result = getDb().prepare(`
    INSERT INTO tasks (request_id, subject, description, domain, files, priority, tier, depends_on, validation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    request_id, subject, description,
    domain || null,
    normalizedFiles.length > 0 ? JSON.stringify(normalizedFiles) : null,
    priority || 'normal',
    tier || 3,
    deps.length > 0 ? JSON.stringify(deps) : null,
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
  sets.push(`updated_at = ${SQL_NOW_UTC_ISO}`);
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

function getReadyTasks() {
  // Tasks that are ready and have no unfinished dependencies
  return getDb().prepare(`
    SELECT * FROM tasks
    WHERE status = 'ready' AND assigned_to IS NULL
    ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END, id
  `).all();
}

function checkAndPromoteTasks() {
  const d = getDb();
  // Batch promote pending tasks with no dependencies in a single SQL statement
  d.prepare(`
    UPDATE tasks SET status = 'ready', updated_at = ${SQL_NOW_UTC_ISO}
    WHERE status = 'pending' AND (depends_on IS NULL OR depends_on = '[]')
  `).run();

  // For tasks with dependencies, check each one
  const pending = d.prepare(
    "SELECT id, request_id, depends_on FROM tasks WHERE status = 'pending' AND depends_on IS NOT NULL AND depends_on != '[]' ORDER BY id"
  ).all();
  for (const task of pending) {
    let deps;
    try {
      deps = normalizeDependsOn(task.depends_on);
    } catch (e) {
      updateTask(task.id, { status: 'failed', result: `Invalid depends_on JSON: ${e.message}` });
      continue;
    }
    if (!deps.length) {
      updateTask(task.id, { status: 'ready' });
      continue;
    }
    const depRows = d.prepare(
      `SELECT id, request_id, status FROM tasks WHERE id IN (${deps.map(() => '?').join(',')})`
    ).all(...deps);
    const depById = new Map(depRows.map(row => [row.id, row]));

    const missingIds = deps.filter(depId => !depById.has(depId));
    if (missingIds.length > 0) {
      updateTask(task.id, {
        status: 'failed',
        result: `Blocked by missing dependency task(s): ${missingIds.join(', ')}`,
        completed_at: new Date().toISOString(),
      });
      continue;
    }

    const crossRequestDeps = depRows
      .filter(row => row.request_id !== task.request_id)
      .map(row => `${row.id}(${row.request_id})`);
    if (crossRequestDeps.length > 0) {
      updateTask(task.id, {
        status: 'failed',
        result: `Blocked by cross-request dependency task(s): ${crossRequestDeps.join(', ')}`,
        completed_at: new Date().toISOString(),
      });
      continue;
    }

    const failedDeps = depRows
      .filter(row => row.status === 'failed' || row.status === 'blocked')
      .map(row => `${row.id}(${row.status})`);
    if (failedDeps.length > 0) {
      updateTask(task.id, {
        status: 'failed',
        result: `Blocked by failed dependency task(s): ${failedDeps.join(', ')}`,
        completed_at: new Date().toISOString(),
      });
      continue;
    }

    const allCompleted = depRows.every(row => row.status === 'completed');
    if (allCompleted) {
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
    "UPDATE workers SET claimed_by = ? WHERE id = ? AND status = 'idle' AND claimed_by IS NULL"
  ).run(claimer, workerId);
  return result.changes > 0;
}

function releaseWorker(workerId) {
  getDb().prepare('UPDATE workers SET claimed_by = NULL WHERE id = ?').run(workerId);
}

function parsePositiveIntId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function getLifecycleGuardFailure(worker, task, workerId, taskId, requiredTaskStatus) {
  if (!worker) return 'worker_not_found';
  if (!task) return 'task_not_found';
  if (Number(task.assigned_to) !== workerId) return 'task_not_assigned_to_worker';
  if (Number(worker.current_task_id) !== taskId) return 'worker_current_task_mismatch';
  if (task.status !== requiredTaskStatus) return `task_status_must_be_${requiredTaskStatus}`;
  return null;
}

function resolveLifecycleGuardFailure(workerId, taskId, requiredTaskStatus) {
  return getLifecycleGuardFailure(
    getWorker(workerId),
    getTask(taskId),
    workerId,
    taskId,
    requiredTaskStatus,
  ) || 'lifecycle_predicate_failed';
}

function startTaskForWorker(workerIdInput, taskIdInput, startedAt = new Date().toISOString()) {
  const workerId = parsePositiveIntId(workerIdInput);
  if (workerId === null) return { ok: false, reason: 'invalid_worker_id' };
  const taskId = parsePositiveIntId(taskIdInput);
  if (taskId === null) return { ok: false, reason: 'invalid_task_id' };

  const d = getDb();
  const tx = d.transaction(() => {
    const worker = getWorker(workerId);
    const task = getTask(taskId);
    const guardFailure = getLifecycleGuardFailure(worker, task, workerId, taskId, 'assigned');
    if (guardFailure) return { ok: false, reason: guardFailure };

    const taskResult = d.prepare(`
      UPDATE tasks
      SET status = 'in_progress',
          started_at = ?,
          updated_at = ${SQL_NOW_UTC_ISO}
      WHERE id = ?
        AND assigned_to = ?
        AND status = 'assigned'
    `).run(startedAt, taskId, workerId);
    if (taskResult.changes !== 1) throw new Error('start_task_predicate_failed');

    const workerResult = d.prepare(`
      UPDATE workers
      SET status = 'busy',
          last_heartbeat = ?
      WHERE id = ?
        AND current_task_id = ?
    `).run(startedAt, workerId, taskId);
    if (workerResult.changes !== 1) throw new Error('start_worker_predicate_failed');

    return { ok: true, task: getTask(taskId), worker: getWorker(workerId) };
  });

  try {
    return tx();
  } catch (e) {
    if (e.message === 'start_task_predicate_failed' || e.message === 'start_worker_predicate_failed') {
      return { ok: false, reason: resolveLifecycleGuardFailure(workerId, taskId, 'assigned') };
    }
    throw e;
  }
}

function completeTaskForWorker(workerIdInput, taskIdInput, {
  pr_url = null,
  branch = null,
  result = null,
  completed_at = new Date().toISOString(),
} = {}) {
  const workerId = parsePositiveIntId(workerIdInput);
  if (workerId === null) return { ok: false, reason: 'invalid_worker_id' };
  const taskId = parsePositiveIntId(taskIdInput);
  if (taskId === null) return { ok: false, reason: 'invalid_task_id' };

  const d = getDb();
  const tx = d.transaction(() => {
    const worker = getWorker(workerId);
    const task = getTask(taskId);
    const guardFailure = getLifecycleGuardFailure(worker, task, workerId, taskId, 'in_progress');
    if (guardFailure) return { ok: false, reason: guardFailure };

    const taskResult = d.prepare(`
      UPDATE tasks
      SET status = 'completed',
          pr_url = ?,
          branch = ?,
          result = ?,
          completed_at = ?,
          updated_at = ${SQL_NOW_UTC_ISO}
      WHERE id = ?
        AND assigned_to = ?
        AND status = 'in_progress'
    `).run(pr_url, branch, result, completed_at, taskId, workerId);
    if (taskResult.changes !== 1) throw new Error('complete_task_predicate_failed');

    const workerResult = d.prepare(`
      UPDATE workers
      SET status = 'completed_task',
          current_task_id = NULL,
          tasks_completed = tasks_completed + 1
      WHERE id = ?
        AND current_task_id = ?
    `).run(workerId, taskId);
    if (workerResult.changes !== 1) throw new Error('complete_worker_predicate_failed');

    return { ok: true, task: getTask(taskId), worker: getWorker(workerId) };
  });

  try {
    return tx();
  } catch (e) {
    if (e.message === 'complete_task_predicate_failed' || e.message === 'complete_worker_predicate_failed') {
      return { ok: false, reason: resolveLifecycleGuardFailure(workerId, taskId, 'in_progress') };
    }
    throw e;
  }
}

function failTaskForWorker(workerIdInput, taskIdInput, error, completedAt = new Date().toISOString()) {
  const workerId = parsePositiveIntId(workerIdInput);
  if (workerId === null) return { ok: false, reason: 'invalid_worker_id' };
  const taskId = parsePositiveIntId(taskIdInput);
  if (taskId === null) return { ok: false, reason: 'invalid_task_id' };

  const d = getDb();
  const tx = d.transaction(() => {
    const worker = getWorker(workerId);
    const task = getTask(taskId);
    const guardFailure = getLifecycleGuardFailure(worker, task, workerId, taskId, 'in_progress');
    if (guardFailure) return { ok: false, reason: guardFailure };

    const taskResult = d.prepare(`
      UPDATE tasks
      SET status = 'failed',
          result = ?,
          completed_at = ?,
          updated_at = ${SQL_NOW_UTC_ISO}
      WHERE id = ?
        AND assigned_to = ?
        AND status = 'in_progress'
    `).run(error, completedAt, taskId, workerId);
    if (taskResult.changes !== 1) throw new Error('fail_task_predicate_failed');

    const workerResult = d.prepare(`
      UPDATE workers
      SET status = 'idle',
          current_task_id = NULL
      WHERE id = ?
        AND current_task_id = ?
    `).run(workerId, taskId);
    if (workerResult.changes !== 1) throw new Error('fail_worker_predicate_failed');

    return { ok: true, task: getTask(taskId), worker: getWorker(workerId) };
  });

  try {
    return tx();
  } catch (e) {
    if (e.message === 'fail_task_predicate_failed' || e.message === 'fail_worker_predicate_failed') {
      return { ok: false, reason: resolveLifecycleGuardFailure(workerId, taskId, 'in_progress') };
    }
    throw e;
  }
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
    "DELETE FROM mail WHERE consumed = 1 AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now', '-' || ? || ' days')"
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

function enqueueMerge({ request_id, task_id, pr_url, branch, priority }) {
  // Atomic dedup+insert: prevents TOCTOU race between SELECT and INSERT
  const result = getDb().prepare(`
    INSERT INTO merge_queue (request_id, task_id, pr_url, branch, priority)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM merge_queue WHERE pr_url = ?)
  `).run(request_id, task_id, pr_url, branch, priority || 0, pr_url);
  return {
    inserted: result.changes === 1,
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
  ensureMergeQueueUpdatedAt();
  validateColumns('merge_queue', fields);
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  sets.push(`updated_at = ${SQL_NOW_UTC_ISO}`);
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

function getRequestHistory(requestId, limit = 500) {
  return getDb().prepare(`
    SELECT *
    FROM activity_log
    WHERE json_extract(details, '$.request_id') = ?
       OR json_extract(details, '$.requestId') = ?
       OR json_extract(details, '$.payload.request_id') = ?
       OR json_extract(details, '$.payload.requestId') = ?
       OR EXISTS (
            SELECT 1
            FROM json_each(json_extract(details, '$.request_ids'))
            WHERE value = ?
       )
       OR EXISTS (
            SELECT 1
            FROM json_each(json_extract(details, '$.requestIds'))
            WHERE value = ?
       )
    ORDER BY id DESC
    LIMIT ?
  `).all(requestId, requestId, requestId, requestId, requestId, requestId, limit);
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
      updated_at = ${SQL_NOW_UTC_ISO}
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

function normalizeOverlapIds(overlapWith, selfId = null) {
  if (!overlapWith) return [];
  let ids = overlapWith;
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch { return []; }
  }
  if (!Array.isArray(ids)) return [];
  const parsedSelfId = Number(selfId);
  const hasSelfId = Number.isInteger(parsedSelfId) && parsedSelfId > 0;

  const normalized = [];
  const seen = new Set();
  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (hasSelfId && id === parsedSelfId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function findOverlappingTasks(requestId, files, excludeTaskId = null) {
  const normalizedFiles = normalizeTaskFiles(files);
  if (normalizedFiles.length === 0) return [];
  const normalizedFilesSet = new Set(normalizedFiles);

  // Find other tasks in the same request that have overlapping files
  const parsedExcludeId = Number(excludeTaskId);
  const hasExclude = Number.isInteger(parsedExcludeId) && parsedExcludeId > 0;
  const tasks = hasExclude
    ? getDb().prepare(
      "SELECT id, files, overlap_with FROM tasks WHERE request_id = ? AND files IS NOT NULL AND id != ?"
    ).all(requestId, parsedExcludeId)
    : getDb().prepare(
      "SELECT id, files, overlap_with FROM tasks WHERE request_id = ? AND files IS NOT NULL"
    ).all(requestId);

  const overlaps = [];
  for (const task of tasks) {
    if (hasExclude && task.id === parsedExcludeId) continue;
    let taskFiles;
    try { taskFiles = normalizeTaskFiles(JSON.parse(task.files)); } catch { continue; }
    if (taskFiles.length === 0) continue;
    const shared = taskFiles.filter((file) => normalizedFilesSet.has(file));
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
    const overlapIds = normalizeOverlapIds(task.overlap_with, task.id);
    for (const otherId of overlapIds) {
      const key = [Math.min(task.id, otherId), Math.max(task.id, otherId)].join('-');
      if (seen.has(key)) continue;
      seen.add(key);

      const other = getDb().prepare(
        "SELECT id, subject, files FROM tasks WHERE id = ? AND request_id = ?"
      ).get(otherId, requestId);
      if (!other) continue;

      // Calculate shared files
      let filesA, filesB;
      try { filesA = normalizeTaskFiles(JSON.parse(task.files)); } catch { continue; }
      try { filesB = normalizeTaskFiles(JSON.parse(other.files)); } catch { continue; }
      if (filesA.length === 0 || filesB.length === 0) continue;
      const filesBSet = new Set(filesB);
      const shared = filesA.filter((file) => filesBSet.has(file));
      if (shared.length === 0) continue;
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
  const task = getDb().prepare("SELECT overlap_with, files FROM tasks WHERE id = ?").get(taskId);
  if (!task || !task.overlap_with) return [];

  const overlapIds = normalizeOverlapIds(task.overlap_with, taskId);
  if (overlapIds.length === 0) return [];
  let baseFiles;
  try { baseFiles = normalizeTaskFiles(JSON.parse(task.files)); } catch { return []; }
  if (!Array.isArray(baseFiles) || baseFiles.length === 0) return [];
  const baseFilesSet = new Set(baseFiles);

  // Check which overlapping tasks have been merged
  const merged = getDb().prepare(`
    SELECT t.id, t.subject, t.branch, t.files, mq.status as merge_status
    FROM tasks t
    JOIN merge_queue mq ON mq.task_id = t.id
    WHERE t.id IN (${overlapIds.map(() => '?').join(',')})
      AND mq.status = 'merged'
  `).all(...overlapIds);

  return merged.filter((row) => {
    let mergedFiles;
    try { mergedFiles = normalizeTaskFiles(JSON.parse(row.files)); } catch { return false; }
    if (!Array.isArray(mergedFiles) || mergedFiles.length === 0) return false;
    return mergedFiles.some((file) => baseFilesSet.has(file));
  }).map((row) => ({
    id: row.id,
    subject: row.subject,
    branch: row.branch,
    merge_status: row.merge_status,
  }));
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
  sets.push(`updated_at = ${SQL_NOW_UTC_ISO}`);
  vals.push(id);
  getDb().prepare(`UPDATE loops SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function listLoops(status) {
  if (status) return getDb().prepare('SELECT * FROM loops WHERE status = ? ORDER BY id DESC').all(status);
  return getDb().prepare('SELECT * FROM loops ORDER BY id DESC').all();
}

function stopLoop(id) {
  getDb().prepare(`
    UPDATE loops SET status = 'stopped', stopped_at = ${SQL_NOW_UTC_ISO}, updated_at = ${SQL_NOW_UTC_ISO} WHERE id = ?
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
  parseCoordinatorTimestamp, coordinatorAgeMs, coordinatorAgeSeconds,
  createRequest, getRequest, updateRequest, listRequests,
  createTask, getTask, updateTask, listTasks, getReadyTasks, checkAndPromoteTasks,
  registerWorker, getWorker, updateWorker, getIdleWorkers, getAllWorkers, claimWorker, releaseWorker,
  startTaskForWorker, completeTaskForWorker, failTaskForWorker,
  checkRequestCompletion,
  sendMail, checkMail, checkMailBlocking, purgeOldMail,
  enqueueMerge, getNextMerge, updateMerge,
  log, getLog, getRequestHistory,
  getConfig, setConfig,
  savePreset, listPresets, getPreset, deletePreset,
  canonicalizeFilePath, normalizeTaskFiles,
  findOverlappingTasks, getOverlapsForRequest, hasOverlappingMergedTasks,
  createChange, getChange, listChanges, updateChange,
  createLoop, getLoop, updateLoop, listLoops, stopLoop,
  createLoopRequest, listLoopRequests,
};
