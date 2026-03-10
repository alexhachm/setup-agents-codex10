'use strict';

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const db = require('./db');
const cliServer = require('./cli-server');
const allocator = require('./allocator');
const watchdog = require('./watchdog');
const merger = require('./merger');
const webServer = require('./web-server');
const tmux = require('./tmux');
const overlay = require('./overlay');
const instanceRegistry = require('./instance-registry');

const projectDir = process.argv[2] || process.cwd();
const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
const namespace = process.env.MAC10_NAMESPACE || 'mac10';
const stateDir = path.join(projectDir, '.claude', 'state');
const pidFile = path.join(stateDir, namespace === 'mac10' ? 'mac10.pid' : `${namespace}.pid`);
let ownsPidLock = false;
const LOOP_LAUNCH_FAILED = 'loop_launch_failed';
const LOOP_LAUNCH_FAILED_MESSAGE = 'Failed to launch loop runtime';
const LOOP_LAUNCH_CONFIRMATION_MS = 750;

function normalizeErrorMessage(error, fallback = 'unknown_error') {
  if (error && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim().length > 0) return error.trim();
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}' && serialized !== 'null') return serialized;
  } catch {}
  return fallback;
}

function failClosedLoopLaunch(loopId, launchError, details = {}) {
  const launchErrorMessage = normalizeErrorMessage(launchError, 'unknown_launch_error');
  const failure = {
    ok: false,
    error: LOOP_LAUNCH_FAILED,
    message: LOOP_LAUNCH_FAILED_MESSAGE,
    loop_id: loopId,
    launch_error: launchErrorMessage,
    terminalized: false,
    terminalization_error: null,
  };
  try {
    db.updateLoop(loopId, {
      status: 'failed',
      stopped_at: new Date().toISOString(),
      last_checkpoint: `launch_failed:${launchErrorMessage}`,
      tmux_session: null,
      tmux_window: null,
      pid: null,
      last_heartbeat: new Date().toISOString(),
    });
    failure.terminalized = true;
  } catch (terminalizeErr) {
    failure.terminalization_error = normalizeErrorMessage(terminalizeErr, 'unknown_terminalization_error');
  }
  db.log('coordinator', 'loop_launch_failed', {
    loop_id: loopId,
    launch_error: launchErrorMessage,
    terminalized: failure.terminalized,
    terminalization_error: failure.terminalization_error,
    ...details,
  });
  return failure;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function terminatePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return { ok: false, reason: 'invalid_pid' };
  }

  if (!isPidAlive(pid)) {
    return { ok: true, method: 'pid_already_dead', pid };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    const code = error && error.code ? error.code : String(error);
    return { ok: false, reason: `sigterm_failed:${code}`, pid };
  }

  if (!isPidAlive(pid)) {
    return { ok: true, method: 'pid_sigterm', pid };
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    const code = error && error.code ? error.code : String(error);
    return { ok: false, reason: `sigkill_failed:${code}`, pid };
  }

  if (!isPidAlive(pid)) {
    return { ok: true, method: 'pid_sigkill', pid };
  }

  return { ok: false, reason: 'pid_still_running', pid };
}

function stopLoopRuntime(loop) {
  const loopId = Number(loop && loop.id);
  if (!Number.isInteger(loopId) || loopId <= 0) {
    return { ok: false, error: 'Invalid loop id' };
  }

  const details = {};
  const failures = [];
  const targetWindow = String(loop.tmux_window || `loop-${loopId}`).trim();
  const hasWindowMetadata = Boolean(loop.tmux_window);
  const loopPid = Number(loop && loop.pid);
  const hasPid = Number.isInteger(loopPid) && loopPid > 0;

  if (hasWindowMetadata) {
    if (!tmux.isAvailable()) {
      failures.push('tmux_unavailable_for_window_runtime');
    } else {
      const existedBefore = tmux.hasWindow(targetWindow);
      tmux.killWindow(targetWindow);
      const existsAfter = tmux.hasWindow(targetWindow);
      details.tmux = {
        window: targetWindow,
        existed_before: existedBefore,
        exists_after: existsAfter,
      };
      if (existedBefore && existsAfter) {
        failures.push('tmux_window_still_running');
      }
    }
  }

  if (hasPid) {
    const pidResult = terminatePid(loopPid);
    details.pid = pidResult;
    if (!pidResult.ok) {
      failures.push(`pid_termination_failed:${pidResult.reason}`);
    }
  }

  if (!hasWindowMetadata && !hasPid) {
    details.runtime = 'none';
  }

  if (failures.length > 0) {
    db.log('coordinator', 'loop_stop_runtime_failed', {
      loop_id: loopId,
      failures,
      details,
    });
    return {
      ok: false,
      error: `Failed to terminate loop runtime: ${failures.join(', ')}`,
    };
  }

  db.stopLoop(loopId);
  db.updateLoop(loopId, {
    tmux_session: null,
    tmux_window: null,
    pid: null,
    last_heartbeat: new Date().toISOString(),
  });
  db.log('coordinator', 'loop_runtime_stopped', { loop_id: loopId, details });
  return { ok: true, loop_id: loopId, details };
}

