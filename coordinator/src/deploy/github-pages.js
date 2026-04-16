'use strict';

/**
 * GitHub Pages deployment adapter.
 */

const { execFileSync } = require('child_process');

function isAvailable() {
  try {
    execFileSync('which', ['gh'], { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function deploy(projectDir, opts = {}) {
  const branch = opts.branch || 'gh-pages';
  const dir = opts.dir || 'dist';

  try {
    // Ensure gh-pages branch exists and push
    execFileSync('git', ['checkout', '--orphan', branch], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 30000,
    });
    execFileSync('git', ['add', '-A'], { cwd: projectDir, encoding: 'utf-8' });
    execFileSync('git', ['commit', '-m', 'Deploy to GitHub Pages'], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 30000,
    });
    execFileSync('git', ['push', 'origin', branch, '--force'], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 60000,
    });

    return { provider: 'github-pages', branch, status: 'deployed' };
  } catch (err) {
    return { provider: 'github-pages', error: err.message, status: 'failed' };
  }
}

function preview(projectDir, opts = {}) {
  return { provider: 'github-pages', note: 'GitHub Pages does not support preview deployments', status: 'unsupported' };
}

module.exports = { isAvailable, deploy, preview, name: 'github-pages' };
