'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const tmux = require('../src/tmux');
const { THRESHOLDS, LOOP_STALE_HEARTBEAT_SEC, tick, stop: watchdogStop } = require('../src/watchdog');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-wd-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  // Clear watchdog module-level state (lastEscalationLevel, etc.) between tests
  watchdogStop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Watchdog thresholds', () => {
  it('should have correct escalation order', () => {
    assert.ok(THRESHOLDS.warn < THRESHOLDS.nudge);
    assert.ok(THRESHOLDS.nudge < THRESHOLDS.triage);
    assert.ok(THRESHOLDS.triage < THRESHOLDS.terminate);
  });

  it('should have default values', () => {
    assert.strictEqual(THRESHOLDS.warn, 60);
    assert.strictEqual(THRESHOLDS.nudge, 90);
    assert.strictEqual(THRESHOLDS.triage, 120);
    assert.strictEqual(THRESHOLDS.terminate, 180);
  });
});

describe('Orphan task recovery', () => {
  it('should detect orphaned tasks', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Orphaned task',
      description: 'This task was assigned but worker reset',
    });

    // Simulate: task assigned to worker, but worker is now idle
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    // Worker reset to idle without clearing task
    db.updateWorker(1, { status: 'idle', current_task_id: null });

    // Check for orphans
    const orphans = db.getDb().prepare(`
      SELECT t.* FROM tasks t
      JOIN workers w ON t.assigned_to = w.id
      WHERE t.status IN ('assigned', 'in_progress')
        AND w.status = 'idle'
        AND w.current_task_id IS NULL
    `).all();

    assert.strictEqual(orphans.length, 1);
    assert.strictEqual(orphans[0].id, taskId);
  });

  it('should not flag active assignments as orphans', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Test');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Active task',
      description: 'Worker is busy',
    });

    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, { status: 'busy', current_task_id: taskId });

    const orphans = db.getDb().prepare(`
      SELECT t.* FROM tasks t
      JOIN workers w ON t.assigned_to = w.id
      WHERE t.status IN ('assigned', 'in_progress')
        AND w.status = 'idle'
        AND w.current_task_id IS NULL
    `).all();

    assert.strictEqual(orphans.length, 0);
  });

  it('should recover orphaned assignments during watchdog ticks', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Recover orphan');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Orphaned task',
      description: 'Recover this assignment',
    });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'idle', current_task_id: null });

    tick(tmpDir);

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'ready');
    assert.strictEqual(task.assigned_to, null);
    assert.strictEqual(task.liveness_reassign_count, 1);
    assert.strictEqual(task.liveness_last_reassign_reason, 'worker_idle_orphan');
  });
});

describe('Heartbeat staleness', () => {
  it('should detect stale heartbeats', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    // Set heartbeat to 2 minutes ago
    const staleTime = new Date(Date.now() - 120 * 1000).toISOString();
    db.updateWorker(1, {
      status: 'busy',
      last_heartbeat: staleTime,
      launched_at: new Date(Date.now() - 300 * 1000).toISOString(),
    });

    const worker = db.getWorker(1);
    const staleSec = (Date.now() - new Date(worker.last_heartbeat).getTime()) / 1000;
    assert.ok(staleSec >= THRESHOLDS.triage);
  });

  it('should respect launch grace period', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    // Just launched 10 seconds ago
    const recentTime = new Date(Date.now() - 10 * 1000).toISOString();
    db.updateWorker(1, {
      status: 'assigned',
      launched_at: recentTime,
    });

    const worker = db.getWorker(1);
    const launchedAgo = (Date.now() - new Date(worker.launched_at).getTime()) / 1000;
    assert.ok(launchedAgo < THRESHOLDS.warn); // Should be skipped by watchdog
  });

  it('recovers stale assigned workers using liveness heartbeat age', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Recover stale assigned worker');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Stale assignment',
      description: 'Assignment should recover after stale heartbeat',
    });
    const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      launched_at: staleTime,
      last_heartbeat: staleTime,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    tmux.isPaneAlive = (windowName) => windowName === 'worker-1';
    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
    }

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'ready');
    assert.strictEqual(task.assigned_to, null);
    assert.strictEqual(task.liveness_reassign_count, 1);
    assert.strictEqual(task.liveness_last_reassign_reason, 'worker_liveness_stale');

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);

    const recoveryLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'task_liveness_recovered')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.task_id === taskId && entry.source === 'watchdog_tick');
    assert.ok(recoveryLog);
    assert.strictEqual(recoveryLog.reason, 'worker_liveness_stale');
    assert.ok(recoveryLog.stale_sec >= THRESHOLDS.terminate);
  });
});

