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

describe('onTaskCompleted with extended terminal statuses', () => {
  it('should complete request when sibling tasks are superseded or failed_final', () => {
    const reqId = db.createRequest('Extended terminal');
    const t1 = db.createTask({ request_id: reqId, subject: 'Active', description: 'Will complete' });
    const t2 = db.createTask({ request_id: reqId, subject: 'Superseded', description: 'Was superseded' });
    const t3 = db.createTask({ request_id: reqId, subject: 'Final fail', description: 'Permanent failure' });
    db.updateRequest(reqId, { status: 'integrating' });
    db.updateTask(t2, { status: 'superseded' });
    db.updateTask(t3, { status: 'failed_final' });
    db.updateTask(t1, { status: 'completed' });

    merger.onTaskCompleted(t1);

    const after = db.getRequest(reqId);
    assert.strictEqual(after.status, 'completed');
  });

  it('should not complete request when a sibling is still assigned', () => {
    const reqId = db.createRequest('Stale assigned sibling');
    const t1 = db.createTask({ request_id: reqId, subject: 'Done', description: 'Completed' });
    const t2 = db.createTask({ request_id: reqId, subject: 'Stuck', description: 'Still assigned' });
    db.updateRequest(reqId, { status: 'integrating' });
    db.updateTask(t1, { status: 'completed' });
    db.updateTask(t2, { status: 'assigned' });

    merger.onTaskCompleted(t1);

    const after = db.getRequest(reqId);
    assert.notStrictEqual(after.status, 'completed');
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

describe('tryRebase dirty-worktree reset', () => {
  function setupDirtyWorktreeTestCli(statusOutput) {
    const binDir = path.join(tmpDir, 'mock-bin');
    const commandLog = path.join(tmpDir, 'dirty-wt-cli.log');
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

  function seedDirtyWorktreeTestEntry() {
    const fakeWtPath = path.join(tmpDir, '.worktrees', 'wt-1');
    fs.mkdirSync(fakeWtPath, { recursive: true });
    db.registerWorker(1, fakeWtPath, 'agent-1');

    const reqId = db.createRequest('Dirty worktree test feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Dirty worktree task', description: 'Test dirty worktree reset' });
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

  it('should hard-reset dirty worktree (tracked changes) before rebase', () => {
    const { commandLog } = setupDirtyWorktreeTestCli(' M tracked-file.js');
    const entry = seedDirtyWorktreeTestEntry();

    const result = merger.tryRebase(entry, tmpDir);

    assert.strictEqual(result.success, true);
    const lines = fs.readFileSync(commandLog, 'utf8').split('\n');
    const checkoutDotIdx = lines.findIndex((l) => l.includes('checkout .'));
    const cleanIdx = lines.findIndex((l) => l.includes('clean -fd'));
    const rebaseIdx = lines.findIndex((l) => l.includes('rebase origin/main'));

    assert.ok(checkoutDotIdx >= 0, 'git checkout . should be called to reset tracked files');
    assert.ok(cleanIdx >= 0, 'git clean -fd should be called to remove untracked files');
    assert.ok(rebaseIdx >= 0, 'git rebase should be called');
    assert.ok(checkoutDotIdx < rebaseIdx, 'git checkout . should occur before rebase');
    assert.ok(cleanIdx < rebaseIdx, 'git clean -fd should occur before rebase');

    const resetLogs = readCoordinatorLogEntries('dirty_worktree_reset');
    assert.ok(resetLogs.length > 0, 'dirty_worktree_reset log should be emitted');
    assert.strictEqual(resetLogs[0].branch, 'agent-1');
    assert.strictEqual(resetLogs[0].reason, 'dirty_worktree_before_rebase');
  });

  it('should hard-reset dirty worktree (untracked files) before rebase', () => {
    const { commandLog } = setupDirtyWorktreeTestCli('?? newfile.txt');
    const entry = seedDirtyWorktreeTestEntry();

    const result = merger.tryRebase(entry, tmpDir);

    assert.strictEqual(result.success, true);
    const lines = fs.readFileSync(commandLog, 'utf8').split('\n');
    const checkoutDotIdx = lines.findIndex((l) => l.includes('checkout .'));
    const cleanIdx = lines.findIndex((l) => l.includes('clean -fd'));
    const rebaseIdx = lines.findIndex((l) => l.includes('rebase origin/main'));

    assert.ok(checkoutDotIdx >= 0, 'git checkout . should be called for untracked files');
    assert.ok(cleanIdx >= 0, 'git clean -fd should be called for untracked files');
    assert.ok(checkoutDotIdx < rebaseIdx, 'git checkout . should occur before rebase');
    assert.ok(cleanIdx < rebaseIdx, 'git clean -fd should occur before rebase');

    const resetLogs = readCoordinatorLogEntries('dirty_worktree_reset');
    assert.ok(resetLogs.length > 0, 'dirty_worktree_reset log should be emitted for untracked files');
  });
});

describe('stale conflict recovery sweep', () => {
  it('should reset failed functional_conflict entries older than 5 minutes to pending and then attempt merge', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/300',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    // Simulate a previously failed functional_conflict entry with an old timestamp
    db.updateMerge(mergeId, { status: 'failed', error: 'functional_conflict: validation failed' });
    db.getDb().prepare("UPDATE merge_queue SET updated_at = datetime('now', '-6 minutes') WHERE id = ?").run(mergeId);

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => { mergeAttempts += 1; return { success: true }; });

    // Recovery sweep should have reset the entry; getNextMerge should then pick it up
    assert.strictEqual(mergeAttempts, 1, 'merge should be attempted after recovery resets the entry to pending');
    const recoveredEntry = db.getDb().prepare('SELECT status, retry_count FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(recoveredEntry.status, 'merged');
    assert.strictEqual(recoveredEntry.retry_count, 1, 'retry_count should increment when stale conflict is retried');

    const recoveryLogs = readCoordinatorLogEntries('stale_conflict_recovery_sweep');
    assert.strictEqual(recoveryLogs.length, 1);
    assert.ok(Array.isArray(recoveryLogs[0].merge_ids) && recoveryLogs[0].merge_ids.includes(mergeId));

    const lessonLogs = readCoordinatorLogEntries('conflict_resolution_lesson_written');
    assert.strictEqual(lessonLogs.length, 1, 'should write a conflict resolution lesson on retry success');
    assert.strictEqual(lessonLogs[0].merge_id, mergeId);
    assert.strictEqual(lessonLogs[0].retry_count, 1);

    const lessons = db.listInsightArtifacts({
      project_context_key: 'coordinator:merge_conflict_lessons',
      artifact_type: 'conflict_resolution_lesson',
    });
    assert.strictEqual(lessons.length, 1, 'should create exactly one conflict resolution lesson insight');
    const payload = JSON.parse(lessons[0].artifact_payload);
    assert.strictEqual(payload.merge_id, mergeId);
    assert.strictEqual(payload.retry_count, 1);
    assert.strictEqual(payload.branch, 'agent-1');
  });

  it('should NOT write a conflict resolution lesson when retry_count is 0', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/350',
      branch: 'agent-5',
    });

    merger.processQueue(tmpDir, () => ({ success: true }));

    const lessonLogs = readCoordinatorLogEntries('conflict_resolution_lesson_written');
    assert.strictEqual(lessonLogs.length, 0, 'should not write a lesson for first-attempt success');

    const lessons = db.listInsightArtifacts({
      project_context_key: 'coordinator:merge_conflict_lessons',
      artifact_type: 'conflict_resolution_lesson',
    });
    assert.strictEqual(lessons.length, 0, 'no insight should be created for non-retry merge');
  });

  it('should NOT reset functional_conflict failed entries that are less than 5 minutes old', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/301',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    // Simulate a recent functional_conflict failure (not old enough for recovery)
    db.updateMerge(mergeId, { status: 'failed', error: 'functional_conflict: validation failed' });
    // Leave updated_at as-is (recent)

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => { mergeAttempts += 1; return { success: true }; });

    assert.strictEqual(mergeAttempts, 0, 'merge should not be attempted — entry is too recent');

    const entry = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'failed', 'entry should remain failed');

    const recoveryLogs = readCoordinatorLogEntries('stale_conflict_recovery_sweep');
    assert.strictEqual(recoveryLogs.length, 0);
  });

  it('should NOT reset functional_conflict entries on non-integrating requests', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'in_progress' }); // not integrating

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/302',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    db.updateMerge(mergeId, { status: 'failed', error: 'functional_conflict: validation failed' });
    db.getDb().prepare("UPDATE merge_queue SET updated_at = datetime('now', '-10 minutes') WHERE id = ?").run(mergeId);

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => { mergeAttempts += 1; return { success: true }; });

    assert.strictEqual(mergeAttempts, 0, 'merge should not be attempted — request is not integrating');

    const entry = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'failed', 'entry should remain failed');
  });

  it('should reset conflict status entries older than 5 minutes to pending and then attempt merge', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/304',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    // Simulate a previously conflicted entry (git conflict) with an old timestamp
    db.updateMerge(mergeId, { status: 'conflict', error: 'merge conflict: cannot be automatically merged' });
    db.getDb().prepare("UPDATE merge_queue SET updated_at = datetime('now', '-6 minutes') WHERE id = ?").run(mergeId);

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => { mergeAttempts += 1; return { success: true }; });

    // Recovery sweep should have reset the entry; getNextMerge should then pick it up
    assert.strictEqual(mergeAttempts, 1, 'merge should be attempted after recovery resets the conflict entry to pending');
    const recoveredEntry = db.getDb().prepare('SELECT status, retry_count FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(recoveredEntry.status, 'merged');
    assert.strictEqual(recoveredEntry.retry_count, 1, 'retry_count should increment when stale conflict is retried');

    const recoveryLogs = readCoordinatorLogEntries('stale_conflict_recovery_sweep');
    assert.strictEqual(recoveryLogs.length, 1);
    assert.ok(Array.isArray(recoveryLogs[0].merge_ids) && recoveryLogs[0].merge_ids.includes(mergeId));
  });

  it('should create a follow-up task instead of retrying exhausted stale conflicts', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'T1',
      description: 'D1',
      domain: 'merge',
      files: ['src/conflicted.js'],
    });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/306',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    db.updateMerge(mergeId, { status: 'conflict', error: 'merge conflict: cannot be automatically merged' });
    db.getDb().prepare(
      "UPDATE merge_queue SET retry_count = ?, updated_at = datetime('now', '-6 minutes') WHERE id = ?"
    ).run(merger.MAX_MERGE_CONFLICT_RETRIES, mergeId);

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => { mergeAttempts += 1; return { success: true }; });

    assert.strictEqual(mergeAttempts, 0, 'merge should not be attempted after retry cap is exhausted');

    const entry = db.getDb().prepare('SELECT status, error, retry_count FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'failed');
    assert.ok(entry.error.startsWith('conflict_retries_exhausted:'), 'entry should record retry exhaustion');
    assert.strictEqual(entry.retry_count, merger.MAX_MERGE_CONFLICT_RETRIES);

    const tasks = db.listTasks({ request_id: reqId });
    const followUp = tasks.find((task) => task.subject === `Resolve exhausted merge conflict for merge ${mergeId}`);
    assert.ok(followUp, 'targeted follow-up task should be created');
    assert.strictEqual(followUp.status, 'pending');
    assert.strictEqual(followUp.priority, 'urgent');
    assert.strictEqual(followUp.tier, 2);
    assert.strictEqual(followUp.domain, 'merge');

    const mail = db.checkMail('master-2', false).filter((m) => m.type === 'merge_conflict_exhausted');
    assert.strictEqual(mail.length, 1);
    assert.strictEqual(mail[0].payload.follow_up_task_id, followUp.id);

    const exhaustedLogs = readCoordinatorLogEntries('merge_conflict_retries_exhausted');
    assert.strictEqual(exhaustedLogs.length, 1);
    assert.strictEqual(exhaustedLogs[0].follow_up_task_id, followUp.id);
  });

  it('should NOT reset conflict status entries that are less than 5 minutes old', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });

    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/305',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    // Recent conflict entry — should not be swept
    db.updateMerge(mergeId, { status: 'conflict', error: 'merge conflict: cannot be automatically merged' });
    // Leave updated_at as-is (recent)

    let mergeAttempts = 0;
    merger.processQueue(tmpDir, () => { mergeAttempts += 1; return { success: true }; });

    assert.strictEqual(mergeAttempts, 0, 'merge should not be attempted — entry is too recent');

    const entry = db.getDb().prepare('SELECT status FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'conflict', 'entry should remain conflict');

    const recoveryLogs = readCoordinatorLogEntries('stale_conflict_recovery_sweep');
    assert.strictEqual(recoveryLogs.length, 0);
  });

  it('onTaskCompleted should reset functional_conflict failed entries to pending and move request to integrating', () => {
    const reqId = db.createRequest('Feature');
    const taskId1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const taskId2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.updateTask(taskId1, { status: 'completed' });
    db.updateTask(taskId2, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId1,
      pr_url: 'https://github.com/org/repo/pull/303',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    db.updateMerge(mergeId, { status: 'failed', error: 'functional_conflict: build failed after merge' });

    merger.onTaskCompleted(taskId2);

    // The failed functional_conflict entry should be reset to pending
    const entry = db.getDb().prepare('SELECT status, error, retry_count FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'pending', 'functional_conflict failed entry should be reset to pending');
    assert.strictEqual(entry.error, null, 'error should be cleared');
    assert.strictEqual(entry.retry_count, 1, 'retry_count should increment for completion-triggered retries');

    // Request should remain integrating, not completed
    const requestAfter = db.getRequest(reqId);
    assert.strictEqual(requestAfter.status, 'integrating');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
  });

  it('onTaskCompleted should create a follow-up task when recoverable merges exhausted retry cap', () => {
    const reqId = db.createRequest('Feature');
    const taskId1 = db.createTask({
      request_id: reqId,
      subject: 'T1',
      description: 'D1',
      domain: 'merge',
      files: ['src/conflicted.js'],
    });
    const taskId2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.updateTask(taskId1, { status: 'completed' });
    db.updateTask(taskId2, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const enqueueResult = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId1,
      pr_url: 'https://github.com/org/repo/pull/307',
      branch: 'agent-1',
    });
    const mergeId = enqueueResult.lastInsertRowid;

    db.updateMerge(mergeId, { status: 'failed', error: 'functional_conflict: build failed after merge' });
    db.getDb().prepare('UPDATE merge_queue SET retry_count = ? WHERE id = ?')
      .run(merger.MAX_MERGE_CONFLICT_RETRIES, mergeId);

    merger.onTaskCompleted(taskId2);

    const entry = db.getDb().prepare('SELECT status, error, retry_count FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'failed');
    assert.ok(entry.error.startsWith('conflict_retries_exhausted:'), 'entry should record retry exhaustion');
    assert.strictEqual(entry.retry_count, merger.MAX_MERGE_CONFLICT_RETRIES);

    const tasks = db.listTasks({ request_id: reqId });
    const followUp = tasks.find((task) => task.subject === `Resolve exhausted merge conflict for merge ${mergeId}`);
    assert.ok(followUp, 'targeted follow-up task should be created');
    assert.strictEqual(followUp.status, 'pending');
    assert.strictEqual(followUp.priority, 'urgent');
    assert.strictEqual(followUp.tier, 2);
    assert.strictEqual(followUp.domain, 'merge');

    const requestAfter = db.getRequest(reqId);
    assert.strictEqual(requestAfter.status, 'integrating');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);

    const mail = db.checkMail('master-2', false).filter((m) => m.type === 'merge_conflict_exhausted');
    assert.strictEqual(mail.length, 1);
    assert.strictEqual(mail[0].payload.follow_up_task_id, followUp.id);
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

describe('Merge cleanup regression: dedup and idempotency', () => {
  it('should not enqueue the same PR URL+branch twice for the same request (prevents false-conflict infinite loop)', () => {
    const reqId = db.createRequest('Feature');
    const taskId1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const taskId2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    const result1 = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId1,
      pr_url: 'https://github.com/org/repo/pull/300',
      branch: 'agent-1',
    });
    assert.strictEqual(result1.inserted, true, 'first enqueue should succeed');

    // Same PR URL + branch for the same request → dedup blocks second insert
    const result2 = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId2,
      pr_url: 'https://github.com/org/repo/pull/300',
      branch: 'agent-1',
    });
    assert.strictEqual(result2.inserted, false, 'duplicate PR URL+branch enqueue must be blocked');

    const entries = db.getDb().prepare('SELECT * FROM merge_queue WHERE request_id = ?').all(reqId);
    assert.strictEqual(entries.length, 1, 'only one merge entry should exist for the same PR URL+branch');
  });

  it('should allow re-enqueue for a different branch on the same PR URL (different logical merge)', () => {
    const reqId = db.createRequest('Feature');
    const taskId1 = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const taskId2 = db.createTask({ request_id: reqId, subject: 'T2', description: 'D2' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId1,
      pr_url: 'https://github.com/org/repo/pull/301',
      branch: 'agent-1',
    });

    // Different branch → should be allowed
    const result2 = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId2,
      pr_url: 'https://github.com/org/repo/pull/302',
      branch: 'agent-2',
    });
    assert.strictEqual(result2.inserted, true, 'different PR URL should be allowed');

    const entries = db.getDb().prepare('SELECT * FROM merge_queue WHERE request_id = ?').all(reqId);
    assert.strictEqual(entries.length, 2, 'two different PR URL+branch pairs should each create an entry');
  });

  it('should not emit duplicate request_completed mail when processQueue is called multiple times after completion', () => {
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.updateTask(taskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/303',
      branch: 'agent-1',
    });

    merger.processQueue(tmpDir, () => ({ success: true }));
    // Spurious second processQueue call should not emit duplicate mail
    merger.processQueue(tmpDir, () => ({ success: true }));

    const mails = db.checkMail('master-1', false)
      .filter((m) => m.type === 'request_completed' && m.payload.request_id === reqId);
    assert.strictEqual(mails.length, 1, 'request_completed must be emitted exactly once');
    assert.strictEqual(getRequestCompletionLogCount(reqId), 1, 'request_completed log entry must appear exactly once');
  });
});

