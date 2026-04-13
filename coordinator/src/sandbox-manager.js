'use strict';

/**
 * Sandbox Manager — Docker image lifecycle and container health management.
 *
 * Handles building the mac10-worker Docker image, checking container status,
 * and managing sandbox containers for workers that need isolated environments
 * (UI tasks, visual testing, security isolation).
 */

const path = require('path');
const { execFileSync } = require('child_process');
const db = require('./db');

const DEFAULT_IMAGE_NAME = 'mac10-worker:latest';
const DOCKERFILE_PATH = 'sandbox/Dockerfile.worker';

function logSandboxEvent(action, details = {}) {
  try {
    db.log('coordinator', action, details);
  } catch {
    // Some focused unit tests exercise this module without initializing DB.
  }
}

function isDockerAvailable() {
  try {
    execFileSync('docker', ['info'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isImageBuilt(imageName) {
  imageName = imageName || DEFAULT_IMAGE_NAME;
  try {
    const out = execFileSync(
      'docker', ['images', '--format', '{{.Repository}}:{{.Tag}}', imageName],
      { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
    ).trim();
    return out.split('\n').some(line => line.trim() === imageName);
  } catch {
    return false;
  }
}

function buildImage(projectDir) {
  const dockerfilePath = path.join(projectDir, DOCKERFILE_PATH);
  logSandboxEvent('sandbox_image_build_start', { image: DEFAULT_IMAGE_NAME, dockerfile: dockerfilePath });
  try {
    execFileSync('docker', [
      'build', '-t', DEFAULT_IMAGE_NAME,
      '-f', dockerfilePath,
      '.',
    ], {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 300000, // 5 minutes max
      stdio: 'pipe',
    });
    logSandboxEvent('sandbox_image_build_complete', { image: DEFAULT_IMAGE_NAME });
  } catch (e) {
    logSandboxEvent('sandbox_image_build_error', { image: DEFAULT_IMAGE_NAME, error: e.message });
    throw e;
  }
}

function ensureReady(projectDir) {
  if (!isDockerAvailable()) {
    throw new Error('Docker is not available');
  }
  if (!isImageBuilt()) {
    buildImage(projectDir);
  }
}

function getContainerStatus(workerName) {
  try {
    const out = execFileSync(
      'docker', ['inspect', '--format', '{{.State.Status}}', workerName],
      { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
    ).trim();
    if (out === 'running') return 'running';
    return 'stopped';
  } catch {
    return 'missing';
  }
}

function startContainer(workerName, cmd, cwd, envVars) {
  const dockerBackend = require('./worker-backend').getBackend('docker');
  if (!dockerBackend) throw new Error('Docker backend not available');
  dockerBackend.createWorker(workerName, cmd, cwd, envVars);
}

function stopContainer(workerName) {
  try {
    execFileSync('docker', ['rm', '-f', workerName], {
      encoding: 'utf8', timeout: 10000, stdio: 'pipe',
    });
  } catch { /* container may not exist */ }
}

function listContainers() {
  try {
    const out = execFileSync(
      'docker', ['ps', '-a', '--filter', 'label=mac10-worker', '--format', '{{.Names}}\t{{.State}}'],
      { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }
    ).trim();
    if (!out) return [];
    return out.split('\n').filter(Boolean).map(line => {
      const [name, status] = line.split('\t');
      return { name, status: status || 'unknown' };
    });
  } catch {
    return [];
  }
}

function cleanupAll() {
  const containers = listContainers();
  for (const c of containers) {
    stopContainer(c.name);
  }
  logSandboxEvent('sandbox_cleanup_all', { stopped: containers.length });
  return containers.length;
}

function parseProviderSmokeOutput(output) {
  const result = {};
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+)=(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2];
      result[key] = key === 'provider' ? value.split(/\s+/)[0] : value;
    }
  }
  return result;
}

function providerSmoke(projectDir, {
  provider = null,
  runActual = false,
  build = true,
  imageName = DEFAULT_IMAGE_NAME,
  timeoutMs = 120000,
} = {}) {
  if (!isDockerAvailable()) {
    throw new Error('Docker is not available');
  }
  if (build) {
    ensureReady(projectDir);
  } else if (!isImageBuilt(imageName)) {
    throw new Error(`Docker worker image is not built: ${imageName}`);
  }

  const resolvedProjectDir = path.resolve(projectDir);
  const envArgs = [];
  if (provider) envArgs.push('-e', `MAC10_AGENT_PROVIDER=${provider}`);
  envArgs.push('-e', `MAC10_PROVIDER_SMOKE_EXEC=${runActual ? '1' : '0'}`);

  const script = [
    'set -euo pipefail',
    'export PATH="/workspace/coordinator/bin:/workspace/.claude/scripts:$PATH"',
    '. /workspace/scripts/provider-utils.sh',
    'mac10_load_provider_config /workspace',
    'cli="$(mac10_provider_cli)"',
    'if ! command -v "$cli" >/dev/null 2>&1; then',
    '  echo "provider=$MAC10_AGENT_PROVIDER"',
    '  echo "cli=$cli"',
    '  echo "cli_available=false"',
    '  exit 20',
    'fi',
    'echo "provider=$MAC10_AGENT_PROVIDER"',
    'echo "cli=$cli"',
    'echo "cli_available=true"',
    'mac10_provider_auth_check /workspace "$MAC10_AGENT_PROVIDER"',
    'echo "auth_check=pass"',
    'prompt="/workspace/.claude/commands/worker-loop.md"',
    'if [ ! -f "$prompt" ]; then',
    '  echo "prompt=$prompt"',
    '  echo "prompt_available=false"',
    '  exit 21',
    'fi',
    'MAC10_LAUNCH_DRY_RUN=1 mac10_run_noninteractive_prompt /workspace "$prompt" worker',
    'echo "noninteractive_launch=dry_run_pass"',
    'if [ "${MAC10_PROVIDER_SMOKE_EXEC:-0}" = "1" ]; then',
    '  smoke_prompt="$(mktemp)"',
    '  printf "Return exactly mac10-provider-smoke-ok\\n" > "$smoke_prompt"',
    '  mac10_run_noninteractive_prompt /workspace "$smoke_prompt" worker',
    '  echo "noninteractive_exec=pass"',
    'else',
    '  echo "noninteractive_exec=skipped"',
    'fi',
    'echo "provider_smoke=pass"',
  ].join('\n');

  const args = [
    'run', '--rm',
    '--entrypoint', '',
    '-v', `${resolvedProjectDir}:/workspace`,
    '-w', '/workspace',
    ...envArgs,
    imageName,
    'bash', '-lc', script,
  ];

  logSandboxEvent('sandbox_provider_smoke_start', {
    provider,
    image: imageName,
    run_actual: runActual,
  });
  try {
    const output = execFileSync('docker', args, {
      cwd: resolvedProjectDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: 'pipe',
    });
    const parsed = parseProviderSmokeOutput(output);
    logSandboxEvent('sandbox_provider_smoke_complete', {
      provider: parsed.provider || provider || null,
      image: imageName,
      run_actual: runActual,
      noninteractive_exec: parsed.noninteractive_exec || null,
    });
    return {
      ok: true,
      provider: parsed.provider || provider || null,
      image: imageName,
      run_actual: runActual,
      parsed,
      output,
    };
  } catch (e) {
    const output = `${e.stdout || ''}${e.stderr || ''}`;
    const parsed = parseProviderSmokeOutput(output);
    logSandboxEvent('sandbox_provider_smoke_error', {
      provider: parsed.provider || provider || null,
      image: imageName,
      run_actual: runActual,
      error: e.message,
    });
    const err = new Error(`Docker provider smoke failed: ${e.message}`);
    err.output = output;
    err.parsed = parsed;
    throw err;
  }
}

function getStatus(projectDir) {
  const dockerAvailable = isDockerAvailable();
  const imageBuilt = dockerAvailable ? isImageBuilt() : false;
  const containers = dockerAvailable ? listContainers() : [];
  const autoEnabled = db.getConfig('auto_sandbox_enabled');

  return {
    docker_available: dockerAvailable,
    image_built: imageBuilt,
    image_name: DEFAULT_IMAGE_NAME,
    containers,
    auto_sandbox_enabled: autoEnabled !== 'false',
    mode: dockerAvailable && autoEnabled !== 'false' ? 'docker-first' : 'tmux-fallback',
  };
}

module.exports = {
  isDockerAvailable,
  isImageBuilt,
  buildImage,
  ensureReady,
  getContainerStatus,
  startContainer,
  stopContainer,
  listContainers,
  cleanupAll,
  providerSmoke,
  parseProviderSmokeOutput,
  getStatus,
  DEFAULT_IMAGE_NAME,
  DOCKERFILE_PATH,
};
