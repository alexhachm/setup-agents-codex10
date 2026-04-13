'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { execFile, execFileSync, spawn } = require('child_process');

const db = require('../src/db');
const cliServer = require('../src/cli-server');
const knowledgeMeta = require('../src/knowledge-metadata');

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

function listMailForRecipient(recipient) {
  return db.getDb().prepare(`
    SELECT id, type, payload, consumed
    FROM mail
    WHERE recipient = ?
    ORDER BY id ASC
  `).all(recipient).map((row) => {
    let parsedPayload = null;
    try {
      parsedPayload = row.payload ? JSON.parse(row.payload) : null;
    } catch {
      parsedPayload = null;
    }
    return { ...row, payload: parsedPayload };
  });
}

function getConsumedByMarker(recipient) {
  return Object.fromEntries(
    listMailForRecipient(recipient).map((row) => [row.payload && row.payload.marker, row.consumed])
  );
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

function runMac10CliWithStdin(args, stdinPayload) {
  const cliPath = path.join(__dirname, '..', 'bin', 'mac10');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, '--project', tmpDir, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      resolve({
        status: Number.isInteger(code) ? code : 1,
        stdout,
        stderr,
      });
    });
    child.stdin.end(stdinPayload);
  });
}

function parseCliJsonOutput(rawOutput) {
  const trimmed = String(rawOutput || '').trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function runGit(args, cwd = tmpDir) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function initStatusGitRepo({ divergeFromOriginMain = false, makeDirty = false } = {}) {
  runGit(['init', '--initial-branch=main']);
  runGit(['config', 'user.email', 'status-tests@example.com']);
  runGit(['config', 'user.name', 'Status Tests']);

  fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.claude/\norigin.git/\n');
  const trackedFile = path.join(tmpDir, 'status-telemetry.txt');
  fs.writeFileSync(trackedFile, 'baseline\n');
  runGit(['add', '.gitignore', 'status-telemetry.txt']);
  runGit(['commit', '-m', 'initial status telemetry commit']);

  const remotePath = path.join(tmpDir, 'origin.git');
  runGit(['init', '--bare', remotePath]);
  runGit(['remote', 'add', 'origin', remotePath]);
  runGit(['push', '-u', 'origin', 'main']);

  if (divergeFromOriginMain) {
    fs.appendFileSync(trackedFile, 'local drift\n');
    runGit(['add', 'status-telemetry.txt']);
    runGit(['commit', '-m', 'local drift']);
  }

  if (makeDirty) {
    fs.writeFileSync(path.join(tmpDir, 'dirty-status-file.txt'), 'dirty worktree\n');
  }
}

async function setConfigValue(key, value) {
  const result = await sendCommand('set-config', { key, value: String(value) });
  assert.strictEqual(result.ok, true, `set-config should succeed for ${key}`);
}

function createReadyTask({
  subject,
  description,
  priority = 'normal',
  tier = 2,
  domain = null,
  files = null,
  validation = null,
}) {
  const requestId = db.createRequest(`Req: ${subject}`);
  const taskId = db.createTask({
    request_id: requestId,
    subject,
    description,
    domain,
    files,
    priority,
    tier,
    validation,
  });
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

function getWorkerResetEvents(workerId, action) {
  const entries = db.getLog(500, `worker-${workerId}`);
  return entries.filter((entry) => {
    if (entry.action !== action) return false;
    try {
      JSON.parse(entry.details);
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

  it('should respond to health-check with uptime and worker info', async () => {
    const result = await sendCommand('health-check', {});
    assert.strictEqual(result.ok, true);
    assert.ok(typeof result.uptime_ms === 'number' && result.uptime_ms >= 0, 'uptime_ms should be a non-negative number');
    assert.ok(typeof result.uptime_human === 'string' && result.uptime_human.length > 0, 'uptime_human should be a non-empty string');
    assert.ok(typeof result.worker_count === 'number', 'worker_count should be a number');
    assert.ok(typeof result.idle_workers === 'number', 'idle_workers should be a number');
    assert.ok(typeof result.active_tasks === 'number', 'active_tasks should be a number');
    assert.strictEqual(result.project_dir, tmpDir);
    assert.ok(result.workers && typeof result.workers.total === 'number', 'workers summary should be present');
    assert.ok(result.tasks && typeof result.tasks.active === 'number', 'tasks summary should be present');
    assert.ok(result.isolation && Array.isArray(result.isolation.priority), 'isolation summary should be present');
    assert.ok(result.runtime && result.runtime.research, 'runtime research summary should be present');
  });

  it('should serve bounded task context bundles', async () => {
    const knowledgeDir = path.join(tmpDir, '.claude', 'knowledge');
    fs.mkdirSync(path.join(knowledgeDir, 'codebase', 'domains'), { recursive: true });
    fs.mkdirSync(path.join(knowledgeDir, 'research', 'topics', 'coordinator-core'), { recursive: true });
    fs.writeFileSync(
      path.join(knowledgeDir, 'codebase', 'domains', 'coordinator-core.md'),
      '# Coordinator Core\n\nCoordinator core context from canonical knowledge.\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(knowledgeDir, 'mistakes.md'),
      '# Known Pitfalls\n\nAvoid repeating coordinator startup failures.\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(knowledgeDir, 'research', 'topics', 'coordinator-core', '_rollup.md'),
      '## Current Recommended Approach\n\nUse coordinator-owned state instead of direct file state.\n',
      'utf8'
    );

    db.registerWorker(1, path.join(tmpDir, '.worktrees', 'wt-1'), 'agent-1');
    const reqId = db.createRequest('Need a context bundle');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Build context bundle',
      description: 'Return task context from coordinator state',
      domain: 'coordinator-core',
      files: ['coordinator/src/cli-server.js', 'coordinator/src/context-bundle.js'],
      priority: 'high',
      tier: 2,
      validation: { test_cmd: 'node --test coordinator/tests/cli.test.js' },
    });
    db.updateTask(taskId, {
      status: 'assigned',
      assigned_to: 1,
      overlap_with: JSON.stringify([99]),
      routing_class: 'mid',
      routed_model: 'sonnet',
      model_source: 'test-router',
    });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      domain: 'coordinator-core',
      launched_at: '2026-04-13T12:00:00.000Z',
    });
    const sandbox = db.createTaskSandbox({ task_id: taskId, worker_id: 1, backend: 'tmux' });
    const failedTaskId = db.createTask({
      request_id: reqId,
      subject: 'Earlier failure',
      description: 'Previous related failure',
      domain: 'coordinator-core',
      tier: 2,
    });
    db.updateTask(failedTaskId, {
      status: 'failed',
      result: 'Previous context bundle failure',
    });
    const mergeRow = db.enqueueMerge({
      request_id: reqId,
      task_id: failedTaskId,
      pr_url: 'https://github.com/org/repo/pull/10',
      branch: 'agent-1',
    });
    db.updateMerge(mergeRow.lastInsertRowid, { status: 'failed', error: 'merge failed' });

    const result = await sendCommand('task-context', { task_id: taskId });
    assert.strictEqual(result.ok, true);
    const bundle = result.bundle;
    assert.strictEqual(bundle.task.id, taskId);
    assert.strictEqual(bundle.assignment.request.id, reqId);
    assert.strictEqual(bundle.assignment.worker.id, 1);
    assert.strictEqual(bundle.assignment.task_sandbox.id, sandbox.id);
    assert.deepStrictEqual(bundle.safe_edit_files.explicit, [
      'coordinator/src/cli-server.js',
      'coordinator/src/context-bundle.js',
    ]);
    assert.deepStrictEqual(bundle.safe_edit_files.overlap_task_ids, [99]);
    assert.deepStrictEqual(bundle.validation.explicit_commands, [
      { label: 'test', command: 'node --test coordinator/tests/cli.test.js' },
    ]);
    assert.match(bundle.knowledge.domain.content, /Coordinator core context/);
    assert.match(bundle.knowledge.research[0].content, /coordinator-owned state/);
    assert.match(bundle.knowledge.known_pitfalls.content, /coordinator startup failures/);
    assert.ok(bundle.recent_related_failures.tasks.some((task) => task.id === failedTaskId));
    assert.ok(bundle.recent_related_failures.merges.some((merge) => merge.error === 'merge failed'));
    assert.ok(bundle.runtime_health && bundle.runtime_health.runtime);

    const cliResult = await runMac10Cli(['context-bundle', String(taskId)]);
    assert.strictEqual(cliResult.status, 0, cliResult.stderr);
    const cliBundle = parseCliJsonOutput(cliResult.stdout);
    assert.strictEqual(cliBundle.task.id, taskId);
    assert.strictEqual(cliBundle.assignment.task_sandbox.id, sandbox.id);
  });

  it('should default npm_config_if_present to true when unset', async () => {
    const originalIfPresent = process.env.npm_config_if_present;
    try {
      cliServer.stop();
      delete process.env.npm_config_if_present;
      server = cliServer.start(tmpDir, {
        onTaskCompleted: () => {},
        onLoopCreated: (loopId, prompt) => {
          loopCreatedEvents.push({ loopId, prompt });
        },
      });
      await waitForCliServerReady();

      assert.strictEqual(process.env.npm_config_if_present, 'true');
    } finally {
      if (typeof originalIfPresent === 'undefined') {
        delete process.env.npm_config_if_present;
      } else {
        process.env.npm_config_if_present = originalIfPresent;
      }
    }
  });

  it('should preserve explicit npm_config_if_present overrides', async () => {
    const originalIfPresent = process.env.npm_config_if_present;
    try {
      cliServer.stop();
      process.env.npm_config_if_present = 'false';
      server = cliServer.start(tmpDir, {
        onTaskCompleted: () => {},
        onLoopCreated: (loopId, prompt) => {
          loopCreatedEvents.push({ loopId, prompt });
        },
      });
      await waitForCliServerReady();

      assert.strictEqual(process.env.npm_config_if_present, 'false');
    } finally {
      if (typeof originalIfPresent === 'undefined') {
        delete process.env.npm_config_if_present;
      } else {
        process.env.npm_config_if_present = originalIfPresent;
      }
    }
  });

  it('should create a request', async () => {
    const result = await sendCommand('request', { description: 'Add login page' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.request_id.startsWith('req-'));

    const req = db.getRequest(result.request_id);
    assert.strictEqual(req.description, 'Add login page');
    assert.strictEqual(req.status, 'pending');
  });

  it('should reject autonomous command-template payloads for request creation', async () => {
    const autonomousPromptPayload = [
      'You are **Master-2: Architect** running on **Deep**.',
      '',
      'Follow this protocol exactly.',
      '',
      '## Internal Counters (Track These)',
      '```',
      'tier1_count = 0',
      'decomposition_count = 0',
      '```',
      '',
      '## Step 1: Startup',
      './.claude/scripts/mac10 inbox architect',
      '',
      '## Phase: Follow-Up Check',
      'sleep 15',
      '',
      '## Phase: Budget/Reset Exit',
      './.claude/scripts/mac10 distill 2 "orchestration" "Full distillation"',
    ].join('\n');

    const result = await sendCommand('request', { description: autonomousPromptPayload });
    assert.strictEqual(result.ok, undefined);
    assert.match(result.error, /autonomous command-template payload/i);

    const requests = db.listRequests();
    assert.strictEqual(requests.length, 0);

    const rejectionEvents = db.getLog(200, 'coordinator').filter((entry) => entry.action === 'request_rejected_autonomous_payload');
    assert.strictEqual(rejectionEvents.length, 1);
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
    assert.ok(result.source_revision);
    for (const key of ['current_branch', 'head_commit', 'origin_main_commit', 'ahead_count', 'behind_count', 'dirty_worktree']) {
      assert.ok(Object.prototype.hasOwnProperty.call(result.source_revision, key));
    }
  });

  it('should gracefully fallback source_revision when git metadata is unavailable', async () => {
    const result = await sendCommand('status', {});
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.source_revision, {
      current_branch: null,
      head_commit: null,
      origin_main_commit: null,
      ahead_count: null,
      behind_count: null,
      dirty_worktree: null,
    });
  });

  it('should expose source_revision telemetry when git metadata is available', async () => {
    initStatusGitRepo();

    const result = await sendCommand('status', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.source_revision.current_branch, 'main');
    assert.match(result.source_revision.head_commit, /^[0-9a-f]{40}$/);
    assert.match(result.source_revision.origin_main_commit, /^[0-9a-f]{40}$/);
    assert.strictEqual(result.source_revision.ahead_count, 0);
    assert.strictEqual(result.source_revision.behind_count, 0);
    assert.strictEqual(result.source_revision.dirty_worktree, false);
  });

  it('should render source_revision warning in CLI status output when revision drift exists', async () => {
    initStatusGitRepo({ divergeFromOriginMain: true, makeDirty: true });

    const result = await runMac10Cli(['status']);
    assert.strictEqual(result.status, 0, result.stderr);
    assert.strictEqual(result.stderr, '');
    assert.match(result.stdout, /Source Revision: branch:main/);
    assert.match(result.stdout, /ahead:1/);
    assert.match(result.stdout, /worktree:dirty/);
    assert.match(result.stdout, /WARNING: Source revision drift detected/);
  });

  it('should default npm_config_if_present on startup when unset', async () => {
    const previousValue = process.env.npm_config_if_present;
    try {
      delete process.env.npm_config_if_present;
      cliServer.stop();
      server = cliServer.start(tmpDir, {
        onTaskCompleted: () => {},
        onLoopCreated: (loopId, prompt) => {
          loopCreatedEvents.push({ loopId, prompt });
        },
      });
      await waitForCliServerReady();
      assert.strictEqual(process.env.npm_config_if_present, 'true');
    } finally {
      if (typeof previousValue === 'undefined') {
        delete process.env.npm_config_if_present;
      } else {
        process.env.npm_config_if_present = previousValue;
      }
    }
  });

  it('should preserve explicit npm_config_if_present values on startup', async () => {
    const previousValue = process.env.npm_config_if_present;
    try {
      process.env.npm_config_if_present = 'false';
      cliServer.stop();
      server = cliServer.start(tmpDir, {
        onTaskCompleted: () => {},
        onLoopCreated: (loopId, prompt) => {
          loopCreatedEvents.push({ loopId, prompt });
        },
      });
      await waitForCliServerReady();
      assert.strictEqual(process.env.npm_config_if_present, 'false');
    } finally {
      if (typeof previousValue === 'undefined') {
        delete process.env.npm_config_if_present;
      } else {
        process.env.npm_config_if_present = previousValue;
      }
    }
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

  it('should read tier1-complete payload from stdin when result arg is a lone dash', async () => {
    const reqResult = await sendCommand('request', { description: 'Tier 1 completion via stdin payload' });
    assert.strictEqual(reqResult.ok, true);

    const stdinPayload = '  Leading spaces preserved\nSecond line\n';
    const cliResult = await runMac10CliWithStdin(['tier1-complete', reqResult.request_id, '-'], stdinPayload);
    assert.strictEqual(cliResult.status, 0, cliResult.stderr);
    assert.strictEqual(cliResult.stderr, '');
    assert.match(cliResult.stdout, /Tier 1 completed\./);

    const request = db.getRequest(reqResult.request_id);
    assert.strictEqual(request.status, 'completed');
    assert.strictEqual(request.result, stdinPayload);
  });

  it('should treat tier1-complete dash as a literal when additional result tokens are present', async () => {
    const reqResult = await sendCommand('request', { description: 'Tier 1 completion literal dash payload' });
    assert.strictEqual(reqResult.ok, true);

    const cliResult = await runMac10Cli(['tier1-complete', reqResult.request_id, '-', 'literal', 'payload']);
    assert.strictEqual(cliResult.status, 0, cliResult.stderr);
    assert.strictEqual(cliResult.stderr, '');
    assert.match(cliResult.stdout, /Tier 1 completed\./);

    const request = db.getRequest(reqResult.request_id);
    assert.strictEqual(request.status, 'completed');
    assert.strictEqual(request.result, '- literal payload');
  });

  it('should reject create-task with depends_on containing an object', async () => {
    const reqResult = await sendCommand('request', { description: 'Feature' });
    const result = await sendCommand('create-task', {
      request_id: reqResult.request_id,
      subject: 'Bad dep obj',
      description: 'Task with bad dependency',
      depends_on: [{}],
    });
    assert.ok(result.error, 'Expected an error response');
    assert.match(result.error, /depends_on elements must be positive integers/i);
  });

  it('should reject create-task with depends_on containing a string', async () => {
    const reqResult = await sendCommand('request', { description: 'Feature' });
    const result = await sendCommand('create-task', {
      request_id: reqResult.request_id,
      subject: 'Bad dep str',
      description: 'Task with string dependency',
      depends_on: ['abc'],
    });
    assert.ok(result.error, 'Expected an error response');
    assert.match(result.error, /depends_on elements must be positive integers/i);
  });

  it('should accept create-task with depends_on containing valid positive integer ids', async () => {
    const reqResult = await sendCommand('request', { description: 'Feature' });
    // Create two prerequisite tasks first
    const dep1 = await sendCommand('create-task', {
      request_id: reqResult.request_id,
      subject: 'Dep 1',
      description: 'First dependency',
      tier: 2,
    });
    const dep2 = await sendCommand('create-task', {
      request_id: reqResult.request_id,
      subject: 'Dep 2',
      description: 'Second dependency',
      tier: 2,
    });
    assert.strictEqual(dep1.ok, true);
    assert.strictEqual(dep2.ok, true);
    const result = await sendCommand('create-task', {
      request_id: reqResult.request_id,
      subject: 'Dependent task',
      description: 'Task with valid integer deps',
      depends_on: [dep1.task_id, dep2.task_id],
      tier: 2,
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.task_id);
  });

  it('should handle malformed depends_on data in checkAndPromoteTasks gracefully', () => {
    // Directly inject a task with a non-integer element in depends_on to simulate malformed DB data
    const reqId = db.createRequest('Feature');
    const taskId = db.createTask({ request_id: reqId, subject: 'Malformed dep task', description: 'Test' });
    // Force malformed depends_on into DB (bypassing validation)
    db.getDb().prepare("UPDATE tasks SET status = 'pending', depends_on = '[\"notanint\"]' WHERE id = ?").run(taskId);
    // Should not throw; should mark task as failed
    assert.doesNotThrow(() => db.checkAndPromoteTasks());
    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'failed');
    assert.match(task.result, /Malformed depends_on/i);
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
    assert.strictEqual(completedTask.usage_input_audio_tokens, null);
    assert.strictEqual(completedTask.usage_output_audio_tokens, null);
    assert.strictEqual(completedTask.usage_reasoning_tokens, null);
    assert.strictEqual(completedTask.usage_accepted_prediction_tokens, null);
    assert.strictEqual(completedTask.usage_rejected_prediction_tokens, null);
    assert.strictEqual(completedTask.usage_cached_tokens, null);
    assert.strictEqual(completedTask.usage_cache_creation_tokens, null);
    assert.strictEqual(completedTask.usage_total_tokens, null);
    assert.strictEqual(completedTask.usage_cost_usd, null);
    assert.strictEqual(completedTask.usage_payload_json, null);
    assert.strictEqual(db.getWorker(1).status, 'completed_task');
  });

  it('should expose task sandbox lifecycle commands', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Sandbox lifecycle command test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Sandboxed task', description: 'Track task sandbox state' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1, branch: 'agent-1-task-1' });

    const created = await sendCommand('task-sandbox-create', {
      task_id: taskId,
      backend: 'docker',
      metadata: { source: 'test' },
    });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.sandbox.task_id, taskId);
    assert.strictEqual(created.sandbox.request_id, reqId);
    assert.strictEqual(created.sandbox.worker_id, 1);
    assert.strictEqual(created.sandbox.status, 'allocated');
    assert.strictEqual(created.sandbox.backend, 'docker');
    const sandboxId = created.sandbox.id;

    const duplicate = await sendCommand('task-sandbox-create', {
      task_id: taskId,
      backend: 'docker',
    });
    assert.strictEqual(duplicate.ok, undefined);
    assert.match(duplicate.error, /active_task_sandbox_exists/);

    const ready = await sendCommand('task-sandbox-ready', {
      id: sandboxId,
      sandbox_path: '/tmp/task-sandbox',
    });
    assert.strictEqual(ready.ok, true);
    assert.strictEqual(ready.sandbox.status, 'ready');
    assert.strictEqual(ready.sandbox.sandbox_path, '/tmp/task-sandbox');

    const running = await sendCommand('task-sandbox-start', { id: sandboxId });
    assert.strictEqual(running.ok, true);
    assert.strictEqual(running.sandbox.status, 'running');
    assert.ok(running.sandbox.started_at);

    const stopped = await sendCommand('task-sandbox-stop', { id: sandboxId, error: 'normal exit' });
    assert.strictEqual(stopped.ok, true);
    assert.strictEqual(stopped.sandbox.status, 'stopped');
    assert.strictEqual(stopped.sandbox.error, 'normal exit');

    const status = await sendCommand('task-sandbox-status', { task_id: taskId });
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.count, 1);
    assert.strictEqual(status.sandboxes[0].id, sandboxId);

    const cleaned = await sendCommand('task-sandbox-clean', { id: sandboxId });
    assert.strictEqual(cleaned.ok, true);
    assert.strictEqual(cleaned.sandbox.status, 'cleaned');
    assert.ok(cleaned.sandbox.cleaned_at);
  });

  it('should expose dry-run capable task sandbox cleanup', async () => {
    const reqId = db.createRequest('Sandbox cleanup command test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Sandbox cleanup', description: 'Clean stale sandbox' });
    const sandbox = db.createTaskSandbox({ task_id: taskId });
    db.transitionTaskSandbox(sandbox.id, 'running');
    db.transitionTaskSandbox(sandbox.id, 'stopped');

    const oldTs = '2026-01-01T00:00:00.000Z';
    db.getDb().prepare(`
      UPDATE task_sandboxes
      SET stopped_at = ?, updated_at = ?
      WHERE id = ?
    `).run(oldTs, oldTs, sandbox.id);

    const dryRun = await sendCommand('task-sandbox-cleanup', {
      max_age_minutes: 60,
      dry_run: true,
    });
    assert.strictEqual(dryRun.ok, true);
    assert.strictEqual(dryRun.dry_run, true);
    assert.strictEqual(dryRun.cleaned_count, 0);
    assert.deepStrictEqual(dryRun.ids, [sandbox.id]);
    assert.strictEqual(db.getTaskSandbox(sandbox.id).status, 'stopped');

    const cleanup = await sendCommand('task-sandbox-cleanup', {
      max_age_minutes: 60,
    });
    assert.strictEqual(cleanup.ok, true);
    assert.strictEqual(cleanup.cleaned_count, 1);
    assert.deepStrictEqual(cleanup.ids, [sandbox.id]);
    assert.strictEqual(db.getTaskSandbox(sandbox.id).status, 'cleaned');
  });

  it('should expose Docker provider smoke through RPC', async () => {
    const childProcess = require('child_process');
    delete require.cache[require.resolve('../src/sandbox-manager')];
    const execMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
      if (cmd === 'docker' && args[0] === 'info') return '';
      if (cmd === 'docker' && args[0] === 'images') return 'mac10-worker:latest\n';
      if (cmd === 'docker' && args[0] === 'run') {
        return [
          'provider=claude',
          'cli=claude',
          'cli_available=true',
          'auth_check=pass',
          'noninteractive_launch=dry_run_pass',
          'noninteractive_exec=skipped',
          'provider_smoke=pass',
        ].join('\n');
      }
      return '';
    });

    try {
      const result = await sendCommand('sandbox-provider-smoke', {
        provider: 'claude',
        build: false,
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.provider, 'claude');
      assert.strictEqual(result.parsed.auth_check, 'pass');
      assert.strictEqual(result.parsed.noninteractive_launch, 'dry_run_pass');
    } finally {
      execMock.mock.restore();
      delete require.cache[require.resolve('../src/sandbox-manager')];
    }
  });

  it('should create worker worktree without copying runtime provider state', async () => {
    runGit(['init', '--initial-branch=main']);
    runGit(['config', 'user.email', 'add-worker@example.com']);
    runGit(['config', 'user.name', 'Add Worker Test']);
    fs.writeFileSync(
      path.join(tmpDir, '.gitignore'),
      '.worktrees/\n.claude/state/\n.claude/logs/\n.claude/signals/\n'
    );
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'baseline\n');
    runGit(['add', '.gitignore', 'README.md']);
    runGit(['commit', '-m', 'initial commit']);

    const sourceFiles = {
      '.claude/commands/worker-loop.md': '# Worker Loop\n',
      '.claude/knowledge/mistakes.md': '# Mistakes\n',
      '.claude/knowledge/domain/coordinator.md': '# Coordinator\n',
      '.claude/scripts/mac10': '#!/usr/bin/env bash\n',
      '.claude/agents/worker.md': '# Worker Agent\n',
      '.claude/hooks/pre-tool.sh': '#!/usr/bin/env bash\n',
      '.claude/settings.json': '{ "hooks": {} }\n',
      '.claude/worker-claude.md': '# Worker Claude\n',
      '.claude/worker-agents.md': '# Worker Agents\n',
    };
    for (const [relativePath, content] of Object.entries(sourceFiles)) {
      const filePath = path.join(tmpDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }

    const runtimeFiles = [
      '.claude/state/agent-launcher.env',
      '.claude/logs/research-driver.log',
      '.claude/signals/.mac10.restart-signal',
    ];
    for (const relativePath of runtimeFiles) {
      const filePath = path.join(tmpDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'runtime\n');
    }

    db.setConfig('project_dir', tmpDir);
    db.setConfig('primary_branch', 'main');

    const result = await sendCommand('add-worker', {});
    assert.strictEqual(result.ok, true, result.error);
    assert.strictEqual(result.worker_id, 1);

    const worktreePath = result.worktree_path;
    assert.ok(fs.existsSync(path.join(worktreePath, '.claude', 'commands', 'worker-loop.md')));
    assert.ok(fs.existsSync(path.join(worktreePath, '.claude', 'knowledge', 'mistakes.md')));
    assert.ok(fs.existsSync(path.join(worktreePath, '.claude', 'knowledge', 'domain', 'coordinator.md')));
    assert.ok(fs.existsSync(path.join(worktreePath, 'CLAUDE.md')));
    assert.ok(fs.existsSync(path.join(worktreePath, 'AGENTS.md')));
    assert.strictEqual(fs.readFileSync(path.join(worktreePath, 'AGENTS.md'), 'utf8'), '# Worker Agents\n');
    assert.strictEqual(fs.readFileSync(path.join(worktreePath, 'CLAUDE.md'), 'utf8'), '# Worker Agents\n');
    assert.strictEqual(fs.existsSync(path.join(worktreePath, '.claude', 'state')), false);
    assert.strictEqual(fs.existsSync(path.join(worktreePath, '.claude', 'logs')), false);
    assert.strictEqual(fs.existsSync(path.join(worktreePath, '.claude', 'signals')), false);
    assert.strictEqual(db.getWorker(1).worktree_path, worktreePath);
  });

  it('should orchestrate browser research lifecycle with idempotent command replays', async () => {
    const requestId = db.createRequest('Browser research orchestration');
    const taskId = db.createTask({
      request_id: requestId,
      subject: 'Run browser research',
      description: 'Need guided ChatGPT browser workflow',
    });

    const createSession = await sendCommand('browser-create-session', {
      task_id: taskId,
      workflow_url: 'https://chatgpt.com/g/guided-research',
      idempotency_key: 'create-session-0001',
    });
    assert.strictEqual(createSession.ok, true);
    assert.strictEqual(createSession.browser_offload_status, 'requested');
    assert.match(createSession.session_id, /^session-[a-f0-9]{16}$/);

    const createSessionReplay = await sendCommand('browser-create-session', {
      task_id: taskId,
      workflow_url: 'https://chatgpt.com/g/guided-research',
      idempotency_key: 'create-session-0001',
    });
    assert.strictEqual(createSessionReplay.ok, true);
    assert.strictEqual(createSessionReplay.idempotent, true);
    assert.strictEqual(createSessionReplay.session_id, createSession.session_id);

    const attachSession = await sendCommand('browser-attach-session', {
      task_id: taskId,
      session_id: createSession.session_id,
      idempotency_key: 'attach-session-0001',
    });
    assert.strictEqual(attachSession.ok, true);
    assert.strictEqual(attachSession.browser_offload_status, 'attached');

    const startJob = await sendCommand('browser-start-job', {
      task_id: taskId,
      session_id: createSession.session_id,
      workflow_url: 'https://chatgpt.com/g/guided-research',
      guidance: 'Collect current security release notes and summarize key changes.',
      idempotency_key: 'start-job-0001',
    });
    assert.strictEqual(startJob.ok, true);
    assert.strictEqual(startJob.browser_offload_status, 'awaiting_callback');
    assert.match(startJob.job_id, /^job-[a-f0-9]{16}$/);
    assert.ok(startJob.callback_token.length >= 24);

    const startReplay = await sendCommand('browser-start-job', {
      task_id: taskId,
      session_id: createSession.session_id,
      workflow_url: 'https://chatgpt.com/g/guided-research',
      guidance: 'Collect current security release notes and summarize key changes.',
      idempotency_key: 'start-job-0001',
    });
    assert.strictEqual(startReplay.ok, true);
    assert.strictEqual(startReplay.idempotent, true);
    assert.strictEqual(startReplay.job_id, startJob.job_id);
    assert.strictEqual(startReplay.callback_token, startJob.callback_token);

    const chunkOne = await sendCommand('browser-callback-chunk', {
      task_id: taskId,
      session_id: createSession.session_id,
      job_id: startJob.job_id,
      callback_token: startJob.callback_token,
      idempotency_key: 'chunk-0001',
      chunk_index: 0,
      chunk: 'alpha ',
    });
    assert.strictEqual(chunkOne.ok, true);
    assert.strictEqual(chunkOne.callback_count, 1);

    const chunkTwo = await sendCommand('browser-callback-chunk', {
      task_id: taskId,
      session_id: createSession.session_id,
      job_id: startJob.job_id,
      callback_token: startJob.callback_token,
      idempotency_key: 'chunk-0002',
      chunk_index: 1,
      chunk: 'beta',
    });
    assert.strictEqual(chunkTwo.ok, true);
    assert.strictEqual(chunkTwo.callback_count, 2);

    const statusBeforeComplete = await sendCommand('browser-job-status', {
      task_id: taskId,
      session_id: createSession.session_id,
      job_id: startJob.job_id,
    });
    assert.strictEqual(statusBeforeComplete.ok, true);
    assert.strictEqual(statusBeforeComplete.browser_offload_status, 'awaiting_callback');
    assert.strictEqual(statusBeforeComplete.callback_count, 2);

    const completeJob = await sendCommand('browser-complete-job', {
      task_id: taskId,
      session_id: createSession.session_id,
      job_id: startJob.job_id,
      callback_token: startJob.callback_token,
      idempotency_key: 'complete-job-0001',
      result: { summary: 'complete' },
    });
    assert.strictEqual(completeJob.ok, true);
    assert.strictEqual(completeJob.browser_offload_status, 'completed');

    const statusAfterComplete = await sendCommand('browser-job-status', {
      task_id: taskId,
      session_id: createSession.session_id,
      job_id: startJob.job_id,
    });
    assert.strictEqual(statusAfterComplete.ok, true);
    assert.strictEqual(statusAfterComplete.browser_offload_status, 'completed');
    assert.ok(statusAfterComplete.result);
    assert.strictEqual(statusAfterComplete.result.callback_text, 'alpha beta');
    assert.deepStrictEqual(statusAfterComplete.result.result, { summary: 'complete' });

    const persistedTask = db.getTask(taskId);
    assert.strictEqual(persistedTask.browser_offload_status, 'completed');
    assert.ok(persistedTask.browser_offload_result);

    const coordinatorEntries = db.getLog(500, 'coordinator');
    const browserEvents = coordinatorEntries
      .filter((entry) => entry.action.startsWith('browser_research_'))
      .map((entry) => entry.action);
    for (const expectedAction of [
      'browser_research_session_created',
      'browser_research_session_attached',
      'browser_research_job_started',
      'browser_research_callback_chunk_received',
      'browser_research_job_completed',
      'browser_research_job_status_fetched',
    ]) {
      assert.ok(browserEvents.includes(expectedAction), `Missing browser event: ${expectedAction}`);
    }
  });

  it('should expose browser research command contracts through the mac10 CLI', async () => {
    const requestId = db.createRequest('CLI browser contract test');
    const taskId = db.createTask({
      request_id: requestId,
      subject: 'CLI browser research',
      description: 'Exercise browser command flow over mac10 CLI',
    });

    const createCli = await runMac10Cli([
      'browser-create-session',
      String(taskId),
      'https://chatgpt.com/g/cli-contract',
      'cli-create-key-0001',
    ]);
    assert.strictEqual(createCli.status, 0, createCli.stderr);
    const createPayload = parseCliJsonOutput(createCli.stdout);
    assert.strictEqual(createPayload.ok, true);
    assert.match(createPayload.session_id, /^session-[a-f0-9]{16}$/);

    const attachCli = await runMac10Cli([
      'browser-attach-session',
      String(taskId),
      createPayload.session_id,
      'cli-attach-key-0001',
    ]);
    assert.strictEqual(attachCli.status, 0, attachCli.stderr);
    const attachPayload = parseCliJsonOutput(attachCli.stdout);
    assert.strictEqual(attachPayload.ok, true);
    assert.strictEqual(attachPayload.browser_offload_status, 'attached');

    const startCli = await runMac10Cli([
      'browser-start-job',
      String(taskId),
      createPayload.session_id,
      'https://chatgpt.com/g/cli-contract',
      'cli-start-key-0001',
      'Use browser guidance from CLI contract test',
    ]);
    assert.strictEqual(startCli.status, 0, startCli.stderr);
    const startPayload = parseCliJsonOutput(startCli.stdout);
    assert.strictEqual(startPayload.ok, true);
    assert.strictEqual(startPayload.browser_offload_status, 'awaiting_callback');
    assert.match(startPayload.job_id, /^job-[a-f0-9]{16}$/);

    const statusCli = await runMac10Cli([
      'browser-job-status',
      String(taskId),
      createPayload.session_id,
      startPayload.job_id,
    ]);
    assert.strictEqual(statusCli.status, 0, statusCli.stderr);
    const statusPayload = parseCliJsonOutput(statusCli.stdout);
    assert.strictEqual(statusPayload.ok, true);
    assert.strictEqual(statusPayload.browser_offload_status, 'awaiting_callback');
  });

  it('should skip reset-worker without ownership context when active assignment exists', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Reset guard without ownership context');
    const taskId = db.createTask({ request_id: reqId, subject: 'Guard reset', description: 'Do not clear active assignment' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: null,
      launched_at: '2026-03-16T09:00:00.000Z',
    });

    const result = await sendCommand('reset-worker', { worker_id: '1' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'missing_ownership_context');

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'assigned');
    assert.strictEqual(worker.current_task_id, null);
    assert.strictEqual(db.getTask(taskId).status, 'assigned');
    assert.strictEqual(db.getTask(taskId).assigned_to, 1);

    const skippedEvents = getWorkerResetEvents(1, 'sentinel_reset_skipped');
    assert.ok(skippedEvents.length >= 1);
  });

  it('should require matching ownership context for reset-worker and expose assignment token via my-task', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Reset guard with ownership context');
    const taskId = db.createTask({ request_id: reqId, subject: 'Guard reset with token', description: 'Ensure stale sentinel cannot clobber' });
    const assignmentToken = '2026-03-16T10:00:00.000Z';

    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'busy',
      current_task_id: taskId,
      launched_at: assignmentToken,
    });

    const myTask = await sendCommand('my-task', { worker_id: '1' });
    assert.strictEqual(myTask.ok, true);
    assert.strictEqual(myTask.task.id, taskId);
    assert.strictEqual(myTask.task.assignment_token, assignmentToken);

    const staleTaskContext = await sendCommand('reset-worker', { worker_id: `1|9999|${assignmentToken}` });
    assert.strictEqual(staleTaskContext.ok, true);
    assert.strictEqual(staleTaskContext.skipped, true);
    assert.strictEqual(staleTaskContext.reason, 'task_mismatch');

    const staleTokenContext = await sendCommand('reset-worker', { worker_id: `1|${taskId}|2026-03-16T11:00:00.000Z` });
    assert.strictEqual(staleTokenContext.ok, true);
    assert.strictEqual(staleTokenContext.skipped, true);
    assert.strictEqual(staleTokenContext.reason, 'assignment_mismatch');

    const validContext = await sendCommand('reset-worker', { worker_id: `1|${taskId}|${assignmentToken}` });
    assert.strictEqual(validContext.ok, true);
    assert.strictEqual(validContext.skipped, undefined);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);

    const resetEvents = getWorkerResetEvents(1, 'sentinel_reset');
    assert.ok(resetEvents.length >= 1);
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

  it('should skip start-task with ok:true when worker current_task_id does not match', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Stale start-task guard');
    const oldTaskId = db.createTask({ request_id: reqId, subject: 'Old task', description: 'Was reassigned' });
    const newTaskId = db.createTask({ request_id: reqId, subject: 'New task', description: 'Worker now owns this' });
    db.updateTask(oldTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(newTaskId, { status: 'assigned', assigned_to: 1 });
    // Worker's current assignment has moved to newTaskId (watchdog reassigned)
    db.updateWorker(1, { status: 'assigned', current_task_id: newTaskId });

    const result = await sendCommand('start-task', { worker_id: '1', task_id: String(oldTaskId) });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'worker_current_task_mismatch');

    // Task and worker state must be unchanged
    assert.strictEqual(db.getTask(oldTaskId).status, 'assigned');
    assert.strictEqual(db.getTask(oldTaskId).started_at, null);
    assert.strictEqual(db.getWorker(1).current_task_id, newTaskId);
    assert.strictEqual(getWorkerTaskStartedEvents(1, oldTaskId).length, 0);
    assert.strictEqual(getCoordinatorOwnershipMismatchEvents('start-task', 1, oldTaskId).length, 1);
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
    assert.strictEqual(request.completed_at, null);
    assert.strictEqual(request.result, null);

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
      model: '  claude-sonnet  ',
      input_tokens: 1200,
      output_tokens: 345,
      input_audio_tokens: 45,
      output_audio_tokens: 23,
      reasoning_tokens: 89,
      accepted_prediction_tokens: 21,
      rejected_prediction_tokens: 34,
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
    assert.strictEqual(completedTask.usage_model, 'claude-sonnet');
    assert.strictEqual(completedTask.usage_input_tokens, usage.input_tokens);
    assert.strictEqual(completedTask.usage_output_tokens, usage.output_tokens);
    assert.strictEqual(completedTask.usage_input_audio_tokens, usage.input_audio_tokens);
    assert.strictEqual(completedTask.usage_output_audio_tokens, usage.output_audio_tokens);
    assert.strictEqual(completedTask.usage_reasoning_tokens, usage.reasoning_tokens);
    assert.strictEqual(completedTask.usage_accepted_prediction_tokens, usage.accepted_prediction_tokens);
    assert.strictEqual(completedTask.usage_rejected_prediction_tokens, usage.rejected_prediction_tokens);
    assert.strictEqual(completedTask.usage_cached_tokens, usage.cached_tokens);
    assert.strictEqual(completedTask.usage_cache_creation_tokens, usage.cache_creation_tokens);
    assert.strictEqual(completedTask.usage_total_tokens, usage.total_tokens);
    assert.strictEqual(completedTask.usage_cost_usd, usage.cost_usd);
    assert.deepStrictEqual(JSON.parse(completedTask.usage_payload_json), {
      model: 'claude-sonnet',
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      input_audio_tokens: usage.input_audio_tokens,
      output_audio_tokens: usage.output_audio_tokens,
      reasoning_tokens: usage.reasoning_tokens,
      accepted_prediction_tokens: usage.accepted_prediction_tokens,
      rejected_prediction_tokens: usage.rejected_prediction_tokens,
      cached_tokens: usage.cached_tokens,
      cache_creation_tokens: usage.cache_creation_tokens,
      total_tokens: usage.total_tokens,
      cost_usd: usage.cost_usd,
    });

    const completedWorker = db.getWorker(1);
    assert.strictEqual(completedWorker.status, 'completed_task');
    assert.strictEqual(completedWorker.tasks_completed, 1);
  });

  it('should skip complete-task with ok:true skipped:true when neither ownership check passes', async () => {
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
    // Worker 1 has no current task — neither ownership check passes (OR logic both fail)
    db.updateWorker(1, { status: 'busy', current_task_id: null, tasks_completed: 0 });
    db.updateWorker(2, { status: 'busy', current_task_id: taskId, tasks_completed: 3 });

    const result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      pr_url: 'https://github.com/org/repo/pull/99',
      branch: 'agent-1',
      result: 'Attempted takeover',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, true);
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
    assert.strictEqual(workerOne.current_task_id, null);
    assert.strictEqual(workerOne.tasks_completed, 0);

    const workerTwo = db.getWorker(2);
    assert.strictEqual(workerTwo.status, 'busy');
    assert.strictEqual(workerTwo.current_task_id, taskId);
    assert.strictEqual(workerTwo.tasks_completed, 3);

    assert.strictEqual(getCoordinatorOwnershipMismatchEvents('complete-task', 1, taskId).length, 1);
  });

  it('should allow complete-task when only current_task_id matches (OR logic)', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Complete-task OR logic');
    const taskId = db.createTask({ request_id: reqId, subject: 'OR ownership', description: 'Task assigned to worker 2 but worker 1 has it as current_task_id' });
    db.updateTask(taskId, {
      status: 'in_progress',
      assigned_to: 2,
    });
    // Worker 1's current_task_id matches task — second OR check passes
    db.updateWorker(1, { status: 'busy', current_task_id: taskId });
    db.updateWorker(2, { status: 'idle', current_task_id: null });

    const result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      result: 'OR logic completion',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.skipped, undefined);

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'completed');
    assert.strictEqual(getCoordinatorOwnershipMismatchEvents('complete-task', 1, taskId).length, 0);
  });

  it('should not recover or enqueue a merge from branch when complete-task has no PR URL', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('No PR branch fallback guard');
    const taskId = db.createTask({ request_id: reqId, subject: 'No PR', description: 'Complete without a PR' });
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1, branch: null, pr_url: null });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId, tasks_completed: 0 });

    const result = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      branch: 'agent-1',
      result: 'No PR was opened',
    });
    assert.strictEqual(result.ok, true);

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'completed');
    assert.strictEqual(task.pr_url, null);
    assert.strictEqual(task.branch, 'agent-1');
    assert.strictEqual(db.getWorker(1).tasks_completed, 1);

    const mergeRows = db.getDb().prepare('SELECT * FROM merge_queue WHERE task_id = ?').all(taskId);
    assert.strictEqual(mergeRows.length, 0);
    const skipEvents = db.getLog(100, 'coordinator').filter((entry) => entry.action === 'complete_task_merge_skipped_no_pr');
    assert.strictEqual(skipEvents.length, 1);
  });

  it('should skip duplicate complete-task calls after a task is already terminal', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Duplicate completion guard');
    const taskId = db.createTask({ request_id: reqId, subject: 'Idempotent completion', description: 'Complete once only' });
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId, tasks_completed: 0 });

    const first = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      result: 'First completion',
    });
    assert.strictEqual(first.ok, true);
    const completedAt = db.getTask(taskId).completed_at;
    assert.ok(completedAt);
    assert.strictEqual(db.getWorker(1).tasks_completed, 1);
    assert.strictEqual(listMailForRecipient('allocator').filter((mail) => mail.type === 'task_completed').length, 1);

    const second = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskId),
      result: 'Late duplicate completion',
    });
    assert.strictEqual(second.ok, true);
    assert.strictEqual(second.skipped, true);
    assert.strictEqual(second.reason, 'duplicate_terminal_completion');

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'completed');
    assert.strictEqual(task.result, 'First completion');
    assert.strictEqual(task.completed_at, completedAt);
    assert.strictEqual(db.getWorker(1).tasks_completed, 1);
    assert.strictEqual(listMailForRecipient('allocator').filter((mail) => mail.type === 'task_completed').length, 1);
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

  it('should reject fail-task when task is already completed or failed (not in active state)', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Fail-task active status guard');

    // Test 1: reject when task is already completed
    const completedTaskId = db.createTask({ request_id: reqId, subject: 'Already completed task', description: 'Task already done' });
    db.updateTask(completedTaskId, { status: 'completed', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: completedTaskId });

    const completedResult = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(completedTaskId),
      error: 'Attempted to fail a completed task',
    });
    assert.strictEqual(completedResult.ok, false);
    assert.strictEqual(completedResult.error, 'ownership_mismatch');
    assert.strictEqual(completedResult.reason, 'task_not_active');

    const completedTaskAfter = db.getTask(completedTaskId);
    assert.strictEqual(completedTaskAfter.status, 'completed');

    // Test 2: reject when task is already failed
    const failedTaskId = db.createTask({ request_id: reqId, subject: 'Already failed task', description: 'Task already failed' });
    db.updateTask(failedTaskId, { status: 'failed', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: failedTaskId });

    const alreadyFailedResult = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(failedTaskId),
      error: 'Attempted to fail an already-failed task',
    });
    assert.strictEqual(alreadyFailedResult.ok, false);
    assert.strictEqual(alreadyFailedResult.error, 'ownership_mismatch');
    assert.strictEqual(alreadyFailedResult.reason, 'task_not_active');

    const failedTaskAfter = db.getTask(failedTaskId);
    assert.strictEqual(failedTaskAfter.status, 'failed');
    assert.strictEqual(failedTaskAfter.result, null);
  });

  it('should reroute blocking tasks on failure by creating a fix task', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Blocking reroute test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Critical feature', description: 'Must complete', domain: 'core' });
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId });

    const result = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(taskId),
      error: 'Build failed due to missing dependency',
    });
    assert.strictEqual(result.ok, true);
    assert.ok(result.reroute_task_id, 'should return reroute task id');

    const failedTask = db.getTask(taskId);
    assert.strictEqual(failedTask.status, 'failed_needs_reroute', 'blocking task should be failed_needs_reroute');

    const fixTask = db.getTask(result.reroute_task_id);
    assert.ok(fixTask, 'fix task should exist');
    assert.strictEqual(fixTask.request_id, reqId);
    assert.strictEqual(fixTask.status, 'ready');
    assert.strictEqual(fixTask.domain, 'core');
    assert.strictEqual(fixTask.priority, 'urgent');
    assert.ok(fixTask.subject.startsWith('[fix]'));
    assert.ok(fixTask.description.includes('Build failed due to missing dependency'));
  });

  it('should not reroute non-blocking tasks on failure', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Non-blocking fail test');
    const taskId = db.createTask({ request_id: reqId, subject: 'Optional cleanup', description: 'Nice to have' });
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1, blocking: 0 });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId });

    const result = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(taskId),
      error: 'Could not clean up',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.reroute_task_id, null, 'non-blocking should not reroute');

    const failedTask = db.getTask(taskId);
    assert.strictEqual(failedTask.status, 'failed', 'non-blocking task stays plain failed');
  });

  it('should persist and propagate identical usage values for canonical, Anthropic alias, and OpenAI alias fail-task payloads', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');
    const reqId = db.createRequest('Fail usage aliases');
    const canonicalTaskId = db.createTask({ request_id: reqId, subject: 'Canonical fail', description: 'Canonical fail-task usage payload' });
    const anthropicAliasTaskId = db.createTask({ request_id: reqId, subject: 'Anthropic alias fail', description: 'Anthropic fail-task usage payload' });
    const openAiAliasTaskId = db.createTask({ request_id: reqId, subject: 'OpenAI alias fail', description: 'OpenAI fail-task usage payload' });
    db.updateTask(canonicalTaskId, { status: 'assigned', assigned_to: 1, blocking: 0 });
    db.updateTask(anthropicAliasTaskId, { status: 'assigned', assigned_to: 2, blocking: 0 });
    db.updateTask(openAiAliasTaskId, { status: 'assigned', assigned_to: 3, blocking: 0 });
    db.updateWorker(1, { status: 'assigned', current_task_id: canonicalTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: anthropicAliasTaskId });
    db.updateWorker(3, { status: 'assigned', current_task_id: openAiAliasTaskId });

    const canonicalUsage = {
      model: '  claude-sonnet  ',
      input_tokens: 1200,
      output_tokens: 345,
      input_audio_tokens: 45,
      output_audio_tokens: 23,
      reasoning_tokens: 89,
      accepted_prediction_tokens: 21,
      rejected_prediction_tokens: 34,
      cached_tokens: 67,
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };
    const anthropicAliasUsage = {
      model: 'claude-sonnet',
      input_tokens: 1200,
      output_tokens: 345,
      input_audio_tokens: 45,
      output_audio_tokens: 23,
      reasoning_tokens: 89,
      accepted_prediction_tokens: 21,
      rejected_prediction_tokens: 34,
      cache_read_input_tokens: 67,
      cache_creation_input_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };
    const openAiAliasUsage = {
      model: 'claude-sonnet',
      prompt_tokens: 1200,
      completion_tokens: 345,
      input_tokens_details: { cached_tokens: 67, audio_tokens: 45 },
      prompt_tokens_details: { cached_tokens: 67, audio_tokens: 45 },
      completion_tokens_details: {
        reasoning_tokens: 89,
        audio_tokens: 23,
        accepted_prediction_tokens: 21,
        rejected_prediction_tokens: 34,
      },
      output_tokens_details: { reasoning_tokens: 89, audio_tokens: 23 },
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };

    const canonicalResult = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(canonicalTaskId),
      error: 'Canonical failure',
      usage: canonicalUsage,
    });
    assert.strictEqual(canonicalResult.ok, true);

    const anthropicResult = await sendCommand('fail-task', {
      worker_id: '2',
      task_id: String(anthropicAliasTaskId),
      error: 'Anthropic alias failure',
      usage: anthropicAliasUsage,
    });
    assert.strictEqual(anthropicResult.ok, true);

    await runMac10Command([
      'fail-task',
      '3',
      String(openAiAliasTaskId),
      'OpenAI alias failure',
      '--usage',
      JSON.stringify(openAiAliasUsage),
    ], tmpDir);

    const canonicalTask = db.getTask(canonicalTaskId);
    const anthropicAliasTask = db.getTask(anthropicAliasTaskId);
    const openAiAliasTask = db.getTask(openAiAliasTaskId);
    assert.strictEqual(canonicalTask.status, 'failed');
    assert.strictEqual(anthropicAliasTask.status, 'failed');
    assert.strictEqual(openAiAliasTask.status, 'failed');
    assert.strictEqual(canonicalTask.result, 'Canonical failure');
    assert.strictEqual(anthropicAliasTask.result, 'Anthropic alias failure');
    assert.strictEqual(openAiAliasTask.result, 'OpenAI alias failure');

    const comparableUsageFields = [
      'usage_model',
      'usage_input_tokens',
      'usage_output_tokens',
      'usage_input_audio_tokens',
      'usage_output_audio_tokens',
      'usage_reasoning_tokens',
      'usage_accepted_prediction_tokens',
      'usage_rejected_prediction_tokens',
      'usage_cached_tokens',
      'usage_cache_creation_tokens',
      'usage_cache_creation_ephemeral_5m_input_tokens',
      'usage_cache_creation_ephemeral_1h_input_tokens',
      'usage_total_tokens',
      'usage_cost_usd',
    ];
    for (const field of comparableUsageFields) {
      assert.strictEqual(anthropicAliasTask[field], canonicalTask[field], `${field} mismatch (anthropic fail-task)`);
      assert.strictEqual(openAiAliasTask[field], canonicalTask[field], `${field} mismatch (openai fail-task)`);
    }

    const expectedUsage = {
      model: 'claude-sonnet',
      input_tokens: 1200,
      output_tokens: 345,
      input_audio_tokens: 45,
      output_audio_tokens: 23,
      reasoning_tokens: 89,
      accepted_prediction_tokens: 21,
      rejected_prediction_tokens: 34,
      cached_tokens: 67,
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };

    const expectedTaskIds = new Set([canonicalTaskId, anthropicAliasTaskId, openAiAliasTaskId].map((taskId) => String(taskId)));
    const allocatorFailureMessages = db.checkMail('allocator', false)
      .filter((message) => message.type === 'task_failed')
      .filter((message) => expectedTaskIds.has(String(message.payload.task_id)));
    assert.strictEqual(allocatorFailureMessages.length, 3);
    for (const message of allocatorFailureMessages) {
      assert.deepStrictEqual(message.payload.usage, expectedUsage);
    }

    const architectFailureMessages = db.checkMail('architect', false)
      .filter((message) => message.type === 'task_failed')
      .filter((message) => expectedTaskIds.has(String(message.payload.task_id)));
    assert.strictEqual(architectFailureMessages.length, 3);
    for (const message of architectFailureMessages) {
      assert.deepStrictEqual(message.payload.usage, expectedUsage);
    }

    const workerFailureLogs = db.getLog(500)
      .filter((entry) => entry.action === 'task_failed')
      .map((entry) => {
        try {
          return { actor: entry.actor, details: JSON.parse(entry.details) };
        } catch {
          return null;
        }
      })
      .filter((entry) => entry && entry.details && expectedTaskIds.has(String(entry.details.task_id)));
    assert.strictEqual(workerFailureLogs.length, 3);
    for (const entry of workerFailureLogs) {
      assert.deepStrictEqual(entry.details.usage, expectedUsage);
    }
  });

  it('should accept fail-task usage payloads with extra provider keys while persisting known metrics', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Fail-task usage forward compatibility');
    const taskId = db.createTask({ request_id: reqId, subject: 'Fail unknown key', description: 'Should accept unknown fail-task usage keys' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1, blocking: 0 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });

    const usage = {
      model: 'claude-sonnet',
      input_tokens: 123,
      output_tokens: 45,
      cache_creation_input_tokens: 11,
      cache_read_input_tokens: 22,
      total_tokens: 190,
      cost_usd: 0.019,
      service_tier: 'priority',
      tool_use_prompt_token_count: 7,
      thoughts_token_count: 3,
    };

    await runMac10Command([
      'fail-task',
      '1',
      String(taskId),
      'Fail with provider extras',
      '--usage',
      JSON.stringify(usage),
    ], tmpDir);

    const failedTask = db.getTask(taskId);
    assert.strictEqual(failedTask.status, 'failed');
    assert.strictEqual(failedTask.result, 'Fail with provider extras');
    assert.strictEqual(failedTask.usage_model, usage.model);
    assert.strictEqual(failedTask.usage_input_tokens, usage.input_tokens);
    assert.strictEqual(failedTask.usage_output_tokens, usage.output_tokens);
    assert.strictEqual(failedTask.usage_cache_creation_tokens, usage.cache_creation_input_tokens);
    assert.strictEqual(failedTask.usage_cached_tokens, usage.cache_read_input_tokens);
    assert.strictEqual(failedTask.usage_total_tokens, usage.total_tokens);
    assert.strictEqual(failedTask.usage_cost_usd, usage.cost_usd);
    assert.deepStrictEqual(JSON.parse(failedTask.usage_payload_json), {
      model: usage.model,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_tokens: usage.cache_creation_input_tokens,
      cached_tokens: usage.cache_read_input_tokens,
      total_tokens: usage.total_tokens,
      cost_usd: usage.cost_usd,
      service_tier: usage.service_tier,
      tool_use_prompt_token_count: usage.tool_use_prompt_token_count,
      thoughts_token_count: usage.thoughts_token_count,
    });

    const allocatorFailureMessage = db.checkMail('allocator', false)
      .find((message) => message.type === 'task_failed' && String(message.payload.task_id) === String(taskId));
    assert.ok(allocatorFailureMessage);
    assert.strictEqual(allocatorFailureMessage.payload.usage.service_tier, usage.service_tier);
    assert.strictEqual(allocatorFailureMessage.payload.usage.tool_use_prompt_token_count, usage.tool_use_prompt_token_count);
    assert.strictEqual(allocatorFailureMessage.payload.usage.thoughts_token_count, usage.thoughts_token_count);

    const workerFailureLog = db.getLog(500)
      .filter((entry) => entry.action === 'task_failed' && entry.actor === 'worker-1')
      .map((entry) => {
        try {
          return JSON.parse(entry.details);
        } catch {
          return null;
        }
      })
      .find((details) => details && String(details.task_id) === String(taskId));
    assert.ok(workerFailureLog);
    assert.strictEqual(workerFailureLog.usage.service_tier, usage.service_tier);
    assert.strictEqual(workerFailureLog.usage.tool_use_prompt_token_count, usage.tool_use_prompt_token_count);
    assert.strictEqual(workerFailureLog.usage.thoughts_token_count, usage.thoughts_token_count);
  });

  it('should reject conflicting duplicate aliases deterministically for fail-task usage', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Fail-task usage conflict rejection');
    const serverTaskId = db.createTask({ request_id: reqId, subject: 'Fail server conflict', description: 'Conflicting fail-task API alias values' });
    const cliTaskId = db.createTask({ request_id: reqId, subject: 'Fail CLI conflict', description: 'Conflicting fail-task CLI alias values' });
    db.updateTask(serverTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(cliTaskId, { status: 'assigned', assigned_to: 2 });
    db.updateWorker(1, { status: 'assigned', current_task_id: serverTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: cliTaskId });

    const serverResult = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(serverTaskId),
      error: 'Server conflict failure',
      usage: {
        input_tokens: 1200,
        prompt_tokens: 1201,
      },
    });
    assert.ok(serverResult.error);
    assert.match(serverResult.error, /conflicting values for key "input_tokens"/);
    assert.strictEqual(db.getTask(serverTaskId).status, 'assigned');

    const serverReasoningResult = await sendCommand('fail-task', {
      worker_id: '1',
      task_id: String(serverTaskId),
      error: 'Server reasoning conflict failure',
      usage: {
        reasoning_tokens: 77,
        completion_tokens_details: { reasoning_tokens: 78 },
      },
    });
    assert.ok(serverReasoningResult.error);
    assert.match(serverReasoningResult.error, /conflicting values for key "reasoning_tokens"/);
    assert.strictEqual(db.getTask(serverTaskId).status, 'assigned');

    await assert.rejects(
      () => runMac10Command([
        'fail-task',
        '2',
        String(cliTaskId),
        'CLI conflict failure',
        '--usage',
        JSON.stringify({
          rejected_prediction_tokens: 12,
          completion_tokens_details: { rejected_prediction_tokens: 13 },
        }),
      ], tmpDir),
      (err) => {
        assert.match(String(err && err.stderr), /conflicting values for "rejected_prediction_tokens"/);
        return true;
      }
    );
    assert.strictEqual(db.getTask(cliTaskId).status, 'assigned');
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
      model: 'claude-sonnet',
      input_tokens: 1200,
      output_tokens: 345,
      input_audio_tokens: 45,
      output_audio_tokens: 23,
      reasoning_tokens: 89,
      accepted_prediction_tokens: 21,
      rejected_prediction_tokens: 34,
      cached_tokens: 67,
      cache_creation_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };
    const anthropicAliasUsage = {
      model: 'claude-sonnet',
      input_tokens: 1200,
      output_tokens: 345,
      input_audio_tokens: 45,
      output_audio_tokens: 23,
      reasoning_tokens: 89,
      accepted_prediction_tokens: 21,
      rejected_prediction_tokens: 34,
      cache_read_input_tokens: 67,
      cache_creation_input_tokens: 45,
      total_tokens: 1612,
      cost_usd: 0.0456,
    };
    const openAiAliasUsage = {
      model: 'claude-sonnet',
      prompt_tokens: 1200,
      completion_tokens: 345,
      input_tokens_details: { cached_tokens: 67, audio_tokens: 45 },
      prompt_tokens_details: { cached_tokens: 67, audio_tokens: 45 },
      completion_tokens_details: {
        reasoning_tokens: 89,
        audio_tokens: 23,
        accepted_prediction_tokens: 21,
        rejected_prediction_tokens: 34,
      },
      output_tokens_details: { reasoning_tokens: 89, audio_tokens: 23 },
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
      'usage_input_audio_tokens',
      'usage_output_audio_tokens',
      'usage_reasoning_tokens',
      'usage_accepted_prediction_tokens',
      'usage_rejected_prediction_tokens',
      'usage_cached_tokens',
      'usage_cache_creation_tokens',
      'usage_cache_creation_ephemeral_5m_input_tokens',
      'usage_cache_creation_ephemeral_1h_input_tokens',
      'usage_total_tokens',
      'usage_cost_usd',
    ];
    for (const field of comparableUsageFields) {
      assert.strictEqual(anthropicAliasTask[field], canonicalTask[field], `${field} mismatch (anthropic)`);
      assert.strictEqual(openAiAliasTask[field], canonicalTask[field], `${field} mismatch (openai)`);
    }
  });

  it('should preserve Anthropic cache_creation object TTL fields while folding aggregate cache_creation_tokens', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Anthropic cache_creation object aliases');
    const completeTaskId = db.createTask({ request_id: reqId, subject: 'Complete cache object', description: 'Complete-task usage cache object alias payload' });
    const failTaskId = db.createTask({ request_id: reqId, subject: 'Fail cache object', description: 'Fail-task usage cache object alias payload' });
    db.updateTask(completeTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(failTaskId, { status: 'assigned', assigned_to: 2, blocking: 0 });
    db.updateWorker(1, { status: 'assigned', current_task_id: completeTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: failTaskId });

    const completeUsage = {
      model: 'claude-sonnet',
      cache_creation: {
        ephemeral_5m_input_tokens: 12,
        ephemeral_1h_input_tokens: 33,
      },
    };
    const failUsage = {
      model: 'claude-sonnet',
      cache_creation: {
        ephemeral_5m_input_tokens: 9,
      },
    };

    await runMac10Command([
      'complete-task',
      '1',
      String(completeTaskId),
      'Complete cache object aliases',
      '--usage',
      JSON.stringify(completeUsage),
    ], tmpDir);

    await runMac10Command([
      'fail-task',
      '2',
      String(failTaskId),
      'Fail cache object aliases',
      '--usage',
      JSON.stringify(failUsage),
    ], tmpDir);

    const completedTask = db.getTask(completeTaskId);
    const failedTask = db.getTask(failTaskId);
    assert.strictEqual(completedTask.status, 'completed');
    assert.strictEqual(failedTask.status, 'failed');
    assert.strictEqual(completedTask.usage_cache_creation_tokens, 45);
    assert.strictEqual(failedTask.usage_cache_creation_tokens, 9);

    if (Object.prototype.hasOwnProperty.call(completedTask, 'usage_cache_creation_ephemeral_5m_input_tokens')) {
      assert.strictEqual(completedTask.usage_cache_creation_ephemeral_5m_input_tokens, 12);
      assert.strictEqual(completedTask.usage_cache_creation_ephemeral_1h_input_tokens, 33);
      assert.strictEqual(failedTask.usage_cache_creation_ephemeral_5m_input_tokens, 9);
      assert.strictEqual(failedTask.usage_cache_creation_ephemeral_1h_input_tokens, null);
    }

    const expectedTaskIds = new Set([completeTaskId, failTaskId].map((taskId) => String(taskId)));
    const expectedUsageByTaskId = new Map([
      [String(completeTaskId), {
        model: 'claude-sonnet',
        ephemeral_5m_input_tokens: 12,
        ephemeral_1h_input_tokens: 33,
        cache_creation_tokens: 45,
      }],
      [String(failTaskId), {
        model: 'claude-sonnet',
        ephemeral_5m_input_tokens: 9,
        cache_creation_tokens: 9,
      }],
    ]);

    const allocatorUsageMessages = db.checkMail('allocator', false)
      .filter((message) => (message.type === 'task_completed' || message.type === 'task_failed'))
      .filter((message) => expectedTaskIds.has(String(message.payload.task_id)));
    assert.strictEqual(allocatorUsageMessages.length, 2);
    for (const message of allocatorUsageMessages) {
      const expectedUsage = expectedUsageByTaskId.get(String(message.payload.task_id));
      assert.deepStrictEqual(message.payload.usage, expectedUsage);
    }
  });

  it('should preserve unknown nested usage detail keys in usage_payload_json while keeping canonical usage mappings', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    const reqId = db.createRequest('Nested usage detail passthrough');
    const completeTaskId = db.createTask({ request_id: reqId, subject: 'Complete nested usage details', description: 'Preserve unknown nested usage detail keys on complete-task' });
    const failTaskId = db.createTask({ request_id: reqId, subject: 'Fail nested usage details', description: 'Preserve unknown nested usage detail keys on fail-task' });
    db.updateTask(completeTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(failTaskId, { status: 'assigned', assigned_to: 2, blocking: 0 });
    db.updateWorker(1, { status: 'assigned', current_task_id: completeTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: failTaskId });

    const completeUsage = {
      model: 'claude-sonnet',
      prompt_tokens: 120,
      completion_tokens: 30,
      input_tokens_details: { cached_tokens: 50, audio_tokens: 11, provider_cached_bonus_tokens: 7 },
      prompt_tokens_details: { cached_tokens: 50, audio_tokens: 11, prompt_detail_extra_tokens: 8 },
      completion_tokens_details: {
        reasoning_tokens: 13,
        audio_tokens: 5,
        accepted_prediction_tokens: 3,
        rejected_prediction_tokens: 2,
        completion_detail_extra_tokens: 9,
      },
      output_tokens_details: { reasoning_tokens: 13, audio_tokens: 5, output_detail_extra_tokens: 6 },
      cache_creation: {
        ephemeral_5m_input_tokens: 4,
        ephemeral_1h_input_tokens: 9,
        cache_creation_unknown_tokens: 12,
      },
      total_tokens: 150,
      cost_usd: 0.015,
    };
    const failUsage = {
      model: 'claude-sonnet',
      prompt_tokens: 95,
      completion_tokens: 22,
      input_tokens_details: { cached_tokens: 33, audio_tokens: 10, input_detail_extra_tokens: 4 },
      prompt_tokens_details: { cached_tokens: 33, audio_tokens: 10, prompt_detail_extra_tokens: 5 },
      completion_tokens_details: {
        reasoning_tokens: 8,
        audio_tokens: 2,
        accepted_prediction_tokens: 1,
        rejected_prediction_tokens: 0,
        completion_detail_extra_tokens: 3,
      },
      output_tokens_details: { reasoning_tokens: 8, audio_tokens: 2, output_detail_extra_tokens: 1 },
      cache_creation: {
        ephemeral_5m_input_tokens: 7,
        cache_creation_unknown_tokens: 21,
      },
      total_tokens: 117,
      cost_usd: 0.0117,
    };

    const completeResult = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(completeTaskId),
      result: 'Complete nested usage details',
      usage: completeUsage,
    });
    assert.strictEqual(completeResult.ok, true);

    await runMac10Command([
      'fail-task',
      '2',
      String(failTaskId),
      'Fail nested usage details',
      '--usage',
      JSON.stringify(failUsage),
    ], tmpDir);

    const completedTask = db.getTask(completeTaskId);
    const failedTask = db.getTask(failTaskId);
    assert.strictEqual(completedTask.status, 'completed');
    assert.strictEqual(failedTask.status, 'failed');

    assert.strictEqual(completedTask.usage_input_tokens, 120);
    assert.strictEqual(completedTask.usage_output_tokens, 30);
    assert.strictEqual(completedTask.usage_cached_tokens, 50);
    assert.strictEqual(completedTask.usage_input_audio_tokens, 11);
    assert.strictEqual(completedTask.usage_reasoning_tokens, 13);
    assert.strictEqual(completedTask.usage_output_audio_tokens, 5);
    assert.strictEqual(completedTask.usage_accepted_prediction_tokens, 3);
    assert.strictEqual(completedTask.usage_rejected_prediction_tokens, 2);
    assert.strictEqual(completedTask.usage_cache_creation_tokens, 13);
    if (Object.prototype.hasOwnProperty.call(completedTask, 'usage_cache_creation_ephemeral_5m_input_tokens')) {
      assert.strictEqual(completedTask.usage_cache_creation_ephemeral_5m_input_tokens, 4);
      assert.strictEqual(completedTask.usage_cache_creation_ephemeral_1h_input_tokens, 9);
    }

    assert.strictEqual(failedTask.usage_input_tokens, 95);
    assert.strictEqual(failedTask.usage_output_tokens, 22);
    assert.strictEqual(failedTask.usage_cached_tokens, 33);
    assert.strictEqual(failedTask.usage_input_audio_tokens, 10);
    assert.strictEqual(failedTask.usage_reasoning_tokens, 8);
    assert.strictEqual(failedTask.usage_output_audio_tokens, 2);
    assert.strictEqual(failedTask.usage_accepted_prediction_tokens, 1);
    assert.strictEqual(failedTask.usage_rejected_prediction_tokens, 0);
    assert.strictEqual(failedTask.usage_cache_creation_tokens, 7);
    if (Object.prototype.hasOwnProperty.call(failedTask, 'usage_cache_creation_ephemeral_5m_input_tokens')) {
      assert.strictEqual(failedTask.usage_cache_creation_ephemeral_5m_input_tokens, 7);
      assert.strictEqual(failedTask.usage_cache_creation_ephemeral_1h_input_tokens, null);
    }

    const completedPayload = JSON.parse(completedTask.usage_payload_json);
    const failedPayload = JSON.parse(failedTask.usage_payload_json);

    assert.deepStrictEqual(completedPayload.input_tokens_details, { provider_cached_bonus_tokens: 7 });
    assert.deepStrictEqual(completedPayload.prompt_tokens_details, { prompt_detail_extra_tokens: 8 });
    assert.deepStrictEqual(completedPayload.completion_tokens_details, { completion_detail_extra_tokens: 9 });
    assert.deepStrictEqual(completedPayload.output_tokens_details, { output_detail_extra_tokens: 6 });
    assert.deepStrictEqual(completedPayload.cache_creation, { cache_creation_unknown_tokens: 12 });

    assert.deepStrictEqual(failedPayload.input_tokens_details, { input_detail_extra_tokens: 4 });
    assert.deepStrictEqual(failedPayload.prompt_tokens_details, { prompt_detail_extra_tokens: 5 });
    assert.deepStrictEqual(failedPayload.completion_tokens_details, { completion_detail_extra_tokens: 3 });
    assert.deepStrictEqual(failedPayload.output_tokens_details, { output_detail_extra_tokens: 1 });
    assert.deepStrictEqual(failedPayload.cache_creation, { cache_creation_unknown_tokens: 21 });
  });

  it('should reject invalid Anthropic cache_creation object alias values for complete-task and fail-task', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');
    const reqId = db.createRequest('Anthropic cache_creation object validation');
    const completeNonIntegerTaskId = db.createTask({ request_id: reqId, subject: 'Complete non-integer cache object', description: 'Should reject non-integer cache_creation nested token value' });
    const failNegativeTaskId = db.createTask({ request_id: reqId, subject: 'Fail negative cache object', description: 'Should reject negative cache_creation nested token value' });
    const failCliNonObjectTaskId = db.createTask({ request_id: reqId, subject: 'Fail non-object cache object alias', description: 'Should reject non-object cache_creation CLI payload' });
    db.updateTask(completeNonIntegerTaskId, { status: 'assigned', assigned_to: 1 });
    db.updateTask(failNegativeTaskId, { status: 'assigned', assigned_to: 2 });
    db.updateTask(failCliNonObjectTaskId, { status: 'assigned', assigned_to: 3 });
    db.updateWorker(1, { status: 'assigned', current_task_id: completeNonIntegerTaskId });
    db.updateWorker(2, { status: 'assigned', current_task_id: failNegativeTaskId });
    db.updateWorker(3, { status: 'assigned', current_task_id: failCliNonObjectTaskId });

    const nonIntegerResult = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(completeNonIntegerTaskId),
      usage: {
        cache_creation: {
          ephemeral_5m_input_tokens: 1.5,
        },
      },
    });
    assert.ok(nonIntegerResult.error);
    assert.match(nonIntegerResult.error, /usage\.cache_creation\.ephemeral_5m_input_tokens" must be an integer/);
    assert.strictEqual(db.getTask(completeNonIntegerTaskId).status, 'assigned');

    const negativeResult = await sendCommand('fail-task', {
      worker_id: '2',
      task_id: String(failNegativeTaskId),
      error: 'Negative cache object alias',
      usage: {
        cache_creation: {
          ephemeral_1h_input_tokens: -2,
        },
      },
    });
    assert.ok(negativeResult.error);
    assert.match(negativeResult.error, /usage\.cache_creation\.ephemeral_1h_input_tokens" must be >= 0/);
    assert.strictEqual(db.getTask(failNegativeTaskId).status, 'assigned');

    await assert.rejects(
      () => runMac10Command([
        'fail-task',
        '3',
        String(failCliNonObjectTaskId),
        'CLI non-object cache object alias',
        '--usage',
        JSON.stringify({
          cache_creation: 7,
        }),
      ], tmpDir),
      (err) => {
        assert.match(String(err && err.stderr), /cache_creation" must be an object/);
        return true;
      }
    );
    assert.strictEqual(db.getTask(failCliNonObjectTaskId).status, 'assigned');
  });

  it('should accept complete-task usage payloads with extra provider keys while persisting known metrics', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Usage forward compatibility');
    const taskId = db.createTask({ request_id: reqId, subject: 'Unknown key', description: 'Should accept unknown usage key' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskId });

    const usage = {
      model: 'claude-sonnet',
      prompt_tokens: 144,
      completion_tokens: 55,
      cache_creation_input_tokens: 13,
      cache_read_input_tokens: 34,
      total_tokens: 246,
      cost_usd: 0.0246,
      service_tier: 'priority',
      tool_use_prompt_token_count: 8,
      thoughts_token_count: 5,
    };

    await runMac10Command([
      'complete-task',
      '1',
      String(taskId),
      'Complete with provider extras',
      '--usage',
      JSON.stringify(usage),
    ], tmpDir);

    const completedTask = db.getTask(taskId);
    assert.strictEqual(completedTask.status, 'completed');
    assert.strictEqual(completedTask.result, 'Complete with provider extras');
    assert.strictEqual(completedTask.usage_model, usage.model);
    assert.strictEqual(completedTask.usage_input_tokens, usage.prompt_tokens);
    assert.strictEqual(completedTask.usage_output_tokens, usage.completion_tokens);
    assert.strictEqual(completedTask.usage_cache_creation_tokens, usage.cache_creation_input_tokens);
    assert.strictEqual(completedTask.usage_cached_tokens, usage.cache_read_input_tokens);
    assert.strictEqual(completedTask.usage_total_tokens, usage.total_tokens);
    assert.strictEqual(completedTask.usage_cost_usd, usage.cost_usd);
    assert.deepStrictEqual(JSON.parse(completedTask.usage_payload_json), {
      model: usage.model,
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
      cache_creation_tokens: usage.cache_creation_input_tokens,
      cached_tokens: usage.cache_read_input_tokens,
      total_tokens: usage.total_tokens,
      cost_usd: usage.cost_usd,
      service_tier: usage.service_tier,
      tool_use_prompt_token_count: usage.tool_use_prompt_token_count,
      thoughts_token_count: usage.thoughts_token_count,
    });

    const allocatorCompletionMessage = db.checkMail('allocator', false)
      .find((message) => message.type === 'task_completed' && String(message.payload.task_id) === String(taskId));
    assert.ok(allocatorCompletionMessage);
    assert.strictEqual(allocatorCompletionMessage.payload.usage.service_tier, usage.service_tier);
    assert.strictEqual(allocatorCompletionMessage.payload.usage.tool_use_prompt_token_count, usage.tool_use_prompt_token_count);
    assert.strictEqual(allocatorCompletionMessage.payload.usage.thoughts_token_count, usage.thoughts_token_count);

    const workerCompletionLog = db.getLog(500)
      .filter((entry) => entry.action === 'task_completed' && entry.actor === 'worker-1')
      .map((entry) => {
        try {
          return JSON.parse(entry.details);
        } catch {
          return null;
        }
      })
      .find((details) => details && String(details.task_id) === String(taskId));
    assert.ok(workerCompletionLog);
    assert.strictEqual(workerCompletionLog.usage.service_tier, usage.service_tier);
    assert.strictEqual(workerCompletionLog.usage.tool_use_prompt_token_count, usage.tool_use_prompt_token_count);
    assert.strictEqual(workerCompletionLog.usage.thoughts_token_count, usage.thoughts_token_count);
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

    const serverReasoningResult = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(serverTaskId),
      usage: {
        reasoning_tokens: 77,
        completion_tokens_details: { reasoning_tokens: 78 },
      },
    });
    assert.ok(serverReasoningResult.error);
    assert.match(serverReasoningResult.error, /conflicting values for key "reasoning_tokens"/);
    assert.strictEqual(db.getTask(serverTaskId).status, 'assigned');

    const serverAcceptedPredictionResult = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(serverTaskId),
      usage: {
        accepted_prediction_tokens: 7,
        completion_tokens_details: { accepted_prediction_tokens: 8 },
      },
    });
    assert.ok(serverAcceptedPredictionResult.error);
    assert.match(serverAcceptedPredictionResult.error, /conflicting values for key "accepted_prediction_tokens"/);
    assert.strictEqual(db.getTask(serverTaskId).status, 'assigned');

    await assert.rejects(
      () => runMac10Command([
        'complete-task',
        '2',
        String(cliTaskId),
        'CLI conflict completion',
        '--usage',
        JSON.stringify({
          rejected_prediction_tokens: 12,
          completion_tokens_details: { rejected_prediction_tokens: 13 },
        }),
      ], tmpDir),
      (err) => {
        assert.match(String(err && err.stderr), /conflicting values for "rejected_prediction_tokens"/);
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

  it('should refresh one merge queue row across repeated complete-task cycles for the same request PR ownership', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const requestId = db.createRequest('Repeated completion dedupe');
    const taskA = db.createTask({ request_id: requestId, subject: 'Task A', description: 'Do A' });
    const taskB = db.createTask({ request_id: requestId, subject: 'Task B', description: 'Do B retry' });

    db.updateTask(taskA, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskA });

    const first = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskA),
      pr_url: 'https://github.com/org/repo/pull/420',
      branch: 'agent-1',
      result: 'Task A done',
    });
    assert.strictEqual(first.ok, true);

    const firstQueueRow = db.getDb().prepare(`
      SELECT id, task_id, status
      FROM merge_queue
      WHERE request_id = ? AND pr_url = ? AND branch = ?
      ORDER BY id ASC
      LIMIT 1
    `).get(requestId, 'https://github.com/org/repo/pull/420', 'agent-1');
    assert.ok(firstQueueRow);
    assert.strictEqual(firstQueueRow.task_id, taskA);
    assert.strictEqual(firstQueueRow.status, 'pending');

    db.updateTask(taskB, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'assigned', current_task_id: taskB });

    const second = await sendCommand('complete-task', {
      worker_id: '1',
      task_id: String(taskB),
      pr_url: 'https://github.com/org/repo/pull/420',
      branch: 'agent-1',
      result: 'Task B done',
    });
    assert.strictEqual(second.ok, true);

    const queueRows = db.getDb().prepare(`
      SELECT id, task_id, status
      FROM merge_queue
      WHERE request_id = ? AND pr_url = ? AND branch = ?
      ORDER BY id ASC
    `).all(requestId, 'https://github.com/org/repo/pull/420', 'agent-1');
    assert.strictEqual(queueRows.length, 1);
    assert.strictEqual(queueRows[0].id, firstQueueRow.id);
    assert.strictEqual(queueRows[0].task_id, taskB);
    assert.strictEqual(queueRows[0].status, 'pending');
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
    assert.strictEqual(completion.hard_failures, 1);
    assert.strictEqual(completion.all_terminal, true);
    assert.strictEqual(completion.all_completed, false);
    assert.strictEqual(completion.all_done, false);

    const integrate = await sendCommand('integrate', { request_id: requestId });
    assert.strictEqual(integrate.ok, false);
    assert.strictEqual(integrate.error, 'Request has failed tasks');
    assert.strictEqual(integrate.total, 2);
    assert.strictEqual(integrate.completed, 1);
    assert.strictEqual(integrate.failed, 1);
    assert.strictEqual(integrate.hard_failures, 1);
    assert.strictEqual(integrate.all_terminal, true);
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

  it('should clear stale completion metadata when integrate transitions completed requests to integrating', async () => {
    const requestId = db.createRequest('Retry integration from terminal state');
    const taskId = db.createTask({ request_id: requestId, subject: 'Task A', description: 'Done A' });
    const taskCompletedAt = new Date().toISOString();
    const requestCompletedAt = new Date(Date.now() - 1000).toISOString();

    db.updateTask(taskId, {
      status: 'completed',
      pr_url: 'https://github.com/org/repo/pull/333',
      branch: 'agent-3',
      completed_at: taskCompletedAt,
    });
    db.updateRequest(requestId, {
      status: 'completed',
      completed_at: requestCompletedAt,
      result: 'previous completion',
    });

    const integrate = await sendCommand('integrate', { request_id: requestId });
    assert.strictEqual(integrate.ok, true);
    assert.strictEqual(integrate.request_id, requestId);
    assert.strictEqual(integrate.merges_queued, 1);

    const request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'integrating');
    assert.strictEqual(request.completed_at, null);
    assert.strictEqual(request.result, null);
  });

  it('should handle inbox', async () => {
    db.sendMail('architect', 'test_msg', { data: 'hello' });

    const result = await sendCommand('inbox', { recipient: 'architect' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.messages.length, 1);
    assert.strictEqual(result.messages[0].type, 'test_msg');
  });

  it('should filter inbox by type and consume only matched messages', async () => {
    db.sendMail('architect', 'task_ready', { marker: 'type-match-1', request_id: 'req-type-a' });
    db.sendMail('architect', 'task_ready', { marker: 'type-match-2', request_id: 'req-type-b' });
    db.sendMail('architect', 'task_failed', { marker: 'type-other-1', request_id: 'req-type-a' });
    db.sendMail('architect', 'task_failed', { marker: 'type-other-2', request_id: 'req-type-b' });

    const result = await sendCommand('inbox', { recipient: 'architect', type: 'task_ready' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.messages.length, 2);
    assert.deepStrictEqual(
      result.messages.map((message) => message.payload.marker).sort(),
      ['type-match-1', 'type-match-2']
    );

    assert.deepStrictEqual(getConsumedByMarker('architect'), {
      'type-match-1': 1,
      'type-match-2': 1,
      'type-other-1': 0,
      'type-other-2': 0,
    });

    const remaining = await sendCommand('inbox', { recipient: 'architect', peek: true });
    assert.strictEqual(remaining.ok, true);
    assert.deepStrictEqual(
      remaining.messages.map((message) => message.payload.marker).sort(),
      ['type-other-1', 'type-other-2']
    );
  });

  it('should filter inbox by payload.request_id and consume only matched messages', async () => {
    db.sendMail('architect', 'task_update', { marker: 'request-match-1', request_id: 'req-filter-match' });
    db.sendMail('architect', 'task_failed', { marker: 'request-other-1', request_id: 'req-filter-other' });
    db.sendMail('architect', 'task_completed', { marker: 'request-match-2', request_id: 'req-filter-match' });

    const result = await sendCommand('inbox', {
      recipient: 'architect',
      request_id: 'req-filter-match',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.messages.length, 2);
    assert.ok(result.messages.every((message) => message.payload.request_id === 'req-filter-match'));
    assert.deepStrictEqual(
      result.messages.map((message) => message.payload.marker).sort(),
      ['request-match-1', 'request-match-2']
    );

    assert.deepStrictEqual(getConsumedByMarker('architect'), {
      'request-match-1': 1,
      'request-other-1': 0,
      'request-match-2': 1,
    });

    const remaining = await sendCommand('inbox', { recipient: 'architect', peek: true });
    assert.strictEqual(remaining.ok, true);
    assert.deepStrictEqual(
      remaining.messages.map((message) => message.payload.marker),
      ['request-other-1']
    );
  });

  it('should filter inbox by both type and request_id, consuming only the intersection', async () => {
    db.sendMail('architect', 'task_completed', { marker: 'both-match', request_id: 'req-combo' });
    db.sendMail('architect', 'task_failed', { marker: 'type-mismatch', request_id: 'req-combo' });
    db.sendMail('architect', 'task_completed', { marker: 'rid-mismatch', request_id: 'req-other' });
    db.sendMail('architect', 'task_update', { marker: 'neither-match', request_id: 'req-other' });

    const result = await sendCommand('inbox', {
      recipient: 'architect',
      type: 'task_completed',
      request_id: 'req-combo',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.messages.length, 1);
    assert.strictEqual(result.messages[0].payload.marker, 'both-match');

    assert.deepStrictEqual(getConsumedByMarker('architect'), {
      'both-match': 1,
      'type-mismatch': 0,
      'rid-mismatch': 0,
      'neither-match': 0,
    });

    const remaining = await sendCommand('inbox', { recipient: 'architect', peek: true });
    assert.strictEqual(remaining.ok, true);
    assert.deepStrictEqual(
      remaining.messages.map((message) => message.payload.marker).sort(),
      ['neither-match', 'rid-mismatch', 'type-mismatch']
    );
  });

  it('should keep inbox-block waiting for a filtered match and leave unrelated mail unconsumed', async () => {
    let blockedError = null;
    let blockedSettled = false;
    const blockedPromise = sendCommand('inbox-block', {
      recipient: 'architect',
      timeout: 3000,
      type: 'task_completed',
      request_id: 'req-block-match',
    }).then((result) => {
      blockedSettled = true;
      return result;
    }).catch((error) => {
      blockedSettled = true;
      blockedError = error;
      return null;
    });

    db.sendMail('architect', 'task_failed', { marker: 'block-other', request_id: 'req-block-other' });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.strictEqual(blockedSettled, false);
    assert.deepStrictEqual(getConsumedByMarker('architect'), {
      'block-other': 0,
    });

    db.sendMail('architect', 'task_completed', { marker: 'block-match', request_id: 'req-block-match' });
    const blocked = await blockedPromise;
    assert.ifError(blockedError);
    assert.ok(blocked);
    assert.strictEqual(blocked.ok, true);
    assert.strictEqual(blocked.messages.length, 1);
    assert.strictEqual(blocked.messages[0].payload.marker, 'block-match');

    assert.deepStrictEqual(getConsumedByMarker('architect'), {
      'block-other': 0,
      'block-match': 1,
    });

    const remaining = await sendCommand('inbox', { recipient: 'architect', peek: true });
    assert.strictEqual(remaining.ok, true);
    assert.deepStrictEqual(
      remaining.messages.map((message) => message.payload.marker),
      ['block-other']
    );
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

  it('should reject loop-checkpoint for non-active loops without mutating loop state', async () => {
    for (const status of ['stopped', 'paused']) {
      const created = await sendCommand('loop', { prompt: `Checkpoint guard ${status}` });
      assert.strictEqual(created.ok, true);

      const baselineHeartbeat = new Date(Date.now() - 60000).toISOString();
      const baselineCheckpoint = `baseline-${status}`;
      db.updateLoop(created.loop_id, {
        status,
        iteration_count: 3,
        last_checkpoint: baselineCheckpoint,
        last_heartbeat: baselineHeartbeat,
      });

      const checkpoint = await sendCommand('loop-checkpoint', {
        loop_id: created.loop_id,
        summary: 'should not persist',
      });
      assert.strictEqual(checkpoint.ok, false);
      assert.strictEqual(checkpoint.error, `Loop is ${status}, not active`);

      const loop = db.getLoop(created.loop_id);
      assert.strictEqual(loop.status, status);
      assert.strictEqual(loop.iteration_count, 3);
      assert.strictEqual(loop.last_checkpoint, baselineCheckpoint);
      assert.strictEqual(loop.last_heartbeat, baselineHeartbeat);
    }
  });

  it('should reject loop-heartbeat for stopped/paused loops without mutating last_heartbeat', async () => {
    for (const status of ['stopped', 'paused']) {
      const created = await sendCommand('loop', { prompt: `Heartbeat guard ${status}` });
      assert.strictEqual(created.ok, true);

      const baselineHeartbeat = new Date(Date.now() - 60000).toISOString();
      db.updateLoop(created.loop_id, {
        status,
        last_heartbeat: baselineHeartbeat,
      });

      const heartbeat = await sendCommand('loop-heartbeat', { loop_id: created.loop_id });
      assert.strictEqual(heartbeat.ok, false);
      assert.strictEqual(heartbeat.error, `Loop is ${status}, not active`);

      const loop = db.getLoop(created.loop_id);
      assert.strictEqual(loop.status, status);
      assert.strictEqual(loop.last_heartbeat, baselineHeartbeat);
    }
  });

  it('should reject failed loop-heartbeat without mutating last_heartbeat', async () => {
    const created = await sendCommand('loop', { prompt: 'Heartbeat guard failed' });
    assert.strictEqual(created.ok, true);

    const baselineHeartbeat = new Date(Date.now() - 60000).toISOString();
    db.updateLoop(created.loop_id, {
      status: 'failed',
      last_heartbeat: baselineHeartbeat,
    });

    const heartbeat = await sendCommand('loop-heartbeat', { loop_id: created.loop_id });
    assert.strictEqual(heartbeat.ok, false);
    assert.strictEqual(heartbeat.error, 'Loop is failed, not active');

    const loop = db.getLoop(created.loop_id);
    assert.strictEqual(loop.status, 'failed');
    assert.strictEqual(loop.last_heartbeat, baselineHeartbeat);
  });

  it('should keep active loop checkpoint and heartbeat behavior unchanged', async () => {
    const created = await sendCommand('loop', { prompt: 'Active loop checkpoint/heartbeat behavior' });
    assert.strictEqual(created.ok, true);

    const initialHeartbeat = new Date(Date.now() - 60000).toISOString();
    db.updateLoop(created.loop_id, {
      status: 'active',
      iteration_count: 2,
      last_checkpoint: 'previous checkpoint',
      last_heartbeat: initialHeartbeat,
    });

    const checkpoint = await sendCommand('loop-checkpoint', {
      loop_id: created.loop_id,
      summary: 'iteration-3 checkpoint',
    });
    assert.strictEqual(checkpoint.ok, true);
    assert.strictEqual(checkpoint.iteration, 3);

    const afterCheckpoint = db.getLoop(created.loop_id);
    assert.strictEqual(afterCheckpoint.status, 'active');
    assert.strictEqual(afterCheckpoint.iteration_count, 3);
    assert.strictEqual(afterCheckpoint.last_checkpoint, 'iteration-3 checkpoint');
    assert.notStrictEqual(afterCheckpoint.last_heartbeat, initialHeartbeat);

    const checkpointHeartbeat = afterCheckpoint.last_heartbeat;
    await new Promise((resolve) => setTimeout(resolve, 5));

    const heartbeat = await sendCommand('loop-heartbeat', { loop_id: created.loop_id });
    assert.strictEqual(heartbeat.ok, true);
    assert.strictEqual(heartbeat.status, 'active');

    const afterHeartbeat = db.getLoop(created.loop_id);
    assert.strictEqual(afterHeartbeat.status, 'active');
    assert.notStrictEqual(afterHeartbeat.last_heartbeat, checkpointHeartbeat);
  });

  it('should update loop prompts for active/paused loops and preserve loop state', async () => {
    const created = await sendCommand('loop', { prompt: 'Initial loop prompt' });
    assert.strictEqual(created.ok, true);

    db.updateLoop(created.loop_id, {
      status: 'active',
      iteration_count: 4,
      last_checkpoint: 'checkpoint-before-update',
    });

    const activeUpdate = await sendCommand('loop-set-prompt', {
      loop_id: created.loop_id,
      prompt: 'Refreshed prompt while active',
    });
    assert.strictEqual(activeUpdate.ok, true);
    assert.strictEqual(activeUpdate.prompt, 'Refreshed prompt while active');
    assert.strictEqual(activeUpdate.status, 'active');
    assert.strictEqual(activeUpdate.iteration_count, 4);
    assert.strictEqual(activeUpdate.last_checkpoint, 'checkpoint-before-update');

    db.updateLoop(created.loop_id, { status: 'paused' });
    const cliUpdate = await runMac10Cli(['loop-set-prompt', String(created.loop_id), 'Refreshed prompt while paused']);
    assert.strictEqual(cliUpdate.status, 0, cliUpdate.stderr);
    assert.strictEqual(cliUpdate.stderr, '');
    assert.match(cliUpdate.stdout, new RegExp(`Loop ${created.loop_id} prompt updated\\.`));

    const promptResult = await sendCommand('loop-prompt', { loop_id: created.loop_id });
    assert.strictEqual(promptResult.ok, true);
    assert.strictEqual(promptResult.prompt, 'Refreshed prompt while paused');
    assert.strictEqual(promptResult.status, 'paused');
    assert.strictEqual(promptResult.iteration_count, 4);
    assert.strictEqual(promptResult.last_checkpoint, 'checkpoint-before-update');
    assert.strictEqual(promptResult.loop_sync_with_origin, true);
  });

  it('should refresh active loop prompt and return refreshed prompt via loop-prompt', async () => {
    const created = await sendCommand('loop', { prompt: 'Refresh prompt baseline' });
    assert.strictEqual(created.ok, true);
    const syncConfig = await sendCommand('set-config', { key: 'loop_sync_with_origin', value: 'false' });
    assert.strictEqual(syncConfig.ok, true);

    db.updateLoop(created.loop_id, {
      status: 'active',
      iteration_count: 6,
      last_checkpoint: 'checkpoint-before-refresh',
    });

    const cliRefresh = await runMac10Cli(['loop-refresh-prompt', String(created.loop_id), 'Refreshed prompt via refresh command']);
    assert.strictEqual(cliRefresh.status, 0, cliRefresh.stderr);
    assert.strictEqual(cliRefresh.stderr, '');
    assert.match(cliRefresh.stdout, new RegExp(`Loop ${created.loop_id} prompt refreshed\\.`));

    const refreshed = await sendCommand('loop-prompt', { loop_id: created.loop_id });
    assert.strictEqual(refreshed.ok, true);
    assert.strictEqual(refreshed.prompt, 'Refreshed prompt via refresh command');
    assert.strictEqual(refreshed.status, 'active');
    assert.strictEqual(refreshed.iteration_count, 6);
    assert.strictEqual(refreshed.last_checkpoint, 'checkpoint-before-refresh');
    assert.strictEqual(refreshed.loop_sync_with_origin, false);
  });

  it('should reject loop-refresh-prompt for missing loop and invalid loop_id input', async () => {
    const missing = await sendCommand('loop-refresh-prompt', {
      loop_id: 999999,
      prompt: 'refresh missing loop',
    });
    assert.strictEqual(missing.ok, false);
    assert.strictEqual(missing.error, 'Loop not found');

    const invalid = await sendCommand('loop-refresh-prompt', {
      loop_id: 'not-a-number',
      prompt: 'invalid loop id',
    });
    assert.strictEqual(invalid.error, 'Field "loop_id" must be of type number');
  });

  it('should reject loop-set-prompt for non-active loops without mutating prompt/checkpoint state', async () => {
    for (const status of ['stopped', 'failed']) {
      const created = await sendCommand('loop', { prompt: `Prompt update guard ${status}` });
      assert.strictEqual(created.ok, true);

      const baselinePrompt = `baseline-prompt-${status}`;
      const baselineCheckpoint = `baseline-checkpoint-${status}`;
      db.updateLoop(created.loop_id, {
        status,
        prompt: baselinePrompt,
        iteration_count: 7,
        last_checkpoint: baselineCheckpoint,
      });

      const rejected = await sendCommand('loop-set-prompt', {
        loop_id: created.loop_id,
        prompt: 'should-not-apply',
      });
      assert.strictEqual(rejected.ok, false);
      assert.strictEqual(rejected.error, `Loop is ${status}, prompt can only be updated for active or paused loops`);

      const promptResult = await sendCommand('loop-prompt', { loop_id: created.loop_id });
      assert.strictEqual(promptResult.ok, true);
      assert.strictEqual(promptResult.prompt, baselinePrompt);
      assert.strictEqual(promptResult.status, status);
      assert.strictEqual(promptResult.iteration_count, 7);
      assert.strictEqual(promptResult.last_checkpoint, baselineCheckpoint);
    }
  });

  it('should emit a single architect new_request mail and one request_queued event for loop-request creation', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'Create loop request once' });
    assert.strictEqual(createdLoop.ok, true);

    const loopRequest = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Update loop-request notification dedupe in coordinator/src/db.js so coordinator/tests/cli.test.js coverage keeps a single architect new_request emission and one request_queued event, because production incident triage can stall when duplicate queue signals hide true pending work.',
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

  it('should compute loop-request rate-limit retry_after_sec from oldest in-window request age', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'Loop request rate limit timing' });
    assert.strictEqual(createdLoop.ok, true);

    db.setConfig('loop_request_quality_gate', false);
    db.setConfig('loop_request_max_per_hour', 2);

    const oldestInWindow = db.createLoopRequest('Old in-window request', createdLoop.loop_id);
    assert.strictEqual(oldestInWindow.deduplicated, false);
    const recentInWindow = db.createLoopRequest('Recent in-window request', createdLoop.loop_id);
    assert.strictEqual(recentInWindow.deduplicated, false);

    const setRequestAge = db.getDb().prepare(`
      UPDATE requests
      SET created_at = datetime('now', ?), updated_at = datetime('now', ?)
      WHERE id = ?
    `);
    setRequestAge.run('-59 minutes', '-59 minutes', oldestInWindow.id);
    setRequestAge.run('-10 minutes', '-10 minutes', recentInWindow.id);

    const rateLimited = db.createLoopRequest('Rate-limited candidate', createdLoop.loop_id);
    assert.strictEqual(rateLimited.suppressed, true);
    assert.strictEqual(rateLimited.reason, 'rate_limit');
    assert.strictEqual(Number.isInteger(rateLimited.retry_after_sec), true);
    assert.ok(rateLimited.retry_after_sec >= 1);
    assert.ok(rateLimited.retry_after_sec <= 120, `expected retry_after_sec near oldest expiry, got ${rateLimited.retry_after_sec}`);
    assert.notStrictEqual(rateLimited.retry_after_sec, 3600);

    const loopRequests = db.listLoopRequests(createdLoop.loop_id);
    assert.strictEqual(loopRequests.length, 2);
  });

  it('should keep loop-requests rows single-line with control-char descriptions', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'Loop request row sanitization' });
    assert.strictEqual(createdLoop.ok, true);

    const clean = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Update loop-request row formatting in coordinator/bin/mac10 and coordinator/src/db.js so CLI output stays single-line under control characters, because production on-call triage can misread status rows and delay incident response when newline injection appears.',
    });
    assert.strictEqual(clean.ok, true);

    const malicious = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Replace coordinator/bin/mac10 row rendering; 999 [failed] T9 injected\tcol\rret\u0001ctrl. Production incident risk: control-char spoofing can hide real loop status during on-call triage, so sanitize and preserve single-line output for request rows.',
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
    assert.match(cleanRow, /Update loop-request row formatting/);
    assert.match(maliciousRow, /999 \[failed\] T9/);
    assert.ok(!maliciousRow.includes('\t'));
    assert.ok(!maliciousRow.includes('\r'));
    assert.ok(!result.stdout.includes('\n  999 [failed] T9 injected\tcol\rret'));
  });

  it('should accept Replace-starting loop requests when WHERE/WHY quality signals are present', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'WHAT verb Replace regression' });
    assert.strictEqual(createdLoop.ok, true);

    const description = 'Replace loop-request WHAT verb detection in coordinator/src/db.js and add regression coverage in coordinator/tests/cli.test.js so concrete submissions are not rejected, because production request throughput and incident remediation can be delayed by false quality-gate suppression.';
    const loopRequest = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description,
    });
    assert.strictEqual(loopRequest.ok, true);
    assert.strictEqual(loopRequest.deduplicated, false);
    assert.ok(loopRequest.request_id);

    const qualityRejections = db.getLog(200, 'loop')
      .filter((entry) => entry.action === 'loop_request_rejected_quality')
      .map((entry) => {
        try {
          return JSON.parse(entry.details);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((details) => details.loop_id === createdLoop.loop_id);
    assert.strictEqual(qualityRejections.length, 0);
  });

  it('should keep rejecting vague loop requests that lack concrete WHERE signals', async () => {
    const createdLoop = await sendCommand('loop', { prompt: 'Reject vague loop request' });
    assert.strictEqual(createdLoop.ok, true);

    const suppressed = await sendCommand('loop-request', {
      loop_id: createdLoop.loop_id,
      description: 'Improve overall request quality and make production behavior better quickly.',
    });
    assert.strictEqual(suppressed.ok, true);
    assert.strictEqual(suppressed.request_id, null);
    assert.strictEqual(db.listLoopRequests(createdLoop.loop_id).length, 0);

    const qualityRejections = db.getLog(200, 'loop')
      .filter((entry) => entry.action === 'loop_request_rejected_quality')
      .map((entry) => {
        try {
          return JSON.parse(entry.details);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((details) => details.loop_id === createdLoop.loop_id);
    assert.strictEqual(qualityRejections.length, 1);
    assert.match(qualityRejections[0].reason, /missing concrete file path signal \(WHERE\)/);
  });

  it('should allow loop request quality and rate config keys via set-config', async () => {
    const updates = [
      ['loop_sync_with_origin', 'FALSE', 'false'],
      ['loop_request_quality_gate', 'FALSE', 'false'],
      ['loop_request_min_description_chars', ' 220 ', '220'],
      ['loop_request_min_interval_sec', '900', '900'],
      ['loop_request_max_per_hour', '12', '12'],
      ['loop_request_similarity_threshold', '0.88', '0.88'],
    ];

    for (const [key, value, expectedStored] of updates) {
      const result = await sendCommand('set-config', { key, value });
      assert.strictEqual(result.ok, true, `set-config should succeed for ${key}`);
      assert.strictEqual(result.key, key);
      assert.strictEqual(result.value, expectedStored);
      assert.strictEqual(db.getConfig(key), expectedStored);
    }
  });

  it('should reject out-of-range loop request config values in set-config', async () => {
    const baseline = [
      ['loop_sync_with_origin', 'true'],
      ['loop_request_quality_gate', 'true'],
      ['loop_request_min_description_chars', '220'],
      ['loop_request_min_interval_sec', '600'],
      ['loop_request_max_per_hour', '4'],
      ['loop_request_similarity_threshold', '0.82'],
    ];

    for (const [key, value] of baseline) {
      const seeded = await sendCommand('set-config', { key, value });
      assert.strictEqual(seeded.ok, true, `seed set-config should succeed for ${key}`);
    }

    const invalidUpdates = [
      ['loop_sync_with_origin', 'sometimes', /expected true or false/],
      ['loop_request_quality_gate', 'sometimes', /expected true or false/],
      ['loop_request_min_description_chars', '79', /between 80 and 5000/],
      ['loop_request_min_interval_sec', '86401', /between 0 and 86400/],
      ['loop_request_max_per_hour', '0', /between 1 and 1000/],
      ['loop_request_similarity_threshold', '1.2', /between 0.5 and 0.99/],
    ];

    for (const [key, value, expectedError] of invalidUpdates) {
      const result = await sendCommand('set-config', { key, value });
      assert.notStrictEqual(result.ok, true, `set-config should fail for ${key}=${value}`);
      assert.match(result.error, expectedError);
    }

    assert.strictEqual(db.getConfig('loop_sync_with_origin'), 'true');
    assert.strictEqual(db.getConfig('loop_request_quality_gate'), 'true');
    assert.strictEqual(db.getConfig('loop_request_min_description_chars'), '220');
    assert.strictEqual(db.getConfig('loop_request_min_interval_sec'), '600');
    assert.strictEqual(db.getConfig('loop_request_max_per_hour'), '4');
    assert.strictEqual(db.getConfig('loop_request_similarity_threshold'), '0.82');
  });

  it('should replan blocked dependencies and promote newly unblocked tasks via RPC command', async () => {
    const requestId = db.createRequest('Dependency replan request');
    const sourceTaskId = db.createTask({
      request_id: requestId,
      subject: 'Failed source task',
      description: 'Original dependency that timed out',
    });
    const replacementTaskId = db.createTask({
      request_id: requestId,
      subject: 'Replacement task',
      description: 'Bootstrap replacement dependency',
    });
    const blockedTaskId = db.createTask({
      request_id: requestId,
      subject: 'Blocked downstream task',
      description: 'Should unblock after replanning',
      depends_on: [sourceTaskId],
    });

    db.updateTask(sourceTaskId, { status: 'failed' });
    db.updateTask(replacementTaskId, { status: 'completed' });

    const replanned = await sendCommand('replan-dependency', {
      from_task_id: sourceTaskId,
      to_task_id: replacementTaskId,
    });
    assert.strictEqual(replanned.ok, true);
    assert.strictEqual(replanned.updated_count, 1);
    assert.strictEqual(replanned.promoted_count, 1);
    assert.deepStrictEqual(replanned.updated_task_ids, [blockedTaskId]);
    assert.deepStrictEqual(replanned.promoted_task_ids, [blockedTaskId]);
    assert.strictEqual(db.getTask(blockedTaskId).depends_on, `[${replacementTaskId}]`);
    assert.strictEqual(db.getTask(blockedTaskId).status, 'ready');
  });

  it('should reject dependency replanning to a failed replacement task', async () => {
    const requestId = db.createRequest('Dependency replan failure');
    const sourceTaskId = db.createTask({
      request_id: requestId,
      subject: 'Failed source task',
      description: 'Task to replace',
    });
    const failedReplacementTaskId = db.createTask({
      request_id: requestId,
      subject: 'Failed replacement task',
      description: 'Must be rejected',
    });
    const blockedTaskId = db.createTask({
      request_id: requestId,
      subject: 'Blocked downstream task',
      description: 'Should remain blocked',
      depends_on: [sourceTaskId],
    });

    db.updateTask(sourceTaskId, { status: 'failed' });
    db.updateTask(failedReplacementTaskId, { status: 'failed' });

    const replanned = await sendCommand('replan-dependency', {
      from_task_id: sourceTaskId,
      to_task_id: failedReplacementTaskId,
    });
    assert.notStrictEqual(replanned.ok, true);
    assert.match(replanned.error, /cannot be used as a replacement dependency/);
    assert.strictEqual(db.getTask(blockedTaskId).depends_on, `[${sourceTaskId}]`);
    assert.strictEqual(db.getTask(blockedTaskId).status, 'pending');
  });

  it('should reject assign-task for claimed workers without mutating task or claim state', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const taskId = createReadyTask({
      subject: 'Claim race regression',
      description: 'Ensure claimed workers cannot be assigned by allocator',
      tier: 2,
    });

    const claim = await sendCommand('claim-worker', { worker_id: 1, claimer: 'architect' });
    assert.strictEqual(claim.ok, true);
    assert.strictEqual(claim.claimed, true);
    const claimedAt = db.getWorker(1).claimed_at;
    assert.ok(claimedAt);

    const assignment = await sendCommand('assign-task', { task_id: taskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, false);
    assert.strictEqual(assignment.error, 'worker_claimed');

    const worker = db.getWorker(1);
    assert.ok(worker);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);
    assert.strictEqual(worker.claimed_by, 'architect');
    assert.strictEqual(worker.claimed_at, claimedAt);

    const task = db.getTask(taskId);
    assert.ok(task);
    assert.strictEqual(task.status, 'ready');
    assert.strictEqual(task.assigned_to, null);
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
    const requestWithoutMergeAfter = db.getRequest(requestWithoutMerge);
    assert.strictEqual(requestWithoutMergeAfter.status, 'in_progress');
    assert.strictEqual(requestWithoutMergeAfter.completed_at, null);
    assert.strictEqual(requestWithoutMergeAfter.result, null);

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
    const requestWithMergeAfter = db.getRequest(requestWithMerge);
    assert.strictEqual(requestWithMergeAfter.status, 'integrating');
    assert.strictEqual(requestWithMergeAfter.completed_at, null);
    assert.strictEqual(requestWithMergeAfter.result, null);

    const withMergeRecoveryEvents = getCoordinatorRemediationRecoveryEvents(requestWithMerge, 'assign-task');
    assert.strictEqual(withMergeRecoveryEvents.length, 1);
    assert.strictEqual(withMergeRecoveryEvents[0].details.reopened_status, 'integrating');
    assert.ok(withMergeRecoveryEvents[0].details.merge_queue_entries >= 1);
  });

  it('should allocate a task sandbox during assign-task and pass it to the spawn handler', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const taskId = createReadyTask({
      subject: 'Sandbox assignment lifecycle',
      description: 'Assign with lifecycle state',
      tier: 2,
    });
    let handlerSandbox = null;

    cliServer.stop();
    server = cliServer.start(tmpDir, {
      onTaskCompleted: () => {},
      onLoopCreated: (loopId, prompt) => {
        loopCreatedEvents.push({ loopId, prompt });
      },
      onAssignTask: (_task, _worker, _routingDecision, taskSandbox) => {
        handlerSandbox = taskSandbox;
        db.transitionTaskSandbox(taskSandbox.id, 'running', { backend: 'tmux' });
      },
    });
    await waitForCliServerReady();

    const assignment = await sendCommand('assign-task', { task_id: taskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.ok(assignment.task_sandbox_id);
    assert.strictEqual(handlerSandbox.id, assignment.task_sandbox_id);

    const sandbox = db.getTaskSandbox(assignment.task_sandbox_id);
    assert.strictEqual(sandbox.task_id, taskId);
    assert.strictEqual(sandbox.worker_id, 1);
    assert.strictEqual(sandbox.backend, 'tmux');
    assert.strictEqual(sandbox.status, 'running');
  });

  it('should default npm_config_if_present during server start when unset', async () => {
    const env = process.env;
    const hadKey = Object.prototype.hasOwnProperty.call(env, 'npm_config_if_present');
    const originalValue = env.npm_config_if_present;

    delete env.npm_config_if_present;
    cliServer.stop();

    try {
      server = cliServer.start(tmpDir, {
        onTaskCompleted: () => {},
        onLoopCreated: (loopId, prompt) => {
          loopCreatedEvents.push({ loopId, prompt });
        },
      });
      await waitForCliServerReady();
      assert.strictEqual(env.npm_config_if_present, 'true');
    } finally {
      if (hadKey) {
        env.npm_config_if_present = originalValue;
      } else {
        delete env.npm_config_if_present;
      }
    }
  });

  it('should preserve explicit npm_config_if_present override during server start', async () => {
    const env = process.env;
    const hadKey = Object.prototype.hasOwnProperty.call(env, 'npm_config_if_present');
    const originalValue = env.npm_config_if_present;

    env.npm_config_if_present = 'false';
    cliServer.stop();

    try {
      server = cliServer.start(tmpDir, {
        onTaskCompleted: () => {},
        onLoopCreated: (loopId, prompt) => {
          loopCreatedEvents.push({ loopId, prompt });
        },
      });
      await waitForCliServerReady();
      assert.strictEqual(env.npm_config_if_present, 'false');
    } finally {
      if (hadKey) {
        env.npm_config_if_present = originalValue;
      } else {
        delete env.npm_config_if_present;
      }
    }
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

    const sandboxes = db.listTaskSandboxes({ task_id: taskId });
    assert.strictEqual(sandboxes.length, 1);
    assert.strictEqual(sandboxes[0].status, 'failed');
    assert.match(sandboxes[0].error, /spawn failed for rollback regression/);
  });

  it('should preserve claim metadata and return worker_claimed on assign-task rollback path', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const taskId = createReadyTask({
      subject: 'Regression: claimed rollback',
      description: 'Ensure worker claims persist across rollback',
      tier: 2,
    });

    const rollbackClaimedAt = '2026-03-16T00:00:00.000Z';

    cliServer.stop();
    server = cliServer.start(tmpDir, {
      onTaskCompleted: () => {},
      onLoopCreated: (loopId, prompt) => {
        loopCreatedEvents.push({ loopId, prompt });
      },
      onAssignTask: (_task, worker) => {
        db.updateWorker(worker.id, {
          status: 'idle',
          current_task_id: null,
          claimed_by: 'architect',
          claimed_at: rollbackClaimedAt,
        });
        const err = new Error('worker_claimed');
        err.code = 'worker_claimed';
        throw err;
      },
    });
    await waitForCliServerReady();

    const assignment = await sendCommand('assign-task', { task_id: taskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, false);
    assert.strictEqual(assignment.error, 'worker_claimed');

    const task = db.getTask(taskId);
    assert.ok(task);
    assert.strictEqual(task.status, 'ready');
    assert.strictEqual(task.assigned_to, null);

    const worker = db.getWorker(1);
    assert.ok(worker);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);
    assert.strictEqual(worker.claimed_by, 'architect');
    assert.strictEqual(worker.claimed_at, rollbackClaimedAt);
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

  it('should use model_spark for spark routing', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.setConfig('model_spark', 'spark-model');

    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 1 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'spark-model');
    assert.strictEqual(sparkAssignment.routing.model_source, 'config-fallback');

    const sparkAssignmentLog = getAllocatorAssignmentDetails(sparkTaskId);
    assert.ok(sparkAssignmentLog);
    assert.strictEqual(sparkAssignmentLog.model, 'spark-model');
    assert.strictEqual(sparkAssignmentLog.model_source, 'config-fallback');
  });

  it('should fall back to the default spark model when model_spark is unset', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.setConfig('model_spark', '');

    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });

    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 1 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'haiku');
    assert.strictEqual(sparkAssignment.routing.model_source, 'fallback-default');

    const sparkAssignmentLog = getAllocatorAssignmentDetails(sparkTaskId);
    assert.ok(sparkAssignmentLog);
    assert.strictEqual(sparkAssignmentLog.model, 'haiku');
    assert.strictEqual(sparkAssignmentLog.model_source, 'fallback-default');
  });

  it('should route using model_spark set through set-config', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_spark', 'spark-model-via-config');
    assert.strictEqual(db.getConfig('model_spark'), 'spark-model-via-config');

    const sparkTaskId = createReadyTask({
      subject: 'Minor cleanup',
      description: 'Small log update',
      priority: 'low',
      tier: 1,
    });
    const sparkAssignment = await sendCommand('assign-task', { task_id: sparkTaskId, worker_id: 1 });
    assert.strictEqual(sparkAssignment.ok, true);
    assert.strictEqual(sparkAssignment.routing.model, 'spark-model-via-config');
    assert.strictEqual(sparkAssignment.routing.model_source, 'config-fallback');
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

  it('should attribute constrained mid-to-spark downgrades to model_spark', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('reasoning_spark', 'spark-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 5, threshold: 10 },
    }));

    db.setConfig('model_spark', 'spark-model');

    const taskId = createReadyTask({
      subject: 'Resolve merge backlog',
      description: 'Routine helper cleanup',
      tier: 2,
    });
    const assignment = await sendCommand('assign-task', { task_id: taskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'mid');
    assert.strictEqual(assignment.routing.model, 'spark-model');
    assert.strictEqual(assignment.routing.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(assignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-budget-downgrade:mid->spark');

    const assignmentLog = getAllocatorAssignmentDetails(taskId);
    assert.ok(assignmentLog);
    assert.strictEqual(assignmentLog.model, 'spark-model');
    assert.strictEqual(assignmentLog.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(assignmentLog.routing_reason, 'fallback-budget-downgrade:mid->spark');
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

  it('should classify description-only merge/conflict signals with subject parity', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');
    db.registerWorker(4, '/wt-4', 'agent-4');

    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('reasoning_mid', 'mid-effort');
    await setConfigValue('reasoning_spark', 'spark-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({}));

    const subjectMergeTaskId = createReadyTask({
      subject: 'Resolve merge queue ownership',
      description: 'Routine helper cleanup',
      tier: 2,
    });
    const descriptionMergeTaskId = createReadyTask({
      subject: 'Routine helper cleanup',
      description: 'Resolve merge queue ownership',
      tier: 2,
    });

    const subjectMergeAssignment = await sendCommand('assign-task', { task_id: subjectMergeTaskId, worker_id: 1 });
    const descriptionMergeAssignment = await sendCommand('assign-task', { task_id: descriptionMergeTaskId, worker_id: 2 });
    assert.strictEqual(subjectMergeAssignment.ok, true);
    assert.strictEqual(descriptionMergeAssignment.ok, true);
    assert.strictEqual(subjectMergeAssignment.routing.class, 'mid');
    assert.strictEqual(descriptionMergeAssignment.routing.class, 'mid');
    assert.notStrictEqual(descriptionMergeAssignment.routing.class, 'spark');
    assert.strictEqual(descriptionMergeAssignment.routing.model, subjectMergeAssignment.routing.model);
    assert.strictEqual(descriptionMergeAssignment.routing.model_source, subjectMergeAssignment.routing.model_source);
    assert.strictEqual(descriptionMergeAssignment.routing.reasoning_effort, subjectMergeAssignment.routing.reasoning_effort);
    assert.strictEqual(descriptionMergeAssignment.routing.routing_reason, subjectMergeAssignment.routing.routing_reason);

    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 5, threshold: 10 },
    }));

    const subjectConflictTaskId = createReadyTask({
      subject: 'Resolve conflict in coordinator queue',
      description: 'Routine helper cleanup',
      tier: 2,
    });
    const descriptionConflictTaskId = createReadyTask({
      subject: 'Routine helper cleanup two',
      description: 'Resolve conflict in coordinator queue',
      tier: 2,
    });

    const subjectConflictAssignment = await sendCommand('assign-task', { task_id: subjectConflictTaskId, worker_id: 3 });
    const descriptionConflictAssignment = await sendCommand('assign-task', { task_id: descriptionConflictTaskId, worker_id: 4 });
    assert.strictEqual(subjectConflictAssignment.ok, true);
    assert.strictEqual(descriptionConflictAssignment.ok, true);
    assert.strictEqual(subjectConflictAssignment.routing.class, 'mid');
    assert.strictEqual(descriptionConflictAssignment.routing.class, 'mid');
    assert.notStrictEqual(descriptionConflictAssignment.routing.class, 'spark');
    assert.strictEqual(descriptionConflictAssignment.routing.model, subjectConflictAssignment.routing.model);
    assert.strictEqual(descriptionConflictAssignment.routing.model_source, subjectConflictAssignment.routing.model_source);
    assert.strictEqual(descriptionConflictAssignment.routing.reasoning_effort, subjectConflictAssignment.routing.reasoning_effort);
    assert.strictEqual(descriptionConflictAssignment.routing.routing_reason, subjectConflictAssignment.routing.routing_reason);
    assert.strictEqual(descriptionConflictAssignment.routing.model, 'spark-model');
    assert.strictEqual(descriptionConflictAssignment.routing.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(descriptionConflictAssignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(descriptionConflictAssignment.routing.routing_reason, 'fallback-budget-downgrade:mid->spark');
  });

  it('should classify low-priority docs/typo signals symmetrically across subject and description', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('reasoning_mini', 'mini-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({}));

    const descriptionDocsTaskId = createReadyTask({
      subject: 'Routine cleanup item',
      description: 'Update docs for worker setup instructions',
      priority: 'low',
      tier: 1,
    });
    const subjectTypoTaskId = createReadyTask({
      subject: 'Fix typo in coordinator worker prompt',
      description: 'Routine cleanup item',
      priority: 'low',
      tier: 1,
    });

    const descriptionDocsAssignment = await sendCommand('assign-task', { task_id: descriptionDocsTaskId, worker_id: 1 });
    const subjectTypoAssignment = await sendCommand('assign-task', { task_id: subjectTypoTaskId, worker_id: 2 });
    assert.strictEqual(descriptionDocsAssignment.ok, true);
    assert.strictEqual(subjectTypoAssignment.ok, true);
    assert.strictEqual(descriptionDocsAssignment.routing.class, 'mini');
    assert.strictEqual(subjectTypoAssignment.routing.class, 'mini');
    assert.notStrictEqual(descriptionDocsAssignment.routing.class, 'spark');
    assert.notStrictEqual(subjectTypoAssignment.routing.class, 'spark');
    assert.strictEqual(descriptionDocsAssignment.routing.model, 'mini-model');
    assert.strictEqual(subjectTypoAssignment.routing.model, 'mini-model');
    assert.strictEqual(descriptionDocsAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(subjectTypoAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(descriptionDocsAssignment.routing.routing_reason, 'fallback-routing:class-default');
    assert.strictEqual(subjectTypoAssignment.routing.routing_reason, 'fallback-routing:class-default');
  });

  it('should ignore embedded merge/conflict substrings in low-priority docs/typo subjects', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_mini', 'mini-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({}));

    const emergencyTypoTaskId = createReadyTask({
      subject: 'Emergency typo fix',
      description: 'Routine cleanup item',
      priority: 'low',
      tier: 1,
    });
    const submergeDocsTaskId = createReadyTask({
      subject: 'Submerge docs cleanup',
      description: 'Routine cleanup item',
      priority: 'low',
      tier: 1,
    });

    const emergencyTypoAssignment = await sendCommand('assign-task', { task_id: emergencyTypoTaskId, worker_id: 1 });
    const submergeDocsAssignment = await sendCommand('assign-task', { task_id: submergeDocsTaskId, worker_id: 2 });
    assert.strictEqual(emergencyTypoAssignment.ok, true);
    assert.strictEqual(submergeDocsAssignment.ok, true);
    assert.strictEqual(emergencyTypoAssignment.routing.class, 'mini');
    assert.strictEqual(submergeDocsAssignment.routing.class, 'mini');
    assert.notStrictEqual(emergencyTypoAssignment.routing.class, 'mid');
    assert.notStrictEqual(submergeDocsAssignment.routing.class, 'mid');
    assert.strictEqual(emergencyTypoAssignment.routing.model, 'mini-model');
    assert.strictEqual(submergeDocsAssignment.routing.model, 'mini-model');
    assert.strictEqual(emergencyTypoAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(submergeDocsAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(emergencyTypoAssignment.routing.routing_reason, 'fallback-routing:class-default');
    assert.strictEqual(submergeDocsAssignment.routing.routing_reason, 'fallback-routing:class-default');
  });

  it('should ignore embedded typo/refactor substrings in fallback routing signals', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');

    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('reasoning_spark', 'spark-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({}));

    const typographyTaskId = createReadyTask({
      subject: 'Typography cleanup pass',
      description: 'Routine content cleanup',
      priority: 'low',
      tier: 1,
    });
    const prefactorTaskId = createReadyTask({
      subject: 'Prefactor helper cleanup',
      description: 'Routine maintenance task',
      priority: 'normal',
      tier: 2,
    });

    const typographyAssignment = await sendCommand('assign-task', { task_id: typographyTaskId, worker_id: 1 });
    const prefactorAssignment = await sendCommand('assign-task', { task_id: prefactorTaskId, worker_id: 2 });

    assert.strictEqual(typographyAssignment.ok, true);
    assert.strictEqual(prefactorAssignment.ok, true);
    assert.strictEqual(typographyAssignment.routing.class, 'spark');
    assert.strictEqual(prefactorAssignment.routing.class, 'spark');
    assert.notStrictEqual(typographyAssignment.routing.class, 'mini');
    assert.notStrictEqual(prefactorAssignment.routing.class, 'mid');
    assert.strictEqual(typographyAssignment.routing.model, 'spark-model');
    assert.strictEqual(prefactorAssignment.routing.model, 'spark-model');
    assert.strictEqual(typographyAssignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(prefactorAssignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(typographyAssignment.routing.routing_reason, 'fallback-routing:class-default');
    assert.strictEqual(prefactorAssignment.routing.routing_reason, 'fallback-routing:class-default');
  });

  it('should escalate generic tasks when code-heavy metadata is present while preserving docs/typo mini paths', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.registerWorker(2, '/wt-2', 'agent-2');
    db.registerWorker(3, '/wt-3', 'agent-3');

    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_mid', 'mid-effort');
    await setConfigValue('reasoning_spark', 'spark-effort');
    await setConfigValue('reasoning_mini', 'mini-effort');
    await setConfigValue('routing_budget_state', JSON.stringify({}));

    const genericWithMetadataTaskId = createReadyTask({
      subject: 'Routine maintenance',
      description: 'General follow-up item',
      priority: 'normal',
      tier: 2,
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js', 'coordinator/tests/cli.test.js'],
      validation: ['cd coordinator && npm test -- tests/cli.test.js'],
    });
    const genericWithoutMetadataTaskId = createReadyTask({
      subject: 'Routine maintenance',
      description: 'General follow-up item',
      priority: 'normal',
      tier: 2,
    });
    const docsWithCodeMetadataTaskId = createReadyTask({
      subject: 'Routine maintenance',
      description: 'Fix typo in docs for worker setup',
      priority: 'low',
      tier: 2,
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js', 'coordinator/tests/cli.test.js'],
      validation: ['tier2'],
    });

    const metadataAssignment = await sendCommand('assign-task', { task_id: genericWithMetadataTaskId, worker_id: 1 });
    const baselineAssignment = await sendCommand('assign-task', { task_id: genericWithoutMetadataTaskId, worker_id: 2 });
    const docsAssignment = await sendCommand('assign-task', { task_id: docsWithCodeMetadataTaskId, worker_id: 3 });

    assert.strictEqual(metadataAssignment.ok, true);
    assert.strictEqual(metadataAssignment.routing.class, 'mid');
    assert.strictEqual(metadataAssignment.routing.model, 'mid-model');
    assert.strictEqual(metadataAssignment.routing.reasoning_effort, 'mid-effort');
    assert.strictEqual(metadataAssignment.routing.routing_reason, 'fallback-routing:class-default');

    assert.strictEqual(baselineAssignment.ok, true);
    assert.strictEqual(baselineAssignment.routing.class, 'spark');
    assert.strictEqual(baselineAssignment.routing.model, 'spark-model');
    assert.strictEqual(baselineAssignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(baselineAssignment.routing.routing_reason, 'fallback-routing:class-default');

    assert.strictEqual(docsAssignment.ok, true);
    assert.strictEqual(docsAssignment.routing.class, 'mini');
    assert.strictEqual(docsAssignment.routing.model, 'mini-model');
    assert.strictEqual(docsAssignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(docsAssignment.routing.routing_reason, 'fallback-routing:class-default');
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

  it('should downscale routing from scalar budget keys when routing_budget_state JSON has invalid array shape', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('reasoning_mini', 'mini-effort');

    db.setConfig('routing_budget_state', '[]');
    db.setConfig('routing_budget_flagship_remaining', '7');
    db.setConfig('routing_budget_flagship_threshold', '10');

    const highTaskId = createReadyTask({
      subject: 'Invalid array budget shape should not block scalar fallback',
      description: 'Critical merge refactor routing path',
      priority: 'high',
      tier: 3,
    });

    const assignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'high');
    assert.strictEqual(assignment.routing.model, 'mini-model');
    assert.strictEqual(assignment.routing.model_source, 'budget-downgrade:model_mini');
    assert.strictEqual(assignment.routing.reasoning_effort, 'mini-effort');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-budget-downgrade:high->mini');
  });

  it('should merge scalar fallback into partial routing_budget_state for routing decisions', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_mid', 'mid-model');
    await setConfigValue('model_spark', 'spark-model');
    await setConfigValue('reasoning_spark', 'spark-effort');

    db.setConfig('routing_budget_state', JSON.stringify({
      flagship: { remaining: 7 },
    }));
    db.setConfig('routing_budget_flagship_remaining', '50');
    db.setConfig('routing_budget_flagship_threshold', '10');

    const midTaskId = createReadyTask({
      subject: 'Partial budget object should merge missing threshold',
      description: 'Resolve merge conflict in fallback router',
      tier: 2,
    });

    const assignment = await sendCommand('assign-task', { task_id: midTaskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'mid');
    assert.strictEqual(assignment.routing.model, 'spark-model');
    assert.strictEqual(assignment.routing.model_source, 'budget-downgrade:model_spark');
    assert.strictEqual(assignment.routing.reasoning_effort, 'spark-effort');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-budget-downgrade:mid->spark');
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

  it('should clear stale constrained routing_budget_state values when scalar budget keys are blanked', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_high', 'high-model');
    await setConfigValue('model_mini', 'mini-model');
    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 5, threshold: 10 },
    }));

    await setConfigValue('routing_budget_flagship_remaining', '');
    await setConfigValue('routing_budget_flagship_threshold', '   ');

    assert.strictEqual(db.getConfig('flagship_budget_remaining'), '');
    assert.strictEqual(db.getConfig('flagship_budget_threshold'), '   ');

    const clearedState = JSON.parse(db.getConfig('routing_budget_state'));
    const clearedFlagship = clearedState && clearedState.flagship && typeof clearedState.flagship === 'object'
      ? clearedState.flagship
      : {};
    assert.strictEqual(Object.prototype.hasOwnProperty.call(clearedFlagship, 'remaining'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(clearedFlagship, 'threshold'), false);

    const highTaskId = createReadyTask({
      subject: 'Post-clear high routing should not stay constrained',
      description: 'Critical merge remediation',
      priority: 'high',
      tier: 3,
    });
    const assignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'high');
    assert.strictEqual(assignment.routing.model, 'high-model');
    assert.strictEqual(assignment.routing.model_source, 'config-fallback');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-routing:class-default');
  });

  it('should remove stale scalar remaining from routing_budget_state on non-numeric set-config values', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    await setConfigValue('model_xhigh', 'xhigh-model');
    await setConfigValue('model_high', 'high-model');
    await setConfigValue('routing_budget_state', JSON.stringify({
      flagship: { remaining: 35, threshold: 10 },
    }));
    await setConfigValue('routing_budget_flagship_threshold', '10');
    await setConfigValue('routing_budget_flagship_remaining', 'not-a-number');

    assert.strictEqual(db.getConfig('flagship_budget_remaining'), 'not-a-number');
    assert.strictEqual(db.getConfig('flagship_budget_threshold'), '10');

    const syncedState = JSON.parse(db.getConfig('routing_budget_state'));
    const syncedFlagship = syncedState && syncedState.flagship && typeof syncedState.flagship === 'object'
      ? syncedState.flagship
      : {};
    assert.strictEqual(Object.prototype.hasOwnProperty.call(syncedFlagship, 'remaining'), false);
    assert.strictEqual(syncedFlagship.threshold, 10);

    const highTaskId = createReadyTask({
      subject: 'Non numeric scalar budget clear path',
      description: 'Critical branch maintenance',
      priority: 'high',
      tier: 3,
    });
    const assignment = await sendCommand('assign-task', { task_id: highTaskId, worker_id: 1 });
    assert.strictEqual(assignment.ok, true);
    assert.strictEqual(assignment.routing.class, 'high');
    assert.strictEqual(assignment.routing.model, 'high-model');
    assert.strictEqual(assignment.routing.model_source, 'config-fallback');
    assert.strictEqual(assignment.routing.routing_reason, 'fallback-routing:class-default');
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
    await setConfigValue('routing_budget_flagship_remaining', '');
    await setConfigValue('routing_budget_flagship_threshold', '   ');
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

  // === CLI exit code regression tests ===

  it('should exit with code 1 when assign-task RPC fails for non-existent task', async () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const result = await runMac10Cli(['assign-task', '9999', '1']);
    assert.strictEqual(result.status, 1);
  });

  it('should exit with code 1 when integrate fails for request with incomplete tasks', async () => {
    const reqId = db.createRequest('Integration exit-code test');
    db.createTask({ request_id: reqId, subject: 'Incomplete task', description: 'Not done yet' });
    const result = await runMac10Cli(['integrate', reqId]);
    assert.strictEqual(result.status, 1);
  });

  it('should exit with code 1 when create-task RPC fails due to invalid args', async () => {
    // createTask throws when required fields are missing, outer catch responds ok:false
    const result = await runMac10Cli(['create-task', JSON.stringify({ request_id: null, subject: '' })]);
    assert.strictEqual(result.status, 1);
  });

  it('should exit with code 1 when loop-heartbeat is rejected for a stopped loop', async () => {
    const created = await sendCommand('loop', { prompt: 'CLI exit-code test stopped' });
    assert.strictEqual(created.ok, true);
    db.updateLoop(created.loop_id, { status: 'stopped' });
    const result = await runMac10Cli(['loop-heartbeat', String(created.loop_id)]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /stopped/i);
  });

  it('should exit with code 1 when loop-heartbeat is rejected for a paused loop', async () => {
    const created = await sendCommand('loop', { prompt: 'CLI exit-code test paused' });
    assert.strictEqual(created.ok, true);
    db.updateLoop(created.loop_id, { status: 'paused' });
    const result = await runMac10Cli(['loop-heartbeat', String(created.loop_id)]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /paused/i);
  });

  it('should exit with code 1 when loop-heartbeat fails for a loop in failed status', async () => {
    const created = await sendCommand('loop', { prompt: 'CLI exit-code test failed' });
    assert.strictEqual(created.ok, true);
    db.updateLoop(created.loop_id, { status: 'failed' });
    const result = await runMac10Cli(['loop-heartbeat', String(created.loop_id)]);
    assert.strictEqual(result.status, 1);
    assert.match(result.stderr, /failed/i);
  });

  it('should exit with code 0 when loop-heartbeat succeeds for an active loop', async () => {
    const created = await sendCommand('loop', { prompt: 'CLI exit-code test active' });
    assert.strictEqual(created.ok, true);
    const result = await runMac10Cli(['loop-heartbeat', String(created.loop_id)]);
    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stderr, '');
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

describe('changes CLI commands', () => {
  it('logs changes and filters them by domain', async () => {
    const created = await sendCommand('log-change', {
      description: 'Refactor command handling',
      domain: 'coordinator',
      file_path: 'coordinator/src/cli-server.js',
      function_name: 'handleCommand',
      tooltip: 'Move one command group at a time',
    });

    assert.strictEqual(created.ok, true);
    assert.ok(Number.isInteger(created.change_id));

    const listed = await sendCommand('list-changes', { domain: 'coordinator' });
    assert.strictEqual(listed.ok, true);
    assert.strictEqual(listed.changes.length, 1);
    assert.strictEqual(listed.changes[0].id, created.change_id);
    assert.strictEqual(listed.changes[0].description, 'Refactor command handling');
  });

  it('updates only mutable change fields', async () => {
    const created = await sendCommand('log-change', {
      description: 'Original description',
      domain: 'coordinator',
      file_path: 'coordinator/src/cli-server.js',
      tooltip: 'Original tooltip',
    });

    const updated = await sendCommand('update-change', {
      id: created.change_id,
      description: 'Updated description',
      tooltip: 'Updated tooltip',
      status: 'pending_user_action',
      file_path: 'coordinator/src/commands/changes.js',
      domain: 'ignored-domain',
    });

    assert.strictEqual(updated.ok, true);
    const change = db.getChange(created.change_id);
    assert.strictEqual(change.description, 'Updated description');
    assert.strictEqual(change.tooltip, 'Updated tooltip');
    assert.strictEqual(change.status, 'pending_user_action');
    assert.strictEqual(change.file_path, 'coordinator/src/cli-server.js');
    assert.strictEqual(change.domain, 'coordinator');
  });
});

describe('merge observability CLI commands', () => {
  it('returns merge metrics rows', async () => {
    db.incrementMetric('self_heal_attempts');

    const result = await sendCommand('merge-metrics', {});
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.metrics));
    assert.ok(result.metrics.some((row) => (
      row.metric_name === 'self_heal_attempts' && row.metric_value === 1
    )));
  });

  it('summarizes merge queue status counts', async () => {
    const requestId = db.createRequest('merge health CLI test request');
    const taskOne = db.createTask({ request_id: requestId, subject: 'Pending merge', description: 'pending' });
    const taskTwo = db.createTask({ request_id: requestId, subject: 'Merged merge', description: 'merged' });
    const taskThree = db.createTask({ request_id: requestId, subject: 'Failed merge', description: 'failed' });

    db.enqueueMerge({ request_id: requestId, task_id: taskOne, pr_url: 'https://example.invalid/pr/1', branch: 'agent-1' });
    const merged = db.enqueueMerge({ request_id: requestId, task_id: taskTwo, pr_url: 'https://example.invalid/pr/2', branch: 'agent-2' });
    const failed = db.enqueueMerge({ request_id: requestId, task_id: taskThree, pr_url: 'https://example.invalid/pr/3', branch: 'agent-3' });
    db.updateMerge(merged.lastInsertRowid, { status: 'merged' });
    db.updateMerge(failed.lastInsertRowid, { status: 'failed' });

    const result = await sendCommand('merge-health', {});
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.health.pending, 1);
    assert.strictEqual(result.health.merged, 1);
    assert.strictEqual(result.health.failed, 1);
    assert.strictEqual(result.health.ready, 0);
    assert.strictEqual(result.health.conflict, 0);
  });
});

describe('microvm CLI commands', () => {
  function resetMicrovmModule() {
    delete require.cache[require.resolve('../src/microvm-manager')];
  }

  function msbStatusTable(...rows) {
    const header = 'SANDBOX         STATUS     PIDS            CPU          MEMORY       DISK';
    const sep = '-'.repeat(80);
    const dataLines = rows.map(([name, status]) => `${name.padEnd(16)}${status.padEnd(11)}-               -            -            -`);
    return [header, sep, ...dataLines].join('\n');
  }

  it('exposes msb status through RPC', async () => {
    const childProcess = require('child_process');
    resetMicrovmModule();
    const execMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
      if (cmd === 'msb' && args[0] === '--version') return 'msb 0.3.4\n';
      if (cmd === 'msb' && args[0] === 'server' && args[1] === 'status') return 'running\n';
      if (cmd === 'msb' && args[0] === 'status') {
        return msbStatusTable(['worker-1', 'RUNNING'], ['loop-1', 'RUNNING']);
      }
      return '';
    });

    try {
      const status = await sendCommand('msb-status', {});
      assert.strictEqual(status.ok, true);
      assert.strictEqual(status.msb_installed, true);
      assert.strictEqual(status.server_running, true);
      assert.strictEqual(status.total_sandboxes, 2);
      assert.strictEqual(status.sandboxes.length, 1);
      assert.strictEqual(status.sandboxes[0].name, 'worker-1');
    } finally {
      execMock.mock.restore();
      resetMicrovmModule();
    }
  });

  it('reports missing msb setup dependency without starting setup', async () => {
    const childProcess = require('child_process');
    resetMicrovmModule();
    const execMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
      if (cmd === 'msb' && args[0] === '--version') throw new Error('not found');
      return '';
    });

    try {
      const result = await sendCommand('msb-setup', {});
      assert.match(result.error, /msb CLI is not installed/);
    } finally {
      execMock.mock.restore();
      resetMicrovmModule();
    }
  });
});

