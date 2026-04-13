'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const merger = require('../src/merger');
const watchdog = require('../src/watchdog');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Request state machine', () => {
  it('should create a request in pending state', () => {
    const id = db.createRequest('Add a button');
    const req = db.getRequest(id);
    assert.strictEqual(req.status, 'pending');
    assert.strictEqual(req.description, 'Add a button');
  });

  it('should transition through triage states', () => {
    const id = db.createRequest('Fix typo');
    db.updateRequest(id, { tier: 1, status: 'executing_tier1' });
    assert.strictEqual(db.getRequest(id).status, 'executing_tier1');

    db.updateRequest(id, { status: 'completed', result: 'Fixed the typo' });
    assert.strictEqual(db.getRequest(id).status, 'completed');
  });

  it('should clear stale completion metadata when moving from completed to integrating', () => {
    const id = db.createRequest('Retry integration');
    const completedAt = new Date().toISOString();

    db.updateRequest(id, { status: 'completed', completed_at: completedAt, result: 'Done before retry' });
    const completed = db.getRequest(id);
    assert.strictEqual(completed.status, 'completed');
    assert.strictEqual(completed.completed_at, completedAt);
    assert.strictEqual(completed.result, 'Done before retry');

    db.updateRequest(id, { status: 'integrating' });
    const reopened = db.getRequest(id);
    assert.strictEqual(reopened.status, 'integrating');
    assert.strictEqual(reopened.completed_at, null);
    assert.strictEqual(reopened.result, null);
  });

  it('should list requests by status', () => {
    db.createRequest('Req 1');
    const id2 = db.createRequest('Req 2');
    db.updateRequest(id2, { status: 'completed' });

    const pending = db.listRequests('pending');
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].description, 'Req 1');

    const completed = db.listRequests('completed');
    assert.strictEqual(completed.length, 1);
  });
});

describe('Merger request completion gating', () => {
  it('should not complete on merge success while sibling task is unfinished', () => {
    const reqId = db.createRequest('Feature with merge + sibling task');
    const mergedTaskId = db.createTask({
      request_id: reqId,
      subject: 'Merged task',
      description: 'Has PR merged by merger',
    });
    const unfinishedTaskId = db.createTask({
      request_id: reqId,
      subject: 'Unfinished sibling',
      description: 'Still assigned when merge completes',
    });

    db.updateTask(mergedTaskId, { status: 'completed' });
    db.updateTask(unfinishedTaskId, { status: 'assigned' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/org/repo/pull/250',
      branch: 'agent-1',
    });

    merger.processQueue(tmpDir, () => ({ success: true }));

    const requestAfterMerge = db.getRequest(reqId);
    assert.notStrictEqual(requestAfterMerge.status, 'completed');

    const mailsAfterMerge = db
      .checkMail('master-1', false)
      .filter((msg) => msg.type === 'request_completed' && msg.payload.request_id === reqId);
    assert.strictEqual(mailsAfterMerge.length, 0);

    db.updateTask(unfinishedTaskId, { status: 'completed' });
    merger.onTaskCompleted(unfinishedTaskId);

    const requestAfterAllDone = db.getRequest(reqId);
    assert.strictEqual(requestAfterAllDone.status, 'completed');

    const completionMails = db
      .checkMail('master-1')
      .filter((msg) => msg.type === 'request_completed' && msg.payload.request_id === reqId);
    assert.strictEqual(completionMails.length, 1);
  });
});

