'use strict';

function loadKnowledgeMetadata() {
  return require('../knowledge-metadata');
}

function handleFillKnowledge({ db, projectDir, knowledgeMeta }) {
  const status = knowledgeMeta.getKnowledgeStatus(projectDir);
  const actions = [];
  const domainMeta = status.domains || {};
  const domainCoverage = status.domain_coverage || {};

  for (const [domain, meta] of Object.entries(domainMeta)) {
    const coverage = domainCoverage[domain];
    const isUncovered = !coverage || !coverage.exists || !coverage.non_empty;
    const isStale = (meta.changes_since_research || 0) >= 3;
    if (isUncovered || isStale) {
      try {
        const result = db.enqueueResearchIntent({
          intent_type: 'browser_research',
          intent_payload: JSON.stringify({
            topic: domain,
            question: `What is the architecture, key files, and patterns of the ${domain} domain?`,
            mode: 'standard',
          }),
          priority: 'normal',
        });
        actions.push({
          type: 'research_queued',
          domain,
          created: result.created,
          id: result.intent.id,
        });
      } catch (e) {
        actions.push({ type: 'research_queue_error', domain, error: e.message });
      }
    }
  }

  if ((status.changes_since_index || 0) > 5) {
    try {
      db.sendMail('architect', 'rescan_requested', {
        reason: 'fill-knowledge detected stale index',
        changes: status.changes_since_index,
      });
      actions.push({
        type: 'rescan_signaled',
        changes_since_index: status.changes_since_index,
      });
    } catch (e) {
      actions.push({ type: 'rescan_signal_error', error: e.message });
    }
  }

  const domainsWithGaps = Object.keys(domainMeta).filter((domain) => {
    const coverage = domainCoverage[domain];
    return !coverage || !coverage.exists || !coverage.non_empty;
  });
  const staleDomains = Object.keys(domainMeta)
    .filter((domain) => (domainMeta[domain].changes_since_research || 0) >= 3);

  return {
    ok: true,
    actions,
    status_summary: {
      domains_with_gaps: domainsWithGaps,
      stale_domains: staleDomains,
      changes_since_index: status.changes_since_index || 0,
    },
  };
}

function handleExtendedResearchCommand(command, args, {
  db,
  projectDir,
  knowledgeMeta = loadKnowledgeMetadata(),
}) {
  const projDir = projectDir || process.cwd();

  switch (command) {
    case 'create-research-topic': {
      const topic = db.createExtendedResearchTopic({
        title: args.title,
        description: args.description,
        category: args.category || 'feature',
        discovery_source: args.discovery_source || null,
        loop_id: args.loop_id || null,
        tags: args.tags ? (typeof args.tags === 'string' ? args.tags : JSON.stringify(args.tags)) : null,
      });
      db.sendMail('master-1', 'research_topic_discovered', {
        topic_id: topic.id,
        title: args.title,
        category: args.category || 'feature',
      });
      return { ok: true, id: topic.id, topic };
    }

    case 'research-topic': {
      const topic = db.getExtendedResearchTopic(args.id);
      if (!topic) return { ok: false, error: 'Research topic not found' };
      return { ok: true, topic };
    }

    case 'research-topics': {
      const topics = db.listExtendedResearchTopics({
        review_status: args.review_status,
        category: args.category,
        loop_id: args.loop_id,
        limit: args.limit || 50,
      });
      return { ok: true, topics, count: topics.length };
    }

    case 'review-research-topic': {
      const reviewed = db.reviewExtendedResearchTopic(args.id, args.review_status, args.notes || null);
      if (!reviewed) return { ok: false, error: 'Invalid review_status or topic not found' };
      return { ok: true, id: args.id, review_status: args.review_status };
    }

    case 'pending-reviews': {
      const items = db.getPendingReviewItems({ limit: args.limit || 20 });
      return { ok: true, items, count: items.length };
    }

    case 'fill-knowledge':
      return handleFillKnowledge({ db, projectDir: projDir, knowledgeMeta });

    default:
      throw new Error(`Unknown extended research command: ${command}`);
  }
}

module.exports = {
  handleExtendedResearchCommand,
};
