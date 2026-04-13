'use strict';

const LOOP_REQUEST_FILE_SIGNAL_RE = /\b(?:[a-z0-9._-]+\/)+[a-z0-9._-]+(?:\.[a-z0-9]{1,12})?\b/i;
const LOOP_REQUEST_WHAT_SIGNAL_RE = /\b(add|remove|update|fix|prevent|refactor|validate|guard|handle|enforce|dedup|dedupe|retry|throttle|cache|instrument|harden|optimi[sz]e|replace|sync|align|extend|improve)\b/i;
const LOOP_REQUEST_WHY_SIGNAL_RE = /\b(production|prod|incident|outage|risk|regression|failure|downtime|availability|integrity|security|data\s+loss|overspend|latency|throughput)\b/i;

function createLoopsRepository(context) {
  const {
    getDb,
    crypto,
    validateColumns,
    getConfig,
    log,
    sendMail,
    coordinatorAgeMs,
    parsePositiveInt,
    computeLoopRequestRetryAfterSec,
    DEFAULT_LOOP_REQUEST_SIMILARITY_THRESHOLD,
    LOOP_REQUEST_SIMILAR_RECENT_WINDOW_HOURS,
    LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT,
  } = context;

  function createLoop(prompt) {
    const result = getDb().prepare(`
      INSERT INTO loops (prompt) VALUES (?)
    `).run(prompt);
    log('coordinator', 'loop_created', { loop_id: result.lastInsertRowid, prompt: prompt.slice(0, 200) });
    return result.lastInsertRowid;
  }

  function getLoop(id) {
    return getDb().prepare('SELECT * FROM loops WHERE id = ?').get(id);
  }

  function updateLoop(id, fields) {
    validateColumns('loops', fields);
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE loops SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  function setLoopPrompt(id, prompt, allowedStatuses = ['active', 'paused']) {
    const normalizedPrompt = String(prompt || '');
    if (!normalizedPrompt.trim()) {
      return { ok: false, error: 'prompt must be a non-empty string' };
    }
    const allowed = Array.isArray(allowedStatuses)
      ? allowedStatuses.map((status) => String(status))
      : ['active', 'paused'];
    const txn = getDb().transaction(() => {
      const loop = getLoop(id);
      if (!loop) return { ok: false, error: 'Loop not found' };
      if (!allowed.includes(loop.status)) {
        return { ok: false, error: `Loop is ${loop.status}, prompt can only be updated for active or paused loops` };
      }
      updateLoop(id, { prompt: normalizedPrompt });
      const updated = getLoop(id);
      return { ok: true, loop: updated };
    });
    return txn();
  }

  function refreshLoopPrompt(id, prompt) {
    return setLoopPrompt(id, prompt, ['active']);
  }

  function listLoops(status) {
    if (status) return getDb().prepare('SELECT * FROM loops WHERE status = ? ORDER BY id DESC').all(status);
    return getDb().prepare('SELECT * FROM loops ORDER BY id DESC').all();
  }

  function stopLoop(id) {
    getDb().prepare(`
      UPDATE loops SET status = 'stopped', stopped_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
    `).run(id);
    log('coordinator', 'loop_stopped', { loop_id: id });
  }

  function normalizeLoopRequestText(value) {
    return String(value || '')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseIntConfig(key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = getConfig(key);
    if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
    const parsed = Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  function parseFloatConfig(key, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
    const raw = getConfig(key);
    if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
    const parsed = Number.parseFloat(String(raw).trim());
    if (!Number.isFinite(parsed)) return fallback;
    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
  }

  function buildSimilarityNgrams(value) {
    const tokens = normalizeLoopRequestText(value)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2);
    if (tokens.length <= 1) return tokens;
    const ngrams = [];
    for (let i = 0; i < tokens.length - 1; i += 1) {
      ngrams.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
    return ngrams;
  }

  function buildFrequencyMap(values) {
    const freq = new Map();
    for (const value of values) {
      freq.set(value, (freq.get(value) || 0) + 1);
    }
    return freq;
  }

  function computeLoopRequestSimilarity(left, right) {
    const leftNgrams = buildSimilarityNgrams(left);
    const rightNgrams = buildSimilarityNgrams(right);
    if (leftNgrams.length === 0 || rightNgrams.length === 0) return 0;

    const leftFreq = buildFrequencyMap(leftNgrams);
    const rightFreq = buildFrequencyMap(rightNgrams);
    const leftTotal = leftNgrams.length;
    const rightTotal = rightNgrams.length;
    let overlap = 0;
    for (const [ngram, leftCount] of leftFreq.entries()) {
      const rightCount = rightFreq.get(ngram) || 0;
      overlap += Math.min(leftCount, rightCount);
    }
    return (2 * overlap) / (leftTotal + rightTotal);
  }

  function findMostSimilarLoopRequest(candidates, targetDescription, threshold) {
    let bestMatch = null;
    for (const candidate of candidates) {
      const similarity = computeLoopRequestSimilarity(candidate.description, targetDescription);
      if (similarity < threshold) continue;
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { ...candidate, similarity };
      }
    }
    return bestMatch;
  }

  function evaluateLoopRequestQuality(description, minDescriptionChars = 180) {
    const text = normalizeLoopRequestText(description);
    const issues = [];
    if (text.length < minDescriptionChars) {
      issues.push(`description too short (${text.length} < ${minDescriptionChars})`);
    }
    if (!LOOP_REQUEST_FILE_SIGNAL_RE.test(text)) {
      issues.push('missing concrete file path signal (WHERE)');
    }
    if (!LOOP_REQUEST_WHAT_SIGNAL_RE.test(text)) {
      issues.push('missing concrete change verb (WHAT)');
    }
    if (!LOOP_REQUEST_WHY_SIGNAL_RE.test(text)) {
      issues.push('missing production impact/risk signal (WHY)');
    }
    return { ok: issues.length === 0, issues };
  }

  function createLoopRequest(description, loopId) {
    const normalizedDescription = normalizeLoopRequestText(description);
    const qualityGateEnabled = String(getConfig('loop_request_quality_gate') || 'true').toLowerCase() !== 'false';
    const minDescriptionChars = parseIntConfig('loop_request_min_description_chars', 180, { min: 80, max: 5000 });
    const loopRequestMinIntervalSec = parseIntConfig('loop_request_min_interval_sec', 0, { min: 0, max: 86400 });
    const loopRequestMaxPerHour = parsePositiveInt(getConfig('loop_request_max_per_hour'));
    const loopRequestSimilarityThreshold = parseFloatConfig(
      'loop_request_similarity_threshold',
      DEFAULT_LOOP_REQUEST_SIMILARITY_THRESHOLD,
      { min: 0.5, max: 0.99 }
    );

    if (qualityGateEnabled) {
      const quality = evaluateLoopRequestQuality(normalizedDescription, minDescriptionChars);
      if (!quality.ok) {
        log('loop', 'loop_request_rejected_quality', {
          loop_id: loopId,
          reason: quality.issues.join('; '),
          description: normalizedDescription.slice(0, 300),
        });
        return {
          id: null,
          deduplicated: true,
          suppressed: true,
          reason: 'quality_gate',
          details: quality.issues,
        };
      }
    }

    const d = getDb();
    const txn = d.transaction(() => {
      // Check for active (non-completed/failed) request from same loop with same description
      const existing = d.prepare(`
        SELECT id FROM requests
        WHERE loop_id = ? AND description = ? AND status NOT IN ('completed', 'failed')
      `).get(loopId, normalizedDescription);
      if (existing) {
        return {
          id: existing.id,
          deduplicated: true,
          suppressed: false,
          reason: 'exact_active_duplicate',
        };
      }

      const activeCandidates = d.prepare(`
        SELECT id, description
        FROM requests
        WHERE loop_id = ? AND status NOT IN ('completed', 'failed')
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `).all(loopId, LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT);
      const similarActive = findMostSimilarLoopRequest(activeCandidates, normalizedDescription, loopRequestSimilarityThreshold);
      if (similarActive) {
        return {
          id: similarActive.id,
          deduplicated: true,
          suppressed: false,
          reason: 'similar_active_duplicate',
        };
      }

      if (loopRequestMinIntervalSec > 0) {
        const mostRecent = d.prepare(`
          SELECT id, created_at
          FROM requests
          WHERE loop_id = ?
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 1
        `).get(loopId);
        if (mostRecent) {
          const ageMs = coordinatorAgeMs(mostRecent.created_at);
          const cooldownMs = loopRequestMinIntervalSec * 1000;
          if (ageMs !== null && ageMs < cooldownMs) {
            const retryAfterSec = Math.max(1, Math.ceil((cooldownMs - ageMs) / 1000));
            log('loop', 'loop_request_suppressed', {
              loop_id: loopId,
              reason: 'cooldown',
              retry_after_sec: retryAfterSec,
              min_interval_sec: loopRequestMinIntervalSec,
            });
            return {
              id: null,
              deduplicated: false,
              suppressed: true,
              reason: 'cooldown',
              retry_after_sec: retryAfterSec,
            };
          }
        }
      }

      if (loopRequestMaxPerHour !== null) {
        const recentWindow = d.prepare(`
          SELECT COUNT(*) AS request_count, MIN(created_at) AS oldest_created_at
          FROM requests
          WHERE loop_id = ? AND created_at >= datetime('now', '-1 hour')
        `).get(loopId);
        const requestCount = Number.parseInt(String(recentWindow?.request_count ?? 0), 10) || 0;
        if (requestCount >= loopRequestMaxPerHour) {
          const retryAfterSec = computeLoopRequestRetryAfterSec(recentWindow?.oldest_created_at ?? null);
          log('loop', 'loop_request_suppressed', {
            loop_id: loopId,
            reason: 'rate_limit',
            retry_after_sec: retryAfterSec,
            max_per_hour: loopRequestMaxPerHour,
          });
          return {
            id: null,
            deduplicated: false,
            suppressed: true,
            reason: 'rate_limit',
            retry_after_sec: retryAfterSec,
          };
        }
      }

      const recentSimilarCandidates = d.prepare(`
        SELECT id, description, status
        FROM requests
        WHERE loop_id = ?
          AND status IN ('completed', 'failed')
          AND created_at >= datetime('now', ?)
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?
      `).all(loopId, `-${LOOP_REQUEST_SIMILAR_RECENT_WINDOW_HOURS} hours`, LOOP_REQUEST_SIMILAR_CANDIDATE_LIMIT);
      const similarRecent = findMostSimilarLoopRequest(
        recentSimilarCandidates,
        normalizedDescription,
        loopRequestSimilarityThreshold
      );
      if (similarRecent) {
        log('loop', 'loop_request_suppressed', {
          loop_id: loopId,
          reason: 'similar_recent_duplicate',
          duplicate_of: similarRecent.id,
          duplicate_status: similarRecent.status,
        });
        return {
          id: similarRecent.id,
          deduplicated: true,
          suppressed: true,
          reason: 'similar_recent_duplicate',
        };
      }

      const id = 'req-' + crypto.randomBytes(4).toString('hex');
      d.prepare(`
        INSERT INTO requests (id, description, loop_id) VALUES (?, ?, ?)
      `).run(id, normalizedDescription, loopId);
      sendMail('architect', 'new_request', { request_id: id, description: normalizedDescription, loop_id: loopId });
      sendMail('master-1', 'request_acknowledged', { request_id: id, description: normalizedDescription, loop_id: loopId });
      log('loop', 'loop_request_created', { request_id: id, loop_id: loopId, description: normalizedDescription });
      return { id, deduplicated: false, suppressed: false };
    });
    return txn();
  }

  function listLoopRequests(loopId) {
    return getDb().prepare('SELECT * FROM requests WHERE loop_id = ? ORDER BY created_at DESC').all(loopId);
  }

  return {
    createLoop,
    getLoop,
    updateLoop,
    setLoopPrompt,
    refreshLoopPrompt,
    listLoops,
    stopLoop,
    evaluateLoopRequestQuality,
    createLoopRequest,
    listLoopRequests,
  };
}

module.exports = { createLoopsRepository };