describe('knowledge CLI commands', () => {
  it('reports knowledge status and health from the project directory', async () => {
    fs.mkdirSync(path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.claude', 'knowledge', 'research', 'topics'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'), 'Coordinator notes\n');

    const status = await sendCommand('knowledge-status', {});
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.pending_reviews_count, 0);
    assert.strictEqual(status.domain_coverage.coordinator.exists, true);

    const health = await sendCommand('knowledge-health', {});
    assert.strictEqual(health.ok, false);
    assert.ok(health.present.includes(path.join('.claude', 'knowledge', 'codebase', 'domains')));
    assert.ok(health.missing.includes(path.join('.claude', 'knowledge', 'mistakes.md')));
  });

  it('increments knowledge metadata and resets the index timestamp', async () => {
    const increment = await sendCommand('knowledge-increment', {
      domain: 'coordinator',
      worker_patch: true,
    });
    assert.strictEqual(increment.ok, true);
    assert.strictEqual(increment.domain, 'coordinator');
    assert.strictEqual(increment.changes_since_index, 1);

    const metadataAfterIncrement = knowledgeMeta.getMetadata(tmpDir);
    assert.strictEqual(metadataAfterIncrement.domains.coordinator.changes_since_research, 1);
    assert.strictEqual(metadataAfterIncrement.domains.coordinator.worker_patches, 1);

    const updated = await sendCommand('knowledge-update-index-timestamp', {});
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(updated.changes_since_index, 0);
    assert.ok(updated.last_indexed);
  });
});

