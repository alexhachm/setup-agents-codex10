'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const {
  ingestInsight,
  ingestMergeEvent,
  ingestWatchdogEvent,
  ingestAllocatorEvent,
  computeSemanticFingerprint,
} = require('../src/insight-ingestion');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-insight-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper: create a request+task pair and return { reqId, taskId }
function makeRequestTask() {
  const reqId = db.createRequest('Test request');
  const taskId = db.createTask({ request_id: reqId, subject: 'Task', description: 'Desc' });
  return { reqId, taskId };
}

// Helper: enqueue a merge and return the integer merge ID
function makeEnqueueMerge({ reqId, taskId, prSuffix, branch }) {
  const result = db.enqueueMerge({
    request_id: reqId,
    task_id: taskId,
    pr_url: `https://github.com/x/y/pull/${prSuffix}`,
    branch,
  });
  return Number(result.lastInsertRowid);
}

describe('computeSemanticFingerprint', () => {
  it('produces a stable hex string for the same inputs', () => {
    const fp1 = computeSemanticFingerprint('ctx', 'merge_success', 'key1');
    const fp2 = computeSemanticFingerprint('ctx', 'merge_success', 'key1');
    assert.strictEqual(fp1, fp2);
    assert.match(fp1, /^[0-9a-f]{64}$/);
  });

  it('produces different fingerprints for different inputs', () => {
    const fp1 = computeSemanticFingerprint('ctx', 'merge_success', 'key1');
    const fp2 = computeSemanticFingerprint('ctx', 'merge_failed', 'key1');
    assert.notStrictEqual(fp1, fp2);
  });
});

describe('ingestInsight — core', () => {
  it('persists a new insight and returns { created: true }', () => {
    const result = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { branch: 'agent-1', merge_id: 1 },
      semantic_key: 'merge_id:1:event:merge_success',
    });
    assert.strictEqual(result.created, true);
    assert.ok(typeof result.id === 'number' && result.id > 0);
  });

  it('skips duplicate (same semantic key) and returns { created: false, duplicate: true }', () => {
    const semanticKey = 'merge_id:5:event:merge_success';
    ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { branch: 'agent-1', merge_id: 5 },
      semantic_key: semanticKey,
    });

    const result = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { branch: 'agent-1', merge_id: 5 },
      semantic_key: semanticKey,
    });
    assert.strictEqual(result.created, false);
    assert.strictEqual(result.duplicate, true);
    assert.ok(typeof result.id === 'number' && result.id > 0);
  });

  it('allows different semantic keys for the same event type', () => {
    const r1 = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { merge_id: 1 },
      semantic_key: 'merge_id:1:event:merge_success',
    });
    const r2 = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { merge_id: 2 },
      semantic_key: 'merge_id:2:event:merge_success',
    });
    assert.strictEqual(r1.created, true);
    assert.strictEqual(r2.created, true);
    assert.notStrictEqual(r1.id, r2.id);
  });

  it('returns { created: false, error } when project_context_key is missing', () => {
    const result = ingestInsight({
      project_context_key: '',
      event_type: 'merge_success',
      payload: {},
    });
    assert.strictEqual(result.created, false);
    assert.ok(typeof result.error === 'string');
  });

  it('marks partial insights with pending validation_status', () => {
    const result = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'task_recovered',
      payload: { task_id: 10 },
      semantic_key: 'task:10:partial',
      partial: true,
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.validation_status, 'pending');

    // governance_metadata should carry the partial annotation
    const gov = JSON.parse(artifact.governance_metadata || '{}');
    assert.strictEqual(gov.partial, true);
    assert.ok(typeof gov.status_annotation === 'string');
  });

  it('assigns default relevance score from event type', () => {
    const result = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'functional_conflict',
      payload: { merge_id: 99 },
      semantic_key: 'merge_id:99:event:functional_conflict',
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.relevance_score, 850); // from EVENT_RELEVANCE_SCORES
  });

  it('respects explicit relevance_score override', () => {
    const result = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { merge_id: 7 },
      semantic_key: 'merge_id:7:explicit-score',
      relevance_score: 999,
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.relevance_score, 999);
  });

  it('records request_id and task_id provenance links', () => {
    const { reqId, taskId } = makeRequestTask();

    const result = ingestInsight({
      project_context_key: 'test:context',
      event_type: 'merge_success',
      payload: { merge_id: 8 },
      semantic_key: 'merge_id:8:provenance',
      request_id: reqId,
      task_id: taskId,
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.request_id, reqId);
    assert.strictEqual(artifact.task_id, taskId);
  });
});

