'use strict';

/**
 * Codex provider plugin — wraps the Codex CLI for dev-mode workers.
 */

const { execFileSync } = require('child_process');

const PROVIDER_NAME = 'codex';
const DEFAULT_MODELS = {
  fast: 'gpt-5.3-codex-spark',
  deep: 'gpt-5.3-codex',
  economy: 'gpt-5.1-codex-mini',
};

function isAvailable() {
  try {
    execFileSync('which', ['codex'], { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function getDefaultModel(tier) {
  return DEFAULT_MODELS[tier] || DEFAULT_MODELS.fast;
}

function buildCommand(model, prompt, opts = {}) {
  const args = ['exec'];
  if (model) args.push('--model', model);
  if (opts.dangerouslyBypass) args.push('--dangerously-bypass-approvals-and-sandbox');
  args.push(prompt);
  return { cmd: 'codex', args };
}

module.exports = {
  name: PROVIDER_NAME,
  isAvailable,
  getDefaultModel,
  buildCommand,
  DEFAULT_MODELS,
};
