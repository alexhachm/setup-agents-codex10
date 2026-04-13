'use strict';

function handleArchitectCommand(command, args, deps) {
  const {
    db,
    parseFilesField,
    parseDependsOnField,
    normalizeOverlapIdsField,
  } = deps;

  switch (command) {
    case 'triage': {
      const { request_id, tier, reasoning } = args;
      db.updateRequest(request_id, { tier, status: tier === 1 ? 'executing_tier1' : 'decomposed' });
      db.log('architect', 'triage', { request_id, tier, reasoning });
      return { ok: true };
    }

    case 'create-task': {
      // Normalize files to an array before persisting (handles strings, JSON strings, arrays)
      args.files = parseFilesField(args.files);
      args.depends_on = parseDependsOnField(args.depends_on);
      const taskId = db.createTask(args);
      // If no dependencies, mark ready immediately
      if (!args.depends_on || args.depends_on.length === 0) {
        db.updateTask(taskId, { status: 'ready' });
      }
      // Detect file overlaps with other tasks in the same request
      let overlaps = [];
      const taskFiles = Array.isArray(args.files) ? args.files : [];
      if (taskFiles.length > 0) {
        overlaps = db.findOverlappingTasks(args.request_id, taskFiles, taskId)
          .filter((o) => Number(o.task_id) !== taskId);
        const overlapIds = normalizeOverlapIdsField(overlaps.map((o) => o.task_id), taskId);
        if (overlapIds.length > 0) {
          // Set overlap_with on the new task
          db.updateTask(taskId, { overlap_with: JSON.stringify(overlapIds) });
          // Update existing overlapping tasks to include the new task
          for (const overlapId of overlapIds) {
            const existing = db.getTask(overlapId);
            const existingOverlaps = normalizeOverlapIdsField(existing && existing.overlap_with, overlapId);
            let shouldUpdate = !!existing;
            if (!existingOverlaps.includes(taskId)) {
              existingOverlaps.push(taskId);
              shouldUpdate = true;
            }
            if (shouldUpdate) {
              db.updateTask(overlapId, { overlap_with: JSON.stringify(existingOverlaps) });
            }
          }
          db.log('coordinator', 'overlap_detected', {
            task_id: taskId,
            request_id: args.request_id,
            overlaps: overlaps.map(o => ({ task_id: o.task_id, shared_files: o.shared_files })),
          });
        }
      }
      const request = db.getRequest(args.request_id);
      const totalTaskRow = db.getDb().prepare(
        'SELECT COUNT(*) AS count FROM tasks WHERE request_id = ?'
      ).get(args.request_id);
      const totalTasks = Number(totalTaskRow && totalTaskRow.count) || 0;
      if (request && Number(request.tier) >= 3 && totalTasks === 1) {
        if (request.status === 'pending') {
          db.updateRequest(args.request_id, { status: 'decomposed' });
        }
        db.sendMail('allocator', 'tasks_ready', {
          request_id: args.request_id,
          task_id: taskId,
          trigger: 'first_task_created',
        });
      }
      return { ok: true, task_id: taskId, overlaps };
    }

    case 'tier1-complete': {
      const { request_id, result } = args;
      db.updateRequest(request_id, { status: 'completed', result, completed_at: new Date().toISOString() });
      db.sendMail('master-1', 'request_completed', { request_id, result });
      db.log('architect', 'tier1_complete', { request_id, result });
      return { ok: true };
    }

    case 'ask-clarification': {
      db.sendMail('master-1', 'clarification_ask', {
        request_id: args.request_id,
        question: args.question,
      });
      db.log('architect', 'clarification_ask', { request_id: args.request_id, question: args.question });
      return { ok: true };
    }

    default:
      throw new Error(`Unknown architect command: ${command}`);
  }
}

module.exports = {
  handleArchitectCommand,
};
