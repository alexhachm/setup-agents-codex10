'use strict';

/**
 * Confirmations DB — safety gate for dangerous actions.
 * Actions like purchases, deletes, emails require explicit approval.
 */

let _db = null;

function init(db) {
  _db = db;
}

function createConfirmation(opts) {
  if (!_db) throw new Error('DB not initialized');
  const rawDb = _db.getDb();
  const expiresAt = opts.expires_minutes
    ? new Date(Date.now() + opts.expires_minutes * 60000).toISOString()
    : null;

  const result = rawDb.prepare(`
    INSERT INTO confirmations (action_type, action_description, action_payload, requester, task_id, request_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.action_type,
    opts.action_description,
    opts.action_payload ? JSON.stringify(opts.action_payload) : null,
    opts.requester,
    opts.task_id || null,
    opts.request_id || null,
    expiresAt
  );

  return Number(result.lastInsertRowid);
}

function getConfirmation(id) {
  if (!_db) return null;
  const rawDb = _db.getDb();
  return rawDb.prepare('SELECT * FROM confirmations WHERE id = ?').get(id);
}

function getPendingConfirmations(requester) {
  if (!_db) return [];
  const rawDb = _db.getDb();
  // Expire old ones first
  rawDb.prepare(`
    UPDATE confirmations SET status = 'expired'
    WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < datetime('now')
  `).run();

  if (requester) {
    return rawDb.prepare(
      "SELECT * FROM confirmations WHERE status = 'pending' AND requester = ? ORDER BY created_at ASC"
    ).all(requester);
  }
  return rawDb.prepare(
    "SELECT * FROM confirmations WHERE status = 'pending' ORDER BY created_at ASC"
  ).all();
}

function approveConfirmation(id, reviewer, reason) {
  if (!_db) return false;
  const rawDb = _db.getDb();
  const result = rawDb.prepare(`
    UPDATE confirmations
    SET status = 'approved', reviewer = ?, review_reason = ?, reviewed_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(reviewer || 'user', reason || null, id);
  return result.changes > 0;
}

function denyConfirmation(id, reviewer, reason) {
  if (!_db) return false;
  const rawDb = _db.getDb();
  const result = rawDb.prepare(`
    UPDATE confirmations
    SET status = 'denied', reviewer = ?, review_reason = ?, reviewed_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(reviewer || 'user', reason || null, id);
  return result.changes > 0;
}

function isActionAutoApproved(actionType) {
  const settings = require('../settings-manager');
  const autoApprove = settings.get('safety.auto_approve') || [];
  return autoApprove.includes(actionType);
}

function requiresConfirmation(actionType) {
  const settings = require('../settings-manager');
  const required = settings.get('safety.require_confirmation') || [];
  return required.includes(actionType);
}

/**
 * Request confirmation for an action. Returns immediately if auto-approved.
 * @returns {Object} - { id, status, auto_approved }
 */
function requestConfirmation(opts) {
  if (isActionAutoApproved(opts.action_type)) {
    const id = createConfirmation({ ...opts });
    approveConfirmation(id, 'system', 'Auto-approved per settings');
    return { id, status: 'auto_approved', auto_approved: true };
  }

  if (!requiresConfirmation(opts.action_type)) {
    const id = createConfirmation({ ...opts });
    approveConfirmation(id, 'system', 'Action type not in require_confirmation list');
    return { id, status: 'auto_approved', auto_approved: true };
  }

  const id = createConfirmation(opts);
  return { id, status: 'pending', auto_approved: false };
}

function reset() {
  _db = null;
}

module.exports = {
  init,
  createConfirmation,
  getConfirmation,
  getPendingConfirmations,
  approveConfirmation,
  denyConfirmation,
  isActionAutoApproved,
  requiresConfirmation,
  requestConfirmation,
  reset,
};
