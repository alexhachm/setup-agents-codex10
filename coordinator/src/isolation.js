'use strict';

/**
 * Isolation evaluation — Firecracker vs Docker vs none.
 * Determines the best isolation strategy for task execution.
 */

const { execFileSync } = require('child_process');
const settingsManager = require('./settings-manager');

const BACKENDS = {
  firecracker: {
    name: 'firecracker',
    description: 'Firecracker microVMs — lightweight, fast boot, strong isolation',
    checkAvailable() {
      try {
        execFileSync('which', ['firecracker'], { encoding: 'utf-8', timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    },
    requirements: [
      'Linux host with KVM support (/dev/kvm)',
      'firecracker binary installed',
      'jailer binary installed (optional, for production)',
      'Root or kvm group membership',
    ],
    pros: [
      'Sub-second boot times (~125ms)',
      'Minimal memory footprint (~5MB overhead)',
      'Strong security isolation (hardware virtualization)',
      'Rate-of-change snapshot support',
    ],
    cons: [
      'Linux-only (requires KVM)',
      'Requires root or kvm group',
      'No GPU passthrough (yet)',
      'Custom kernel/rootfs required',
    ],
  },

  docker: {
    name: 'docker',
    description: 'Docker containers — widely available, good tooling',
    checkAvailable() {
      try {
        execFileSync('which', ['docker'], { encoding: 'utf-8', timeout: 5000 });
        // Also check daemon is running
        execFileSync('docker', ['info'], { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
    requirements: [
      'Docker daemon running',
      'User in docker group (or root)',
    ],
    pros: [
      'Cross-platform (Linux, macOS, Windows)',
      'Rich ecosystem and tooling',
      'Easy image management',
      'GPU support via nvidia-docker',
    ],
    cons: [
      'Weaker isolation than VMs (shared kernel)',
      'Higher overhead than Firecracker',
      'Slower startup than Firecracker',
      'Container escape vulnerabilities possible',
    ],
  },

  none: {
    name: 'none',
    description: 'No isolation — tasks run directly on the host',
    checkAvailable() { return true; },
    requirements: [],
    pros: [
      'Zero overhead',
      'Full host access',
      'Simplest setup',
    ],
    cons: [
      'No security isolation',
      'Tasks can affect host state',
      'Not suitable for untrusted code',
    ],
  },
};

function evaluate() {
  const results = {};
  for (const [name, backend] of Object.entries(BACKENDS)) {
    results[name] = {
      name: backend.name,
      description: backend.description,
      available: backend.checkAvailable(),
      requirements: backend.requirements,
      pros: backend.pros,
      cons: backend.cons,
    };
  }
  return results;
}

function recommend() {
  const configuredBackend = settingsManager.get('isolation.backend');
  if (configuredBackend && BACKENDS[configuredBackend]) {
    return configuredBackend;
  }

  // Preference order: firecracker > docker > none
  if (BACKENDS.firecracker.checkAvailable()) return 'firecracker';
  if (BACKENDS.docker.checkAvailable()) return 'docker';
  return 'none';
}

function getBackendInfo(name) {
  const backend = BACKENDS[name];
  if (!backend) return null;
  return {
    name: backend.name,
    description: backend.description,
    available: backend.checkAvailable(),
    requirements: backend.requirements,
    pros: backend.pros,
    cons: backend.cons,
  };
}

function listBackends() {
  return Object.keys(BACKENDS);
}

module.exports = {
  evaluate,
  recommend,
  getBackendInfo,
  listBackends,
  BACKENDS,
};