describe('Task state machine', () => {
  it('should create tasks linked to requests', () => {
    const reqId = db.createRequest('Big feature');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Add API endpoint',
      description: 'Create POST /api/items',
      domain: 'backend',
      files: ['src/api/items.js'],
      tier: 2,
    });

    const task = db.getTask(taskId);
    assert.strictEqual(task.request_id, reqId);
    assert.strictEqual(task.subject, 'Add API endpoint');
    assert.strictEqual(task.status, 'pending');
    assert.strictEqual(task.domain, 'backend');
  });

  it('should promote pending tasks with no dependencies to ready', () => {
    const reqId = db.createRequest('Feature');
    db.createTask({ request_id: reqId, subject: 'Task 1', description: 'Do thing 1' });
    db.checkAndPromoteTasks();

    const tasks = db.listTasks({ request_id: reqId });
    assert.strictEqual(tasks[0].status, 'ready');
  });

  it('should respect dependency chains', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'First' });
    const t2 = db.createTask({
      request_id: reqId,
      subject: 'Task 2',
      description: 'Second',
      depends_on: [t1],
    });

    db.checkAndPromoteTasks();

    const task1 = db.getTask(t1);
    const task2 = db.getTask(t2);
    assert.strictEqual(task1.status, 'ready');
    assert.strictEqual(task2.status, 'pending'); // blocked by t1

    // Complete t1
    db.updateTask(t1, { status: 'completed' });
    db.checkAndPromoteTasks();

    const task2After = db.getTask(t2);
    assert.strictEqual(task2After.status, 'ready');
  });

  it('should prioritize urgent tasks', () => {
    const reqId = db.createRequest('Feature');
    db.createTask({ request_id: reqId, subject: 'Normal', description: 'Normal task', priority: 'normal' });
    const urgentId = db.createTask({ request_id: reqId, subject: 'Urgent', description: 'Fix now', priority: 'urgent' });

    db.checkAndPromoteTasks();
    const ready = db.getReadyTasks();
    assert.strictEqual(ready[0].id, urgentId);
    assert.strictEqual(ready[0].priority, 'urgent');
  });

  it('should prioritize active priority-override target requests over backlog task priority', () => {
    const targetRequestId = db.createRequest('Target request');
    const backlogRequestId = db.createRequest('Backlog request');
    db.createRequest(`PRIORITY OVERRIDE: Execute request ${targetRequestId} immediately as top priority.`);

    const backlogUrgentTaskId = db.createTask({
      request_id: backlogRequestId,
      subject: 'Backlog urgent',
      description: 'Urgent but lower than active override target',
      priority: 'urgent',
    });
    const targetNormalTaskId = db.createTask({
      request_id: targetRequestId,
      subject: 'Target normal',
      description: 'Should be selected first while override is active',
      priority: 'normal',
    });

    db.updateTask(backlogUrgentTaskId, { status: 'ready' });
    db.updateTask(targetNormalTaskId, { status: 'ready' });

    const ready = db.getReadyTasks();
    assert.strictEqual(ready[0].id, targetNormalTaskId);
    assert.strictEqual(ready[0].request_id, targetRequestId);
  });

  it('should stop priority-override targeting when the target request reaches terminal state', () => {
    const targetRequestId = db.createRequest('Target request');
    const backlogRequestId = db.createRequest('Backlog request');
    db.createRequest(`PRIORITY OVERRIDE: Execute request ${targetRequestId} immediately as top priority.`);

    const backlogUrgentTaskId = db.createTask({
      request_id: backlogRequestId,
      subject: 'Backlog urgent',
      description: 'Should retake precedence when target request is completed',
      priority: 'urgent',
    });
    const targetNormalTaskId = db.createTask({
      request_id: targetRequestId,
      subject: 'Target normal',
      description: 'No longer prioritized after target completion',
      priority: 'normal',
    });

    db.updateTask(backlogUrgentTaskId, { status: 'ready' });
    db.updateTask(targetNormalTaskId, { status: 'ready' });
    db.updateRequest(targetRequestId, { status: 'completed' });

    const ready = db.getReadyTasks();
    assert.strictEqual(ready[0].id, backlogUrgentTaskId);
    assert.strictEqual(ready[0].request_id, backlogRequestId);
  });

  it('should not promote pending tasks whose request is completed', () => {
    const reqId = db.createRequest('Completed request');
    const taskId = db.createTask({ request_id: reqId, subject: 'Stale task', description: 'Should stay pending' });
    db.updateRequest(reqId, { status: 'completed' });

    db.checkAndPromoteTasks();

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'pending', 'task on completed request must not be promoted');
  });

  it('should not promote pending tasks whose request is failed', () => {
    const reqId = db.createRequest('Failed request');
    const taskId = db.createTask({ request_id: reqId, subject: 'Stale task', description: 'Should stay pending' });
    db.updateRequest(reqId, { status: 'failed' });

    db.checkAndPromoteTasks();

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'pending', 'task on failed request must not be promoted');
  });

  it('should not promote dependency-resolved tasks whose request is failed', () => {
    const reqId = db.createRequest('Failed request with deps');
    const t1 = db.createTask({ request_id: reqId, subject: 'Dep', description: 'Already done' });
    const t2 = db.createTask({
      request_id: reqId,
      subject: 'Downstream',
      description: 'Depends on t1',
      depends_on: [t1],
    });
    db.updateTask(t1, { status: 'completed' });
    db.updateRequest(reqId, { status: 'failed' });

    db.checkAndPromoteTasks();

    assert.strictEqual(db.getTask(t2).status, 'pending', 'dep-resolved task on failed request must not be promoted');
  });

  it('should still promote pending tasks on active requests normally', () => {
    const reqId = db.createRequest('Active request');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Should be promoted' });

    db.checkAndPromoteTasks();

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'ready', 'task on active request should be promoted to ready');
  });

  it('should fail tasks with nonexistent dependency IDs (regression: must not become ready)', () => {
    const reqId = db.createRequest('Feature');
    const blockedId = db.createTask({
      request_id: reqId,
      subject: 'Blocked',
      description: 'Wait for missing dependency',
      depends_on: [999999],
    });

    db.checkAndPromoteTasks();

    const blockedTask = db.getTask(blockedId);
    assert.strictEqual(blockedTask.status, 'failed');
    assert.ok(blockedTask.result.includes('missing_dependency_ids'), `Expected missing_dependency_ids in result, got: ${blockedTask.result}`);
    assert.ok(blockedTask.result.includes('999999'), `Expected 999999 in result, got: ${blockedTask.result}`);
  });

  it('should fail tasks with mixed existing and missing dependencies', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'First' });
    const t2 = db.createTask({
      request_id: reqId,
      subject: 'Task 2',
      description: 'Second',
      depends_on: [t1, 999999],
    });

    db.checkAndPromoteTasks();
    assert.strictEqual(db.getTask(t1).status, 'ready');
    assert.strictEqual(db.getTask(t2).status, 'failed');
    const t2Task = db.getTask(t2);
    assert.ok(t2Task.result.includes('missing_dependency_ids'), `Expected missing_dependency_ids in result, got: ${t2Task.result}`);
    assert.ok(t2Task.result.includes('999999'), `Expected 999999 in result, got: ${t2Task.result}`);
  });

  it('should replan blocked dependencies and promote newly unblocked tasks', () => {
    const reqA = db.createRequest('Dependency source request');
    const sourceTask = db.createTask({ request_id: reqA, subject: 'Source', description: 'Original dependency' });
    const replacementTask = db.createTask({ request_id: reqA, subject: 'Replacement', description: 'Bootstrap replacement' });
    const downstreamA = db.createTask({
      request_id: reqA,
      subject: 'Downstream A',
      description: 'Blocked directly by source',
      depends_on: [sourceTask],
    });
    const downstreamB = db.createTask({
      request_id: reqA,
      subject: 'Downstream B',
      description: 'Blocked by source and downstream A',
      depends_on: [sourceTask, downstreamA],
    });
    const reqB = db.createRequest('Cross-request dependency');
    const crossRequestTask = db.createTask({
      request_id: reqB,
      subject: 'Cross-request blocked task',
      description: 'Blocked directly by source from another request',
      depends_on: [sourceTask],
    });

    db.updateTask(sourceTask, { status: 'failed' });
    db.updateTask(replacementTask, { status: 'completed' });

    const replanned = db.replanTaskDependency({ fromTaskId: sourceTask, toTaskId: replacementTask });
    assert.deepStrictEqual(
      [...replanned.updated_task_ids].sort((a, b) => a - b),
      [crossRequestTask, downstreamA, downstreamB].sort((a, b) => a - b)
    );
    assert.deepStrictEqual(
      [...replanned.promoted_task_ids].sort((a, b) => a - b),
      [crossRequestTask, downstreamA].sort((a, b) => a - b)
    );

    assert.strictEqual(db.getTask(downstreamA).depends_on, `[${replacementTask}]`);
    assert.strictEqual(db.getTask(crossRequestTask).depends_on, `[${replacementTask}]`);
    assert.strictEqual(db.getTask(downstreamB).depends_on, `[${replacementTask},${downstreamA}]`);
    assert.strictEqual(db.getTask(downstreamA).status, 'ready');
    assert.strictEqual(db.getTask(crossRequestTask).status, 'ready');
    assert.strictEqual(db.getTask(downstreamB).status, 'pending');
  });

  it('should support request-scoped dependency replanning', () => {
    const reqA = db.createRequest('Scoped dependency replan');
    const sourceTask = db.createTask({ request_id: reqA, subject: 'Source', description: 'Failed source task' });
    const replacementTask = db.createTask({ request_id: reqA, subject: 'Replacement', description: 'Completed replacement' });
    const scopedTask = db.createTask({
      request_id: reqA,
      subject: 'Scoped blocked task',
      description: 'Should be updated',
      depends_on: [sourceTask],
    });

    const reqB = db.createRequest('Unscoped dependency');
    const unscopedTask = db.createTask({
      request_id: reqB,
      subject: 'Unscoped blocked task',
      description: 'Should remain blocked',
      depends_on: [sourceTask],
    });

    db.updateTask(sourceTask, { status: 'failed' });
    db.updateTask(replacementTask, { status: 'completed' });

    const replanned = db.replanTaskDependency({
      fromTaskId: sourceTask,
      toTaskId: replacementTask,
      requestId: reqA,
    });

    assert.deepStrictEqual(replanned.updated_task_ids, [scopedTask]);
    assert.deepStrictEqual(replanned.promoted_task_ids, [scopedTask]);
    assert.strictEqual(db.getTask(scopedTask).depends_on, `[${replacementTask}]`);
    assert.strictEqual(db.getTask(unscopedTask).depends_on, `[${sourceTask}]`);
    assert.strictEqual(db.getTask(scopedTask).status, 'ready');
    // unscopedTask was not replanned; its dependency (sourceTask) is still failed → cascade-terminated
    assert.strictEqual(db.getTask(unscopedTask).status, 'failed');
  });

  it('should terminalize pending task when a prerequisite has failed', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'First' });
    const t2 = db.createTask({
      request_id: reqId,
      subject: 'Task 2',
      description: 'Second',
      depends_on: [t1],
    });

    db.updateTask(t1, { status: 'failed', result: 'Something went wrong' });
    db.checkAndPromoteTasks();

    const task2 = db.getTask(t2);
    assert.strictEqual(task2.status, 'failed');
    assert.ok(task2.result.includes(`#${t1}`), `result should mention failed dep #${t1}, got: ${task2.result}`);
  });

  it('should promote pending task to ready when all prerequisites are completed', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'First' });
    const t2 = db.createTask({
      request_id: reqId,
      subject: 'Task 2',
      description: 'Second',
      depends_on: [t1],
    });

    db.updateTask(t1, { status: 'completed' });
    db.checkAndPromoteTasks();

    assert.strictEqual(db.getTask(t2).status, 'ready');
  });

  it('should keep task pending when some prerequisites are still pending', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'First' });
    const t2 = db.createTask({ request_id: reqId, subject: 'Task 2', description: 'Still pending' });
    const t3 = db.createTask({
      request_id: reqId,
      subject: 'Task 3',
      description: 'Depends on both',
      depends_on: [t1, t2],
    });

    db.updateTask(t1, { status: 'completed' });
    db.checkAndPromoteTasks();

    assert.strictEqual(db.getTask(t3).status, 'pending');
  });

  it('should cascade-fail dependents when all tasks in a request are failed', () => {
    const reqId = db.createRequest('All failed request');
    const t1 = db.createTask({ request_id: reqId, subject: 'Task 1', description: 'Will fail' });
    const t2 = db.createTask({
      request_id: reqId,
      subject: 'Task 2',
      description: 'Depends on failing t1',
      depends_on: [t1],
    });

    db.updateRequest(reqId, { status: 'integrating' });
    db.updateTask(t1, { status: 'failed', result: 'Original failure' });
    db.checkAndPromoteTasks();

    assert.strictEqual(db.getTask(t2).status, 'failed');
    const completion = db.checkRequestCompletion(reqId, { repair_stale_decomposed: false });
    assert.strictEqual(completion.all_done, true);
  });

  it('should persist browser-offload task fields and lifecycle transitions', () => {
    const reqId = db.createRequest('Browser research offload');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Offload deep research',
      description: 'Run browser-backed deep research and callback results',
    });

    const created = db.getTask(taskId);
    assert.strictEqual(created.browser_offload_status, 'not_requested');
    assert.strictEqual(created.browser_session_id, null);
    assert.strictEqual(created.browser_channel, null);

    const requested = db.transitionTaskBrowserOffload(taskId, 'requested', {
      browser_offload_payload: JSON.stringify({ query: 'weekly market summary' }),
    });
    assert.strictEqual(requested.browser_offload_status, 'requested');
    assert.strictEqual(requested.browser_offload_payload, '{"query":"weekly market summary"}');
    assert.ok(requested.browser_offload_updated_at);

    const queued = db.transitionTaskBrowserOffload(taskId, 'queued', {
      browser_channel: 'research:task-1',
    });
    assert.strictEqual(queued.browser_offload_status, 'queued');
    assert.strictEqual(queued.browser_channel, 'research:task-1');

    const running = db.transitionTaskBrowserOffload(taskId, 'launching');
    assert.strictEqual(running.browser_offload_status, 'launching');

    const attached = db.transitionTaskBrowserOffload(taskId, 'attached', {
      browser_session_id: 'session-abc',
    });
    assert.strictEqual(attached.browser_offload_status, 'attached');
    assert.strictEqual(attached.browser_session_id, 'session-abc');

    db.transitionTaskBrowserOffload(taskId, 'running');
    db.transitionTaskBrowserOffload(taskId, 'awaiting_callback');
    const completed = db.transitionTaskBrowserOffload(taskId, 'completed', {
      browser_offload_result: JSON.stringify({ sources: 12 }),
      browser_offload_error: null,
    });

    assert.strictEqual(completed.browser_offload_status, 'completed');
    assert.strictEqual(completed.browser_offload_result, '{"sources":12}');
    assert.strictEqual(completed.browser_offload_error, null);
  });

  it('should reject invalid browser-offload lifecycle transitions', () => {
    const reqId = db.createRequest('Browser research offload');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Offload deep research',
      description: 'Run browser-backed deep research and callback results',
    });

    assert.throws(() => {
      db.transitionTaskBrowserOffload(taskId, 'running');
    }, /Invalid browser offload transition/);

    db.transitionTaskBrowserOffload(taskId, 'requested');
    db.transitionTaskBrowserOffload(taskId, 'failed', {
      browser_offload_error: 'session launch failed',
    });

    assert.throws(() => {
      db.transitionTaskBrowserOffload(taskId, 'completed');
    }, /Invalid browser offload transition/);
  });
});

