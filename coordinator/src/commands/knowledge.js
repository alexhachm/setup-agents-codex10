'use strict';

function loadKnowledgeMetadata() {
  return require('../knowledge-metadata');
}

function handleKnowledgeCommand(command, args, { db, projectDir, knowledgeMeta = loadKnowledgeMetadata() }) {
  const projDir = projectDir || process.cwd();

  switch (command) {
    case 'knowledge-status': {
      const status = knowledgeMeta.getKnowledgeStatus(projDir);
      const pendingReviews = db.getPendingReviewItems({ limit: 100 });
      const approvedAnalyses = db.listDomainAnalyses({ status: 'approved' });
      const analysisCoverage = {};
      for (const analysis of approvedAnalyses) {
        analysisCoverage[analysis.domain] = {
          approved_at: analysis.approved_at,
          confidence: analysis.confidence_score,
        };
      }
      return {
        ok: true,
        ...status,
        pending_reviews_count: pendingReviews.length,
        domain_analysis_coverage: analysisCoverage,
      };
    }

    case 'knowledge-health': {
      const result = knowledgeMeta.knowledgeHealthCheck(projDir);
      return { ok: result.ok, missing: result.missing, present: result.present };
    }

    case 'knowledge-increment': {
      const domain = args.domain || null;
      const workerPatch = args.worker_patch || args['worker-patch'] || false;
      knowledgeMeta.incrementChanges(projDir, domain);
      if (workerPatch) {
        knowledgeMeta.incrementWorkerPatches(projDir, domain);
      }
      const meta = knowledgeMeta.getMetadata(projDir);
      return { ok: true, changes_since_index: meta.changes_since_index, domain };
    }

    case 'knowledge-update-index-timestamp': {
      const meta = knowledgeMeta.updateIndexTimestamp(projDir);
      return {
        ok: true,
        last_indexed: meta.last_indexed,
        changes_since_index: meta.changes_since_index,
      };
    }

    default:
      throw new Error(`Unknown knowledge command: ${command}`);
  }
}

module.exports = {
  handleKnowledgeCommand,
};
