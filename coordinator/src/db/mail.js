'use strict';

function createMailRepository(context) {
  const {
    getDb,
  } = context;

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

  return {
    sendMail,
    checkMail,
    checkMailBlocking,
    purgeOldMail,
  };
}

module.exports = { createMailRepository };
