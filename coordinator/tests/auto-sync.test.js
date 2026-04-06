'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const autoSync = require('../src/auto-sync');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-autosync-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  autoSync.stop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('auto-sync start/stop', () => {
  it('starts and stops without error', () => {
    assert.doesNotThrow(() => {
      autoSync.start(tmpDir);
      autoSync.stop();
    });
  });

  it('uses config override for interval', () => {
    db.setConfig('auto_sync_interval_ms', '60000');
    // Just verify start/stop works with config override
    assert.doesNotThrow(() => {
      autoSync.start(tmpDir);
      autoSync.stop();
    });
  });
});

describe('isWorktreeClean', () => {
  it('returns false for a non-git directory', () => {
    const { isWorktreeClean } = autoSync;
    // tmpDir has no git repo — git status will fail
    const result = isWorktreeClean(tmpDir);
    assert.strictEqual(result, false);
  });
});

describe('detectDefaultBranch', () => {
  it('returns a string branch name', () => {
    const { detectDefaultBranch } = require('../src/auto-sync');
    // Running against the actual repo — should return "main" or "master"
    const repoRoot = path.resolve(__dirname, '..', '..');
    const branch = detectDefaultBranch(repoRoot);
    assert.ok(typeof branch === 'string' && branch.length > 0);
  });
});

describe('syncTick', () => {
  it('handles non-git directory gracefully (fetch error)', () => {
    const { syncTick } = autoSync;
    // Should not throw — logs error and returns
    assert.doesNotThrow(() => syncTick(tmpDir));
  });

  it('skips rebase when worktree is dirty', () => {
    // Create a real git repo with a dirty file
    const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-git-'));
    try {
      const { execFileSync } = require('child_process');
      execFileSync('git', ['init'], { cwd: gitDir, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: gitDir, stdio: 'ignore' });
      // Create initial commit
      fs.writeFileSync(path.join(gitDir, 'README.md'), 'hello');
      execFileSync('git', ['add', '.'], { cwd: gitDir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: gitDir, stdio: 'ignore' });
      // Dirty file
      fs.writeFileSync(path.join(gitDir, 'dirty.txt'), 'change');

      const { isWorktreeClean } = autoSync;
      assert.strictEqual(isWorktreeClean(gitDir), false);
    } finally {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
  });

  it('reports clean worktree when no changes', () => {
    const gitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-git2-'));
    try {
      const { execFileSync } = require('child_process');
      execFileSync('git', ['init'], { cwd: gitDir, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: gitDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(gitDir, 'README.md'), 'hello');
      execFileSync('git', ['add', '.'], { cwd: gitDir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: gitDir, stdio: 'ignore' });

      const { isWorktreeClean } = autoSync;
      assert.strictEqual(isWorktreeClean(gitDir), true);
    } finally {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
  });
});
