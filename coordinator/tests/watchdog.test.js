'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const { THRESHOLDS, recoverStaleIntegrations } = require('../src/watchdog');

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

describe('Stale integration placeholder repair', () => {
  it('should complete request when metadata indicates no-PR completion', () => {
    const reqId = db.createRequest('No PR request');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.updateTask(taskId, { status: 'completed', completed_at: new Date().toISOString() });
    db.updateRequest(reqId, {
      status: 'integrating',
      result: 'Completed (no PRs to merge)',
    });
    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'N/A',
      branch: 'agent-1',
    });

    const repaired = recoverStaleIntegrations(Date.now(), { source: 'test' });
    assert.strictEqual(repaired, 1);

    const request = db.getRequest(reqId);
    assert.strictEqual(request.status, 'completed');
    assert.ok(request.completed_at);
    assert.match(request.result, /no PRs to merge/i);

    const merge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE request_id = ?').get(reqId);
    assert.strictEqual(merge.status, 'failed');
    assert.match(merge.error, /Legacy malformed merge row terminalized/);
    assert.match(merge.error, /placeholder PR token/i);

    const secondRun = recoverStaleIntegrations(Date.now(), { source: 'test' });
    assert.strictEqual(secondRun, 0);
  });

  it('should fail-closed when placeholder PR tokens exist without no-PR metadata', () => {
    const reqId = db.createRequest('Malformed merge request');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.updateTask(taskId, { status: 'completed', completed_at: new Date().toISOString() });
    db.updateRequest(reqId, { status: 'integrating' });
    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'pending',
      branch: 'agent-1',
    });

    const repaired = recoverStaleIntegrations(Date.now(), { source: 'test' });
    assert.strictEqual(repaired, 1);

    const request = db.getRequest(reqId);
    assert.strictEqual(request.status, 'failed');
    assert.ok(request.completed_at);
    assert.match(request.result, /Terminalized malformed merge rows/);
    assert.match(request.result, /pending/);

    const merge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE request_id = ?').get(reqId);
    assert.strictEqual(merge.status, 'failed');
    assert.match(merge.error, /placeholder PR token/i);
  });
});
