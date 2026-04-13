'use strict';

function handleIntegrationCommand(command, args, deps) {
  const {
    db,
    handlers = {},
    projectDir,
    normalizePrUrl,
    isValidGitHubPrUrl,
    sanitizeBranchName,
    resolveCompletionBranch,
    queueMergeWithRecovery,
    isMergeOwnershipCollisionReason,
  } = deps;

  switch (command) {
    case 'integrate': {
      // Master-3 triggers integration when all tasks for a request complete
      const reqId = args.request_id;
      const forceRetry = args.retry_terminal === true || args.force_retry === true;
      const completion = db.checkRequestCompletion(reqId, { source: 'integrate_guard' });
      const hardFailures = Number(completion.hard_failures) || 0;
      const canIntegrate = completion.all_terminal === true && completion.completed > 0 && hardFailures === 0;
      if (!canIntegrate) {
        const error = hardFailures > 0
          ? 'Request has failed tasks'
          : 'Not all tasks completed';
        return { ok: false, error, ...completion };
      }
      // Queue merges for each completed task's branch/PR
      const tasks = db.listTasks({ request_id: reqId, status: 'completed' });
      const latestCompletedTaskState = db.getRequestLatestCompletedTaskCursor(reqId);
      let queued = 0;
      const queueFailures = [];
      for (const task of tasks) {
        const worker = task.assigned_to ? db.getWorker(task.assigned_to) : null;
        const taskPrNormalizationCwd = worker && worker.worktree_path
          ? worker.worktree_path
          : (projectDir || process.cwd());
        const normalizedPrUrl = normalizePrUrl(task.pr_url, taskPrNormalizationCwd);
        const resolvedBranch = resolveCompletionBranch(worker, task.branch, task.assigned_to);
        if (task.pr_url !== normalizedPrUrl) {
          db.updateTask(task.id, { pr_url: normalizedPrUrl || task.pr_url });
        }
        const mergeBranch = sanitizeBranchName(resolvedBranch.branch || task.branch || (worker && worker.branch) || '');
        if (mergeBranch && isValidGitHubPrUrl(normalizedPrUrl)) {
          if (resolvedBranch.mismatch || task.branch !== mergeBranch) {
            db.updateTask(task.id, { branch: mergeBranch });
          }
          const queueResult = queueMergeWithRecovery({
            request_id: reqId,
            task_id: task.id,
            branch: mergeBranch,
            pr_url: normalizedPrUrl,
            priority: task.priority === 'urgent' ? 10 : 0,
            force_retry: forceRetry,
            latest_completion_timestamp: latestCompletedTaskState,
          });
          const queuedPrUrl = queueResult.resolved_pr_url || normalizedPrUrl;
          if (queuedPrUrl && queuedPrUrl !== task.pr_url) {
            db.updateTask(task.id, { pr_url: queuedPrUrl });
          }
          if (isMergeOwnershipCollisionReason(queueResult.reason)) {
            const failureReason = queueResult.reason;
            const failureError = `merge_queue:${failureReason}`;
            const failureTimestamp = new Date().toISOString();
            db.updateTask(task.id, {
              status: 'failed',
              pr_url: queuedPrUrl || null,
              branch: mergeBranch,
              result: failureError,
              completed_at: failureTimestamp,
            });
            const failedTask = db.getTask(task.id);
            const routingMeta = failedTask ? {
              subject: failedTask.subject,
              description: failedTask.description,
              domain: failedTask.domain,
              files: failedTask.files,
              tier: failedTask.tier,
              assigned_to: failedTask.assigned_to,
            } : null;
            db.sendMail('allocator', 'task_failed', {
              worker_id: task.assigned_to || null,
              task_id: task.id,
              request_id: failedTask ? failedTask.request_id : reqId,
              error: failureError,
              subject: routingMeta ? routingMeta.subject : null,
              domain: routingMeta ? routingMeta.domain : null,
              files: routingMeta ? routingMeta.files : null,
              tier: routingMeta ? routingMeta.tier : null,
              assigned_to: routingMeta ? routingMeta.assigned_to : null,
              original_task: routingMeta,
            });
            db.sendMail('architect', 'task_failed', {
              worker_id: task.assigned_to || null,
              task_id: task.id,
              request_id: failedTask ? failedTask.request_id : reqId,
              error: failureError,
              original_task: routingMeta,
            });
            db.log('coordinator', 'integrate_merge_queue_ownership_collision_rejected', {
              request_id: reqId,
              task_id: task.id,
              reason: failureReason,
              pr_url: queuedPrUrl || null,
              branch: mergeBranch,
              merge_id: queueResult.merge_id || null,
              duplicate_merge_id: queueResult.duplicate_merge_id || null,
              existing_request_id: queueResult.existing_request_id || null,
              existing_task_id: queueResult.existing_task_id || null,
              existing_branch: queueResult.existing_branch || null,
              existing_status: queueResult.existing_status || null,
            });
            queueFailures.push({
              task_id: task.id,
              reason: failureReason,
              merge_id: queueResult.merge_id || null,
              duplicate_merge_id: queueResult.duplicate_merge_id || null,
              existing_request_id: queueResult.existing_request_id || null,
              existing_task_id: queueResult.existing_task_id || null,
              existing_branch: queueResult.existing_branch || null,
              existing_status: queueResult.existing_status || null,
            });
            continue;
          }
          if (queueResult.queued) queued++;
          if (queueResult.refreshed) {
            db.log('coordinator', 'merge_queue_entry_refreshed', {
              request_id: reqId,
              task_id: task.id,
              pr_url: queuedPrUrl,
              branch: mergeBranch,
              retried: queueResult.retried,
              previous_status: queueResult.previous_status || null,
              merge_id: queueResult.merge_id || null,
            });
          }
        } else if (mergeBranch && !isValidGitHubPrUrl(normalizedPrUrl)) {
          db.log('coordinator', 'integrate_merge_skipped_no_pr', {
            request_id: reqId,
            task_id: task.id,
            branch: mergeBranch,
            pr_url: normalizedPrUrl || null,
          });
        }
      }
      if (queueFailures.length > 0) {
        return {
          ok: false,
          error: 'merge_queue_rejected',
          request_id: reqId,
          merges_queued: queued,
          failures: queueFailures,
        };
      }
      if (queued > 0) {
        db.updateRequest(reqId, { status: 'integrating' });
      }
      db.log('coordinator', 'integration_triggered', { request_id: reqId, merges_queued: queued });
      // Trigger merger immediately
      if (queued > 0 && handlers.onIntegrate) handlers.onIntegrate(reqId);
      return { ok: true, request_id: reqId, merges_queued: queued };
    }

    case 'merge-status': {
      const reqFilter = args && args.request_id;
      let sql = 'SELECT * FROM merge_queue';
      const params = [];
      if (reqFilter) {
        sql += ' WHERE request_id = ?';
        params.push(reqFilter);
      }
      sql += ' ORDER BY id DESC';
      const merges = db.getDb().prepare(sql).all(...params);
      return { ok: true, merges };
    }

    default:
      throw new Error(`Unknown integration command: ${command}`);
  }
}

module.exports = {
  handleIntegrationCommand,
};