describe('domain analysis CLI commands', () => {
  it('creates, submits, lists, and approves domain analyses', async () => {
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'state', 'codebase-map.json'),
      JSON.stringify({ domains: { coordinator: { files: ['coordinator/src/cli-server.js'] } } })
    );

    const created = await sendCommand('analyze-domain', { domain: 'coordinator' });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.domain, 'coordinator');

    const requestedMail = listMailForRecipient('architect')
      .filter((mail) => mail.type === 'domain_analysis_requested');
    assert.strictEqual(requestedMail.length, 1);
    assert.strictEqual(requestedMail[0].payload.analysis_id, created.id);

    const fetched = await sendCommand('domain-analysis', { id: created.id });
    assert.strictEqual(fetched.ok, true);
    assert.match(fetched.analysis.source_map_hash, /^[a-f0-9]{16}$/);

    const submitted = await sendCommand('submit-domain-draft', {
      id: created.id,
      review_sheet: 'Review coordinator domain',
      draft_payload: '## Coordinator\n\nCommand handling notes.',
      analyzed_files: '["coordinator/src/cli-server.js"]',
    });
    assert.strictEqual(submitted.ok, true);
    assert.strictEqual(submitted.analysis.status, 'review_pending');

    const listed = await sendCommand('domain-analyses', { domain: 'coordinator', status: 'review_pending' });
    assert.strictEqual(listed.ok, true);
    assert.strictEqual(listed.count, 1);

    const approved = await sendCommand('approve-domain', {
      id: created.id,
      feedback: 'Keep command boundaries focused.',
    });
    assert.strictEqual(approved.ok, true);

    const domainDoc = fs.readFileSync(
      path.join(tmpDir, '.claude', 'knowledge', 'codebase', 'domains', 'coordinator.md'),
      'utf8'
    );
    assert.match(domainDoc, /Command handling notes/);
    assert.match(domainDoc, /Human-Confirmed Context/);
    assert.match(domainDoc, /Keep command boundaries focused/);

    const completedMail = listMailForRecipient('master-1')
      .filter((mail) => mail.type === 'domain_review_completed');
    assert.ok(completedMail.some((mail) => mail.payload.status === 'approved'));
  });

  it('rejects domain analyses only from review_pending state', async () => {
    const created = await sendCommand('analyze-domain', { domain: 'routing' });
    const earlyReject = await sendCommand('reject-domain', { id: created.id, feedback: 'Too early' });
    assert.strictEqual(earlyReject.ok, false);

    await sendCommand('submit-domain-draft', {
      id: created.id,
      review_sheet: 'Review routing domain',
      draft_payload: 'Routing draft',
      analyzed_files: '[]',
    });
    const rejected = await sendCommand('reject-domain', { id: created.id, feedback: 'Needs more detail' });
    assert.strictEqual(rejected.ok, true);

    const fetched = await sendCommand('domain-analysis', { id: created.id });
    assert.strictEqual(fetched.analysis.status, 'rejected');
    assert.strictEqual(fetched.analysis.human_feedback, 'Needs more detail');
  });
});

