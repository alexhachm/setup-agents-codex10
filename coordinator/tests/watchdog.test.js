'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const { THRESHOLDS, tick } = require('../src/watchdog');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-wd-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Watchdog thresholds', () => {
  it('should have correct escalation order', () => {
    assert.ok(THRESHOLDS.warn < THRESHOLDS.nudge);
    assert.ok(THRESHOLDS.nudge < THRESHOLDS.triage);
    assert.ok(THRESHOLDS.triage < THRESHOLDS.terminate);
  });

  it('should have default values', () => {
    assert.strictEqual(THRESHOLDS.warn, 60);
    assert.strictEqual(THRESHOLDS.nudge, 90);
    assert.strictEqual(THRESHOLDS.triage, 120);
    assert.strictEqual(THRESHOLDS.terminate, 180);
  });
});

describe('Orphan task recovery', () => {
  it('should detect orphaned tasks', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Orphaned task',
      description: 'This task was assigned but worker reset',
    });

    // Simulate: task assigned to worker, but worker is now idle
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    // Worker reset to idle without clearing task
    db.updateWorker(1, { status: 'idle', current_task_id: null });

    // Check for orphans
    const orphans = db.getDb().prepare(`
      SELECT t.* FROM tasks t
      JOIN workers w ON t.assigned_to = w.id
      WHERE t.status IN ('assigned', 'in_progress')
        AND w.status = 'idle'
        AND w.current_task_id IS NULL
    `).all();

    assert.strictEqual(orphans.length, 1);
    assert.strictEqual(orphans[0].id, taskId);
  });

  it('should not flag active assignments as orphans', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Active task',
      description: 'Worker is busy',
    });

    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId });

    const orphans = db.getDb().prepare(`
      SELECT t.* FROM tasks t
      JOIN workers w ON t.assigned_to = w.id
      WHERE t.status IN ('assigned', 'in_progress')
        AND w.status = 'idle'
        AND w.current_task_id IS NULL
    `).all();

    assert.strictEqual(orphans.length, 0);
  });
});

describe('Heartbeat staleness', () => {
  it('should detect stale heartbeats', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    // Set heartbeat to 2 minutes ago
    const staleTime = new Date(Date.now() - 120 * 1000).toISOString();
    db.updateWorker(1, {
      status: 'busy',
      last_heartbeat: staleTime,
      launched_at: new Date(Date.now() - 300 * 1000).toISOString(),
    });

    const worker = db.getWorker(1);
    const staleSec = (Date.now() - new Date(worker.last_heartbeat).getTime()) / 1000;
    assert.ok(staleSec >= THRESHOLDS.triage);
  });

  it('should respect launch grace period', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    // Just launched 10 seconds ago
    const recentTime = new Date(Date.now() - 10 * 1000).toISOString();
    db.updateWorker(1, {
      status: 'assigned',
      launched_at: recentTime,
    });

    const worker = db.getWorker(1);
    const launchedAgo = (Date.now() - new Date(worker.launched_at).getTime()) / 1000;
    assert.ok(launchedAgo < THRESHOLDS.warn); // Should be skipped by watchdog
  });
});

describe('Stale claim cleanup', () => {
  it('should not release a fresh claim on a worker with an old heartbeat', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.updateWorker(1, {
      last_heartbeat: new Date(Date.now() - 3600 * 1000).toISOString(),
    });
    assert.strictEqual(db.claimWorker(1, 'architect'), true);

    tick(tmpDir);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, 'architect');
    assert.ok(worker.claimed_at);
  });

  it('should release a claim only when claim age exceeds timeout', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    assert.strictEqual(db.claimWorker(1, 'architect'), true);
    db.updateWorker(1, {
      claimed_at: new Date(Date.now() - 121 * 1000).toISOString(),
      last_heartbeat: new Date().toISOString(),
    });

    tick(tmpDir);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, null);
    assert.strictEqual(worker.claimed_at, null);
  });

  it('should safely skip legacy claimed rows without claimed_at', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.updateWorker(1, {
      claimed_by: 'architect',
      claimed_at: null,
      last_heartbeat: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    tick(tmpDir);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, 'architect');
    assert.strictEqual(worker.claimed_at, null);
  });
});