// --- Regression suite: merge conflict prevention system ---

describe('Branch identity: findWorktreePath with task-suffixed branches', () => {
  function setupCleanGitCli() {
    const binDir = path.join(tmpDir, 'mock-bin-identity');
    const commandLog = path.join(tmpDir, 'identity-cli.log');
    fs.mkdirSync(binDir, { recursive: true });

    const gitScript = [
      '#!/usr/bin/env bash',
      'set -eu',
      `echo "git $*" >> "${commandLog}"`,
      'if [ "$1" = "status" ] && [ "${2:-}" = "--porcelain" ]; then',
      '  printf ""',
      '  exit 0',
      'fi',
      'exit 0',
    ].join('\n');
    fs.writeFileSync(path.join(binDir, 'git'), gitScript, { mode: 0o755 });

    process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;
    return { commandLog };
  }

  it('should resolve task-suffixed branch (agent-N-task-*) to worktree via DB', () => {
    const { commandLog } = setupCleanGitCli();
    const fakeWtPath = path.join(tmpDir, '.worktrees', 'wt-1');
    fs.mkdirSync(fakeWtPath, { recursive: true });
    db.registerWorker(1, fakeWtPath, 'agent-1-task-10');

    const reqId = db.createRequest('Task-suffixed branch test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    db.updateTask(taskId, { assigned_to: 1 });

    const entry = {
      id: 1,
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/10',
      branch: 'agent-1-task-10',
      created_at: new Date().toISOString(),
    };

    const result = merger.tryRebase(entry, tmpDir);
    assert.strictEqual(result.success, true, 'tryRebase should succeed for task-suffixed branch via DB path');

    const lines = fs.readFileSync(commandLog, 'utf8').split('\n');
    assert.ok(lines.some((l) => l.includes('rebase origin/main')), 'git rebase should have been called');
  });

  it('should resolve two task branches from the same worker to the same worktree', () => {
    setupCleanGitCli();
    const fakeWtPath = path.join(tmpDir, '.worktrees', 'wt-1');
    fs.mkdirSync(fakeWtPath, { recursive: true });
    db.registerWorker(1, fakeWtPath, 'agent-1');

    const reqId = db.createRequest('Two-task-branch test');
    const taskId10 = db.createTask({ request_id: reqId, subject: 'T10', description: 'D10' });
    const taskId11 = db.createTask({ request_id: reqId, subject: 'T11', description: 'D11' });
    db.updateTask(taskId10, { assigned_to: 1 });
    db.updateTask(taskId11, { assigned_to: 1 });

    const entry10 = {
      id: 1, request_id: reqId, task_id: taskId10,
      pr_url: 'https://github.com/org/repo/pull/10', branch: 'agent-1-task-10',
      created_at: new Date().toISOString(),
    };
    const entry11 = {
      id: 2, request_id: reqId, task_id: taskId11,
      pr_url: 'https://github.com/org/repo/pull/11', branch: 'agent-1-task-11',
      created_at: new Date().toISOString(),
    };

    assert.strictEqual(merger.tryRebase(entry10, tmpDir).success, true, 'agent-1-task-10 should succeed');
    assert.strictEqual(merger.tryRebase(entry11, tmpDir).success, true, 'agent-1-task-11 should succeed');
  });

  it('should fall back to projectDir for task-suffixed branch with no DB assignment', () => {
    setupCleanGitCli();
    const reqId = db.createRequest('No-assignment fallback test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    // Do NOT assign the task to a worker — DB path returns null
    // The fallback regex ^agent-(\d+)$ does NOT match agent-1-task-99
    // So findWorktreePath returns null and rebase falls back to projectDir

    const entry = {
      id: 1, request_id: reqId, task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/99', branch: 'agent-1-task-99',
      created_at: new Date().toISOString(),
    };

    const result = merger.tryRebase(entry, tmpDir);
    assert.strictEqual(result.success, true, 'should fall back to projectDir when no worktree found');
  });
});

describe('DB helpers: merge identity', () => {
  function seedMergeEntry() {
    const reqId = db.createRequest('Identity test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const { lastInsertRowid } = db.enqueueMerge({
      request_id: reqId,
      task_id: taskId,
      pr_url: 'https://github.com/org/repo/pull/50',
      branch: 'agent-1',
    });
    return lastInsertRowid;
  }

  it('should store and retrieve head_sha via updateMergeIdentity / getMergeIdentity', () => {
    const mergeId = seedMergeEntry();
    db.updateMergeIdentity(mergeId, { head_sha: 'abc123def456' });
    const identity = db.getMergeIdentity(mergeId);
    assert.ok(identity, 'getMergeIdentity should return a row');
    assert.strictEqual(identity.head_sha, 'abc123def456');
  });

  it('should store worker_id via updateMergeIdentity', () => {
    const mergeId = seedMergeEntry();
    db.updateMergeIdentity(mergeId, { head_sha: 'sha-abc', worker_id: 3 });
    const identity = db.getMergeIdentity(mergeId);
    assert.strictEqual(identity.worker_id, 3);
    assert.strictEqual(identity.head_sha, 'sha-abc');
  });

  it('should return null from getMergeIdentity for unknown merge id', () => {
    const identity = db.getMergeIdentity(99999);
    assert.strictEqual(identity, null);
  });

  it('should update head_sha when PR head changes (preflight identity update)', () => {
    const mergeId = seedMergeEntry();
    db.updateMergeIdentity(mergeId, { head_sha: 'old-sha' });
    assert.strictEqual(db.getMergeIdentity(mergeId).head_sha, 'old-sha');

    db.updateMergeIdentity(mergeId, { head_sha: 'new-sha' });
    assert.strictEqual(db.getMergeIdentity(mergeId).head_sha, 'new-sha', 'head_sha should reflect updated value');
  });
});

describe('DB helpers: failure classification', () => {
  function seedMergeEntry(prSuffix = 60) {
    const reqId = db.createRequest('Failure class test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const { lastInsertRowid } = db.enqueueMerge({
      request_id: reqId, task_id: taskId,
      pr_url: `https://github.com/org/repo/pull/${prSuffix}`,
      branch: 'agent-1',
    });
    return lastInsertRowid;
  }

  const VALID_CLASSES = [
    'branch_identity_mismatch',
    'worktree_missing',
    'worktree_dirty',
    'remote_branch_missing',
    'remote_diverged',
    'gh_auth_or_network',
    'textual_merge_conflict',
    'validation_conflict',
  ];

  it('should accept all 8 valid failure classes via updateMergeFailureClass', () => {
    for (let i = 0; i < VALID_CLASSES.length; i++) {
      const mergeId = seedMergeEntry(200 + i);
      assert.doesNotThrow(
        () => db.updateMergeFailureClass(mergeId, VALID_CLASSES[i]),
        `${VALID_CLASSES[i]} should be a valid failure class`
      );
      const identity = db.getMergeIdentity(mergeId);
      assert.strictEqual(identity.failure_class, VALID_CLASSES[i]);
    }
  });

  it('should reject an unknown failure class', () => {
    const mergeId = seedMergeEntry(300);
    assert.throws(
      () => db.updateMergeFailureClass(mergeId, 'unknown_class'),
      /Invalid failure_class/,
      'invalid failure class should throw'
    );
  });

  it('should store failure_class via recordFailure', () => {
    const mergeId = seedMergeEntry(301);
    db.recordFailure(mergeId, 'textual_merge_conflict', 'fp-textual-1', 'CONFLICT in file.js');
    const identity = db.getMergeIdentity(mergeId);
    assert.strictEqual(identity.failure_class, 'textual_merge_conflict');
  });

  it('should map CONFLICT error pattern to textual_merge_conflict class (via recordFailure)', () => {
    const mergeId = seedMergeEntry(302);
    db.recordFailure(mergeId, 'textual_merge_conflict', 'fp-conflict-2', 'CONFLICT in src/index.js');
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, 'textual_merge_conflict');
  });

  it('should accept remote_diverged class (force-with-lease rejection pattern)', () => {
    const mergeId = seedMergeEntry(303);
    assert.doesNotThrow(() =>
      db.recordFailure(mergeId, 'remote_diverged', 'fp-diverged-1', 'rejected: remote already advanced')
    );
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, 'remote_diverged');
  });

  it('should accept gh_auth_or_network class (gh auth error pattern)', () => {
    const mergeId = seedMergeEntry(304);
    assert.doesNotThrow(() =>
      db.recordFailure(mergeId, 'gh_auth_or_network', 'fp-auth-1', 'gh: authentication required')
    );
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, 'gh_auth_or_network');
  });

  it('should accept worktree_missing class', () => {
    const mergeId = seedMergeEntry(305);
    assert.doesNotThrow(() =>
      db.recordFailure(mergeId, 'worktree_missing', 'fp-wt-missing-1', 'worktree not found')
    );
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, 'worktree_missing');
  });

  it('should clear failure_class by setting null', () => {
    const mergeId = seedMergeEntry(306);
    db.updateMergeFailureClass(mergeId, 'worktree_dirty');
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, 'worktree_dirty');
    db.updateMergeFailureClass(mergeId, null);
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, null);
  });
});

