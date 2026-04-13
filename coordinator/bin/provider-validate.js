#!/usr/bin/env node
'use strict';

const path = require('path');
const { validateProvider, formatReport } = require('../src/provider-enablement');

function parseArgs(argv) {
  const opts = { runtime: false, json: false, provider: null, projectDir: null };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--runtime') opts.runtime = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--provider') opts.provider = argv[++i];
    else if (a === '--project-dir') opts.projectDir = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write('Usage: provider-validate [--provider ID] [--project-dir DIR] [--runtime] [--json]\n');
      process.exit(0);
    } else positional.push(a);
  }
  if (!opts.provider && positional[0]) opts.provider = positional[0];
  if (!opts.projectDir && positional[1]) opts.projectDir = positional[1];
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const projectDir = opts.projectDir
    ? path.resolve(opts.projectDir)
    : process.cwd();
  const result = validateProvider({
    provider: opts.provider,
    projectDir,
    runtime: opts.runtime,
  });
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    process.stdout.write(formatReport(result) + '\n');
  }
  process.exit(result.ok ? 0 : 1);
}

main();
