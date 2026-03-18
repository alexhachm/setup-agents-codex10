'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');

const REGISTRY_PATH = path.join(os.tmpdir(), 'mac10-instances.json');
const LOCK_PATH = REGISTRY_PATH + '.lock';

// LOCK_STALE_MS: age at which a held lock is considered abandoned by a crashed process.
const LOCK_STALE_MS = 10000;

// LOCK_ACQUIRE_TIMEOUT_MS: max time to wait for lock acquisition. Mutable for tests.
let LOCK_ACQUIRE_TIMEOUT_MS = 10000;

// acquireLock returns a unique ownership token on success, or null on timeout.
// No force-unlink fallback — fail-closed when lock cannot be acquired.
function acquireLock() {
  const token = `${process.pid}:${crypto.randomUUID()}`;
  const deadline = Date.now() + LOCK_ACQUIRE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK_PATH, token, { flag: 'wx' });
      return token;
    } catch {
      // Check if lock is stale (held by a crashed process)
      try {
        const stat = fs.statSync(LOCK_PATH);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(LOCK_PATH);
          continue;
        }
      } catch { continue; }
      // Brief spin wait
      const start = Date.now();
      while (Date.now() - start < 50) { /* spin */ }
    }
  }
  return null;
}

// releaseLock verifies token ownership before releasing. Non-owner calls are silently ignored.
function releaseLock(token) {
  if (!token) return;
  try {
    const content = fs.readFileSync(LOCK_PATH, 'utf8');
    if (content === token) {
      fs.unlinkSync(LOCK_PATH);
    }
    // Non-matching token: silently reject — lock remains held by its owner
  } catch { /* lock file already gone */ }
}

function readRegistry() {
  try {
    const data = fs.readFileSync(REGISTRY_PATH, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeRegistry(entries) {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2));
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeNamespace(namespace) {
  return (typeof namespace === 'string' && namespace.trim()) ? namespace.trim() : 'mac10';
}

function register({ projectDir, port, pid, name, tmuxSession, startedAt, namespace }) {
  const ns = normalizeNamespace(namespace);
  const resolvedProject = path.resolve(projectDir);
  const token = acquireLock();
  if (!token) {
    throw new Error('register: failed to acquire registry lock');
  }
  try {
    const entries = readRegistry().filter((e) => {
      const eProject = path.resolve(e.projectDir || '');
      const eNamespace = normalizeNamespace(e.namespace);
      return e.port !== port && !(eProject === resolvedProject && eNamespace === ns);
    });
    entries.push({
      projectDir,
      port,
      pid,
      name,
      tmuxSession,
      namespace: ns,
      startedAt: startedAt || new Date().toISOString(),
    });
    writeRegistry(entries);
  } finally {
    releaseLock(token);
  }
}

function deregister(port) {
  const token = acquireLock();
  if (!token) {
    throw new Error('deregister: failed to acquire registry lock');
  }
  try {
    const entries = readRegistry().filter(e => e.port !== port);
    writeRegistry(entries);
  } finally {
    releaseLock(token);
  }
}

// list() is lock-free for the read path. If stale entries need pruning, a lock is
// acquired opportunistically; pruning is skipped if the lock is unavailable rather
// than aborting the read, since callers only need a consistent snapshot.
function list() {
  const entries = readRegistry();
  const alive = entries.filter(e => isPidAlive(e.pid));
  const normalized = alive.map((e) => ({
    ...e,
    namespace: normalizeNamespace(e.namespace),
  }));
  if (alive.length !== entries.length) {
    const token = acquireLock();
    if (token) {
      try { writeRegistry(normalized); } finally { releaseLock(token); }
    }
  }
  return normalized;
}

function findByProject(dir, namespace = null) {
  const resolved = path.resolve(dir);
  const ns = namespace == null ? null : normalizeNamespace(namespace);
  return list().find((e) => {
    if (path.resolve(e.projectDir) !== resolved) return false;
    if (ns == null) return true;
    return normalizeNamespace(e.namespace) === ns;
  }) || null;
}

function probePort(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

async function acquirePort(base = 3100) {
  const entries = list();
  const usedPorts = new Set(entries.map(e => e.port));
  for (let port = base; port < base + 100; port++) {
    if (usedPorts.has(port)) continue;
    if (await probePort(port)) return port;
  }
  throw new Error('No free port found in range ' + base + '-' + (base + 99));
}

module.exports = {
  register,
  deregister,
  list,
  findByProject,
  acquirePort,
  REGISTRY_PATH,
  LOCK_PATH,
  acquireLock,
  releaseLock,
  _setLockAcquireTimeout: (ms) => { LOCK_ACQUIRE_TIMEOUT_MS = ms; },
};
