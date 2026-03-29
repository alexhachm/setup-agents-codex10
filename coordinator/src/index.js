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
const overlay = require('./overlay');
// const instanceRegistry = require('./instance-registry');  // GUI disabled — outdated

const projectDir = process.argv[2] || process.cwd();
const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
const namespace = process.env.MAC10_NAMESPACE || 'mac10';
const stateDir = path.join(projectDir, '.claude', 'state');
const pidFile = path.join(stateDir, namespace === 'mac10' ? 'mac10.pid' : `${namespace}.pid`);
let ownsPidLock = false;
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

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

if (!acquirePidLock()) {
  process.exit(0);
}

process.on('exit', releasePidLock);

console.log(`mac10 coordinator starting for: ${projectDir}`);

// Initialize database
db.init(projectDir);
rebuildProjectMemorySnapshotIndexOnStartup();
console.log('Database initialized.');

// Namespace tmux session per project (optional — not available on native Windows)
tmux.setSession(projectDir, namespace);
if (tmux.isAvailable()) {
  tmux.ensureSession();
  console.log(`tmux session "${tmux.SESSION}" ready.`);
} else {
  console.log('tmux not available — workers will be spawned via Windows Terminal tabs.');
}
console.log(`Worker backend: ${backend.name} (available: ${backend.isAvailable()})`);

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

    if (backend.isAvailable()) {
      // Spawn worker via the active backend (tmux, docker, or sandbox)
      const sentinelPath = path.join(projectDir, '.claude', 'scripts', 'worker-sentinel.sh');
      const cmd = `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${worker.id} "${projectDir}"`;
      try {
        backend.killWorker(windowName);
        backend.createWorker(windowName, cmd, worktreePath, { MAC10_NAMESPACE: namespace });
      } catch (e) {
        db.log('coordinator', 'backend_spawn_error', { worker_id: worker.id, backend: backend.name, error: e.message });
      }
      if (backend.name === 'tmux') {
        db.updateWorker(worker.id, {
          tmux_session: tmux.SESSION,
          tmux_window: windowName,
        });
      }
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
