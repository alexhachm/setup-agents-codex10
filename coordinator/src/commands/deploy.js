'use strict';

/**
 * CLI commands: mac10 deploy, mac10 preview
 *
 * mac10 deploy [--provider vercel|netlify|github-pages] [--prod]
 * mac10 preview [--provider vercel|netlify]
 */

const path = require('path');

const PROVIDERS = {
  vercel: () => require('../deploy/vercel'),
  netlify: () => require('../deploy/netlify'),
  'github-pages': () => require('../deploy/github-pages'),
};

function runDeploy(args, projectDir) {
  const opts = parseArgs(args);
  const providerName = opts.provider || detectProvider(projectDir);

  if (!providerName || !PROVIDERS[providerName]) {
    return { error: `Unknown deploy provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}` };
  }

  const provider = PROVIDERS[providerName]();
  if (!provider.isAvailable()) {
    return { error: `${providerName} CLI is not installed` };
  }

  return provider.deploy(projectDir, {
    production: opts.prod || opts.production,
    dir: opts.dir,
    token: opts.token,
  });
}

function runPreview(args, projectDir) {
  const opts = parseArgs(args);
  const providerName = opts.provider || detectProvider(projectDir);

  if (!providerName || !PROVIDERS[providerName]) {
    return { error: `Unknown deploy provider: ${providerName}` };
  }

  const provider = PROVIDERS[providerName]();
  if (!provider.isAvailable()) {
    return { error: `${providerName} CLI is not installed` };
  }

  return provider.preview(projectDir, { dir: opts.dir });
}

function detectProvider(projectDir) {
  const fs = require('fs');
  if (fs.existsSync(path.join(projectDir, 'vercel.json'))) return 'vercel';
  if (fs.existsSync(path.join(projectDir, 'netlify.toml'))) return 'netlify';
  return 'vercel'; // Default
}

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && args[i + 1]) { opts.provider = args[++i]; continue; }
    if (args[i] === '--dir' && args[i + 1]) { opts.dir = args[++i]; continue; }
    if (args[i] === '--token' && args[i + 1]) { opts.token = args[++i]; continue; }
    if (args[i] === '--prod' || args[i] === '--production') { opts.prod = true; continue; }
  }
  return opts;
}

function listProviders() {
  return Object.keys(PROVIDERS).map(name => {
    try {
      const provider = PROVIDERS[name]();
      return { name, available: provider.isAvailable() };
    } catch {
      return { name, available: false };
    }
  });
}

module.exports = { runDeploy, runPreview, listProviders, detectProvider };
