'use strict';

/**
 * Daemon Command — mac10 daemon start/stop/status.
 * Manages mac10 as a background service using systemd (Linux) or launchd (macOS).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const pidLock = require('../pid-lock');

function readPidFile(projectDir) {
  try {
    const stateDir = path.join(projectDir, '.claude', 'state');
    const pidPath = path.join(stateDir, 'mac10.pid');
    if (!fs.existsSync(pidPath)) return null;
    const content = JSON.parse(fs.readFileSync(pidPath, 'utf8'));
    return content;
  } catch {
    return null;
  }
}

function isProcessRunning(pid) {
  if (!pid) return false;
  return pidLock.isPidAlive(pid);
}

const SERVICE_NAME = 'mac10-coordinator';
const IS_MACOS = os.platform() === 'darwin';
const IS_LINUX = os.platform() === 'linux';

function getServiceFiles() {
  const servicesDir = path.resolve(__dirname, '..', '..', '..', 'services');
  return {
    systemd: path.join(servicesDir, `${SERVICE_NAME}.service`),
    launchd: path.join(servicesDir, `com.mac10.coordinator.plist`),
  };
}

function daemonStart(opts = {}) {
  // Check if already running
  const lock = readPidFile(opts.projectDir || process.cwd());
  if (lock && isProcessRunning(lock.pid)) {
    return { ok: true, already_running: true, pid: lock.pid };
  }

  if (IS_MACOS) {
    const plistPath = getServiceFiles().launchd;
    if (!fs.existsSync(plistPath)) {
      return { ok: false, error: `Service file not found: ${plistPath}` };
    }
    try {
      execFileSync('launchctl', ['load', plistPath], { stdio: 'pipe' });
      return { ok: true, method: 'launchd' };
    } catch (err) {
      return { ok: false, error: `launchctl load failed: ${err.message}` };
    }
  }

  if (IS_LINUX) {
    const servicePath = getServiceFiles().systemd;
    if (!fs.existsSync(servicePath)) {
      return { ok: false, error: `Service file not found: ${servicePath}` };
    }
    try {
      execFileSync('systemctl', ['--user', 'start', SERVICE_NAME], { stdio: 'pipe' });
      return { ok: true, method: 'systemd' };
    } catch (err) {
      return { ok: false, error: `systemctl start failed: ${err.message}` };
    }
  }

  return { ok: false, error: `Unsupported platform: ${os.platform()}. Use Linux or macOS.` };
}

function daemonStop(opts = {}) {
  if (IS_MACOS) {
    const plistPath = getServiceFiles().launchd;
    try {
      execFileSync('launchctl', ['unload', plistPath], { stdio: 'pipe' });
      return { ok: true, method: 'launchd' };
    } catch (err) {
      return { ok: false, error: `launchctl unload failed: ${err.message}` };
    }
  }

  if (IS_LINUX) {
    try {
      execFileSync('systemctl', ['--user', 'stop', SERVICE_NAME], { stdio: 'pipe' });
      return { ok: true, method: 'systemd' };
    } catch (err) {
      return { ok: false, error: `systemctl stop failed: ${err.message}` };
    }
  }

  // Fallback: kill by PID
  const lock = pidLock.readLock(opts.projectDir || process.cwd());
  if (lock && lock.pid) {
    try {
      process.kill(lock.pid, 'SIGTERM');
      return { ok: true, method: 'pid_kill', pid: lock.pid };
    } catch (err) {
      return { ok: false, error: `Failed to kill PID ${lock.pid}: ${err.message}` };
    }
  }

  return { ok: false, error: 'No daemon process found' };
}

function daemonStatus(opts = {}) {
  const lock = readPidFile(opts.projectDir || process.cwd());
  const running = !!(lock && isProcessRunning(lock.pid));

  const status = {
    running,
    pid: lock ? lock.pid : null,
    started_at: lock ? lock.started_at : null,
    platform: os.platform(),
  };

  if (IS_MACOS) {
    status.service_method = 'launchd';
    status.service_file = getServiceFiles().launchd;
    status.service_exists = fs.existsSync(status.service_file);
  } else if (IS_LINUX) {
    status.service_method = 'systemd';
    status.service_file = getServiceFiles().systemd;
    status.service_exists = fs.existsSync(status.service_file);
  }

  return status;
}

module.exports = {
  SERVICE_NAME,
  daemonStart,
  daemonStop,
  daemonStatus,
  getServiceFiles,
};
