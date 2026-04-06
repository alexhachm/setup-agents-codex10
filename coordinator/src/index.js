'use strict';

const path = require('path');
const fs = require('fs');
const db = require('./db');
const cliServer = require('./cli-server');
const allocator = require('./allocator');
const watchdog = require('./watchdog');
const merger = require('./merger');
// const webServer = require('./web-server');  // GUI disabled — outdated
const tmux = require('./tmux');
const backend = require('./worker-backend');
const sandboxManager = require('./sandbox-manager');
const microvmManager = require('./microvm-manager');
const overlay = require('./overlay');
// const instanceRegistry = require('./instance-registry');  // GUI disabled — outdated

const pidLock = require('./pid-lock');

const projectDir = process.argv[2] || process.cwd();
const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
const namespace = process.env.MAC10_NAMESPACE || 'mac10';
const stateDir = path.join(projectDir, '.claude', 'state');
const _lock = pidLock.makeLock(stateDir, namespace);
// let _registeredPort = null;  // GUI disabled

function rebuildProjectMemorySnapshotIndexOnStartup() {
  try {
    const result = db.rebuildProjectMemorySnapshotIndex();
    if (result.indexed_count > 0) {
      console.log(
        `Project-memory snapshot index rebuilt for ${result.project_context_count} context(s).`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.log('coordinator', 'project_memory_snapshot_index_rebuild_error', { error: message });
  }
}

if (!_lock.acquire()) {
  console.log(`Coordinator already running for namespace "${namespace}", exiting duplicate start.`);
  process.exit(0);
}

process.on('exit', () => _lock.release());

console.log(`mac10 coordinator starting for: ${projectDir}`);

// Initialize database
db.init(projectDir);
rebuildProjectMemorySnapshotIndexOnStartup();
console.log('Database initialized.');

// Set project context for multi-project Docker/sandbox container isolation
if (backend.setProjectContext) backend.setProjectContext(namespace, projectDir);

// Namespace tmux session per project (optional — not available on native Windows)
tmux.setSession(projectDir, namespace);
if (tmux.isAvailable()) {
  tmux.ensureSession();
  console.log(`tmux session "${tmux.SESSION}" ready.`);
} else {
  console.log('tmux not available — workers will be spawned via Windows Terminal tabs.');
}
console.log(`Worker backend: ${backend.name} (available: ${backend.isAvailable()})`);

// Auto-start msb server if installed but not running
if (microvmManager.isMsbInstalled() && !microvmManager.isServerRunning()) {
  console.log('Microsandbox installed but server not running — starting...');
  try {
    microvmManager.startServer();
    // Brief wait for server to come up
    const { execFileSync } = require('child_process');
    try { execFileSync('sleep', ['2'], { timeout: 5000 }); } catch {}
    if (microvmManager.isServerRunning()) {
      console.log('Microsandbox server started successfully.');
    } else {
      console.log('Microsandbox server did not start — will fall back to Docker/tmux.');
    }
  } catch (e) {
    console.log(`Microsandbox server start failed: ${e.message}`);
  }
}

console.log(`Microsandbox (msb): ${microvmManager.isMsbInstalled() ? 'installed' : 'not installed'}, server: ${microvmManager.isServerRunning() ? 'running' : 'stopped'}`);
console.log(`Docker: ${sandboxManager.isDockerAvailable() ? 'available' : 'not available'}`);
console.log(`Isolation priority: msb → Docker → tmux`);

// Determine whether isolated execution is enabled.
// Default: true. All tasks use the strongest available isolation (msb → Docker → tmux).
function shouldUseSandbox() {
  if (db.getConfig('auto_sandbox_enabled') === 'false') return false;
  return true;
}

// Tmux/default backend fallback — used when both msb and Docker are unavailable or fail.
function spawnTmuxFallback(worker, windowName, cmd, worktreePath) {
  if (!backend.isAvailable()) return;
  try {
    backend.killWorker(windowName);
    backend.createWorker(windowName, cmd, worktreePath, { MAC10_NAMESPACE: namespace });
  } catch (e) {
    db.log('coordinator', 'backend_spawn_error', { worker_id: worker.id, backend: backend.name, error: e.message });
  }
  db.updateWorker(worker.id, { backend: backend.name });
  if (backend.name === 'tmux') {
    db.updateWorker(worker.id, { tmux_session: tmux.SESSION, tmux_window: windowName });
  }
}

// Start CLI server (Unix socket for mac10 commands)
const handlers = {
  onTaskCompleted: (taskId) => merger.onTaskCompleted(taskId),
  onAssignTask: (task, worker) => {
    const worktreePath = worker.worktree_path || path.join(projectDir, '.worktrees', `wt-${worker.id}`);

    // Symlink knowledge files from main project into worktree (no stale copies)
    try {
      const srcKnowledge = path.join(projectDir, '.claude', 'knowledge');
      const dstKnowledge = path.join(worktreePath, '.claude', 'knowledge');

      // Validate source is a directory; repair if it's a plain file
      if (fs.existsSync(srcKnowledge) && !fs.statSync(srcKnowledge).isDirectory()) {
        fs.rmSync(srcKnowledge, { force: true });
        fs.mkdirSync(srcKnowledge, { recursive: true });
      }

      if (fs.existsSync(srcKnowledge)) {
        // Skip if symlink already points to the correct target
        const currentTarget = (() => {
          try { return fs.readlinkSync(dstKnowledge); } catch { return null; }
        })();
        if (currentTarget !== srcKnowledge) {
          // Remove existing target (stale copy or broken symlink) before linking
          try { fs.rmSync(dstKnowledge, { recursive: true, force: true }); } catch {}
          fs.mkdirSync(path.join(worktreePath, '.claude'), { recursive: true });
          const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
          fs.symlinkSync(srcKnowledge, dstKnowledge, symlinkType);
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

    // Detect new/uncovered domains and notify Master-1
    try {
      const knowledgeMeta = require('./knowledge-metadata');
      const coverage = knowledgeMeta.getDomainCoverage(projectDir);
      if (task.domain && !coverage.domains[task.domain]) {
        db.sendMail('master-1', 'knowledge_gap_detected', {
          domain: task.domain,
          task_id: task.id,
          message: `New domain "${task.domain}" has no codebase research. Consider running mac10 research-codebase.`,
        });
      }
    } catch (e) {
      db.log('coordinator', 'knowledge_gap_check_error', { worker_id: worker.id, error: e.message });
    }

    const windowName = `worker-${worker.id}`;
    const sentinelPath = path.join(projectDir, '.claude', 'scripts', 'worker-sentinel.sh');
    const cmd = `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${worker.id} "${projectDir}"`;

    // Isolation priority: msb (microVM) → Docker (container) → tmux (process)
    // Each level falls through to the next on failure or unavailability.
    const isolationEnabled = shouldUseSandbox();
    const useMsb = isolationEnabled && microvmManager.isAvailable();
    const useDocker = isolationEnabled && !useMsb && sandboxManager.isDockerAvailable();

    if (useMsb) {
      try {
        const msbBackend = require('./worker-backend').getBackend('sandbox');
        msbBackend.killWorker(windowName);
        msbBackend.createWorker(windowName, cmd, worktreePath, { MAC10_NAMESPACE: namespace });
        db.updateWorker(worker.id, { backend: 'sandbox' });
        db.log('coordinator', 'worker_spawned_msb', { worker_id: worker.id, task_id: task.id });
      } catch (e) {
        // msb failed — try Docker, then tmux
        db.log('coordinator', 'msb_spawn_failed', { worker_id: worker.id, error: e.message });
        if (sandboxManager.isDockerAvailable()) {
          try {
            sandboxManager.ensureReady(projectDir);
            const dockerBackend = require('./worker-backend').getBackend('docker');
            dockerBackend.killWorker(windowName);
            dockerBackend.createWorker(windowName, cmd, worktreePath, { MAC10_NAMESPACE: namespace });
            db.updateWorker(worker.id, { backend: 'docker' });
            db.log('coordinator', 'worker_spawned_docker_fallback', { worker_id: worker.id, task_id: task.id });
          } catch (e2) {
            db.log('coordinator', 'docker_spawn_failed_fallback', { worker_id: worker.id, error: e2.message });
            spawnTmuxFallback(worker, windowName, cmd, worktreePath);
          }
        } else {
          spawnTmuxFallback(worker, windowName, cmd, worktreePath);
        }
      }
    } else if (useDocker) {
      try {
        sandboxManager.ensureReady(projectDir);
        const dockerBackend = require('./worker-backend').getBackend('docker');
        dockerBackend.killWorker(windowName);
        dockerBackend.createWorker(windowName, cmd, worktreePath, { MAC10_NAMESPACE: namespace });
        db.updateWorker(worker.id, { backend: 'docker' });
        db.log('coordinator', 'worker_spawned_docker', { worker_id: worker.id, task_id: task.id });
      } catch (e) {
        db.log('coordinator', 'docker_spawn_failed_fallback', { worker_id: worker.id, error: e.message });
        spawnTmuxFallback(worker, windowName, cmd, worktreePath);
      }
    } else if (backend.isAvailable()) {
      spawnTmuxFallback(worker, windowName, cmd, worktreePath);
    } else {
      // Native Windows: spawn via launch-worker.sh (opens Windows Terminal tab)
      const launchScript = path.join(projectDir, '.claude', 'scripts', 'launch-worker.sh');
      const { execFile } = require('child_process');
      execFile('bash', [launchScript, String(worker.id)], {
        cwd: projectDir,
        env: { ...process.env, MAC10_NAMESPACE: namespace },
      }, (err) => {
        if (err) db.log('coordinator', 'launch_worker_error', { worker_id: worker.id, error: err.message });
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
        namespace,
        tmux_session: tmux.SESSION,
        tmux_window: windowName,
      });
    } else {
      // Native Windows: spawn via launch script
      const { execFile } = require('child_process');
      const sentinelPath = path.join(scriptDir, 'scripts', 'loop-sentinel.sh');
      execFile('bash', [sentinelPath, String(loopId), projectDir], {
        cwd: projectDir,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, MAC10_NAMESPACE: namespace },
      }, (err) => {
        if (err) db.log('coordinator', 'loop_launch_error', { loop_id: loopId, error: err.message });
      });
    }
    db.log('coordinator', 'loop_spawned', { loop_id: loopId, window: windowName });
  },
  onBrowserSessionEvent: (event) => {
    try {
      db.log('coordinator', 'browser_offload_event', event);
    } catch {}
  },
};
cliServer.start(projectDir, handlers);
console.log('CLI server listening.');

// Start allocator loop (every 2s) — deterministic assignment with handler-based spawning
allocator.start(projectDir, { onAssignTask: handlers.onAssignTask });
console.log('Allocator running.');

// Start watchdog loop (every 10s)
watchdog.start(projectDir);
console.log('Watchdog running.');

// Start merger (triggered + periodic)
merger.start(projectDir);
console.log('Merger running.');

// --- GUI disabled (outdated) ---
// Web dashboard and instance registry startup removed.
// To re-enable, restore webServer.start() and instanceRegistry usage.

function shutdown() {
  console.log('Shutting down...');
  allocator.stop();
  watchdog.stop();
  merger.stop();
  cliServer.stop();
  db.log('coordinator', 'stopped');
  db.close();
  releasePidLock();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

db.log('coordinator', 'started', { project_dir: projectDir });
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
