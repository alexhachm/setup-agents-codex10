'use strict';

function createExtendedResearchRepository(context) {
  const {
    getDb,
    log,
    currentSqlTimestamp,
  } = context;

  function createExtendedResearchTopic({ title, description, category = 'feature', discovery_source = null, loop_id = null, tags = null, research_intent_id = null } = {}) {
    const now = currentSqlTimestamp();
    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : tags;
    const result = getDb().prepare(`
      INSERT INTO extended_research_topics (title, description, category, discovery_source, loop_id, research_intent_id, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, category, discovery_source, loop_id || null, research_intent_id || null, tagsJson, now, now);
    const id = Number(result.lastInsertRowid);
    log('coordinator', 'research_topic_created', { id, title, category, discovery_source });
    return getExtendedResearchTopic(id);
  }

  function getExtendedResearchTopic(id) {
    return getDb().prepare('SELECT * FROM extended_research_topics WHERE id = ?').get(id) || null;
  }

  function listExtendedResearchTopics({ review_status = null, category = null, loop_id = null, limit = 50, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    if (review_status) { conditions.push('review_status = ?'); params.push(review_status); }
    if (category) { conditions.push('category = ?'); params.push(category); }
    if (loop_id != null) { conditions.push('loop_id = ?'); params.push(loop_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);
    return getDb().prepare(
      `SELECT * FROM extended_research_topics ${where} ORDER BY priority DESC, created_at ASC LIMIT ? OFFSET ?`
    ).all(...params);
  }

  function reviewExtendedResearchTopic(id, reviewStatus, humanNotes = null) {
    const now = currentSqlTimestamp();
    const validStatuses = ['held', 'approved', 'rejected', 'in_progress', 'completed'];
    if (!validStatuses.includes(reviewStatus)) return false;
    const result = getDb().prepare(`
      UPDATE extended_research_topics
      SET review_status = ?, human_notes = COALESCE(?, human_notes), reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(reviewStatus, humanNotes, now, now, id);
    if (result.changes > 0) {
      log('coordinator', 'research_topic_reviewed', { id, review_status: reviewStatus });
    }
    return result.changes > 0;
  }

  function getPendingReviewItems({ limit = 20 } = {}) {
    const d = getDb();
    const domainReviews = d.prepare(`
      SELECT id, domain AS title, 'domain_analysis' AS item_type, status, review_sheet, created_at
      FROM domain_analyses WHERE status = 'review_pending'
      ORDER BY created_at ASC
    `).all();
    const topicReviews = d.prepare(`
      SELECT id, title, 'research_topic' AS item_type, review_status AS status, description AS review_sheet, created_at
      FROM extended_research_topics WHERE review_status = 'discovered'
      ORDER BY created_at ASC
    `).all();
    const combined = [...domainReviews, ...topicReviews]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, limit);
    return combined;
  }

  return {
    createExtendedResearchTopic,
    getExtendedResearchTopic,
    listExtendedResearchTopics,
    reviewExtendedResearchTopic,
    getPendingReviewItems,
  };
}

module.exports = { createExtendedResearchRepository };
