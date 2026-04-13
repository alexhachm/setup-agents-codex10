'use strict';

function createDomainAnalysisRepository(context) {
  const {
    getDb,
    log,
    currentSqlTimestamp,
  } = context;

  function createDomainAnalysis(domain, sourceMapHash = null) {
    const now = currentSqlTimestamp();
    const result = getDb().prepare(`
      INSERT INTO domain_analyses (domain, source_map_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(domain, sourceMapHash, now, now);
    const id = Number(result.lastInsertRowid);
    log('coordinator', 'domain_analysis_created', { id, domain });
    return getDomainAnalysis(id);
  }

  function updateDomainAnalysis(id, updates) {
    const d = getDb();
    const now = currentSqlTimestamp();
    const fields = [];
    const params = [];
    for (const [key, val] of Object.entries(updates)) {
      if (['status', 'draft_payload', 'review_sheet', 'human_feedback', 'confidence_score', 'analyzed_files'].includes(key)) {
        fields.push(`${key} = ?`);
        params.push(val);
      }
    }
    if (fields.length === 0) return getDomainAnalysis(id);
    fields.push('updated_at = ?');
    params.push(now);
    params.push(id);
    d.prepare(`UPDATE domain_analyses SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return getDomainAnalysis(id);
  }

  function getDomainAnalysis(id) {
    return getDb().prepare('SELECT * FROM domain_analyses WHERE id = ?').get(id) || null;
  }

  function getLatestDomainAnalysis(domain) {
    return getDb().prepare(
      'SELECT * FROM domain_analyses WHERE domain = ? ORDER BY created_at DESC LIMIT 1'
    ).get(domain) || null;
  }

  function listDomainAnalyses({ domain = null, status = null, limit = 50 } = {}) {
    const conditions = [];
    const params = [];
    if (domain) { conditions.push('domain = ?'); params.push(domain); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    return getDb().prepare(
      `SELECT * FROM domain_analyses ${where} ORDER BY created_at DESC LIMIT ?`
    ).all(...params);
  }

  function approveDomainAnalysis(id, humanFeedback = null) {
    const now = currentSqlTimestamp();
    const d = getDb();
    const result = d.prepare(`
      UPDATE domain_analyses
      SET status = 'approved', human_feedback = COALESCE(?, human_feedback), approved_at = ?, updated_at = ?
      WHERE id = ? AND status = 'review_pending'
    `).run(humanFeedback, now, now, id);
    if (result.changes > 0) {
      log('coordinator', 'domain_analysis_approved', { id, has_feedback: !!humanFeedback });
    }
    return result.changes > 0;
  }

  function rejectDomainAnalysis(id, humanFeedback = null) {
    const now = currentSqlTimestamp();
    const result = getDb().prepare(`
      UPDATE domain_analyses
      SET status = 'rejected', human_feedback = COALESCE(?, human_feedback), updated_at = ?
      WHERE id = ? AND status = 'review_pending'
    `).run(humanFeedback, now, id);
    if (result.changes > 0) {
      log('coordinator', 'domain_analysis_rejected', { id });
    }
    return result.changes > 0;
  }

  function getAuthoritativeFeedback(domain) {
    return getDb().prepare(`
      SELECT id, human_feedback, draft_payload, approved_at
      FROM domain_analyses
      WHERE domain = ? AND status = 'approved' AND human_feedback IS NOT NULL
      ORDER BY approved_at ASC
    `).all(domain);
  }

  return {
    createDomainAnalysis,
    updateDomainAnalysis,
    getDomainAnalysis,
    getLatestDomainAnalysis,
    listDomainAnalyses,
    approveDomainAnalysis,
    rejectDomainAnalysis,
    getAuthoritativeFeedback,
  };
}

module.exports = { createDomainAnalysisRepository };
