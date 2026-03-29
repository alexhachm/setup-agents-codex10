'use strict';

const db = require('./db');

let intervalId = null;
let _handlers = null;

// ── Lifecycle ────────────────────────────────────────────────────────────────

function start(projectDir, handlers) {
  _handlers = handlers || {};
  const intervalMs = parseInt(db.getConfig('allocator_interval_ms')) || 2000;

  intervalId = setInterval(() => {
    runTickSafely(projectDir, 'interval');
  }, intervalMs);

  // Run an immediate pass so restart/recovery does not wait for the first interval.
  runTickSafely(projectDir, 'startup');

  db.log('coordinator', 'allocator_started', { interval_ms: intervalMs });
}

function stop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  _handlers = null;
}

// ── Tick ─────────────────────────────────────────────────────────────────────

function tick() {
  // 1. Promote pending tasks whose dependencies are met
  db.checkAndPromoteTasks();

  // 2. Recover stalled or orphaned assignments so throughput can resume.
  const recoveredAssignments = db.recoverStalledAssignments({
    source: 'allocator_tick',
    include_orphans: true,
    include_heartbeat_stale: true,
  });
  if (recoveredAssignments.length > 0) {
    const reassigned = recoveredAssignments.filter((e) => e.outcome === 'reassigned').length;
    const retryExhausted = recoveredAssignments.filter((e) => e.outcome === 'failed_retry_exhausted').length;
    db.log('allocator', 'stalled_assignment_recovery', {
      source: 'allocator_tick',
      recovered_assignments: recoveredAssignments.length,
      reassigned,
      retry_exhausted: retryExhausted,
    });
  }

  // 3. Deterministic assignment: match ready tasks to idle workers
  assignReadyTasks();
}

// ── Deterministic Assignment ─────────────────────────────────────────────────

function assignReadyTasks() {
  const readyTasks = db.getReadyTasks();
  if (readyTasks.length === 0) return;

  const idleWorkers = db.getIdleWorkers().filter(w => !w.claimed_by);
  if (idleWorkers.length === 0) return;

  const available = [...idleWorkers];

  for (const task of readyTasks) {
    if (available.length === 0) break;
    const workerIdx = matchWorker(task, available);
    if (workerIdx === -1) continue;
    const worker = available[workerIdx];
    if (performAssignment(task, worker)) {
      available.splice(workerIdx, 1);
    }
  }
}

/**
 * Pick the best idle worker for a task using deterministic rules:
 *  1. Domain match — worker whose last domain matches the task domain
 *  2. File overlap — worker whose last task shares files with this task
 *  3. Fallback — least loaded worker (lowest tasks_completed)
 */
function matchWorker(task, idleWorkers) {
  if (idleWorkers.length === 0) return -1;
  if (idleWorkers.length === 1) return 0;

  const taskDomain = task.domain || null;
  let taskFiles = null;
  try { taskFiles = task.files ? JSON.parse(task.files) : null; } catch {}

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < idleWorkers.length; i++) {
    const w = idleWorkers[i];
    let score = 0;

    // Rule 1: Domain match (strong signal)
    if (taskDomain && w.domain && w.domain === taskDomain) {
      score += 100;
    }

    // Rule 2: File overlap (check last task's files if available)
    if (taskFiles && taskFiles.length > 0 && w.current_task_id) {
      try {
        const lastTask = db.getTask(w.current_task_id);
        if (lastTask && lastTask.files) {
          const lastFiles = JSON.parse(lastTask.files);
          const overlap = taskFiles.filter(f => lastFiles.includes(f)).length;
          score += overlap * 10;
        }
      } catch {}
    }

    // Rule 3: Load balance — prefer less-loaded workers (tiebreaker, capped so domain match always wins)
    const completed = w.tasks_completed || 0;
    score -= Math.min(completed, 50);

    if (score > bestScore || bestIdx === -1) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Atomically assign task to worker, spawn via handler, notify Master-3.
 * Returns true on success, false on failure (task or worker state changed).
 */
function performAssignment(task, worker) {
  const result = db.getDb().transaction(() => {
    const freshTask = db.getTask(task.id);
    const freshWorker = db.getWorker(worker.id);
    if (!freshTask || freshTask.status !== 'ready' || freshTask.assigned_to) {
      return { ok: false, reason: 'task_not_ready' };
    }
    if (!freshWorker || freshWorker.status !== 'idle') {
      return { ok: false, reason: 'worker_not_idle' };
    }
    if (freshWorker.claimed_by != null) {
      return { ok: false, reason: 'worker_claimed' };
    }

    db.updateTask(task.id, { status: 'assigned', assigned_to: worker.id });
    db.updateWorker(worker.id, {
      status: 'assigned',
      current_task_id: task.id,
      domain: task.domain || freshWorker.domain,
      launched_at: new Date().toISOString(),
    });
    return { ok: true, prevTask: freshTask, prevWorker: freshWorker };
  })();

  if (!result.ok) {
    db.log('allocator', 'assignment_skipped', {
      task_id: task.id,
      worker_id: worker.id,
      reason: result.reason,
    });
    return false;
  }

  // Spawn worker via handler
  if (_handlers && _handlers.onAssignTask) {
    try {
      const assignedTask = db.getTask(task.id);
      const assignedWorker = db.getWorker(worker.id);
      _handlers.onAssignTask(assignedTask, assignedWorker);
    } catch (spawnErr) {
      // Rollback assignment on spawn failure
      db.getDb().transaction(() => {
        db.updateTask(task.id, {
          status: result.prevTask.status,
          assigned_to: result.prevTask.assigned_to,
        });
        db.updateWorker(worker.id, {
          status: result.prevWorker.status,
          current_task_id: result.prevWorker.current_task_id,
          domain: result.prevWorker.domain,
          launched_at: result.prevWorker.launched_at,
        });
      })();
      db.log('allocator', 'assignment_spawn_failed', {
        task_id: task.id,
        worker_id: worker.id,
        error: spawnErr.message,
      });
      return false;
    }
  }

  // Send mail to worker
  const assignedTask = db.getTask(task.id);
  db.sendMail(`worker-${worker.id}`, 'task_assigned', {
    task_id: task.id,
    subject: assignedTask.subject,
    description: assignedTask.description,
    domain: assignedTask.domain,
    files: assignedTask.files,
    tier: assignedTask.tier,
    request_id: assignedTask.request_id,
    validation: assignedTask.validation,
  });

  // Notify Master-3 so it maintains awareness
  db.sendMail('allocator', 'task_assigned_notification', {
    task_id: task.id,
    worker_id: worker.id,
    domain: task.domain,
    subject: task.subject,
  });

  db.log('allocator', 'task_assigned', {
    task_id: task.id,
    worker_id: worker.id,
    domain: task.domain,
  });

  return true;
}

// ── Exports ──────────────────────────────────────────────────────────────────

function runTickSafely(projectDir, phase = 'interval') {
  try {
    tick();
  } catch (e) {
    db.log('coordinator', 'allocator_error', {
      error: e.message,
      phase,
    });
  }
}

module.exports = { start, stop, tick, matchWorker, performAssignment };