describe('Browser session state machine', () => {
  it('should create a session with default safety policy and initializing status', () => {
    const session = db.createBrowserSession({ id: 'sess-001', owner: 'worker-4' });
    assert.strictEqual(session.status, 'initializing');
    assert.strictEqual(session.safety_policy, 'standard');
    assert.strictEqual(session.owner, 'worker-4');
    assert.strictEqual(session.auth_token, null);
    assert.strictEqual(session.terminated_at, null);
  });

  it('should transition browser session through full lifecycle', () => {
    db.createBrowserSession({ id: 'sess-002', owner: 'worker-4' });
    const active = db.transitionBrowserSession('sess-002', 'active');
    assert.strictEqual(active.status, 'active');

    const idle = db.transitionBrowserSession('sess-002', 'idle');
    assert.strictEqual(idle.status, 'idle');

    const expiring = db.transitionBrowserSession('sess-002', 'expiring');
    assert.strictEqual(expiring.status, 'expiring');

    const expired = db.transitionBrowserSession('sess-002', 'expired');
    assert.strictEqual(expired.status, 'expired');
  });

  it('should set terminated_at automatically when transitioning to terminated', () => {
    db.createBrowserSession({ id: 'sess-003', owner: 'worker-4' });
    db.transitionBrowserSession('sess-003', 'active');
    const terminated = db.transitionBrowserSession('sess-003', 'terminated');
    assert.strictEqual(terminated.status, 'terminated');
    assert.ok(terminated.terminated_at, 'terminated_at should be set automatically');
  });

  it('should persist auth/expiry metadata and safety policy state', () => {
    db.createBrowserSession({
      id: 'sess-004',
      owner: 'worker-4',
      auth_token: 'tok-abc',
      session_token: 'stok-xyz',
      auth_expires_at: '2026-04-01 00:00:00',
      session_expires_at: '2026-04-01 01:00:00',
      safety_policy: 'restricted',
      safety_policy_state: { evaluated: true, violations: [] },
    });
    const session = db.getBrowserSession('sess-004');
    assert.strictEqual(session.auth_token, 'tok-abc');
    assert.strictEqual(session.session_token, 'stok-xyz');
    assert.strictEqual(session.auth_expires_at, '2026-04-01 00:00:00');
    assert.strictEqual(session.safety_policy, 'restricted');
    assert.ok(session.safety_policy_state.includes('"evaluated":true'));
  });

  it('should reject invalid browser session transitions', () => {
    db.createBrowserSession({ id: 'sess-005', owner: 'worker-4' });
    assert.throws(() => {
      db.transitionBrowserSession('sess-005', 'expired');
    }, /Invalid browser session transition/);

    db.transitionBrowserSession('sess-005', 'active');
    assert.throws(() => {
      db.transitionBrowserSession('sess-005', 'initializing');
    }, /Invalid browser session transition/);
  });

  it('should reject invalid safety_policy on create', () => {
    assert.throws(() => {
      db.createBrowserSession({ id: 'sess-bad', owner: 'worker-4', safety_policy: 'unsafe' });
    }, /Invalid safety_policy/);
  });
});

