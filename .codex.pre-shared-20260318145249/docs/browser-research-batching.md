# Browser-Research Batching — Operator Guide

> Applies to: `coordinator` ≥ commit `98f7d34` (2026-03-16+)

---

## Overview

The coordinator groups browser-research intents into **batches** before dispatching them to the browser-offload subsystem. Batching reduces wasted deep-research quota by:

1. **Deduplicating** identical intents so the same URL+query is fetched only once.
2. **Capping** the number of concurrent research runs with `batch_size_cap`.
3. **Negotiating** timeout windows so the tightest constraint wins.
4. **Staging** execution so partial failures can be retried without re-running succeeded intents.

---

## Key Concepts

### Intent lifecycle

```
[queued] ──plan──► [planned] ──start──► [running] ──► [completed]
                                                └──► [partial_failed] ──re-plan──► [planned]
                                                └──► [failed]
                                                └──► [cancelled]
```

### Batch lifecycle

```
[planned] ──► [running] ──► [completed | partial_failed | failed | timed_out | cancelled]
```

A batch rolls up to `partial_failed` if **any** stage in it fails; it rolls up to `completed` only when every stage completes.

### Fan-out targets

An intent may carry **fan-out targets** (e.g. multiple downstream workers). The stage is marked `completed` only when all fan-out keys are resolved. If some targets succeed and others fail, the intent becomes `partial_failed`, not `completed`.

---

## Configuration Knobs

All values are stored in the coordinator SQLite config table (`setConfig` / `getConfig`).

| Key | Default | Description |
|-----|---------|-------------|
| `research_batch_max_size` | `5` | Maximum intents per batch (hard cap). |
| `research_batch_timeout_ms` | `120000` (2 min) | Default wall-clock timeout per batch window in ms. |
| `research_batch_candidate_limit` | `200` | Max candidates to score per materialization pass. |

### Tuning guidance

**`research_batch_max_size`**
- Lower values (1–3) reduce blast radius when a batch fails, at the cost of more round-trips.
- Higher values (10–20) improve throughput under heavy load but increase quota burn if the batch errors.
- Recommended starting point: **5**.

**`research_batch_timeout_ms`**
- Set to 1.5× the expected p95 research latency for your workload.
- Under quota pressure, use a shorter timeout (e.g. 30 000 ms) to shed slow queries quickly.
- The effective timeout for a stage is `min(global_timeout, intent.timeout_window_ms)`.

**`research_batch_candidate_limit`**
- Controls how many queued/partial-failed intents are scored per planning pass.
- Increase to `500`–`1000` if you observe backlog lag on high-volume deployments.
- Decrease to `20`–`50` to throttle scheduling when quota is constrained.

### Example: applying config changes

```bash
# Tighten batch size to 2 (conservative quota usage)
mac10 set-config research_batch_max_size 2

# Shorten batch timeout to 30 seconds
mac10 set-config research_batch_timeout_ms 30000

# Limit candidate pool to 50 to reduce over-scheduling
mac10 set-config research_batch_candidate_limit 50
```

---

## Observability

### Log events

The coordinator emits structured log entries (`actor = 'coordinator'` or `'allocator'`). Key events:

| Event type | Meaning |
|-----------|---------|
| `research_intent_enqueued` | A new intent was created. |
| `research_intent_deduplicated` | Duplicate intent was merged into an existing one. |
| `research_batch_plan_materialized` | A planning pass created N batches from M candidates. |
| `research_batch_stage_marked` | A stage transition was recorded (running, completed, partial_failed, …). |
| `research_batch_signaled` | Allocator tick noticed queued intents and sent `research_batch_available` mail. |

### Querying current state

```sql
-- Queued/partial-failed intents (pending scheduling)
SELECT id, intent_type, priority_score, batch_size_cap, timeout_window_ms, status
FROM research_intents
WHERE status IN ('queued', 'partial_failed')
ORDER BY priority_score DESC;

-- Active batches
SELECT id, planner_key, status, max_batch_size, planned_intent_count, created_at
FROM research_batches
WHERE status NOT IN ('completed', 'failed', 'cancelled');

-- Stage breakdown for a batch (replace <batch_id>)
SELECT id, intent_id, stage_name, execution_order, status, failure_count, last_error
FROM research_batch_stages
WHERE batch_id = <batch_id>
ORDER BY execution_order;

-- Fan-out status for an intent (replace <intent_id>)
SELECT fanout_key, status, attempt_count, last_error
FROM research_intent_fanout
WHERE intent_id = <intent_id>;
```

