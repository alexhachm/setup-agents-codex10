'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let execFileSyncMock;
let microvmManager;
let db;
let tmpDir;

// The SANDBOXFILE path that the module will resolve
const EXPECTED_SANDBOXFILE = path.resolve(__dirname, '../sandbox/Sandboxfile');

// Helper: build msb status table output
function statusTable(...rows) {
  const header = 'SANDBOX         STATUS     PIDS            CPU          MEMORY       DISK';
  const sep = '─'.repeat(80);
  const dataLines = rows.map(([name, status]) => `${name.padEnd(16)}${status.padEnd(11)}-               -            -            -`);
  return [header, sep, ...dataLines].join('\n');
}

function resetModules() {
  // Clear require cache for modules under test
  for (const key of Object.keys(require.cache)) {
    if (key.includes('microvm-manager') || key.includes('/db')) {
      delete require.cache[key];
    }
  }
}

describe('microvm-manager', () => {
  beforeEach(() => {
    resetModules();
  });

  afterEach(() => {
    if (execFileSyncMock) {
      execFileSyncMock.mock.restore();
      execFileSyncMock = null;
    }
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      tmpDir = null;
    }
    resetModules();
  });

  describe('isMsbInstalled', () => {
    it('returns true when msb --version succeeds', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === '--version') return 'msb 0.3.4\n';
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.isMsbInstalled(), true);
    });

    it('returns false when msb is not found', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('command not found: msb');
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.isMsbInstalled(), false);
    });
  });

  describe('isServerRunning', () => {
    it('returns true when msb server status succeeds', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === 'server' && args[1] === 'status') return 'running\n';
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.isServerRunning(), true);
    });

    it('returns false when server is not running', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === 'server') throw new Error('server not running');
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.isServerRunning(), false);
    });
  });

  describe('isAvailable', () => {
    it('returns true when both installed and server running', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => 'ok\n');
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.isAvailable(), true);
    });

    it('returns false when msb is not installed', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('not found');
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.isAvailable(), false);
    });
  });

  describe('ensureReady', () => {
    it('throws when msb is not installed', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('not found');
      });
      microvmManager = require('../src/microvm-manager');
      assert.throws(() => microvmManager.ensureReady(), /msb CLI is not installed/);
    });
  });

  describe('listSandboxes', () => {
    it('parses msb status table output', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === 'status' && args[1] === '-f') {
          return statusTable(['worker-1', 'RUNNING'], ['worker-2', 'RUNNING'], ['loop-1', 'RUNNING']);
        }
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      const sandboxes = microvmManager.listSandboxes();
      assert.strictEqual(sandboxes.length, 3);
      assert.strictEqual(sandboxes[0].name, 'worker-1');
      assert.strictEqual(sandboxes[0].status, 'RUNNING');
    });

    it('returns empty array when msb status fails', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('not running');
      });
      microvmManager = require('../src/microvm-manager');
      assert.deepStrictEqual(microvmManager.listSandboxes(), []);
    });

    it('returns empty array when no sandboxes exist', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === 'status') return '';
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      assert.deepStrictEqual(microvmManager.listSandboxes(), []);
    });
  });

  describe('stopSandbox', () => {
    it('calls msb down with sandboxfile', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb') {
          assert.strictEqual(args[0], 'down');
          assert.strictEqual(args[1], 'worker-1');
          assert.strictEqual(args[2], '-f');
          // args[3] is the SANDBOXFILE path
        }
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      microvmManager.stopSandbox('worker-1');
    });
  });

  describe('getStatus', () => {
    it('returns full status when msb is not installed', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('not found');
      });
      microvmManager = require('../src/microvm-manager');
      const status = microvmManager.getStatus();
      assert.strictEqual(status.msb_installed, false);
      assert.strictEqual(status.server_running, false);
      assert.deepStrictEqual(status.sandboxes, []);
    });

    it('returns running status with worker sandboxes', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === '--version') return 'msb 0.3.4\n';
        if (cmd === 'msb' && args[0] === 'server') return 'running\n';
        if (cmd === 'msb' && args[0] === 'status') {
          return statusTable(['worker-1', 'RUNNING'], ['worker-2', 'STOPPED'], ['loop-1', 'RUNNING']);
        }
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      const status = microvmManager.getStatus();
      assert.strictEqual(status.msb_installed, true);
      assert.strictEqual(status.server_running, true);
      assert.strictEqual(status.sandboxes.length, 2); // only worker-* sandboxes
      assert.strictEqual(status.total_sandboxes, 3);
    });
  });

  describe('pullImage', () => {
    it('returns true on successful pull', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-msb-'));
      db = require('../src/db');
      db.init(tmpDir);
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === 'pull') return 'Pulling node:20... done\n';
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.pullImage('node:20'), true);
    });

    it('returns false on pull failure', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-msb-'));
      db = require('../src/db');
      db.init(tmpDir);
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'msb' && args[0] === 'pull') throw new Error('network error');
        return '';
      });
      microvmManager = require('../src/microvm-manager');
      assert.strictEqual(microvmManager.pullImage('node:20'), false);
    });
  });
});
