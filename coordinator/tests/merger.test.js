'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const merger = require('../src/merger');

let tmpDir;
const originalPath = process.env.PATH;

function getRequestCompletionMailCount(requestId) {
  return db.checkMail('master-1', false)
    .filter((m) => m.type === 'request_completed' && m.payload.request_id === requestId)
    .length;
}

function getRequestCompletionLogCount(requestId) {
  return db.getLog(50, 'coordinator').filter((entry) => {
    if (entry.action !== 'request_completed') return false;
    try {
      const details = JSON.parse(entry.details || '{}');
      return details.request_id === requestId;
    } catch {
      return false;
    }
  }).length;
}

function setupMockMergeCli({ failBuild = false } = {}) {
  const binDir = path.join(tmpDir, 'mock-bin');
  const commandLog = path.join(tmpDir, 'mock-cli.log');
  fs.mkdirSync(binDir, { recursive: true });

  const writeMock = (name, script) => {
    const filePath = path.join(binDir, name);
    fs.writeFileSync(filePath, script, { mode: 0o755 });
  };

  writeMock('git', `#!/usr/bin/env bash
set -eu
echo "git $*" >> "${commandLog}"
exit 0
`);

  writeMock('gh', `#!/usr/bin/env bash
set -eu
echo "gh $*" >> "${commandLog}"
exit 0
`);

  writeMock('npm', `#!/usr/bin/env bash
set -eu
echo "npm $*" >> "${commandLog}"
if [ "${failBuild ? '1' : '0'}" = "1" ] && [ "$1" = "run" ] && [ "\${2:-}" = "build" ]; then
  echo "missing script: build" >&2
  exit 1
fi
exit 0
`);

  process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
  return { commandLog };
}

function readCoordinatorLogEntries(action) {
  return db.getLog(200, 'coordinator')
    .filter((entry) => entry.action === action)
    .map((entry) => {
      try {
        return JSON.parse(entry.details || '{}');
      } catch {
        return {};
      }
    });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-merge-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  process.env.PATH = originalPath;
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Merge queue', () => {
  it('should enqueue and dequeue merges in FIFO order', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1' });
    db.enqueueMerge({ request_id: reqId, task_id: t2, pr_url: 'https://gh/pr/2', branch: 'agent-2' });

    const first = db.getNextMerge();
    assert.strictEqual(first.task_id, t1);
    assert.strictEqual(first.status, 'pending');
  });

  it('should respect priority', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'Normal' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'Urgent' });

    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1', priority: 0 });
    db.enqueueMerge({ request_id: reqId, task_id: t2, pr_url: 'https://gh/pr/2', branch: 'agent-2', priority: 10 });

    const first = db.getNextMerge();
    assert.strictEqual(first.task_id, t2); // higher priority first
  });

  it('should track merge status', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1' });

    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'merging' });

    // Should not return merging entry
    const next = db.getNextMerge();
    assert.strictEqual(next, undefined);

    // Mark merged
    db.updateMerge(entry.id, { status: 'merged', merged_at: new Date().toISOString() });
  });

  it('should handle conflict status', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.enqueueMerge({ request_id: reqId, task_id: t1, pr_url: 'https://gh/pr/1', branch: 'agent-1' });

    const entry = db.getNextMerge();
    db.updateMerge(entry.id, { status: 'conflict', error: 'CONFLICT in file.js' });

    // Conflict entries are not retried automatically
    const next = db.getNextMerge();
    assert.strictEqual(next, undefined);
  });
});

