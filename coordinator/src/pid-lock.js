'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Check whether a process with the given PID is alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a PID lock object for the given state directory and namespace.
 *
 * @param {string} stateDir  - path to the `.claude/state` directory
 * @param {string} namespace - coordinator namespace (default: 'mac10')
 * @returns {{ acquire(): boolean, release(): void, pidFile: string }}
 */
function makeLock(stateDir, namespace = 'mac10') {
  const pidFile = path.join(
    stateDir,
    namespace === 'mac10' ? 'mac10.pid' : `${namespace}.pid`
  );
  let ownsPidLock = false;

  /**
   * Try to acquire the PID lock for the current process.
   * Returns true on success, false when another live process already holds it.
   */
  function acquire() {
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
          return false;
        }
        // Stale lock — remove and retry
        try { fs.unlinkSync(pidFile); } catch {}
      }
    }
    return false;
  }

  /**
   * Release the PID lock if this process owns it.
   */
  function release() {
    if (!ownsPidLock) return;
    try {
      const current = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (current === process.pid) fs.unlinkSync(pidFile);
    } catch {}
    ownsPidLock = false;
  }

  return { acquire, release, pidFile };
}

module.exports = { isPidAlive, makeLock };
