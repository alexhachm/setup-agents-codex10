'use strict';

/**
 * Regression tests for research-queue status guards.
 *
 * Covers:
 *  - markInProgress: only transitions queued/planned → running
 *  - markComplete: only transitions running → completed (guard rejects others)
 *  - markFailed:   only transitions running → failed   (guard rejects others)
 *  - Race condition: second markComplete/markFailed on a non-running item returns false
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const researchQueue = require('../src/research-queue');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-rq-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enqueue(overrides = {}) {
  return db.enqueueResearchIntent({
    intent_type: 'browser_research',
    intent_payload: { url: 'https://example.com', query: 'test' },
    priority_score: 500,
    batch_size_cap: 5,
    timeout_window_ms: 120000,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// markInProgress
// ---------------------------------------------------------------------------

describe('researchQueue.markInProgress', () => {
  it('transitions a queued intent to running and returns true', () => {
    const { intent } = enqueue();
    const ok = researchQueue.markInProgress(intent.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'running');
  });

  it('returns false when intent is already running (guard rejects re-entry)', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    const second = researchQueue.markInProgress(intent.id);
    assert.strictEqual(second, false);
    // status unchanged
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'running');
  });

  it('returns false when intent does not exist', () => {
    const ok = researchQueue.markInProgress(999999);
    assert.strictEqual(ok, false);
  });
});

// ---------------------------------------------------------------------------
// markComplete
// ---------------------------------------------------------------------------

describe('researchQueue.markComplete', () => {
  it('transitions a running intent to completed and returns true', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    const ok = researchQueue.markComplete(intent.id);
    assert.strictEqual(ok, true);
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'completed');
  });

  it('returns false when intent is not running (queued state)', () => {
    const { intent } = enqueue();
    // still queued — guard should reject
    const ok = researchQueue.markComplete(intent.id);
    assert.strictEqual(ok, false);
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'queued');
  });

  it('regression: second markComplete returns false (race condition guard)', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    researchQueue.markComplete(intent.id);
    // second call — intent is now 'completed', guard must reject
    const second = researchQueue.markComplete(intent.id);
    assert.strictEqual(second, false);
  });

  it('returns false when intent does not exist', () => {
    const ok = researchQueue.markComplete(999999);
    assert.strictEqual(ok, false);
  });
});

// ---------------------------------------------------------------------------
// markFailed
// ---------------------------------------------------------------------------

describe('researchQueue.markFailed', () => {
  it('transitions a running intent to failed and returns true', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    const ok = researchQueue.markFailed(intent.id, 'timeout');
    assert.strictEqual(ok, true);
    const row = db.getResearchIntent(intent.id);
    assert.strictEqual(row.status, 'failed');
    assert.strictEqual(row.last_error, 'timeout');
  });

  it('returns false when intent is not running (queued state)', () => {
    const { intent } = enqueue();
    const ok = researchQueue.markFailed(intent.id, 'err');
    assert.strictEqual(ok, false);
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'queued');
  });

  it('regression: markFailed after markComplete returns false (race condition guard)', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    researchQueue.markComplete(intent.id);
    // intent is now 'completed', guard must reject late fail
    const late = researchQueue.markFailed(intent.id, 'late error');
    assert.strictEqual(late, false);
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'completed');
  });

  it('regression: markComplete after markFailed returns false (race condition guard)', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    researchQueue.markFailed(intent.id, 'first error');
    const late = researchQueue.markComplete(intent.id);
    assert.strictEqual(late, false);
    assert.strictEqual(db.getResearchIntent(intent.id).status, 'failed');
  });

  it('increments failure_count on each successful markFailed', () => {
    const { intent } = enqueue();
    researchQueue.markInProgress(intent.id);
    researchQueue.markFailed(intent.id, 'err1');
    const row = db.getResearchIntent(intent.id);
    assert.ok(row.failure_count >= 1, 'failure_count should be incremented');
  });

  it('returns false when intent does not exist', () => {
    const ok = researchQueue.markFailed(999999, 'nope');
    assert.strictEqual(ok, false);
  });
});
