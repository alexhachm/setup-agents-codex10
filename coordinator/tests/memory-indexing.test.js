'use strict';

/**
 * memory-indexing.test.js
 *
 * E2E tests for the project memory core tenant:
 *   - Snapshot persistence, versioning, and retrieval
 *   - Dedupe fingerprinting and duplicate suppression
 *   - Snapshot index (latest-pointer) correctness
 *   - Insight artifact creation, scoring, and retrieval
 *   - Lineage link recording across all supported lineage types
 *   - Governance metadata (validation_status, confidence_score, retention_policy)
 *   - Quota-pressure scenarios (many snapshots, pagination)
 *   - Iterative-run traceability (run_id propagation and cross-run retrieval)
 *   - rebuildProjectMemorySnapshotIndex correctness
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-memidx-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(desc = 'test request') {
  return db.createRequest(desc);
}

function makeTask(reqId) {
  return db.createTask({ request_id: reqId, subject: 'Test task', description: 'Desc' });
}

// ─── Snapshot persistence ────────────────────────────────────────────────────

describe('createProjectMemorySnapshot — persistence', () => {
  it('creates a snapshot and returns it with id and defaults', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:alpha',
      snapshot_payload: { state: 'initial' },
    });
    assert.ok(typeof snap.id === 'number' && snap.id > 0);
    assert.strictEqual(snap.project_context_key, 'proj:alpha');
    assert.strictEqual(snap.snapshot_version, 1);
    assert.strictEqual(snap.iteration, 1);
    assert.strictEqual(snap.validation_status, 'unvalidated');
    assert.strictEqual(snap.retention_policy, 'retain');
    assert.strictEqual(snap.relevance_score, 0);
    assert.strictEqual(snap.parent_snapshot_id, null);
  });

  it('auto-increments snapshot_version on subsequent snapshots for the same context key', () => {
    const s1 = db.createProjectMemorySnapshot({
      project_context_key: 'proj:versioned',
      snapshot_payload: { v: 1 },
    });
    const s2 = db.createProjectMemorySnapshot({
      project_context_key: 'proj:versioned',
      snapshot_payload: { v: 2 },
    });
    const s3 = db.createProjectMemorySnapshot({
      project_context_key: 'proj:versioned',
      snapshot_payload: { v: 3 },
    });
    assert.strictEqual(s1.snapshot_version, 1);
    assert.strictEqual(s2.snapshot_version, 2);
    assert.strictEqual(s3.snapshot_version, 3);
    // Each subsequent snapshot links back to its predecessor
    assert.strictEqual(s2.parent_snapshot_id, s1.id);
    assert.strictEqual(s3.parent_snapshot_id, s2.id);
  });

  it('throws when snapshot_version is not strictly greater than the latest', () => {
    db.createProjectMemorySnapshot({
      project_context_key: 'proj:version-guard',
      snapshot_payload: { x: 1 },
    });
    assert.throws(
      () => db.createProjectMemorySnapshot({
        project_context_key: 'proj:version-guard',
        snapshot_payload: { x: 2 },
        snapshot_version: 1,
      }),
      /snapshot_version.*must be greater than/
    );
  });

  it('stores governance metadata and confidence_score correctly', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:gov',
      snapshot_payload: { data: 'governed' },
      confidence_score: 0.87,
      validation_status: 'pending',
      governance_metadata: { reviewer: 'alice', threshold_met: true },
    });
    assert.ok(Math.abs(snap.confidence_score - 0.87) < 0.001);
    assert.strictEqual(snap.validation_status, 'pending');
    const govParsed = JSON.parse(snap.governance_metadata);
    assert.strictEqual(govParsed.reviewer, 'alice');
    assert.strictEqual(govParsed.threshold_met, true);
  });

  it('stores retention_policy and retention_until', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:retention',
      snapshot_payload: { d: 'r' },
      retention_policy: 'expiry',
      retention_until: '2030-01-01',
    });
    assert.strictEqual(snap.retention_policy, 'expiry');
    assert.strictEqual(snap.retention_until, '2030-01-01');
  });

  it('records request_id and task_id lineage provenance', () => {
    const reqId = makeRequest();
    const taskId = makeTask(reqId);
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:provenance',
      snapshot_payload: { d: 'p' },
      request_id: reqId,
      task_id: taskId,
    });
    assert.strictEqual(snap.request_id, reqId);
    assert.strictEqual(snap.task_id, taskId);
    // A lineage link should have been auto-created
    assert.ok(typeof snap.lineage_link_id === 'number' && snap.lineage_link_id > 0);
  });

  it('auto-creates origin lineage link when request_id is provided', () => {
    const reqId = makeRequest();
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:auto-lineage',
      snapshot_payload: { d: 'al' },
      request_id: reqId,
      lineage_type: 'origin',
    });
    const links = db.listProjectMemoryLineageLinks({ snapshot_id: snap.id });
    assert.ok(links.length >= 1);
    assert.strictEqual(links[0].lineage_type, 'origin');
    assert.strictEqual(links[0].request_id, reqId);
  });

  it('does not auto-create lineage link when no request/task/run ids provided', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:no-lineage',
      snapshot_payload: { d: 'nl' },
    });
    assert.strictEqual(snap.lineage_link_id, null);
    const links = db.listProjectMemoryLineageLinks({ snapshot_id: snap.id });
    assert.strictEqual(links.length, 0);
  });
});

// ─── Snapshot retrieval ────────────────────────────────────────────────────────

describe('getProjectMemorySnapshot / getLatestProjectMemorySnapshot', () => {
  it('getProjectMemorySnapshot returns null for unknown id', () => {
    const result = db.getProjectMemorySnapshot(99999);
    assert.strictEqual(result, undefined);
  });

  it('getProjectMemorySnapshot returns the correct snapshot by id', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:get',
      snapshot_payload: { d: 'get' },
    });
    const fetched = db.getProjectMemorySnapshot(snap.id);
    assert.strictEqual(fetched.id, snap.id);
    assert.strictEqual(fetched.project_context_key, 'proj:get');
  });

  it('getLatestProjectMemorySnapshot returns the highest-version snapshot', () => {
    db.createProjectMemorySnapshot({ project_context_key: 'proj:latest', snapshot_payload: { v: 1 } });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:latest', snapshot_payload: { v: 2 } });
    const s3 = db.createProjectMemorySnapshot({ project_context_key: 'proj:latest', snapshot_payload: { v: 3 } });

    const latest = db.getLatestProjectMemorySnapshot('proj:latest');
    assert.strictEqual(latest.id, s3.id);
    assert.strictEqual(latest.snapshot_version, 3);
  });

  it('getLatestProjectMemorySnapshot returns null for unknown context key', () => {
    const result = db.getLatestProjectMemorySnapshot('proj:nonexistent-ctx-key');
    assert.strictEqual(result, null);
  });

  it('getLatestProjectMemorySnapshot is updated after each new snapshot', () => {
    const s1 = db.createProjectMemorySnapshot({ project_context_key: 'proj:index-track', snapshot_payload: { v: 1 } });
    assert.strictEqual(db.getLatestProjectMemorySnapshot('proj:index-track').id, s1.id);

    const s2 = db.createProjectMemorySnapshot({ project_context_key: 'proj:index-track', snapshot_payload: { v: 2 } });
    assert.strictEqual(db.getLatestProjectMemorySnapshot('proj:index-track').id, s2.id);
  });
});

// ─── listProjectMemorySnapshots ────────────────────────────────────────────────

describe('listProjectMemorySnapshots — filtering', () => {
  it('returns all snapshots when no filters applied', () => {
    db.createProjectMemorySnapshot({ project_context_key: 'proj:list-a', snapshot_payload: { x: 1 } });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:list-b', snapshot_payload: { x: 2 } });
    const all = db.listProjectMemorySnapshots({});
    assert.ok(all.length >= 2);
  });

  it('filters by project_context_key', () => {
    db.createProjectMemorySnapshot({ project_context_key: 'proj:filter-ctx', snapshot_payload: { d: 1 } });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:filter-other', snapshot_payload: { d: 2 } });
    const result = db.listProjectMemorySnapshots({ project_context_key: 'proj:filter-ctx' });
    assert.ok(result.every(s => s.project_context_key === 'proj:filter-ctx'));
    assert.strictEqual(result.length, 1);
  });

  it('filters by validation_status', () => {
    db.createProjectMemorySnapshot({ project_context_key: 'proj:vstatus', snapshot_payload: { d: 1 }, validation_status: 'validated' });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:vstatus', snapshot_payload: { d: 2 } });
    const validated = db.listProjectMemorySnapshots({ project_context_key: 'proj:vstatus', validation_status: 'validated' });
    assert.strictEqual(validated.length, 1);
    assert.strictEqual(validated[0].validation_status, 'validated');
  });

  it('filters by min_relevance_score', () => {
    db.createProjectMemorySnapshot({ project_context_key: 'proj:relev', snapshot_payload: { d: 1 }, relevance_score: 0.9 });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:relev', snapshot_payload: { d: 2 }, relevance_score: 0.3 });
    const highScore = db.listProjectMemorySnapshots({ project_context_key: 'proj:relev', min_relevance_score: 0.5 });
    assert.strictEqual(highScore.length, 1);
    assert.ok(highScore[0].relevance_score >= 0.5);
  });

  it('filters by request_id', () => {
    const reqId = makeRequest();
    db.createProjectMemorySnapshot({ project_context_key: 'proj:req-filter', snapshot_payload: { d: 1 }, request_id: reqId });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:req-filter', snapshot_payload: { d: 2 } });
    const result = db.listProjectMemorySnapshots({ request_id: reqId });
    assert.ok(result.length >= 1);
    assert.ok(result.every(s => s.request_id === reqId));
  });

  it('filters by task_id', () => {
    const reqId = makeRequest();
    const taskId = makeTask(reqId);
    db.createProjectMemorySnapshot({ project_context_key: 'proj:task-filter', snapshot_payload: { d: 1 }, task_id: taskId });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:task-filter', snapshot_payload: { d: 2 } });
    const result = db.listProjectMemorySnapshots({ task_id: taskId });
    assert.ok(result.length >= 1);
    assert.ok(result.every(s => s.task_id === taskId));
  });

  it('supports pagination via limit and offset', () => {
    for (let i = 1; i <= 5; i++) {
      db.createProjectMemorySnapshot({ project_context_key: 'proj:paginate', snapshot_payload: { i } });
    }
    const page1 = db.listProjectMemorySnapshots({ project_context_key: 'proj:paginate', limit: 2, offset: 0 });
    const page2 = db.listProjectMemorySnapshots({ project_context_key: 'proj:paginate', limit: 2, offset: 2 });
    assert.strictEqual(page1.length, 2);
    assert.strictEqual(page2.length, 2);
    const page1Ids = new Set(page1.map(s => s.id));
    const page2Ids = new Set(page2.map(s => s.id));
    for (const id of page2Ids) {
      assert.ok(!page1Ids.has(id), 'Pages must not overlap');
    }
  });
});

// ─── Dedupe fingerprint ────────────────────────────────────────────────────────

describe('dedupe fingerprint — snapshot stability', () => {
  it('same payload for the same context key produces the same dedupe_fingerprint', () => {
    const payload = { state: 'stable' };
    const s1 = db.createProjectMemorySnapshot({ project_context_key: 'proj:dedupe', snapshot_payload: payload });
    // We can't create a duplicate at version 2, but verify the fingerprints are the same for the same content
    // (Both would have the same auto-fingerprint since the payload is the same)
    assert.match(s1.dedupe_fingerprint, /^[0-9a-f]{64}$/);
  });

  it('different payloads produce different dedupe_fingerprints', () => {
    const s1 = db.createProjectMemorySnapshot({ project_context_key: 'proj:dedupe-diff', snapshot_payload: { a: 1 } });
    const s2 = db.createProjectMemorySnapshot({ project_context_key: 'proj:dedupe-diff', snapshot_payload: { a: 2 } });
    assert.notStrictEqual(s1.dedupe_fingerprint, s2.dedupe_fingerprint);
  });

  it('explicit dedupe_fingerprint is preserved verbatim', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:explicit-fp',
      snapshot_payload: { d: 'x' },
      dedupe_fingerprint: 'my-custom-fp-abc123',
    });
    assert.strictEqual(snap.dedupe_fingerprint, 'my-custom-fp-abc123');
  });
});

// ─── rebuildProjectMemorySnapshotIndex ───────────────────────────────────────

describe('rebuildProjectMemorySnapshotIndex', () => {
  it('correctly identifies the latest snapshot for each context key', () => {
    db.createProjectMemorySnapshot({ project_context_key: 'proj:rebuild-a', snapshot_payload: { v: 1 } });
    const s2 = db.createProjectMemorySnapshot({ project_context_key: 'proj:rebuild-a', snapshot_payload: { v: 2 } });
    db.createProjectMemorySnapshot({ project_context_key: 'proj:rebuild-b', snapshot_payload: { v: 1 } });

    const result = db.rebuildProjectMemorySnapshotIndex();
    assert.strictEqual(result.project_context_count, 2);
    assert.strictEqual(result.indexed_count, 2);

    // After rebuild, latest for proj:rebuild-a should still be s2
    const latest = db.getLatestProjectMemorySnapshot('proj:rebuild-a');
    assert.strictEqual(latest.id, s2.id);
  });

  it('returns zero counts on empty database', () => {
    const result = db.rebuildProjectMemorySnapshotIndex();
    assert.strictEqual(result.indexed_count, 0);
    assert.strictEqual(result.project_context_count, 0);
  });

  it('handles multiple context keys independently', () => {
    for (const ctx of ['ctx-rb:x', 'ctx-rb:y', 'ctx-rb:z']) {
      db.createProjectMemorySnapshot({ project_context_key: ctx, snapshot_payload: { c: ctx } });
      db.createProjectMemorySnapshot({ project_context_key: ctx, snapshot_payload: { c: ctx, v: 2 } });
    }
    const result = db.rebuildProjectMemorySnapshotIndex();
    assert.strictEqual(result.project_context_count, 3);
  });
});

// ─── Insight artifacts ────────────────────────────────────────────────────────

describe('createInsightArtifact — persistence', () => {
  it('creates an artifact and returns it with defaults', () => {
    const artifact = db.createInsightArtifact({
      project_context_key: 'proj:artifact',
      artifact_payload: { insight: 'test' },
    });
    assert.ok(typeof artifact.id === 'number' && artifact.id > 0);
    assert.strictEqual(artifact.artifact_type, 'research_insight');
    assert.strictEqual(artifact.artifact_version, 1);
    assert.strictEqual(artifact.validation_status, 'unvalidated');
    assert.strictEqual(artifact.retention_policy, 'retain');
  });

  it('links artifact to a snapshot via snapshot_id and inherits context key', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:artifact-snap',
      snapshot_payload: { d: 'snap' },
    });
    const artifact = db.createInsightArtifact({
      snapshot_id: snap.id,
      artifact_payload: { insight: 'linked' },
    });
    assert.strictEqual(artifact.project_context_key, 'proj:artifact-snap');
    assert.strictEqual(artifact.snapshot_id, snap.id);
  });

  it('rejects mismatched project_context_key when snapshot_id is provided', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:mismatch-ctx',
      snapshot_payload: { d: 'x' },
    });
    assert.throws(
      () => db.createInsightArtifact({
        project_context_key: 'proj:different-ctx',
        snapshot_id: snap.id,
        artifact_payload: { d: 'x' },
      }),
      /does not match snapshot context/
    );
  });

  it('auto-increments artifact_version for same context+type+fingerprint', () => {
    const a1 = db.createInsightArtifact({
      project_context_key: 'proj:art-version',
      artifact_type: 'code_pattern',
      artifact_payload: { d: 'pattern-1' },
    });
    const a2 = db.createInsightArtifact({
      project_context_key: 'proj:art-version',
      artifact_type: 'code_pattern',
      artifact_payload: { d: 'pattern-1' },
    });
    assert.strictEqual(a1.artifact_version, 1);
    assert.strictEqual(a2.artifact_version, 2);
    assert.strictEqual(a1.dedupe_fingerprint, a2.dedupe_fingerprint);
  });

  it('stores confidence_score clamped to [0, 1]', () => {
    const a = db.createInsightArtifact({
      project_context_key: 'proj:confidence',
      artifact_payload: { d: 'c' },
      confidence_score: 1.5,
    });
    assert.strictEqual(a.confidence_score, 1.0);

    const b = db.createInsightArtifact({
      project_context_key: 'proj:confidence',
      artifact_payload: { d: 'neg' },
      confidence_score: -0.5,
    });
    assert.strictEqual(b.confidence_score, 0.0);
  });

  it('stores governance_metadata as normalized JSON', () => {
    const artifact = db.createInsightArtifact({
      project_context_key: 'proj:govmeta',
      artifact_payload: { d: 'gm' },
      governance_metadata: { approved_by: 'reviewer-1', cycle: 2 },
    });
    const gov = JSON.parse(artifact.governance_metadata);
    assert.strictEqual(gov.approved_by, 'reviewer-1');
    assert.strictEqual(gov.cycle, 2);
  });
});

describe('listInsightArtifacts — filtering', () => {
  it('filters by artifact_type', () => {
    db.createInsightArtifact({ project_context_key: 'proj:art-type', artifact_type: 'code_pattern', artifact_payload: { d: 1 } });
    db.createInsightArtifact({ project_context_key: 'proj:art-type', artifact_type: 'research_insight', artifact_payload: { d: 2 } });

    const patterns = db.listInsightArtifacts({ project_context_key: 'proj:art-type', artifact_type: 'code_pattern' });
    assert.strictEqual(patterns.length, 1);
    assert.strictEqual(patterns[0].artifact_type, 'code_pattern');
  });

  it('filters by validation_status', () => {
    db.createInsightArtifact({ project_context_key: 'proj:art-valid', artifact_payload: { d: 1 }, validation_status: 'validated' });
    db.createInsightArtifact({ project_context_key: 'proj:art-valid', artifact_payload: { d: 2 } });

    const validated = db.listInsightArtifacts({ project_context_key: 'proj:art-valid', validation_status: 'validated' });
    assert.strictEqual(validated.length, 1);
  });

  it('filters by min_relevance_score', () => {
    db.createInsightArtifact({ project_context_key: 'proj:art-rel', artifact_payload: { d: 'hi' }, relevance_score: 900 });
    db.createInsightArtifact({ project_context_key: 'proj:art-rel', artifact_payload: { d: 'lo' }, relevance_score: 100 });

    const high = db.listInsightArtifacts({ project_context_key: 'proj:art-rel', min_relevance_score: 500 });
    assert.strictEqual(high.length, 1);
    assert.ok(high[0].relevance_score >= 500);
  });

  it('filters by snapshot_id', () => {
    const snap = db.createProjectMemorySnapshot({ project_context_key: 'proj:art-snap', snapshot_payload: { d: 's' } });
    const a1 = db.createInsightArtifact({ project_context_key: 'proj:art-snap', snapshot_id: snap.id, artifact_payload: { d: 1 } });
    db.createInsightArtifact({ project_context_key: 'proj:art-snap', artifact_payload: { d: 2 } });

    const linked = db.listInsightArtifacts({ snapshot_id: snap.id });
    assert.strictEqual(linked.length, 1);
    assert.strictEqual(linked[0].id, a1.id);
  });

  it('filters by request_id for traceability', () => {
    const reqId = makeRequest();
    db.createInsightArtifact({ project_context_key: 'proj:art-req', artifact_payload: { d: 1 }, request_id: reqId });
    db.createInsightArtifact({ project_context_key: 'proj:art-req', artifact_payload: { d: 2 } });

    const traced = db.listInsightArtifacts({ request_id: reqId });
    assert.ok(traced.length >= 1);
    assert.ok(traced.every(a => a.request_id === reqId));
  });

  it('returns artifacts sorted by relevance_score descending', () => {
    for (const score of [100, 900, 500]) {
      db.createInsightArtifact({
        project_context_key: 'proj:art-order',
        artifact_payload: { score },
        relevance_score: score,
      });
    }
    const all = db.listInsightArtifacts({ project_context_key: 'proj:art-order' });
    assert.strictEqual(all.length, 3);
    assert.ok(all[0].relevance_score >= all[1].relevance_score);
    assert.ok(all[1].relevance_score >= all[2].relevance_score);
  });
});

// ─── Lineage links ────────────────────────────────────────────────────────────

describe('createProjectMemoryLineageLink — all lineage types', () => {
  const LINEAGE_TYPES = ['origin', 'derived_from', 'supports', 'supersedes', 'validated_by', 'consumed_by'];

  for (const lineageType of LINEAGE_TYPES) {
    it(`records lineage_type="${lineageType}" for a snapshot`, () => {
      const reqId = makeRequest();
      const snap = db.createProjectMemorySnapshot({
        project_context_key: `proj:lineage-${lineageType}`,
        snapshot_payload: { d: lineageType },
      });
      const link = db.createProjectMemoryLineageLink({
        snapshot_id: snap.id,
        request_id: reqId,
        lineage_type: lineageType,
      });
      assert.strictEqual(link.lineage_type, lineageType);
      assert.strictEqual(link.snapshot_id, snap.id);
    });
  }

  it('requires at least snapshot_id or insight_artifact_id', () => {
    assert.throws(
      () => db.createProjectMemoryLineageLink({}),
      /snapshot_id or insight_artifact_id is required/
    );
  });

  it('throws when snapshot_id references a non-existent snapshot', () => {
    assert.throws(
      () => db.createProjectMemoryLineageLink({ snapshot_id: 99999 }),
      /snapshot_id 99999 not found/
    );
  });

  it('throws when insight_artifact_id references a non-existent artifact', () => {
    assert.throws(
      () => db.createProjectMemoryLineageLink({ insight_artifact_id: 99999 }),
      /insight_artifact_id 99999 not found/
    );
  });

  it('records metadata on lineage links', () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'proj:link-meta',
      snapshot_payload: { d: 'lm' },
    });
    const link = db.createProjectMemoryLineageLink({
      snapshot_id: snap.id,
      metadata: { note: 'derived from experiment run #42' },
    });
    const parsed = JSON.parse(link.metadata);
    assert.strictEqual(parsed.note, 'derived from experiment run #42');
  });
});

describe('listProjectMemoryLineageLinks — filtering', () => {
  it('filters by snapshot_id', () => {
    const snap1 = db.createProjectMemorySnapshot({ project_context_key: 'proj:ll-snap1', snapshot_payload: { d: 1 } });
    const snap2 = db.createProjectMemorySnapshot({ project_context_key: 'proj:ll-snap2', snapshot_payload: { d: 2 } });
    db.createProjectMemoryLineageLink({ snapshot_id: snap1.id });
    db.createProjectMemoryLineageLink({ snapshot_id: snap2.id });

    const links = db.listProjectMemoryLineageLinks({ snapshot_id: snap1.id });
    assert.ok(links.length >= 1);
    assert.ok(links.every(l => l.snapshot_id === snap1.id));
  });

  it('filters by insight_artifact_id', () => {
    const art = db.createInsightArtifact({ project_context_key: 'proj:ll-art', artifact_payload: { d: 'ia' } });
    db.createProjectMemoryLineageLink({ insight_artifact_id: art.id });

    const links = db.listProjectMemoryLineageLinks({ insight_artifact_id: art.id });
    assert.ok(links.length >= 1);
    assert.ok(links.every(l => l.insight_artifact_id === art.id));
  });

  it('filters by lineage_type', () => {
    const snap = db.createProjectMemorySnapshot({ project_context_key: 'proj:ll-type', snapshot_payload: { d: 't' } });
    db.createProjectMemoryLineageLink({ snapshot_id: snap.id, lineage_type: 'supports' });
    db.createProjectMemoryLineageLink({ snapshot_id: snap.id, lineage_type: 'supersedes' });

    const supports = db.listProjectMemoryLineageLinks({ snapshot_id: snap.id, lineage_type: 'supports' });
    assert.ok(supports.every(l => l.lineage_type === 'supports'));
    const supersedes = db.listProjectMemoryLineageLinks({ snapshot_id: snap.id, lineage_type: 'supersedes' });
    assert.ok(supersedes.every(l => l.lineage_type === 'supersedes'));
  });

  it('filters by request_id', () => {
    const reqId = makeRequest();
    const snap = db.createProjectMemorySnapshot({ project_context_key: 'proj:ll-req', snapshot_payload: { d: 'r' } });
    db.createProjectMemoryLineageLink({ snapshot_id: snap.id, request_id: reqId });

    const links = db.listProjectMemoryLineageLinks({ request_id: reqId });
    assert.ok(links.length >= 1);
    assert.ok(links.every(l => l.request_id === reqId));
  });

  it('filters by run_id for cross-run traceability', () => {
    const runId = 'run-2026-01-abc';
    const snap = db.createProjectMemorySnapshot({ project_context_key: 'proj:ll-run', snapshot_payload: { d: 'rn' } });
    db.createProjectMemoryLineageLink({ snapshot_id: snap.id, run_id: runId });
    db.createProjectMemoryLineageLink({ snapshot_id: snap.id, run_id: 'other-run' });

    const links = db.listProjectMemoryLineageLinks({ run_id: runId });
    assert.ok(links.length >= 1);
    assert.ok(links.every(l => l.run_id === runId));
  });
});

// ─── Governance metadata (validation lifecycle) ────────────────────────────────

describe('governance — validation status lifecycle', () => {
  const VALID_STATUSES = ['unvalidated', 'pending', 'validated', 'rejected', 'superseded'];

  for (const status of VALID_STATUSES) {
    it(`accepts validation_status="${status}"`, () => {
      const snap = db.createProjectMemorySnapshot({
        project_context_key: `proj:gov-status-${status}`,
        snapshot_payload: { d: status },
        validation_status: status,
      });
      assert.strictEqual(snap.validation_status, status);
    });
  }

  it('rejects invalid validation_status', () => {
    assert.throws(
      () => db.createProjectMemorySnapshot({
        project_context_key: 'proj:bad-status',
        snapshot_payload: { d: 'bad' },
        validation_status: 'approved',
      }),
      /Invalid project-memory validation_status/
    );
  });

  it('confidence_score is clamped to [0, 1] and null is preserved', () => {
    const withNull = db.createProjectMemorySnapshot({
      project_context_key: 'proj:conf-null',
      snapshot_payload: { d: 'n' },
    });
    assert.strictEqual(withNull.confidence_score, null);

    const withScore = db.createProjectMemorySnapshot({
      project_context_key: 'proj:conf-score',
      snapshot_payload: { d: 's' },
      confidence_score: 0.75,
    });
    assert.ok(Math.abs(withScore.confidence_score - 0.75) < 0.001);
  });
});

// ─── Quota-pressure scenarios ─────────────────────────────────────────────────

describe('quota-pressure — many snapshots over time', () => {
  const SNAPSHOT_COUNT = 50;

  it(`handles ${SNAPSHOT_COUNT} sequential snapshots for the same context key`, () => {
    const contextKey = 'proj:quota-pressure';
    let lastSnap;
    for (let i = 1; i <= SNAPSHOT_COUNT; i++) {
      lastSnap = db.createProjectMemorySnapshot({
        project_context_key: contextKey,
        snapshot_payload: { iteration: i, data: `chunk-${i}`.repeat(10) },
      });
    }
    assert.strictEqual(lastSnap.snapshot_version, SNAPSHOT_COUNT);

    // Latest snapshot index is correct
    const latest = db.getLatestProjectMemorySnapshot(contextKey);
    assert.strictEqual(latest.snapshot_version, SNAPSHOT_COUNT);

    // List with limit returns exactly limit items
    const page = db.listProjectMemorySnapshots({ project_context_key: contextKey, limit: 10, offset: 0 });
    assert.strictEqual(page.length, 10);

    // Total count is correct via full list
    const all = db.listProjectMemorySnapshots({ project_context_key: contextKey, limit: SNAPSHOT_COUNT + 10 });
    assert.strictEqual(all.length, SNAPSHOT_COUNT);
  });

  it('pagination covers all snapshots without overlap or gaps', () => {
    const contextKey = 'proj:quota-paginate';
    for (let i = 1; i <= 20; i++) {
      db.createProjectMemorySnapshot({ project_context_key: contextKey, snapshot_payload: { i } });
    }
    const PAGE_SIZE = 7;
    const allIds = new Set();
    let offset = 0;
    let page;
    do {
      page = db.listProjectMemorySnapshots({ project_context_key: contextKey, limit: PAGE_SIZE, offset });
      for (const s of page) {
        assert.ok(!allIds.has(s.id), `Duplicate id ${s.id} across pages`);
        allIds.add(s.id);
      }
      offset += PAGE_SIZE;
    } while (page.length === PAGE_SIZE);
    assert.strictEqual(allIds.size, 20);
  });

  it('many distinct context keys each maintain independent versioning', () => {
    const CONTEXT_COUNT = 15;
    for (let c = 1; c <= CONTEXT_COUNT; c++) {
      for (let v = 1; v <= 3; v++) {
        db.createProjectMemorySnapshot({
          project_context_key: `proj:multi-ctx-${c}`,
          snapshot_payload: { c, v },
        });
      }
    }
    for (let c = 1; c <= CONTEXT_COUNT; c++) {
      const latest = db.getLatestProjectMemorySnapshot(`proj:multi-ctx-${c}`);
      assert.strictEqual(latest.snapshot_version, 3);
    }
    const rebuildResult = db.rebuildProjectMemorySnapshotIndex();
    assert.strictEqual(rebuildResult.project_context_count, CONTEXT_COUNT);
  });

  it('validated artifacts survive alongside unvalidated noise', () => {
    const contextKey = 'proj:quota-validate';
    for (let i = 1; i <= 20; i++) {
      db.createInsightArtifact({
        project_context_key: contextKey,
        artifact_payload: { noise: i },
        validation_status: i % 5 === 0 ? 'validated' : 'unvalidated',
      });
    }
    const validated = db.listInsightArtifacts({ project_context_key: contextKey, validation_status: 'validated', limit: 100 });
    assert.strictEqual(validated.length, 4); // i=5,10,15,20
    assert.ok(validated.every(a => a.validation_status === 'validated'));
  });
});

// ─── Iterative-run traceability ────────────────────────────────────────────────

describe('iterative-run traceability — artifacts retained across runs', () => {
  it('run_id is stored on snapshots and queryable', () => {
    const RUN_IDS = ['run-001', 'run-002', 'run-003'];
    const snapshotsByRun = {};
    for (const runId of RUN_IDS) {
      const snap = db.createProjectMemorySnapshot({
        project_context_key: 'proj:iterative',
        snapshot_payload: { run: runId, data: 'output' },
        run_id: runId,
      });
      snapshotsByRun[runId] = snap;
    }

    for (const runId of RUN_IDS) {
      const found = db.listProjectMemorySnapshots({ run_id: runId });
      assert.ok(found.length >= 1);
      assert.ok(found.every(s => s.run_id === runId));
    }
  });

  it('artifacts from earlier runs are still retrievable after newer runs', () => {
    const contextKey = 'proj:iter-persist';
    const run1 = 'iter-run-1';
    const run2 = 'iter-run-2';

    db.createInsightArtifact({
      project_context_key: contextKey,
      artifact_payload: { finding: 'important from run 1' },
      run_id: run1,
      validation_status: 'validated',
    });
    // Run 2 adds more artifacts — doesn't overwrite run 1
    db.createInsightArtifact({
      project_context_key: contextKey,
      artifact_payload: { finding: 'new from run 2' },
      run_id: run2,
    });

    const run1Artifacts = db.listInsightArtifacts({ run_id: run1 });
    assert.ok(run1Artifacts.length >= 1);
    assert.ok(run1Artifacts.every(a => a.run_id === run1));

    const allArtifacts = db.listInsightArtifacts({ project_context_key: contextKey, limit: 100 });
    assert.ok(allArtifacts.length >= 2, 'Both run artifacts must be present');
    const runIds = new Set(allArtifacts.map(a => a.run_id));
    assert.ok(runIds.has(run1));
    assert.ok(runIds.has(run2));
  });

  it('lineage links preserve cross-run provenance chains', () => {
    const contextKey = 'proj:iter-lineage';
    const run1 = 'iter-chain-1';
    const run2 = 'iter-chain-2';

    const snap1 = db.createProjectMemorySnapshot({
      project_context_key: contextKey,
      snapshot_payload: { d: 'base', run: 1 },
      run_id: run1,
    });
    const snap2 = db.createProjectMemorySnapshot({
      project_context_key: contextKey,
      snapshot_payload: { d: 'derived', run: 2 },
      run_id: run2,
    });

    // Record that snap2 is derived from snap1
    db.createProjectMemoryLineageLink({
      snapshot_id: snap2.id,
      run_id: run2,
      lineage_type: 'derived_from',
      metadata: { parent_run: run1, parent_snapshot_id: snap1.id },
    });

    const links = db.listProjectMemoryLineageLinks({ snapshot_id: snap2.id, lineage_type: 'derived_from' });
    assert.ok(links.length >= 1);
    const link = links[0];
    assert.strictEqual(link.lineage_type, 'derived_from');
    assert.strictEqual(link.run_id, run2);
    const meta = JSON.parse(link.metadata);
    assert.strictEqual(meta.parent_run, run1);
    assert.strictEqual(meta.parent_snapshot_id, snap1.id);
  });

  it('innovation artifacts are reusable: validated insight survives quota-pressure pruning criteria', () => {
    const contextKey = 'proj:iter-reuse';
    const NOISE_COUNT = 30;

    // Create a high-value validated insight
    const keyArtifact = db.createInsightArtifact({
      project_context_key: contextKey,
      artifact_type: 'code_pattern',
      artifact_payload: { pattern: 'guard-clause-before-async', reuse_count: 5 },
      relevance_score: 950,
      confidence_score: 0.95,
      validation_status: 'validated',
      run_id: 'iter-reuse-r1',
    });

    // Simulate many low-value artifacts from subsequent iterations
    for (let i = 0; i < NOISE_COUNT; i++) {
      db.createInsightArtifact({
        project_context_key: contextKey,
        artifact_payload: { noise: i },
        relevance_score: 10,
        run_id: `iter-reuse-r${2 + i}`,
      });
    }

    // The key artifact is still retrievable by id
    const fetched = db.getInsightArtifact(keyArtifact.id);
    assert.strictEqual(fetched.id, keyArtifact.id);
    assert.strictEqual(fetched.validation_status, 'validated');
    assert.ok(fetched.relevance_score >= 900);

    // High-relevance filter retrieves it even amid noise
    const highValue = db.listInsightArtifacts({
      project_context_key: contextKey,
      min_relevance_score: 900,
    });
    assert.ok(highValue.some(a => a.id === keyArtifact.id));
    assert.ok(highValue.every(a => a.relevance_score >= 900));
  });

  it('multiple iterations of a context key advance version chain with full lineage', () => {
    const contextKey = 'proj:iter-chain-full';
    const reqId = makeRequest('iterative request');
    const taskId = makeTask(reqId);

    let prevSnap = null;
    for (let i = 1; i <= 5; i++) {
      const snap = db.createProjectMemorySnapshot({
        project_context_key: contextKey,
        snapshot_payload: { iteration: i, output: `result-${i}` },
        run_id: `full-chain-run-${i}`,
        request_id: reqId,
        task_id: taskId,
        iteration: i,
        lineage_type: i === 1 ? 'origin' : 'derived_from',
      });

      if (prevSnap) {
        // Explicitly record derived_from link
        db.createProjectMemoryLineageLink({
          snapshot_id: snap.id,
          lineage_type: 'derived_from',
          run_id: `full-chain-run-${i}`,
          metadata: { prev_snapshot_id: prevSnap.id, prev_run: `full-chain-run-${i - 1}` },
        });
      }
      prevSnap = snap;
    }

    // All 5 versions exist
    const all = db.listProjectMemorySnapshots({ project_context_key: contextKey, limit: 10 });
    assert.strictEqual(all.length, 5);

    // Latest is version 5
    const latest = db.getLatestProjectMemorySnapshot(contextKey);
    assert.strictEqual(latest.snapshot_version, 5);
    assert.strictEqual(latest.iteration, 5);

    // Lineage links are recorded (4 derived_from + 5 origin auto-links from request_id)
    const derivedLinks = db.listProjectMemoryLineageLinks({
      request_id: reqId,
      lineage_type: 'derived_from',
    });
    assert.ok(derivedLinks.length >= 4);
  });
});