describe('Bounded assignment recovery', () => {
  it('fails stale assignments once reassignment retries are exhausted', () => {
    db.setConfig('watchdog_task_reassign_limit', '1');
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Retry exhausted assignment');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Stuck assignment',
      description: 'Should fail after bounded liveness retries',
    });
    db.updateTask(taskId, {
      status: 'assigned',
      assigned_to: 1,
      liveness_reassign_count: 1,
    });
    db.updateWorker(1, { status: 'idle', current_task_id: null });

    tick(tmpDir);

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'failed');
    assert.strictEqual(task.assigned_to, null);
    assert.match(String(task.result || ''), /Liveness recovery exhausted/i);

    const exhaustedLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'task_liveness_retry_exhausted')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.task_id === taskId);
    assert.ok(exhaustedLog);
    assert.strictEqual(exhaustedLog.max_reassignments, 1);
    assert.strictEqual(exhaustedLog.outcome, 'failed_retry_exhausted');
  });

  it('fails task at reassignment cap when worker pane dies (handleDeath path)', () => {
    db.setConfig('watchdog_task_reassign_limit', '1');
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Cap fires on worker death');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Cap at death task',
      description: 'Should fail via handleDeath when reassignment cap is reached',
    });
    db.updateTask(taskId, {
      status: 'in_progress',
      assigned_to: 1,
      liveness_reassign_count: 1,
    });
    db.updateWorker(1, {
      status: 'running',
      current_task_id: taskId,
      launched_at: new Date(Date.now() - 300 * 1000).toISOString(),
      last_heartbeat: new Date(Date.now() - 10 * 1000).toISOString(),
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    const originalIsPaneAlive = tmux.isPaneAlive;
    tmux.isTmuxAvailable = () => true;
    tmux.isPaneAlive = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
      tmux.isPaneAlive = originalIsPaneAlive;
    }

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'failed');
    assert.match(String(task.result || ''), /Liveness recovery exhausted/i);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);

    const exhaustedLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'task_liveness_retry_exhausted')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.task_id === taskId);
    assert.ok(exhaustedLog, 'task_liveness_retry_exhausted log entry must exist');
    assert.strictEqual(exhaustedLog.outcome, 'failed_retry_exhausted');
  });

  it('fails task when liveness_reassign_count reaches the configured cap (count-based cap, not status guard)', () => {
    // Explicitly set cap to 3 — verifies count-based cap enforcement, not status-based guards
    db.setConfig('watchdog_task_reassign_limit', '3');
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Max reassignments cap test');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Cap at 3 task',
      description: 'Should fail when liveness_reassign_count reaches the configured cap of 3',
    });
    // Pre-set count to 3 — exactly at the cap — so next recovery attempt must fail, not reassign
    db.updateTask(taskId, {
      status: 'assigned',
      assigned_to: 1,
      liveness_reassign_count: 3,
    });
    // Worker is idle (orphan state) so recovery picks up this task
    db.updateWorker(1, { status: 'idle', current_task_id: null });

    tick(tmpDir);

    const task = db.getTask(taskId);
    // Must transition to failed — not ready — because count >= cap
    assert.strictEqual(task.status, 'failed');
    assert.strictEqual(task.assigned_to, null);
    assert.match(String(task.result || ''), /Liveness recovery exhausted/i);

    const exhaustedLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'task_liveness_retry_exhausted')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.task_id === taskId);
    assert.ok(exhaustedLog, 'task_liveness_retry_exhausted log entry must exist');
    // Confirm the log reflects the configured cap of 3, proving count-based enforcement
    assert.strictEqual(exhaustedLog.max_reassignments, 3);
    assert.strictEqual(exhaustedLog.outcome, 'failed_retry_exhausted');
    assert.strictEqual(exhaustedLog.reassignment_count, 3);
  });
});

describe('Claim atomicity', () => {
  it('claimWorker sets claimed_at atomically with claimed_by', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const before = Date.now();
    const claimed = db.claimWorker(1, 'architect');
    const after = Date.now();

    assert.strictEqual(claimed, true);
    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, 'architect');
    assert.ok(worker.claimed_at, 'claimed_at must be set');
    const claimedAtMs = new Date(worker.claimed_at).getTime();
    assert.ok(claimedAtMs >= before && claimedAtMs <= after, 'claimed_at must be within claim window');
  });

  it('releaseWorker clears both claimed_by and claimed_at', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.claimWorker(1, 'architect');

    db.releaseWorker(1);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, null);
    assert.strictEqual(worker.claimed_at, null);
  });

  it('claimWorker is idempotent — second claim by different claimer fails and does not overwrite claimed_at', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    db.claimWorker(1, 'architect');
    const workerAfterFirst = db.getWorker(1);

    const secondClaim = db.claimWorker(1, 'allocator');
    assert.strictEqual(secondClaim, false);

    const workerAfterSecond = db.getWorker(1);
    assert.strictEqual(workerAfterSecond.claimed_by, 'architect');
    assert.strictEqual(workerAfterSecond.claimed_at, workerAfterFirst.claimed_at);
  });
});

describe('Stale claim release', () => {
  it('releases stale claims using claimed_at age instead of heartbeat age', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.updateWorker(1, {
      status: 'idle',
      current_task_id: null,
      claimed_by: 'architect',
      claimed_at: new Date(Date.now() - 121 * 1000).toISOString(),
      last_heartbeat: new Date().toISOString(),
    });

    tick(tmpDir);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, null);
    assert.strictEqual(worker.claimed_at, null);

    const releaseLog = db.getLog(50, 'coordinator')
      .filter((entry) => entry.action === 'stale_claim_released')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1);
    assert.ok(releaseLog);
    assert.ok(releaseLog.stale_sec > 120);
  });

  it('does not release claims from stale heartbeat when claimed_at is fresh', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.updateWorker(1, {
      status: 'idle',
      current_task_id: null,
      claimed_by: 'architect',
      claimed_at: new Date(Date.now() - 30 * 1000).toISOString(),
      last_heartbeat: new Date(Date.now() - 3600 * 1000).toISOString(),
    });

    tick(tmpDir);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, 'architect');
    assert.ok(worker.claimed_at);
  });

  it('releases wedged claims with missing claimed_at and logs diagnostic reason', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    db.updateWorker(1, {
      status: 'idle',
      current_task_id: null,
      claimed_by: 'architect',
      claimed_at: null,
      last_heartbeat: new Date().toISOString(),
    });

    tick(tmpDir);

    const worker = db.getWorker(1);
    assert.strictEqual(worker.claimed_by, null);
    assert.strictEqual(worker.claimed_at, null);

    const releaseLog = db.getLog(50, 'coordinator')
      .filter((entry) => entry.action === 'stale_claim_released')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1);
    assert.ok(releaseLog);
    assert.strictEqual(releaseLog.reason, 'missing_claimed_at');
  });
});