describe('Browser research job state machine', () => {
  let reqId;

  beforeEach(() => {
    reqId = db.createRequest('Browser research job test');
    db.createBrowserSession({ id: 'sess-job', owner: 'worker-4' });
  });

  it('should create a research job with default pending status', () => {
    const job = db.createBrowserResearchJob({
      session_id: 'sess-job',
      request_id: reqId,
      query: 'weekly market summary',
    });
    assert.strictEqual(job.status, 'pending');
    assert.strictEqual(job.job_type, 'research');
    assert.strictEqual(job.query, 'weekly market summary');
    assert.strictEqual(job.attempt_count, 0);
    assert.strictEqual(job.result_payload, null);
    assert.strictEqual(job.started_at, null);
    assert.strictEqual(job.completed_at, null);
  });

  it('should transition research job through full lifecycle', () => {
    const job = db.createBrowserResearchJob({ session_id: 'sess-job', query: 'test query' });
    const jobId = job.id;

    const queued = db.transitionBrowserResearchJob(jobId, 'queued');
    assert.strictEqual(queued.status, 'queued');

    const running = db.transitionBrowserResearchJob(jobId, 'running');
    assert.strictEqual(running.status, 'running');
    assert.ok(running.started_at, 'started_at should be auto-set when running');

    const awaiting = db.transitionBrowserResearchJob(jobId, 'awaiting_callback');
    assert.strictEqual(awaiting.status, 'awaiting_callback');

    const completed = db.transitionBrowserResearchJob(jobId, 'completed', {
      result_payload: JSON.stringify({ sources: 5, summary: 'done' }),
    });
    assert.strictEqual(completed.status, 'completed');
    assert.ok(completed.completed_at, 'completed_at should be auto-set');
    assert.ok(completed.result_payload.includes('"sources":5'));
  });

  it('should set completed_at when failing or cancelling', () => {
    const job = db.createBrowserResearchJob({ session_id: 'sess-job', query: 'cancel test' });
    db.transitionBrowserResearchJob(job.id, 'queued');
    const cancelled = db.transitionBrowserResearchJob(job.id, 'cancelled');
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.ok(cancelled.completed_at, 'completed_at should be set on cancel');

    const job2 = db.createBrowserResearchJob({ session_id: 'sess-job', query: 'fail test' });
    db.transitionBrowserResearchJob(job2.id, 'queued');
    const failed = db.transitionBrowserResearchJob(job2.id, 'failed', { error: 'network error' });
    assert.strictEqual(failed.status, 'failed');
    assert.ok(failed.completed_at, 'completed_at should be set on fail');
    assert.strictEqual(failed.error, 'network error');
  });

  it('should reject invalid job transitions', () => {
    const job = db.createBrowserResearchJob({ session_id: 'sess-job', query: 'invalid test' });
    assert.throws(() => {
      db.transitionBrowserResearchJob(job.id, 'completed');
    }, /Invalid browser research job transition/);

    db.transitionBrowserResearchJob(job.id, 'queued');
    db.transitionBrowserResearchJob(job.id, 'failed');
    assert.throws(() => {
      db.transitionBrowserResearchJob(job.id, 'running');
    }, /Invalid browser research job transition/);
  });

  it('should reject invalid job_type on create', () => {
    assert.throws(() => {
      db.createBrowserResearchJob({ session_id: 'sess-job', query: 'test', job_type: 'scrape' });
    }, /Invalid job_type/);
  });
});

describe('Browser callback events cursor retrieval', () => {
  it('should append events and retrieve them with cursor pagination', () => {
    db.createBrowserSession({ id: 'sess-ev', owner: 'worker-4' });
    const job = db.createBrowserResearchJob({ session_id: 'sess-ev', query: 'cursor test' });
    const jobId = job.id;

    const e1 = db.appendBrowserCallbackEvent({ job_id: jobId, session_id: 'sess-ev', event_type: 'progress', event_payload: { pct: 10 } });
    const e2 = db.appendBrowserCallbackEvent({ job_id: jobId, event_type: 'progress', event_payload: { pct: 50 } });
    const e3 = db.appendBrowserCallbackEvent({ job_id: jobId, event_type: 'result', event_payload: { sources: 7 } });

    // Full retrieval from start
    const all = db.getBrowserCallbackEvents(jobId);
    assert.strictEqual(all.length, 3);
    assert.strictEqual(all[0].event_type, 'progress');
    assert.strictEqual(all[2].event_type, 'result');

    // Cursor-based: after first event
    const afterFirst = db.getBrowserCallbackEvents(jobId, { after_id: e1.id });
    assert.strictEqual(afterFirst.length, 2);
    assert.strictEqual(afterFirst[0].id, e2.id);

    // Cursor-based: after second event
    const afterSecond = db.getBrowserCallbackEvents(jobId, { after_id: e2.id });
    assert.strictEqual(afterSecond.length, 1);
    assert.strictEqual(afterSecond[0].id, e3.id);

    // Cursor at end: empty
    const afterLast = db.getBrowserCallbackEvents(jobId, { after_id: e3.id });
    assert.strictEqual(afterLast.length, 0);
  });

  it('should respect the limit parameter', () => {
    db.createBrowserSession({ id: 'sess-lim', owner: 'worker-4' });
    const job = db.createBrowserResearchJob({ session_id: 'sess-lim', query: 'limit test' });
    for (let i = 0; i < 10; i++) {
      db.appendBrowserCallbackEvent({ job_id: job.id, event_type: 'heartbeat', event_payload: { seq: i } });
    }
    const limited = db.getBrowserCallbackEvents(job.id, { limit: 3 });
    assert.strictEqual(limited.length, 3);
  });

  it('should reject invalid event_type', () => {
    db.createBrowserSession({ id: 'sess-bad-ev', owner: 'worker-4' });
    const job = db.createBrowserResearchJob({ session_id: 'sess-bad-ev', query: 'bad event' });
    assert.throws(() => {
      db.appendBrowserCallbackEvent({ job_id: job.id, event_type: 'unknown' });
    }, /Invalid event_type/);
  });

  it('should scope events to the correct job', () => {
    db.createBrowserSession({ id: 'sess-scope', owner: 'worker-4' });
    const job1 = db.createBrowserResearchJob({ session_id: 'sess-scope', query: 'job 1' });
    const job2 = db.createBrowserResearchJob({ session_id: 'sess-scope', query: 'job 2' });

    db.appendBrowserCallbackEvent({ job_id: job1.id, event_type: 'progress', event_payload: {} });
    db.appendBrowserCallbackEvent({ job_id: job2.id, event_type: 'result', event_payload: {} });

    const job1Events = db.getBrowserCallbackEvents(job1.id);
    const job2Events = db.getBrowserCallbackEvents(job2.id);
    assert.strictEqual(job1Events.length, 1);
    assert.strictEqual(job2Events.length, 1);
    assert.strictEqual(job1Events[0].event_type, 'progress');
    assert.strictEqual(job2Events[0].event_type, 'result');
  });
});

