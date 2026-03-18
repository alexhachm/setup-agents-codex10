'use strict';

/**
 * research-queue.js
 *
 * Thin wrapper around the research_intents table for marking individual items
 * in-progress, complete, or failed.  All three functions guard on the expected
 * status so that concurrent completions (race conditions) are silently dropped
 * rather than causing duplicate transitions.
 *
 * Pattern:
 *   markInProgress – queued|planned → running  (guards on those source statuses)
 *   markComplete   – running → completed        (guards on status = 'running')
 *   markFailed     – running → failed           (guards on status = 'running')
 */

const db = require('./db');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Transition a research intent from queued/planned → running.
 *
 * Guards: only updates rows whose current status is 'queued' or 'planned'.
 * Returns true if the row was updated, false if the guard rejected it
 * (item was already running, completed, failed, etc.).
 *
 * @param {number} id  research_intents.id
 * @returns {boolean}
 */
function markInProgress(id) {
  const ts = now();
  const result = db.getDb().prepare(`
    UPDATE research_intents
    SET status = 'running', updated_at = ?
    WHERE id = ? AND status IN ('queued', 'planned')
  `).run(ts, id);
  return result.changes > 0;
}

/**
 * Transition a research intent from running → completed.
 *
 * Guards: only updates the row if its current status is 'running'.
 * If the item has already been completed or failed (race condition), the
 * update is silently skipped and false is returned.
 *
 * @param {number} id  research_intents.id
 * @returns {boolean}
 */
function markComplete(id) {
  const ts = now();
  const result = db.getDb().prepare(`
    UPDATE research_intents
    SET status = 'completed', resolved_at = ?, updated_at = ?
    WHERE id = ? AND status = 'running'
  `).run(ts, ts, id);
  return result.changes > 0;
}

/**
 * Transition a research intent from running → failed.
 *
 * Guards: only updates the row if its current status is 'running'.
 * If the item has already been completed or failed (race condition), the
 * update is silently skipped and false is returned.
 *
 * @param {number} id     research_intents.id
 * @param {string} error  human-readable failure reason
 * @returns {boolean}
 */
function markFailed(id, error) {
  const ts = now();
  const result = db.getDb().prepare(`
    UPDATE research_intents
    SET status = 'failed',
        failure_count = failure_count + 1,
        last_error = ?,
        updated_at = ?
    WHERE id = ? AND status = 'running'
  `).run(error ? String(error) : null, ts, id);
  return result.changes > 0;
}

module.exports = { markInProgress, markComplete, markFailed };
