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

  it('should downscale high and mid routing when flagship budget is constrained', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_flagship', 'flagship-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
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
    assert.strictEqual(highAssignment.routing.reasoning_effort, 'low');
    assert.strictEqual(highAssignment.routing.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignment.routing.reason, 'fallback-budget-downgrade:high->mini');

    const midAssignment = await sendCommand('assign-task', { task_id: midTaskId, worker_id: 2 });
    assert.strictEqual(midAssignment.ok, true);
    assert.strictEqual(midAssignment.routing.class, 'mid');
    assert.strictEqual(midAssignment.routing.model, 'spark-model');
    assert.strictEqual(midAssignment.routing.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(midAssignment.routing.reasoning_effort, 'low');
    assert.strictEqual(midAssignment.routing.routing_reason, 'fallback-budget-downgrade:mid->spark');
    assert.strictEqual(midAssignment.routing.reason, 'fallback-budget-downgrade:mid->spark');

    const worker1Messages = db.checkMail('worker-1', false);
    const highAssignmentMail = worker1Messages.find((msg) => msg.type === 'task_assigned' && msg.payload.task_id === highTaskId);
    assert.ok(highAssignmentMail);
    assert.strictEqual(highAssignmentMail.payload.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignmentMail.payload.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignmentMail.payload.reasoning_effort, 'low');

    const highAssignmentLog = getAllocatorAssignmentDetails(highTaskId);
    assert.ok(highAssignmentLog);
    assert.strictEqual(highAssignmentLog.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(highAssignmentLog.routing_reason, 'fallback-budget-downgrade:high->mini');
    assert.strictEqual(highAssignmentLog.reasoning_effort, 'low');
  });

  it('should restore normal routing after flagship budget recovers above threshold', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');

    await setConfigValue('model_flagship', 'flagship-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
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
    assert.strictEqual(constrainedAssignment.routing.reasoning_effort, 'low');
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
    assert.strictEqual(recoveredHigh.routing.model, 'high-model');
    assert.strictEqual(recoveredHigh.routing.model_source, 'fallback-routing:model_high');
    assert.strictEqual(recoveredHigh.routing.reasoning_effort, 'high');
    assert.strictEqual(recoveredHigh.routing.routing_reason, 'fallback-routing:class-default');

    const recoveredMid = await sendCommand('assign-task', { task_id: recoveredMidTaskId, worker_id: 3 });
    assert.strictEqual(recoveredMid.ok, true);
    assert.strictEqual(recoveredMid.routing.class, 'mid');
    assert.strictEqual(recoveredMid.routing.model, 'mid-model');
    assert.strictEqual(recoveredMid.routing.model_source, 'fallback-routing:model_mid');
    assert.strictEqual(recoveredMid.routing.reasoning_effort, 'low');
    assert.strictEqual(recoveredMid.routing.routing_reason, 'fallback-routing:class-default');
  });
});
