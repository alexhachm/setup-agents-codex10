'use strict';

const db = require('./db');
const insightIngestion = require('./insight-ingestion');

let intervalId = null;
let lastNotifyTs = 0;
let lastResearchNotifyTs = 0;

const NOTIFY_DEDUP_MS = 10000; // Only notify allocator agent once per 10s
const RESEARCH_NOTIFY_DEDUP_MS = 30000; // Notify research-batch planner at most once per 30s

function start(projectDir) {
  const intervalMs = parseInt(db.getConfig('allocator_interval_ms')) || 2000;

  intervalId = setInterval(() => {
    try {
      tick(projectDir);
    } catch (e) {
      db.log('coordinator', 'allocator_error', { error: e.message });
    }
  }, intervalMs);

  db.log('coordinator', 'allocator_started', { interval_ms: intervalMs });
}

function stop() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  lastNotifyTs = 0;
  lastResearchNotifyTs = 0;
}

function tick() {
  // 1. Promote pending tasks whose dependencies are met
  db.checkAndPromoteTasks();

  // 1c. Signal allocator when queued research intents need batch planning
  signalResearchBatchAvailability();

  // 1b. Recover stalled or orphaned assignments so throughput can resume.
  const recoveredAssignments = db.recoverStalledAssignments({
    source: 'allocator_tick',
    include_orphans: true,
    include_heartbeat_stale: true,
  });
  if (recoveredAssignments.length > 0) {
    const reassigned = recoveredAssignments.filter((entry) => entry.outcome === 'reassigned').length;
    const retryExhausted = recoveredAssignments.filter((entry) => entry.outcome === 'failed_retry_exhausted').length;
    db.log('allocator', 'stalled_assignment_recovery', {
      source: 'allocator_tick',
      recovered_assignments: recoveredAssignments.length,
      reassigned,
      retry_exhausted: retryExhausted,
    });
  }

  // 2. Check if there are ready tasks AND idle unclaimed workers
  const readyTasks = db.getReadyTasks();
  if (readyTasks.length === 0) return;

  const idleWorkers = db.getIdleWorkers().filter(w => !w.claimed_by);
  if (idleWorkers.length === 0) return;

  // 3. Notify Master-3 allocator agent (deduped)
  const now = Date.now();
  if (now - lastNotifyTs < NOTIFY_DEDUP_MS) return;

  lastNotifyTs = now;
  db.sendMail('allocator', 'tasks_available', {
    ready_count: readyTasks.length,
    idle_count: idleWorkers.length,
  });
  db.log('allocator', 'tasks_available', {
    ready_count: readyTasks.length,
    idle_count: idleWorkers.length,
  });
}

function signalResearchBatchAvailability() {
  // Check for queued research intents that have no active batch run
  let queuedIntentCount = 0;
  try {
    const row = db.getDb().prepare(
      "SELECT COUNT(*) AS count FROM research_intents WHERE status IN ('queued', 'partial_failed')"
    ).get();
    queuedIntentCount = Number(row && row.count) || 0;
  } catch {
    return; // research_intents table may not exist yet
  }
  if (queuedIntentCount === 0) return;

  // Only signal if no batch is currently running
  let runningBatchCount = 0;
  try {
    const row = db.getDb().prepare(
      "SELECT COUNT(*) AS count FROM research_batches WHERE status = 'running'"
    ).get();
    runningBatchCount = Number(row && row.count) || 0;
  } catch {
    return;
  }
  if (runningBatchCount > 0) return;

  const now = Date.now();
  if (now - lastResearchNotifyTs < RESEARCH_NOTIFY_DEDUP_MS) return;

  lastResearchNotifyTs = now;
  db.sendMail('allocator', 'research_batch_available', {
    queued_intent_count: queuedIntentCount,
  });
  db.log('allocator', 'research_batch_signaled', {
    queued_intent_count: queuedIntentCount,
  });
  insightIngestion.ingestAllocatorEvent('research_batch_available', {
    queued_intent_count: queuedIntentCount,
  });
}

module.exports = { start, stop, tick, signalResearchBatchAvailability };
