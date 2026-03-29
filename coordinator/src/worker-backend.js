'use strict';

/**
 * Worker backend abstraction layer.
 *
 * Routes worker lifecycle operations to the active backend:
 *   - tmux   (default) — current behavior via tmux.js
 *   - docker — Docker container per worker (Phase 3)
 *   - sandbox — microsandbox microVM per worker (Phase 5)
 *
 * Selection via MAC10_WORKER_BACKEND env var (default: 'tmux').
 */

const tmux = require('./tmux');

const BACKEND = (process.env.MAC10_WORKER_BACKEND || 'tmux').toLowerCase();

// ---------------------------------------------------------------------------
// tmux backend (delegates to tmux.js as-is)
// ---------------------------------------------------------------------------

const tmuxBackend = {
  name: 'tmux',

  isAvailable() {
    return tmux.isAvailable();
  },

  createWorker(name, cmd, cwd, envVars) {
    if (!tmux.isAvailable()) {
      throw new Error('tmux not available — use Windows Terminal tab spawning');
    }
    tmux.ensureSession();
    if (tmux.hasWindow(name)) {
      tmux.killWindow(name);
    }
    tmux.createWindow(name, cmd, cwd, envVars);
  },

  isWorkerAlive(name) {
    return tmux.isPaneAlive(name);
  },

  killWorker(name) {
    tmux.killWindow(name);
  },

  listWorkers() {
    return tmux.listWindows().filter(w => w.startsWith('worker-'));
  },

  getWorkerPid(name) {
    return tmux.getPanePid(name);
  },

  captureOutput(name, lines) {
    return tmux.capturePane(name, lines);
  },
};

// ---------------------------------------------------------------------------
// Docker backend (Phase 3)
// ---------------------------------------------------------------------------

const dockerBackend = {
  name: 'docker',

  isAvailable() {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('docker', ['info'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },

  createWorker(name, cmd, cwd, envVars) {
    const { execFileSync } = require('child_process');
    // Remove any existing container with the same name
    try {
      execFileSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* container may not exist */ }

    const args = [
      'run', '-d',
      '--name', name,
      '--label', 'mac10-worker=true',
      '-v', `${cwd}:/workspace`,
      '-w', '/workspace',
    ];

    if (envVars && typeof envVars === 'object') {
      for (const [k, v] of Object.entries(envVars)) {
        args.push('-e', `${k}=${v}`);
      }
    }

    // Use the mac10-worker image (built from sandbox/Dockerfile.worker)
    const image = process.env.MAC10_WORKER_IMAGE || 'mac10-worker:latest';
    args.push(image, 'bash', '-c', cmd);
    execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
  },

  isWorkerAlive(name) {
    try {
      const { execFileSync } = require('child_process');
      const result = execFileSync(
        'docker', ['inspect', '--format', '{{.State.Running}}', name],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      return result === 'true';
    } catch {
      return false;
    }
  },

  killWorker(name) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('docker', ['rm', '-f', name], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* container may not exist */ }
  },

  listWorkers() {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(
        'docker', ['ps', '--filter', 'label=mac10-worker', '--format', '{{.Names}}'],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      return out ? out.split('\n').filter(Boolean) : [];
    } catch {
      return [];
    }
  },

  getWorkerPid(name) {
    try {
      const { execFileSync } = require('child_process');
      const pid = execFileSync(
        'docker', ['inspect', '--format', '{{.State.Pid}}', name],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      return pid ? parseInt(pid, 10) : null;
    } catch {
      return null;
    }
  },

  captureOutput(name, lines = 50) {
    try {
      const { execFileSync } = require('child_process');
      return execFileSync(
        'docker', ['logs', '--tail', String(lines), name],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
    } catch {
      return '';
    }
  },
};

// ---------------------------------------------------------------------------
// Microsandbox backend (Phase 5)
// ---------------------------------------------------------------------------

const sandboxBackend = {
  name: 'sandbox',

  isAvailable() {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('msb', ['server', 'status'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },

  createWorker(name, cmd, cwd, envVars) {
    // Microsandbox SDK integration — requires the microsandbox npm package.
    // Falls back to CLI if SDK is unavailable.
    const { execFileSync } = require('child_process');
    const envArgs = [];
    if (envVars && typeof envVars === 'object') {
      for (const [k, v] of Object.entries(envVars)) {
        envArgs.push('--env', `${k}=${v}`);
      }
    }
    const image = process.env.MAC10_WORKER_IMAGE || 'mac10-worker:latest';
    execFileSync('msb', [
      'sandbox', 'create', name,
      '--image', image,
      '--cpus', '2',
      '--memory', '1024',
      '--volume', `${cwd}:/workspace`,
      ...envArgs,
      '--', 'bash', '-c', cmd,
    ], { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
  },

  isWorkerAlive(name) {
    try {
      const { execFileSync } = require('child_process');
      const result = execFileSync(
        'msb', ['sandbox', 'status', name],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      return result.includes('running');
    } catch {
      return false;
    }
  },

  killWorker(name) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('msb', ['sandbox', 'stop', name], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* sandbox may not exist */ }
  },

  listWorkers() {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(
        'msb', ['sandbox', 'list', '--format', 'name'],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      return out ? out.split('\n').filter(n => n.startsWith('worker-')) : [];
    } catch {
      return [];
    }
  },

  getWorkerPid(name) {
    // MicroVMs don't expose host PIDs — return null
    return null;
  },

  captureOutput(name, lines = 50) {
    try {
      const { execFileSync } = require('child_process');
      return execFileSync(
        'msb', ['sandbox', 'logs', '--tail', String(lines), name],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
    } catch {
      return '';
    }
  },
};

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

const backends = {
  tmux: tmuxBackend,
  docker: dockerBackend,
  sandbox: sandboxBackend,
};

const activeBackend = backends[BACKEND];
if (!activeBackend) {
  throw new Error(`Unknown worker backend: ${BACKEND}. Valid values: ${Object.keys(backends).join(', ')}`);
}

module.exports = activeBackend;