describe('Request completion tracking', () => {
  it('should detect when all tasks for a request are completed', () => {
    const reqId = db.createRequest('Feature');
    const t1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const t2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.updateTask(t1, { status: 'completed' });

    // Not all done yet
    const tasks = db.listTasks({ request_id: reqId });
    const incomplete = tasks.filter(t => t.status !== 'completed' && t.status !== 'failed');
    assert.strictEqual(incomplete.length, 1);

    // Complete the other
    db.updateTask(t2, { status: 'completed' });
    const tasksAfter = db.listTasks({ request_id: reqId });
    const incompleteAfter = tasksAfter.filter(t => t.status !== 'completed' && t.status !== 'failed');
    assert.strictEqual(incompleteAfter.length, 0);
  });

  it('should not complete when one task is completed and one is failed with no merge queue entries', () => {
    const reqId = db.createRequest('Feature');
    const completedTaskId = db.createTask({ request_id: reqId, subject: 'Completed task', description: 'Done' });
    const failedTaskId = db.createTask({ request_id: reqId, subject: 'Failed task', description: 'Failed' });

    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateTask(completedTaskId, { status: 'completed' });
    db.updateTask(failedTaskId, { status: 'failed' });

    merger.onTaskCompleted(failedTaskId);

    const requestAfter = db.getRequest(reqId);
    assert.notStrictEqual(requestAfter.status, 'completed');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('should not emit request_completed when all tasks are failed', () => {
    const reqId = db.createRequest('Feature');
    const failedTaskId1 = db.createTask({ request_id: reqId, subject: 'Failed task 1', description: 'Failed' });
    const failedTaskId2 = db.createTask({ request_id: reqId, subject: 'Failed task 2', description: 'Failed' });

    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateTask(failedTaskId1, { status: 'failed' });
    db.updateTask(failedTaskId2, { status: 'failed' });

    merger.onTaskCompleted(failedTaskId2);

    const requestAfter = db.getRequest(reqId);
    assert.notStrictEqual(requestAfter.status, 'completed');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('should keep request non-completed when merges are done but a sibling task is failed', () => {
    const reqId = db.createRequest('Feature');
    const mergedTaskId = db.createTask({ request_id: reqId, subject: 'Merged task', description: 'Done' });
    const failedTaskId = db.createTask({ request_id: reqId, subject: 'Failed task', description: 'Failed' });

    db.updateTask(mergedTaskId, { status: 'completed' });
    db.updateTask(failedTaskId, { status: 'failed' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/org/repo/pull/103',
      branch: 'agent-1',
    });

    merger.processQueue(tmpDir, () => ({ success: true }));

    const requestAfter = db.getRequest(reqId);
    assert.notStrictEqual(requestAfter.status, 'completed');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('should keep request integrating when merges are done but a sibling task is assigned', () => {
    const reqId = db.createRequest('Feature');
    const mergedTaskId = db.createTask({ request_id: reqId, subject: 'Merged task', description: 'Already done' });
    const assignedTaskId = db.createTask({ request_id: reqId, subject: 'Assigned task', description: 'Still running' });

    db.updateTask(mergedTaskId, { status: 'completed' });
    db.updateTask(assignedTaskId, { status: 'assigned' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/org/repo/pull/101',
      branch: 'agent-1',
    });

    merger.processQueue(tmpDir, () => ({ success: true }));

    const requestAfterMerge = db.getRequest(reqId);
    assert.strictEqual(requestAfterMerge.status, 'integrating');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('should keep request integrating when merges are done but a sibling task is ready, then complete after sibling reaches terminal success', () => {
    const reqId = db.createRequest('Feature');
    const mergedTaskId = db.createTask({ request_id: reqId, subject: 'Merged task', description: 'Already done' });
    const readyTaskId = db.createTask({ request_id: reqId, subject: 'Ready task', description: 'Not yet started' });

    db.updateTask(mergedTaskId, { status: 'completed' });
    db.updateTask(readyTaskId, { status: 'ready' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/org/repo/pull/105',
      branch: 'agent-1',
    });

    // Merge succeeds but sibling is still ready — request must NOT complete
    merger.processQueue(tmpDir, () => ({ success: true }));

    const requestAfterMerge = db.getRequest(reqId);
    assert.strictEqual(requestAfterMerge.status, 'integrating');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);

    // Sibling reaches terminal success — request must now complete
    db.updateTask(readyTaskId, { status: 'completed' });
    merger.onTaskCompleted(readyTaskId);

    const requestAfterSiblingDone = db.getRequest(reqId);
    assert.strictEqual(requestAfterSiblingDone.status, 'completed');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 1);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 1);
  });

  it('should clear stale completion metadata when onTaskCompleted moves request back to integrating', () => {
    const reqId = db.createRequest('Retry merge for completed request');
    const completedTaskId = db.createTask({ request_id: reqId, subject: 'Completed task', description: 'Done' });
    const completedAt = new Date().toISOString();

    db.updateTask(completedTaskId, { status: 'completed' });
    db.updateRequest(reqId, {
      status: 'completed',
      completed_at: completedAt,
      result: 'previous terminal result',
    });

    db.enqueueMerge({
      request_id: reqId,
      task_id: completedTaskId,
      pr_url: 'https://github.com/org/repo/pull/104',
      branch: 'agent-1',
    });

    merger.onTaskCompleted(completedTaskId);

    const reopened = db.getRequest(reqId);
    assert.strictEqual(reopened.status, 'integrating');
    assert.strictEqual(reopened.completed_at, null);
    assert.strictEqual(reopened.result, null);
  });

  it('should not complete request when one task is completed and one failed merge row exists', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Completed task', description: 'Done' });

    db.updateRequest(reqId, { status: 'in_progress' });
    db.updateTask(taskId, { status: 'completed' });

    // Enqueue a merge and mark it as failed (non-recoverable, e.g. functional conflict)
    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/200',
      branch: 'agent-1',
    });
    db.updateMerge(enqueueResult.lastInsertRowid, {
      status: 'failed',
      error: 'functional_conflict: build failed after merge',
    });

    merger.onTaskCompleted(taskId);

    const requestAfter = db.getRequest(reqId);
    assert.notStrictEqual(requestAfter.status, 'completed');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('should emit request_completed exactly once when final task becomes terminal', () => {
    const reqId = db.createRequest('Feature');
    const mergedTaskId = db.createTask({ request_id: reqId, subject: 'Merged task', description: 'Already done' });
    const inProgressTaskId = db.createTask({ request_id: reqId, subject: 'In-progress task', description: 'Still running' });

    db.updateTask(mergedTaskId, { status: 'completed' });
    db.updateTask(inProgressTaskId, { status: 'in_progress' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/org/repo/pull/102',
      branch: 'agent-1',
    });

    merger.processQueue(tmpDir, () => ({ success: true }));

    db.updateTask(inProgressTaskId, { status: 'completed' });
    merger.onTaskCompleted(inProgressTaskId);
    merger.onTaskCompleted(inProgressTaskId);

    const requestAfterTasksDone = db.getRequest(reqId);
    assert.strictEqual(requestAfterTasksDone.status, 'completed');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 1);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 1);
  });
});

describe('Assignment-priority merge deferral', () => {
  function seedAssignmentPriorityMergeTask() {
    const reqId = db.createRequest('Feature');
    const mergedTaskId = db.createTask({ request_id: reqId, subject: 'Task ready to merge', description: 'Done' });
    const readyTaskId = db.createTask({ request_id: reqId, subject: 'Task still ready', description: 'Still assignable' });

    db.updateTask(mergedTaskId, { status: 'completed' });
    db.updateTask(readyTaskId, { status: 'ready', assigned_to: null });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/acme/repo/pull/3',
      branch: 'agent-1',
    });

    return {
      reqId,
      readyTaskId,
      mergeId: enqueueResult.lastInsertRowid,
    };
  }

  it('should defer merges first, then process one merge after bounded deferrals', () => {
    const { readyTaskId, mergeId } = seedAssignmentPriorityMergeTask();

    db.setConfig('prioritize_assignment_over_merge', 'true');
    db.setConfig('assignment_priority_merge_max_deferrals', '2');
    db.setConfig('assignment_priority_merge_max_age_ms', '86400000');

    let mergeAttempts = 0;
    const mergeExecutor = () => {
      mergeAttempts += 1;
      return { success: true };
    };

    merger.processQueue(tmpDir, mergeExecutor);

    const mergeAfterFirstPass = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(mergeAttempts, 0);
    assert.strictEqual(mergeAfterFirstPass.status, 'pending');

    const deferredLogs = readCoordinatorLogEntries('merge_deferred_assignment_priority');
    assert.strictEqual(deferredLogs.length, 1);
    assert.strictEqual(deferredLogs[0].merge_id, mergeId);
    assert.strictEqual(deferredLogs[0].consecutive_deferrals, 1);
    assert.strictEqual(deferredLogs[0].ready_task_count, 1);

    merger.processQueue(tmpDir, mergeExecutor);

    const mergeAfterSecondPass = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(mergeAttempts, 1);
    assert.strictEqual(mergeAfterSecondPass.status, 'merged');

    const starvationEscapeLogs = readCoordinatorLogEntries('merge_assignment_priority_starvation_escape');
    assert.strictEqual(starvationEscapeLogs.length, 1);
    assert.strictEqual(starvationEscapeLogs[0].merge_id, mergeId);
    assert.strictEqual(starvationEscapeLogs[0].breached_by_count, true);

    const readyTaskAfterMerge = db.getTask(readyTaskId);
    assert.strictEqual(readyTaskAfterMerge.status, 'ready');
  });

  it('should keep deferring during healthy allocator loop activity', () => {
    const { mergeId } = seedAssignmentPriorityMergeTask();

    db.setConfig('prioritize_assignment_over_merge', 'true');
    db.setConfig('assignment_priority_merge_max_deferrals', '10');
    db.setConfig('assignment_priority_merge_max_age_ms', '86400000');

    const allocatorLoopId = db.createLoop('/allocate-loop');
    db.updateLoop(allocatorLoopId, { last_heartbeat: new Date().toISOString() });

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => {
      mergeAttempts += 1;
      return { success: true };
    });

    const mergeAfterPass = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(mergeAttempts, 0);
    assert.strictEqual(mergeAfterPass.status, 'pending');

    const deferredLogs = readCoordinatorLogEntries('merge_deferred_assignment_priority');
    assert.strictEqual(deferredLogs.length, 1);
    assert.strictEqual(deferredLogs[0].merge_id, mergeId);
    assert.strictEqual(deferredLogs[0].allocator_loop_present, true);
    assert.strictEqual(deferredLogs[0].allocator_loop_id, allocatorLoopId);

    const starvationEscapeLogs = readCoordinatorLogEntries('merge_assignment_priority_starvation_escape');
    assert.strictEqual(starvationEscapeLogs.length, 0);
  });

  it('should detect allocator loop from real expanded prompt shape and bypass deferral on stale heartbeat', () => {
    // Regression: when the loop prompt is the full expanded allocate-loop skill content
    // (not the short "/allocate-loop" command), stale-heartbeat detection must still fire.
    const { readyTaskId, mergeId } = seedAssignmentPriorityMergeTask();

    db.setConfig('prioritize_assignment_over_merge', 'true');
    db.setConfig('assignment_priority_merge_max_deferrals', '50');
    db.setConfig('assignment_priority_merge_max_age_ms', '86400000');
    db.setConfig('assignment_priority_allocator_loop_stale_ms', '120000');

    // Simulate the real prompt shape: full expanded skill content that contains
    // role markers but NOT the "/allocate-loop" slash-command literal.
    const realPromptShape = [
      '# Master-3 Allocator Loop (mac10)',
      '',
      'You are the Allocator agent (Master-3) in the mac10 multi-agent system.',
      'You match ready tasks to idle workers using domain-affinity rules.',
      '',
      '## Signaling',
      'Use `mac10 inbox allocator --block` for ALL inter-agent communication.',
    ].join('\n');

    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const allocatorLoopId = db.createLoop(realPromptShape);
    db.updateLoop(allocatorLoopId, { last_heartbeat: staleHeartbeat });

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => {
      mergeAttempts += 1;
      return { success: true };
    });

    const mergeAfterPass = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(mergeAttempts, 1, 'merge should proceed (stale allocator loop should not block)');
    assert.strictEqual(mergeAfterPass.status, 'merged');

    const deferredLogs = readCoordinatorLogEntries('merge_deferred_assignment_priority');
    assert.strictEqual(deferredLogs.length, 0);

    const starvationEscapeLogs = readCoordinatorLogEntries('merge_assignment_priority_starvation_escape');
    assert.strictEqual(starvationEscapeLogs.length, 1);
    assert.strictEqual(starvationEscapeLogs[0].merge_id, mergeId);
    assert.strictEqual(starvationEscapeLogs[0].breached_by_allocator_loop_stale, true);
    assert.strictEqual(starvationEscapeLogs[0].allocator_loop_present, true);
    assert.strictEqual(starvationEscapeLogs[0].allocator_loop_id, allocatorLoopId);
    assert.ok(starvationEscapeLogs[0].allocator_loop_heartbeat_age_ms >= 120000);

    const readyTaskAfterMerge = db.getTask(readyTaskId);
    assert.strictEqual(readyTaskAfterMerge.status, 'ready');
  });

  it('should bypass deferral when allocator loop heartbeat is stale and ready tasks exist', () => {
    const { readyTaskId, mergeId } = seedAssignmentPriorityMergeTask();

    db.setConfig('prioritize_assignment_over_merge', 'true');
    db.setConfig('assignment_priority_merge_max_deferrals', '50');
    db.setConfig('assignment_priority_merge_max_age_ms', '86400000');
    db.setConfig('assignment_priority_allocator_loop_stale_ms', '120000');

    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const allocatorLoopId = db.createLoop('/allocate-loop');
    db.updateLoop(allocatorLoopId, { last_heartbeat: staleHeartbeat });

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => {
      mergeAttempts += 1;
      return { success: true };
    });

    const mergeAfterPass = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(mergeAttempts, 1);
    assert.strictEqual(mergeAfterPass.status, 'merged');

    const deferredLogs = readCoordinatorLogEntries('merge_deferred_assignment_priority');
    assert.strictEqual(deferredLogs.length, 0);

    const starvationEscapeLogs = readCoordinatorLogEntries('merge_assignment_priority_starvation_escape');
    assert.strictEqual(starvationEscapeLogs.length, 1);
    assert.strictEqual(starvationEscapeLogs[0].merge_id, mergeId);
    assert.strictEqual(starvationEscapeLogs[0].breached_by_count, false);
    assert.strictEqual(starvationEscapeLogs[0].breached_by_age, false);
    assert.strictEqual(starvationEscapeLogs[0].breached_by_allocator_loop_stale, true);
    assert.strictEqual(starvationEscapeLogs[0].allocator_loop_present, true);
    assert.strictEqual(starvationEscapeLogs[0].allocator_loop_id, allocatorLoopId);
    assert.ok(starvationEscapeLogs[0].allocator_loop_heartbeat_age_ms >= 120000);

    const readyTaskAfterMerge = db.getTask(readyTaskId);
    assert.strictEqual(readyTaskAfterMerge.status, 'ready');
  });
});

