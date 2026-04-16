'use strict';

/**
 * Vercel deployment adapter.
 */

const { execFileSync } = require('child_process');
const settingsManager = require('../settings-manager');

function isAvailable() {
  try {
    execFileSync('which', ['vercel'], { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function deploy(projectDir, opts = {}) {
  const args = ['deploy'];
  if (opts.production) args.push('--prod');
  if (opts.token) args.push('--token', opts.token);

  try {
    const output = execFileSync('vercel', args, {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 300000,
    });
    const url = output.trim().split('\n').pop();
    return { provider: 'vercel', url, production: !!opts.production, status: 'deployed' };
  } catch (err) {
    return { provider: 'vercel', error: err.message, status: 'failed' };
  }
}

function preview(projectDir, opts = {}) {
  return deploy(projectDir, { ...opts, production: false });
}

module.exports = { isAvailable, deploy, preview, name: 'vercel' };