describe('Request status observability (status_cause / previous_status)', () => {
  it('should record previous_status automatically on status transition', () => {
    const id = db.createRequest('Observability test');
    db.updateRequest(id, { status: 'triaging' });
    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'triaging');
    assert.strictEqual(after.previous_status, 'pending');
  });

  it('should record status_cause when explicitly provided', () => {
    const id = db.createRequest('Status cause test');
    db.updateRequest(id, { status: 'in_progress', status_cause: 'architect_decomposed' });
    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'in_progress');
    assert.strictEqual(after.status_cause, 'architect_decomposed');
  });

  it('should update previous_status on each subsequent transition', () => {
    const id = db.createRequest('Multi-step observability test');
    db.updateRequest(id, { status: 'triaging' });
    db.updateRequest(id, { status: 'decomposed' });
    db.updateRequest(id, { status: 'in_progress' });
    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'in_progress');
    assert.strictEqual(after.previous_status, 'decomposed');
  });
});

describe('Request lifecycle reconciliation', () => {
  it('should clear stale terminal metadata from a non-terminal request', () => {
    const id = db.createRequest('Stale metadata test');
    // Simulate stale state: request in in_progress but completed_at is set
    db.getDb()
      .prepare("UPDATE requests SET status = 'in_progress', completed_at = '2026-01-01 00:00:00', result = 'stale' WHERE id = ?")
      .run(id);

    const stale = db.getRequest(id);
    assert.strictEqual(stale.status, 'in_progress');
    assert.ok(stale.completed_at, 'should have stale completed_at before reconcile');
    assert.strictEqual(stale.result, 'stale');

    const changes = db.reconcileRequestLifecycle(id);
    assert.ok(changes.some(c => c.type === 'cleared_stale_terminal_metadata'));

    const repaired = db.getRequest(id);
    assert.strictEqual(repaired.completed_at, null);
    assert.strictEqual(repaired.result, null);
    assert.strictEqual(repaired.status_cause, 'reconcile_cleared_stale_terminal_metadata');
  });

  it('should advance in_progress request with all terminal tasks and no pending merges to integrating', () => {
    const id = db.createRequest('in_progress all terminal');
    const t1 = db.createTask({ request_id: id, subject: 'T1', description: 'Done' });
    const t2 = db.createTask({ request_id: id, subject: 'T2', description: 'Failed' });
    db.updateRequest(id, { status: 'in_progress' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'failed' });

    const changes = db.reconcileRequestLifecycle(id);
    assert.ok(changes.some(c => c.type === 'advanced_in_progress_to_integrating'));

    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'integrating');
    assert.strictEqual(after.status_cause, 'reconcile_in_progress_all_tasks_terminal');
  });

  it('should advance in_progress request when tasks use extended terminal statuses', () => {
    const id = db.createRequest('in_progress with superseded and rerouted tasks');
    const t1 = db.createTask({ request_id: id, subject: 'T1', description: 'Done' });
    const t2 = db.createTask({ request_id: id, subject: 'T2', description: 'Superseded' });
    const t3 = db.createTask({ request_id: id, subject: 'T3', description: 'Rerouted' });
    const t4 = db.createTask({ request_id: id, subject: 'T4', description: 'Final fail' });
    db.updateRequest(id, { status: 'in_progress' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'superseded' });
    db.updateTask(t3, { status: 'failed_needs_reroute' });
    db.updateTask(t4, { status: 'failed_final' });

    const changes = db.reconcileRequestLifecycle(id);
    assert.ok(changes.some(c => c.type === 'advanced_in_progress_to_integrating'));

    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'integrating');
  });

  it('should not advance in_progress request with pending merges to integrating', () => {
    const id = db.createRequest('in_progress with pending merges');
    const t1 = db.createTask({ request_id: id, subject: 'T1', description: 'Done' });
    db.updateRequest(id, { status: 'in_progress' });
    db.updateTask(t1, { status: 'completed' });
    db.enqueueMerge({
      request_id: id,
      task_id: t1,
      pr_url: 'https://github.com/org/repo/pull/999',
      branch: 'agent-1',
    });

    const changes = db.reconcileRequestLifecycle(id);
    assert.strictEqual(changes.filter(c => c.type === 'advanced_in_progress_to_integrating').length, 0);

    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'in_progress');
  });

  it('should not advance in_progress request with active tasks', () => {
    const id = db.createRequest('in_progress with active tasks');
    const t1 = db.createTask({ request_id: id, subject: 'T1', description: 'Done' });
    const t2 = db.createTask({ request_id: id, subject: 'T2', description: 'Still going' });
    db.updateRequest(id, { status: 'in_progress' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'assigned' });

    const changes = db.reconcileRequestLifecycle(id);
    assert.strictEqual(changes.filter(c => c.type === 'advanced_in_progress_to_integrating').length, 0);

    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'in_progress');
  });

  it('should not touch terminal requests', () => {
    const id = db.createRequest('Terminal request');
    const completedAt = new Date().toISOString();
    db.updateRequest(id, { status: 'completed', result: 'Done', completed_at: completedAt });

    const changes = db.reconcileRequestLifecycle(id);
    assert.strictEqual(changes.length, 0);

    const after = db.getRequest(id);
    assert.strictEqual(after.status, 'completed');
    assert.ok(after.result, 'result should be preserved on terminal request');
  });

  it('should sweep all active requests with reconcileAllActiveRequests', () => {
    const id1 = db.createRequest('Stale 1');
    const id2 = db.createRequest('Stale 2');
    // Inject stale metadata into both non-terminal requests
    db.getDb()
      .prepare("UPDATE requests SET status = 'integrating', completed_at = '2026-01-01 00:00:00' WHERE id = ?")
      .run(id1);
    db.getDb()
      .prepare("UPDATE requests SET status = 'in_progress', completed_at = '2026-01-01 00:00:00' WHERE id = ?")
      .run(id2);

    const totalFixed = db.reconcileAllActiveRequests();
    assert.ok(totalFixed >= 2, `expected at least 2 repairs, got ${totalFixed}`);

    assert.strictEqual(db.getRequest(id1).completed_at, null);
    assert.strictEqual(db.getRequest(id2).completed_at, null);
  });
});

