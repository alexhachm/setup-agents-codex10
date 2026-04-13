'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const providerOutput = require('./provider-output');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const REQUIRED_MANIFEST_FIELDS = ['schema_version', 'id', 'cli', 'launch', 'output'];
const REQUIRED_LAUNCH_MODES = ['interactive', 'noninteractive'];

function check(name, ok, detail = null) {
  const entry = { name, ok: ok === null ? null : Boolean(ok) };
  if (detail !== null && detail !== undefined) entry.detail = detail;
  return entry;
}

function resolveEnablementContext(options = {}) {
  const projectDir = options.projectDir || REPO_ROOT;
  const pluginRoot = options.pluginRoot
    || process.env.MAC10_PROVIDER_PLUGIN_ROOT
    || path.join(REPO_ROOT, 'plugins', 'agents');
  const provider = providerOutput.normalizeProviderId(
    options.provider || process.env.MAC10_AGENT_PROVIDER || 'claude'
  );
  const manifestFile = providerOutput.findProviderManifest(provider, {
    pluginRoot,
    projectDir,
  });
  return { provider, projectDir, pluginRoot, manifestFile };
}

function loadManifestSafe(manifestFile) {
  if (!manifestFile) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (_err) {
    return null;
  }
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, missing: ['<manifest>'] };
  }
  const missing = REQUIRED_MANIFEST_FIELDS.filter((field) => !(field in manifest));
  if (!missing.length && manifest.launch) {
    for (const mode of REQUIRED_LAUNCH_MODES) {
      const modeCfg = manifest.launch[mode];
      if (!modeCfg || !Array.isArray(modeCfg.args)) {
        missing.push(`launch.${mode}.args`);
      }
    }
  }
  return { ok: missing.length === 0, missing };
}

function cliAvailable(command) {
  if (!command) return false;
  try {
    execFileSync('bash', ['-lc', `command -v ${JSON.stringify(command)} >/dev/null 2>&1`], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch (_err) {
    return false;
  }
}

function runAuthCheck(manifest) {
  const command = (manifest.cli && (manifest.cli.auth_check?.command || manifest.cli.command)) || null;
  if (!command) return { ok: false, reason: 'no-auth-command' };
  if (!cliAvailable(command)) return { ok: false, reason: 'cli-missing' };
  const args = Array.isArray(manifest.cli.auth_check?.args)
    ? manifest.cli.auth_check.args.filter((a) => typeof a === 'string')
    : [];
  try {
    execFileSync(command, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `exit:${err.status ?? 'unknown'}` };
  }
}

function validateLaunchArgsShape(manifest) {
  const details = {};
  let ok = true;
  for (const mode of REQUIRED_LAUNCH_MODES) {
    const args = manifest.launch?.[mode]?.args;
    if (!Array.isArray(args) || args.length === 0) {
      ok = false;
      details[mode] = 'empty';
      continue;
    }
    details[mode] = args.length;
  }
  return { ok, details };
}

function validateOutputSchema(manifest, options) {
  const formats = manifest.output?.usage_payloads;
  if (!Array.isArray(formats) || formats.length === 0) {
    return { ok: false, reason: 'missing usage_payloads' };
  }
  try {
    const usageConfig = providerOutput.getUsageConfig({
      projectDir: options.projectDir,
      provider: options.provider,
      pluginRoot: options.pluginRoot,
    });
    if (!usageConfig || !Array.isArray(usageConfig.formats) || usageConfig.formats.length === 0) {
      return { ok: false, reason: 'empty usage config' };
    }
    return { ok: true, formats: usageConfig.formats };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function validateProvider(options = {}) {
  const ctx = resolveEnablementContext(options);
  const checks = [];

  if (!ctx.manifestFile || !fs.existsSync(ctx.manifestFile)) {
    checks.push(check('manifest_found', false, { provider: ctx.provider }));
    return { provider: ctx.provider, manifestFile: null, enabled: false, ok: false, checks };
  }
  checks.push(check('manifest_found', true, { file: ctx.manifestFile }));

  const manifest = loadManifestSafe(ctx.manifestFile);
  const shape = validateManifestShape(manifest);
  checks.push(check('manifest_shape', shape.ok, shape.ok ? null : { missing: shape.missing }));
  if (!shape.ok) {
    return { provider: ctx.provider, manifestFile: ctx.manifestFile, enabled: false, ok: false, checks };
  }

  const enabled = manifest.enabled !== false;
  checks.push(check('manifest_enabled', enabled, {
    enabled,
    status: manifest.enablement?.status || (enabled ? 'enabled' : 'disabled'),
  }));

  const launchShape = validateLaunchArgsShape(manifest);
  checks.push(check('launch_args_shape', launchShape.ok, launchShape.details));

  const outputSchema = validateOutputSchema(manifest, ctx);
  checks.push(check('output_usage_schema', outputSchema.ok, outputSchema.ok
    ? { formats: outputSchema.formats }
    : { reason: outputSchema.reason }));

  if (options.runtime === true) {
    const cliCmd = manifest.cli?.command || null;
    checks.push(check('cli_available', cliAvailable(cliCmd), { command: cliCmd }));
    const auth = runAuthCheck(manifest);
    checks.push(check('auth_check', auth.ok, auth.ok ? null : { reason: auth.reason }));
  } else {
    checks.push(check('cli_available', null, { skipped: 'runtime=false' }));
    checks.push(check('auth_check', null, { skipped: 'runtime=false' }));
  }

  const staticOk = checks
    .filter((c) => !['cli_available', 'auth_check', 'manifest_enabled'].includes(c.name))
    .every((c) => c.ok === true);

  let runtimeOk = true;
  if (options.runtime === true) {
    runtimeOk = checks
      .filter((c) => ['cli_available', 'auth_check'].includes(c.name))
      .every((c) => c.ok === true);
  }

  return {
    provider: ctx.provider,
    manifestFile: ctx.manifestFile,
    enabled,
    ok: staticOk && (enabled ? runtimeOk : true),
    checks,
  };
}

function formatReport(result) {
  const lines = [];
  lines.push(`provider=${result.provider}`);
  lines.push(`manifest=${result.manifestFile || 'missing'}`);
  lines.push(`enabled=${result.enabled}`);
  lines.push(`ok=${result.ok}`);
  for (const c of result.checks) {
    const status = c.ok === null ? 'SKIP' : c.ok ? 'PASS' : 'FAIL';
    lines.push(`  ${status} ${c.name}${c.detail ? ' ' + JSON.stringify(c.detail) : ''}`);
  }
  return lines.join('\n');
}

module.exports = {
  validateProvider,
  formatReport,
  REQUIRED_MANIFEST_FIELDS,
  REQUIRED_LAUNCH_MODES,
};
