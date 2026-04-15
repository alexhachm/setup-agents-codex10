'use strict';

function createBrowserRepository(context) {
  const {
    getDb,
    getTask,
    updateTask,
    currentSqlTimestamp,
    BROWSER_OFFLOAD_STATUS_SEQUENCE,
    BROWSER_OFFLOAD_ALLOWED_TRANSITIONS,
    BROWSER_SESSION_STATUS_SEQUENCE,
    BROWSER_SESSION_ALLOWED_TRANSITIONS,
    BROWSER_SESSION_SAFE_UPDATE_KEYS,
    BROWSER_RESEARCH_JOB_STATUS_SEQUENCE,
    BROWSER_RESEARCH_JOB_ALLOWED_TRANSITIONS,
    BROWSER_RESEARCH_JOB_SAFE_UPDATE_KEYS,
  } = context;

  function normalizeBrowserOffloadStatus(value) {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    return BROWSER_OFFLOAD_STATUS_SEQUENCE.includes(normalized) ? normalized : null;
  }

  function canTransitionBrowserOffloadStatus(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) return true;
    const allowed = BROWSER_OFFLOAD_ALLOWED_TRANSITIONS[currentStatus];
    return Boolean(allowed && allowed.has(nextStatus));
  }

  function transitionTaskBrowserOffload(taskId, nextStatus, updates = {}) {
    const normalizedNextStatus = normalizeBrowserOffloadStatus(nextStatus);
    if (!normalizedNextStatus) {
      throw new Error(`Invalid browser offload status: ${nextStatus}`);
    }
    if (updates.browser_offload_status !== undefined) {
      throw new Error('transitionTaskBrowserOffload does not accept browser_offload_status in updates');
    }

    const allowedUpdateKeys = new Set([
      'browser_session_id',
      'browser_channel',
      'browser_offload_payload',
      'browser_offload_result',
      'browser_offload_error',
    ]);
    for (const key of Object.keys(updates)) {
      if (!allowedUpdateKeys.has(key)) {
        throw new Error(`Invalid browser offload update field: ${key}`);
      }
    }

    const task = getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const currentStatus = normalizeBrowserOffloadStatus(task.browser_offload_status) || 'not_requested';
    if (!canTransitionBrowserOffloadStatus(currentStatus, normalizedNextStatus)) {
      throw new Error(
        `Invalid browser offload transition from "${currentStatus}" to "${normalizedNextStatus}"`
      );
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    updateTask(taskId, {
      ...updates,
      browser_offload_status: normalizedNextStatus,
      browser_offload_updated_at: timestamp,
    });
    return getTask(taskId);
  }

  function createBrowserSession({
    id,
    owner,
    task_id = null,
    request_id = null,
    auth_token = null,
    session_token = null,
    auth_expires_at = null,
    session_expires_at = null,
    safety_policy = 'standard',
    safety_policy_state = null,
    metadata = null,
  } = {}) {
    if (!id || !String(id).trim()) throw new Error('browser_sessions.id is required');
    if (!owner || !String(owner).trim()) throw new Error('browser_sessions.owner is required');
    const sessionId = String(id).trim();
    const normalizedOwner = String(owner).trim();
    const normalizedPolicy = String(safety_policy || 'standard').trim().toLowerCase();
    if (!['standard', 'restricted', 'permissive'].includes(normalizedPolicy)) {
      throw new Error(`Invalid safety_policy: ${safety_policy}`);
    }
    getDb().prepare(`
      INSERT INTO browser_sessions (
        id, owner, status, auth_token, session_token,
        auth_expires_at, session_expires_at,
        safety_policy, safety_policy_state,
        task_id, request_id, metadata
      ) VALUES (?, ?, 'initializing', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId, normalizedOwner,
      auth_token ?? null, session_token ?? null,
      auth_expires_at ?? null, session_expires_at ?? null,
      normalizedPolicy,
      safety_policy_state != null ? JSON.stringify(safety_policy_state) : null,
      task_id ?? null, request_id ?? null,
      metadata != null ? JSON.stringify(metadata) : null,
    );
    return getBrowserSession(sessionId);
  }

  function getBrowserSession(id) {
    return getDb().prepare('SELECT * FROM browser_sessions WHERE id = ?').get(id) ?? null;
  }

  function updateBrowserSession(id, fields = {}) {
    const allowedKeys = new Set([...BROWSER_SESSION_SAFE_UPDATE_KEYS, 'status']);
    for (const key of Object.keys(fields)) {
      if (!allowedKeys.has(key)) throw new Error(`Invalid browser_sessions update field: ${key}`);
    }
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return getBrowserSession(id);
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE browser_sessions SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return getBrowserSession(id);
  }

  function transitionBrowserSession(sessionId, nextStatus, updates = {}) {
    const normalizedNext = String(nextStatus || '').trim().toLowerCase();
    if (!BROWSER_SESSION_STATUS_SEQUENCE.includes(normalizedNext)) {
      throw new Error(`Invalid browser session status: ${nextStatus}`);
    }
    for (const key of Object.keys(updates)) {
      if (!BROWSER_SESSION_SAFE_UPDATE_KEYS.has(key)) {
        throw new Error(`Invalid browser session update field: ${key}`);
      }
    }
    const session = getBrowserSession(sessionId);
    if (!session) throw new Error(`Browser session ${sessionId} not found`);
    const currentStatus = String(session.status || 'initializing').trim().toLowerCase();
    const allowed = BROWSER_SESSION_ALLOWED_TRANSITIONS[currentStatus];
    if (currentStatus !== normalizedNext && !(allowed && allowed.has(normalizedNext))) {
      throw new Error(
        `Invalid browser session transition from "${currentStatus}" to "${normalizedNext}"`
      );
    }
    const extraFields = { ...updates };
    if (normalizedNext === 'terminated' && !extraFields.terminated_at) {
      extraFields.terminated_at = currentSqlTimestamp();
    }
    return updateBrowserSession(sessionId, { ...extraFields, status: normalizedNext });
  }

  function createBrowserResearchJob({
    session_id = null,
    task_id = null,
    request_id = null,
    job_type = 'research',
    query,
  } = {}) {
    if (!query || !String(query).trim()) throw new Error('browser_research_jobs.query is required');
    const normalizedType = String(job_type || 'research').trim().toLowerCase();
    if (!['research', 'navigation', 'extraction'].includes(normalizedType)) {
      throw new Error(`Invalid job_type: ${job_type}`);
    }
    const result = getDb().prepare(`
      INSERT INTO browser_research_jobs (session_id, task_id, request_id, job_type, query)
      VALUES (?, ?, ?, ?, ?)
    `).run(session_id ?? null, task_id ?? null, request_id ?? null, normalizedType, String(query).trim());
    return getBrowserResearchJob(result.lastInsertRowid);
  }

  function getBrowserResearchJob(id) {
    return getDb().prepare('SELECT * FROM browser_research_jobs WHERE id = ?').get(id) ?? null;
  }

  function updateBrowserResearchJob(id, fields = {}) {
    const allowedKeys = new Set([...BROWSER_RESEARCH_JOB_SAFE_UPDATE_KEYS, 'status']);
    for (const key of Object.keys(fields)) {
      if (!allowedKeys.has(key)) throw new Error(`Invalid browser_research_jobs update field: ${key}`);
    }
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    if (sets.length === 0) return getBrowserResearchJob(id);
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    getDb().prepare(`UPDATE browser_research_jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    return getBrowserResearchJob(id);
  }

  function transitionBrowserResearchJob(jobId, nextStatus, updates = {}) {
    const normalizedNext = String(nextStatus || '').trim().toLowerCase();
    if (!BROWSER_RESEARCH_JOB_STATUS_SEQUENCE.includes(normalizedNext)) {
      throw new Error(`Invalid browser research job status: ${nextStatus}`);
    }
    for (const key of Object.keys(updates)) {
      if (!BROWSER_RESEARCH_JOB_SAFE_UPDATE_KEYS.has(key)) {
        throw new Error(`Invalid browser research job update field: ${key}`);
      }
    }
    const job = getBrowserResearchJob(jobId);
    if (!job) throw new Error(`Browser research job ${jobId} not found`);
    const currentStatus = String(job.status || 'pending').trim().toLowerCase();
    const allowed = BROWSER_RESEARCH_JOB_ALLOWED_TRANSITIONS[currentStatus];
    if (currentStatus !== normalizedNext && !(allowed && allowed.has(normalizedNext))) {
      throw new Error(
        `Invalid browser research job transition from "${currentStatus}" to "${normalizedNext}"`
      );
    }
    const extraFields = { ...updates };
    if ((normalizedNext === 'running') && !extraFields.started_at) {
      extraFields.started_at = currentSqlTimestamp();
    }
    if (
      (normalizedNext === 'completed' || normalizedNext === 'failed' || normalizedNext === 'cancelled')
      && !extraFields.completed_at
    ) {
      extraFields.completed_at = currentSqlTimestamp();
    }
    return updateBrowserResearchJob(jobId, { ...extraFields, status: normalizedNext });
  }

  function appendBrowserCallbackEvent({
    job_id,
    session_id = null,
    event_type,
    event_payload = {},
  } = {}) {
    if (!job_id) throw new Error('browser_callback_events.job_id is required');
    const validEventTypes = new Set(['result', 'progress', 'error', 'heartbeat']);
    const normalizedType = String(event_type || '').trim().toLowerCase();
    if (!validEventTypes.has(normalizedType)) {
      throw new Error(`Invalid event_type: ${event_type}`);
    }
    const payloadStr = typeof event_payload === 'string'
      ? event_payload
      : JSON.stringify(event_payload ?? {});
    const result = getDb().prepare(`
      INSERT INTO browser_callback_events (job_id, session_id, event_type, event_payload)
      VALUES (?, ?, ?, ?)
    `).run(job_id, session_id ?? null, normalizedType, payloadStr);
    return getDb()
      .prepare('SELECT * FROM browser_callback_events WHERE id = ?')
      .get(result.lastInsertRowid);
  }

  function getBrowserCallbackEvents(jobId, { after_id = 0, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 100, 1000));
    return getDb().prepare(`
      SELECT * FROM browser_callback_events
      WHERE job_id = ? AND id > ?
      ORDER BY id ASC
      LIMIT ?
    `).all(jobId, after_id ?? 0, safeLimit);
  }

  return {
    transitionTaskBrowserOffload,
    createBrowserSession,
    getBrowserSession,
    updateBrowserSession,
    transitionBrowserSession,
    createBrowserResearchJob,
    getBrowserResearchJob,
    updateBrowserResearchJob,
    transitionBrowserResearchJob,
    appendBrowserCallbackEvent,
    getBrowserCallbackEvents,
  };
}

module.exports = { createBrowserRepository };