describe('Usage cost burn rate', () => {
  it('should include completed and failed task spend while requiring completed_at', () => {
    const requestId = db.createRequest('Burn-rate aggregation');
    const completedTaskId = db.createTask({
      request_id: requestId,
      subject: 'Completed task',
      description: 'Completed in-window usage',
    });
    const failedTaskId = db.createTask({
      request_id: requestId,
      subject: 'Failed task',
      description: 'Failed in-window usage',
    });
    const failedWithoutCompletedAtTaskId = db.createTask({
      request_id: requestId,
      subject: 'Failed missing completion timestamp',
      description: 'Should be excluded because completed_at is null',
    });

    const inWindowCompletedAt = new Date(Date.now() - (5 * 60 * 1000)).toISOString().slice(0, 19).replace('T', ' ');

    db.updateTask(completedTaskId, {
      status: 'completed',
      usage_cost_usd: 1.25,
      completed_at: inWindowCompletedAt,
    });
    db.updateTask(failedTaskId, {
      status: 'failed',
      usage_cost_usd: 2.5,
      completed_at: inWindowCompletedAt,
    });
    db.updateTask(failedWithoutCompletedAtTaskId, {
      status: 'failed',
      usage_cost_usd: 99,
      completed_at: null,
    });

    const globalBurnRate = db.getUsageCostBurnRate();
    assert.strictEqual(globalBurnRate.usd_15m, 3.75);
    assert.strictEqual(globalBurnRate.usd_60m, 3.75);
    assert.strictEqual(globalBurnRate.usd_24h, 3.75);
    assert.strictEqual(globalBurnRate.request_id, null);
    assert.strictEqual(globalBurnRate.request_total_usd, 0);

    const requestBurnRate = db.getUsageCostBurnRate(requestId);
    assert.strictEqual(requestBurnRate.usd_15m, 3.75);
    assert.strictEqual(requestBurnRate.usd_60m, 3.75);
    assert.strictEqual(requestBurnRate.usd_24h, 3.75);
    assert.strictEqual(requestBurnRate.request_id, requestId);
    assert.strictEqual(requestBurnRate.request_total_usd, 3.75);
  });
});

describe('Loop request state machine', () => {
  it('should prefer exact active deduplication over cooldown suppression', () => {
    db.setConfig('loop_request_quality_gate', 'false');
    db.setConfig('loop_request_min_interval_sec', '300');
    db.setConfig('loop_request_max_per_hour', '20');

    const loopId = db.createLoop('Exact duplicate ordering');
    const description = 'Fix duplicate ordering in coordinator/src/db.js because production triage can stall when repeated requests are suppressed by cooldown instead of deduplicated against active work.';

    const first = db.createLoopRequest(description, loopId);
    assert.strictEqual(first.deduplicated, false);
    assert.strictEqual(first.suppressed, false);
    assert.ok(first.id);

    const second = db.createLoopRequest(description, loopId);
    assert.strictEqual(second.id, first.id);
    assert.strictEqual(second.deduplicated, true);
    assert.strictEqual(second.suppressed, false);
    assert.strictEqual(second.reason, 'exact_active_duplicate');

    const loopRequests = db.listLoopRequests(loopId);
    assert.strictEqual(loopRequests.length, 1);
  });

  it('should prefer similar active deduplication over cooldown suppression', () => {
    db.setConfig('loop_request_quality_gate', 'false');
    db.setConfig('loop_request_min_interval_sec', '300');
    db.setConfig('loop_request_max_per_hour', '20');
    db.setConfig('loop_request_similarity_threshold', '0.6');

    const loopId = db.createLoop('Similar duplicate ordering');
    const firstDescription = 'Update coordinator/src/db.js duplicate ordering and add state-machine regression coverage because production incident routing can break when active duplicates bypass dedupe.';
    const secondDescription = 'Update coordinator/src/db.js duplicate ordering and add regression tests because production incident routing can break when active near-duplicate requests bypass dedupe.';

    const first = db.createLoopRequest(firstDescription, loopId);
    assert.strictEqual(first.deduplicated, false);
    assert.strictEqual(first.suppressed, false);
    assert.ok(first.id);

    const second = db.createLoopRequest(secondDescription, loopId);
    assert.strictEqual(second.id, first.id);
    assert.strictEqual(second.deduplicated, true);
    assert.strictEqual(second.suppressed, false);
    assert.strictEqual(second.reason, 'similar_active_duplicate');
  });

  it('should still apply cooldown and hourly rate-limit for non-duplicate requests', () => {
    db.setConfig('loop_request_quality_gate', 'false');
    db.setConfig('loop_request_similarity_threshold', '0.99');
    db.setConfig('loop_request_min_interval_sec', '300');
    db.setConfig('loop_request_max_per_hour', '2');

    const loopId = db.createLoop('Throughput suppression');
    const first = db.createLoopRequest('Unique request alpha', loopId);
    assert.strictEqual(first.deduplicated, false);
    assert.strictEqual(first.suppressed, false);

    const cooldownSuppressed = db.createLoopRequest('Unique request beta', loopId);
    assert.strictEqual(cooldownSuppressed.id, null);
    assert.strictEqual(cooldownSuppressed.deduplicated, false);
    assert.strictEqual(cooldownSuppressed.suppressed, true);
    assert.strictEqual(cooldownSuppressed.reason, 'cooldown');
    assert.strictEqual(Number.isInteger(cooldownSuppressed.retry_after_sec), true);

    db.setConfig('loop_request_min_interval_sec', '0');

    const secondAccepted = db.createLoopRequest('Unique request gamma', loopId);
    assert.strictEqual(secondAccepted.deduplicated, false);
    assert.strictEqual(secondAccepted.suppressed, false);

    const rateLimited = db.createLoopRequest('Unique request delta', loopId);
    assert.strictEqual(rateLimited.id, null);
    assert.strictEqual(rateLimited.deduplicated, false);
    assert.strictEqual(rateLimited.suppressed, true);
    assert.strictEqual(rateLimited.reason, 'rate_limit');
    assert.strictEqual(Number.isInteger(rateLimited.retry_after_sec), true);
  });
});

describe('Worker state machine', () => {
  it('should register and track workers', () => {
    db.registerWorker(1, '/path/to/wt-1', 'agent-1');
    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.branch, 'agent-1');
  });

  it('should track worker assignment lifecycle', () => {
    db.registerWorker(1, '/path/to/wt-1', 'agent-1');
    // Create a real task for FK constraint
    const reqId = db.createRequest('Lifecycle test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });

    // Assign
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });
    assert.strictEqual(db.getWorker(1).status, 'assigned');

    // Running
    db.updateWorker(1, { status: 'busy' });
    assert.strictEqual(db.getWorker(1).status, 'busy');

    // Complete
    db.updateWorker(1, { status: 'completed_task', current_task_id: null });
    assert.strictEqual(db.getWorker(1).status, 'completed_task');

    // Reset
    db.updateWorker(1, { status: 'idle' });
    assert.strictEqual(db.getWorker(1).status, 'idle');
  });

  it('should list idle workers', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.updateWorker(2, { status: 'busy' });

    const idle = db.getIdleWorkers();
    assert.strictEqual(idle.length, 1);
    assert.strictEqual(idle[0].id, 1);
  });
});

