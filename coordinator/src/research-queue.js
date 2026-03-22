'use strict';

const crypto = require('crypto');
const db = require('./db');

/**
 * Research Queue module — manages automated research requests
 * that get sent to ChatGPT for investigation.
 */

function ensureTable() {
  const d = db.getDb();

  // Check if the table exists with the old constraint (only 'deep_research','regular')
  const tableInfo = d.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='research_queue'"
  ).get();

  if (tableInfo && tableInfo.sql && !tableInfo.sql.includes("'standard'")) {
    // Old schema detected — migrate: save active rows, recreate table
    const activeRows = d.prepare(
      "SELECT * FROM research_queue WHERE status IN ('queued','in_progress')"
    ).all();
    d.exec('DROP TABLE research_queue');

    _createTable(d);

    // Re-insert active rows with mode migration (regular → standard)
    const ins = d.prepare(`
      INSERT INTO research_queue (topic, question, context, existing_knowledge, priority, mode,
        source_task_id, source_agent, target_links, status, result_note_path, created_at, started_at, completed_at, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of activeRows) {
      ins.run(
        row.topic, row.question, row.context, row.existing_knowledge,
        row.priority, row.mode === 'regular' ? 'standard' : row.mode,
        row.source_task_id, row.source_agent, row.target_links,
        row.status, row.result_note_path, row.created_at, row.started_at,
        row.completed_at, row.error
      );
    }
    if (activeRows.length > 0) {
      // Log migration for visibility
      db.log('research', 'schema_migrated', {
        migrated_rows: activeRows.length,
        old_modes: ['regular', 'deep_research'],
        new_modes: ['standard', 'thinking', 'deep_research'],
      });
    }
  } else if (!tableInfo) {
    _createTable(d);
  }

  // Lightweight forward migrations for additive columns.
  const cols = d.prepare('PRAGMA table_info(research_queue)').all();
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('attempts')) {
    d.exec("ALTER TABLE research_queue ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0");
  }
  if (!colNames.has('relevant_files')) {
    d.exec("ALTER TABLE research_queue ADD COLUMN relevant_files TEXT");
  }
}

function _createTable(d) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS research_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      context TEXT,
      existing_knowledge TEXT,
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('urgent','normal','low')),
      mode TEXT NOT NULL DEFAULT 'standard'
        CHECK (mode IN ('standard','thinking','deep_research')),
      source_task_id TEXT,
      source_agent TEXT,
      target_links TEXT,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','in_progress','completed','failed')),
      result_note_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT,
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      relevant_files TEXT
    )
  `);
  d.exec(`
    CREATE INDEX IF NOT EXISTS idx_research_queue_status ON research_queue(status);
    CREATE INDEX IF NOT EXISTS idx_research_queue_topic ON research_queue(topic);
    CREATE INDEX IF NOT EXISTS idx_research_queue_priority
      ON research_queue(priority, status);
  `);
}

