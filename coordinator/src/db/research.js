'use strict';

/**
 * Citation tracking for search results.
 * Stores and retrieves citations linked to requests/tasks.
 */

let _db = null;

function init(db) {
  _db = db;
  ensureTable();
}

function ensureTable() {
  if (!_db) return;
  const rawDb = _db.getDb ? _db.getDb() : null;
  if (!rawDb) return;
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS search_citations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT,
      task_id INTEGER,
      query TEXT NOT NULL,
      provider TEXT NOT NULL,
      title TEXT,
      url TEXT NOT NULL,
      snippet TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      vertical TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_citations_request
      ON search_citations(request_id, task_id);
    CREATE INDEX IF NOT EXISTS idx_citations_query
      ON search_citations(query);
    CREATE INDEX IF NOT EXISTS idx_citations_url
      ON search_citations(url);
  `);
}

function storeCitations(citations, context = {}) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  const stmt = rawDb.prepare(`
    INSERT INTO search_citations (request_id, task_id, query, provider, title, url, snippet, position, vertical, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const ids = [];
  const insertMany = rawDb.transaction((items) => {
    for (const item of items) {
      const result = stmt.run(
        context.request_id || null,
        context.task_id || null,
        context.query || '',
        context.provider || '',
        item.title || '',
        item.url,
        item.snippet || '',
        item.index || item.position || 0,
        context.vertical || null,
        item.metadata ? JSON.stringify(item.metadata) : null
      );
      ids.push(result.lastInsertRowid);
    }
  });

  insertMany(citations);
  return ids;
}

function getCitationsForRequest(requestId) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  return rawDb.prepare(
    'SELECT * FROM search_citations WHERE request_id = ? ORDER BY created_at DESC, position ASC'
  ).all(requestId);
}

function getCitationsForTask(taskId) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  return rawDb.prepare(
    'SELECT * FROM search_citations WHERE task_id = ? ORDER BY created_at DESC, position ASC'
  ).all(taskId);
}

function getCitationsByQuery(query) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  return rawDb.prepare(
    'SELECT * FROM search_citations WHERE query = ? ORDER BY created_at DESC'
  ).all(query);
}

function getCitationsByUrl(url) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  return rawDb.prepare(
    'SELECT * FROM search_citations WHERE url = ? ORDER BY created_at DESC'
  ).all(url);
}

function getRecentCitations(limit = 50) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  return rawDb.prepare(
    'SELECT * FROM search_citations ORDER BY created_at DESC LIMIT ?'
  ).all(limit);
}

function reset() {
  _db = null;
}

module.exports = {
  init,
  storeCitations,
  getCitationsForRequest,
  getCitationsForTask,
  getCitationsByQuery,
  getCitationsByUrl,
  getRecentCitations,
  reset,
};