describe('DB helpers: circuit breaker', () => {
  function seedMergeEntry(prSuffix = 70) {
    const reqId = db.createRequest('Circuit breaker test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const { lastInsertRowid } = db.enqueueMerge({
      request_id: reqId, task_id: taskId,
      pr_url: `https://github.com/org/repo/pull/${prSuffix}`,
      branch: 'agent-1',
    });
    return lastInsertRowid;
  }

  it('should create a circuit breaker entry on first recordFailure call', () => {
    const mergeId = seedMergeEntry(400);
    const result = db.recordFailure(mergeId, 'textual_merge_conflict', 'fp-cb-1', 'CONFLICT');
    assert.strictEqual(result.failure_count, 1);
    assert.strictEqual(result.tripped, false);

    const row = db.getMergeByFingerprint('fp-cb-1');
    assert.ok(row, 'circuit breaker row should exist');
    assert.strictEqual(row.fingerprint, 'fp-cb-1');
    assert.strictEqual(row.failure_count, 1);
    assert.strictEqual(row.tripped, 0);
  });

  it('should increment failure_count on second recordFailure with same fingerprint', () => {
    const mergeId1 = seedMergeEntry(401);
    const mergeId2 = seedMergeEntry(402);

    db.recordFailure(mergeId1, 'textual_merge_conflict', 'fp-cb-2', 'CONFLICT round 1');
    const result2 = db.recordFailure(mergeId2, 'textual_merge_conflict', 'fp-cb-2', 'CONFLICT round 2');

    assert.strictEqual(result2.failure_count, 2, 'same fingerprint should increment failure_count to 2');
  });

  it('should keep different fingerprints independent', () => {
    const mergeId1 = seedMergeEntry(403);
    const mergeId2 = seedMergeEntry(404);

    db.recordFailure(mergeId1, 'remote_diverged', 'fp-cb-3a', 'error A');
    db.recordFailure(mergeId2, 'remote_diverged', 'fp-cb-3b', 'error B');

    assert.strictEqual(db.getMergeByFingerprint('fp-cb-3a').failure_count, 1);
    assert.strictEqual(db.getMergeByFingerprint('fp-cb-3b').failure_count, 1);
  });

  it('should reset failure_count and tripped via resetCircuitBreaker', () => {
    const mergeId1 = seedMergeEntry(405);
    const mergeId2 = seedMergeEntry(406);
    db.recordFailure(mergeId1, 'gh_auth_or_network', 'fp-cb-4', 'auth error 1');
    db.recordFailure(mergeId2, 'gh_auth_or_network', 'fp-cb-4', 'auth error 2');

    const before = db.getMergeByFingerprint('fp-cb-4');
    assert.strictEqual(before.failure_count, 2);

    db.resetCircuitBreaker('fp-cb-4');

    const after = db.getMergeByFingerprint('fp-cb-4');
    assert.strictEqual(after.failure_count, 0);
    assert.strictEqual(after.tripped, 0);
  });

  it('should return null from getMergeByFingerprint for unknown fingerprint', () => {
    const result = db.getMergeByFingerprint('non-existent-fingerprint');
    assert.strictEqual(result, null);
  });

  it('getOrCreateCircuitBreaker should create new entry if not exists', () => {
    const mergeId = seedMergeEntry(407);
    db.enqueueMerge({
      request_id: db.createRequest('CBtest'),
      task_id: db.createTask({ request_id: db.createRequest('CBtest2'), subject: 'T', description: 'D' }),
      pr_url: 'https://github.com/org/repo/pull/408',
      branch: 'agent-2',
    });
    const row = db.getOrCreateCircuitBreaker('fp-new-1');
    assert.ok(row, 'should create a new circuit breaker row');
    assert.strictEqual(row.fingerprint, 'fp-new-1');
    assert.strictEqual(row.failure_count, 1);
    assert.strictEqual(row.tripped, 0);
    void mergeId; // suppress unused warning
  });

  it('getOrCreateCircuitBreaker should return existing entry if fingerprint exists', () => {
    const mergeId = seedMergeEntry(409);
    db.recordFailure(mergeId, 'worktree_missing', 'fp-existing-1', 'worktree gone');
    const first = db.getMergeByFingerprint('fp-existing-1');
    assert.strictEqual(first.failure_count, 1);

    const second = db.getOrCreateCircuitBreaker('fp-existing-1');
    assert.strictEqual(second.failure_count, 1, 'getOrCreateCircuitBreaker should not reset existing entry');
  });

  it('should trip breaker (failure_count = 2) then reset allows retry (changed head SHA)', () => {
    const mergeId1 = seedMergeEntry(410);
    const mergeId2 = seedMergeEntry(411);

    // Simulate two failures with same fingerprint (same error + same PR state)
    db.recordFailure(mergeId1, 'textual_merge_conflict', 'fp-trip-1', 'CONFLICT in file.js');
    const r2 = db.recordFailure(mergeId2, 'textual_merge_conflict', 'fp-trip-1', 'CONFLICT in file.js');
    assert.strictEqual(r2.failure_count, 2, 'breaker should show 2 failures');

    // When PR head SHA changes → new fingerprint → breaker reset not needed
    const mergeId3 = seedMergeEntry(412);
    const r3 = db.recordFailure(mergeId3, 'textual_merge_conflict', 'fp-trip-NEW', 'CONFLICT in file.js');
    assert.strictEqual(r3.failure_count, 1, 'changed fingerprint (new head SHA) should start fresh counter');
  });
});