describe('Loop heartbeat recovery', () => {
  it('does not emit stale telemetry for healthy loops with long backoff cadence', () => {
    const loopId = db.createLoop('Healthy loop long backoff');
    const healthyHeartbeat = new Date(
      Date.now() - Math.max(1, LOOP_STALE_HEARTBEAT_SEC - 30) * 1000
    ).toISOString();
    db.updateLoop(loopId, {
      tmux_window: 'loop-healthy',
      tmux_session: 'test-session',
      last_heartbeat: healthyHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const killCalls = [];
    const createCalls = [];

    tmux.isPaneAlive = (windowName) => windowName === 'loop-healthy';
    tmux.killWindow = (windowName) => killCalls.push(windowName);
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
    }

    assert.deepStrictEqual(killCalls, []);
    assert.deepStrictEqual(createCalls, []);

    const staleLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_heartbeat_stale')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.strictEqual(staleLog, undefined);
  });

  it('restarts stale loops when tmux pane is still alive', () => {
    const loopId = db.createLoop('Recover stale loop');
    const staleHeartbeat = new Date(Date.now() - (LOOP_STALE_HEARTBEAT_SEC + 60) * 1000).toISOString();
    db.updateLoop(loopId, {
      tmux_window: 'loop-1',
      tmux_session: 'test-session',
      last_heartbeat: staleHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const killCalls = [];
    const createCalls = [];

    tmux.isPaneAlive = (windowName) => windowName === 'loop-1';
    tmux.killWindow = (windowName) => killCalls.push(windowName);
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
    }

    assert.deepStrictEqual(killCalls, ['loop-1']);
    assert.strictEqual(createCalls.length, 1);
    assert.strictEqual(createCalls[0].windowName, 'loop-1');
    assert.strictEqual(createCalls[0].cwd, tmpDir);
    assert.match(createCalls[0].command, new RegExp(`\\s${loopId}\\s`));

    const updatedLoop = db.getLoop(loopId);
    assert.ok(updatedLoop.last_heartbeat);
    assert.ok(Date.parse(updatedLoop.last_heartbeat) > Date.parse(staleHeartbeat));

    const staleLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_heartbeat_stale')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.ok(staleLog);
    assert.ok(staleLog.stale_sec > LOOP_STALE_HEARTBEAT_SEC);
    assert.strictEqual(staleLog.threshold_sec, LOOP_STALE_HEARTBEAT_SEC);

    const respawnLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_sentinel_respawned')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.ok(respawnLog);
    assert.strictEqual(respawnLog.reason, 'stale_heartbeat');
    assert.strictEqual(respawnLog.forced_restart, true);
  });

  it('does not emit stale events for loops actively heartbeating during long exec runs', () => {
    // Regression test: background heartbeat ticker keeps last_heartbeat fresh during a long
    // codex/agent exec. Watchdog must NOT fire loop_heartbeat_stale while heartbeats arrive.
    const loopId = db.createLoop('Long-running loop with active background ticker');
    // Heartbeat was updated 15s ago — simulating the 30s background ticker just fired.
    const recentHeartbeat = new Date(Date.now() - 15 * 1000).toISOString();
    db.updateLoop(loopId, {
      tmux_window: 'loop-exec-hb',
      tmux_session: 'test-session',
      last_heartbeat: recentHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const killCalls = [];
    const createCalls = [];

    tmux.isPaneAlive = (windowName) => windowName === 'loop-exec-hb';
    tmux.killWindow = (windowName) => killCalls.push(windowName);
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
    }

    assert.deepStrictEqual(killCalls, [], 'No kill calls for actively heartbeating loop');
    assert.deepStrictEqual(createCalls, [], 'No respawn for actively heartbeating loop');

    const staleLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_heartbeat_stale')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.strictEqual(staleLog, undefined, 'No stale heartbeat event emitted while ticker is active');
  });

  it('keeps pane-death recovery to a single respawn action', () => {
    const loopId = db.createLoop('Recover dead loop pane');
    const staleHeartbeat = new Date(Date.now() - 301 * 1000).toISOString();
    db.updateLoop(loopId, {
      tmux_window: 'loop-2',
      tmux_session: 'test-session',
      last_heartbeat: staleHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const killCalls = [];
    const createCalls = [];

    tmux.isPaneAlive = (windowName) => windowName !== 'loop-2';
    tmux.killWindow = (windowName) => killCalls.push(windowName);
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
    }

    assert.strictEqual(createCalls.length, 1);
    assert.strictEqual(createCalls[0].windowName, 'loop-2');
    assert.deepStrictEqual(killCalls, []);

    const deadLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_sentinel_dead')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.ok(deadLog);

    const staleLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_heartbeat_stale')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.strictEqual(staleLog, undefined);
  });

  it('detects stale heartbeat and triggers recovery for active non-tmux loop (tmux_window=null)', () => {
    const loopId = db.createLoop('Non-tmux stale loop');
    const staleHeartbeat = new Date(Date.now() - (LOOP_STALE_HEARTBEAT_SEC + 60) * 1000).toISOString();
    db.updateLoop(loopId, {
      last_heartbeat: staleHeartbeat,
      // tmux_window intentionally left null (non-tmux environment)
    });

    const childProcess = require('child_process');
    const originalExecFile = childProcess.execFile;
    const execFileCalls = [];
    childProcess.execFile = (cmd, args, opts, callback) => {
      execFileCalls.push({ cmd, args, opts });
      if (callback) callback(null);
      return { unref: () => {} };
    };

    try {
      tick(tmpDir);
    } finally {
      childProcess.execFile = originalExecFile;
    }

    // Should have called execFile to relaunch the sentinel
    assert.strictEqual(execFileCalls.length, 1);
    assert.strictEqual(execFileCalls[0].cmd, 'bash');
    assert.ok(execFileCalls[0].args.includes(String(loopId)), 'Loop ID should be passed to execFile');

    // Loop's heartbeat should be refreshed
    const updatedLoop = db.getLoop(loopId);
    assert.ok(updatedLoop.last_heartbeat);
    assert.ok(Date.parse(updatedLoop.last_heartbeat) > Date.parse(staleHeartbeat));

    // Should emit loop_heartbeat_stale
    const staleLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_heartbeat_stale')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.ok(staleLog, 'Should emit loop_heartbeat_stale for non-tmux loop');
    assert.ok(staleLog.stale_sec > LOOP_STALE_HEARTBEAT_SEC);

    // Should emit loop_sentinel_respawned
    const respawnLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'loop_sentinel_respawned')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.loop_id === loopId);
    assert.ok(respawnLog, 'Should emit loop_sentinel_respawned for non-tmux loop');
    assert.strictEqual(respawnLog.reason, 'stale_heartbeat');
    assert.strictEqual(respawnLog.forced_restart, false);
  });
});

describe('Loop respawn namespace preservation', () => {
  it('includes loop.namespace in the respawn command when namespace is stored on loop record', () => {
    const loopId = db.createLoop('Namespace respawn test');
    const staleHeartbeat = new Date(Date.now() - (LOOP_STALE_HEARTBEAT_SEC + 60) * 1000).toISOString();
    db.updateLoop(loopId, {
      namespace: 'myproject',
      tmux_window: 'loop-ns-1',
      tmux_session: 'test-session',
      last_heartbeat: staleHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const createCalls = [];

    tmux.isPaneAlive = (windowName) => windowName === 'loop-ns-1';
    tmux.killWindow = () => {};
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
    }

    assert.strictEqual(createCalls.length, 1);
    assert.match(createCalls[0].command, /MAC10_NAMESPACE="myproject"/);
    assert.match(createCalls[0].command, new RegExp(`\\s${loopId}\\s`));
  });

  it('falls back to process.env.MAC10_NAMESPACE when loop.namespace is null', () => {
    const loopId = db.createLoop('Namespace fallback test');
    const staleHeartbeat = new Date(Date.now() - (LOOP_STALE_HEARTBEAT_SEC + 60) * 1000).toISOString();
    db.updateLoop(loopId, {
      tmux_window: 'loop-ns-2',
      tmux_session: 'test-session',
      last_heartbeat: staleHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const createCalls = [];

    const prevEnv = process.env.MAC10_NAMESPACE;
    process.env.MAC10_NAMESPACE = 'env-namespace';

    tmux.isPaneAlive = (windowName) => windowName === 'loop-ns-2';
    tmux.killWindow = () => {};
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
      if (prevEnv === undefined) {
        delete process.env.MAC10_NAMESPACE;
      } else {
        process.env.MAC10_NAMESPACE = prevEnv;
      }
    }

    assert.strictEqual(createCalls.length, 1);
    assert.match(createCalls[0].command, /MAC10_NAMESPACE="env-namespace"/);
  });

  it('falls back to mac10 default when loop.namespace is null and env is unset', () => {
    const loopId = db.createLoop('Namespace default fallback test');
    const staleHeartbeat = new Date(Date.now() - (LOOP_STALE_HEARTBEAT_SEC + 60) * 1000).toISOString();
    db.updateLoop(loopId, {
      tmux_window: 'loop-ns-3',
      tmux_session: 'test-session',
      last_heartbeat: staleHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const createCalls = [];

    const prevEnv = process.env.MAC10_NAMESPACE;
    delete process.env.MAC10_NAMESPACE;

    tmux.isPaneAlive = (windowName) => windowName === 'loop-ns-3';
    tmux.killWindow = () => {};
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
      if (prevEnv !== undefined) {
        process.env.MAC10_NAMESPACE = prevEnv;
      }
    }

    assert.strictEqual(createCalls.length, 1);
    assert.match(createCalls[0].command, /MAC10_NAMESPACE="mac10"/);
  });

  it('includes namespace in pane-death respawn command', () => {
    const loopId = db.createLoop('Namespace pane-death respawn test');
    const staleHeartbeat = new Date(Date.now() - 301 * 1000).toISOString();
    db.updateLoop(loopId, {
      namespace: 'prod-ns',
      tmux_window: 'loop-ns-4',
      tmux_session: 'test-session',
      last_heartbeat: staleHeartbeat,
    });

    const originalIsPaneAlive = tmux.isPaneAlive;
    const originalKillWindow = tmux.killWindow;
    const originalCreateWindow = tmux.createWindow;
    const createCalls = [];

    tmux.isPaneAlive = (windowName) => windowName !== 'loop-ns-4';
    tmux.killWindow = () => {};
    tmux.createWindow = (windowName, command, cwd) => createCalls.push({ windowName, command, cwd });

    try {
      tick(tmpDir);
    } finally {
      tmux.isPaneAlive = originalIsPaneAlive;
      tmux.killWindow = originalKillWindow;
      tmux.createWindow = originalCreateWindow;
    }

    assert.strictEqual(createCalls.length, 1);
    assert.match(createCalls[0].command, /MAC10_NAMESPACE="prod-ns"/);
  });
});

describe('Stale decomposed request recovery', () => {
  it('recovers stale decomposed tier-3 requests with zero tasks', () => {
    const requestId = db.createRequest('Tier-3 decomposition stalled before task creation');
    db.updateRequest(requestId, { status: 'decomposed', tier: 3 });
    db.getDb().prepare(
      "UPDATE requests SET updated_at = datetime('now', '-3 minutes') WHERE id = ?"
    ).run(requestId);

    tick(tmpDir);

    const request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'pending');

    const recoveryLog = db.getLog(50, 'coordinator')
      .filter((entry) => entry.action === 'stale_decomposed_request_recovered')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.request_id === requestId);
    assert.ok(recoveryLog);
    assert.strictEqual(recoveryLog.source, 'watchdog_tick');
    assert.ok(recoveryLog.stale_sec >= THRESHOLDS.triage);
  });

  it('does not alter decomposed requests that already have tasks', () => {
    const requestId = db.createRequest('Tier-3 request with active decomposition tasks');
    db.updateRequest(requestId, { status: 'decomposed', tier: 3 });
    db.getDb().prepare(
      "UPDATE requests SET updated_at = datetime('now', '-3 minutes') WHERE id = ?"
    ).run(requestId);
    db.createTask({
      request_id: requestId,
      subject: 'Task already exists',
      description: 'Decomposition has already started',
      domain: 'coordinator-routing',
    });

    tick(tmpDir);

    const request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'decomposed');

    const recoveryLog = db.getLog(50, 'coordinator')
      .filter((entry) => entry.action === 'stale_decomposed_request_recovered')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.request_id === requestId);
    assert.strictEqual(recoveryLog, undefined);
  });
});

describe('Non-tmux worker liveness', () => {
  it('does not reset freshly assigned worker when tmux is unavailable', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Non-tmux fresh assign');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Fresh assignment',
      description: 'Just assigned — must not be reset without tmux',
    });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      launched_at: new Date().toISOString(),
      last_heartbeat: new Date().toISOString(),
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    tmux.isTmuxAvailable = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
    }

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'assigned');
    assert.strictEqual(worker.current_task_id, taskId);
  });

  it('does not reset running worker with recent heartbeat when tmux is unavailable', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Non-tmux running worker');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Running task',
      description: 'Active worker with fresh heartbeat — must not be reset',
    });
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'running',
      current_task_id: taskId,
      launched_at: new Date(Date.now() - 120 * 1000).toISOString(),
      last_heartbeat: new Date(Date.now() - 10 * 1000).toISOString(),
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    tmux.isTmuxAvailable = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
    }

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'running');
    assert.strictEqual(worker.current_task_id, taskId);
  });

  it('recovers stale non-tmux worker via heartbeat-based paths', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Stale non-tmux worker');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Stale assignment',
      description: 'Worker with stale heartbeat should be recovered via liveness staleness',
    });
    const staleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      launched_at: staleTime,
      last_heartbeat: staleTime,
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    tmux.isTmuxAvailable = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
    }

    const task = db.getTask(taskId);
    assert.strictEqual(task.status, 'ready');
    assert.strictEqual(task.assigned_to, null);
    assert.strictEqual(task.liveness_reassign_count, 1);
    assert.strictEqual(task.liveness_last_reassign_reason, 'worker_liveness_stale');

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);
  });

  it('preserves pane-death behavior when tmux is available', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Tmux pane death');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Dead pane task',
      description: 'Worker pane died — handleDeath must fire',
    });
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'running',
      current_task_id: taskId,
      launched_at: new Date(Date.now() - 120 * 1000).toISOString(),
      last_heartbeat: new Date(Date.now() - 10 * 1000).toISOString(),
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    const originalIsPaneAlive = tmux.isPaneAlive;
    tmux.isTmuxAvailable = () => true;
    tmux.isPaneAlive = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
      tmux.isPaneAlive = originalIsPaneAlive;
    }

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'idle');
    assert.strictEqual(worker.current_task_id, null);

    const deathLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'worker_death')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1 && entry.reason === 'tmux_pane_dead');
    assert.ok(deathLog);
  });
});

