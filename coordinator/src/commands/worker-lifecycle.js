'use strict';

function handleWorkerLifecycleCommand(command, args, deps) {
  const {
    db,
    projectDir,
    contextBundle,
    collectCoordinatorHealth,
    validateWorkerTaskOwnership,
    reopenFailedRequestForActiveRemediation,
    parseWorkerId,
  } = deps;

  switch (command) {
    case 'my-task': {
      const worker = db.getWorker(args.worker_id);
      if (!worker) {
        return { ok: false, error: 'Worker not found' };
      }
      if (!worker.current_task_id) {
        return { ok: true, task: null };
      }
      const task = db.getTask(worker.current_task_id);
      return {
        ok: true,
        task: task
          ? {
            ...task,
            assignment_token: worker.launched_at || null,
          }
          : null,
      };
    }

    case 'task-context':
    case 'context-bundle': {
      const dir = projectDir || process.cwd();
      const health = collectCoordinatorHealth(dir);
      const bundle = contextBundle.buildTaskContextBundle({
        taskId: args.task_id,
        projectDir: dir,
        runtimeHealth: health,
      });
      return { ok: true, bundle };
    }

    case 'start-task': {
      const { worker_id, task_id } = args;
      const ownership = validateWorkerTaskOwnership('start-task', worker_id, task_id);
      if (!ownership.ok) {
        // Stale agents whose current_task assignment changed (e.g. after watchdog
        // sentinel_reset) should be silently skipped — same pattern as the
        // reset-worker stale-sentinel guards.
        if (ownership.response.reason === 'worker_current_task_mismatch') {
          return { ok: true, skipped: true, reason: 'worker_current_task_mismatch' };
        }
        return ownership.response;
      }
      const { task } = ownership;

      if (task.status === 'completed' || task.status === 'failed') {
        return { ok: false, error: 'task_not_startable' };
      }

      if (task.status === 'in_progress') {
        return { ok: true, idempotent: true };
      }

      if (task.status !== 'assigned') {
        return { ok: false, error: 'task_not_startable' };
      }

      const now = new Date().toISOString();
      db.updateTask(task_id, { status: 'in_progress', started_at: now });
      db.updateWorker(worker_id, { status: 'busy', last_heartbeat: now });
      reopenFailedRequestForActiveRemediation({
        requestId: task.request_id,
        taskId: task_id,
        workerId: parseWorkerId(worker_id),
        trigger: 'start-task',
      });
      db.log(`worker-${worker_id}`, 'task_started', { task_id });
      return { ok: true };
    }

    case 'heartbeat': {
      const worker = db.getWorker(args.worker_id);
      if (!worker) {
        return { ok: false, error: 'Worker not found' };
      }

      const heartbeatTs = new Date().toISOString();
      const updateResult = db.getDb().prepare(`
          UPDATE workers
          SET last_heartbeat = ?
          WHERE id = ?
        `).run(heartbeatTs, args.worker_id);
      if (updateResult.changes !== 1) {
        return { ok: false, error: 'Worker not found' };
      }

      return { ok: true };
    }

    case 'distill': {
      db.log(`worker-${args.worker_id}`, 'distill', { domain: args.domain, content: args.content });
      return { ok: true };
    }

    default:
      throw new Error(`Unknown worker lifecycle command: ${command}`);
  }
}

module.exports = {
  handleWorkerLifecycleCommand,
};
