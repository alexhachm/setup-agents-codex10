'use strict';

function loadMicrovmManager() {
  return require('../microvm-manager');
}

function handleMicrovmCommand(command, args, { microvmManager = loadMicrovmManager() } = {}) {
  switch (command) {
    case 'msb-status': {
      const status = microvmManager.getStatus();
      return { ok: true, ...status };
    }

    case 'msb-setup': {
      if (!microvmManager.isMsbInstalled()) {
        return { error: 'msb CLI is not installed. Run: curl -sSL https://get.microsandbox.dev | sh' };
      }
      try {
        microvmManager.ensureReady();
        microvmManager.pullImage();
        return { ok: true, message: 'msb server running, default image pulled' };
      } catch (e) {
        return { error: `msb setup failed: ${e.message}` };
      }
    }

    case 'msb-cleanup': {
      const stopped = microvmManager.cleanupAll();
      return { ok: true, stopped };
    }

    default:
      throw new Error(`Unknown microvm command: ${command}`);
  }
}

module.exports = {
  handleMicrovmCommand,
};
