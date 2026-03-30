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
  db.log('coordinator', 'sandbox_image_build_start', { image: DEFAULT_IMAGE_NAME, dockerfile: dockerfilePath });
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
    db.log('coordinator', 'sandbox_image_build_complete', { image: DEFAULT_IMAGE_NAME });
  } catch (e) {
    db.log('coordinator', 'sandbox_image_build_error', { image: DEFAULT_IMAGE_NAME, error: e.message });
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
  db.log('coordinator', 'sandbox_cleanup_all', { stopped: containers.length });
  return containers.length;
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
  getStatus,
  DEFAULT_IMAGE_NAME,
  DOCKERFILE_PATH,
};