---

## Priority Scoring

Candidates are ranked by `candidate_score`:

```
candidate_score = priority_score + (age_seconds × 0.001)
```

Priority labels map to base scores:

| Label | Score |
|-------|-------|
| `urgent` | 1000 |
| `high` | 800 |
| `normal` | 500 |
| `low` | 200 |

The age bonus prevents starvation: a `low`-priority intent enqueued 6+ days ago accumulates ~518 points, eventually competing with `normal` intents.

**Deduplication and priority promotion**: when a duplicate intent is enqueued with a *higher* priority, the existing intent's `priority_score` is raised to the new value. The `batch_size_cap` is *lowered* to the stricter (smaller) of the two values.

---

## Recovery Playbooks

### Scenario 1 — Batch stuck in `planned` (never started)

**Cause**: Allocator was restarted, or no `research_batch_available` signal was delivered.

**Resolution**:
1. Check whether any `running` batches exist:
   ```sql
   SELECT COUNT(*) FROM research_batches WHERE status = 'running';
   ```
2. If none, the allocator tick will re-signal on the next cycle (every 30 s). Wait one cycle.
3. If the allocator is not running, restart it:
   ```bash
   mac10 restart-coordinator
   ```

### Scenario 2 — Intent stuck in `partial_failed`

**Cause**: A transient error (network timeout, quota exceeded) left some fan-out targets unresolved.

**Resolution**:
1. Inspect the intent's fan-out table:
   ```sql
   SELECT * FROM research_intent_fanout WHERE intent_id = <id>;
   ```
2. If the targets are stale, the intent will be re-scored and re-batched on the next planning pass (since `partial_failed` is in the candidate pool).
3. To force an immediate re-plan:
   ```bash
   # Trigger a tick (resets research_notify dedup timer on restart)
   mac10 restart-coordinator
   ```

### Scenario 3 — Runaway quota burn (too many parallel deep-research calls)

**Cause**: `research_batch_max_size` is too large, or many intents are being enqueued without dedup.

**Resolution**:
1. Lower the global batch cap immediately:
   ```bash
   mac10 set-config research_batch_max_size 1
   ```
2. Identify duplicate-enqueue callers (look for low `deduplicated` rates in logs):
   ```sql
   SELECT COUNT(*) AS total, SUM(CASE WHEN ... THEN 1 END) AS deduped
   FROM coordinator_logs WHERE event = 'research_intent_enqueued' OR event = 'research_intent_deduplicated';
   ```
3. Cancel all active batches if necessary (manual DB update):
   ```sql
   UPDATE research_batches SET status = 'cancelled' WHERE status IN ('planned', 'running');
   UPDATE research_batch_stages SET status = 'cancelled' WHERE status IN ('planned', 'running');
   UPDATE research_intents SET status = 'cancelled' WHERE status IN ('planned', 'running');
   ```
4. Review and fix the enqueue callers, then re-enqueue with proper dedup fingerprints.

### Scenario 4 — Old planned intents never materializing (backlog drain lag)

**Cause**: `research_batch_candidate_limit` is too small relative to queue depth; or the allocator tick interval is too infrequent.

**Resolution**:
1. Raise the candidate limit:
   ```bash
   mac10 set-config research_batch_candidate_limit 500
   ```
2. Lower the allocator tick interval (default 2 000 ms):
   ```bash
   mac10 set-config allocator_interval_ms 1000
   ```
3. Monitor the `research_batch_plan_materialized` log event's `candidate_count` to verify drain progress.

---

## Regression Protection

The test suite in `coordinator/tests/browser-offload-batching.test.js` guards against:

- Re-enqueueing the same URL/query creating duplicate active intents.
- `partial_failed` intents re-entering the candidate pool (retry path works).
- Quota-pressure scenarios: `candidate_limit` correctly caps deep-research scheduling.
- Timeout negotiation: batch window is always the minimum across all intents.
- Fan-out partial success not being mis-reported as full completion.

Run tests with:

```bash
cd coordinator && npm test
```

---

## Schema Reference

| Table | Purpose |
|-------|---------|
| `research_intents` | One row per unique research intent; tracks dedup fingerprint, priority, lifecycle status. |
| `research_batches` | One row per planning batch; tracks size cap, timeout, and aggregate status. |
| `research_batch_stages` | Junction between batch and intent; records per-stage execution order, status, and error. |
| `research_intent_fanout` | Optional fan-out targets for an intent; enables partial-success tracking per downstream consumer. |
