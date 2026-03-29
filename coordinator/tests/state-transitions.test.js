'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-transitions-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('State transition guards — requests', () => {
  it('valid transitions do not log invalid_state_transition', () => {
    const reqId = db.createRequest('Test');
    db.updateRequest(reqId, { status: 'triaging' });
    db.updateRequest(reqId, { status: 'decomposed' });
    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateRequest(reqId, { status: 'integrating' });
    db.updateRequest(reqId, { status: 'completed' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0, 'no invalid transitions should be logged');
  });

  it('invalid transition logs warning (pending→integrating)', () => {
    const reqId = db.createRequest('Test');
    // pending → integrating is not valid (must go through in_progress first)
    db.updateRequest(reqId, { status: 'integrating' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 1);
    const detail = JSON.parse(logs[0].details);
    assert.strictEqual(detail.entity, 'requests');
    assert.strictEqual(detail.from, 'pending');
    assert.strictEqual(detail.to, 'integrating');
  });

  it('same-status update is not flagged', () => {
    const reqId = db.createRequest('Test');
    db.updateRequest(reqId, { status: 'pending' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });

  it('completed can re-open to in_progress', () => {
    const reqId = db.createRequest('Test');
    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateRequest(reqId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'in_progress' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });
});

describe('State transition guards — tasks', () => {
  it('valid lifecycle: pending→ready→assigned→in_progress→completed', () => {
    const reqId = db.createRequest('Test');
    db.registerWorker(1, '/wt-1', 'agent-1');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    db.updateTask(taskId, { status: 'ready' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(taskId, { status: 'in_progress' });
    db.updateTask(taskId, { status: 'completed' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });

  it('completed is terminal — transitioning from it logs warning', () => {
    const reqId = db.createRequest('Test');
    db.registerWorker(1, '/wt-1', 'agent-1');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    db.updateTask(taskId, { status: 'ready' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(taskId, { status: 'completed' });
    // completed → ready is invalid
    db.updateTask(taskId, { status: 'ready' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 1);
    const detail = JSON.parse(logs[0].details);
    assert.strictEqual(detail.from, 'completed');
    assert.strictEqual(detail.to, 'ready');
  });

  it('failed tasks can be retried (failed→ready)', () => {
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    db.updateTask(taskId, { status: 'ready' });
    db.updateTask(taskId, { status: 'failed' });
    db.updateTask(taskId, { status: 'ready' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });
});

describe('State transition guards — merge_queue', () => {
  it('valid lifecycle: pending→merging→merged', () => {
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    db.enqueueMerge({ request_id: reqId, task_id: taskId, pr_url: 'pr/1', branch: 'b1' });
    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'merging' });
    db.updateMerge(entry.id, { status: 'merged' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });

  it('merged is terminal — transitioning logs warning', () => {
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    db.enqueueMerge({ request_id: reqId, task_id: taskId, pr_url: 'pr/1', branch: 'b1' });
    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'merging' });
    db.updateMerge(entry.id, { status: 'merged' });
    // merged → pending is invalid
    db.updateMerge(entry.id, { status: 'pending' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 1);
  });

  it('conflict can go back to pending (retry)', () => {
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    db.enqueueMerge({ request_id: reqId, task_id: taskId, pr_url: 'pr/1', branch: 'b1' });
    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'merging' });
    db.updateMerge(entry.id, { status: 'conflict' });
    db.updateMerge(entry.id, { status: 'pending' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });
});

describe('State transition guards — workers', () => {
  it('valid lifecycle: idle→assigned→running→idle', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.updateWorker(1, { status: 'assigned' });
    db.updateWorker(1, { status: 'running' });
    db.updateWorker(1, { status: 'idle' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });

  it('completed_task→idle is valid', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.updateWorker(1, { status: 'assigned' });
    db.updateWorker(1, { status: 'completed_task' });
    db.updateWorker(1, { status: 'idle' });

    const logs = db.getLog(50, 'coordinator').filter(e => e.action === 'invalid_state_transition');
    assert.strictEqual(logs.length, 0);
  });
});

describe('ALLOWED_TRANSITIONS export', () => {
  it('exports transition maps for all 4 entities', () => {
    assert.ok(db.ALLOWED_TRANSITIONS.requests);
    assert.ok(db.ALLOWED_TRANSITIONS.tasks);
    assert.ok(db.ALLOWED_TRANSITIONS.merge_queue);
    assert.ok(db.ALLOWED_TRANSITIONS.workers);
  });
});
