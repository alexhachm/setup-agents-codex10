'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const merger = require('../src/merger');

let tmpDir;

function getRequestCompletionMailCount(requestId) {
  return db.checkMail('master-1', false)
    .filter((mail) => mail.type === 'request_completed' && mail.payload.request_id === requestId)
    .length;
}

function getRequestCompletionLogCount(requestId) {
  return db.getLog(50, 'coordinator')
    .filter((entry) => {
      if (entry.action !== 'request_completed') return false;
      try {
        return JSON.parse(entry.details || '{}').request_id === requestId;
      } catch {
        return false;
      }
    })
    .length;
}

function getRequestFailedMailCount(requestId) {
  return db.checkMail('master-1', false)
    .filter((mail) => mail.type === 'request_failed' && mail.payload.request_id === requestId)
    .length;
}

function getRequestFailedLogCount(requestId) {
  return db.getLog(50, 'coordinator')
    .filter((entry) => {
      if (entry.action !== 'request_failed') return false;
      try {
        return JSON.parse(entry.details || '{}').request_id === requestId;
      } catch {
        return false;
      }
    })
    .length;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-merge-complete-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('onTaskCompleted merge queue completion guard', () => {
  it('fails request with actionable error for non-recoverable terminal merge rows', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Completed task', description: 'Done' });

    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateTask(taskId, { status: 'completed' });

    const merge = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/901',
      branch: 'agent-4',
    });
    db.updateMerge(merge.lastInsertRowid, {
      status: 'failed',
      error: 'non_recoverable_failure',
    });

    merger.onTaskCompleted(taskId);

    const blockedRequest = db.getRequest(reqId);
    assert.strictEqual(blockedRequest.status, 'failed');
    assert.match(String(blockedRequest.result || ''), /non-recoverable merge failures/i);
    assert.strictEqual(getRequestFailedMailCount(reqId), 1);
    assert.strictEqual(getRequestFailedLogCount(reqId), 1);
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('can complete later after the blocking merge row is resolved', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Completed task', description: 'Done' });

    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateTask(taskId, { status: 'completed' });

    const merge = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/901',
      branch: 'agent-4',
    });
    db.updateMerge(merge.lastInsertRowid, {
      status: 'failed',
      error: 'non_recoverable_failure',
    });

    merger.onTaskCompleted(taskId);

    db.updateMerge(merge.lastInsertRowid, {
      status: 'merged',
      error: null,
      merged_at: new Date().toISOString(),
    });

    merger.onTaskCompleted(taskId);

    const completedRequest = db.getRequest(reqId);
    assert.strictEqual(completedRequest.status, 'completed');
    assert.strictEqual(getRequestFailedMailCount(reqId), 1);
    assert.strictEqual(getRequestCompletionMailCount(reqId), 1);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 1);
  });
});