describe('DB helpers: metrics', () => {
  it('should create metric on first incrementMetric call', () => {
    db.incrementMetric('merges_attempted');
    const metrics = db.getMetrics();
    const found = metrics.find((m) => m.metric_name === 'merges_attempted');
    assert.ok(found, 'metric should be created');
    assert.strictEqual(found.metric_value, 1);
  });

  it('should increment metric value on subsequent calls', () => {
    db.incrementMetric('merges_succeeded');
    db.incrementMetric('merges_succeeded');
    db.incrementMetric('merges_succeeded');
    const metrics = db.getMetrics();
    const found = metrics.find((m) => m.metric_name === 'merges_succeeded');
    assert.ok(found, 'metric should exist');
    assert.strictEqual(found.metric_value, 3);
  });

  it('should track multiple independent metrics', () => {
    db.incrementMetric('metric_a');
    db.incrementMetric('metric_b');
    db.incrementMetric('metric_b');
    const metrics = db.getMetrics();
    const a = metrics.find((m) => m.metric_name === 'metric_a');
    const b = metrics.find((m) => m.metric_name === 'metric_b');
    assert.ok(a && b, 'both metrics should exist');
    assert.strictEqual(a.metric_value, 1);
    assert.strictEqual(b.metric_value, 2);
  });

  it('getMetrics should return empty array when no metrics exist', () => {
    // fresh db from beforeEach — no metrics yet
    const metrics = db.getMetrics();
    assert.ok(Array.isArray(metrics), 'getMetrics should return an array');
    assert.strictEqual(metrics.length, 0);
  });
});

