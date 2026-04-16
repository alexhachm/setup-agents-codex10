'use strict';

/**
 * CLI commands: mac10 approve, mac10 deny, mac10 todo
 *
 * mac10 approve <id> [--reason <text>]  — approve a pending confirmation
 * mac10 deny <id> [--reason <text>]     — deny a pending confirmation
 * mac10 todo                            — list pending confirmations & tasks
 */

const confirmations = require('../db/confirmations');
const db = require('../db');

function runApprove(args, projectDir) {
  const id = parseInt(args[0], 10);
  if (isNaN(id)) {
    return { error: 'Usage: mac10 approve <confirmation_id> [--reason <text>]' };
  }

  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx >= 0 ? args.slice(reasonIdx + 1).join(' ') : null;

  const success = confirmations.approveConfirmation(id, 'user', reason);
  if (!success) {
    return { error: `Confirmation ${id} not found or not pending` };
  }
  return { id, status: 'approved', reason };
}

function runDeny(args, projectDir) {
  const id = parseInt(args[0], 10);
  if (isNaN(id)) {
    return { error: 'Usage: mac10 deny <confirmation_id> [--reason <text>]' };
  }

  const reasonIdx = args.indexOf('--reason');
  const reason = reasonIdx >= 0 ? args.slice(reasonIdx + 1).join(' ') : null;

  const success = confirmations.denyConfirmation(id, 'user', reason);
  if (!success) {
    return { error: `Confirmation ${id} not found or not pending` };
  }
  return { id, status: 'denied', reason };
}

function runTodo(args, projectDir) {
  const pending = confirmations.getPendingConfirmations();
  const tasks = [];
  try {
    const readyTasks = db.getReadyTasks();
    for (const task of readyTasks) {
      tasks.push({
        id: task.id,
        subject: task.subject,
        status: task.status,
        priority: task.priority,
      });
    }
  } catch {}

  return {
    confirmations: pending.map(c => ({
      id: c.id,
      type: c.action_type,
      description: c.action_description,
      requester: c.requester,
      created_at: c.created_at,
      expires_at: c.expires_at,
    })),
    tasks,
  };
}

function runEmergencyStop(args, projectDir) {
  // Stop all workers
  try {
    const workers = db.getAllWorkers();
    for (const worker of workers) {
      if (worker.status !== 'idle') {
        db.updateWorker(worker.id, { status: 'idle', current_task_id: null });
      }
    }
    db.log('coordinator', 'emergency_stop', { initiated_by: 'user' });
    return { message: 'Emergency stop executed. All workers set to idle.', workers_stopped: workers.length };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = {
  runApprove,
  runDeny,
  runTodo,
  runEmergencyStop,
};