describe('Mail system', () => {
  it('should send and receive mail', () => {
    db.sendMail('architect', 'new_request', { request_id: 'req-123' });
    const msgs = db.checkMail('architect');
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].type, 'new_request');
    assert.strictEqual(msgs[0].payload.request_id, 'req-123');
  });

  it('should consume messages (read-once)', () => {
    db.sendMail('architect', 'test', { data: 1 });
    db.checkMail('architect'); // consume
    const msgs = db.checkMail('architect');
    assert.strictEqual(msgs.length, 0);
  });

  it('should support peek (non-consuming)', () => {
    db.sendMail('architect', 'test', { data: 1 });
    db.checkMail('architect', false); // peek
    const msgs = db.checkMail('architect');
    assert.strictEqual(msgs.length, 1);
  });

  it('should only return mail for specified recipient', () => {
    db.sendMail('architect', 'msg1', {});
    db.sendMail('worker-1', 'msg2', {});

    const arch = db.checkMail('architect');
    assert.strictEqual(arch.length, 1);
    assert.strictEqual(arch[0].type, 'msg1');
  });
});

describe('Activity log', () => {
  it('should log and retrieve activities', () => {
    db.log('coordinator', 'started', { version: '1.0' });
    db.log('worker-1', 'task_completed', { task_id: 1 });

    const all = db.getLog(10);
    assert.ok(all.length >= 2); // our 2 + any from createRequest/createTask internals
    // Most recent first
    assert.strictEqual(all[0].action, 'task_completed');

    const worker = db.getLog(10, 'worker-1');
    assert.strictEqual(worker.length, 1);
  });
});

describe('Config', () => {
  it('should read and write config', () => {
    db.setConfig('test_key', 'test_value');
    assert.strictEqual(db.getConfig('test_key'), 'test_value');
  });

  it('should have default config values', () => {
    assert.strictEqual(db.getConfig('max_workers'), '8');
    assert.strictEqual(db.getConfig('heartbeat_timeout_s'), '60');
  });
});

describe('Watchdog stall recovery regression', () => {
  it('should recover a stalled assigned task to ready via recoverStalledAssignments', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Stalled task',
      description: 'Worker stopped heartbeating',
    });
    db.registerWorker(1, path.join(tmpDir, 'wt-1'), 'agent-1');
    db.updateWorker(1, {
      status: 'running',
      current_task_id: taskId,
      last_heartbeat: new Date(Date.now() - 300 * 1000).toISOString(),
    });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });

    const recovered = db.recoverStalledAssignments({
      source: 'test_stall_recovery',
      include_heartbeat_stale: true,
      include_orphans: true,
      stale_threshold_sec: 180,
    });

    assert.ok(recovered.length > 0, 'should recover at least one stalled assignment');
    const task = db.getTask(taskId);
    assert.ok(
      task.status === 'ready' || task.status === 'failed',
      `stalled task should be recovered to ready or failed, got: ${task.status}`
    );
  });

  it('should not recover a task that is within the stale threshold (no false recovery)', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Active task',
      description: 'Worker recently heartbeated',
    });
    db.registerWorker(2, path.join(tmpDir, 'wt-2'), 'agent-2');
    db.updateWorker(2, {
      status: 'running',
      current_task_id: taskId,
      last_heartbeat: new Date(Date.now() - 30 * 1000).toISOString(), // only 30s stale
    });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 2 });

    const recovered = db.recoverStalledAssignments({
      source: 'test_no_false_recovery',
      include_heartbeat_stale: true,
      include_orphans: true,
      stale_threshold_sec: 180,
    });

    const taskRecovered = recovered.find((r) => r.task_id === taskId);
    assert.strictEqual(taskRecovered, undefined, 'recently active task must not be falsely recovered');
    assert.strictEqual(db.getTask(taskId).status, 'assigned', 'task should remain assigned');
  });
});

describe('Stale integration watchdog recovery regression', () => {
  it('merge stuck in merging for longer than MERGE_TIMEOUT_SEC should be promoted to conflict', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/400',
      branch: 'agent-1',
    });

    const entry = db.getNextMerge();
    assert.ok(entry, 'merge entry should exist');

    // Force updated_at to > 5 minutes ago (MERGE_TIMEOUT_SEC = 300)
    const staleTs = new Date(Date.now() - 400 * 1000).toISOString();
    db.updateMerge(entry.id, { status: 'merging' });
    db.getDb().prepare("UPDATE merge_queue SET updated_at = ? WHERE id = ?").run(staleTs, entry.id);

    watchdog.tick(tmpDir);

    const entryAfter = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(entry.id);
    assert.strictEqual(entryAfter.status, 'conflict', 'merge stuck in merging > 300s must be promoted to conflict');

    const timeoutLogs = db.getLog(20, 'coordinator').filter((e) => e.action === 'merge_timeout');
    assert.ok(timeoutLogs.length > 0, 'merge_timeout log entry must be emitted for operator visibility');
  });

  it('merge recently in merging state must NOT be promoted to conflict (false-conflict prevention)', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });
    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/401',
      branch: 'agent-1',
    });

    const entry = db.getNextMerge();
    assert.ok(entry, 'merge entry should exist');

    // Put it in 'merging' with a recent updated_at (only 30s ago — well within the 300s window)
    const recentTs = new Date(Date.now() - 30 * 1000).toISOString();
    db.updateMerge(entry.id, { status: 'merging' });
    db.getDb().prepare("UPDATE merge_queue SET updated_at = ? WHERE id = ?").run(recentTs, entry.id);

    watchdog.tick(tmpDir);

    const entryAfter = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(entry.id);
    assert.strictEqual(entryAfter.status, 'merging', 'recently started merge must NOT be falsely promoted to conflict');
  });

  it('stale integrating request with no merges and old updated_at should be auto-completed (stale status drift recovery)', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T3', description: 'D3' });
    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    // Manually backdate request updated_at to > 15 minutes ago (900s threshold for no-merge case)
    const staleTs = new Date(Date.now() - 1000 * 1000).toISOString();
    db.getDb().prepare("UPDATE requests SET updated_at = ? WHERE id = ?").run(staleTs, reqId);

    watchdog.tick(tmpDir);

    const reqAfter = db.getRequest(reqId);
    assert.strictEqual(
      reqAfter.status,
      'completed',
      'integrating request with no merge entries and stale updated_at must be auto-completed'
    );
  });
});