describe('Stale integration completion gating', () => {
  it('does not complete request when all merges are merged but a sibling task is still assigned', () => {
    const requestId = db.createRequest('Gated integration — sibling in progress');
    db.updateRequest(requestId, { status: 'integrating' });

    const mergeTaskId = db.createTask({
      request_id: requestId,
      subject: 'Merge task',
      description: 'PR submitted and merged',
      domain: 'coordinator-routing',
      tier: 2,
    });
    db.updateTask(mergeTaskId, { status: 'completed' });

    const siblingTaskId = db.createTask({
      request_id: requestId,
      subject: 'Sibling task',
      description: 'Still running — should gate completion',
      domain: 'coordinator-routing',
      tier: 2,
    });
    db.updateTask(siblingTaskId, { status: 'assigned' });

    const enqueueResult = db.enqueueMerge({
      request_id: requestId,
      task_id: mergeTaskId,
      pr_url: 'https://example.com/pr/gated',
      branch: 'agent-3/gated-test',
      priority: 0,
    });
    db.updateMerge(enqueueResult.lastInsertRowid, {
      status: 'merged',
      merged_at: new Date().toISOString(),
    });

    tick(tmpDir);

    const request = db.getRequest(requestId);
    assert.ok(
      ['integrating', 'in_progress'].includes(request.status),
      `Expected integrating/in_progress but got: ${request.status}`
    );

    const completionMail = db.checkMail('master-1', false).filter(
      (mail) => mail.type === 'request_completed' && mail.payload.request_id === requestId
    );
    assert.strictEqual(completionMail.length, 0, 'Should not send request_completed mail while sibling task is non-terminal');

    const gatedLog = db.getLog(50, 'coordinator')
      .filter((entry) => entry.action === 'stale_integration_gated')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.request_id === requestId);
    assert.ok(gatedLog, 'Should log stale_integration_gated');
    assert.strictEqual(gatedLog.reason, 'non_terminal_tasks');
  });

  it('completes request only after the final sibling task reaches terminal success', () => {
    const requestId = db.createRequest('Gated integration — completes after sibling done');
    db.updateRequest(requestId, { status: 'integrating' });

    const mergeTaskId = db.createTask({
      request_id: requestId,
      subject: 'Merge task',
      description: 'PR submitted and merged',
      domain: 'coordinator-routing',
      tier: 2,
    });
    db.updateTask(mergeTaskId, { status: 'completed' });

    const siblingTaskId = db.createTask({
      request_id: requestId,
      subject: 'Sibling task',
      description: 'In progress — gates completion',
      domain: 'coordinator-routing',
      tier: 2,
    });
    db.updateTask(siblingTaskId, { status: 'in_progress' });

    const enqueueResult = db.enqueueMerge({
      request_id: requestId,
      task_id: mergeTaskId,
      pr_url: 'https://example.com/pr/gated-sibling',
      branch: 'agent-3/gated-sibling-test',
      priority: 0,
    });
    db.updateMerge(enqueueResult.lastInsertRowid, {
      status: 'merged',
      merged_at: new Date().toISOString(),
    });

    // First tick: sibling still in_progress → should not complete
    tick(tmpDir);
    let request = db.getRequest(requestId);
    assert.ok(
      ['integrating', 'in_progress'].includes(request.status),
      `Expected integrating/in_progress on first tick but got: ${request.status}`
    );

    // Sibling task completes
    db.updateTask(siblingTaskId, { status: 'completed' });

    // Second tick: all tasks terminal → should now complete
    tick(tmpDir);
    request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'completed');

    const completionMail = db.checkMail('master-1', false).filter(
      (mail) => mail.type === 'request_completed' && mail.payload.request_id === requestId
    );
    assert.ok(completionMail.length >= 1, 'Should send request_completed mail after all tasks done');
  });
});

