'use strict';

const { execFileSync } = require('child_process');
const db = require('./db');

const DEFAULT_INTERVAL_MS = 300000; // 5 minutes

let intervalId = null;
let _projectDir = null;

/**
 * Run a git command in the given directory, returning trimmed stdout or null on error.
 */
function runGit(args, cwd) {
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output || '').trim();
  } catch {
    return null;
  }
}

/**
 * Returns true if the root worktree is clean (no dirty files, no staged changes).
 */
function isWorktreeClean(cwd) {
  const status = runGit(['status', '--porcelain'], cwd);
  if (status === null) return false; // git failed — treat as dirty
  return status.length === 0;
}

/**
 * Detect the default remote branch (origin/main or origin/master).
 */
function detectDefaultBranch(cwd) {
  // Try HEAD ref from remote
  const remoteHead = runGit(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd);
  if (remoteHead) {
    // e.g. "origin/main" → "main"
    const parts = remoteHead.split('/');
    if (parts.length >= 2) return parts[parts.length - 1];
  }
  // Fallback: check if origin/main exists
  const mainCheck = runGit(['rev-parse', '--verify', 'origin/main'], cwd);
  if (mainCheck) return 'main';
  const masterCheck = runGit(['rev-parse', '--verify', 'origin/master'], cwd);
  if (masterCheck) return 'master';
  return 'main';
}

/**
 * Perform one fetch cycle: always fetch, then conditionally rebase if clean.
 */
function syncTick(projectDir) {
  const cwd = projectDir;

  // Step 1: Fetch from origin
  try {
    execFileSync('git', ['fetch', 'origin'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    db.log('auto-sync', 'fetch_ok', { cwd });
  } catch (e) {
    db.log('auto-sync', 'fetch_error', { cwd, error: e.message });
    return; // Don't attempt rebase if fetch failed
  }

  // Step 2: Conditionally rebase if worktree is clean
  if (!isWorktreeClean(cwd)) {
    db.log('auto-sync', 'rebase_skipped_dirty', { cwd });
    return;
  }

  const branch = detectDefaultBranch(cwd);
  try {
    execFileSync('git', ['pull', '--rebase', 'origin', branch], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    db.log('auto-sync', 'rebase_ok', { cwd, branch });
  } catch (e) {
    // Abort any failed rebase to leave the worktree clean
    try {
      execFileSync('git', ['rebase', '--abort'], { cwd, stdio: 'ignore' });
    } catch {}
    db.log('auto-sync', 'rebase_error', { cwd, branch, error: e.message });
  }
}

function start(projectDir) {
  _projectDir = projectDir;
  const intervalMs = parseInt(db.getConfig('auto_sync_interval_ms')) || DEFAULT_INTERVAL_MS;

  intervalId = setInterval(() => {
    try {
      syncTick(_projectDir);
    } catch (e) {
      db.log('auto-sync', 'tick_error', { error: e.message });
    }
  }, intervalMs);

  db.log('auto-sync', 'started', { interval_ms: intervalMs });
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  _projectDir = null;
}

module.exports = { start, stop, syncTick, isWorktreeClean, detectDefaultBranch };