describe('extended research CLI commands', () => {
  it('creates, lists, reviews, and exposes pending research topics', async () => {
    const created = await sendCommand('create-research-topic', {
      title: 'Study routing allocator',
      description: 'Find allocator routing follow-up work',
      category: 'pattern',
      discovery_source: 'cli-test',
      tags: '["routing","allocator"]',
    });
    assert.strictEqual(created.ok, true);
    assert.strictEqual(created.topic.review_status, 'discovered');

    const discoveredMail = listMailForRecipient('master-1')
      .filter((mail) => mail.type === 'research_topic_discovered');
    assert.ok(discoveredMail.some((mail) => mail.payload.topic_id === created.id));

    const fetched = await sendCommand('research-topic', { id: created.id });
    assert.strictEqual(fetched.ok, true);
    assert.strictEqual(fetched.topic.title, 'Study routing allocator');

    const pending = await sendCommand('pending-reviews', { limit: 10 });
    assert.strictEqual(pending.ok, true);
    assert.ok(pending.items.some((item) => item.item_type === 'research_topic' && item.id === created.id));

    const listed = await sendCommand('research-topics', { review_status: 'discovered', category: 'pattern' });
    assert.strictEqual(listed.ok, true);
    assert.strictEqual(listed.count, 1);

    const reviewed = await sendCommand('review-research-topic', {
      id: created.id,
      review_status: 'approved',
      notes: 'Proceed after cli-server extraction',
    });
    assert.strictEqual(reviewed.ok, true);

    const afterReview = await sendCommand('research-topic', { id: created.id });
    assert.strictEqual(afterReview.topic.review_status, 'approved');
    assert.strictEqual(afterReview.topic.human_notes, 'Proceed after cli-server extraction');
  });

  it('fill-knowledge queues research for stale uncovered domains and signals rescan', async () => {
    knowledgeMeta.writeMetadata(tmpDir, {
      last_indexed: null,
      changes_since_index: 6,
      domains: {
        routing: { changes_since_research: 3, worker_patches: 0 },
      },
      last_external_research: null,
      external_research_stale_topics: [],
    });

    const result = await sendCommand('fill-knowledge', {});
    assert.strictEqual(result.ok, true);
    assert.ok(result.actions.some((action) => (
      action.type === 'research_queued' && action.domain === 'routing'
    )));
    assert.ok(result.actions.some((action) => action.type === 'rescan_signaled'));
    assert.deepStrictEqual(result.status_summary.domains_with_gaps, ['routing']);
    assert.deepStrictEqual(result.status_summary.stale_domains, ['routing']);
    assert.strictEqual(result.status_summary.changes_since_index, 6);

    const architectMail = listMailForRecipient('architect')
      .filter((mail) => mail.type === 'rescan_requested');
    assert.strictEqual(architectMail.length, 1);
  });
});