describe('Overlap validation command selection', () => {
  function seedOverlapMergeTask(validation) {
    const reqId = db.createRequest('Feature');
    const mergedTaskId = db.createTask({
      request_id: reqId,
      subject: 'Merged overlap task',
      description: 'Already merged',
      files: ['src/shared.js'],
    });
    const pendingTaskPayload = {
      request_id: reqId,
      subject: 'Pending overlap task',
      description: 'Needs merge validation',
      files: ['src/shared.js'],
    };
    if (validation !== undefined) {
      pendingTaskPayload.validation = validation;
    }
    const pendingTaskId = db.createTask(pendingTaskPayload);
    db.updateTask(pendingTaskId, { overlap_with: JSON.stringify([mergedTaskId]) });

    const mergedQueue = db.enqueueMerge({
      request_id: reqId,
      task_id: mergedTaskId,
      pr_url: 'https://github.com/acme/repo/pull/1',
      branch: 'agent-1',
    });
    db.updateMerge(mergedQueue.lastInsertRowid, { status: 'merged', merged_at: new Date().toISOString() });

    const pendingQueue = db.enqueueMerge({
      request_id: reqId,
      task_id: pendingTaskId,
      pr_url: 'https://github.com/acme/repo/pull/2',
      branch: 'agent-2',
    });

    return { pendingMergeId: pendingQueue.lastInsertRowid };
  }

  it('should skip default overlap validation when build and test scripts are missing', () => {
    const { commandLog } = setupMockMergeCli({ failBuild: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'overlap-test' }, null, 2));
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask();
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(!commands.includes('npm run build'));

    const skipLogs = readCoordinatorLogEntries('overlap_validation_default_skipped');
    assert.ok(skipLogs.some((details) => details.reason === 'no_build_or_test_script'));
  });

  it('should run task.validation during overlap checks even when no default script is available', () => {
    const { commandLog } = setupMockMergeCli({ failBuild: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'overlap-test' }, null, 2));
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask('npm run validate:task');
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(commands.includes('npm run validate:task'));
    assert.ok(!commands.includes('npm run build'));
  });

  it('should prefer task.validation commands over default when both are available', () => {
    const { commandLog } = setupMockMergeCli();
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'overlap-test',
      scripts: {
        build: 'echo build',
        test: 'echo test',
      },
    }, null, 2));
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask('npm run validate:custom');
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(commands.includes('npm run validate:custom'), 'Task-specific validation should run');
    assert.ok(!commands.includes('npm run build'), 'Default build script should not run when task commands are provided');
    assert.ok(!commands.includes('npm run test'), 'Default test script should not run when task commands are provided');
  });

  it('should prefer test script for default overlap validation when both build and test are present', () => {
    const { commandLog } = setupMockMergeCli();
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'overlap-test',
      scripts: {
        build: 'echo build',
        test: 'echo test',
      },
    }, null, 2));
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask();
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(commands.includes('npm test'));
    assert.ok(!commands.includes('npm run build'));

    const selectedLogs = readCoordinatorLogEntries('overlap_validation_default_selected');
    assert.ok(selectedLogs.some((details) => details.source === 'scripts.test'));
  });

  it('should select test script for default overlap validation when build script is missing', () => {
    const { commandLog } = setupMockMergeCli();
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'overlap-test',
      scripts: {
        test: 'echo test',
      },
    }, null, 2));
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask();
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(!commands.includes('npm run build'));
    assert.ok(commands.includes('npm test'));

    const selectedLogs = readCoordinatorLogEntries('overlap_validation_default_selected');
    assert.ok(selectedLogs.some((details) => details.source === 'scripts.test'));
  });

  it('should fall back to build script when only build is present', () => {
    const { commandLog } = setupMockMergeCli();
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      name: 'overlap-test',
      scripts: {
        build: 'echo build',
      },
    }, null, 2));
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask();
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(commands.includes('npm run build'));
    assert.ok(!commands.includes('npm test'));

    const selectedLogs = readCoordinatorLogEntries('overlap_validation_default_selected');
    assert.ok(selectedLogs.some((details) => details.source === 'scripts.build'));
  });

  it('should execute shell-style task.validation commands with compound operators', () => {
    const { commandLog } = setupMockMergeCli();
    fs.mkdirSync(path.join(tmpDir, 'coordinator'), { recursive: true });
    db.setConfig('merge_validation', 'true');

    const { pendingMergeId } = seedOverlapMergeTask('cd coordinator && npm test -- cli.test.js');
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(commands.includes('npm test -- cli.test.js'));
  });

  it('should preserve quoted args in shell-style task.validation commands', () => {
    setupMockMergeCli();
    db.setConfig('merge_validation', 'true');

    const outputFile = path.join(tmpDir, 'quoted-output.txt');
    const { pendingMergeId } = seedOverlapMergeTask(`printf "%s" "quoted value" > "${outputFile}"`);
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);
    assert.strictEqual(fs.readFileSync(outputFile, 'utf8'), 'quoted value');
  });

  it('should continue supporting structured build/test/lint validation command objects', () => {
    const { commandLog } = setupMockMergeCli();
    db.setConfig('merge_validation', 'true');

    const validation = JSON.stringify({
      build_cmd: 'npm run build:task',
      test_cmd: 'npm run test:task',
      lint_cmd: 'npm run lint:task',
    });
    const { pendingMergeId } = seedOverlapMergeTask(validation);
    merger.processQueue(tmpDir);

    const pendingMerge = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(pendingMergeId);
    assert.strictEqual(pendingMerge.status, 'merged');
    assert.strictEqual(pendingMerge.error, null);

    const commands = fs.existsSync(commandLog) ? fs.readFileSync(commandLog, 'utf8') : '';
    assert.ok(commands.includes('npm run build:task'));
    assert.ok(commands.includes('npm run test:task'));
    assert.ok(commands.includes('npm run lint:task'));
  });
});

