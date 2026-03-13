'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const { execFile } = require('child_process');

const db = require('../src/db');
const cliServer = require('../src/cli-server');
const webServer = require('../src/web-server');

let tmpDir;
let server;
let socketPath;
let loopCreatedEvents;

function waitForCliServerReady() {
  return new Promise((resolve) => {
    const check = () => {
      const conn = net.createConnection(socketPath, () => {
        conn.end();
        resolve();
      });
      conn.on('error', () => setTimeout(check, 50));
    };
    setTimeout(check, 50);
  });
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-cli-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
  socketPath = cliServer.getSocketPath(tmpDir);
  loopCreatedEvents = [];
  server = cliServer.start(tmpDir, {
    onTaskCompleted: () => {},
    onLoopCreated: (loopId, prompt) => {
      loopCreatedEvents.push({ loopId, prompt });
    },
  });
  // Wait for server to be listening
  await waitForCliServerReady();
});

afterEach(() => {
  cliServer.stop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function sendCommand(command, args) {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath, () => {
      conn.write(JSON.stringify({ command, args }) + '\n');
    });
    let data = '';
    conn.on('data', (chunk) => {
      data += chunk.toString();
      const idx = data.indexOf('\n');
      if (idx >= 0) {
        resolve(JSON.parse(data.slice(0, idx)));
        conn.end();
      }
    });
    conn.on('error', reject);
    conn.setTimeout(5000, () => { conn.end(); reject(new Error('Timeout')); });
  });
}

