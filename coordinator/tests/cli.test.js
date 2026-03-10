'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { spawn } = require('node:child_process');

const db = require('../src/db');
const cliServer = require('../src/cli-server');
const mac10Bin = path.join(__dirname, '../bin/mac10');
const TEST_NAMESPACE = process.env.MAC10_NAMESPACE || 'mac10';

let tmpDir;
let server;
let socketPath;
let loopCreatedEvents;

async function waitForServerListening() {
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
}

async function restartCliServer(overrides = {}) {
  cliServer.stop();
  server = cliServer.start(tmpDir, {
    onTaskCompleted: () => {},
    onLoopCreated: (loopId, prompt) => {
      loopCreatedEvents.push({ loopId, prompt });
    },
    ...overrides,
  });
  await waitForServerListening();
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-cli-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
  socketPath = cliServer.getSocketPath(tmpDir);
  loopCreatedEvents = [];
  await restartCliServer();
});

afterEach(() => {
  cliServer.stop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runMac10Command(args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mac10Bin, '--project', tmpDir, ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, MAC10_NAMESPACE: TEST_NAMESPACE },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 30000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });

    child.stdin.end(input);
  });
}

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

  it('should terminalize malformed scaffold request artifacts via repair and stay idempotent', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.getDb().prepare(`
      INSERT INTO requests (id, description)
      VALUES (?, ?)
    `).run('req-673d2c05', '[clear description of what the user wants]');
    db.getDb().prepare(`
      INSERT INTO requests (id, description)
      VALUES (?, ?)
    `).run('req-21e8a758', 'FIX worker-2: [brief description of what needs fixing]');

    const malformedTaskId = db.createTask({
      request_id: 'req-673d2c05',
      subject: 'Scaffold placeholder task',
      description: '[clear description of what the user wants]',
      domain: 'coordinator',
      tier: 2,
    });
    db.updateTask(malformedTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: malformedTaskId });

    const firstRepair = await sendCommand('repair', {});
    assert.strictEqual(firstRepair.ok, true);
    assert.strictEqual(firstRepair.malformed_scaffold.repaired_requests, 2);
    assert.strictEqual(firstRepair.malformed_scaffold.terminalized_tasks, 1);
    assert.strictEqual(firstRepair.malformed_scaffold.detached_task_assignments, 1);
    assert.strictEqual(firstRepair.malformed_scaffold.reset_workers, 1);

    const repairedRequest = db.getRequest('req-673d2c05');
    assert.strictEqual(repairedRequest.status, 'failed');
    assert.match(repairedRequest.result, /Malformed scaffold placeholder request/i);
    const repairedFixPlaceholderRequest = db.getRequest('req-21e8a758');
    assert.strictEqual(repairedFixPlaceholderRequest.status, 'failed');
    assert.match(repairedFixPlaceholderRequest.result, /Malformed scaffold placeholder request/i);

    const repairedTask = db.getTask(malformedTaskId);
    assert.strictEqual(repairedTask.status, 'failed');
    assert.strictEqual(repairedTask.assigned_to, null);
    assert.match(repairedTask.result, /Malformed scaffold placeholder task/i);

    const repairedWorker = db.getWorker(1);
    assert.strictEqual(repairedWorker.status, 'idle');
    assert.strictEqual(repairedWorker.current_task_id, null);

    const secondRepair = await sendCommand('repair', {});
    assert.strictEqual(secondRepair.ok, true);
    assert.strictEqual(secondRepair.malformed_scaffold.repaired_requests, 0);
    assert.strictEqual(secondRepair.malformed_scaffold.terminalized_tasks, 0);
    assert.strictEqual(secondRepair.malformed_scaffold.detached_task_assignments, 0);
    assert.strictEqual(secondRepair.malformed_scaffold.reset_workers, 0);
  });

  it('should neutralize malformed ready task #11 before assignment dispatch', async () => {
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.getDb().prepare(`
      INSERT INTO requests (id, description)
      VALUES (?, ?)
    `).run('req-21e8a758', 'Legitimate remediation request');

    for (let i = 0; i < 10; i += 1) {
      db.createTask({
        request_id: 'req-21e8a758',
        subject: `Seed task ${i + 1}`,
        description: 'Seed',
        domain: 'coordinator',
        tier: 2,
      });
    }

    const malformedTaskId = db.createTask({
      request_id: 'req-21e8a758',
      subject: 'Malformed scaffold fix',
      description: 'FIX worker-N: [brief description of what needs fixing]',
      domain: 'coordinator',
      tier: 2,
    });
    assert.strictEqual(malformedTaskId, 11);
    db.updateTask(malformedTaskId, { status: 'ready' });
    db.updateWorker(2, { status: 'assigned', current_task_id: malformedTaskId });

    const beforeRepairReadyIds = db.getReadyTasks().map((task) => task.id);
    assert.ok(beforeRepairReadyIds.includes(11));

    const repairResult = await sendCommand('repair', {});
    assert.strictEqual(repairResult.ok, true);
    assert.strictEqual(repairResult.malformed_scaffold.terminalized_tasks, 1);

    const task11 = db.getTask(11);
    assert.strictEqual(task11.status, 'failed');
    assert.strictEqual(task11.assigned_to, null);
    assert.match(task11.result, /Malformed scaffold placeholder task/i);

    const worker2 = db.getWorker(2);
    assert.strictEqual(worker2.status, 'idle');
    assert.strictEqual(worker2.current_task_id, null);

    const readyTasks = await sendCommand('ready-tasks', {});
    assert.strictEqual(readyTasks.ok, true);
    assert.ok(!readyTasks.tasks.some((task) => task.id === 11));

    const assignAttempt = await sendCommand('assign-task', { task_id: 11, worker_id: 2 });
    assert.strictEqual(assignAttempt.ok, false);
    assert.strictEqual(assignAttempt.error, 'task_not_ready');
  });

  it('should not expose or assign ready tasks whose parent request is terminal', async () => {
    db.registerWorker(3, '/wt-3', 'agent-3');
    for (const terminalStatus of ['completed', 'failed']) {
      const requestId = db.createRequest(`Already ${terminalStatus} request`);
      const taskId = db.createTask({
        request_id: requestId,
        subject: `Stale ready task (${terminalStatus})`,
        description: 'Should not be reassigned',
        domain: 'coordinator',
        tier: 2,
      });
      db.updateTask(taskId, { status: 'ready' });
      db.updateRequest(requestId, {
        status: terminalStatus,
        result: terminalStatus === 'completed' ? 'Done' : 'Failed',
        completed_at: new Date().toISOString(),
      });

      const readyTasks = await sendCommand('ready-tasks', {});
      assert.strictEqual(readyTasks.ok, true);
      assert.ok(!readyTasks.tasks.some((task) => task.id === taskId));

      const assignAttempt = await sendCommand('assign-task', { task_id: taskId, worker_id: 3 });
      assert.strictEqual(assignAttempt.ok, false);
      assert.strictEqual(assignAttempt.error, 'parent_request_terminal');
      assert.strictEqual(assignAttempt.parent_request_status, terminalStatus);
      assert.strictEqual(db.getTask(taskId).assigned_to, null);
      assert.strictEqual(db.getWorker(3).status, 'idle');
    }
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

  it('should wait for async onLoopCreated success before returning loop ok', async () => {
    const launchedPid = 4321;
    loopCreatedEvents = [];
    await restartCliServer({
      onLoopCreated: (loopId, prompt) => new Promise((resolve) => {
        loopCreatedEvents.push({ loopId, prompt });
        setTimeout(() => {
          db.updateLoop(loopId, {
            tmux_session: 'non_tmux',
            tmux_window: null,
            pid: launchedPid,
          });
          resolve({ ok: true, loop_id: loopId });
        }, 25);
      }),
    });

    const prompt = 'Async launch success path';
    const result = await sendCommand('loop', { prompt });
    assert.strictEqual(result.ok, true);
    assert.ok(result.loop_id);

    const loop = db.getLoop(result.loop_id);
    assert.ok(loop);
    assert.strictEqual(loop.status, 'active');
    assert.strictEqual(loop.pid, launchedPid);

    assert.strictEqual(loopCreatedEvents.length, 1);
    assert.strictEqual(loopCreatedEvents[0].loopId, result.loop_id);
    assert.strictEqual(loopCreatedEvents[0].prompt, prompt);
  });

  it('should return failure when async onLoopCreated reports launch failure', async () => {
    const launchError = 'simulated_async_launch_failure';
    loopCreatedEvents = [];
    await restartCliServer({
      onLoopCreated: (loopId, prompt) => new Promise((resolve) => {
        loopCreatedEvents.push({ loopId, prompt });
        setTimeout(() => {
          db.updateLoop(loopId, {
            status: 'failed',
            stopped_at: new Date().toISOString(),
            last_checkpoint: `launch_failed:${launchError}`,
            tmux_session: null,
            tmux_window: null,
            pid: null,
            last_heartbeat: new Date().toISOString(),
          });
          resolve({
            ok: false,
            error: cliServer.LOOP_LAUNCH_FAILED,
            message: cliServer.LOOP_LAUNCH_FAILED_MESSAGE,
            launch_error: launchError,
            terminalized: true,
            terminalization_error: null,
          });
        }, 25);
      }),
    });

    const prompt = 'Async launch failure path';
    const result = await sendCommand('loop', { prompt });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, cliServer.LOOP_LAUNCH_FAILED);
    assert.strictEqual(result.message, cliServer.LOOP_LAUNCH_FAILED_MESSAGE);
    assert.strictEqual(result.launch_error, launchError);
    assert.ok(result.loop_id);

    const loop = db.getLoop(result.loop_id);
    assert.ok(loop);
    assert.strictEqual(loop.status, 'failed');
    assert.strictEqual(loop.pid, null);
    assert.ok(String(loop.last_checkpoint).includes(`launch_failed:${launchError}`));

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

describe('CLI transport stdin payloads', () => {
  it('should create request from stdin payload', async () => {
    const payload = [
      'Multiline request description',
      'with shell chars: $VAR, `command`, and $(injection)',
      'with "quotes", \'single quotes\', and trailing space ',
      '',
    ].join('\n');
    const result = await runMac10Command(['request', '-'], payload);
    assert.strictEqual(result.status, 0, result.stderr);
    const match = result.stdout.match(/Request created: (req-[a-f0-9]{8})/);
    assert.ok(match);

    const request = db.getRequest(match[1]);
    assert.ok(request);
    assert.strictEqual(request.description, payload.trimEnd());
  });

  it('should create urgent fix from stdin payload', async () => {
    const payload = [
      'Fix request with "quotes", `backticks`, and newline',
      'line2',
      'shell-sensitive: $(command) && rm -rf /',
      '',
    ].join('\n');
    const result = await runMac10Command(['fix', '-'], payload);
    assert.strictEqual(result.status, 0, result.stderr);
    const match = result.stdout.match(/Urgent fix created: (req-[a-f0-9]{8}) \(task (\d+)\)/);
    assert.ok(match);

    const request = db.getRequest(match[1]);
    const task = db.getTask(match[2]);
    assert.ok(request);
    assert.ok(task);
    assert.strictEqual(request.description, payload.trimEnd());
    assert.strictEqual(task.description, payload.trimEnd());
  });

  it('should complete tier1 from stdin payload with literal multiline content', async () => {
    const requestId = db.createRequest('Tier1 stdin completion');
    db.updateRequest(requestId, { tier: 1, status: 'executing_tier1' });
    const payload = 'Line 1\nLine 2 with $VAR, `backticks`, $(subshell), &&, ||, ;';
    const result = await runMac10Command(['tier1-complete', requestId, '-'], payload);
    assert.strictEqual(result.status, 0, result.stderr);

    const req = db.getRequest(requestId);
    assert.strictEqual(req.result, payload);
    assert.strictEqual(req.status, 'completed');
  });

  it('should show tier1-complete stdin/result usage in help output', async () => {
    const result = await runMac10Command([]);
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    assert.ok(output.includes('tier1-complete <request_id> <result>'));
    assert.ok(output.includes('tier1-complete <request_id> -'));
  });

  it('should reject tier1-complete with empty stdin payload', async () => {
    const requestId = db.createRequest('Tier1 empty stdin completion');
    const result = await runMac10Command(['tier1-complete', requestId, '-'], '');
    assert.notStrictEqual(result.status, 0);
    assert.ok((result.stderr || '').includes('Usage: mac10 tier1-complete <request_id> -'));
    assert.ok((result.stderr || '').includes('Error: tier1-complete result from stdin cannot be empty.'));
  });
});
