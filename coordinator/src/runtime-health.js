'use strict';

const fs = require('fs');
const path = require('path');

function formatUptimeHuman(ms) {
  if (ms == null || ms < 0) return 'unknown';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function readJsonFileSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function isoAgeMs(value) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Date.now() - ts);
}

function countByStatus(rows) {
  const counts = {};
  for (const row of rows || []) {
    const status = row && row.status ? String(row.status) : 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function callHealthProbe(name, fn, fallback = {}) {
  try {
    return fn();
  } catch (e) {
    return { ...fallback, probe: name, error: e.message };
  }
}

function collectRuntimeHealth({ db, projectDir, workers }) {
  const sandboxManager = require('./sandbox-manager');
  const microvmManager = require('./microvm-manager');
  const workerBackend = require('./worker-backend');
  const researchDriverManager = require('./research-driver-manager');
  const sandbox = callHealthProbe('sandbox', () => sandboxManager.getStatus(projectDir), {
    docker_available: false,
    auto_sandbox_enabled: db.getConfig('auto_sandbox_enabled') !== 'false',
  });
  const microvm = callHealthProbe('microvm', () => microvmManager.getStatus(), {
    msb_installed: false,
    server_running: false,
  });
  const tmuxAvailable = callHealthProbe('tmux', () => {
    const tmuxBackend = workerBackend.getBackend('tmux');
    return { available: Boolean(tmuxBackend && tmuxBackend.isAvailable()) };
  }, { available: false }).available === true;
  const isolationEnabled = db.getConfig('auto_sandbox_enabled') !== 'false';
  const msbAvailable = microvm.msb_installed === true && microvm.server_running === true;
  const dockerAvailable = sandbox.docker_available === true;
  const effectiveBackend = !isolationEnabled
    ? (tmuxAvailable ? 'tmux' : 'none')
    : (msbAvailable ? 'sandbox' : (dockerAvailable ? 'docker' : (tmuxAvailable ? 'tmux' : 'none')));
  const researchRuntime = callHealthProbe('research-driver-runtime', () => (
    researchDriverManager.getRuntimeStatus(projectDir)
  ), { running: false, sentinel_running: false, driver_running: false });
  const agentHealth = readJsonFileSafe(path.join(projectDir, '.claude', 'state', 'agent-health.json')) || {};
  const researchHeartbeat = agentHealth['research-driver'] || {};

  return {
    isolation: {
      enabled: isolationEnabled,
      priority: ['sandbox', 'docker', 'tmux'],
      effective_backend: effectiveBackend,
      msb_available: msbAvailable,
      docker_available: dockerAvailable,
      tmux_available: tmuxAvailable,
    },
    sandbox,
    microvm,
    research: {
      status: researchHeartbeat.status || null,
      last_active: researchHeartbeat.last_active || null,
      last_active_age_ms: isoAgeMs(researchHeartbeat.last_active),
      runtime: researchRuntime,
    },
    worker_backends: countByStatus((workers || []).map((worker) => ({
      status: worker.backend || 'tmux',
    }))),
  };
}

function collectCoordinatorHealth({ db, projectDir, namespace = 'mac10', serverStartedAt = null }) {
  const uptime_ms = db.coordinatorAgeMs(serverStartedAt);
  const allWorkers = db.getAllWorkers();
  const idleWorkers = db.getIdleWorkers();
  const assignedTasks = db.listTasks({ status: 'assigned' });
  const inProgressTasks = db.listTasks({ status: 'in_progress' });
  const taskRows = db.getDb().prepare('SELECT id, status FROM tasks').all();
  const runtime = collectRuntimeHealth({ db, projectDir, workers: allWorkers });

  return {
    project_dir: projectDir,
    namespace,
    uptime_ms,
    uptime_human: formatUptimeHuman(uptime_ms),
    worker_count: allWorkers.length,
    idle_workers: idleWorkers.length,
    active_tasks: assignedTasks.length,
    workers: {
      total: allWorkers.length,
      idle: idleWorkers.length,
      status_counts: countByStatus(allWorkers),
      backend_counts: runtime.worker_backends,
    },
    tasks: {
      total: taskRows.length,
      active: assignedTasks.length + inProgressTasks.length,
      assigned: assignedTasks.length,
      in_progress: inProgressTasks.length,
      status_counts: countByStatus(taskRows),
    },
    runtime,
    isolation: runtime.isolation,
    sandbox: runtime.sandbox,
    microvm: runtime.microvm,
    research: runtime.research,
  };
}

module.exports = {
  collectCoordinatorHealth,
  collectRuntimeHealth,
  formatUptimeHuman,
  readJsonFileSafe,
  isoAgeMs,
  countByStatus,
  callHealthProbe,
};
