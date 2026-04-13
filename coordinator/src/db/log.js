'use strict';

function createLogRepository(context) {
  const {
    getDb,
  } = context;

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

  return {
    log,
    getLog,
  };
}

module.exports = { createLogRepository };