function runMac10Command(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(__dirname, '..', 'bin', 'mac10'), ...args],
      {
        cwd,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function requestWebJson(port, reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: reqPath,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : {},
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function runMac10Cli(args) {
  const cliPath = path.join(__dirname, '..', 'bin', 'mac10');
  return new Promise((resolve) => {
    execFile(process.execPath, [cliPath, '--project', tmpDir, ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({
        status: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
        stdout,
        stderr,
      });
    });
  });
}

async function setConfigValue(key, value) {
  const result = await sendCommand('set-config', { key, value: String(value) });
  assert.strictEqual(result.ok, true, `set-config should succeed for ${key}`);
}

function createReadyTask({ subject, description, priority = 'normal', tier = 2 }) {
  const requestId = db.createRequest(`Req: ${subject}`);
  const taskId = db.createTask({ request_id: requestId, subject, description, priority, tier });
  db.checkAndPromoteTasks();
  return taskId;
}

function getAllocatorAssignmentDetails(taskId) {
  const entries = db.getLog(200, 'allocator');
  for (const entry of entries) {
    if (entry.action !== 'task_assigned') continue;
    let details = null;
    try {
      details = JSON.parse(entry.details);
    } catch {
      continue;
    }
    if (details && details.task_id === taskId) return details;
  }
  return null;
}

function getCoordinatorRequestQueuedEvents(requestId) {
  const entries = db.getLog(500, 'coordinator');
  return entries.filter((entry) => {
    if (entry.action !== 'request_queued') return false;
    try {
      const details = JSON.parse(entry.details);
      return details && details.request_id === requestId;
    } catch {
      return false;
    }
  });
}

function getWorkerTaskStartedEvents(workerId, taskId) {
  const entries = db.getLog(200, `worker-${workerId}`);
  const normalizedTaskId = taskId === undefined || taskId === null ? null : String(taskId);
  return entries.filter((entry) => {
    if (entry.action !== 'task_started') return false;
    try {
      const details = JSON.parse(entry.details);
      if (!normalizedTaskId) return true;
      return details && String(details.task_id) === normalizedTaskId;
    } catch {
      return false;
    }
  });
}

function getCoordinatorOwnershipMismatchEvents(command, workerId, taskId) {
  const entries = db.getLog(500, 'coordinator');
  const normalizedWorkerId = workerId === undefined || workerId === null ? null : String(workerId);
  const normalizedTaskId = taskId === undefined || taskId === null ? null : String(taskId);
  return entries.filter((entry) => {
    if (entry.action !== 'ownership_mismatch') return false;
    try {
      const details = JSON.parse(entry.details);
      if (!details || details.command !== command) return false;
      if (normalizedWorkerId && String(details.worker_id) !== normalizedWorkerId) return false;
      if (normalizedTaskId && String(details.task_id) !== normalizedTaskId) return false;
      return true;
    } catch {
      return false;
    }
  });
}

function getCoordinatorRemediationRecoveryEvents(requestId, trigger = null) {
  const entries = db.getLog(500, 'coordinator');
  return entries
    .filter((entry) => entry.action === 'request_reopened_for_active_remediation')
    .map((entry) => {
      try {
        return { entry, details: JSON.parse(entry.details) };
      } catch {
        return null;
      }
    })
    .filter((item) => item && item.details && item.details.request_id === requestId)
    .filter((item) => !trigger || item.details.trigger === trigger);
}

describe('CLI Server', () => {
  it('should respond to ping', async () => {
    const result = await sendCommand('ping', {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.ts);
  });

  it('should create a request', async () => {
    const result = await sendCommand('request', { description: 'Add login page' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.request_id.startsWith('req-'));

    const req = db.getRequest(result.request_id);
    assert.strictEqual(req.description, 'Add login page');
    assert.strictEqual(req.status, 'pending');
  });

  it('should emit a single architect new_request mail and one request_queued event for request creation', async () => {
    const result = await sendCommand('request', { description: 'Single architect notification' });
    assert.strictEqual(result.ok, true);

    const architectMessages = db.checkMail('architect', false)
      .filter((message) => message.payload && message.payload.request_id === result.request_id);
    assert.strictEqual(architectMessages.length, 1);
    assert.strictEqual(architectMessages[0].type, 'new_request');

    const queuedEvents = getCoordinatorRequestQueuedEvents(result.request_id);
    assert.strictEqual(queuedEvents.length, 1);
  });

  it('should create an urgent fix', async () => {
    const result = await sendCommand('fix', { description: 'Login broken' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.request_id);
    assert.ok(result.task_id);

    const task = db.getTask(result.task_id);
    assert.strictEqual(task.priority, 'urgent');
    assert.strictEqual(task.status, 'ready');
  });

  it('should return status', async () => {
    db.createRequest('Req 1');
    db.registerWorker(1, '/wt-1', 'agent-1');

    const result = await sendCommand('status', {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.requests.length >= 1);
    assert.strictEqual(result.workers.length, 1);
  });

  it('should keep status request rows single-line and preserve clean descriptions', async () => {
    const clean = await sendCommand('request', { description: 'Clean status description for readability' });
    assert.strictEqual(clean.ok, true);
    const malicious = await sendCommand('request', {
      description: 'Malicious prefix\n  req-evil [completed] T9 injected\tcolumn\rreturn\u0007bell',
    });
    assert.strictEqual(malicious.ok, true);

    const result = await runMac10Cli(['status']);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stderr, '');

    const lines = result.stdout.split(/\r?\n/);
    const requestsStart = lines.indexOf('=== Requests ===');
    const workersStart = lines.indexOf('=== Workers ===');
    assert.ok(requestsStart >= 0);
    assert.ok(workersStart > requestsStart);

    const requestRows = lines
      .slice(requestsStart + 1, workersStart)
      .filter((line) => line.startsWith('  req-'));
    assert.strictEqual(requestRows.length, 2);

    const cleanRow = requestRows.find((line) => line.includes(clean.request_id));
    const maliciousRow = requestRows.find((line) => line.includes(malicious.request_id));
    assert.ok(cleanRow);
    assert.ok(maliciousRow);
    assert.match(cleanRow, /Clean status description for readability/);
    assert.ok(!maliciousRow.includes('\t'));
    assert.ok(!maliciousRow.includes('\r'));
    assert.match(maliciousRow, /req-evil \[completed\] T9 injected/);
    assert.ok(!result.stdout.includes('\n  req-evil [completed] T9 injected\tcolumn\rreturn'));
  });

  it('should handle triage', async () => {
    const reqResult = await sendCommand('request', { description: 'Fix typo' });
    const result = await sendCommand('triage', {
      request_id: reqResult.request_id,
      tier: 1,
      reasoning: 'Simple fix',
    });
    assert.strictEqual(result.ok, true);

    const req = db.getRequest(reqResult.request_id);
    assert.strictEqual(req.tier, 1);
    assert.strictEqual(req.status, 'executing_tier1');
  });

  it('should create tasks', async () => {
    const reqResult = await sendCommand('request', { description: 'Feature' });
    const result = await sendCommand('create-task', {
      request_id: reqResult.request_id,
      subject: 'Add endpoint',
      description: 'Create POST /api/items',
      domain: 'backend',
      tier: 2,
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.task_id);

    const task = db.getTask(result.task_id);
    assert.strictEqual(task.status, 'ready'); // no deps → auto-ready
  });

  it('should handle worker task lifecycle', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Work', description: 'Do it' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });

    // Get task
    let result = await sendCommand('my-task', { worker_id: '1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.task.id, taskId);

    // Start task
    result = await sendCommand('start-task', { worker_id: '1', task_id: String(taskId) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(db.getTask(taskId).status, 'in_progress');

    // Heartbeat
    result = await sendCommand('heartbeat', { worker_id: '1' });
    assert.strictEqual(result.ok, true);

    // Complete task
    result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      pr_url: 'https://github.com/org/repo/pull/42',
      branch: 'agent-1',
      result: 'Added the endpoint',
    });
    assert.strictEqual(result.ok, true);
    const completedTask = db.getTask(taskId);
    assert.strictEqual(completedTask.status, 'completed');
    assert.strictEqual(completedTask.usage_model, null);
    assert.strictEqual(completedTask.usage_input_tokens, null);
    assert.strictEqual(completedTask.usage_output_tokens, null);
    assert.strictEqual(completedTask.usage_cached_tokens, null);
    assert.strictEqual(completedTask.usage_cache_creation_tokens, null);
    assert.strictEqual(completedTask.usage_total_tokens, null);
    assert.strictEqual(completedTask.usage_cost_usd, null);
    assert.strictEqual(db.getWorker(1).status, 'completed_task');
  });

  it('should reject start-task for completed tasks', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Completed task replay');
    const taskId = db.createTask({ request_id: reqId, subject: 'Already done', description: 'Do not reopen' });
    const completedAt = '2026-01-01T00:00:00.000Z';
    db.updateTask(taskId, {
      status: 'completed',
      assigned_to: 1,
      completed_at: completedAt,
      result: 'already done',
    });
    db.updateWorker(1, { status: 'completed_task', current_task_id: taskId });

    const result = await sendCommand('start-task', { worker_id: '1', task_id: String(taskId) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'task_not_startable');

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'completed');
    assert.strictEqual(task.completed_at, completedAt);
    assert.strictEqual(task.result, 'already done');
    assert.strictEqual(getWorkerTaskStartedEvents(1, taskId).length, 0);
  });

  it('should reject start-task when task is assigned to another worker', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Ownership guard');
    const taskId = db.createTask({ request_id: reqId, subject: 'Owned by worker 2', description: 'Do not steal' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 2 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: taskId });

    const result = await sendCommand('start-task', { worker_id: '1', task_id: String(taskId) });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'ownership_mismatch');
    assert.strictEqual(result.reason, 'task_assignment_mismatch');

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'assigned');
    assert.strictEqual(task.started_at, null);
    assert.strictEqual(db.getWorker(1).current_task_id, taskId);
    assert.strictEqual(db.getWorker(2).current_task_id, taskId);
    assert.strictEqual(getWorkerTaskStartedEvents(1, taskId).length, 0);
    assert.strictEqual(getCoordinatorOwnershipMismatchEvents('start-task', 1, taskId).length, 1);
  });

  it('should treat duplicate start-task calls on owned in-progress task as idempotent', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Duplicate starts');
    const taskId = db.createTask({ request_id: reqId, subject: 'Repeat start', description: 'Idempotent expected' });
    const completedAt = '2026-01-01T00:00:00.000Z';
    const resultText = 'keep existing completion fields';
    db.updateTask(taskId, {
      status: 'assigned',
      assigned_to: 1,
      completed_at: completedAt,
      result: resultText,
    });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });

    const first = await sendCommand('start-task', { worker_id: '1', task_id: String(taskId) });
    assert.strictEqual(first.ok, true);
    const afterFirst = db.getTask(taskId);
    assert.strictEqual(afterFirst.status, 'in_progress');
    assert.ok(afterFirst.started_at);
    assert.strictEqual(afterFirst.completed_at, completedAt);
    assert.strictEqual(afterFirst.result, resultText);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await sendCommand('start-task', { worker_id: '1', task_id: String(taskId) });
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.idempotent, true);

    const afterSecond = db.getTask(taskId);
    assert.strictEqual(afterSecond.status, 'in_progress');
    assert.strictEqual(afterSecond.started_at, afterFirst.started_at);
    assert.strictEqual(afterSecond.completed_at, completedAt);
    assert.strictEqual(afterSecond.result, resultText);
    assert.strictEqual(getWorkerTaskStartedEvents(1, taskId).length, 1);
  });

  it('should reopen failed requests to integrating when start-task begins remediation with merge queue history', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const requestId = db.createRequest('Start-task remediation reopen');

    const originalTaskId = db.createTask({
      request_id: requestId,
      subject: 'Original implementation',
      description: 'Previously failed merge',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js'],
      tier: 2,
    });
    db.updateTask(originalTaskId, { status: 'completed' });

    const mergeRow = db.enqueueMerge({
      request_id: requestId,
      task_id: originalTaskId,
      pr_url: 'https://example.com/pr/9001',
      branch: 'agent-1/original',
      priority: 0,
    });
    db.updateMerge(mergeRow.lastInsertRowid, { status: 'failed', error: 'merge failed' });

    const remediationTaskId = db.createTask({
      request_id: requestId,
      subject: 'Remediate merge failure',
      description: 'Fix merge issue',
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js'],
      tier: 2,
    });
    db.updateTask(remediationTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: remediationTaskId });
    db.updateRequest(requestId, { status: 'failed', result: 'merge failure' });

    const started = await sendCommand('start-task', { worker_id: '1', task_id: String(remediationTaskId) });
    assert.strictEqual(started.ok, true);
    assert.strictEqual(db.getTask(remediationTaskId).status, 'in_progress');

    const request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'integrating');
    assert.notStrictEqual(request.status, 'failed');

    const recoveryEvents = getCoordinatorRemediationRecoveryEvents(requestId, 'start-task');
    assert.strictEqual(recoveryEvents.length, 1);
    assert.strictEqual(recoveryEvents[0].details.reopened_status, 'integrating');
    assert.ok(recoveryEvents[0].details.merge_queue_entries >= 1);
  });

  it('should persist complete-task usage telemetry fields end-to-end', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Feature with usage');
    const taskId = db.createTask({ request_id: reqId, subject: 'Work', description: 'Do it with usage' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });

    const usage = {
      model: '  gpt-5-codex  ',
      input_tokens: 1200,
      output_tokens: 345,
      cached_tokens: 67,
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };

    const result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      pr_url: 'https://github.com/org/repo/pull/43',
      branch: 'agent-1',
      result: 'Added usage telemetry',
      usage,
    });
    assert.strictEqual(result.ok, true);

    const completedTask = db.getTask(taskId);
    assert.strictEqual(completedTask.status, 'completed');
    assert.strictEqual(completedTask.usage_model, 'gpt-5-codex');
    assert.strictEqual(completedTask.usage_input_tokens, usage.input_tokens);
    assert.strictEqual(completedTask.usage_output_tokens, usage.output_tokens);
    assert.strictEqual(completedTask.usage_cached_tokens, usage.cached_tokens);
    assert.strictEqual(completedTask.usage_cache_creation_tokens, usage.cache_creation_tokens);
    assert.strictEqual(completedTask.usage_total_tokens, usage.total_tokens);
    assert.strictEqual(completedTask.usage_cost_usd, usage.cost_usd);

    const completedWorker = db.getWorker(1);
    assert.strictEqual(completedWorker.status, 'completed_task');
    assert.strictEqual(completedWorker.tasks_completed, 1);
  });

  it('should reject complete-task when task is assigned to another worker and preserve ownership state', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Complete-task ownership guard');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task ownership', description: 'Worker 2 owns this task' });
    const startedAt = '2026-01-01T10:00:00.000Z';
    db.updateTask(taskId, {
      status: 'in_progress',
      assigned_to: 2,
      started_at: startedAt,
      branch: null,
      pr_url: null,
      result: null,
      completed_at: null,
    });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId, tasks_completed: 0 });
    db.updateWorker(2, { status: 'busy', current_task_id: taskId, tasks_completed: 3 });

    const result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      pr_url: 'https://github.com/org/repo/pull/99',
      branch: 'agent-1',
      result: 'Attempted takeover',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'ownership_mismatch');
    assert.strictEqual(result.reason, 'task_assignment_mismatch');

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'in_progress');
    assert.strictEqual(task.assigned_to, 2);
    assert.strictEqual(task.started_at, startedAt);
    assert.strictEqual(task.pr_url, null);
    assert.strictEqual(task.branch, null);
    assert.strictEqual(task.completed_at, null);
    assert.strictEqual(task.result, null);

    const workerOne = db.getWorker(1);
    assert.strictEqual(workerOne.status, 'busy');
    assert.strictEqual(workerOne.current_task_id, taskId);
    assert.strictEqual(workerOne.tasks_completed, 0);

    const workerTwo = db.getWorker(2);
    assert.strictEqual(workerTwo.status, 'busy');
    assert.strictEqual(workerTwo.current_task_id, taskId);
    assert.strictEqual(workerTwo.tasks_completed, 3);

    assert.strictEqual(getCoordinatorOwnershipMismatchEvents('complete-task', 1, taskId).length, 1);
  });

  it('should reject fail-task when task is assigned to another worker and preserve ownership state', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Fail-task ownership guard');
    const taskId = db.createTask({ request_id: reqId, subject: 'Task ownership', description: 'Worker 2 owns this task' });
    const startedAt = '2026-01-01T11:00:00.000Z';
    db.updateTask(taskId, {
      status: 'in_progress',
      assigned_to: 2,
      started_at: startedAt,
      result: null,
      completed_at: null,
    });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId });
    db.updateWorker(2, { status: 'busy', current_task_id: taskId });

    const result = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(taskId),
      error: 'Attempted unauthorized failure',
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'ownership_mismatch');
    assert.strictEqual(result.reason, 'task_assignment_mismatch');

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'in_progress');
    assert.strictEqual(task.assigned_to, 2);
    assert.strictEqual(task.started_at, startedAt);
    assert.strictEqual(task.completed_at, null);
    assert.strictEqual(task.result, null);

    const workerOne = db.getWorker(1);
    assert.strictEqual(workerOne.status, 'busy');
    assert.strictEqual(workerOne.current_task_id, taskId);
    const workerTwo = db.getWorker(2);
    assert.strictEqual(workerTwo.status, 'busy');
    assert.strictEqual(workerTwo.current_task_id, taskId);

    assert.strictEqual(getCoordinatorOwnershipMismatchEvents('fail-task', 1, taskId).length, 1);
  });

  it('should persist identical usage values for canonical, Anthropic alias, and OpenAI alias complete-task payloads', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');
    const reqId = db.createRequest('Usage aliases');
    const canonicalTaskId = db.createTask({ request_id: reqId, subject: 'Canonical', description: 'Canonical usage payload' });
    const anthropicAliasTaskId = db.createTask({ request_id: reqId, subject: 'Anthropic alias', description: 'Anthropic usage payload' });
    const openAiAliasTaskId = db.createTask({ request_id: reqId, subject: 'OpenAI alias', description: 'OpenAI usage payload' });
    db.updateTask(canonicalTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(anthropicAliasTaskId, { status: 'assigned', assigned_to: 2 });
    db.updateTask(openAiAliasTaskId, { status: 'assigned', assigned_to: 3 });
    db.updateWorker(1, { status: 'assigned', current_task_id: canonicalTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: anthropicAliasTaskId });
    db.updateWorker(3, { status: 'assigned', current_task_id: openAiAliasTaskId });

    const canonicalUsage = {
      model: 'gpt-5-codex',
      input_tokens: 1200,
      output_tokens: 345,
      cached_tokens: 67,
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };
    const anthropicAliasUsage = {
      model: 'gpt-5-codex',
      input_tokens: 1200,
      output_tokens: 345,
      cache_read_input_tokens: 67,
      cache_creation_input_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };
    const openAiAliasUsage = {
      model: 'gpt-5-codex',
      prompt_tokens: 1200,
      completion_tokens: 345,
      input_tokens_details: { cached_tokens: 67 },
      prompt_tokens_details: { cached_tokens: 67 },
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };

    const apiResult = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(canonicalTaskId),
      result: 'Canonical completion',
      usage: canonicalUsage,
    });
    assert.strictEqual(apiResult.ok, true);

    const anthropicResult = await sendCommand('complete-task', {
      worker_id: '2',
      task_id: String(anthropicAliasTaskId),
      result: 'Anthropic completion',
      usage: anthropicAliasUsage,
    });
    assert.strictEqual(anthropicResult.ok, true);

    await runMac10Command([
      'complete-task',
      '3',
      String(openAiAliasTaskId),
      'OpenAI completion',
      '--usage',
      JSON.stringify(openAiAliasUsage),
    ], tmpDir);

    const canonicalTask = db.getTask(canonicalTaskId);
    const anthropicAliasTask = db.getTask(anthropicAliasTaskId);
    const openAiAliasTask = db.getTask(openAiAliasTaskId);
    assert.strictEqual(canonicalTask.status, 'completed');
    assert.strictEqual(anthropicAliasTask.status, 'completed');
    assert.strictEqual(openAiAliasTask.status, 'completed');

    const comparableUsageFields = [
      'usage_model',
      'usage_input_tokens',
      'usage_output_tokens',
      'usage_cached_tokens',
      'usage_cache_creation_tokens',
      'usage_total_tokens',
      'usage_cost_usd',
    ];
    for (const field of comparableUsageFields) {
      assert.strictEqual(anthropicAliasTask[field], canonicalTask[field], `${field} mismatch (anthropic)`);
      assert.strictEqual(openAiAliasTask[field], canonicalTask[field], `${field} mismatch (openai)`);
    }
  });

  it('should reject unknown complete-task usage keys even when alias keys are present', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Usage unknown key rejection');
    const taskId = db.createTask({ request_id: reqId, subject: 'Unknown key', description: 'Should reject unknown usage key' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });

    const result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      usage: {
        cache_creation_input_tokens: 45,
        cache_read_input_tokens: 67,
        bogus_field: 1,
      },
    });
    assert.ok(result.error);
    assert.match(result.error, /unsupported keys: bogus_field/);
    assert.strictEqual(db.getTask(taskId).status, 'assigned');
  });

  it('should reject conflicting duplicate aliases deterministically for complete-task usage', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Usage conflict rejection');
    const serverTaskId = db.createTask({ request_id: reqId, subject: 'Server conflict', description: 'Conflicting API alias values' });
    const cliTaskId = db.createTask({ request_id: reqId, subject: 'CLI conflict', description: 'Conflicting CLI alias values' });
    db.updateTask(serverTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(cliTaskId, { status: 'assigned', assigned_to: 2 });
    db.updateWorker(1, { status: 'assigned', current_task_id: serverTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: cliTaskId });

    const serverResult = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(serverTaskId),
      usage: {
        input_tokens: 1200,
        prompt_tokens: 1201,
      },
    });
    assert.ok(serverResult.error);
    assert.match(serverResult.error, /conflicting values for key "input_tokens"/);
    assert.strictEqual(db.getTask(serverTaskId).status, 'assigned');

    await assert.rejects(
      () => runMac10Command([
        'complete-task',
        '2',
        String(cliTaskId),
        'CLI conflict completion',
        '--usage',
        JSON.stringify({
          cached_tokens: 67,
          prompt_tokens_details: { cached_tokens: 68 },
        }),
      ], tmpDir),
      (err) => {
        assert.match(String(err && err.stderr), /conflicting values for "cached_tokens"/);
        return true;
      }
    );
    assert.strictEqual(db.getTask(cliTaskId).status, 'assigned');
  });

  it('should reject complete-task when a PR URL is already owned by another request', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    const requestA = db.createRequest('Request A');
    const taskA = db.createTask({ request_id: requestA, subject: 'Task A', description: 'Do A' });
    const requestB = db.createRequest('Request B');
    const taskB = db.createTask({ request_id: requestB, subject: 'Task B', description: 'Do B' });

    db.updateTask(taskA, { status: 'assigned', assigned_to: 1 });
    db.updateTask(taskB, { status: 'assigned', assigned_to: 2 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskA });
    db.updateWorker(2, { status: 'assigned', current_task_id: taskB });

    const first = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskA),
      pr_url: 'https://github.com/org/repo/pull/42',
      branch: 'agent-1',
      result: 'Task A done',
    });
    assert.strictEqual(first.ok, true);

    const second = await sendCommand('complete-task', {
      worker_id: '2',
      task_id: String(taskB),
      pr_url: 'https://github.com/org/repo/pull/42',
      branch: 'agent-2',
      result: 'Task B done',
    });
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.error, 'merge_queue_rejected');
    assert.strictEqual(second.reason, 'duplicate_pr_owned_by_other_request');

    const failedTask = db.getTask(taskB);
    assert.strictEqual(failedTask.status, 'failed');
    assert.match(failedTask.result, /duplicate_pr_owned_by_other_request/);
    assert.strictEqual(db.getWorker(2).status, 'idle');
    assert.strictEqual(db.getWorker(2).tasks_completed, 0);
    assert.notStrictEqual(db.getRequest(requestB).status, 'completed');

    const rows = db.getDb().prepare(`
      SELECT request_id, task_id
      FROM merge_queue
      WHERE pr_url = ?
      ORDER BY id ASC
    `).all('https://github.com/org/repo/pull/42');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].request_id, requestA);
    assert.strictEqual(rows[0].task_id, taskA);
  });

  it('should fail integrate when completed tasks reuse a PR URL owned by another request', async () => {
    const requestA = db.createRequest('Request A');
    const taskA = db.createTask({ request_id: requestA, subject: 'Task A', description: 'Do A' });
    db.updateTask(taskA, {
      status: 'completed',
      pr_url: 'https://github.com/org/repo/pull/77',
      branch: 'agent-1',
      completed_at: new Date().toISOString(),
    });

    const queueFirst = await sendCommand('integrate', { request_id: requestA });
    assert.strictEqual(queueFirst.ok, true);
    assert.strictEqual(queueFirst.merges_queued, 1);

    const requestB = db.createRequest('Request B');
    const taskB = db.createTask({ request_id: requestB, subject: 'Task B', description: 'Do B' });
    db.updateTask(taskB, {
      status: 'completed',
      pr_url: 'https://github.com/org/repo/pull/77',
      branch: 'agent-2',
      completed_at: new Date().toISOString(),
    });

    const integrateSecond = await sendCommand('integrate', { request_id: requestB });
    assert.strictEqual(integrateSecond.ok, false);
    assert.strictEqual(integrateSecond.error, 'merge_queue_rejected');
    assert.strictEqual(integrateSecond.failures.length, 1);
    assert.strictEqual(integrateSecond.failures[0].reason, 'duplicate_pr_owned_by_other_request');

    const failedTask = db.getTask(taskB);
    assert.strictEqual(failedTask.status, 'failed');
    assert.match(failedTask.result, /duplicate_pr_owned_by_other_request/);
    assert.notStrictEqual(db.getRequest(requestB).status, 'completed');

    const rows = db.getDb().prepare(`
      SELECT request_id, task_id
      FROM merge_queue
      WHERE pr_url = ?
      ORDER BY id ASC
    `).all('https://github.com/org/repo/pull/77');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].request_id, requestA);
    assert.strictEqual(rows[0].task_id, taskA);
  });

  it('should block integrate when a request has mixed completed and failed tasks', async () => {
    const requestId = db.createRequest('Mixed outcomes');
    const taskCompleted = db.createTask({ request_id: requestId, subject: 'Task A', description: 'Done' });
    const taskFailed = db.createTask({ request_id: requestId, subject: 'Task B', description: 'Failed' });
    const timestamp = new Date().toISOString();

    db.updateTask(taskCompleted, {
      status: 'completed',
      pr_url: 'https://github.com/org/repo/pull/201',
      branch: 'agent-1',
      completed_at: timestamp,
    });
    db.updateTask(taskFailed, {
      status: 'failed',
      result: 'test failure',
      completed_at: timestamp,
    });

    const completion = await sendCommand('check-completion', { request_id: requestId });
    assert.strictEqual(completion.ok, true);
    assert.strictEqual(completion.total, 2);
    assert.strictEqual(completion.completed, 1);
    assert.strictEqual(completion.failed, 1);
    assert.strictEqual(completion.all_completed, false);
    assert.strictEqual(completion.all_done, false);

    const integrate = await sendCommand('integrate', { request_id: requestId });
    assert.strictEqual(integrate.ok, false);
    assert.strictEqual(integrate.error, 'Request has failed tasks');
    assert.strictEqual(integrate.total, 2);
    assert.strictEqual(integrate.completed, 1);
    assert.strictEqual(integrate.failed, 1);
    assert.strictEqual(integrate.all_completed, false);
    assert.strictEqual(integrate.all_done, false);

    const queued = db.getDb().prepare('SELECT COUNT(*) as count FROM merge_queue WHERE request_id = ?').get(requestId);
    assert.strictEqual(queued.count, 0);
  });

  it('should integrate when all request tasks are completed with no failures', async () => {
    const requestId = db.createRequest('All completed');
    const taskA = db.createTask({ request_id: requestId, subject: 'Task A', description: 'Done A' });
    const taskB = db.createTask({ request_id: requestId, subject: 'Task B', description: 'Done B' });
    const timestamp = new Date().toISOString();

    db.updateTask(taskA, {
      status: 'completed',
      pr_url: 'https://github.com/org/repo/pull/301',
      branch: 'agent-1',
      completed_at: timestamp,
    });
    db.updateTask(taskB, {
      status: 'completed',
      pr_url: 'https://github.com/org/repo/pull/302',
      branch: 'agent-2',
      completed_at: timestamp,
    });

    const completion = await sendCommand('check-completion', { request_id: requestId });
    assert.strictEqual(completion.ok, true);
    assert.strictEqual(completion.total, 2);
    assert.strictEqual(completion.completed, 2);
    assert.strictEqual(completion.failed, 0);
    assert.strictEqual(completion.all_completed, true);
    assert.strictEqual(completion.all_done, true);

    const integrate = await sendCommand('integrate', { request_id: requestId });
    assert.strictEqual(integrate.ok, true);
    assert.strictEqual(integrate.request_id, requestId);
    assert.strictEqual(integrate.merges_queued, 2);

    const queuedRows = db.getDb().prepare(`
      SELECT task_id
      FROM merge_queue
      WHERE request_id = ?
      ORDER BY task_id ASC
    `).all(requestId);
    assert.strictEqual(queuedRows.length, 2);
    assert.deepStrictEqual(queuedRows.map((row) => row.task_id), [taskA, taskB].sort((a, b) => a - b));
  });

  it('should handle inbox', async () => {
    db.sendMail('architect', 'test_msg', { data: 'hello' });

    const result = await sendCommand('inbox', { recipient: 'architect' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.messages.length, 1);
    assert.strictEqual(result.messages[0].type, 'test_msg');
  });

  it('should repair stuck state', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    // Simulate stuck worker (stale heartbeat)
    db.updateWorker(1, {
      status: 'busy',
      last_heartbeat: new Date(Date.now() - 300000).toISOString(), // 5 min ago
    });

    const result = await sendCommand('repair', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reset_workers, 1);
    assert.strictEqual(db.getWorker(1).status, 'idle');
  });

  it('should return error for unknown commands', async () => {
    const result = await sendCommand('nonexistent', {});
    assert.ok(result.error);
  });

  it('should create loop and invoke onLoopCreated hook', async () => {
    const prompt = 'Run autonomous product-improvement loop until stopped';
    const result = await sendCommand('loop', { prompt });
    assert.strictEqual(result.ok, true);
    assert.ok(result.loop_id);

    const loop = db.getLoop(result.loop_id);
    assert.ok(loop);
    assert.strictEqual(loop.prompt, prompt);
    assert.strictEqual(loop.status, 'active');

    assert.strictEqual(loopCreatedEvents.length, 1);
    assert.strictEqual(loopCreatedEvents[0].loopId, result.loop_id);
    assert.strictEqual(loopCreatedEvents[0].prompt, prompt);
  });

  it('should stop an active loop', async () => {
    const created = await sendCommand('loop', { prompt: 'Autonomous test loop' });
    assert.strictEqual(created.ok, true);

    const stopped = await sendCommand('stop-loop', { loop_id: created.loop_id });
    assert.strictEqual(stopped.ok, true);
    assert.strictEqual(stopped.loop_id, created.loop_id);

    const loop = db.getLoop(created.loop_id);
    assert.ok(loop);
    assert.strictEqual(loop.status, 'stopped');
  });

  it('should emit a single architect new_request mail and one request_queued event for loop-request creation', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'Create loop request once' });
    assert.strictEqual(createdLoop.ok, true);

    const loopRequest = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Loop request notification dedupe',
    });
    assert.strictEqual(loopRequest.ok, true);
    assert.strictEqual(loopRequest.deduplicated, false);

    const architectMessages = db.checkMail('architect', false)
      .filter((message) => message.payload && message.payload.request_id === loopRequest.request_id);
    assert.strictEqual(architectMessages.length, 1);
    assert.strictEqual(architectMessages[0].type, 'new_request');

    const queuedEvents = getCoordinatorRequestQueuedEvents(loopRequest.request_id);
    assert.strictEqual(queuedEvents.length, 1);
  });

  it('should keep loop-requests rows single-line with control-char descriptions', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'Loop request row sanitization' });
    assert.strictEqual(createdLoop.ok, true);

    const clean = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Clean loop request summary',
    });
    assert.strictEqual(clean.ok, true);

    const malicious = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Malicious loop row\n  999 [failed] T9 injected\tcol\rret\u0001ctrl',
    });
    assert.strictEqual(malicious.ok, true);

    const result = await runMac10Cli(['loop-requests', String(createdLoop.loop_id)]);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stderr, '');

    const rows = result.stdout
      .split(/\r?\n/)
      .filter((line) => line.startsWith('  '));
    assert.strictEqual(rows.length, 2);

    const cleanRow = rows.find((line) => line.includes(String(clean.request_id)));
    const maliciousRow = rows.find((line) => line.includes(String(malicious.request_id)));
    assert.ok(cleanRow);
    assert.ok(maliciousRow);
    assert.match(cleanRow, /Clean loop request summary/);
    assert.match(maliciousRow, /999 \[failed\] T9 injected/);
    assert.ok(!maliciousRow.includes('\t'));
    assert.ok(!maliciousRow.includes('\r'));
    assert.ok(!result.stdout.includes('\n  999 [failed] T9 injected\tcol\rret'));
  });

  it('should label default fallback assignments as fallback-default in response and logs', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    const highTaskId = createReadyTask({
      subject: 'Complex migration',
      description: 'Deep refactor across modules',
      priority: 'high',
      tier: 3,
    });
    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });

    const highAssignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(highAssignment.ok, true);
    assert.strictEqual(highAssignment.routing.model_source, 'fallback-default');

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 2 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model_source, 'fallback-default');

    const highAssignmentLog = getAllocatorAssignmentDetails(highTaskId);
    assert.ok(highAssignmentLog);
    assert.strictEqual(highAssignmentLog.model_source, 'fallback-default');

    const sparkAssignmentLog = getAllocatorAssignmentDetails(sparkTaskId);
    assert.ok(sparkAssignmentLog);
    assert.strictEqual(sparkAssignmentLog.model_source, 'fallback-default');
  });

  it('should persist routing telemetry fields on the task row after assignment', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const taskId = createReadyTask({
      subject: 'Complex migration',
      description: 'Deep refactor across modules',
      priority: 'high',
      tier: 3,
    });

    const assignment = await sendCommand('assign-task', { task_id: taskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);

    const task = db.getTask(taskId);
    assert.ok(task);
    assert.ok(task.routing_class);
    assert.ok(task.routed_model);
    assert.ok(task.model_source);
    assert.ok(task.reasoning_effort);
    assert.strictEqual(task.routing_class, assignment.routing.class);
    assert.strictEqual(task.routed_model, assignment.routing.model);
    assert.strictEqual(task.model_source, assignment.routing.model_source);
    assert.strictEqual(task.reasoning_effort, assignment.routing.reasoning_effort);
  });

  it('should reopen failed requests during assign-task based on merge queue presence', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    const requestWithoutMerge = db.createRequest('Assign remediation without merge queue');
    const noMergeTaskId = db.createTask({
      request_id: requestWithoutMerge,
      subject: 'Remediate without merge queue',
      description: 'Retry work',
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js'],
      tier: 2,
    });
    db.updateTask(noMergeTaskId, { status: 'ready' });
    db.updateRequest(requestWithoutMerge, { status: 'failed', result: 'previous failure' });

    const noMergeAssign = await sendCommand('assign-task', { task_id: noMergeTaskId, worker_id: 1 });
    assert.strictEqual(noMergeAssign.ok, true);
    assert.strictEqual(db.getRequest(requestWithoutMerge).status, 'in_progress');

    const noMergeRecoveryEvents = getCoordinatorRemediationRecoveryEvents(requestWithoutMerge, 'assign-task');
    assert.strictEqual(noMergeRecoveryEvents.length, 1);
    assert.strictEqual(noMergeRecoveryEvents[0].details.reopened_status, 'in_progress');
    assert.strictEqual(noMergeRecoveryEvents[0].details.merge_queue_entries, 0);

    const requestWithMerge = db.createRequest('Assign remediation with merge queue');
    const originalTaskId = db.createTask({
      request_id: requestWithMerge,
      subject: 'Original implementation',
      description: 'Has merge history',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js'],
      tier: 2,
    });
    db.updateTask(originalTaskId, { status: 'completed' });
    const mergeRow = db.enqueueMerge({
      request_id: requestWithMerge,
      task_id: originalTaskId,
      pr_url: 'https://example.com/pr/9002',
      branch: 'agent-2/original',
      priority: 0,
    });
    db.updateMerge(mergeRow.lastInsertRowid, { status: 'failed', error: 'merge failed' });

    const remediationTaskId = db.createTask({
      request_id: requestWithMerge,
      subject: 'Remediation task',
      description: 'Fix failed merge',
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js'],
      tier: 2,
    });
    db.updateTask(remediationTaskId, { status: 'ready' });
    db.updateRequest(requestWithMerge, { status: 'failed', result: 'previous merge failure' });

    const withMergeAssign = await sendCommand('assign-task', { task_id: remediationTaskId, worker_id: 2 });
    assert.strictEqual(withMergeAssign.ok, true);
    assert.strictEqual(db.getRequest(requestWithMerge).status, 'integrating');

    const withMergeRecoveryEvents = getCoordinatorRemediationRecoveryEvents(requestWithMerge, 'assign-task');
    assert.strictEqual(withMergeRecoveryEvents.length, 1);
    assert.strictEqual(withMergeRecoveryEvents[0].details.reopened_status, 'integrating');
    assert.ok(withMergeRecoveryEvents[0].details.merge_queue_entries >= 1);
  });

  it('should rollback model_source and assignment state when assign-task spawn fails', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const taskId = createReadyTask({
      subject: 'Regression: spawn rollback',
      description: 'Ensure model_source rollback occurs on spawn failure',
      priority: 'high',
      tier: 3,
    });

    db.updateTask(taskId, {
      routing_class: 'legacy-class',
      routed_model: 'legacy-model',
      model_source: 'legacy-source',
      reasoning_effort: 'legacy-effort',
    });

    cliServer.stop();
    server = cliServer.start(tmpDir, {
      onTaskCompleted: () => {},
      onLoopCreated: (loopId, prompt) => {
        loopCreatedEvents.push({ loopId, prompt });
      },
      onAssignTask: () => {
        throw new Error('spawn failed for rollback regression');
      },
    });
    await waitForCliServerReady();

    const assignment = await sendCommand('assign-task', { task_id: taskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, false);
    assert.match(assignment.error, /Failed to spawn worker: spawn failed for rollback regression/);

    const task = db.getTask(taskId);
    assert.ok(task);
    assert.strictEqual(task.status, 'ready');
    assert.strictEqual(task.assigned_to, null);
    assert.strictEqual(task.routing_class, 'legacy-class');
    assert.strictEqual(task.routed_model, 'legacy-model');
    assert.strictEqual(task.model_source, 'legacy-source');
    assert.strictEqual(task.reasoning_effort, 'legacy-effort');

    const worker = db.getWorker(1);
    assert.ok(worker);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);
  });

  it('should label explicit model overrides as config-fallback in response and logs', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_high', 'high-override-model');
    await setConfigValue('model_spark', 'spark-override-model');

    const highTaskId = createReadyTask({
      subject: 'Complex migration',
      description: 'Deep refactor across modules',
      priority: 'high',
      tier: 3,
    });
    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });

    const highAssignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(highAssignment.ok, true);
    assert.strictEqual(highAssignment.routing.model, 'high-override-model');
    assert.strictEqual(highAssignment.routing.model_source, 'config-fallback');

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 2 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'spark-override-model');
    assert.strictEqual(sparkAssignment.routing.model_source, 'config-fallback');

    const highAssignmentLog = getAllocatorAssignmentDetails(highTaskId);
    assert.ok(highAssignmentLog);
    assert.strictEqual(highAssignmentLog.model_source, 'config-fallback');

    const sparkAssignmentLog = getAllocatorAssignmentDetails(sparkTaskId);
    assert.ok(sparkAssignmentLog);
    assert.strictEqual(sparkAssignmentLog.model_source, 'config-fallback');
  });

  it('should prefer model_codex_spark for spark routing when both spark aliases are set', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.setConfig('model_spark', 'spark-legacy-model');
    db.setConfig('model_codex_spark', 'spark-codex-model');

    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 1 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'spark-codex-model');
    assert.strictEqual(sparkAssignment.routing.model_source, 'config-fallback');

    const sparkAssignmentLog = getAllocatorAssignmentDetails(sparkTaskId);
    assert.ok(sparkAssignmentLog);
    assert.strictEqual(sparkAssignmentLog.model, 'spark-codex-model');
    assert.strictEqual(sparkAssignmentLog.model_source, 'config-fallback');
  });

  it('should remain compatible with model_spark when model_codex_spark is unset', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.setConfig('model_codex_spark', '');
    db.setConfig('model_spark', 'spark-legacy-model');

    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 1 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'spark-legacy-model');
    assert.strictEqual(sparkAssignment.routing.model_source, 'config-fallback');

    const sparkAssignmentLog = getAllocatorAssignmentDetails(sparkTaskId);
    assert.ok(sparkAssignmentLog);
    assert.strictEqual(sparkAssignmentLog.model, 'spark-legacy-model');
    assert.strictEqual(sparkAssignmentLog.model_source, 'config-fallback');
  });

  it('should mirror spark model alias writes for set-config and route using either spark key', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_codex_spark', 'spark-model-via-codex-key');
    assert.strictEqual(db.getConfig('model_codex_spark'), 'spark-model-via-codex-key');
    assert.strictEqual(db.getConfig('model_spark'), 'spark-model-via-codex-key');

    const sparkTaskViaCodexKey = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });
    const sparkAssignmentViaCodexKey = await sendCommand('assign-task', { task_id: sparkTaskViaCodexKey, worker_id: 1 });
    assert.strictEqual(sparkAssignmentViaCodexKey.ok, true);
    assert.strictEqual(sparkAssignmentViaCodexKey.routing.model, 'spark-model-via-codex-key');
    assert.strictEqual(sparkAssignmentViaCodexKey.routing.model_source, 'config-fallback');

    await setConfigValue('model_spark', 'spark-model-via-spark-key');
    assert.strictEqual(db.getConfig('model_spark'), 'spark-model-via-spark-key');
    assert.strictEqual(db.getConfig('model_codex_spark'), 'spark-model-via-spark-key');

    const sparkTaskViaSparkKey = createReadyTask({
      subject: 'Minor cleanup 2',
      description: 'Small log update 2',
      priority: 'low',
      tier: 1,
    });
    const sparkAssignmentViaSparkKey = await sendCommand('assign-task', { task_id: sparkTaskViaSparkKey, worker_id: 2 });
    assert.strictEqual(sparkAssignmentViaSparkKey.ok, true);
    assert.strictEqual(sparkAssignmentViaSparkKey.routing.model, 'spark-model-via-spark-key');
    assert.strictEqual(sparkAssignmentViaSparkKey.routing.model_source, 'config-fallback');
  });

  it('should downscale high and mid routing when flagship budget is constrained', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_flagship', 'flagship-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_spark', 'spark-effort');
    await setConfigValue('reasoning_mini', 'mini-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 25, threshold: 25 },
    }));

    const highTaskId = createReadyTask({
      subject: 'Complex migration',
      description: 'Deep refactor across modules',
      priority: 'high',
      tier: 3,
    });
    const midTaskId = createReadyTask({
      subject: 'Refactor routing helper',
      description: 'Routine helper updates',
      tier: 2,
    });

    const highAssignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(highAssignment.ok, true);
    assert.strictEqual(highAssignment.routing.class, 'high');
    assert.strictEqual(highAssignment.routing.model, 'mini-model');
    assert.strictEqual(highAssignment.routing.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(highAssignment.routing.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignment.routing.reason, 'fallback-budget-downgrade:high->mini');

    const midAssignment = await sendCommand('assign-task', { task_id: midTaskId, worker_id: 2 });
    assert.strictEqual(midAssignment.ok, true);
    assert.strictEqual(midAssignment.routing.class, 'mid');
    assert.strictEqual(midAssignment.routing.model, 'spark-model');
    assert.strictEqual(midAssignment.routing.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(midAssignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(midAssignment.routing.routing_reason, 'fallback-budget-downgrade:mid->spark');
    assert.strictEqual(midAssignment.routing.reason, 'fallback-budget-downgrade:mid->spark');

    const worker1Messages = db.checkMail('worker-1', false);
    const highAssignmentMail = worker1Messages.find((msg) => msg.type === 'task_assigned' && msg.payload.task_id === highTaskId);
    assert.ok(highAssignmentMail);
    assert.strictEqual(highAssignmentMail.payload.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignmentMail.payload.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignmentMail.payload.reasoning_effort, 'mini-effort');

    const highAssignmentLog = getAllocatorAssignmentDetails(highTaskId);
    assert.ok(highAssignmentLog);
    assert.strictEqual(highAssignmentLog.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignmentLog.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignmentLog.reasoning_effort, 'mini-effort');
  });

  it('should restore normal routing after flagship budget recovers above threshold', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');

    await setConfigValue('model_flagship', 'flagship-model');
    await setConfigValue('model_xhigh', 'xhigh-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_xhigh', 'xhigh-effort');
    await setConfigValue('reasoning_mini', 'mini-effort');
    await setConfigValue('reasoning_mid', 'mid-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 10, threshold: 20 },
    }));

    const constrainedHighTaskId = createReadyTask({
      subject: 'Urgent conflict resolution',
      description: 'Critical branch merge',
      priority: 'high',
      tier: 3,
    });
    const constrainedAssignment = await sendCommand('assign-task', { task_id: constrainedHighTaskId, worker_id: 1 });
    assert.strictEqual(constrainedAssignment.ok, true);
    assert.strictEqual(constrainedAssignment.routing.class, 'high');
    assert.strictEqual(constrainedAssignment.routing.model, 'mini-model');
    assert.strictEqual(constrainedAssignment.routing.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(constrainedAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(constrainedAssignment.routing.routing_reason, 'fallback-budget-downgrade:high->mini');

    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 30, threshold: 20 },
    }));

    const recoveredHighTaskId = createReadyTask({
      subject: 'Urgent routing verification',
      description: 'Complex worker orchestration',
      priority: 'high',
      tier: 3,
    });
    const recoveredMidTaskId = createReadyTask({
      subject: 'Planner helper maintenance',
      description: 'Refactor helper utilities',
      tier: 2,
    });

    const recoveredHigh = await sendCommand('assign-task', { task_id: recoveredHighTaskId, worker_id: 2 });
    assert.strictEqual(recoveredHigh.ok, true);
    assert.strictEqual(recoveredHigh.routing.class, 'high');
    assert.strictEqual(recoveredHigh.routing.model, 'xhigh-model');
    assert.strictEqual(recoveredHigh.routing.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(recoveredHigh.routing.reasoning_effort, 'xhigh-effort');
    assert.strictEqual(recoveredHigh.routing.routing_reason, 'fallback-budget-upgrade:high->xhigh');
    assert.strictEqual(recoveredHigh.routing.reason, 'fallback-budget-upgrade:high->xhigh');

    const recoveredMid = await sendCommand('assign-task', { task_id: recoveredMidTaskId, worker_id: 3 });
    assert.strictEqual(recoveredMid.ok, true);
    assert.strictEqual(recoveredMid.routing.class, 'mid');
    assert.strictEqual(recoveredMid.routing.model, 'mid-model');
    assert.strictEqual(recoveredMid.routing.model_source, 'config-fallback');
    assert.strictEqual(recoveredMid.routing.reasoning_effort, 'mid-effort');
    assert.strictEqual(recoveredMid.routing.routing_reason, 'fallback-routing:class-default');

    const worker2Messages = db.checkMail('worker-2', false);
    const recoveredHighMail = worker2Messages.find((msg) => msg.type === 'task_assigned' && msg.payload.task_id === recoveredHighTaskId);
    assert.ok(recoveredHighMail);
    assert.strictEqual(recoveredHighMail.payload.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(recoveredHighMail.payload.routing_reason, 'fallback-budget-upgrade:high->xhigh');
    assert.strictEqual(recoveredHighMail.payload.reasoning_effort, 'xhigh-effort');

    const recoveredHighLog = getAllocatorAssignmentDetails(recoveredHighTaskId);
    assert.ok(recoveredHighLog);
    assert.strictEqual(recoveredHighLog.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(recoveredHighLog.routing_reason, 'fallback-budget-upgrade:high->xhigh');
    assert.strictEqual(recoveredHighLog.reasoning_effort, 'xhigh-effort');
  });

  it('should downscale routing from scalar budget keys when routing_budget_state JSON is absent', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_spark', 'spark-effort');
    await setConfigValue('reasoning_mini', 'mini-effort');

    db.setConfig('routing_budget_flagship_remaining', ' 12 ');
    db.setConfig('routing_budget_flagship_threshold', '12');
    db.setConfig('flagship_budget_remaining', '120');
    db.setConfig('flagship_budget_threshold', '10');

    const highTaskId = createReadyTask({
      subject: 'Scalar constrained high route',
      description: 'Critical merge refactor path',
      priority: 'high',
      tier: 3,
    });
    const midTaskId = createReadyTask({
      subject: 'Scalar constrained merge route',
      description: 'Resolve merge conflict in branch stack',
      tier: 2,
    });

    const highAssignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(highAssignment.ok, true);
    assert.strictEqual(highAssignment.routing.class, 'high');
    assert.strictEqual(highAssignment.routing.model, 'mini-model');
    assert.strictEqual(highAssignment.routing.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(highAssignment.routing.routing_reason, 'fallback-budget-downgrade:high->mini');

    const midAssignment = await sendCommand('assign-task', { task_id: midTaskId, worker_id: 2 });
    assert.strictEqual(midAssignment.ok, true);
    assert.strictEqual(midAssignment.routing.class, 'mid');
    assert.strictEqual(midAssignment.routing.model, 'spark-model');
    assert.strictEqual(midAssignment.routing.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(midAssignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(midAssignment.routing.routing_reason, 'fallback-budget-downgrade:mid->spark');

    const highAssignmentLog = getAllocatorAssignmentDetails(highTaskId);
    assert.ok(highAssignmentLog);
    assert.strictEqual(highAssignmentLog.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignmentLog.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignmentLog.reasoning_effort, 'mini-effort');
  });

  it('should upgrade routing from legacy scalar budget keys when routing_budget_state JSON is absent', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_xhigh', 'xhigh-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('reasoning_xhigh', 'xhigh-effort');

    db.setConfig('routing_budget_flagship_remaining', '');
    db.setConfig('routing_budget_flagship_threshold', '  ');
    db.setConfig('flagship_budget_remaining', ' 35 ');
    db.setConfig('flagship_budget_threshold', '20');

    const highTaskId = createReadyTask({
      subject: 'Legacy scalar healthy budget routing',
      description: 'Critical orchestrator update',
      priority: 'high',
      tier: 3,
    });

    const assignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'high');
    assert.strictEqual(assignment.routing.model, 'xhigh-model');
    assert.strictEqual(assignment.routing.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(assignment.routing.reasoning_effort, 'xhigh-effort');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-budget-upgrade:high->xhigh');
    assert.strictEqual(assignment.routing.reason, 'fallback-budget-upgrade:high->xhigh');

    const assignmentLog = getAllocatorAssignmentDetails(highTaskId);
    assert.ok(assignmentLog);
    assert.strictEqual(assignmentLog.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(assignmentLog.routing_reason, 'fallback-budget-upgrade:high->xhigh');
    assert.strictEqual(assignmentLog.reasoning_effort, 'xhigh-effort');
  });

  it('should expose legacy scalar fallback budget snapshot in /api/status when routing scalar values are blank', async () => {
    const reqId = db.createRequest('Legacy scalar snapshot parity request');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Task with allocator telemetry',
      description: 'Used to verify task hydration alongside budget snapshot fallback',
      domain: 'coordinator-surface',
      tier: 2,
    });

    db.log('allocator', 'task_assigned', {
      task_id: taskId,
      routing_class: 'mini',
      model: 'gpt-5.3-mini',
      model_source: 'fallback-default',
      reasoning_effort: 'low',
      budget_state: { flagship: { remaining: 3, threshold: 10 } },
      budget_source: 'activity_log:allocator.task_assigned',
    });

    db.setConfig('routing_budget_flagship_remaining', '   ');
    db.setConfig('routing_budget_flagship_threshold', '\t');
    db.setConfig('flagship_budget_remaining', ' 35 ');
    db.setConfig('flagship_budget_threshold', '20');

    const web = webServer.start(tmpDir, 0);
    await new Promise((resolve, reject) => {
      web.once('listening', resolve);
      web.once('error', reject);
    });
    const webPort = web.address().port;

    try {
      const statusResult = await requestWebJson(webPort, '/api/status');
      assert.strictEqual(statusResult.status, 200);
      assert.strictEqual(statusResult.body.routing_budget_source, 'config:budget_thresholds');
      assert.deepStrictEqual(statusResult.body.routing_budget_state, {
        source: 'config:budget_thresholds',
        parsed: { flagship: { remaining: 35, threshold: 20 } },
        remaining: 35,
        threshold: 20,
      });

      const task = statusResult.body.tasks.find((entry) => entry.id === taskId);
      assert.ok(task);
      assert.strictEqual(task.routing_class, 'mini');
      assert.strictEqual(task.routed_model, 'gpt-5.3-mini');
      assert.strictEqual(task.model_source, 'fallback-default');
      assert.strictEqual(task.reasoning_effort, 'low');
    } finally {
      webServer.stop();
    }
  });

  it('should keep routing_budget_state JSON precedence over scalar fallback keys', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_xhigh', 'xhigh-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_xhigh', 'xhigh-effort');

    db.setConfig('routing_budget_flagship_remaining', '5');
    db.setConfig('routing_budget_flagship_threshold', '10');
    db.setConfig('routing_budget_state', JSON.stringify({
      flagship: { remaining: 40, threshold: 10 },
    }));

    const highTaskId = createReadyTask({
      subject: 'JSON precedence over scalar fallback',
      description: 'Critical worker orchestration',
      priority: 'high',
      tier: 3,
    });

    const assignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'high');
    assert.strictEqual(assignment.routing.model, 'xhigh-model');
    assert.strictEqual(assignment.routing.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(assignment.routing.reasoning_effort, 'xhigh-effort');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-budget-upgrade:high->xhigh');
  });

  it('should apply reasoning config per selected effective class', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');
    db.registerWorker(4, '/wt-4', 'agent-4');
    db.registerWorker(5, '/wt-5', 'agent-5');

    await setConfigValue('model_xhigh', 'xhigh-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_xhigh', 'effort-xhigh');
    await setConfigValue('reasoning_high', 'effort-high');
    await setConfigValue('reasoning_mid', 'effort-mid');
    await setConfigValue('reasoning_spark', 'effort-spark');
    await setConfigValue('reasoning_mini', 'effort-mini');

    await setConfigValue('routing_budget_state', JSON.stringify({ flagship: { remaining: 9, threshold: 10 } }));
    const constrainedHighTaskId = createReadyTask({
      subject: 'Constrained complexity routing',
      description: 'Critical routing path',
      priority: 'high',
      tier: 3,
    });
    const constrainedHighAssignment = await sendCommand('assign-task', { task_id: constrainedHighTaskId, worker_id: 1 });
    assert.strictEqual(constrainedHighAssignment.ok, true);
    assert.strictEqual(constrainedHighAssignment.routing.model, 'mini-model');
    assert.strictEqual(constrainedHighAssignment.routing.reasoning_effort, 'effort-mini');

    await setConfigValue('routing_budget_state', JSON.stringify({}));
    const highTaskId = createReadyTask({
      subject: 'High complexity no budget signal',
      description: 'Critical migration path',
      priority: 'high',
      tier: 3,
    });
    const midTaskId = createReadyTask({
      subject: 'Merge helper update',
      description: 'Refactor merge helper modules',
      tier: 2,
    });
    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Adjust logs',
      tier: 1,
      priority: 'low',
    });

    const highAssignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 2 });
    assert.strictEqual(highAssignment.ok, true);
    assert.strictEqual(highAssignment.routing.model, 'high-model');
    assert.strictEqual(highAssignment.routing.reasoning_effort, 'effort-high');

    const midAssignment = await sendCommand('assign-task', { task_id: midTaskId, worker_id: 3 });
    assert.strictEqual(midAssignment.ok, true);
    assert.strictEqual(midAssignment.routing.model, 'mid-model');
    assert.strictEqual(midAssignment.routing.reasoning_effort, 'effort-mid');

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 4 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'spark-model');
    assert.strictEqual(sparkAssignment.routing.reasoning_effort, 'effort-spark');

    await setConfigValue('routing_budget_state', JSON.stringify({ flagship: { remaining: 30, threshold: 10 } }));
    const healthyHighTaskId = createReadyTask({
      subject: 'Healthy budget complex routing',
      description: 'Critical worker orchestration',
      priority: 'high',
      tier: 3,
    });
    const healthyHighAssignment = await sendCommand('assign-task', { task_id: healthyHighTaskId, worker_id: 5 });
    assert.strictEqual(healthyHighAssignment.ok, true);
    assert.strictEqual(healthyHighAssignment.routing.model, 'xhigh-model');
    assert.strictEqual(healthyHighAssignment.routing.model_source, 'budget-upgrade:model_xhigh');
    assert.strictEqual(healthyHighAssignment.routing.reasoning_effort, 'effort-xhigh');
    assert.strictEqual(healthyHighAssignment.routing.routing_reason, 'fallback-budget-upgrade:high->xhigh');
  });

  it('should honor model_xhigh/model_mini and per-class reasoning updates on direct fallback classes', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');
    db.registerWorker(4, '/wt-4', 'agent-4');

    await setConfigValue('model_xhigh', 'xhigh-model-v1');
    await setConfigValue('model_mini', 'mini-model-v1');
    await setConfigValue('reasoning_xhigh', 'xhigh-effort-v1');
    await setConfigValue('reasoning_mini', 'mini-effort-v1');

    const firstXhighTaskId = createReadyTask({
      subject: 'Escalated fallback routing',
      description: 'Critical cross-system coordination',
      priority: 'normal',
      tier: 4,
    });
    const firstMiniTaskId = createReadyTask({
      subject: 'Docs cleanup pass',
      description: 'Fix typo in worker instructions',
      priority: 'low',
      tier: 1,
    });

    const firstXhighAssignment = await sendCommand('assign-task', { task_id: firstXhighTaskId, worker_id: 1 });
    assert.strictEqual(firstXhighAssignment.ok, true);
    assert.strictEqual(firstXhighAssignment.routing.class, 'xhigh');
    assert.strictEqual(firstXhighAssignment.routing.model, 'xhigh-model-v1');
    assert.strictEqual(firstXhighAssignment.routing.model_source, 'config-fallback');
    assert.strictEqual(firstXhighAssignment.routing.reasoning_effort, 'xhigh-effort-v1');
    assert.strictEqual(firstXhighAssignment.routing.routing_reason, 'fallback-routing:class-default');

    const firstMiniAssignment = await sendCommand('assign-task', { task_id: firstMiniTaskId, worker_id: 2 });
    assert.strictEqual(firstMiniAssignment.ok, true);
    assert.strictEqual(firstMiniAssignment.routing.class, 'mini');
    assert.strictEqual(firstMiniAssignment.routing.model, 'mini-model-v1');
    assert.strictEqual(firstMiniAssignment.routing.model_source, 'config-fallback');
    assert.strictEqual(firstMiniAssignment.routing.reasoning_effort, 'mini-effort-v1');
    assert.strictEqual(firstMiniAssignment.routing.routing_reason, 'fallback-routing:class-default');

    await setConfigValue('model_xhigh', 'xhigh-model-v2');
    await setConfigValue('model_mini', 'mini-model-v2');
    await setConfigValue('reasoning_xhigh', 'xhigh-effort-v2');
    await setConfigValue('reasoning_mini', 'mini-effort-v2');

    const secondXhighTaskId = createReadyTask({
      subject: 'Escalated fallback routing round two',
      description: 'Critical cross-system coordination follow-up',
      priority: 'normal',
      tier: 4,
    });
    const secondMiniTaskId = createReadyTask({
      subject: 'Docs cleanup pass two',
      description: 'Fix typo in operator instructions',
      priority: 'low',
      tier: 1,
    });

    const secondXhighAssignment = await sendCommand('assign-task', { task_id: secondXhighTaskId, worker_id: 3 });
    assert.strictEqual(secondXhighAssignment.ok, true);
    assert.strictEqual(secondXhighAssignment.routing.class, 'xhigh');
    assert.strictEqual(secondXhighAssignment.routing.model, 'xhigh-model-v2');
    assert.strictEqual(secondXhighAssignment.routing.model_source, 'config-fallback');
    assert.strictEqual(secondXhighAssignment.routing.reasoning_effort, 'xhigh-effort-v2');

    const secondMiniAssignment = await sendCommand('assign-task', { task_id: secondMiniTaskId, worker_id: 4 });
    assert.strictEqual(secondMiniAssignment.ok, true);
    assert.strictEqual(secondMiniAssignment.routing.class, 'mini');
    assert.strictEqual(secondMiniAssignment.routing.model, 'mini-model-v2');
    assert.strictEqual(secondMiniAssignment.routing.model_source, 'config-fallback');
    assert.strictEqual(secondMiniAssignment.routing.reasoning_effort, 'mini-effort-v2');
  });
});
