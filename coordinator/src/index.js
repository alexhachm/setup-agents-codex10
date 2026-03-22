'use strict';

const path = require('path');
const fs = require('fs');
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
const stateDir = path.join(projectDir, '.codex', 'state');
const pidFile = path.join(stateDir, namespace === 'mac10' ? 'mac10.pid' : `${namespace}.pid`);
let ownsPidLock = false;

function resolveProjectProvider(projectPath) {
  const envFile = path.join(projectPath, '.codex', 'state', 'agent-launcher.env');
  try {
    const raw = fs.readFileSync(envFile, 'utf8');
    const match = raw.match(/^MAC10_AGENT_PROVIDER=([^\r\n]+)$/m);
    if (match) {
      const provider = String(match[1]).trim().toLowerCase();
      return provider === 'claude' ? 'claude' : 'codex';
    }
  } catch {}
  return 'codex';
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
  onAssignTask: (task, worker, routingDecision = {}) => {
    const worktreePath = worker.worktree_path || path.join(projectDir, '.worktrees', `wt-${worker.id}`);

    // Sync knowledge files from main project to worktree before spawning.
    // When wt/.codex is a symlink to project/.codex, source and destination
    // are the same directory and copying would fail.
    try {
      const srcKnowledge = path.join(projectDir, '.codex', 'knowledge');
      const dstKnowledge = path.join(worktreePath, '.codex', 'knowledge');
      const fs = require('fs');
      const srcReal = fs.realpathSync(srcKnowledge);
      const dstReal = fs.realpathSync(dstKnowledge);
      if (srcReal === dstReal) {
        // Shared runtime via symlink; nothing to sync.
      } else {
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
      // WSL/Linux/macOS: spawn via tmux
      if (tmux.hasWindow(windowName)) {
        tmux.killWindow(windowName);
      }
      const sentinelPath = path.join(projectDir, '.codex', 'scripts', 'worker-sentinel.sh');
      tmux.createWindow(
        windowName,
        `MAC10_NAMESPACE="${namespace}" bash "${sentinelPath}" ${worker.id} "${projectDir}"`,
        worktreePath
      );
      db.updateWorker(worker.id, {
        tmux_session: tmux.SESSION,
        tmux_window: windowName,
      });
    } else {
      // Native Windows: spawn via launch-worker.sh (opens Windows Terminal tab)
      const launchScript = path.join(projectDir, '.codex', 'scripts', 'launch-worker.sh');
      const { execFile } = require('child_process');
      execFile('bash', [launchScript, String(worker.id)], {
        cwd: projectDir,
        env: { ...process.env, MAC10_NAMESPACE: namespace },
      }, (err) => {
        if (err) db.log('coordinator', 'launch_worker_error', { worker_id: worker.id, error: err.message });
      });
    }
    db.log('coordinator', 'worker_spawned', {
      worker_id: worker.id,
      task_id: task.id,
      assignment_token: worker.launched_at || null,
      window: windowName,
      model: routingDecision.model || null,
      routing_class: routingDecision.routing_class || null,
      reasoning_effort: routingDecision.reasoning_effort || null,
      routing_reason: routingDecision.reason || null,
    });
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
  webServer.start(projectDir, port, scriptDir, handlers);
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
      const provider = resolveProjectProvider(projectDir);
      if (fs.existsSync(launchAgentPath)) {
        tmux.createWindow(
          masterWindowName,
          `MAC10_NAMESPACE="${namespace}" bash "${launchAgentPath}" "${projectDir}" sonnet /master-loop`,
          projectDir
        );
        db.log('coordinator', 'master1_launched', { window: masterWindowName, namespace });
        if (provider === 'claude') {
          setTimeout(() => {
            try {
              tmux.sendKeys(masterWindowName, '');
              db.log('coordinator', 'master1_trust_prompt_confirmed', { window: masterWindowName });
            } catch (err) {
              db.log('coordinator', 'master1_trust_prompt_confirm_failed', {
                window: masterWindowName,
                error: err.message,
              });
            }
          }, 1500);
        }
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
