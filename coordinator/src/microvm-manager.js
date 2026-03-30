'use strict';

/**
 * MicroVM Manager — microsandbox (msb) server lifecycle and sandbox management.
 *
 * Parallel to sandbox-manager.js (Docker), this module handles:
 *   - msb server availability and startup
 *   - OCI image pulling
 *   - Sandbox status, listing, and cleanup
 */

const { execFileSync, execFile } = require('child_process');
const db = require('./db');

const DEFAULT_IMAGE = 'node:20';

function isMsbInstalled() {
  try {
    execFileSync('msb', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isServerRunning() {
  try {
    execFileSync('msb', ['server', 'status'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function startServer() {
  if (isServerRunning()) return;
  // Start server in dev mode (no API key required) and detach
  execFile('msb', ['server', 'start', '--dev', '--detach'], {
    encoding: 'utf8',
    timeout: 15000,
    stdio: 'pipe',
  }, (err) => {
    if (err) {
      db.log('coordinator', 'msb_server_start_error', { error: err.message });
    }
  });
  db.log('coordinator', 'msb_server_started', {});
}

function pullImage(image) {
  image = image || DEFAULT_IMAGE;
  try {
    execFileSync('msb', ['pull', image], {
      encoding: 'utf8',
      timeout: 300000, // 5 min for large images
      stdio: 'pipe',
    });
    db.log('coordinator', 'msb_image_pulled', { image });
    return true;
  } catch (e) {
    db.log('coordinator', 'msb_image_pull_error', { image, error: e.message });
    return false;
  }
}

function isAvailable() {
  return isMsbInstalled() && isServerRunning();
}

function ensureReady() {
  if (!isMsbInstalled()) {
    throw new Error('msb CLI is not installed. Install via: curl -sSL https://get.microsandbox.dev | sh');
  }
  if (!isServerRunning()) {
    startServer();
    // Give the server a moment to start
    try {
      execFileSync('sleep', ['2'], { timeout: 5000 });
    } catch {}
    if (!isServerRunning()) {
      throw new Error('msb server failed to start. Run manually: msb server start --dev');
    }
  }
}

function listSandboxes() {
  try {
    const out = execFileSync(
      'msb', ['ps'],
      { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
    ).trim();
    if (!out) return [];
    return out.split('\n')
      .filter(Boolean)
      .map(line => {
        const parts = line.trim().split(/\s+/);
        return { name: parts[0], status: parts[1] || 'unknown' };
      });
  } catch {
    return [];
  }
}

function stopSandbox(name) {
  try {
    execFileSync('msb', ['stop', name], {
      encoding: 'utf8', timeout: 10000, stdio: 'pipe',
    });
  } catch { /* may not exist */ }
}

function cleanupAll() {
  const sandboxes = listSandboxes().filter(s => s.name.startsWith('worker-'));
  for (const s of sandboxes) {
    stopSandbox(s.name);
  }
  db.log('coordinator', 'msb_cleanup_all', { stopped: sandboxes.length });
  return sandboxes.length;
}

function getStatus() {
  const installed = isMsbInstalled();
  const serverRunning = installed ? isServerRunning() : false;
  const sandboxes = serverRunning ? listSandboxes() : [];
  const workerSandboxes = sandboxes.filter(s => s.name.startsWith('worker-'));

  return {
    msb_installed: installed,
    server_running: serverRunning,
    sandboxes: workerSandboxes,
    total_sandboxes: sandboxes.length,
    default_image: DEFAULT_IMAGE,
  };
}

module.exports = {
  isMsbInstalled,
  isServerRunning,
  startServer,
  pullImage,
  isAvailable,
  ensureReady,
  listSandboxes,
  stopSandbox,
  cleanupAll,
  getStatus,
  DEFAULT_IMAGE,
};
