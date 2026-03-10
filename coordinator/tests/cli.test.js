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

  it('should terminalize malformed scaffold requests/tasks via repair and stay idempotent', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.getDb().prepare(`
      INSERT INTO requests (id, description, status, tier)
      VALUES (?, ?, 'decomposed', 2)
    `).run('req-673d2c05', '[clear description of what the user wants]');

    db.getDb().prepare(`
      INSERT INTO requests (id, description, status, tier)
      VALUES (?, ?, 'decomposed', 2)
    `).run('req-21e8a758', 'FIX worker-2: [brief description of what needs fixing]');

    const baselineReq = db.createRequest('Legitimate request');
    for (let i = 1; i <= 10; i += 1) {
      db.createTask({
        request_id: baselineReq,
        subject: `Legit task ${i}`,
        description: `Legit description ${i}`,
      });
    }

    const malformedReadyTask = db.createTask({
      request_id: 'req-21e8a758',
      subject: 'Fix: FIX worker-2: [brief description of what needs fixing]',
      description: 'FIX worker-2: [brief description of what needs fixing]',
      priority: 'urgent',
      tier: 2,
    });
    assert.strictEqual(malformedReadyTask, 11);
    db.updateTask(malformedReadyTask, { status: 'ready' });

    const malformedAssignedTask = db.createTask({
      request_id: 'req-673d2c05',
      subject: 'Scaffold placeholder follow-up',
      description: 'Investigate placeholder request',
      tier: 2,
    });
    db.updateTask(malformedAssignedTask, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: malformedAssignedTask, claimed_by: 'allocator' });

    const repair1 = await sendCommand('repair', {});
    assert.strictEqual(repair1.ok, true);
    assert.strictEqual(repair1.scaffold_remediation.matched_requests, 2);
    assert.strictEqual(repair1.scaffold_remediation.matched_tasks, 2);
    assert.strictEqual(repair1.scaffold_remediation.terminalized_requests, 2);
    assert.strictEqual(repair1.scaffold_remediation.terminalized_tasks, 2);
    assert.strictEqual(repair1.scaffold_remediation.cleared_task_assignments, 1);
    assert.strictEqual(repair1.scaffold_remediation.reset_workers, 1);

    const reqA = db.getRequest('req-673d2c05');
    const reqB = db.getRequest('req-21e8a758');
    assert.strictEqual(reqA.status, 'failed');
    assert.strictEqual(reqB.status, 'failed');

    const readyAfterRepair = await sendCommand('ready-tasks', {});
    assert.strictEqual(readyAfterRepair.ok, true);
    assert.ok(!readyAfterRepair.tasks.some((task) => task.id === malformedReadyTask));

    const repairedReadyTask = db.getTask(malformedReadyTask);
    const repairedAssignedTask = db.getTask(malformedAssignedTask);
    assert.strictEqual(repairedReadyTask.status, 'failed');
    assert.strictEqual(repairedAssignedTask.status, 'failed');
    assert.strictEqual(repairedReadyTask.assigned_to, null);
    assert.strictEqual(repairedAssignedTask.assigned_to, null);

    const repairedWorker = db.getWorker(1);
    assert.strictEqual(repairedWorker.status, 'idle');
    assert.strictEqual(repairedWorker.current_task_id, null);
    assert.strictEqual(repairedWorker.claimed_by, null);

    const repair2 = await sendCommand('repair', {});
    assert.strictEqual(repair2.ok, true);
    assert.strictEqual(repair2.scaffold_remediation.terminalized_requests, 0);
    assert.strictEqual(repair2.scaffold_remediation.terminalized_tasks, 0);
    assert.strictEqual(repair2.scaffold_remediation.cleared_task_assignments, 0);
    assert.strictEqual(repair2.scaffold_remediation.reset_workers, 0);
  });

  it('should neutralize malformed ready task #11 before assign-task dispatch', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.getDb().prepare(`
      INSERT INTO requests (id, description, status, tier)
      VALUES (?, ?, 'decomposed', 2)
    `).run('req-21e8a758', 'FIX worker-2: [brief description of what needs fixing]');

    const baselineReq = db.createRequest('Legit request');
    for (let i = 1; i <= 10; i += 1) {
      db.createTask({
        request_id: baselineReq,
        subject: `Task ${i}`,
        description: `Desc ${i}`,
      });
    }

    const task11 = db.createTask({
      request_id: 'req-21e8a758',
      subject: 'Fix: FIX worker-2: [brief description of what needs fixing]',
      description: 'FIX worker-2: [brief description of what needs fixing]',
      tier: 2,
      priority: 'urgent',
    });
    assert.strictEqual(task11, 11);
    db.updateTask(task11, { status: 'ready' });

    const assign = await sendCommand('assign-task', { task_id: task11, worker_id: 1 });
    assert.strictEqual(assign.ok, false);
    assert.strictEqual(assign.error, 'task_not_ready');
    assert.strictEqual(assign.scaffold_remediation.terminalized_tasks, 1);

    const neutralizedTask = db.getTask(task11);
    assert.strictEqual(neutralizedTask.status, 'failed');
    assert.strictEqual(neutralizedTask.assigned_to, null);
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
});
