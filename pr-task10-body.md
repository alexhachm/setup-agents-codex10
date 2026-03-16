## Summary
- add persistent project-memory entities for versioned snapshots, snapshot index rows, insight artifacts, and lineage links
- add DB APIs for creating/querying snapshots and artifacts with dedupe fingerprints, relevance scoring, lineage metadata, and governance metadata
- rebuild the snapshot index at coordinator startup and add idempotent migration wiring for existing databases

## Validation
- cd coordinator && npm test
- cd coordinator && node - <<'NODE'
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('./src/db');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-memory-'));
try {
  db.init(tempRoot);
  const snapshot1 = db.createProjectMemorySnapshot({ project_context_key: 'project-alpha', snapshot_payload: { summary: 'initial state' } });
  const snapshot2 = db.createProjectMemorySnapshot({ project_context_key: 'project-alpha', snapshot_payload: { summary: 'second iteration' } });
  const artifact = db.createInsightArtifact({ project_context_key: 'project-alpha', snapshot_id: snapshot2.id, artifact_payload: { finding: 'cache miss regression' } });
  db.createProjectMemoryLineageLink({ snapshot_id: snapshot2.id, insight_artifact_id: artifact.id, lineage_type: 'supports', run_id: 'run-smoke-1' });
  db.getLatestProjectMemorySnapshot('project-alpha');
  db.listProjectMemorySnapshots({ project_context_key: 'project-alpha' });
  db.listInsightArtifacts({ project_context_key: 'project-alpha', min_relevance_score: 0 });
  db.rebuildProjectMemorySnapshotIndex();
} finally {
  db.close();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
NODE
