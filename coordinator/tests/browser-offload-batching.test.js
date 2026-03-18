'use strict';

/**
 * Integration tests for quota-efficient browser-research batching.
 *
 * Covers:
 *  - Request bundling (enqueueResearchIntent deduplication)
 *  - Priority scoring behaviour (scoreResearchIntentCandidates)
 *  - Batch-plan materialization and size-cap enforcement
 *  - Timeout negotiation across intents
 *  - Staged execution transitions (markResearchBatchStage)
 *  - Partial-failure fan-out semantics
 *  - Quota-pressure scenarios (many intents, tight batch_size_cap)
 *  - Regression: deduplication prevents wasted deep-research calls
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-batching-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enqueue(overrides = {}) {
  return db.enqueueResearchIntent({
    intent_type: 'browser_research',
    intent_payload: { url: 'https://example.com', query: 'test' },
    priority_score: 500,
    batch_size_cap: 5,
    timeout_window_ms: 120000,
    ...overrides,
  });
}

function enqueueN(n, base = {}) {
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(enqueue({
      intent_payload: { url: `https://example.com/${i}`, query: `q${i}` },
      ...base,
    }));
  }
  return results;
}

// ---------------------------------------------------------------------------
// 1. enqueueResearchIntent — basic enqueueing
// ---------------------------------------------------------------------------

describe('enqueueResearchIntent — basic', () => {
  it('creates a new intent with status=queued', () => {
    const r = enqueue();
    assert.strictEqual(r.created, true);
    assert.strictEqual(r.deduplicated, false);
    const intent = db.getResearchIntent(r.intent.id);
    assert.strictEqual(intent.status, 'queued');
    assert.ok(intent.priority_score >= 500, 'priority_score should be at least 500');
    assert.ok(intent.batch_size_cap >= 1, 'batch_size_cap must be >= 1');
  });

  it('stores request_id and task_id links', () => {
    const reqId = db.createRequest('batch test');
    const taskId = db.createTask({ request_id: reqId, subject: 'T', description: 'D' });
    const r = enqueue({ request_id: reqId, task_id: taskId });
    assert.strictEqual(r.created, true);
    const intent = db.getResearchIntent(r.intent.id);
    assert.strictEqual(String(intent.request_id), String(reqId));
    assert.strictEqual(Number(intent.task_id), taskId);
  });

  it('normalises priority labels to numeric scores', () => {
    // Pass priority_score: null so the priority label is used (not the 500 default)
    const urgent = enqueue({ intent_payload: { q: 'urgent-label' }, priority_score: null, priority: 'urgent' });
    const low = enqueue({ intent_payload: { q: 'low-label' }, priority_score: null, priority: 'low' });
    assert.ok(
      db.getResearchIntent(urgent.intent.id).priority_score >
      db.getResearchIntent(low.intent.id).priority_score,
      '"urgent" should produce a higher priority_score than "low"'
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Deduplication — regression: prevents wasted deep-research calls
// ---------------------------------------------------------------------------

describe('enqueueResearchIntent — deduplication', () => {
  it('returns deduplicated=true when the same payload is re-enqueued', () => {
    const payload = { url: 'https://example.com/dup', query: 'dedup-test' };
    const first = enqueue({ intent_payload: payload });
    const second = enqueue({ intent_payload: payload });
    assert.strictEqual(first.created, true);
    assert.strictEqual(second.deduplicated, true);
    assert.strictEqual(second.intent.id, first.intent.id);
  });

  it('deduplication promotes priority_score to the higher value', () => {
    const payload = { url: 'https://example.com/promote', query: 'promote' };
    enqueue({ intent_payload: payload, priority_score: 300 });
    const second = enqueue({ intent_payload: payload, priority_score: 800 });
    assert.strictEqual(second.deduplicated, true);
    assert.ok(
      second.intent.priority_score >= 800,
      'priority_score should be promoted to the higher value on dedup'
    );
  });

  it('deduplication negotiates batch_size_cap to the stricter (lower) value', () => {
    const payload = { url: 'https://example.com/cap', query: 'cap-dedup' };
    enqueue({ intent_payload: payload, batch_size_cap: 10 });
    const second = enqueue({ intent_payload: payload, batch_size_cap: 2 });
    assert.strictEqual(second.deduplicated, true);
    assert.ok(
      second.intent.batch_size_cap <= 2,
      'batch_size_cap should be the minimum of the two on dedup'
    );
  });

  it('different payloads produce separate intents', () => {
    const a = enqueue({ intent_payload: { q: 'alpha' } });
    const b = enqueue({ intent_payload: { q: 'beta' } });
    assert.notStrictEqual(a.intent.id, b.intent.id);
    assert.strictEqual(a.created, true);
    assert.strictEqual(b.created, true);
  });
});

// ---------------------------------------------------------------------------
// 3. Priority scoring
// ---------------------------------------------------------------------------

describe('scoreResearchIntentCandidates', () => {
  it('returns candidates sorted by score descending', () => {
    enqueue({ intent_payload: { q: 'low' }, priority_score: 200 });
    enqueue({ intent_payload: { q: 'high' }, priority_score: 900 });
    enqueue({ intent_payload: { q: 'mid' }, priority_score: 500 });
    const scored = db.scoreResearchIntentCandidates();
    assert.ok(scored.length >= 3);
    for (let i = 1; i < scored.length; i++) {
      assert.ok(
        scored[i - 1].candidate_score >= scored[i].candidate_score,
        `row ${i - 1} candidate_score should be >= row ${i}`
      );
    }
  });

  it('assigns execution_rank starting at 1 in score order', () => {
    enqueue({ intent_payload: { q: 'x1' }, priority_score: 100 });
    enqueue({ intent_payload: { q: 'x2' }, priority_score: 900 });
    const scored = db.scoreResearchIntentCandidates();
    scored.forEach((row, idx) => {
      assert.strictEqual(row.execution_rank, idx + 1);
    });
  });

  it('respects the limit option', () => {
    enqueueN(6, { priority_score: 500 });
    const scored = db.scoreResearchIntentCandidates({ limit: 3 });
    assert.strictEqual(scored.length, 3);
  });

  it('respects research_batch_candidate_limit config', () => {
    db.setConfig('research_batch_candidate_limit', '2');
    enqueueN(5, { priority_score: 500 });
    const scored = db.scoreResearchIntentCandidates();
    assert.ok(scored.length <= 2);
  });

  it('excludes non-candidate statuses', () => {
    const r = enqueue({ intent_payload: { q: 'planned' } });
    // Manually put the intent into 'planned' status via a batch plan
    db.materializeResearchBatchPlan();
    const planned = db.getResearchIntent(r.intent.id);
    assert.strictEqual(planned.status, 'planned');

    const scored = db.scoreResearchIntentCandidates({ statuses: ['queued'] });
    assert.strictEqual(scored.find(c => c.id === r.intent.id), undefined,
      'planned intent should not appear in queued-only scoring');
  });
});

// ---------------------------------------------------------------------------
// 4. Batch plan materialization — size cap enforcement
// ---------------------------------------------------------------------------

describe('materializeResearchBatchPlan — size cap', () => {
  it('returns empty plan when no candidates', () => {
    const plan = db.materializeResearchBatchPlan();
    assert.strictEqual(plan.candidate_count, 0);
    assert.strictEqual(plan.batch_count, 0);
    assert.deepStrictEqual(plan.batches, []);
  });

  it('packs intents into a single batch when count <= cap', () => {
    enqueueN(3, { batch_size_cap: 5 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    assert.strictEqual(plan.batch_count, 1);
    assert.strictEqual(plan.batches[0].intent_ids.length, 3);
  });

  it('splits into multiple batches when intents exceed cap', () => {
    enqueueN(6, { batch_size_cap: 5 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 2 });
    // 6 intents, cap=2 => should produce 3 batches
    assert.strictEqual(plan.batch_count, 3);
    plan.batches.forEach(b => assert.ok(b.intent_ids.length <= 2));
  });

  it('respects per-intent batch_size_cap even if global cap is larger', () => {
    // Two intents each with cap=1 and global cap=10 => 2 separate batches
    enqueue({ intent_payload: { q: 'cap1a' }, batch_size_cap: 1 });
    enqueue({ intent_payload: { q: 'cap1b' }, batch_size_cap: 1 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 10 });
    assert.strictEqual(plan.batch_count, 2);
    plan.batches.forEach(b => assert.strictEqual(b.intent_ids.length, 1));
  });

  it('transitions all included intents from queued to planned', () => {
    enqueueN(3, { batch_size_cap: 5 });
    db.materializeResearchBatchPlan({ max_batch_size: 5 });
    // scoreResearchIntentCandidates only returns 'queued'/'partial_failed' by default
    const remaining = db.scoreResearchIntentCandidates();
    assert.strictEqual(remaining.length, 0, 'all queued intents should be planned after materialization');
  });
});

// ---------------------------------------------------------------------------
// 5. Timeout negotiation
// ---------------------------------------------------------------------------

describe('materializeResearchBatchPlan — timeout negotiation', () => {
  it('batch timeout_window_ms is the minimum of global and per-intent timeouts', () => {
    enqueue({ intent_payload: { q: 't1' }, timeout_window_ms: 60000 });
    enqueue({ intent_payload: { q: 't2' }, timeout_window_ms: 30000 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5, timeout_window_ms: 120000 });
    // Min of 60000, 30000, 120000 = 30000
    assert.ok(plan.batches[0].timeout_window_ms <= 30000,
      'batch timeout should be constrained to the smallest requested');
  });

  it('uses global timeout when per-intent timeout is higher', () => {
    enqueue({ intent_payload: { q: 'tg' }, timeout_window_ms: 600000 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5, timeout_window_ms: 15000 });
    assert.ok(plan.batches[0].timeout_window_ms <= 15000);
  });
});

// ---------------------------------------------------------------------------
// 6. Staged execution transitions — markResearchBatchStage
// ---------------------------------------------------------------------------

describe('markResearchBatchStage — execution transitions', () => {
  function planAndGetStage() {
    enqueue({ intent_payload: { q: 'stage-test' } });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    const batch = plan.batches[0];
    const stages = db.listResearchBatchStages(batch.batch_id);
    return { batch, stage: stages[0] };
  }

  it('transitions planned→running and reflects on batch and intent', () => {
    const { batch, stage } = planAndGetStage();
    const result = db.markResearchBatchStage({ stage_id: stage.id, status: 'running' });
    assert.strictEqual(result.stage.status, 'running');
    assert.strictEqual(result.intent.status, 'running');
    assert.ok(['running', 'planned'].includes(result.batch.status));
  });

  it('transitions running→completed and marks intent completed', () => {
    const { stage } = planAndGetStage();
    db.markResearchBatchStage({ stage_id: stage.id, status: 'running' });
    const result = db.markResearchBatchStage({ stage_id: stage.id, status: 'completed' });
    assert.strictEqual(result.stage.status, 'completed');
    assert.strictEqual(result.intent.status, 'completed');
    assert.strictEqual(result.batch.status, 'completed');
  });

  it('rejects invalid stage transitions', () => {
    const { stage } = planAndGetStage();
    // planned → completed is valid, but completed → running is not
    db.markResearchBatchStage({ stage_id: stage.id, status: 'completed' });
    assert.throws(
      () => db.markResearchBatchStage({ stage_id: stage.id, status: 'running' }),
      /invalid.*transition/i
    );
  });

  it('rejects unknown stage status', () => {
    const { stage } = planAndGetStage();
    assert.throws(
      () => db.markResearchBatchStage({ stage_id: stage.id, status: 'bogus' }),
      /invalid.*status/i
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Partial-failure fan-out semantics
// ---------------------------------------------------------------------------

describe('markResearchBatchStage — partial-failure fan-out', () => {
  function planWithFanout() {
    db.enqueueResearchIntent({
      intent_type: 'browser_research',
      intent_payload: { q: 'fanout-test' },
      priority_score: 500,
      batch_size_cap: 5,
      timeout_window_ms: 120000,
      fanout_targets: [
        { fanout_key: 'worker-A' },
        { fanout_key: 'worker-B' },
        { fanout_key: 'worker-C' },
      ],
    });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    const batch = plan.batches[0];
    const stages = db.listResearchBatchStages(batch.batch_id);
    return { batch, stage: stages[0] };
  }

  it('partial success: completing only some fanout keys leaves intent partial_failed', () => {
    const { stage } = planWithFanout();
    db.markResearchBatchStage({ stage_id: stage.id, status: 'running' });
    const result = db.markResearchBatchStage({
      stage_id: stage.id,
      status: 'completed',
      completed_fanout_keys: [{ fanout_key: 'worker-A' }],
      // worker-B and worker-C not completed
    });
    // Unresolved fanout => stage / intent becomes partial_failed, not completed
    assert.notStrictEqual(result.stage.status, 'completed',
      'stage should not be completed when fanout keys are unresolved');
    assert.ok(
      ['partial_failed', 'running'].includes(result.intent.status),
      `intent status should reflect partial failure, got: ${result.intent.status}`
    );
    assert.ok(result.unresolved_fanout_count > 0, 'should report unresolved fanout targets');
  });

  it('all fanout keys completed => intent marked completed', () => {
    const { stage } = planWithFanout();
    db.markResearchBatchStage({ stage_id: stage.id, status: 'running' });
    const result = db.markResearchBatchStage({
      stage_id: stage.id,
      status: 'completed',
      completed_fanout_keys: [
        { fanout_key: 'worker-A' },
        { fanout_key: 'worker-B' },
        { fanout_key: 'worker-C' },
      ],
    });
    assert.strictEqual(result.intent.status, 'completed');
    assert.strictEqual(result.unresolved_fanout_count, 0);
  });

  it('explicit failure with no keys marks all pending fanout as partial_failed', () => {
    const { stage } = planWithFanout();
    db.markResearchBatchStage({ stage_id: stage.id, status: 'running' });
    const result = db.markResearchBatchStage({
      stage_id: stage.id,
      status: 'failed',
      error: 'network timeout',
    });
    // With fanout targets, failed is promoted to partial_failed
    assert.ok(
      ['partial_failed', 'failed'].includes(result.stage.status),
      `expected partial_failed or failed, got: ${result.stage.status}`
    );
    const fanout = db.listResearchIntentFanout(result.intent.id);
    const anyFailed = fanout.some(f => ['partial_failed', 'failed'].includes(f.status));
    assert.ok(anyFailed, 'at least one fanout entry should be in a failure state');
  });

  it('batch rolls up to partial_failed when any stage is partial_failed', () => {
    // Two intents in the same batch: first fails, second completes
    db.enqueueResearchIntent({
      intent_type: 'browser_research',
      intent_payload: { q: 'rollup-fail' },
      priority_score: 500,
      batch_size_cap: 5,
      timeout_window_ms: 120000,
    });
    db.enqueueResearchIntent({
      intent_type: 'browser_research',
      intent_payload: { q: 'rollup-ok' },
      priority_score: 500,
      batch_size_cap: 5,
      timeout_window_ms: 120000,
    });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    const stages = db.listResearchBatchStages(plan.batches[0].batch_id);
    assert.strictEqual(stages.length, 2);

    db.markResearchBatchStage({ stage_id: stages[0].id, status: 'running' });
    db.markResearchBatchStage({ stage_id: stages[0].id, status: 'failed', error: 'oops' });
    db.markResearchBatchStage({ stage_id: stages[1].id, status: 'running' });
    const r = db.markResearchBatchStage({ stage_id: stages[1].id, status: 'completed' });
    assert.ok(
      ['partial_failed', 'failed'].includes(r.batch.status),
      `batch should be partial_failed when a stage failed, got: ${r.batch.status}`
    );
  });
});

// ---------------------------------------------------------------------------
// 8. Quota-pressure scenarios
// ---------------------------------------------------------------------------

describe('Quota-pressure scenarios', () => {
  it('many intents with tight global cap produce proportionally more batches', () => {
    const N = 10;
    enqueueN(N, { batch_size_cap: 5 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 2 });
    // 10 intents / 2 per batch = 5 batches
    assert.strictEqual(plan.batch_count, 5);
    assert.strictEqual(plan.candidate_count, N);
    plan.batches.forEach(b => assert.ok(b.intent_ids.length <= 2));
  });

  it('quota pressure: restricting candidate_limit prevents over-scheduling', () => {
    enqueueN(10, { priority_score: 500 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5, candidate_limit: 3 });
    // Only 3 candidates selected => 1 batch of 3
    assert.strictEqual(plan.candidate_count, 3);
    assert.strictEqual(plan.batch_count, 1);
    assert.strictEqual(plan.batches[0].intent_ids.length, 3);
    // 7 intents remain queued (not materialized)
    const remaining = db.scoreResearchIntentCandidates();
    assert.strictEqual(remaining.length, 7);
  });

  it('high-priority intents are selected first under quota pressure', () => {
    enqueue({ intent_payload: { q: 'low-p' }, priority_score: 100 });
    enqueue({ intent_payload: { q: 'high-p' }, priority_score: 900 });
    enqueue({ intent_payload: { q: 'mid-p' }, priority_score: 500 });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5, candidate_limit: 1 });
    assert.strictEqual(plan.candidate_count, 1);
    const selectedIntent = db.getResearchIntent(plan.batches[0].intent_ids[0]);
    assert.ok(
      selectedIntent.priority_score >= 900,
      'highest-priority intent should be selected under quota pressure'
    );
  });

  it('second materialize call after first batch skips already-planned intents', () => {
    enqueueN(4, { batch_size_cap: 5 });
    const plan1 = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    assert.strictEqual(plan1.candidate_count, 4);

    // All 4 are now 'planned', not 'queued'
    const plan2 = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    assert.strictEqual(plan2.candidate_count, 0, 'no new candidates after all are planned');
    assert.strictEqual(plan2.batch_count, 0);
  });

  it('partial_failed intents re-enter the candidate pool', () => {
    // Need at least one fanout target to leave unresolved items that drive partial_failed status
    const r = db.enqueueResearchIntent({
      intent_type: 'browser_research',
      intent_payload: { q: 're-entry' },
      priority_score: 500,
      batch_size_cap: 5,
      timeout_window_ms: 120000,
      fanout_targets: [{ fanout_key: 'target-A' }, { fanout_key: 'target-B' }],
    });
    const plan1 = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    const stages = db.listResearchBatchStages(plan1.batches[0].batch_id);
    db.markResearchBatchStage({ stage_id: stages[0].id, status: 'running' });
    // Complete only one fanout key — target-B remains unresolved → partial_failed
    db.markResearchBatchStage({
      stage_id: stages[0].id,
      status: 'completed',
      completed_fanout_keys: [{ fanout_key: 'target-A' }],
    });

    const intent = db.getResearchIntent(r.intent.id);
    assert.strictEqual(intent.status, 'partial_failed',
      'intent should be partial_failed when some fanout keys remain unresolved');

    // partial_failed is in candidate pool for re-scheduling
    const scored = db.scoreResearchIntentCandidates({ statuses: ['queued', 'partial_failed'] });
    assert.ok(scored.find(c => c.id === r.intent.id),
      'partial_failed intent should be available for re-scheduling');
  });
});

// ---------------------------------------------------------------------------
// 9. Regression guard — no duplicate deep-research calls
// ---------------------------------------------------------------------------

describe('Regression: no duplicate deep-research calls', () => {
  it('re-enqueueing the same URL query does not create a second active intent', () => {
    const payload = { url: 'https://example.com/guard', query: 'regression' };
    const a = enqueue({ intent_payload: payload });
    const b = enqueue({ intent_payload: payload });
    const c = enqueue({ intent_payload: payload });
    assert.strictEqual(a.created, true);
    assert.strictEqual(b.deduplicated, true);
    assert.strictEqual(c.deduplicated, true);
    assert.strictEqual(b.intent.id, a.intent.id);
    assert.strictEqual(c.intent.id, a.intent.id);

    // Only one intent in the DB for this fingerprint
    const all = db.scoreResearchIntentCandidates();
    const matching = all.filter(i => i.id === a.intent.id);
    assert.strictEqual(matching.length, 1, 'exactly one intent should exist for deduplicated payload');
  });

  it('a completed intent does not block a fresh re-enqueue of the same payload', () => {
    const payload = { url: 'https://example.com/fresh', query: 'fresh-rerun' };
    const first = enqueue({ intent_payload: payload });
    const plan = db.materializeResearchBatchPlan({ max_batch_size: 5 });
    const stages = db.listResearchBatchStages(plan.batches[0].batch_id);
    db.markResearchBatchStage({ stage_id: stages[0].id, status: 'running' });
    db.markResearchBatchStage({ stage_id: stages[0].id, status: 'completed' });
    const completed = db.getResearchIntent(first.intent.id);
    assert.strictEqual(completed.status, 'completed');

    // Completed status is NOT in active statuses, so a new enqueue creates a fresh intent
    const second = enqueue({ intent_payload: payload });
    assert.strictEqual(second.created, true,
      'should create a new intent after the previous one is completed');
    assert.notStrictEqual(second.intent.id, first.intent.id);
  });
});
