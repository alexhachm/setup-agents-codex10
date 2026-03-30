'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { mock } = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../src/db');

// Mock child_process and db before requiring sandbox-manager
const originalExecFileSync = require('child_process').execFileSync;
let execFileSyncMock = null;
let tmpDir = null;

describe('sandbox-manager', () => {
  let sandboxManager;
  let childProcess;

  beforeEach(() => {
    // Clear module cache so each test gets fresh state
    delete require.cache[require.resolve('../src/sandbox-manager')];
    childProcess = require('child_process');
  });

  afterEach(() => {
    if (execFileSyncMock) {
      execFileSyncMock.mock.restore();
      execFileSyncMock = null;
    }
    delete require.cache[require.resolve('../src/sandbox-manager')];
    if (tmpDir) {
      try { db.close(); } catch (_) {}
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  describe('isDockerAvailable', () => {
    it('returns true when docker info succeeds', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'info') return '';
        return originalExecFileSync(cmd, args);
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.isDockerAvailable(), true);
    });

    it('returns false when docker info fails', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'info') throw new Error('docker not found');
        return originalExecFileSync(cmd, args);
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.isDockerAvailable(), false);
    });
  });

  describe('isImageBuilt', () => {
    it('returns true when image exists in docker images output', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'images') return 'mac10-worker:latest\n';
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.isImageBuilt(), true);
    });

    it('returns false when image not in output', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'images') return '\n';
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.isImageBuilt(), false);
    });

    it('returns false when docker command fails', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('docker not available');
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.isImageBuilt(), false);
    });
  });

  describe('getContainerStatus', () => {
    it('returns running for a running container', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'inspect') return 'running';
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.getContainerStatus('worker-1'), 'running');
    });

    it('returns stopped for an exited container', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'inspect') return 'exited';
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.getContainerStatus('worker-1'), 'stopped');
    });

    it('returns missing when inspect fails', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('No such container');
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.strictEqual(sandboxManager.getContainerStatus('worker-1'), 'missing');
    });
  });

  describe('listContainers', () => {
    it('parses docker ps output into name/status pairs', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'ps') {
          return 'worker-1\trunning\nworker-3\texited\n';
        }
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      const containers = sandboxManager.listContainers();
      assert.deepStrictEqual(containers, [
        { name: 'worker-1', status: 'running' },
        { name: 'worker-3', status: 'exited' },
      ]);
    });

    it('returns empty array when no containers', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'ps') return '';
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.deepStrictEqual(sandboxManager.listContainers(), []);
    });

    it('returns empty array when docker fails', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', () => {
        throw new Error('docker not available');
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.deepStrictEqual(sandboxManager.listContainers(), []);
    });
  });

  describe('ensureReady', () => {
    it('throws when Docker is not available', () => {
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker' && args[0] === 'info') throw new Error('not found');
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      assert.throws(() => sandboxManager.ensureReady('/tmp/test'), /Docker is not available/);
    });
  });

  describe('getStatus', () => {
    it('returns full status when Docker is unavailable', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-sandbox-'));
      db.init(tmpDir);
      execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args) => {
        if (cmd === 'docker') throw new Error('not found');
        return '';
      });
      sandboxManager = require('../src/sandbox-manager');
      const status = sandboxManager.getStatus(tmpDir);
      assert.strictEqual(status.docker_available, false);
      assert.strictEqual(status.image_built, false);
      assert.deepStrictEqual(status.containers, []);
      assert.strictEqual(status.auto_sandbox_enabled, true);
      assert.strictEqual(status.mode, 'tmux-fallback');
    });
  });
});