describe('tryRebase stash guard', () => {
  function setupStashTestCli(statusOutput) {
    const binDir = path.join(tmpDir, 'mock-bin');
    const commandLog = path.join(tmpDir, 'stash-cli.log');
    fs.mkdirSync(binDir, { recursive: true });

    const gitScript = [
      '#!/usr/bin/env bash',
      'set -eu',
      `echo "git $*" >> "${commandLog}"`,
      'if [ "$1" = "status" ] && [ "${2:-}" = "--porcelain" ]; then',
      `  printf '%s' '${statusOutput}'`,
      '  exit 0',
      'fi',
      'exit 0',
    ].join('\n');
    fs.writeFileSync(path.join(binDir, 'git'), gitScript, { mode: 0o755 });

    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    return { commandLog };
  }

  function seedStashTestEntry() {
    const fakeWtPath = path.join(tmpDir, '.worktrees', 'wt-1');
    fs.mkdirSync(fakeWtPath, { recursive: true });
    db.registerWorker(1, fakeWtPath, 'agent-1');

    const reqId = db.createRequest('Stash test feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Stash task', description: 'Test stash guard' });
    db.updateTask(taskId, { assigned_to: 1 });

    return {
      id: 999,
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/99',
      branch: 'agent-1',
      created_at: new Date().toISOString(),
    };
  }

  it('should stash unstaged tracked changes before rebase and pop after', () => {
    const { commandLog } = setupStashTestCli(' M tracked-file.js');
    const entry = seedStashTestEntry();

    const result = merger.tryRebase(entry, tmpDir);

    assert.strictEqual(result.success, true);
    const lines = fs.readFileSync(commandLog, 'utf8').split('\n');
    const stashPushIdx = lines.findIndex((l) => l.includes('stash push') && l.includes('--include-untracked'));
    const rebaseIdx = lines.findIndex((l) => l.includes('rebase origin/main'));
    const stashPopIdx = lines.findIndex((l) => l.includes('stash pop'));

    assert.ok(stashPushIdx >= 0, 'stash push --include-untracked should be called');
    assert.ok(rebaseIdx >= 0, 'git rebase should be called');
    assert.ok(stashPopIdx >= 0, 'stash pop should be called');
    assert.ok(stashPushIdx < rebaseIdx, 'stash push should occur before rebase');
    assert.ok(stashPopIdx > rebaseIdx, 'stash pop should occur after rebase');

    const stashLogs = readCoordinatorLogEntries('stash_recovery');
    assert.ok(stashLogs.length > 0, 'stash_recovery log should be emitted');
    assert.strictEqual(stashLogs[0].reason_code, 'stash_recovery');
    assert.strictEqual(stashLogs[0].branch, 'agent-1');
    assert.strictEqual(stashLogs[0].reason, 'dirty_worktree_before_rebase');
  });

  it('should stash untracked files before rebase and pop after', () => {
    const { commandLog } = setupStashTestCli('?? newfile.txt');
    const entry = seedStashTestEntry();

    const result = merger.tryRebase(entry, tmpDir);

    assert.strictEqual(result.success, true);
    const lines = fs.readFileSync(commandLog, 'utf8').split('\n');
    const stashPushIdx = lines.findIndex((l) => l.includes('stash push') && l.includes('--include-untracked'));
    const rebaseIdx = lines.findIndex((l) => l.includes('rebase origin/main'));
    const stashPopIdx = lines.findIndex((l) => l.includes('stash pop'));

    assert.ok(stashPushIdx >= 0, 'stash push --include-untracked should be called for untracked files');
    assert.ok(stashPushIdx < rebaseIdx, 'stash push should occur before rebase');
    assert.ok(stashPopIdx > rebaseIdx, 'stash pop should occur after rebase');

    const stashLogs = readCoordinatorLogEntries('stash_recovery');
    assert.ok(stashLogs.length > 0, 'stash_recovery log should be emitted for untracked files');
    assert.strictEqual(stashLogs[0].reason_code, 'stash_recovery');
  });
});

describe('functional_conflict merge status', () => {
  it('should set merge status to conflict (not failed) when functional_conflict occurs', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/10',
      branch: 'agent-1',
    });

    // Executor returns functional_conflict result
    const mergeExecutor = () => ({
      success: false,
      functional_conflict: true,
      error: 'post-merge validation failed: tests do not pass',
    });

    merger.processQueue(tmpDir, mergeExecutor);

    const entry = db.getDb().prepare('SELECT * FROM merge_queue WHERE request_id = ?').get(reqId);
    assert.strictEqual(entry.status, 'conflict', 'functional_conflict should set status to conflict, not failed');
    assert.ok(entry.error.startsWith('functional_conflict:'), 'error should preserve functional_conflict: prefix');

    const logs = readCoordinatorLogEntries('functional_conflict');
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].merge_id, entry.id);
  });
});
