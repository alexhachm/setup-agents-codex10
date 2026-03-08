'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const REGISTRY_PATH = path.join(os.tmpdir(), 'mac10-instances.json');
const LOCK_PATH = REGISTRY_PATH + '.lock';
const LOCK_STALE_MS = 10000;

function acquireLock() {
  const deadline = Date.now() + LOCK_STALE_MS;
  while (Date.now() < deadline) {
    try {
      fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      // Check if lock is stale
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
  // Force remove stale lock as last resort
  try { fs.unlinkSync(LOCK_PATH); } catch {}
  return false;
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_PATH); } catch {}
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
  acquireLock();
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
    releaseLock();
  }
}

function deregister(port) {
  acquireLock();
  try {
    const entries = readRegistry().filter(e => e.port !== port);
    writeRegistry(entries);
  } finally {
    releaseLock();
  }
}

function list() {
  acquireLock();
  try {
    const entries = readRegistry();
    const alive = entries.filter(e => isPidAlive(e.pid));
    const normalized = alive.map((e) => ({
      ...e,
      namespace: normalizeNamespace(e.namespace),
    }));
    if (alive.length !== entries.length) {
      writeRegistry(normalized);
    }
    return normalized;
  } finally {
    releaseLock();
  }
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

module.exports = { register, deregister, list, findByProject, acquirePort, REGISTRY_PATH };
