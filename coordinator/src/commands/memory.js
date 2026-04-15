'use strict';

function handleMemoryCommand(command, args, { db }) {
  switch (command) {
    case 'memory-snapshots': {
      const snapshots = db.listProjectMemorySnapshots({
        project_context_key: args.project_context_key || null,
        request_id: args.request_id || null,
        task_id: args.task_id || null,
        run_id: args.run_id || null,
        validation_status: args.validation_status || null,
        min_relevance_score: args.min_relevance_score != null ? args.min_relevance_score : null,
        limit: args.limit || 100,
        offset: args.offset || 0,
      });
      return { ok: true, snapshots };
    }

    case 'memory-snapshot': {
      const snap = db.getProjectMemorySnapshot(args.id);
      if (!snap) {
        return { ok: false, error: `Snapshot ${args.id} not found` };
      }
      let lineage = null;
      if (args.include_lineage) {
        lineage = db.listProjectMemoryLineageLinks({ snapshot_id: args.id });
      }
      return { ok: true, snapshot: snap, lineage };
    }

    case 'memory-insights': {
      const artifacts = db.listInsightArtifacts({
        project_context_key: args.project_context_key || null,
        snapshot_id: args.snapshot_id || null,
        artifact_type: args.artifact_type || null,
        request_id: args.request_id || null,
        task_id: args.task_id || null,
        run_id: args.run_id || null,
        validation_status: args.validation_status || null,
        min_relevance_score: args.min_relevance_score != null ? args.min_relevance_score : null,
        limit: args.limit || 100,
        offset: args.offset || 0,
      });
      return { ok: true, artifacts };
    }

    case 'memory-insight': {
      const artifact = db.getInsightArtifact(args.id);
      if (!artifact) {
        return { ok: false, error: `Insight artifact ${args.id} not found` };
      }
      let insightLineage = null;
      if (args.include_lineage) {
        insightLineage = db.listProjectMemoryLineageLinks({ insight_artifact_id: args.id });
      }
      return { ok: true, artifact, lineage: insightLineage };
    }

    case 'memory-lineage': {
      const links = db.listProjectMemoryLineageLinks({
        snapshot_id: args.snapshot_id || null,
        insight_artifact_id: args.insight_artifact_id || null,
        request_id: args.request_id || null,
        task_id: args.task_id || null,
        run_id: args.run_id || null,
        lineage_type: args.lineage_type || null,
        limit: args.limit || 200,
        offset: args.offset || 0,
      });
      return { ok: true, links };
    }

    default:
      throw new Error(`Unknown memory command: ${command}`);
  }
}

module.exports = {
  handleMemoryCommand,
};
