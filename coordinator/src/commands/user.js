'use strict';

function handleUserCommand(command, args, deps) {
  const {
    db,
    bridgeToHandoff,
    getSourceRevision,
    getSafeRequestHistory,
    modelRouter,
    projectDir,
  } = deps;

  switch (command) {
    case 'request': {
      const id = db.createRequest(args.description);
      bridgeToHandoff(id, args.description);
      return { ok: true, request_id: id };
    }

    case 'fix': {
      const fixResult = db.getDb().transaction(() => {
        const id = db.createRequest(args.description);
        db.updateRequest(id, { tier: 2, status: 'decomposed' });
        const taskId = db.createTask({
          request_id: id,
          subject: `Fix: ${args.description}`,
          description: args.description,
          priority: 'urgent',
          tier: 2,
        });
        db.updateTask(taskId, { status: 'ready' });
        return { request_id: id, task_id: taskId };
      })();
      return { ok: true, ...fixResult };
    }

    case 'status': {
      const requests = db.listRequests();
      const workers = db.getAllWorkers();
      const tasks = db.listTasks();
      const project_dir = db.getConfig('project_dir') || '';
      const source_revision = getSourceRevision(project_dir || projectDir || process.cwd());
      const merges = db.getDb().prepare(
        "SELECT * FROM merge_queue WHERE status != 'merged' ORDER BY id DESC"
      ).all();
      const routingBudget = modelRouter.getBudgetState(db.getConfig);
      return {
        ok: true,
        requests,
        workers,
        tasks,
        project_dir,
        source_revision,
        merges,
        budget_state: routingBudget,
        budget_source: routingBudget ? (routingBudget.source || 'none') : 'none',
      };
    }

    case 'clarify': {
      db.sendMail('architect', 'clarification_reply', {
        request_id: args.request_id,
        message: args.message,
      });
      return { ok: true };
    }

    case 'log': {
      const logs = db.getLog(args.limit || 50, args.actor);
      return { ok: true, logs };
    }

    case 'request-history': {
      const requestId = args.request_id;
      const rawLimit = args.limit || 500;
      const limit = Math.max(1, Math.min(rawLimit, 10000));
      const logs = getSafeRequestHistory(requestId, limit);
      return { ok: true, request_id: requestId, logs };
    }

    default:
      throw new Error(`Unknown user command: ${command}`);
  }
}

module.exports = {
  handleUserCommand,
};
