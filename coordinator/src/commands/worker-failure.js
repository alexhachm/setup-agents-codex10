'use strict';

function handleWorkerFailureCommand(command, args, deps) {
  const {
    db,
    validateWorkerTaskOwnership,
    normalizeCompleteTaskUsagePayload,
    mapUsagePayloadToTaskFields,
  } = deps;

  switch (command) {
    case 'fail-task': {
      const { worker_id: wid, task_id: tid, error } = args;
      const ownership = validateWorkerTaskOwnership('fail-task', wid, tid);
      if (!ownership.ok) {
        return ownership.response;
      }
      const failedTask = ownership.task;
      if (failedTask.status !== 'assigned' && failedTask.status !== 'in_progress') {
        db.log('coordinator', 'ownership_mismatch', {
          command: 'fail-task',
          worker_id: wid || null,
          task_id: tid || null,
          reason: 'task_not_active',
          task_status: failedTask.status,
        });
        return { ok: false, error: 'ownership_mismatch', reason: 'task_not_active' };
      }
      const usage = normalizeCompleteTaskUsagePayload(args.usage);
      const usageTaskFields = mapUsagePayloadToTaskFields(usage, failedTask);
      const routingMeta = failedTask ? {
        subject: failedTask.subject,
        description: failedTask.description,
        domain: failedTask.domain,
        files: failedTask.files,
        tier: failedTask.tier,
        assigned_to: failedTask.assigned_to,
      } : null;
      const isBlocking = failedTask && failedTask.blocking !== 0;
      const failStatus = isBlocking ? 'failed_needs_reroute' : 'failed';
      db.updateTask(tid, {
        status: failStatus,
        result: error,
        completed_at: new Date().toISOString(),
        ...usageTaskFields,
      });
      db.updateWorker(wid, { status: 'idle', current_task_id: null });

      let rerouteTaskId = null;
      if (isBlocking && failedTask.request_id) {
        const fixDescription = `Fix: ${failedTask.subject || 'task ' + tid}\n\nOriginal task ${tid} failed with: ${error}`;
        let parsedFiles = null;
        try { parsedFiles = failedTask.files ? JSON.parse(failedTask.files) : null; } catch (_) { /* ignore */ }
        rerouteTaskId = db.createTask({
          request_id: failedTask.request_id,
          subject: `[fix] ${failedTask.subject || 'task ' + tid}`,
          description: fixDescription,
          domain: failedTask.domain,
          files: parsedFiles,
          priority: 'urgent',
          tier: failedTask.tier || 3,
        });
        db.updateTask(rerouteTaskId, { status: 'ready' });
        db.log('coordinator', 'blocking_task_rerouted', {
          failed_task_id: tid,
          fix_task_id: rerouteTaskId,
          request_id: failedTask.request_id,
        });
      }

      db.sendMail('allocator', 'task_failed', {
        worker_id: wid,
        task_id: tid,
        request_id: failedTask ? failedTask.request_id : null,
        error,
        usage,
        subject: routingMeta ? routingMeta.subject : null,
        domain: routingMeta ? routingMeta.domain : null,
        files: routingMeta ? routingMeta.files : null,
        tier: routingMeta ? routingMeta.tier : null,
        assigned_to: routingMeta ? routingMeta.assigned_to : null,
        original_task: routingMeta,
        reroute_task_id: rerouteTaskId,
      });
      db.sendMail('architect', 'task_failed', {
        worker_id: wid,
        task_id: tid,
        request_id: failedTask ? failedTask.request_id : null,
        error,
        usage,
        original_task: routingMeta,
        reroute_task_id: rerouteTaskId,
      });
      db.log(`worker-${wid}`, 'task_failed', { task_id: tid, error, usage, reroute_task_id: rerouteTaskId });
      return { ok: true, reroute_task_id: rerouteTaskId };
    }

    default:
      throw new Error(`Unknown worker failure command: ${command}`);
  }
}

module.exports = {
  handleWorkerFailureCommand,
};
