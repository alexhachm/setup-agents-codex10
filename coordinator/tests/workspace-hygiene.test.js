'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const hygiene = require('../src/workspace-hygiene');

let tmpDir;

function runGit(args, cwd = tmpDir) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function initRepoWithOrigin({ trackMetadata = false } = {}) {
  runGit(['init', '--initial-branch=main']);
  runGit(['config', 'user.email', 'workspace-hygiene@example.com']);
  runGit(['config', 'user.name', 'Workspace Hygiene Tests']);

  fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.claude/state/\norigin.git/\n');
  fs.writeFileSync(path.join(tmpDir, 'README.md'), 'baseline\n');
  if (trackMetadata) {
    const metadataPath = path.join(tmpDir, '.claude', 'knowledge', 'codebase', '.metadata.json');
    fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
    fs.writeFileSync(metadataPath, '{\n  "changes_since_index": 0\n}\n');
  }

  runGit(['add', '.']);
  runGit(['commit', '-m', 'initial commit']);

  const remotePath = path.join(tmpDir, 'origin.git');
  runGit(['init', '--bare', remotePath]);
  runGit(['remote', 'add', 'origin', remotePath]);
  runGit(['push', '-u', 'origin', 'main']);
  return remotePath;
}

function advanceOrigin(remotePath, fileName = 'remote.txt') {
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-hygiene-origin-'));
  try {
    execFileSync('git', ['clone', '--branch', 'main', remotePath, cloneDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['config', 'user.email', 'workspace-hygiene@example.com'], { cwd: cloneDir, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['config', 'user.name', 'Workspace Hygiene Tests'], { cwd: cloneDir, stdio: ['ignore', 'pipe', 'pipe'] });
    fs.writeFileSync(path.join(cloneDir, fileName), `remote update ${Date.now()}\n`);
    execFileSync('git', ['add', fileName], { cwd: cloneDir, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['commit', '-m', `advance ${fileName}`], { cwd: cloneDir, stdio: ['ignore', 'pipe', 'pipe'] });
    execFileSync('git', ['push', 'origin', 'main'], { cwd: cloneDir, stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}

describe('workspace-hygiene', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-hygiene-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('auto-cleans ephemeral runtime dirt and fast-forwards main when safe', () => {
    const remotePath = initRepoWithOrigin();
    advanceOrigin(remotePath, 'remote-fast-forward.txt');

    const runtimePath = path.join(tmpDir, '.claude', 'signals', 'research-driver.pid');
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
    fs.writeFileSync(runtimePath, '12345\n');

    const report = hygiene.evaluateWorkspace(tmpDir, { mode: 'status' });
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.result, 'fast_forwarded');
    assert.ok(report.actions.some((action) => action.type === 'cleanup_ephemeral_runtime'));
    assert.ok(report.actions.some((action) => action.type === 'fast_forward_main'));
    assert.strictEqual(fs.existsSync(runtimePath), false);
    assert.strictEqual(report.source_revision_after.behind_count, 0);
    assert.strictEqual(report.source_revision_after.dirty_worktree, false);
  });

  it('defers sync when operator source edits are present', () => {
    const remotePath = initRepoWithOrigin();
    advanceOrigin(remotePath, 'remote-blocked.txt');

    fs.appendFileSync(path.join(tmpDir, 'README.md'), 'local source edit\n');

    const report = hygiene.evaluateWorkspace(tmpDir, { mode: 'status' });
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.result, 'blocked_source_edits');
    assert.match(report.display_message, /local source edits/i);
    assert.strictEqual(report.source_revision_after.behind_count, 1);
    assert.strictEqual(report.source_revision_after.dirty_worktree, true);
  });

  it('treats tracked knowledge outputs as managed generated dirt', () => {
    initRepoWithOrigin({ trackMetadata: true });

    const metadataPath = path.join(tmpDir, '.claude', 'knowledge', 'codebase', '.metadata.json');
    fs.writeFileSync(metadataPath, '{\n  "changes_since_index": 3\n}\n');

    const report = hygiene.evaluateWorkspace(tmpDir, { mode: 'status' });
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.result, 'deferred_managed_generated');
    assert.match(report.display_message, /managed knowledge outputs/i);
    assert.deepStrictEqual(report.classification.operator_source, []);
    assert.deepStrictEqual(report.classification.unknown, []);
    assert.deepStrictEqual(report.classification.managed_generated, ['.claude/knowledge/codebase/.metadata.json']);
  });

  it('classifies tracked live artifacts and bytecode as generated artifacts', () => {
    initRepoWithOrigin();

    const liveSummaryPath = path.join(tmpDir, 'status', 'live-runs', 'run-1', 'summary.md');
    const pycachePath = path.join(tmpDir, 'scripts', '__pycache__', 'ingest.cpython-312.pyc');
    fs.mkdirSync(path.dirname(liveSummaryPath), { recursive: true });
    fs.mkdirSync(path.dirname(pycachePath), { recursive: true });
    fs.writeFileSync(liveSummaryPath, 'old generated summary\n');
    fs.writeFileSync(pycachePath, 'bytecode');
    runGit(['add', liveSummaryPath, pycachePath]);
    runGit(['commit', '-m', 'track generated artifacts']);

    fs.writeFileSync(liveSummaryPath, 'new generated summary\n');
    fs.writeFileSync(pycachePath, 'new bytecode');

    const report = hygiene.evaluateWorkspace(tmpDir, { mode: 'status' });
    assert.strictEqual(report.ok, true);
    assert.strictEqual(report.result, 'deferred_generated_artifacts');
    assert.strictEqual(report.summary.generated_artifact_count, 2);
    assert.deepStrictEqual(report.classification.operator_source, []);
    assert.deepStrictEqual(report.classification.generated_artifact.sort(), [
      'scripts/__pycache__/ingest.cpython-312.pyc',
      'status/live-runs/run-1/summary.md',
    ]);
  });
});