describe('Preflight: identity and self-heal behavior via DB', () => {
  function seedMergeEntry(prSuffix = 80) {
    const reqId = db.createRequest('Preflight test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T1', description: 'D1' });
    const { lastInsertRowid } = db.enqueueMerge({
      request_id: reqId, task_id: taskId,
      pr_url: `https://github.com/org/repo/pull/${prSuffix}`,
      branch: 'agent-1',
    });
    return lastInsertRowid;
  }

  it('should allow updating head_sha when PR head changes (preflight identity refresh)', () => {
    const mergeId = seedMergeEntry(500);
    // Simulate preflight: discovered head_sha does not match stored value
    db.updateMergeIdentity(mergeId, { head_sha: 'stale-sha-aaa' });
    assert.strictEqual(db.getMergeIdentity(mergeId).head_sha, 'stale-sha-aaa');

    // Preflight detects mismatch and updates
    db.updateMergeIdentity(mergeId, { head_sha: 'fresh-sha-bbb' });
    assert.strictEqual(db.getMergeIdentity(mergeId).head_sha, 'fresh-sha-bbb', 'head_sha should be updated');
  });

  it('should store remote_branch_missing failure class for missing remote branch', () => {
    const mergeId = seedMergeEntry(501);
    assert.doesNotThrow(() =>
      db.updateMergeFailureClass(mergeId, 'remote_branch_missing')
    );
    assert.strictEqual(db.getMergeIdentity(mergeId).failure_class, 'remote_branch_missing');
  });

  it('should have no failure_class for a fresh merge entry (all preflight checks pass)', () => {
    const mergeId = seedMergeEntry(502);
    const identity = db.getMergeIdentity(mergeId);
    assert.ok(identity, 'entry should exist');
    assert.strictEqual(identity.failure_class, null, 'fresh entry should have no failure_class');
    assert.strictEqual(identity.retry_count, 0, 'fresh entry should have retry_count = 0');
  });

  it('should increment retry_count via recordFailure', () => {
    const mergeId = seedMergeEntry(503);
    db.recordFailure(mergeId, 'worktree_missing', 'fp-retry-1', 'wt not found');
    const identity = db.getMergeIdentity(mergeId);
    assert.strictEqual(identity.retry_count, 1, 'retry_count should be incremented by recordFailure');
  });
});
