'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

function readPidFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const pid = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
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

function processArgs(pid) {
  if (!isPidAlive(pid)) return '';
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'args='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function pidMatches(pid, token) {
  const args = processArgs(pid);
  return Boolean(args && args.includes(token));
}

function stateDir(projectDir) {
  return path.join(projectDir, '.claude', 'state');
}

function sentinelPidFile(projectDir) {
  return path.join(stateDir(projectDir), 'research-sentinel.pid');
}

function driverLockFile(projectDir) {
  return path.join(stateDir(projectDir), 'research-driver.lock');
}

function findScript(projectDir) {
  const candidates = [
    path.join(projectDir, '.claude', 'scripts', 'research-sentinel.sh'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getRuntimeStatus(projectDir) {
  const sentinelPid = readPidFile(sentinelPidFile(projectDir));
  const driverPid = readPidFile(driverLockFile(projectDir));
  const sentinelRunning = sentinelPid !== null
    && isPidAlive(sentinelPid)
    && pidMatches(sentinelPid, 'research-sentinel.sh');
  const driverRunning = driverPid !== null
    && isPidAlive(driverPid)
    && pidMatches(driverPid, 'chatgpt-driver.py');
  return {
    sentinel_pid: sentinelRunning ? sentinelPid : null,
    driver_pid: driverRunning ? driverPid : null,
    sentinel_running: sentinelRunning,
    driver_running: driverRunning,
    running: sentinelRunning || driverRunning,
  };
}

function ensureResearchDriver(projectDir, { env = process.env } = {}) {
  const before = getRuntimeStatus(projectDir);
  if (before.running) {
    return { ok: true, started: false, ...before };
  }

  const script = findScript(projectDir);
  if (!script) {
    return {
      ok: false,
      started: false,
      error: 'research sentinel script not found',
      ...before,
    };
  }

  fs.mkdirSync(stateDir(projectDir), { recursive: true });
  try {
    fs.rmSync(path.join(stateDir(projectDir), 'research-sentinel.lock'), { recursive: true, force: true });
  } catch {}

  const child = spawn('bash', [script, projectDir], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    env: { ...env },
  });
  child.unref();

  return {
    ok: true,
    started: true,
    sentinel_pid: child.pid || null,
    driver_pid: null,
    sentinel_running: Boolean(child.pid),
    driver_running: false,
    running: Boolean(child.pid),
  };
}

module.exports = {
  ensureResearchDriver,
  getRuntimeStatus,
  isPidAlive,
  readPidFile,
};
