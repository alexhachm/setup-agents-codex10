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
      error: 'merge conflict: cannot be automatically merged',
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

describe('onTaskCompleted conflict recovery', () => {
  it('onTaskCompleted should reset conflict entries to pending and move request to integrating', () => {
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

    db.updateMerge(mergeId, { status: 'conflict', error: 'merge conflict' });

    merger.onTaskCompleted(taskId2);

    const entry = db.getDb().prepare('SELECT status, error FROM merge_queue WHERE id = ?').get(mergeId);
    assert.strictEqual(entry.status, 'pending', 'conflict entry should be reset to pending');
    assert.strictEqual(entry.error, null, 'error should be cleared');

    const requestAfter = db.getRequest(reqId);
    assert.strictEqual(requestAfter.status, 'integrating');
    assert.strictEqual(getRequestCompletionMailCount(reqId), 0);
    assert.strictEqual(getRequestCompletionLogCount(reqId), 0);
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