function acquirePidLock() {
  fs.mkdirSync(stateDir, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      fs.writeFileSync(pidFile, String(process.pid), { flag: 'wx' });
      ownsPidLock = true;
      return true;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') throw err;
      let existingPid = NaN;
      try {
        existingPid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      } catch {}
      if (isPidAlive(existingPid)) {
        console.log(`Coordinator already running for namespace "${namespace}" (PID ${existingPid}), exiting duplicate start.`);
        return false;
      }
      try { fs.unlinkSync(pidFile); } catch {}
    }
  }
  console.error(`Failed to acquire coordinator pid lock: ${pidFile}`);
  return false;
}

function releasePidLock() {
  if (!ownsPidLock) return;
  try {
    const current = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    if (current === process.pid) fs.unlinkSync(pidFile);
  } catch {}
  ownsPidLock = false;
}

function resolveWorkerSentinelPath() {
  const candidatePaths = [];
  const seen = new Set();
  const checks = [];
  const addCandidate = (candidatePath) => {
    const normalized = path.resolve(candidatePath);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    candidatePaths.push(normalized);
  };

  const scriptDirParent = path.dirname(scriptDir);
  addCandidate(path.join(scriptDir, 'worker-sentinel.sh'));
  addCandidate(path.join(scriptDir, 'scripts', 'worker-sentinel.sh'));
  addCandidate(path.join(scriptDir, '.claude', 'scripts', 'worker-sentinel.sh'));
  addCandidate(path.join(scriptDirParent, 'scripts', 'worker-sentinel.sh'));
  addCandidate(path.join(scriptDirParent, '.claude', 'scripts', 'worker-sentinel.sh'));
  addCandidate(path.join(projectDir, '.claude', 'scripts', 'worker-sentinel.sh'));

  for (const candidate of candidatePaths) {
    let stat = null;
    try {
      stat = fs.statSync(candidate);
    } catch (err) {
      checks.push({ path: candidate, status: 'missing', error: err.code || err.message });
      continue;
    }

    if (!stat.isFile()) {
      checks.push({ path: candidate, status: 'not_file' });
      continue;
    }

    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      checks.push({ path: candidate, status: 'selected' });
      return { selectedPath: candidate, candidatePaths, checks };
    } catch (err) {
      checks.push({ path: candidate, status: 'not_executable', error: err.code || err.message });
    }
  }

  const details = checks
    .map((entry) => `${entry.path}:${entry.status}${entry.error ? `(${entry.error})` : ''}`)
    .join(', ');
  const err = new Error(
    `WORKER_SENTINEL_RESOLUTION_FAILED: no executable worker sentinel found; selected=null; candidates=${candidatePaths.join(', ')}; checks=${details}`
  );
  err.code = 'WORKER_SENTINEL_RESOLUTION_FAILED';
  err.candidatePaths = candidatePaths;
  err.checks = checks;
  throw err;
}

if (!acquirePidLock()) {
  process.exit(0);
}

process.on('exit', releasePidLock);

console.log(`mac10 coordinator starting for: ${projectDir}`);

// Initialize database
db.init(projectDir);
console.log('Database initialized.');

// Namespace tmux session per project (optional — not available on native Windows)
tmux.setSession(projectDir, namespace);
if (tmux.isAvailable()) {
  tmux.ensureSession();
  console.log(`tmux session "${tmux.SESSION}" ready.`);
} else {
  console.log('tmux not available — workers will be spawned via Windows Terminal tabs.');
}

