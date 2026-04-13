'use strict';

function loadKnowledgeMetadata() {
  return require('../knowledge-metadata');
}

function handleWorkerCompletionCommand(command, args, deps) {
  const {
    db,
    projectDir,
    handlers,
    validateWorkerTaskOwnership,
    normalizeCompleteTaskUsagePayload,
    mapUsagePayloadToTaskFields,
    normalizePrUrl,
    isValidGitHubPrUrl,
    sanitizeBranchName,
    resolveCompletionBranch,
    preQueueOverlapCheck,
    queueMergeWithRecovery,
    isMergeOwnershipCollisionReason,
    knowledgeMeta = loadKnowledgeMetadata(),
  } = deps;

  switch (command) {
    case 'complete-task': {
      const { worker_id, task_id, pr_url, result, branch } = args;
      const ownership = validateWorkerTaskOwnership('complete-task', worker_id, task_id, { logic: 'or', softFail: true });
      if (!ownership.ok) {
        return ownership.response;
      }
      const task = ownership.task;
      const worker = ownership.worker;
      if (!['assigned', 'in_progress'].includes(task.status)) {
        const reason = task.status === 'completed'
          ? 'duplicate_terminal_completion'
          : 'task_not_active';
        db.log('coordinator', 'complete_task_skipped_terminal', {
          worker_id,
          task_id,
          reason,
          task_status: task.status || null,
        });
        return {
          ok: true,
          skipped: true,
          reason,
          task_status: task.status || null,
        };
      }
      const usage = normalizeCompleteTaskUsagePayload(args.usage);
      const usageTaskFields = mapUsagePayloadToTaskFields(usage, task);
      const completionPrNormalizationCwd = worker && worker.worktree_path
        ? worker.worktree_path
        : (projectDir || process.cwd());
      const normalizedPrUrl = normalizePrUrl(pr_url, completionPrNormalizationCwd);
      const resolvedBranch = resolveCompletionBranch(worker, branch, worker_id);
      if (resolvedBranch.mismatch) {
        db.log('coordinator', 'complete_task_branch_overridden', {
          worker_id,
          task_id,
          requested_branch: resolvedBranch.requestedBranch,
          worker_branch: resolvedBranch.workerBranch,
        });
      }
      db.updateTask(task_id, {
        status: 'completed',
        pr_url: normalizedPrUrl || null,
        branch: resolvedBranch.branch,
        result: result || null,
        completed_at: new Date().toISOString(),
        ...usageTaskFields,
      });
      const completedTask = db.getTask(task_id);
      // Pre-queue overlap detection: serialize overlapping pending merge entries
      if (completedTask) {
        let changedFiles = [];
        try { changedFiles = completedTask.files ? JSON.parse(completedTask.files) : []; } catch { changedFiles = []; }
        preQueueOverlapCheck(task_id, changedFiles);
      }
      // Enqueue merge if PR exists (must be a valid URL, not a status string like "already_merged")
      const queueBranch = sanitizeBranchName(resolvedBranch.branch || completedTask.branch || (worker && worker.branch) || '');
      let completionPrUrl = normalizedPrUrl;
      let queueResult = null;
      if (completedTask && queueBranch && isValidGitHubPrUrl(normalizedPrUrl)) {
        queueResult = queueMergeWithRecovery({
          request_id: completedTask.request_id,
          task_id,
          pr_url: normalizedPrUrl,
          branch: queueBranch,
          priority: completedTask.priority === 'urgent' ? 10 : 0,
        });
        if (queueResult.resolved_pr_url && queueResult.resolved_pr_url !== completionPrUrl) {
          completionPrUrl = queueResult.resolved_pr_url;
          db.updateTask(task_id, { pr_url: completionPrUrl });
        }
        if (queueResult.refreshed) {
          db.log('coordinator', 'merge_queue_entry_refreshed', {
            request_id: completedTask.request_id,
            task_id,
            pr_url: queueResult.resolved_pr_url || completionPrUrl || normalizedPrUrl,
            branch: queueBranch,
            retried: queueResult.retried,
            previous_status: queueResult.previous_status || null,
            merge_id: queueResult.merge_id || null,
          });
        }
      } else if (completedTask && queueBranch && !isValidGitHubPrUrl(normalizedPrUrl)) {
        db.log('coordinator', 'complete_task_merge_skipped_no_pr', {
          request_id: completedTask.request_id,
          task_id,
          branch: queueBranch,
          pr_url: normalizedPrUrl || null,
        });
      }
      if (queueResult && isMergeOwnershipCollisionReason(queueResult.reason)) {
        const failureReason = queueResult.reason;
        const failureError = `merge_queue:${failureReason}`;
        const failureTimestamp = new Date().toISOString();
        db.updateTask(task_id, {
          status: 'failed',
          pr_url: completionPrUrl || null,
          branch: queueBranch || resolvedBranch.branch || null,
          result: failureError,
          completed_at: failureTimestamp,
        });
        db.updateWorker(worker_id, { status: 'idle', current_task_id: null });
        const failedTask = db.getTask(task_id);
        const routingMeta = failedTask ? {
          subject: failedTask.subject,
          description: failedTask.description,
          domain: failedTask.domain,
          files: failedTask.files,
          tier: failedTask.tier,
          assigned_to: failedTask.assigned_to,
        } : null;
        db.sendMail('allocator', 'task_failed', {
          worker_id,
          task_id,
          request_id: failedTask ? failedTask.request_id : null,
          error: failureError,
          subject: routingMeta ? routingMeta.subject : null,
          domain: routingMeta ? routingMeta.domain : null,
          files: routingMeta ? routingMeta.files : null,
          tier: routingMeta ? routingMeta.tier : null,
          assigned_to: routingMeta ? routingMeta.assigned_to : null,
          original_task: routingMeta,
        });
        db.sendMail('architect', 'task_failed', {
          worker_id,
          task_id,
          request_id: failedTask ? failedTask.request_id : null,
          error: failureError,
          original_task: routingMeta,
        });
        db.log('coordinator', 'merge_queue_ownership_collision_rejected', {
          request_id: failedTask ? failedTask.request_id : null,
          worker_id,
          task_id,
          reason: failureReason,
          pr_url: queueResult.resolved_pr_url || completionPrUrl || normalizedPrUrl || null,
          branch: queueBranch || null,
          merge_id: queueResult.merge_id || null,
          duplicate_merge_id: queueResult.duplicate_merge_id || null,
          existing_request_id: queueResult.existing_request_id || null,
          existing_task_id: queueResult.existing_task_id || null,
          existing_branch: queueResult.existing_branch || null,
          existing_status: queueResult.existing_status || null,
        });
        db.log(`worker-${worker_id}`, 'task_failed', { task_id, error: failureError });
        return {
          ok: false,
          error: 'merge_queue_rejected',
          reason: failureReason,
          merge_id: queueResult.merge_id || null,
          duplicate_merge_id: queueResult.duplicate_merge_id || null,
          existing_request_id: queueResult.existing_request_id || null,
          existing_task_id: queueResult.existing_task_id || null,
          existing_branch: queueResult.existing_branch || null,
          existing_status: queueResult.existing_status || null,
        };
      }
      // Increment tasks_completed counter on worker
      const workerRow = db.getWorker(worker_id);
      const tasksCompleted = (workerRow ? workerRow.tasks_completed : 0) + 1;
      db.updateWorker(worker_id, {
        status: 'completed_task',
        current_task_id: null,
        tasks_completed: tasksCompleted,
      });
      // Auto-increment knowledge staleness counter on task completion
      try {
        knowledgeMeta.incrementChanges(projectDir || process.cwd(), completedTask.domain);
      } catch (kmErr) {
        db.log('coordinator', 'knowledge_metadata_increment_error', {
          task_id, error: kmErr.message,
        });
      }
      if (completionPrUrl && completionPrUrl !== (pr_url || '')) {
        db.log('coordinator', 'complete_task_pr_url_normalized', {
          task_id,
          worker_id,
          original_pr_url: pr_url,
          normalized_pr_url: completionPrUrl,
        });
      }
      db.sendMail('allocator', 'task_completed', {
        worker_id, task_id,
        request_id: completedTask ? completedTask.request_id : null,
        pr_url: completionPrUrl,
        tasks_completed: tasksCompleted,
        usage,
      });
      // Notify architect so it has visibility into Tier 2 outcomes
      db.sendMail('architect', 'task_completed', {
        worker_id, task_id,
        request_id: completedTask ? completedTask.request_id : null,
        pr_url: completionPrUrl,
        result,
        usage,
      });
      db.log(`worker-${worker_id}`, 'task_completed', {
        task_id,
        pr_url: completionPrUrl,
        result,
        usage,
        tasks_completed: tasksCompleted,
      });
      // Notify handlers for merge check
      if (handlers && handlers.onTaskCompleted) handlers.onTaskCompleted(task_id);
      return { ok: true };
    }

    default:
      throw new Error(`Unknown worker completion command: ${command}`);
  }
}

module.exports = {
  handleWorkerCompletionCommand,
};