describe('Extended task statuses', () => {
  it('accepts superseded status', () => {
    const reqId = db.createRequest('Test superseded');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Will be superseded' });
    db.updateTask(taskId, { status: 'superseded', result: 'Replaced by newer task' });
    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'superseded');
  });

  it('accepts failed_needs_reroute status', () => {
    const reqId = db.createRequest('Test reroute');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Needs reroute' });
    db.updateTask(taskId, { status: 'failed_needs_reroute', result: 'Worker unavailable' });
    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'failed_needs_reroute');
  });

  it('accepts failed_final status', () => {
    const reqId = db.createRequest('Test final failure');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Final failure' });
    db.updateTask(taskId, { status: 'failed_final', result: 'Unrecoverable error' });
    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'failed_final');
  });

  it('isTerminalTaskStatus classifies all terminal statuses', () => {
    for (const status of ['completed', 'failed', 'superseded', 'failed_needs_reroute', 'failed_final']) {
      assert.ok(db.isTerminalTaskStatus(status), `${status} should be terminal`);
    }
    for (const status of ['pending', 'ready', 'assigned', 'in_progress', 'blocked']) {
      assert.ok(!db.isTerminalTaskStatus(status), `${status} should not be terminal`);
    }
    assert.ok(!db.isTerminalTaskStatus(null));
    assert.ok(!db.isTerminalTaskStatus(undefined));
  });

  it('supports blocking column default and update', () => {
    const reqId = db.createRequest('Test blocking');
    const taskId = db.createTask({ request_id: reqId, subject: 'Blocking task', description: 'Blocks completion' });
    const task = db.getTask(taskId);
    assert.strictEqual(task.blocking, 1, 'default is blocking');

    db.updateTask(taskId, { blocking: 0 });
    const updated = db.getTask(taskId);
    assert.strictEqual(updated.blocking, 0, 'can be set to non-blocking');
  });

  it('watchdog supersedes non-terminal sibling tasks on merged request recovery', () => {
    const reqId = db.createRequest('Supersede test');
    db.updateRequest(reqId, { status: 'integrating' });

    const completedTaskId = db.createTask({ request_id: reqId, subject: 'Done', description: 'Merged work' });
    db.updateTask(completedTaskId, { status: 'completed' });

    const activeTaskId = db.createTask({ request_id: reqId, subject: 'Active', description: 'Still running' });
    db.updateTask(activeTaskId, { status: 'in_progress' });

    const mergeResult = db.enqueueMerge({
      request_id: reqId,
      task_id: completedTaskId,
      pr_url: 'https://example.com/pr/1',
      branch: 'agent/supersede-test',
      priority: 0,
    });
    db.updateMerge(mergeResult.lastInsertRowid, { status: 'merged', merged_at: new Date().toISOString() });

    watchdog.tick(tmpDir);

    const activeAfter = db.getTask(activeTaskId);
    assert.strictEqual(activeAfter.status, 'superseded', 'non-terminal sibling should be superseded');

    const request = db.getRequest(reqId);
    assert.strictEqual(request.status, 'completed');
  });
});

describe('Task merge history', () => {
  it('should append merge history entries to a task', () => {
    const reqId = db.createRequest('Test merge history');
    const taskId = db.createTask({ request_id: reqId, subject: 'impl', description: 'do it', domain: 'test' });

    db.appendTaskMergeHistory(taskId, { event: 'merge_conflict', merge_id: 1, branch: 'feat-a', error: 'conflict in file.js' });
    db.appendTaskMergeHistory(taskId, { event: 'merge_success', merge_id: 1, branch: 'feat-a' });

    const task = db.getTask(taskId);
    const history = JSON.parse(task.merge_history);
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].event, 'merge_conflict');
    assert.strictEqual(history[0].error, 'conflict in file.js');
    assert.ok(history[0].recorded_at);
    assert.strictEqual(history[1].event, 'merge_success');
    assert.ok(history[1].recorded_at);
  });

  it('should return empty history for task with no merge events', () => {
    const reqId = db.createRequest('No merges');
    const taskId = db.createTask({ request_id: reqId, subject: 'impl', description: 'do it', domain: 'test' });
    const task = db.getTask(taskId);
    assert.strictEqual(task.merge_history, null);
  });

  it('should aggregate merge history across tasks for a request', () => {
    const reqId = db.createRequest('Multi-task merge');
    const t1 = db.createTask({ request_id: reqId, subject: 'task1', description: 'first', domain: 'a' });
    const t2 = db.createTask({ request_id: reqId, subject: 'task2', description: 'second', domain: 'b' });

    db.appendTaskMergeHistory(t1, { event: 'merge_conflict', merge_id: 10, branch: 'feat-1' });
    db.appendTaskMergeHistory(t2, { event: 'merge_success', merge_id: 20, branch: 'feat-2' });
    db.appendTaskMergeHistory(t1, { event: 'merge_success', merge_id: 10, branch: 'feat-1' });

    const history = db.getRequestMergeHistory(reqId);
    assert.strictEqual(history.length, 3);
    const t1Events = history.filter(h => h.task_id === t1);
    const t2Events = history.filter(h => h.task_id === t2);
    assert.strictEqual(t1Events.length, 2);
    assert.strictEqual(t1Events[0].event, 'merge_conflict');
    assert.strictEqual(t1Events[1].event, 'merge_success');
    assert.strictEqual(t2Events.length, 1);
    assert.strictEqual(t2Events[0].event, 'merge_success');
  });

  it('should not fail when appending to nonexistent task', () => {
    db.appendTaskMergeHistory(99999, { event: 'merge_success', merge_id: 1 });
  });
});

describe('Request completion with extended task statuses', () => {
  it('checkRequestCompletion counts superseded tasks as terminal', () => {
    const reqId = db.createRequest('Superseded completion test');
    const t1 = db.createTask({ request_id: reqId, subject: 'A', description: 'done' });
    const t2 = db.createTask({ request_id: reqId, subject: 'B', description: 'superseded' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'superseded' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_terminal, true, 'completed + superseded = all_terminal');
    assert.strictEqual(result.all_done, false, 'legacy all_done remains success/failure-only');
    assert.strictEqual(result.superseded, 1);
    assert.strictEqual(result.completed, 1);
  });

  it('checkRequestCompletion counts failed_needs_reroute as terminal', () => {
    const reqId = db.createRequest('Rerouted completion test');
    const t1 = db.createTask({ request_id: reqId, subject: 'A', description: 'done' });
    const t2 = db.createTask({ request_id: reqId, subject: 'B', description: 'rerouted' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'failed_needs_reroute' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_terminal, true);
    assert.strictEqual(result.all_done, false);
    assert.strictEqual(result.rerouted, 1);
  });

  it('checkRequestCompletion does not mark all_done when non-terminal tasks remain', () => {
    const reqId = db.createRequest('Partial completion test');
    const t1 = db.createTask({ request_id: reqId, subject: 'A', description: 'done' });
    const t2 = db.createTask({ request_id: reqId, subject: 'B', description: 'in progress' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'in_progress' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_done, false, 'in_progress task should block completion');
    assert.strictEqual(result.all_terminal, false, 'in_progress task should block terminal completion');
  });

  it('checkRequestCompletion counts failed_final as terminal', () => {
    const reqId = db.createRequest('Failed final completion test');
    const t1 = db.createTask({ request_id: reqId, subject: 'A', description: 'done' });
    const t2 = db.createTask({ request_id: reqId, subject: 'B', description: 'final' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'failed_final' });

    const result = db.checkRequestCompletion(reqId);
    assert.strictEqual(result.all_terminal, true);
    assert.strictEqual(result.all_done, false);
    assert.strictEqual(result.failed_final, 1);
    assert.strictEqual(result.hard_failures, 1);
  });
});