describe('memory-retrieval CLI commands', () => {
  it('memory-snapshots returns ok with empty list when no snapshots', async () => {
    const result = await sendCommand('memory-snapshots', {});
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.snapshots));
    assert.strictEqual(result.snapshots.length, 0);
  });

  it('memory-snapshots filters by project_context_key', async () => {
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-alpha',
      snapshot_payload: { d: 1 },
    });
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-beta',
      snapshot_payload: { d: 2 },
    });
    const result = await sendCommand('memory-snapshots', { project_context_key: 'ctx-cli-alpha' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.snapshots.length, 1);
    assert.strictEqual(result.snapshots[0].project_context_key, 'ctx-cli-alpha');
  });

  it('memory-snapshots filters by validation_status', async () => {
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-valid',
      snapshot_payload: { d: 1 },
      validation_status: 'validated',
    });
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-valid',
      snapshot_payload: { d: 2 },
    });
    const result = await sendCommand('memory-snapshots', { project_context_key: 'ctx-cli-valid', validation_status: 'validated' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.snapshots.length, 1);
    assert.strictEqual(result.snapshots[0].validation_status, 'validated');
  });

  it('memory-snapshot returns error for missing id', async () => {
    const result = await sendCommand('memory-snapshot', { id: 99999 });
    assert.strictEqual(result.ok, false);
  });

  it('memory-snapshot retrieves snapshot with lineage', async () => {
    const reqId = db.createRequest('memory snapshot CLI test request');
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-lineage',
      snapshot_payload: { data: 'lineage' },
      request_id: reqId,
    });
    const result = await sendCommand('memory-snapshot', { id: snap.id, include_lineage: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.snapshot.id, snap.id);
    assert.ok(Array.isArray(result.lineage));
    assert.ok(result.lineage.length >= 1);
    assert.ok(result.lineage.every(l => l.snapshot_id === snap.id));
  });

  it('memory-insights returns ok with empty list when no artifacts', async () => {
    const result = await sendCommand('memory-insights', {});
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.artifacts));
    assert.strictEqual(result.artifacts.length, 0);
  });

  it('memory-insights filters by min_relevance_score', async () => {
    db.createInsightArtifact({
      project_context_key: 'ctx-cli-rel',
      artifact_payload: { c: 'high' },
      relevance_score: 0.9,
    });
    db.createInsightArtifact({
      project_context_key: 'ctx-cli-rel',
      artifact_payload: { c: 'low' },
      relevance_score: 0.2,
    });
    const result = await sendCommand('memory-insights', { project_context_key: 'ctx-cli-rel', min_relevance_score: 0.5 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.artifacts.length, 1);
    assert.ok(result.artifacts[0].relevance_score >= 0.5);
  });

  it('memory-insight returns artifact with lineage links', async () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-ia-lineage',
      snapshot_payload: { d: 'snap' },
    });
    const artifact = db.createInsightArtifact({
      project_context_key: 'ctx-cli-ia-lineage',
      snapshot_id: snap.id,
      artifact_payload: { insight: 'test' },
    });
    const result = await sendCommand('memory-insight', { id: artifact.id, include_lineage: true });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.artifact.id, artifact.id);
    assert.ok(Array.isArray(result.lineage));
    assert.ok(result.lineage.some(l => l.insight_artifact_id === artifact.id));
  });

  it('memory-lineage returns empty list when no links', async () => {
    const result = await sendCommand('memory-lineage', {});
    assert.strictEqual(result.ok, true);
    assert.ok(Array.isArray(result.links));
    assert.strictEqual(result.links.length, 0);
  });

  it('memory-lineage filters by lineage_type', async () => {
    const reqId = db.createRequest('lineage type filter test');
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-cli-ltype',
      snapshot_payload: { d: 'ltype' },
      request_id: reqId,
      lineage_type: 'origin',
    });
    const result = await sendCommand('memory-lineage', { request_id: reqId, lineage_type: 'origin' });
    assert.strictEqual(result.ok, true);
    assert.ok(result.links.length >= 1);
    assert.ok(result.links.every(l => l.lineage_type === 'origin'));
  });
});

