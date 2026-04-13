'use strict';

function handleMergeObservabilityCommand(command, args, { db }) {
  switch (command) {
    case 'merge-metrics': {
      const metrics = db.getMetrics();
      return { ok: true, metrics };
    }

    case 'merge-health': {
      const healthRows = db.getDb().prepare(
        "SELECT status, COUNT(*) as count FROM merge_queue GROUP BY status"
      ).all();
      const counts = {};
      for (const row of healthRows) counts[row.status] = row.count;
      const circuitBreakerTrips = db.getMetrics().circuit_breaker_trips || 0;
      const selfHealAttempts = db.getMetrics().self_heal_attempts || 0;
      const selfHealSuccesses = db.getMetrics().self_heal_successes || 0;
      const reconciliations = db.getMetrics().merge_queue_reconciliations || 0;
      return {
        ok: true,
        health: {
          pending: counts.pending || 0,
          ready: counts.ready || 0,
          merging: counts.merging || 0,
          merged: counts.merged || 0,
          conflict: counts.conflict || 0,
          failed: counts.failed || 0,
          circuit_breaker_trips: circuitBreakerTrips,
          self_heal_attempts: selfHealAttempts,
          self_heal_successes: selfHealSuccesses,
          merge_queue_reconciliations: reconciliations,
        },
      };
    }

    default:
      throw new Error(`Unknown merge observability command: ${command}`);
  }
}

module.exports = {
  handleMergeObservabilityCommand,
};
