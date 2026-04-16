'use strict';

/**
 * Audit Log Export — export activity logs as JSON or CSV.
 */

const db = require('./db');
const fs = require('fs');
const path = require('path');

function exportJson(filePath, opts = {}) {
  const rawDb = db.getDb();
  const { from, to, actor, limit } = opts;

  let sql = 'SELECT * FROM activity_log WHERE 1=1';
  const params = [];

  if (from) { sql += ' AND created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND created_at <= ?'; params.push(to); }
  if (actor) { sql += ' AND actor = ?'; params.push(actor); }

  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }

  const rows = rawDb.prepare(sql).all(...params);

  const output = rows.map(row => {
    let details;
    try { details = JSON.parse(row.details); } catch { details = row.details; }
    return {
      id: row.id,
      actor: row.actor,
      action: row.action,
      details,
      created_at: row.created_at,
    };
  });

  fs.writeFileSync(filePath, JSON.stringify(output, null, 2) + '\n', 'utf-8');

  // Record export
  rawDb.prepare(`
    INSERT INTO audit_exports (export_format, file_path, record_count, from_date, to_date)
    VALUES ('json', ?, ?, ?, ?)
  `).run(filePath, rows.length, from || null, to || null);

  return { format: 'json', file_path: filePath, record_count: rows.length };
}

function exportCsv(filePath, opts = {}) {
  const rawDb = db.getDb();
  const { from, to, actor, limit } = opts;

  let sql = 'SELECT * FROM activity_log WHERE 1=1';
  const params = [];

  if (from) { sql += ' AND created_at >= ?'; params.push(from); }
  if (to) { sql += ' AND created_at <= ?'; params.push(to); }
  if (actor) { sql += ' AND actor = ?'; params.push(actor); }

  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }

  const rows = rawDb.prepare(sql).all(...params);

  // CSV header
  const lines = ['id,actor,action,details,created_at'];

  for (const row of rows) {
    const details = (row.details || '').replace(/"/g, '""');
    lines.push(`${row.id},"${row.actor}","${row.action}","${details}","${row.created_at}"`);
  }

  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');

  rawDb.prepare(`
    INSERT INTO audit_exports (export_format, file_path, record_count, from_date, to_date)
    VALUES ('csv', ?, ?, ?, ?)
  `).run(filePath, rows.length, from || null, to || null);

  return { format: 'csv', file_path: filePath, record_count: rows.length };
}

function listExports() {
  const rawDb = db.getDb();
  return rawDb.prepare('SELECT * FROM audit_exports ORDER BY created_at DESC').all();
}

module.exports = { exportJson, exportCsv, listExports };