// Start CLI server (Unix socket for mac10 commands)
const handlers = {
  onTaskCompleted: (taskId) => merger.onTaskCompleted(taskId),
  onAssignTask: (task, worker) => {
    const worktreePath = worker.worktree_path || path.join(projectDir, '.worktrees', `wt-${worker.id}`);

    // Sync knowledge files from main project to worktree before spawning
    try {
      const srcKnowledge = path.join(projectDir, '.claude', 'knowledge');
      const dstKnowledge = path.join(worktreePath, '.claude', 'knowledge');
      const fs = require('fs');
      fs.mkdirSync(path.join(dstKnowledge, 'domain'), { recursive: true });
      for (const f of fs.readdirSync(srcKnowledge)) {
        const srcFile = path.join(srcKnowledge, f);
        if (fs.statSync(srcFile).isFile()) {
          fs.copyFileSync(srcFile, path.join(dstKnowledge, f));
        }
      }
      // Sync domain subdirectory
      const domainDir = path.join(srcKnowledge, 'domain');
      if (fs.existsSync(domainDir)) {
        for (const f of fs.readdirSync(domainDir)) {
          fs.copyFileSync(path.join(domainDir, f), path.join(dstKnowledge, 'domain', f));
        }
      }
    } catch (e) {
      db.log('coordinator', 'knowledge_sync_error', { worker_id: worker.id, error: e.message });
    }

    // Write task overlay to worker instruction files (AGENTS.md + CLAUDE.md).
    try {
      overlay.writeOverlay(task, worker, projectDir);
    } catch (e) {
      db.log('coordinator', 'overlay_error', { worker_id: worker.id, error: e.message });
    }

    const windowName = `worker-${worker.id}`;

    if (tmux.isAvailable()) {
      let sentinelResolution = null;
      try {
        sentinelResolution = resolveWorkerSentinelPath();
      } catch (err) {
        db.log('coordinator', 'worker_sentinel_resolution_failed', {
          worker_id: worker.id,
          candidate_paths: Array.isArray(err.candidatePaths) ? err.candidatePaths : [],
          selected_path: null,
          checks: Array.isArray(err.checks) ? err.checks : [],
          error: err.message,
        });
        console.error(
          `Worker sentinel resolution failed for worker ${worker.id}. candidate_paths=${JSON.stringify(Array.isArray(err.candidatePaths) ? err.candidatePaths : [])} selected_path=null error=${err.message}`
        );
        throw err;
      }
      db.log('coordinator', 'worker_sentinel_resolved', {
        worker_id: worker.id,
        candidate_paths: sentinelResolution.candidatePaths,
        selected_path: sentinelResolution.selectedPath,
      });
      console.log(
        `Worker sentinel resolved for worker ${worker.id}. candidate_paths=${JSON.stringify(sentinelResolution.candidatePaths)} selected_path=${sentinelResolution.selectedPath}`
      );

      // WSL/Linux/macOS: spawn via tmux
      if (tmux.hasWindow(windowName)) {
        tmux.killWindow(windowName);
      }
      tmux.createWindow(
        windowName,
        `MAC10_NAMESPACE="${namespace}" bash "${sentinelResolution.selectedPath}" ${worker.id} "${projectDir}"`,
        worktreePath
      );
      db.updateWorker(worker.id, {
        tmux_session: tmux.SESSION,
        tmux_window: windowName,
      });
    } else {
      // Native Windows: spawn via launch-worker.sh (opens Windows Terminal tab)
      const launchScript = path.join(projectDir, '.claude', 'scripts', 'launch-worker.sh');
      db.updateWorker(worker.id, {
        tmux_session: null,
        tmux_window: null,
        pid: null,
      });
      execFile('bash', [launchScript, String(worker.id)], {
        cwd: projectDir,
        env: { ...process.env, MAC10_NAMESPACE: namespace },
      }, (err, stdout = '', _stderr) => {
        if (err) db.log('coordinator', 'launch_worker_error', { worker_id: worker.id, error: err.message });
        const pidMatch = String(stdout).match(/^LAUNCH_WORKER_PID=(\d+)$/m);
        if (!pidMatch) {
          db.log('coordinator', 'launch_worker_no_pid', { worker_id: worker.id, script: launchScript });
          db.sendMail('allocator', 'worker_launch_pid_missing', {
            worker_id: worker.id,
            reason: 'non_tmux_launch_missing_pid_metadata',
          });
          return;
        }
        const pid = parseInt(pidMatch[1], 10);
        if (!Number.isInteger(pid) || pid <= 0) {
          db.log('coordinator', 'launch_worker_invalid_pid', { worker_id: worker.id, pid: pidMatch[1] });
          db.sendMail('allocator', 'worker_launch_pid_invalid', {
            worker_id: worker.id,
            pid: pidMatch[1],
          });
          return;
        }
        db.updateWorker(worker.id, { pid });
      });
    }
    db.log('coordinator', 'worker_spawned', { worker_id: worker.id, window: windowName });
  },
  onLoopCreated: (loopId, prompt) => {
    const windowName = `loop-${loopId}`;

    if (tmux.isAvailable()) {
      if (tmux.hasWindow(windowName)) {
        tmux.killWindow(windowName);
      }
      const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');
      tmux.createWindow(
        windowName,
        `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${loopId} "${projectDir}"`,
        projectDir
      );
      db.updateLoop(loopId, {
        tmux_session: tmux.SESSION,
        tmux_window: windowName,
        pid: null,
      });
      db.log('coordinator', 'loop_spawned', { loop_id: loopId, window: windowName, runtime: 'tmux' });
      return { ok: true, loop_id: loopId };
    } else {
      // Native Windows: spawn via launch script
      const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');
      return new Promise((resolve) => {
        let settled = false;
        let launchFailed = false;
        let confirmationTimer = null;

        const settle = (result) => {
          if (settled) return;
          settled = true;
          if (confirmationTimer) clearTimeout(confirmationTimer);
          resolve(result);
        };

        const markLaunchFailure = (error, phase) => {
          if (launchFailed || settled) return;
          launchFailed = true;
          const failure = failClosedLoopLaunch(loopId, error, {
            runtime: 'non_tmux',
            phase,
            sentinel_path: sentinelPath,
          });
          if (!settled) settle(failure);
        };

        try {
          const child = execFile('bash', [sentinelPath, String(loopId), projectDir], {
            cwd: projectDir,
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, MAC10_NAMESPACE: namespace },
          }, (err) => {
            if (err) {
              markLaunchFailure(err, 'execfile_callback');
            }
          });
          child.unref();

          const pid = Number.isInteger(child.pid) && child.pid > 0 ? child.pid : null;

          child.once('error', (error) => {
            markLaunchFailure(error, 'child_error');
          });

          if (!pid) {
            markLaunchFailure(new Error('loop_launch_missing_pid'), 'missing_pid');
            return;
          }

          confirmationTimer = setTimeout(() => {
            if (!isPidAlive(pid)) {
              markLaunchFailure(
                new Error(`loop_runtime_not_alive_after_${LOOP_LAUNCH_CONFIRMATION_MS}ms`),
                'startup_healthcheck'
              );
              return;
            }
            db.updateLoop(loopId, {
              tmux_session: 'non_tmux',
              tmux_window: null,
              pid,
            });
            db.log('coordinator', 'loop_spawned', {
              loop_id: loopId,
              window: windowName,
              runtime: 'non_tmux',
              pid,
            });
            settle({ ok: true, loop_id: loopId });
          }, LOOP_LAUNCH_CONFIRMATION_MS);
        } catch (err) {
          markLaunchFailure(err, 'execfile_throw');
        }
      });
    }
  },
  onLoopStop: (loop) => stopLoopRuntime(loop),
};
const runtimeCapabilities = {
  requestIntakeCapability: {
    enabled: true,
    reason: 'coordinator_request_intake_ready',
  },
};
cliServer.start(projectDir, handlers);
console.log('CLI server listening.');

