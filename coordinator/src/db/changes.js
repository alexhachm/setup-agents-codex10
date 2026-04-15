'use strict';

function createChangesRepository(context) {
  const {
    getDb,
    validateColumns,
  } = context;

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

  return {
    createChange,
    getChange,
    listChanges,
    updateChange,
  };
}

module.exports = { createChangesRepository };