describe('Stale assigned worker escalation', () => {
  it('escalates stale assigned worker with live pane through triage', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Stale assigned escalation');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Stale assigned task',
      description: 'Should escalate through warn/nudge/triage when heartbeat is stale',
    });
    // Heartbeat between triage (120s) and terminate (180s)
    const staleTime = new Date(Date.now() - 150 * 1000).toISOString();
    const launchedTime = new Date(Date.now() - 300 * 1000).toISOString();
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      launched_at: launchedTime,
      last_heartbeat: staleTime,
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    const originalIsPaneAlive = tmux.isPaneAlive;
    tmux.isTmuxAvailable = () => true;
    tmux.isPaneAlive = (windowName) => windowName === 'worker-1'; // pane alive
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
      tmux.isPaneAlive = originalIsPaneAlive;
    }

    // Worker should NOT be reset by the escalation path — only warn/nudge/triage fires
    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'assigned');
    assert.strictEqual(worker.current_task_id, taskId);

    // Triage-level escalation log should exist for this assigned worker
    const triageLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'watchdog_triage')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1);
    assert.ok(triageLog, 'assigned worker with stale heartbeat and live pane should reach triage escalation');
    assert.ok(triageLog.stale_sec >= THRESHOLDS.triage);
  });

  it('does not escalate freshly assigned workers within launch grace period', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Fresh assigned no-escalation');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Fresh assignment',
      description: 'Just assigned — must not be escalated',
    });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      launched_at: new Date(Date.now() - 10 * 1000).toISOString(),
      last_heartbeat: new Date(Date.now() - 10 * 1000).toISOString(),
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    tmux.isTmuxAvailable = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
    }

    const escalationLog = db.getLog(100, 'coordinator')
      .filter((entry) => ['watchdog_warn', 'watchdog_nudge', 'watchdog_triage', 'watchdog_terminate'].includes(entry.action))
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1);
    assert.strictEqual(escalationLog, undefined, 'freshly assigned worker must not be escalated');

    const worker = db.getWorker(1);
    assert.strictEqual(worker.status, 'assigned');
    assert.strictEqual(worker.current_task_id, taskId);
  });

  it('uses launched_at as staleness fallback when last_heartbeat is absent', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Assigned worker no heartbeat');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Assigned no heartbeat',
      description: 'Should use launched_at for staleness when last_heartbeat is absent',
    });
    // No last_heartbeat — launched_at used as fallback; between nudge (90s) and triage (120s)
    const launchTime = new Date(Date.now() - 95 * 1000).toISOString();
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'assigned',
      current_task_id: taskId,
      launched_at: launchTime,
      last_heartbeat: null,
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    tmux.isTmuxAvailable = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
    }

    // Nudge-level escalation should fire based on launched_at fallback
    const nudgeLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'watchdog_nudge')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1);
    assert.ok(nudgeLog, 'assigned worker should escalate via launched_at when last_heartbeat is absent');
    assert.ok(nudgeLog.stale_sec >= THRESHOLDS.nudge);
  });

  it('running and busy workers escalate the same way as before the assigned change', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');
    const reqId = db.createRequest('Running worker escalation unchanged');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Running task',
      description: 'Running worker should still escalate via heartbeat',
    });
    const staleTime = new Date(Date.now() - 150 * 1000).toISOString();
    db.updateTask(taskId, { status: 'in_progress', assigned_to: 1 });
    db.updateWorker(1, {
      status: 'running',
      current_task_id: taskId,
      launched_at: new Date(Date.now() - 300 * 1000).toISOString(),
      last_heartbeat: staleTime,
    });

    const originalIsTmuxAvailable = tmux.isTmuxAvailable;
    tmux.isTmuxAvailable = () => false;
    try {
      tick(tmpDir);
    } finally {
      tmux.isTmuxAvailable = originalIsTmuxAvailable;
    }

    const triageLog = db.getLog(100, 'coordinator')
      .filter((entry) => entry.action === 'watchdog_triage')
      .map((entry) => JSON.parse(entry.details))
      .find((entry) => entry.worker_id === 1);
    assert.ok(triageLog, 'running worker should still get triage escalation (behavior unchanged)');
    assert.ok(triageLog.stale_sec >= THRESHOLDS.triage);
  });
});