function queueResearch({ topic, question, context, existing_knowledge, priority, mode, source_task_id, source_agent, target_links, relevant_files }) {
  ensureTable();
  const d = db.getDb();

  // Deduplicate: skip if identical topic+question is already queued/in_progress
  const existing = d.prepare(`
    SELECT id FROM research_queue
    WHERE topic = ? AND question = ? AND status IN ('queued','in_progress')
  `).get(topic, question);
  if (existing) {
    return { id: existing.id, deduplicated: true };
  }

  const linksJson = target_links
    ? (typeof target_links === 'string' ? target_links : JSON.stringify(target_links))
    : null;

  const filesJson = relevant_files
    ? (typeof relevant_files === 'string' ? relevant_files : JSON.stringify(relevant_files))
    : null;

  const result = d.prepare(`
    INSERT INTO research_queue (topic, question, context, existing_knowledge, priority, mode, source_task_id, source_agent, target_links, relevant_files)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    topic,
    question,
    context || null,
    existing_knowledge || null,
    priority || 'normal',
    mode || 'standard',
    source_task_id || null,
    source_agent || null,
    linksJson,
    filesJson
  );

  db.log('research', 'research_queued', {
    id: result.lastInsertRowid,
    topic,
    question: question.slice(0, 200),
    mode: mode || 'standard',
    priority: priority || 'normal',
  });

  return { id: result.lastInsertRowid, deduplicated: false };
}

function getNextQueued() {
  ensureTable();
  return db.getDb().prepare(`
    SELECT * FROM research_queue
    WHERE status = 'queued'
    ORDER BY
      CASE priority WHEN 'urgent' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END,
      id ASC
    LIMIT 1
  `).get() || null;
}

function markInProgress(id) {
  ensureTable();
  const result = db.getDb().prepare(`
    UPDATE research_queue
    SET status = 'in_progress',
        started_at = datetime('now'),
        attempts = COALESCE(attempts, 0) + 1
    WHERE id = ? AND status = 'queued'
  `).run(id);
  if (result.changes > 0) {
    db.log('research', 'research_started', { id });
    return true;
  }
  return false;
}

function requeueStaleInProgress(maxAgeMinutes = 120) {
  ensureTable();
  const minutes = Number.isFinite(Number(maxAgeMinutes)) && Number(maxAgeMinutes) >= 0
    ? Math.floor(Number(maxAgeMinutes))
    : 120;
  const cutoffModifier = `-${minutes} minutes`;
  const d = db.getDb();
  const stale = d.prepare(`
    SELECT id, COALESCE(attempts, 0) AS attempts
    FROM research_queue
    WHERE status = 'in_progress'
      AND (
        started_at IS NULL
        OR datetime(started_at) <= datetime('now', ?)
      )
  `).all(cutoffModifier);
  if (!stale || stale.length === 0) return { requeued: 0, ids: [] };

  const nowIso = new Date().toISOString();
  const note = `Automatically re-queued after stale in_progress timeout at ${nowIso}`;
  const failNote = `Exceeded retry limit after stale in_progress timeout at ${nowIso}`;
  const updQueued = d.prepare(`
    UPDATE research_queue
    SET status = 'queued',
        started_at = NULL,
        error = ?
    WHERE id = ? AND status = 'in_progress'
  `);
  const updFailed = d.prepare(`
    UPDATE research_queue
    SET status = 'failed',
        completed_at = datetime('now'),
        error = ?
    WHERE id = ? AND status = 'in_progress'
  `);
  const ids = [];
  const failedIds = [];
  for (const row of stale) {
    if (row.attempts >= 3) {
      const result = updFailed.run(failNote, row.id);
      if (result.changes > 0) failedIds.push(row.id);
      continue;
    }
    const result = updQueued.run(note, row.id);
    if (result.changes > 0) ids.push(row.id);
  }
  if (ids.length > 0 || failedIds.length > 0) {
    db.log('research', 'research_requeued_stale', {
      ids,
      failed_ids: failedIds,
      max_age_minutes: minutes,
    });
  }
  return { requeued: ids.length, failed: failedIds.length, ids, failed_ids: failedIds };
}

function markComplete(id, notePath) {
  ensureTable();
  db.getDb().prepare(`
    UPDATE research_queue
    SET status = 'completed', result_note_path = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(notePath, id);
  db.log('research', 'research_completed', { id, result_note_path: notePath });
}

function markFailed(id, error) {
  ensureTable();
  db.getDb().prepare(`
    UPDATE research_queue
    SET status = 'failed', error = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(error, id);
  db.log('research', 'research_failed', { id, error: String(error).slice(0, 500) });
}

function listResearch(filters = {}) {
  ensureTable();
  let sql = 'SELECT * FROM research_queue WHERE 1=1';
  const vals = [];
  if (filters.topic) { sql += ' AND topic = ?'; vals.push(filters.topic); }
  if (filters.status) { sql += ' AND status = ?'; vals.push(filters.status); }
  sql += ' ORDER BY id DESC';
  if (filters.limit) { sql += ' LIMIT ?'; vals.push(filters.limit); }
  return db.getDb().prepare(sql).all(...vals);
}

function getResearch(id) {
  ensureTable();
  return db.getDb().prepare('SELECT * FROM research_queue WHERE id = ?').get(id);
}

function getDeepResearchStats() {
  ensureTable();
  const d = db.getDb();
  const today = d.prepare(`
    SELECT COUNT(*) as cnt FROM research_queue
    WHERE mode = 'deep_research'
      AND status IN ('in_progress','completed')
      AND created_at >= date('now')
  `).get();
  const total = d.prepare(`
    SELECT COUNT(*) as cnt FROM research_queue
    WHERE mode = 'deep_research'
      AND status IN ('in_progress','completed')
  `).get();
  return { today: today ? today.cnt : 0, total: total ? total.cnt : 0 };
}

module.exports = {
  ensureTable,
  queueResearch,
  getNextQueued,
  markInProgress,
  requeueStaleInProgress,
  markComplete,
  markFailed,
  listResearch,
  getResearch,
  getDeepResearchStats,
};
