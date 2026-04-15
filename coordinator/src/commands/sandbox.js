'use strict';

function extractTaskSandboxFields(args, keys = [
  'backend', 'sandbox_name', 'sandbox_path', 'worktree_path', 'branch', 'metadata', 'error',
]) {
  const fields = {};
  for (const key of keys) {
    if (args[key] !== undefined) fields[key] = args[key];
  }
  return fields;
}

function handleTaskSandboxCommand(command, args, { db }) {
  switch (command) {
    case 'task-sandbox-create': {
      const sandbox = db.createTaskSandbox({
        task_id: args.task_id,
        worker_id: args.worker_id,
        backend: args.backend,
        sandbox_name: args.sandbox_name,
        sandbox_path: args.sandbox_path,
        worktree_path: args.worktree_path,
        branch: args.branch,
        metadata: args.metadata,
      });
      return { ok: true, sandbox };
    }

    case 'task-sandbox-status': {
      const sandboxes = db.listTaskSandboxes({
        id: args.id,
        task_id: args.task_id,
        worker_id: args.worker_id,
        status: args.status,
      });
      return { ok: true, sandboxes, count: sandboxes.length };
    }

    case 'task-sandbox-ready': {
      const sandbox = db.transitionTaskSandbox(
        args.id,
        'ready',
        extractTaskSandboxFields(args, ['backend', 'sandbox_name', 'sandbox_path', 'worktree_path', 'branch', 'metadata'])
      );
      return { ok: true, sandbox };
    }

    case 'task-sandbox-start': {
      const sandbox = db.transitionTaskSandbox(
        args.id,
        'running',
        extractTaskSandboxFields(args, ['backend', 'sandbox_name', 'sandbox_path', 'worktree_path', 'branch', 'metadata'])
      );
      return { ok: true, sandbox };
    }

    case 'task-sandbox-stop': {
      const sandbox = db.transitionTaskSandbox(
        args.id,
        'stopped',
        extractTaskSandboxFields(args, ['error', 'metadata'])
      );
      return { ok: true, sandbox };
    }

    case 'task-sandbox-fail': {
      const sandbox = db.transitionTaskSandbox(
        args.id,
        'failed',
        extractTaskSandboxFields(args, ['error', 'metadata'])
      );
      return { ok: true, sandbox };
    }

    case 'task-sandbox-clean': {
      const sandbox = db.transitionTaskSandbox(
        args.id,
        'cleaned',
        extractTaskSandboxFields(args, ['metadata'])
      );
      return { ok: true, sandbox };
    }

    case 'task-sandbox-cleanup': {
      const result = db.cleanupTaskSandboxes({
        max_age_minutes: args.max_age_minutes,
        dry_run: args.dry_run === true,
      });
      return { ok: true, ...result };
    }

    default:
      throw new Error(`Unknown task sandbox command: ${command}`);
  }
}

function handleSandboxCommand(command, args, { db, projectDir }) {
  const sandboxManager = require('../sandbox-manager');

  switch (command) {
    case 'sandbox-status': {
      const status = sandboxManager.getStatus(projectDir || process.cwd());
      return { ok: true, ...status };
    }

    case 'sandbox-build': {
      const projDir = projectDir || process.cwd();
      if (!sandboxManager.isDockerAvailable()) {
        return { error: 'Docker is not available on this system' };
      }
      try {
        sandboxManager.buildImage(projDir);
        return {
          ok: true,
          image: sandboxManager.DEFAULT_IMAGE_NAME,
          message: 'Image built successfully',
        };
      } catch (e) {
        return { error: `Image build failed: ${e.message}` };
      }
    }

    case 'sandbox-provider-smoke': {
      try {
        return sandboxManager.providerSmoke(projectDir || process.cwd(), {
          provider: args.provider || null,
          runActual: args.run_actual === true,
          build: args.build !== false,
        });
      } catch (e) {
        return {
          ok: false,
          error: e.message,
          output: e.output || '',
          parsed: e.parsed || {},
        };
      }
    }

    case 'sandbox-cleanup': {
      const stopped = sandboxManager.cleanupAll();
      return { ok: true, stopped };
    }

    case 'sandbox-toggle': {
      const current = db.getConfig('auto_sandbox_enabled');
      const newValue = current === 'false' ? 'true' : 'false';
      db.setConfig('auto_sandbox_enabled', newValue);
      return { ok: true, auto_sandbox_enabled: newValue === 'true' };
    }

    default:
      throw new Error(`Unknown sandbox command: ${command}`);
  }
}

module.exports = {
  handleSandboxCommand,
  handleTaskSandboxCommand,
};