describe('ingestMergeEvent', () => {
  it('ingests merge_success event', () => {
    const { reqId, taskId } = makeRequestTask();
    const mergeId = makeEnqueueMerge({ reqId, taskId, prSuffix: 1, branch: 'agent-1' });

    const result = ingestMergeEvent('merge_success', {
      merge_id: mergeId,
      request_id: reqId,
      task_id: taskId,
      branch: 'agent-1',
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.artifact_type, 'merge_success');
    assert.strictEqual(artifact.source, 'lifecycle_ingestion');

    const payload = JSON.parse(artifact.artifact_payload || '{}');
    assert.strictEqual(payload.branch, 'agent-1');
    assert.strictEqual(payload.merge_id, mergeId);
  });

  it('ingests merge_failed event with error and tier', () => {
    const { reqId, taskId } = makeRequestTask();
    const mergeId = makeEnqueueMerge({ reqId, taskId, prSuffix: 2, branch: 'agent-2' });

    const result = ingestMergeEvent('merge_failed', {
      merge_id: mergeId,
      request_id: reqId,
      task_id: taskId,
      branch: 'agent-2',
      error: 'conflict on file.js',
      tier: 3,
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    const payload = JSON.parse(artifact.artifact_payload || '{}');
    assert.strictEqual(payload.tier, 3);
    assert.ok(payload.error.includes('conflict'));
  });

  it('ingests functional_conflict event', () => {
    const { reqId, taskId } = makeRequestTask();
    const mergeId = makeEnqueueMerge({ reqId, taskId, prSuffix: 3, branch: 'agent-3' });

    const result = ingestMergeEvent('functional_conflict', {
      merge_id: mergeId,
      request_id: reqId,
      task_id: taskId,
      branch: 'agent-3',
      error: 'validation failed',
    });
    assert.strictEqual(result.created, true);
    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.relevance_score, 850);
  });

  it('deduplicates the same merge event', () => {
    const { reqId, taskId } = makeRequestTask();
    const mergeId = makeEnqueueMerge({ reqId, taskId, prSuffix: 4, branch: 'agent-4' });
    const data = { merge_id: mergeId, request_id: reqId, task_id: taskId, branch: 'agent-4' };
    const r1 = ingestMergeEvent('merge_success', data);
    const r2 = ingestMergeEvent('merge_success', data);
    assert.strictEqual(r1.created, true);
    assert.strictEqual(r2.created, false);
    assert.strictEqual(r2.duplicate, true);
  });

  it('ingests request_completed event (no task_id required)', () => {
    const { reqId } = makeRequestTask();
    const result = ingestMergeEvent('request_completed', {
      request_id: reqId,
      result: 'All 2 PR(s) merged successfully',
    });
    assert.strictEqual(result.created, true);
    const artifact = db.getInsightArtifact(result.id);
    const payload = JSON.parse(artifact.artifact_payload || '{}');
    assert.ok(payload.result.includes('merged'));
  });
});

describe('ingestWatchdogEvent', () => {
  it('ingests worker_death event', () => {
    const { taskId } = makeRequestTask();
    db.registerWorker(1, '/wt-1', 'agent-1');

    const result = ingestWatchdogEvent('worker_death', {
      worker_id: 1,
      task_id: taskId,
      reason: 'heartbeat_timeout',
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.artifact_type, 'worker_death');
    assert.strictEqual(artifact.relevance_score, 800);
  });

  it('ingests loop_respawn event', () => {
    const result = ingestWatchdogEvent('loop_respawn', {
      loop_id: 5,
      reason: 'tmux_pane_dead',
      forced_restart: false,
    });
    assert.strictEqual(result.created, true);
    const artifact = db.getInsightArtifact(result.id);
    const payload = JSON.parse(artifact.artifact_payload || '{}');
    assert.strictEqual(payload.loop_id, 5);
  });

  it('ingests stale_integration_recovered event', () => {
    const { reqId } = makeRequestTask();
    const result = ingestWatchdogEvent('stale_integration_recovered', {
      request_id: reqId,
      reason: 'all_merged',
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.request_id, reqId);
  });

  it('deduplicates worker_death for the same worker+task+reason', () => {
    const { taskId } = makeRequestTask();
    db.registerWorker(2, '/wt-2', 'agent-2');

    const data = { worker_id: 2, task_id: taskId, reason: 'heartbeat_timeout' };
    const r1 = ingestWatchdogEvent('worker_death', data);
    const r2 = ingestWatchdogEvent('worker_death', data);
    assert.strictEqual(r1.created, true);
    assert.strictEqual(r2.duplicate, true);
  });

  it('truncates long string fields to 500 chars', () => {
    const longError = 'x'.repeat(1000);
    const result = ingestWatchdogEvent('worker_death', {
      worker_id: 9,
      task_id: null,
      reason: 'test',
      error: longError,
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    const payload = JSON.parse(artifact.artifact_payload || '{}');
    assert.ok(payload.error.length <= 500);
  });
});

describe('ingestAllocatorEvent', () => {
  it('ingests research_batch_available event', () => {
    const result = ingestAllocatorEvent('research_batch_available', {
      queued_intent_count: 3,
    });
    assert.strictEqual(result.created, true);

    const artifact = db.getInsightArtifact(result.id);
    assert.strictEqual(artifact.artifact_type, 'research_batch_available');
    assert.strictEqual(artifact.relevance_score, 400);
  });

  it('deduplicates research_batch_available events in the same count bucket', () => {
    const r1 = ingestAllocatorEvent('research_batch_available', { queued_intent_count: 2 });
    const r2 = ingestAllocatorEvent('research_batch_available', { queued_intent_count: 4 });
    assert.strictEqual(r1.created, true);
    // Both counts fall in 'small' bucket → second is a duplicate
    assert.strictEqual(r2.created, false);
    assert.strictEqual(r2.duplicate, true);
  });

  it('creates separate insights for different count buckets', () => {
    const r1 = ingestAllocatorEvent('research_batch_available', { queued_intent_count: 3 });
    const r2 = ingestAllocatorEvent('research_batch_available', { queued_intent_count: 10 });
    assert.strictEqual(r1.created, true);
    assert.strictEqual(r2.created, true);
    assert.notStrictEqual(r1.id, r2.id);
  });
});

describe('Partial-failure safety', () => {
  it('returns { created: false, error } without throwing when DB is closed', () => {
    db.close();
    let threw = false;
    let result;
    try {
      result = ingestInsight({
        project_context_key: 'test:context',
        event_type: 'merge_success',
        payload: { merge_id: 999 },
        semantic_key: 'safe_test',
      });
    } catch {
      threw = true;
    }
    assert.strictEqual(threw, false, 'ingestInsight must not throw');
    assert.strictEqual(result.created, false);
    assert.ok(typeof result.error === 'string');

    // Re-open for afterEach cleanup
    db.init(tmpDir);
  });
});