describe('Stale integration recovery', () => {
  it('keeps failed merge requests recoverable while remediation is active or just queued', () => {
    const requestId = db.createRequest('Failed merge remediation');
    db.updateRequest(requestId, { status: 'integrating' });

    const originalTaskId = db.createTask({
      request_id: requestId,
      subject: 'Initial merge task',
      description: 'Original implementation task',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js'],
      tier: 2,
    });
    db.updateTask(originalTaskId, { status: 'completed' });

    const enqueueResult = db.enqueueMerge({
      request_id: requestId,
      task_id: originalTaskId,
      pr_url: 'https://example.com/pr/1',
      branch: 'agent-4/failed-merge',
      priority: 0,
    });
    db.updateMerge(enqueueResult.lastInsertRowid, { status: 'failed', error: 'remote rejected' });

    // Fresh merge failure: allocator grace window should keep request recoverable.
    tick(tmpDir);
    let request = db.getRequest(requestId);
    assert.ok(['integrating', 'in_progress'].includes(request.status));

    // Simulate stale failure, then allocator queues a remediation task shortly after.
    db.getDb().prepare("UPDATE merge_queue SET updated_at = datetime('now', '-11 minutes') WHERE id = ?").run(enqueueResult.lastInsertRowid);
    const remediationTaskId = db.createTask({
      request_id: requestId,
      subject: 'Fix failed merge',
      description: 'Allocator remediation task',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js'],
      tier: 2,
    });
    db.updateTask(remediationTaskId, { status: 'in_progress' });

    tick(tmpDir);
    request = db.getRequest(requestId);
    assert.ok(['integrating', 'in_progress'].includes(request.status));
    assert.notStrictEqual(request.status, 'failed');

    // Once remediation is terminal and merge still failed, watchdog can fail the request.
    db.updateTask(remediationTaskId, { status: 'completed' });
    tick(tmpDir);

    request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'failed');

    const failureMail = db.checkMail('master-1', false).filter(
      (mail) => mail.type === 'request_failed' && mail.payload.request_id === requestId
    );
    assert.ok(failureMail.length >= 1);
  });

  it('sends per-merge allocator notifications with rich context for terminal failed merges', () => {
    db.registerWorker(1, '/wt-1', 'agent-1');

    const requestId = db.createRequest('Terminal merge failure notifications');
    db.updateRequest(requestId, { status: 'integrating' });

    const failedTaskAlphaId = db.createTask({
      request_id: requestId,
      subject: 'Fix alpha merge',
      description: 'Alpha merge remediation',
      domain: 'coordinator-routing',
      files: ['coordinator/src/watchdog.js', 'coordinator/tests/watchdog.test.js'],
      tier: 2,
    });
    db.updateTask(failedTaskAlphaId, { status: 'completed', assigned_to: 1 });

    const mergedTaskId = db.createTask({
      request_id: requestId,
      subject: 'Already merged task',
      description: 'Successful path',
      domain: 'coordinator-routing',
      files: ['coordinator/src/merger.js'],
      tier: 2,
    });
    db.updateTask(mergedTaskId, { status: 'completed', assigned_to: 1 });

    const failedTaskBetaId = db.createTask({
      request_id: requestId,
      subject: 'Fix beta merge',
      description: 'Beta merge remediation',
      domain: 'coordinator-routing',
      files: ['coordinator/src/cli-server.js'],
      tier: 3,
    });
    db.updateTask(failedTaskBetaId, { status: 'completed', assigned_to: 1 });

    const failedMergeAlpha = db.enqueueMerge({
      request_id: requestId,
      task_id: failedTaskAlphaId,
      pr_url: 'https://example.com/pr/alpha',
      branch: 'agent-1/alpha-failed',
      priority: 0,
    });
    const mergedMerge = db.enqueueMerge({
      request_id: requestId,
      task_id: mergedTaskId,
      pr_url: 'https://example.com/pr/success',
      branch: 'agent-2/merged',
      priority: 0,
    });
    const failedMergeBeta = db.enqueueMerge({
      request_id: requestId,
      task_id: failedTaskBetaId,
      pr_url: 'https://example.com/pr/beta',
      branch: 'agent-3/beta-failed',
      priority: 0,
    });

    db.updateMerge(failedMergeAlpha.lastInsertRowid, { status: 'failed', error: 'alpha checks failed' });
    db.updateMerge(mergedMerge.lastInsertRowid, { status: 'merged', merged_at: new Date().toISOString() });
    db.updateMerge(failedMergeBeta.lastInsertRowid, { status: 'failed', error: 'beta branch protection blocked' });

    // Expire remediation grace so watchdog executes Case 4 terminal-failure handling.
    db.getDb().prepare(
      "UPDATE merge_queue SET updated_at = datetime('now', '-11 minutes') WHERE id IN (?, ?)"
    ).run(failedMergeAlpha.lastInsertRowid, failedMergeBeta.lastInsertRowid);

    tick(tmpDir);

    const request = db.getRequest(requestId);
    assert.strictEqual(request.status, 'failed');

    const allocatorFailureMails = db.checkMail('allocator', false).filter(
      (mail) => mail.type === 'merge_failed' && mail.payload.request_id === requestId
    );
    assert.strictEqual(allocatorFailureMails.length, 2);

    const payloadByMergeId = new Map(
      allocatorFailureMails.map((mail) => [mail.payload.merge_id, mail.payload])
    );

    const alphaPayload = payloadByMergeId.get(failedMergeAlpha.lastInsertRowid);
    assert.ok(alphaPayload);
    assert.strictEqual(alphaPayload.task_id, failedTaskAlphaId);
    assert.strictEqual(alphaPayload.branch, 'agent-1/alpha-failed');
    assert.strictEqual(alphaPayload.pr_url, 'https://example.com/pr/alpha');
    assert.strictEqual(alphaPayload.error, 'alpha checks failed');
    assert.deepStrictEqual(alphaPayload.original_task, {
      subject: 'Fix alpha merge',
      domain: 'coordinator-routing',
      files: '["coordinator/src/watchdog.js","coordinator/tests/watchdog.test.js"]',
      tier: 2,
      assigned_to: 1,
    });

    const betaPayload = payloadByMergeId.get(failedMergeBeta.lastInsertRowid);
    assert.ok(betaPayload);
    assert.strictEqual(betaPayload.task_id, failedTaskBetaId);
    assert.strictEqual(betaPayload.branch, 'agent-3/beta-failed');
    assert.strictEqual(betaPayload.pr_url, 'https://example.com/pr/beta');
    assert.strictEqual(betaPayload.error, 'beta branch protection blocked');
    assert.deepStrictEqual(betaPayload.original_task, {
      subject: 'Fix beta merge',
      domain: 'coordinator-routing',
      files: '["coordinator/src/cli-server.js"]',
      tier: 3,
      assigned_to: 1,
    });
  });
});

