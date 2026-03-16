'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const allocator = require('../src/allocator');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-alloc-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  allocator.stop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Allocator tick (thin notifier)', () => {
  it('should promote pending tasks to ready', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Test feature');
    db.createTask({
      request_id: reqId,
      subject: 'Do work',
      description: 'Implement the thing',
      domain: 'backend',
    });

    // Run tick to promote
    allocator.tick();
    const ready = db.getReadyTasks();
    assert.strictEqual(ready.length, 1);
  });

  it('should ignore ready and pending tasks from terminal requests', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const activeReqId = db.createRequest('Active request');
    const activePendingTaskId = db.createTask({
      request_id: activeReqId,
      subject: 'Active pending task',
      description: 'Should be promoted',
    });

    const completedReqId = db.createRequest('Completed request');
    const completedPendingTaskId = db.createTask({
      request_id: completedReqId,
      subject: 'Completed pending task',
      description: 'Should stay pending',
    });
    const completedReadyTaskId = db.createTask({
      request_id: completedReqId,
      subject: 'Completed ready task',
      description: 'Should be ignored by ready discovery',
    });
    db.updateTask(completedReadyTaskId, { status: 'ready', assigned_to: null });
    db.updateRequest(completedReqId, { status: 'completed' });

    const failedReqId = db.createRequest('Failed request');
    const failedPendingTaskId = db.createTask({
      request_id: failedReqId,
      subject: 'Failed pending task',
      description: 'Should stay pending',
    });
    const failedReadyTaskId = db.createTask({
      request_id: failedReqId,
      subject: 'Failed ready task',
      description: 'Should be ignored by ready discovery',
    });
    db.updateTask(failedReadyTaskId, { status: 'ready', assigned_to: null });
    db.updateRequest(failedReqId, { status: 'failed' });

    // Drain existing mail
    db.checkMail('allocator');

    allocator.tick();

    assert.strictEqual(db.getTask(activePendingTaskId).status, 'ready');
    assert.strictEqual(db.getTask(completedPendingTaskId).status, 'pending');
    assert.strictEqual(db.getTask(failedPendingTaskId).status, 'pending');

    const readyTaskIds = db.getReadyTasks().map((task) => task.id);
    assert.deepStrictEqual(readyTaskIds, [activePendingTaskId]);

    const mail = db.checkMail('allocator');
    const available = mail.filter((entry) => entry.type === 'tasks_available');
    assert.strictEqual(available.length, 1);
    assert.strictEqual(available[0].payload.ready_count, 1);
  });

  it('should send tasks_available mail when ready tasks and idle workers exist', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Desc' });
    db.updateTask(taskId, { status: 'ready' });

    // Drain existing mail
    db.checkMail('allocator');

    allocator.tick();

    const mail = db.checkMail('allocator');
    const available = mail.filter(m => m.type === 'tasks_available');
    assert.strictEqual(available.length, 1);
    assert.strictEqual(available[0].payload.ready_count, 1);
    assert.strictEqual(available[0].payload.idle_count, 1);
  });

  it('should not notify when no idle workers', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.updateWorker(1, { status: 'busy' });

    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Desc' });
    db.updateTask(taskId, { status: 'ready' });

    // Drain existing mail
    db.checkMail('allocator');

    allocator.tick();

    const mail = db.checkMail('allocator');
    const available = mail.filter(m => m.type === 'tasks_available');
    assert.strictEqual(available.length, 0);
  });

  it('should skip claimed workers when counting idle', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.claimWorker(1, 'architect');

    const reqId = db.createRequest('Test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Desc' });
    db.updateTask(taskId, { status: 'ready' });

    // Drain existing mail
    db.checkMail('allocator');

    allocator.tick();

    const mail = db.checkMail('allocator');
    const available = mail.filter(m => m.type === 'tasks_available');
    assert.strictEqual(available.length, 0); // no unclaimed idle workers
  });
});

describe('Worker claim/release', () => {
  it('should claim and release workers', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const claimed = db.claimWorker(1, 'architect');
    assert.strictEqual(claimed, true);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, 'architect');

    // Cannot claim again
    const claimed2 = db.claimWorker(1, 'allocator');
    assert.strictEqual(claimed2, false);

    // Release
    db.releaseWorker(1);
    const workerAfter = db.getWorker(1);
    assert.strictEqual(workerAfter.claimed_by, null);

    // Can claim again after release
    const claimed3 = db.claimWorker(1, 'allocator');
    assert.strictEqual(claimed3, true);
  });

  it('should not claim busy workers', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.updateWorker(1, { status: 'busy' });

    const claimed = db.claimWorker(1, 'architect');
    assert.strictEqual(claimed, false);
  });
});

describe('Request completion tracking', () => {
  it('should detect when all tasks for a request are completed', () => {
    const reqId = db.createRequest('Test');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    // Not done yet
    let result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_done, false);
    assert.strictEqual(result.all_completed, false);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.completed, 0);

    // Complete one
    db.updateTask(t1, { status: 'completed' });
    result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_done, false);
    assert.strictEqual(result.all_completed, false);
    assert.strictEqual(result.completed, 1);

    // Complete the other
    db.updateTask(t2, { status: 'completed' });
    result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_done, true);
    assert.strictEqual(result.all_completed, true);
    assert.strictEqual(result.completed, 2);
  });

  it('should treat mixed completed and failed tasks as not done', () => {
    const reqId = db.createRequest('Mixed completion');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'failed' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.completed, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.all_completed, false);
    assert.strictEqual(result.all_done, false);
  });

  it('should recover stale decomposed tier-3 zero-task requests during completion checks', () => {
    const reqId = db.createRequest('Stale decomposed request');
    db.updateRequest(reqId, { status: 'decomposed', tier: 3 });
    db.getDb().prepare(
      "UPDATE requests SET updated_at = datetime('now', '-3 minutes') WHERE id = ?"
    ).run(reqId);

    const result = db.checkRequestCompletion(reqId, { source: 'allocator_completion_check' });
    assert.strictEqual(result.request_status, 'pending');
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.completed, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.all_completed, false);
    assert.strictEqual(result.all_done, false);
    assert.strictEqual(result.stale_decomposed_recovered, true);

    const request = db.getRequest(reqId);
    assert.strictEqual(request.status, 'pending');
  });

  it('should keep zero-task non-terminal requests as not done', () => {
    const reqId = db.createRequest('Zero task pending request');

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.request_status, 'pending');
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.completed, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.all_completed, false);
    assert.strictEqual(result.all_done, false);
  });

  it('should treat zero-task completed requests as completed', () => {
    const reqId = db.createRequest('Zero task completed request');
    db.updateRequest(reqId, { status: 'completed' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.request_status, 'completed');
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.completed, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.all_completed, true);
    assert.strictEqual(result.all_done, true);
  });

  it('should treat zero-task failed requests as done but not completed', () => {
    const reqId = db.createRequest('Zero task failed request');
    db.updateRequest(reqId, { status: 'failed' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.request_status, 'failed');
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.completed, 0);
    assert.strictEqual(result.failed, 0);
    assert.strictEqual(result.all_completed, false);
    assert.strictEqual(result.all_done, true);
  });
});