describe('Stale integration recovery', () => {
  it('keeps failed merge requests recoverable while remediation is active or just queued', () => {
    const requestId = db.createRequest('Failed merge remediation');
    db.updateRequest(requestId, { status: 'integrating' });

    const originalTaskId = db.createTask({
      request_id: requestId,
      subject: 'Initial merge task',
      description: 'Original implementation task',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js'],
      tier: 2,
    });
    db.updateTask(originalTaskId, { status: 'completed' });

    const enqueueResult = db.enqueueMerge({
      request_id: requestId,
      task_id: originalTaskId,
      pr_url: 'https://example.com/pr/1',
      branch: 'agent-4/failed-merge',
      priority: 0,
    });
    db.updateMerge(enqueueResult.lastInsertRowid, { status: 'failed', error: 'remote rejected' });

    // Fresh merge failure: allocator grace window should keep request recoverable.
    tick(tmpDir);
    let request = db.getRequest(requestId);
    assert.ok(['integrating', 'in_progress'].includes(request.status));

    // Simulate stale failure, then allocator queues a remediation task shortly after.
    db.getDb().prepare("UPDATE merge_queue SET updated_at = datetime('now', '-11 minutes') WHERE id = ?").run(enqueueResult.lastInsertRowid);
    const remediationTaskId = db.createTask({
      request_id: requestId,
      subject: 'Fix failed merge',
      description: 'Allocator remediation task',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js'],
      tier: 2,
    });
    db.updateTask(remediationTaskId, { status: 'in_progress' });

    tick(tmpDir);
    request = db.getRequest(requestId);
    assert.ok(['integrating', 'in_progress'].includes(request.status));
    assert.notStrictEqual(request.status, 'failed');

    // Once remediation is terminal and merge still failed, watchdog can fail the request.
    db.updateTask(remediationTaskId, { status: 'completed' });
    tick(tmpDir);

    request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'failed');

    const failureMail = db.checkMail('master-1', false).filter(
      (mail) => mail.type === 'request_failed' && mail.payload.request_id === requestId
    );
    assert.ok(failureMail.length >= 1);
  });

  it('sends per-merge allocator notifications with rich context for terminal failed merges', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const requestId = db.createRequest('Terminal merge failure notifications');
    db.updateRequest(requestId, { status: 'integrating' });

    const failedTaskAlphaId = db.createTask({
      request_id: requestId,
      subject: 'Fix alpha merge',
      description: 'Alpha merge remediation',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js', 'coordinator/tests/watchdog.test.js'],
      tier: 2,
    });
    db.updateTask(failedTaskAlphaId, { status: 'completed', assigned_to: 1 });

    const mergedTaskId = db.createTask({
      request_id: requestId,
      subject: 'Already merged task',
      description: 'Successful path',
      domain: 'coordinator-routing',
      files: ['coordinator/src/merger.js'],
      tier: 2,
    });
    db.updateTask(mergedTaskId, { status: 'completed', assigned_to: 1 });

    const failedTaskBetaId = db.createTask({
      request_id: requestId,
      subject: 'Fix beta merge',
      description: 'Beta merge remediation',
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js'],
      tier: 3,
    });
    db.updateTask(failedTaskBetaId, { status: 'completed', assigned_to: 1 });

    const failedMergeAlpha = db.enqueueMerge({
      request_id: requestId,
      task_id: failedTaskAlphaId,
      pr_url: 'https://example.com/pr/alpha',
      branch: 'agent-1/alpha-failed',
      priority: 0,
    });
    const mergedMerge = db.enqueueMerge({
      request_id: requestId,
      task_id: mergedTaskId,
      pr_url: 'https://example.com/pr/success',
      branch: 'agent-2/merged',
      priority: 0,
    });
    const failedMergeBeta = db.enqueueMerge({
      request_id: requestId,
      task_id: failedTaskBetaId,
      pr_url: 'https://example.com/pr/beta',
      branch: 'agent-3/beta-failed',
      priority: 0,
    });

    db.updateMerge(failedMergeAlpha.lastInsertRowid, { status: 'failed', error: 'alpha checks failed' });
    db.updateMerge(mergedMerge.lastInsertRowid, { status: 'merged', merged_at: new Date().toISOString() });
    db.updateMerge(failedMergeBeta.lastInsertRowid, { status: 'failed', error: 'beta branch protection blocked' });

    // Expire remediation grace so watchdog executes Case 4 terminal-failure handling.
    db.getDb().prepare(
      "UPDATE merge_queue SET updated_at = datetime('now', '-11 minutes') WHERE id IN (?, ?)"
    ).run(failedMergeAlpha.lastInsertRowid, failedMergeBeta.lastInsertRowid);

    tick(tmpDir);

    const request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'failed');

    const allocatorFailureMails = db.checkMail('allocator', false).filter(
      (mail) => mail.type === 'merge_failed' && mail.payload.request_id === requestId
    );
    assert.strictEqual(allocatorFailureMails.length, 2);

    const payloadByMergeId = new Map(
      allocatorFailureMails.map((mail) => [mail.payload.merge_id, mail.payload])
    );

    const alphaPayload = payloadByMergeId.get(failedMergeAlpha.lastInsertRowid);
    assert.ok(alphaPayload);
    assert.strictEqual(alphaPayload.task_id, failedTaskAlphaId);
    assert.strictEqual(alphaPayload.branch, 'agent-1/alpha-failed');
    assert.strictEqual(alphaPayload.pr_url, 'https://example.com/pr/alpha');
    assert.strictEqual(alphaPayload.error, 'alpha checks failed');
    assert.deepStrictEqual(alphaPayload.original_task, {
      subject: 'Fix alpha merge',
      domain: 'coordinator-routing',
      files: '["coordinator/src/watchdog.js","coordinator/tests/watchdog.test.js"]',
      tier: 2,
      assigned_to: 1,
    });

    const betaPayload = payloadByMergeId.get(failedMergeBeta.lastInsertRowid);
    assert.ok(betaPayload);
    assert.strictEqual(betaPayload.task_id, failedTaskBetaId);
    assert.strictEqual(betaPayload.branch, 'agent-3/beta-failed');
    assert.strictEqual(betaPayload.pr_url, 'https://example.com/pr/beta');
    assert.strictEqual(betaPayload.error, 'beta branch protection blocked');
    assert.deepStrictEqual(betaPayload.original_task, {
      subject: 'Fix beta merge',
      domain: 'coordinator-routing',
      files: '["coordinator/src/cli-server.js"]',
      tier: 3,
      assigned_to: 1,
    });
  });
});
