'use strict';

const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { execFile, execFileSync, spawn } = require('child_process');

function createCliTestHarness({ db, cliServer, tmpPrefix = 'mac10-cli-' }) {
  let tmpDir = null;
  let server = null;
  let socketPath = null;
  let loopCreatedEvents = [];

  function requireTmpDir() {
    if (!tmpDir) throw new Error('CLI test harness has not been started');
    return tmpDir;
  }

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

  function buildHandlers(extraHandlers = {}) {
    return {
      onTaskCompleted: () => {},
      onLoopCreated: (loopId, prompt) => {
        loopCreatedEvents.push({ loopId, prompt });
      },
      ...extraHandlers,
    };
  }

  async function start(extraHandlers = {}) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tmpPrefix));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
    db.init(tmpDir);
    socketPath = cliServer.getSocketPath(tmpDir);
    loopCreatedEvents = [];
    server = cliServer.start(tmpDir, buildHandlers(extraHandlers));
    await waitForCliServerReady();
    return state();
  }

  function stop() {
    cliServer.stop();
    db.close();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    tmpDir = null;
    server = null;
    socketPath = null;
    loopCreatedEvents = [];
  }

  function state() {
    return {
      tmpDir,
      server,
      socketPath,
      loopCreatedEvents,
    };
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
      conn.setTimeout(5000, () => {
        conn.end();
        reject(new Error('Timeout'));
      });
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
        [path.join(__dirname, '..', '..', 'bin', 'mac10'), ...args],
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
    const cliPath = path.join(__dirname, '..', '..', 'bin', 'mac10');
    return new Promise((resolve) => {
      execFile(process.execPath, [cliPath, '--project', requireTmpDir(), ...args], { encoding: 'utf8' }, (error, stdout, stderr) => {
        resolve({
          status: error ? (Number.isInteger(error.code) ? error.code : 1) : 0,
          stdout,
          stderr,
        });
      });
    });
  }

  function runMac10CliWithStdin(args, stdinPayload) {
    const cliPath = path.join(__dirname, '..', '..', 'bin', 'mac10');
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [cliPath, '--project', requireTmpDir(), ...args], {
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

  function runGit(args, cwd = requireTmpDir()) {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  function initStatusGitRepo({ divergeFromOriginMain = false, makeDirty = false } = {}) {
    const projectDir = requireTmpDir();
    runGit(['init', '--initial-branch=main']);
    runGit(['config', 'user.email', 'status-tests@example.com']);
    runGit(['config', 'user.name', 'Status Tests']);

    fs.writeFileSync(path.join(projectDir, '.gitignore'), '.claude/\norigin.git/\n');
    const trackedFile = path.join(projectDir, 'status-telemetry.txt');
    fs.writeFileSync(trackedFile, 'baseline\n');
    runGit(['add', '.gitignore', 'status-telemetry.txt']);
    runGit(['commit', '-m', 'initial status telemetry commit']);

    const remotePath = path.join(projectDir, 'origin.git');
    runGit(['init', '--bare', remotePath]);
    runGit(['remote', 'add', 'origin', remotePath]);
    runGit(['push', '-u', 'origin', 'main']);

    if (divergeFromOriginMain) {
      fs.appendFileSync(trackedFile, 'local drift\n');
      runGit(['add', 'status-telemetry.txt']);
      runGit(['commit', '-m', 'local drift']);
    }

    if (makeDirty) {
      fs.writeFileSync(path.join(projectDir, 'dirty-status-file.txt'), 'dirty worktree\n');
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

  return {
    get tmpDir() { return tmpDir; },
    get server() { return server; },
    get socketPath() { return socketPath; },
    get loopCreatedEvents() { return loopCreatedEvents; },
    start,
    stop,
    state,
    waitForCliServerReady,
    sendCommand,
    listMailForRecipient,
    getConsumedByMarker,
    runMac10Command,
    runMac10Cli,
    runMac10CliWithStdin,
    parseCliJsonOutput,
    runGit,
    initStatusGitRepo,
    setConfigValue,
    createReadyTask,
    getAllocatorAssignmentDetails,
    getCoordinatorRequestQueuedEvents,
    getWorkerTaskStartedEvents,
    getCoordinatorOwnershipMismatchEvents,
    getWorkerResetEvents,
    getCoordinatorRemediationRecoveryEvents,
  };
}

module.exports = { createCliTestHarness };
