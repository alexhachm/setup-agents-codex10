'use strict';

/**
 * Worker backend abstraction layer.
 *
 * Routes worker lifecycle operations to the active backend:
 *   - tmux   (default) — current behavior via tmux.js
 *   - docker — Docker container per worker (Phase 3)
 *   - sandbox — microsandbox microVM per worker (Phase 5)
 *
 * Supports multi-project isolation: Docker/sandbox containers are namespaced
 * per project via setProjectContext() to prevent collisions when multiple
 * mac10 instances run concurrently on the same host.
 *
 * Selection via MAC10_WORKER_BACKEND env var (default: 'tmux').
 */

const tmux = require('./tmux');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BACKEND = (process.env.MAC10_WORKER_BACKEND || 'tmux').toLowerCase();
const SANDBOXFILE_TEMPLATE = path.resolve(__dirname, '../../sandbox/Sandboxfile');

// ---------------------------------------------------------------------------
// Multi-project isolation: project context for Docker/sandbox naming
// ---------------------------------------------------------------------------

let _namespace = 'mac10';
let _projectDir = '';
let _projectHash = '';

function setProjectContext(namespace, projectDir) {
  _namespace = namespace || 'mac10';
  _projectDir = projectDir || '';
  _projectHash = crypto.createHash('md5').update(projectDir || '').digest('hex').slice(0, 6);
}

function _prefixedName(name) {
  if (!_projectHash) return name;
  return `${_namespace}-${_projectHash}-${name}`;
}

function _projectLabel() {
  return `mac10-project=${_namespace}-${_projectHash}`;
}

function getSandboxfilePath() {
  if (_projectDir) {
    const projSpecific = path.join(_projectDir, '.claude', 'state', 'Sandboxfile');
    if (fs.existsSync(projSpecific)) return projSpecific;
  }
  return SANDBOXFILE_TEMPLATE;
}

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
    const containerName = _prefixedName(name);
    // Remove any existing container with the same name
    try {
      execFileSync('docker', ['rm', '-f', containerName], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* container may not exist */ }

    const args = [
      'run', '-d',
      '--name', containerName,
      '--label', 'mac10-worker=true',
      '--label', _projectLabel(),
      '--entrypoint', '',
      '-v', `${cwd}:/workspace`,
      '-w', '/workspace',
    ];

    if (_projectDir && path.resolve(_projectDir) !== path.resolve(cwd)) {
      args.push('-v', `${_projectDir}:${_projectDir}`);
    }

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
      const containerName = _prefixedName(name);
      const result = execFileSync(
        'docker', ['inspect', '--format', '{{.State.Running}}', containerName],
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
      execFileSync('docker', ['rm', '-f', _prefixedName(name)], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* container may not exist */ }
  },

  listWorkers() {
    try {
      const { execFileSync } = require('child_process');
      const label = _projectHash ? _projectLabel() : 'mac10-worker=true';
      const out = execFileSync(
        'docker', ['ps', '--filter', `label=${label}`, '--format', '{{.Names}}'],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      if (!out) return [];
      const prefix = _projectHash ? `${_namespace}-${_projectHash}-` : '';
      return out.split('\n').filter(Boolean).map(n => prefix && n.startsWith(prefix) ? n.slice(prefix.length) : n);
    } catch {
      return [];
    }
  },

  getWorkerPid(name) {
    try {
      const { execFileSync } = require('child_process');
      const pid = execFileSync(
        'docker', ['inspect', '--format', '{{.State.Pid}}', _prefixedName(name)],
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
        'docker', ['logs', '--tail', String(lines), _prefixedName(name)],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
    } catch {
      return '';
    }
  },
};

// ---------------------------------------------------------------------------
// Microsandbox backend — hardware-isolated microVMs via msb CLI
// Docs: https://microsandbox.dev
// ---------------------------------------------------------------------------

const sandboxBackend = {
  name: 'sandbox',

  isAvailable() {
    try {
      const { execFileSync } = require('child_process');
      // msb server must be running; --dev mode skips auth
      execFileSync('msb', ['server', 'status'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },

  createWorker(name, cmd, cwd, envVars) {
    const { execFileSync } = require('child_process');

    // Stop any existing sandbox with this name
    try {
      execFileSync('msb', ['down', name, '-f', getSandboxfilePath()], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* may not exist */ }

    // Use msb run with Sandboxfile component; -d for detached, -e to override start script
    const args = ['run', name, '-f', getSandboxfilePath(), '-d', '-e', cmd];

    execFileSync('msb', args, { encoding: 'utf8', timeout: 30000, stdio: 'pipe' });
  },

  isWorkerAlive(name) {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(
        'msb', ['status', name, '-f', getSandboxfilePath()],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      return out.includes('RUNNING');
    } catch {
      return false;
    }
  },

  killWorker(name) {
    try {
      const { execFileSync } = require('child_process');
      execFileSync('msb', ['down', name, '-f', getSandboxfilePath()], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
    } catch { /* sandbox may not exist */ }
  },

  listWorkers() {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(
        'msb', ['status', '-f', getSandboxfilePath()],
        { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
      ).trim();
      if (!out) return [];
      // Parse status table output — skip header lines (SANDBOX STATUS ...),
      // then extract name (col 0) for worker-* rows
      const lines = out.split('\n');
      return lines
        .slice(2) // skip header + separator
        .map(line => line.trim().split(/\s+/)[0])
        .filter(n => n && n.startsWith('worker-'));
    } catch {
      return [];
    }
  },

  getWorkerPid() {
    // MicroVMs run separate kernels — no host PID exposure
    return null;
  },

  captureOutput(name, lines = 50) {
    try {
      const { execFileSync } = require('child_process');
      return execFileSync(
        'msb', ['log', name, '-f', getSandboxfilePath(), '-t', String(lines)],
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

// Default export is the active backend (backward compatible)
module.exports = activeBackend;

// Expose individual backends for hybrid per-worker selection
module.exports.getBackend = function(name) {
  return backends[name] || null;
};
module.exports.backends = backends;

// Multi-project isolation: set project context for Docker/sandbox container naming
module.exports.setProjectContext = setProjectContext;
