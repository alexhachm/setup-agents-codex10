'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

const db = require('../src/db');
const cliServer = require('../src/cli-server');

let tmpDir;
let server;
let socketPath;
let loopCreatedEvents;

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
  await new Promise((resolve) => {
    const check = () => {
      const conn = net.createConnection(socketPath, () => {
        conn.end();
        resolve();
      });
      conn.on('error', () => setTimeout(check, 50));
    };
    // Give server a moment to bind
    setTimeout(check, 50);
  });
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
    assert.strictEqual(db.getTask(taskId).status, 'completed');
    assert.strictEqual(db.getWorker(1).status, 'completed_task');
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
    assert.ok(task.reasoning_effort);
    assert.strictEqual(task.routing_class, assignment.routing.class);
    assert.strictEqual(task.routed_model, assignment.routing.model);
    assert.strictEqual(task.reasoning_effort, assignment.routing.reasoning_effort);
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
      subject: 'Resolve merge conflict',
      description: 'Merge integration branch into main',
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
      subject: 'Refactor merge helper',
      description: 'Refactor merge helper utilities',
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
});