// Start allocator loop (every 2s)
allocator.start(projectDir);
console.log('Allocator running.');

// Start watchdog loop (every 10s)
watchdog.start(projectDir);
console.log('Watchdog running.');

// Start merger (triggered + periodic)
merger.start(projectDir);
console.log('Merger running.');

// Start web dashboard — single dashboard at port 3100 (or next free port)
// All project coordinators register in the shared instance registry so the
// dashboard at /api/instances can manage them all from one place.
(async () => {
  const port = parseInt(process.env.MAC10_PORT) || await instanceRegistry.acquirePort(3100);
  webServer.start(projectDir, port, scriptDir, handlers, runtimeCapabilities);
  console.log(`Web dashboard: http://localhost:${port}`);

  instanceRegistry.register({
    projectDir,
    port,
    pid: process.pid,
    name: path.basename(projectDir),
    namespace,
    tmuxSession: tmux.SESSION,
    startedAt: new Date().toISOString(),
  });
  console.log('Instance registered in shared registry.');

  // Re-wire shutdown to know the port
  function shutdown() {
    console.log('Shutting down...');
    instanceRegistry.deregister(port);
    allocator.stop();
    watchdog.stop();
    merger.stop();
    cliServer.stop();
    webServer.stop();
    db.log('coordinator', 'stopped');
    db.close();
    releasePidLock();
    process.exit(0);
  }
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  db.log('coordinator', 'started', { project_dir: projectDir, port });
  console.log('mac10 coordinator ready.');

  // Auto-launch Master-1 (Interface) so the user always has an interactive agent
  if (tmux.isAvailable()) {
    const masterWindowName = 'master-1';
    if (!tmux.hasWindow(masterWindowName)) {
      const launchAgentPath = path.join(scriptDir, 'scripts', 'launch-agent.sh');
      if (fs.existsSync(launchAgentPath)) {
        tmux.createWindow(
          masterWindowName,
          `MAC10_NAMESPACE="${namespace}" bash "${launchAgentPath}" "${projectDir}" sonnet /master-loop`,
          projectDir
        );
        db.log('coordinator', 'master1_launched', { window: masterWindowName, namespace });
        console.log('Master-1 (Interface) launched.');
      }
    }
  }
})();

// Crash handlers — log and exit cleanly instead of dying silently
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  try { db.log('coordinator', 'uncaught_exception', { error: err.message, stack: err.stack }); } catch {}
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error('Unhandled rejection:', msg);
  try { db.log('coordinator', 'unhandled_rejection', { error: msg }); } catch {}
});
