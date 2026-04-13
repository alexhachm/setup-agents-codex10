'use strict';

function handleAllocatorCommand(command, args, deps) {
  const {
    db,
    handlers,
    modelRouter,
    isWorkerClaimedAssignmentError,
    reopenFailedRequestForActiveRemediation,
  } = deps;

  switch (command) {
    case 'ready-tasks': {
      const tasks = db.getReadyTasks();
      return { ok: true, tasks };
    }

    case 'assign-task': {
      const { task_id: assignTaskId, worker_id: assignWorkerId } = args;
      // Atomic assignment: same pattern as allocator.js assignTaskToWorker
      const assignResult = db.getDb().transaction(() => {
        const freshTask = db.getTask(assignTaskId);
        const freshWorker = db.getWorker(assignWorkerId);
        if (!freshTask || freshTask.status !== 'ready' || freshTask.assigned_to) return { ok: false, reason: 'task_not_ready' };
        if (!freshWorker) return { ok: false, reason: 'worker_not_idle' };
        if (freshWorker.claimed_by !== null && freshWorker.claimed_by !== undefined) {
          return { ok: false, reason: 'worker_claimed', claimed_by: freshWorker.claimed_by };
        }
        if (freshWorker.status !== 'idle') return { ok: false, reason: 'worker_not_idle' };

        db.updateTask(assignTaskId, { status: 'assigned', assigned_to: assignWorkerId });
        db.updateWorker(assignWorkerId, {
          status: 'assigned',
          current_task_id: assignTaskId,
          domain: freshTask.domain || freshWorker.domain,
          launched_at: new Date().toISOString(),
        });
        return { ok: true, task: freshTask, worker: freshWorker };
      })();

      if (!assignResult.ok) {
        const errPayload = { ok: false, error: assignResult.reason };
        if (assignResult.claimed_by != null) errPayload.claimed_by = assignResult.claimed_by;
        return errPayload;
      }

      const assignedTask = db.getTask(assignTaskId);
      const assignedWorker = db.getWorker(assignWorkerId);
      const routingDecision = modelRouter.routeTask(assignedTask, { getConfig: db.getConfig });
      const modelSource = routingDecision.model_source || 'router:unspecified';
      db.updateTask(assignTaskId, {
        routing_class: routingDecision.routing_class || null,
        routed_model: routingDecision.model || null,
        model_source: modelSource,
        reasoning_effort: routingDecision.reasoning_effort || null,
      });
      const routingReason = routingDecision.routing_reason || routingDecision.reason || 'router:unspecified';
      const routingTelemetry = {
        budget_state: routingDecision.budget_state || null,
        budget_source: routingDecision.budget_source || 'none',
        model_source: modelSource,
        routing_reason: routingReason,
        routing_precedence: routingDecision.routing_precedence || [],
      };
      let taskSandbox = null;
      try {
        taskSandbox = db.createTaskSandbox({
          task_id: assignTaskId,
          worker_id: assignWorkerId,
          backend: 'pending',
          metadata: {
            source: 'assign-task',
            routing_class: routingDecision.routing_class || null,
            model: routingDecision.model || null,
            model_source: modelSource,
          },
        });
      } catch (sandboxErr) {
        db.getDb().transaction(() => {
          db.updateTask(assignTaskId, {
            status: assignResult.task.status,
            assigned_to: assignResult.task.assigned_to,
            routing_class: assignResult.task.routing_class ?? null,
            routed_model: assignResult.task.routed_model ?? null,
            model_source: assignResult.task.model_source ?? null,
            reasoning_effort: assignResult.task.reasoning_effort ?? null,
          });
          db.updateWorker(assignWorkerId, {
            status: assignResult.worker.status,
            current_task_id: assignResult.worker.current_task_id,
            domain: assignResult.worker.domain,
            claimed_by: assignResult.worker.claimed_by,
            claimed_at: assignResult.worker.claimed_at,
            launched_at: assignResult.worker.launched_at,
          });
        })();
        db.log('coordinator', 'task_sandbox_allocation_failed', {
          task_id: assignTaskId,
          worker_id: assignWorkerId,
          error: sandboxErr.message,
        });
        return { ok: false, error: `Failed to allocate task sandbox: ${sandboxErr.message}` };
      }

      // Trigger tmux spawn via handler — revert assignment on failure
      if (handlers.onAssignTask) {
        try {
          handlers.onAssignTask(assignedTask, assignedWorker, routingDecision, taskSandbox);
        } catch (spawnErr) {
          try {
            db.transitionTaskSandbox(taskSandbox.id, 'failed', { error: spawnErr.message });
          } catch (sandboxErr) {
            db.log('coordinator', 'task_sandbox_spawn_failure_mark_error', {
              task_id: assignTaskId,
              sandbox_id: taskSandbox ? taskSandbox.id : null,
              error: sandboxErr.message,
            });
          }
          const rollbackAsWorkerClaimed = isWorkerClaimedAssignmentError(spawnErr);
          db.getDb().transaction(() => {
            const rollbackWorker = rollbackAsWorkerClaimed ? db.getWorker(assignWorkerId) : null;
            const claimedBy = rollbackAsWorkerClaimed
              ? (rollbackWorker ? rollbackWorker.claimed_by : assignResult.worker.claimed_by)
              : assignResult.worker.claimed_by;
            const claimedAt = rollbackAsWorkerClaimed
              ? (rollbackWorker ? rollbackWorker.claimed_at : assignResult.worker.claimed_at)
              : assignResult.worker.claimed_at;
            db.updateTask(assignTaskId, {
              status: assignResult.task.status,
              assigned_to: assignResult.task.assigned_to,
              routing_class: assignResult.task.routing_class ?? null,
              routed_model: assignResult.task.routed_model ?? null,
              model_source: assignResult.task.model_source ?? null,
              reasoning_effort: assignResult.task.reasoning_effort ?? null,
            });
            db.updateWorker(assignWorkerId, {
              status: assignResult.worker.status,
              current_task_id: assignResult.worker.current_task_id,
              domain: assignResult.worker.domain,
              claimed_by: claimedBy,
              claimed_at: claimedAt,
              launched_at: assignResult.worker.launched_at,
            });
          })();
          db.log('coordinator', 'assign_handler_failed', { task_id: assignTaskId, worker_id: assignWorkerId, error: spawnErr.message });
          if (rollbackAsWorkerClaimed) {
            return { ok: false, error: 'worker_claimed' };
          }
          return { ok: false, error: `Failed to spawn worker: ${spawnErr.message}` };
        }
      }

      reopenFailedRequestForActiveRemediation({
        requestId: assignedTask.request_id,
        taskId: assignTaskId,
        workerId: assignWorkerId,
        trigger: 'assign-task',
      });

      db.sendMail(`worker-${assignWorkerId}`, 'task_assigned', {
        task_id: assignTaskId,
        subject: assignedTask.subject,
        description: assignedTask.description,
        domain: assignedTask.domain,
        files: assignedTask.files,
        tier: assignedTask.tier,
        request_id: assignedTask.request_id,
        validation: assignedTask.validation,
        assignment_token: assignedWorker ? assignedWorker.launched_at : null,
        task_sandbox_id: taskSandbox ? taskSandbox.id : null,
        routing_class: routingDecision.routing_class,
        model: routingDecision.model,
        model_source: routingTelemetry.model_source,
        reasoning_effort: routingDecision.reasoning_effort,
        routing_reason: routingTelemetry.routing_reason,
        routing_precedence: routingTelemetry.routing_precedence,
        budget_state: routingTelemetry.budget_state,
        budget_source: routingTelemetry.budget_source,
      });
      db.log('allocator', 'task_assigned', {
        task_id: assignTaskId,
        worker_id: assignWorkerId,
        domain: assignedTask.domain,
        assignment_token: assignedWorker ? assignedWorker.launched_at : null,
        task_sandbox_id: taskSandbox ? taskSandbox.id : null,
        routing_class: routingDecision.routing_class,
        model: routingDecision.model,
        model_source: routingTelemetry.model_source,
        reasoning_effort: routingDecision.reasoning_effort,
        routing_reason: routingTelemetry.routing_reason,
        routing_precedence: routingTelemetry.routing_precedence,
        budget_state: routingTelemetry.budget_state,
        budget_source: routingTelemetry.budget_source,
      });

      return {
        ok: true,
        task_id: assignTaskId,
        worker_id: assignWorkerId,
        task_sandbox_id: taskSandbox ? taskSandbox.id : null,
        routing: {
          class: routingDecision.routing_class,
          model: routingDecision.model,
          model_source: routingTelemetry.model_source,
          reasoning_effort: routingDecision.reasoning_effort,
          routing_reason: routingTelemetry.routing_reason,
          reason: routingTelemetry.routing_reason,
          precedence: routingTelemetry.routing_precedence,
        },
        assignment_token: assignedWorker ? assignedWorker.launched_at : null,
        budget_state: routingTelemetry.budget_state,
        budget_source: routingTelemetry.budget_source,
      };
    }

    case 'claim-worker': {
      const success = db.claimWorker(args.worker_id, args.claimer);
      return { ok: true, claimed: success };
    }

    case 'release-worker': {
      db.releaseWorker(args.worker_id);
      return { ok: true };
    }

    case 'worker-status': {
      const workers = db.getAllWorkers();
      return { ok: true, workers };
    }

    case 'check-completion': {
      const completion = db.checkRequestCompletion(args.request_id, {
        source: 'check_completion_command',
      });
      return { ok: true, ...completion };
    }

    case 'check-overlaps': {
      const overlapPairs = db.getOverlapsForRequest(args.request_id);
      return { ok: true, request_id: args.request_id, overlaps: overlapPairs };
    }

    case 'replan-dependency': {
      const replanned = db.replanTaskDependency({
        fromTaskId: args.from_task_id,
        toTaskId: args.to_task_id,
        requestId: args.request_id,
      });
      return { ok: true, ...replanned };
    }

    default:
      throw new Error(`Unknown allocator command: ${command}`);
  }
}

module.exports = {
  handleAllocatorCommand,
};
