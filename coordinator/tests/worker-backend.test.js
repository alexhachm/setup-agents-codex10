'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { mock } = require('node:test');

const childProcess = require('child_process');
const originalExecFileSync = childProcess.execFileSync;

describe('worker-backend', () => {
  let execFileSyncMock = null;

  beforeEach(() => {
    delete require.cache[require.resolve('../src/worker-backend')];
  });

  afterEach(() => {
    if (execFileSyncMock) {
      execFileSyncMock.mock.restore();
      execFileSyncMock = null;
    }
    delete require.cache[require.resolve('../src/worker-backend')];
    delete process.env.MAC10_WORKER_IMAGE;
  });

  it('clears Docker image entrypoint when launching command workers', () => {
    const calls = [];
    execFileSyncMock = mock.method(childProcess, 'execFileSync', (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return '';
    });

    const workerBackend = require('../src/worker-backend');
    workerBackend.setProjectContext('audit', '/tmp/project');
    workerBackend.getBackend('docker').createWorker(
      'worker-1',
      'MAC10_NAMESPACE="audit" bash "/workspace/.claude/scripts/worker-sentinel.sh" 1 "/workspace"',
      '/tmp/project/.worktrees/wt-1',
      { MAC10_NAMESPACE: 'audit' }
    );

    const runCall = calls.find(call => call.cmd === 'docker' && call.args[0] === 'run');
    assert.ok(runCall, 'expected docker run to be invoked');
    const entrypointIndex = runCall.args.indexOf('--entrypoint');
    assert.notStrictEqual(entrypointIndex, -1);
    assert.strictEqual(runCall.args[entrypointIndex + 1], '');
    assert.ok(
      runCall.args.includes('/tmp/project:/tmp/project'),
      'expected the root project to be mounted for coordinator state access'
    );
    assert.deepStrictEqual(runCall.args.slice(-4), [
      'mac10-worker:latest',
      'bash',
      '-c',
      'MAC10_NAMESPACE="audit" bash "/workspace/.claude/scripts/worker-sentinel.sh" 1 "/workspace"',
    ]);
  });
});
