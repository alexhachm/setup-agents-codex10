'use strict';

/**
 * Netlify deployment adapter.
 */

const { execFileSync } = require('child_process');

function isAvailable() {
  try {
    execFileSync('which', ['netlify'], { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function deploy(projectDir, opts = {}) {
  const args = ['deploy'];
  if (opts.production) args.push('--prod');
  if (opts.dir) args.push('--dir', opts.dir);

  try {
    const output = execFileSync('netlify', args, {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 300000,
    });
    return { provider: 'netlify', output: output.trim(), production: !!opts.production, status: 'deployed' };
  } catch (err) {
    return { provider: 'netlify', error: err.message, status: 'failed' };
  }
}

function preview(projectDir, opts = {}) {
  return deploy(projectDir, { ...opts, production: false });
}

module.exports = { isAvailable, deploy, preview, name: 'netlify' };
