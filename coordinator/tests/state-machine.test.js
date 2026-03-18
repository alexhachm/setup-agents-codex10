'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const merger = require('../src/merger');

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

  it('should keep pending tasks blocked when dependency IDs do not exist', () => {
    const reqId = db.createRequest('Feature');
    const blockedId = db.createTask({
      request_id: reqId,
      subject: 'Blocked',
      description: 'Wait for missing dependency',
      depends_on: [999999],
    });

    db.checkAndPromoteTasks();

    const blockedTask = db.getTask(blockedId);
    assert.strictEqual(blockedTask.status, 'pending');
  });

  it('should keep mixed existing and missing dependencies blocked', () => {
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
    assert.strictEqual(db.getTask(t2).status, 'pending');

    db.updateTask(t1, { status: 'completed' });
    db.checkAndPromoteTasks();
    assert.strictEqual(db.getTask(t2).status, 'pending');
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
