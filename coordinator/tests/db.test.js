'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-db-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('enqueueMerge dedupe identity', () => {
  it('dedupes by request_id + pr_url + branch across different task_id values', () => {
    const reqId = db.createRequest('Merge dedupe by PR identity');
    const taskId1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'First attempt' });
    const taskId2 = db.createTask({ request_id: reqId, subject: 'Task 2', description: 'Second attempt' });

    const first = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId1,
      pr_url: 'https://github.com/org/repo/pull/500',
      branch: 'agent-1',
    });
    const second = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId2,
      pr_url: 'https://github.com/org/repo/pull/500',
      branch: 'agent-1',
    });

    assert.strictEqual(first.inserted, true);
    assert.strictEqual(second.inserted, false);

    const rows = db.getDb().prepare(`
      SELECT id, task_id, pr_url, branch
      FROM merge_queue
      WHERE request_id = ?
      ORDER BY id ASC
    `).all(reqId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].task_id, taskId1);
    assert.strictEqual(rows[0].pr_url, 'https://github.com/org/repo/pull/500');
    assert.strictEqual(rows[0].branch, 'agent-1');
  });

  it('preserves branch-only dedupe when pr_url is empty', () => {
    const reqId = db.createRequest('Merge dedupe by branch fallback');
    const taskId1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'No PR URL' });
    const taskId2 = db.createTask({ request_id: reqId, subject: 'Task 2', description: 'No PR URL retry' });

    const first = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId1,
      pr_url: null,
      branch: 'agent-2',
    });
    const second = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId2,
      pr_url: '',
      branch: 'agent-2',
    });

    assert.strictEqual(first.inserted, true);
    assert.strictEqual(second.inserted, false);

    const rows = db.getDb().prepare(`
      SELECT id, task_id, pr_url, branch
      FROM merge_queue
      WHERE request_id = ?
      ORDER BY id ASC
    `).all(reqId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].task_id, taskId1);
    assert.strictEqual(rows[0].pr_url, '');
    assert.strictEqual(rows[0].branch, 'agent-2');
  });
});
