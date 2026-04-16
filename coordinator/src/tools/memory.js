'use strict';

/**
 * Memory Tools — memory_search and memory_update as AGENT-CALLABLE tools.
 * Workers can call these during task execution, not just CLI-only.
 */

const db = require('../db');

const TOOL_DEFINITIONS = [
  {
    name: 'memory_search',
    description: 'Search project memory snapshots for relevant context. Returns matching memory entries based on query keywords.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for memory lookup' },
        limit: { type: 'number', description: 'Max results to return (default 10)' },
        project_context_key: { type: 'string', description: 'Filter by project context key' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_update',
    description: 'Store or update a memory entry for future retrieval. Useful for persisting learned context across tasks.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Memory key (unique identifier)' },
        value: { type: 'string', description: 'Memory content to store' },
        category: { type: 'string', description: 'Category: fact, preference, context, learning' },
        project_context_key: { type: 'string', description: 'Project context to associate with' },
      },
      required: ['key', 'value'],
    },
  },
];

function memorySearch(args) {
  const { query, limit = 10, project_context_key } = args;
  try {
    const rawDb = db.getDb();
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

    let sql = 'SELECT * FROM project_memory_snapshots WHERE 1=1';
    const params = [];

    if (project_context_key) {
      sql += ' AND project_context_key = ?';
      params.push(project_context_key);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit * 5); // fetch more, filter client-side

    const rows = rawDb.prepare(sql).all(...params);

    // Score by keyword match in snapshot_payload and source
    const scored = rows.map(row => {
      const content = (row.snapshot_payload || '').toLowerCase();
      const src = (row.source || '').toLowerCase();
      const score = keywords.reduce((acc, kw) => {
        if (src.includes(kw)) acc += 2;
        if (content.includes(kw)) acc += 1;
        return acc;
      }, 0);
      return { ...row, _score: score };
    }).filter(r => r._score > 0);

    scored.sort((a, b) => b._score - a._score);

    return {
      ok: true,
      results: scored.slice(0, limit).map(r => ({
        id: r.id,
        source: r.source,
        project_context_key: r.project_context_key,
        content_preview: (r.snapshot_payload || '').slice(0, 500),
        created_at: r.created_at,
        score: r._score,
      })),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function memoryUpdate(args) {
  const { key, value, category = 'context', project_context_key = 'default' } = args;
  try {
    const rawDb = db.getDb();
    const payload = JSON.stringify({ value, category });
    const crypto = require('crypto');
    const fingerprint = crypto.createHash('sha256').update(key + ':' + project_context_key).digest('hex').slice(0, 32);

    // Check if key already exists (use source field as the key identifier)
    const existing = rawDb.prepare(
      'SELECT id FROM project_memory_snapshots WHERE source = ? AND project_context_key = ?'
    ).get(key, project_context_key);

    if (existing) {
      rawDb.prepare(
        'UPDATE project_memory_snapshots SET snapshot_payload = ? WHERE id = ?'
      ).run(JSON.stringify({ value, category, updated_by: 'memory_tool' }), existing.id);
      return { ok: true, action: 'updated', id: existing.id };
    }

    const result = rawDb.prepare(`
      INSERT INTO project_memory_snapshots
        (source, project_context_key, snapshot_version, snapshot_payload, dedupe_fingerprint, validation_status)
      VALUES (?, ?, 1, ?, ?, 'validated')
    `).run(key, project_context_key, payload, fingerprint);
    return { ok: true, action: 'created', id: Number(result.lastInsertRowid) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function handleToolCall(toolName, args) {
  switch (toolName) {
    case 'memory_search': return memorySearch(args);
    case 'memory_update': return memoryUpdate(args);
    default: return { ok: false, error: `Unknown memory tool: ${toolName}` };
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  memorySearch,
  memoryUpdate,
  handleToolCall,
};