describe('memory CLI — quota-pressure and iterative-run scenarios', () => {
  it('memory-snapshots returns all snapshots under quota-pressure (30 snapshots)', async () => {
    const contextKey = 'ctx-cli-quota';
    for (let i = 1; i <= 30; i++) {
      db.createProjectMemorySnapshot({
        project_context_key: contextKey,
        snapshot_payload: { iteration: i },
      });
    }
    const result = await sendCommand('memory-snapshots', { project_context_key: contextKey, limit: 100 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.snapshots.length, 30);
    assert.ok(result.snapshots.every(s => s.project_context_key === contextKey));
  });

  it('memory-snapshots pagination under quota-pressure has no overlap', async () => {
    const contextKey = 'ctx-cli-quota-page';
    for (let i = 1; i <= 25; i++) {
      db.createProjectMemorySnapshot({
        project_context_key: contextKey,
        snapshot_payload: { i },
      });
    }
    const page1 = await sendCommand('memory-snapshots', { project_context_key: contextKey, limit: 10, offset: 0 });
    const page2 = await sendCommand('memory-snapshots', { project_context_key: contextKey, limit: 10, offset: 10 });
    const page3 = await sendCommand('memory-snapshots', { project_context_key: contextKey, limit: 10, offset: 20 });
    assert.strictEqual(page1.ok, true);
    assert.strictEqual(page2.ok, true);
    assert.strictEqual(page3.ok, true);
    assert.strictEqual(page1.snapshots.length, 10);
    assert.strictEqual(page2.snapshots.length, 10);
    assert.strictEqual(page3.snapshots.length, 5);
    const allIds = [
      ...page1.snapshots.map(s => s.id),
      ...page2.snapshots.map(s => s.id),
      ...page3.snapshots.map(s => s.id),
    ];
    assert.strictEqual(new Set(allIds).size, 25, 'No overlapping snapshot ids across pages');
  });

  it('memory-snapshots filters validated snapshots under quota-pressure', async () => {
    const contextKey = 'ctx-cli-quota-valid';
    for (let i = 1; i <= 20; i++) {
      db.createProjectMemorySnapshot({
        project_context_key: contextKey,
        snapshot_payload: { i },
        validation_status: i % 4 === 0 ? 'validated' : 'unvalidated',
      });
    }
    const result = await sendCommand('memory-snapshots', { project_context_key: contextKey, validation_status: 'validated' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.snapshots.length, 5); // i=4,8,12,16,20
    assert.ok(result.snapshots.every(s => s.validation_status === 'validated'));
  });

  it('iterative-run: artifacts from earlier runs remain retrievable via memory-lineage by run_id', async () => {
    const contextKey = 'ctx-cli-iter-run';
    const run1 = 'iter-cli-run-1';
    const run2 = 'iter-cli-run-2';

    const reqId1 = db.createRequest('iter run 1 request');
    const snap1 = db.createProjectMemorySnapshot({
      project_context_key: contextKey,
      snapshot_payload: { run: 1, output: 'first-result' },
      run_id: run1,
      request_id: reqId1,
    });

    const reqId2 = db.createRequest('iter run 2 request');
    const snap2 = db.createProjectMemorySnapshot({
      project_context_key: contextKey,
      snapshot_payload: { run: 2, output: 'derived-result' },
      run_id: run2,
      request_id: reqId2,
    });
    db.createProjectMemoryLineageLink({
      snapshot_id: snap2.id,
      run_id: run2,
      lineage_type: 'derived_from',
      metadata: { parent_snapshot_id: snap1.id },
    });

    const run1Links = await sendCommand('memory-lineage', { request_id: reqId1 });
    assert.strictEqual(run1Links.ok, true);
    assert.ok(run1Links.links.length >= 1);
    assert.ok(run1Links.links.every(l => l.request_id === reqId1));

    const derivedLinks = await sendCommand('memory-lineage', { snapshot_id: snap2.id, lineage_type: 'derived_from' });
    assert.strictEqual(derivedLinks.ok, true);
    assert.ok(derivedLinks.links.length >= 1);
    assert.strictEqual(derivedLinks.links[0].lineage_type, 'derived_from');
  });

  it('iterative-run: memory-snapshot retrieves correct version across multiple runs', async () => {
    const contextKey = 'ctx-cli-iter-version';
    const snaps = [];
    for (let i = 1; i <= 5; i++) {
      snaps.push(db.createProjectMemorySnapshot({
        project_context_key: contextKey,
        snapshot_payload: { run: i, result: `output-${i}` },
        run_id: `iter-ver-run-${i}`,
      }));
    }
    for (const snap of snaps) {
      const result = await sendCommand('memory-snapshot', { id: snap.id });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.snapshot.id, snap.id);
      assert.strictEqual(result.snapshot.project_context_key, contextKey);
    }
    const allSnaps = await sendCommand('memory-snapshots', { project_context_key: contextKey, limit: 10 });
    assert.strictEqual(allSnaps.ok, true);
    assert.strictEqual(allSnaps.snapshots.length, 5);
    assert.strictEqual(allSnaps.snapshots[0].snapshot_version, 5);
  });

  it('high-relevance innovation artifacts survive amid many low-relevance artifacts', async () => {
    const contextKey = 'ctx-cli-innovation';
    const keyArtifact = db.createInsightArtifact({
      project_context_key: contextKey,
      artifact_type: 'code_pattern',
      artifact_payload: { pattern: 'important-reusable-pattern', reuse_count: 10 },
      relevance_score: 990,
      validation_status: 'validated',
    });
    for (let i = 0; i < 20; i++) {
      db.createInsightArtifact({
        project_context_key: contextKey,
        artifact_payload: { noise: i },
        relevance_score: 5,
      });
    }
    const byId = await sendCommand('memory-insight', { id: keyArtifact.id });
    assert.strictEqual(byId.ok, true);
    assert.strictEqual(byId.artifact.id, keyArtifact.id);
    assert.strictEqual(byId.artifact.validation_status, 'validated');

    const highRel = await sendCommand('memory-insights', {
      project_context_key: contextKey,
      min_relevance_score: 900,
    });
    assert.strictEqual(highRel.ok, true);
    assert.ok(highRel.artifacts.some(a => a.id === keyArtifact.id));
    assert.ok(highRel.artifacts.every(a => a.relevance_score >= 900));
  });
});

describe('research-queue COMMAND_SCHEMAS validation', () => {
  it('queue-research rejects missing topic', async () => {
    const res = await sendCommand('queue-research', { question: 'What is X?' });
    assert.strictEqual(res.error, 'Missing required field "topic" for command "queue-research"');
  });

  it('queue-research rejects missing question', async () => {
    const res = await sendCommand('queue-research', { topic: 'X' });
    assert.strictEqual(res.error, 'Missing required field "question" for command "queue-research"');
  });

  it('queue-research rejects wrong type for mode', async () => {
    const res = await sendCommand('queue-research', { topic: 'X', question: 'Q?', mode: 42 });
    assert.strictEqual(res.error, 'Field "mode" must be of type string');
  });

  it('queue-research rejects wrong type for source_task_id', async () => {
    const res = await sendCommand('queue-research', { topic: 'X', question: 'Q?', source_task_id: 'not-a-number' });
    assert.strictEqual(res.error, 'Field "source_task_id" must be of type number');
  });

  it('research-status rejects wrong type for limit', async () => {
    const res = await sendCommand('research-status', { limit: 'fifty' });
    assert.strictEqual(res.error, 'Field "limit" must be of type number');
  });

  it('research-requeue-stale rejects wrong type for max_age_minutes', async () => {
    const res = await sendCommand('research-requeue-stale', { max_age_minutes: '120' });
    assert.strictEqual(res.error, 'Field "max_age_minutes" must be of type number');
  });

  it('research-start rejects missing id', async () => {
    const res = await sendCommand('research-start', {});
    assert.strictEqual(res.error, 'Missing required field "id" for command "research-start"');
  });

  it('research-start rejects wrong type for id', async () => {
    const res = await sendCommand('research-start', { id: 'abc' });
    assert.strictEqual(res.error, 'Field "id" must be of type number');
  });

  it('runs research queue status, next, gaps, fail, and retry lifecycle', async () => {
    const queued = await sendCommand('queue-research', {
      topic: 'routing',
      question: 'How should routing be tested?',
      priority: 'urgent',
    });
    assert.strictEqual(queued.ok, true);

    const status = await sendCommand('research-status', { topic: 'routing' });
    assert.strictEqual(status.ok, true);
    assert.strictEqual(status.count, 1);
    assert.strictEqual(status.items[0].topic, 'routing');

    const next = await sendCommand('research-next', {});
    assert.strictEqual(next.ok, true);
    assert.strictEqual(next.item.id, queued.id);

    const gaps = await sendCommand('research-gaps', {});
    assert.strictEqual(gaps.ok, true);
    assert.strictEqual(gaps.queued_count, 1);
    assert.deepStrictEqual(gaps.topics, ['routing']);

    const started = await sendCommand('research-start', { id: queued.id });
    assert.strictEqual(started.ok, true);
    const failed = await sendCommand('research-fail', { intent_id: queued.id, error: 'network unavailable' });
    assert.strictEqual(failed.ok, true);

    const retry = await sendCommand('research-retry-failed', { topic: 'routing' });
    assert.strictEqual(retry.ok, true);
    assert.strictEqual(retry.requeued_count, 1);
    assert.deepStrictEqual(retry.ids, [queued.id]);
  });

  it('requeues stale running research', async () => {
    const queued = await sendCommand('queue-research', {
      topic: 'stale-research',
      question: 'What timed out?',
    });
    assert.strictEqual(queued.ok, true);
    const started = await sendCommand('research-start', { id: queued.id });
    assert.strictEqual(started.ok, true);
    db.getDb().prepare("UPDATE research_intents SET updated_at = datetime('now', '-90 minutes') WHERE id = ?")
      .run(queued.id);

    const requeued = await sendCommand('research-requeue-stale', { max_age_minutes: 60 });
    assert.strictEqual(requeued.ok, true);
    assert.strictEqual(requeued.requeued_count, 1);
    assert.deepStrictEqual(requeued.ids, [queued.id]);

    const status = await sendCommand('research-status', { topic: 'stale-research', status: 'queued' });
    assert.strictEqual(status.count, 1);
  });

  it('research-complete resets staleness for the completed topic', async () => {
    knowledgeMeta.writeMetadata(tmpDir, {
      domains: {
        status: {
          changes_since_research: 4,
          worker_patches: 0,
          last_changed: '2026-01-02T00:00:00.000Z',
        },
      },
    });

    const queued = await sendCommand('queue-research', {
      topic: 'status',
      question: 'What is the status domain architecture?',
    });
    assert.strictEqual(queued.ok, true);

    const started = await sendCommand('research-start', { id: queued.id });
    assert.strictEqual(started.ok, true);

    const completed = await sendCommand('research-complete', { intent_id: queued.id });
    assert.strictEqual(completed.ok, true);

    const meta = knowledgeMeta.getMetadata(tmpDir);
    assert.strictEqual(meta.domains.status.changes_since_research, 0);
    assert.ok(meta.domains.status.last_researched);
  });
});