describe('functional_conflict merge recovery', () => {
  it('should not fail integrating request with functional_conflict merge when active fix task exists', () => {
    const reqId = db.createRequest('Feature with functional conflict');
    const mainTaskId = db.createTask({
      request_id: reqId,
      subject: 'Main task',
      description: 'Task that triggered functional conflict',
    });
    db.updateTask(mainTaskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    // Merge with functional_conflict status (after fix: status=conflict, not failed)
    const mergeRow = db.enqueueMerge({
      request_id: reqId,
      task_id: mainTaskId,
      pr_url: 'https://github.com/org/repo/pull/300',
      branch: 'agent-3',
    });
    db.updateMerge(mergeRow.lastInsertRowid, {
      status: 'conflict',
      error: 'functional_conflict: post-merge validation failed',
    });
    // Expire the conflict grace window so only the active-task guard can save us
    db.getDb().prepare(
      "UPDATE merge_queue SET updated_at = datetime('now', '-700 seconds') WHERE id = ?"
    ).run(mergeRow.lastInsertRowid);

    // Active fix task (non-terminal) — conflict-remediation in progress
    const fixTaskId = db.createTask({
      request_id: reqId,
      subject: 'Fix functional conflict',
      description: 'Resolve post-merge validation failure',
    });
    db.updateTask(fixTaskId, { status: 'ready' });

    // Disable tmux so the watchdog tick doesn't try to manage workers
    tmux.isTmuxAvailable = () => false;
    tmux.isPaneAlive = () => false;

    tick(tmpDir);

    const requestAfter = db.getRequest(reqId);
    assert.strictEqual(
      requestAfter.status,
      'integrating',
      'Request should remain integrating while active fix task exists for functional_conflict merge'
    );
  });

  it('should not fail integrating request when legacy failed merge has functional_conflict prefix and active fix task exists', () => {
    // Guard: failed merges with functional_conflict: prefix are treated as conflict-type
    // so active fix tasks prevent premature request failure (backward compat for legacy state)
    const reqId = db.createRequest('Feature with legacy functional conflict');
    const mainTaskId = db.createTask({
      request_id: reqId,
      subject: 'Main task',
      description: 'Legacy functional conflict task',
    });
    db.updateTask(mainTaskId, { status: 'completed' });
    db.updateRequest(reqId, { status: 'integrating' });

    const mergeRow = db.enqueueMerge({
      request_id: reqId,
      task_id: mainTaskId,
      pr_url: 'https://github.com/org/repo/pull/301',
      branch: 'agent-3',
    });
    // Legacy state: functional_conflict stored as 'failed' (before the status fix)
    db.updateMerge(mergeRow.lastInsertRowid, {
      status: 'failed',
      error: 'functional_conflict: build validation did not pass',
    });
    db.getDb().prepare(
      "UPDATE merge_queue SET updated_at = datetime('now', '-700 seconds') WHERE id = ?"
    ).run(mergeRow.lastInsertRowid);

    // Active fix task
    const fixTaskId = db.createTask({
      request_id: reqId,
      subject: 'Fix legacy conflict',
      description: 'Resolve legacy functional_conflict',
    });
    db.updateTask(fixTaskId, { status: 'ready' });

    tmux.isTmuxAvailable = () => false;
    tmux.isPaneAlive = () => false;

    tick(tmpDir);

    const requestAfter = db.getRequest(reqId);
    assert.strictEqual(
      requestAfter.status,
      'integrating',
      'Request should remain integrating when legacy functional_conflict failed merge has active fix task'
    );
  });
});
