'use strict';

const fs = require('fs');
const path = require('path');

function loadKnowledgeMetadata() {
  return require('../knowledge-metadata');
}

function readResearchNote(notePath, projectDir) {
  const candidates = [
    notePath,
    path.resolve(projectDir, notePath),
    path.resolve(projectDir, '.claude', 'knowledge', notePath),
  ];
  for (const candidate of candidates) {
    try {
      return { ok: true, text: fs.readFileSync(candidate, 'utf8') };
    } catch {}
  }
  return {
    ok: false,
    error: `Cannot read note_path: ${notePath} (tried ${candidates.length} locations)`,
  };
}

function resetResearchDomainMetadata({ db, researchItem, projectDir, knowledgeMeta }) {
  try {
    const parsedPayload = researchItem && researchItem.intent_payload
      ? JSON.parse(researchItem.intent_payload)
      : null;
    const topic = parsedPayload && typeof parsedPayload.topic === 'string'
      ? parsedPayload.topic.trim()
      : '';
    if (topic) {
      knowledgeMeta.resetDomainResearch(projectDir, topic);
    }
  } catch (e) {
    db.log('coordinator', 'research_metadata_reset_error', {
      id: researchItem && researchItem.id,
      error: e.message,
    });
  }
}

function handleResearchQueueCommand(command, args, {
  db,
  projectDir,
  knowledgeMeta = loadKnowledgeMetadata(),
}) {
  const projDir = projectDir || db.getConfig('project_dir') || process.cwd();

  switch (command) {
    case 'queue-research': {
      const result = db.enqueueResearchIntent({
        intent_type: 'browser_research',
        intent_payload: JSON.stringify({
          topic: args.topic,
          question: args.question,
          mode: args.mode || 'standard',
          context: args.context || null,
        }),
        priority: args.priority || 'normal',
        task_id: args.source_task_id || null,
      });
      return {
        ok: true,
        id: result.intent.id,
        created: result.created,
        deduplicated: result.deduplicated,
      };
    }

    case 'research-status': {
      const items = db.getResearchQueueItems({
        topic: args.topic || null,
        status: args.status || null,
        limit: args.limit || 50,
      });
      return { ok: true, items, count: items.length };
    }

    case 'research-requeue-stale': {
      const requeued = db.requeueStaleResearch({
        max_age_minutes: args.max_age_minutes || 60,
      });
      db.log('coordinator', 'research_requeued_stale', requeued);
      return { ok: true, ...requeued };
    }

    case 'research-next': {
      const nextItems = db.getResearchQueueItems({ status: 'queued', limit: 1 });
      return { ok: true, item: nextItems.length === 0 ? null : nextItems[0] };
    }

    case 'research-start': {
      const started = db.startResearchItem(args.id);
      if (!started) return { ok: false, error: 'research item not in queued state' };
      db.log('coordinator', 'research_started', { id: args.id });
      return { ok: true };
    }

    case 'research-complete': {
      let resultText = null;
      const researchItem = db.getResearchIntent(args.intent_id);
      if (args.note_path) {
        const note = readResearchNote(args.note_path, projDir);
        if (!note.ok) return { ok: false, error: note.error };
        resultText = note.text;
      }
      const completed = db.completeResearchItem(args.intent_id, resultText);
      if (!completed) return { ok: false, error: 'research item not in in_progress state' };
      db.log('coordinator', 'research_completed', { id: args.intent_id });
      resetResearchDomainMetadata({ db, researchItem, projectDir: projDir, knowledgeMeta });
      return { ok: true };
    }

    case 'research-fail': {
      const failed = db.failResearchItem(args.intent_id, args.error || null);
      if (!failed) return { ok: false, error: 'research item not in in_progress state' };
      db.log('coordinator', 'research_failed', { id: args.intent_id, error: args.error });
      return { ok: true };
    }

    case 'research-gaps': {
      const items = db.getResearchQueueItems({ status: 'queued' });
      const topics = [...new Set(items.map((item) => item.topic))];
      return { ok: true, queued_count: items.length, topics };
    }

    case 'research-retry-failed': {
      const requeued = db.requeueFailedResearch({
        topic: args.topic || null,
        include_running: args.include_running || false,
      });
      db.log('coordinator', 'research_retry_failed', requeued);
      return { ok: true, ...requeued };
    }

    default:
      throw new Error(`Unknown research queue command: ${command}`);
  }
}

module.exports = {
  handleResearchQueueCommand,
};
