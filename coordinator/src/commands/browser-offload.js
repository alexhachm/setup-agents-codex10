'use strict';

const crypto = require('crypto');

const BROWSER_RESEARCH_ALLOWED_WORKFLOW_HOST_RE = /(^|\.)chatgpt\.com$/i;
const BROWSER_SESSION_ID_RE = /^session-[a-f0-9]{16}$/;
const BROWSER_JOB_ID_RE = /^job-[a-f0-9]{16}$/;
const BROWSER_CHANNEL_RE = /^[A-Za-z0-9:_./-]{1,128}$/;
const BROWSER_IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const BROWSER_CALLBACK_TOKEN_RE = /^[A-Za-z0-9_-]{24,256}$/;
const BROWSER_MAX_CALLBACK_CHUNK_BYTES = 32 * 1024;
const BROWSER_MAX_CALLBACK_TOTAL_BYTES = 192 * 1024;
const BROWSER_MAX_OFFLOAD_PAYLOAD_BYTES = 900 * 1024;
const BROWSER_MAX_RESULT_BYTES = 256 * 1024;
const BROWSER_MAX_ERROR_BYTES = 4 * 1024;
const BROWSER_MAX_GUIDANCE_BYTES = 32 * 1024;
const BROWSER_MAX_IDEMPOTENCY_ENTRIES = 200;

function createBrowserOffloadHelpers(deps) {
  const { isPlainObject, utf8ByteLength, normalizePositiveInteger, db } = deps;

  function normalizeBrowserSessionId(sessionId) {
    const normalized = String(sessionId || '').trim();
    if (!BROWSER_SESSION_ID_RE.test(normalized)) {
      throw new Error('Invalid session_id');
    }
    return normalized;
  }

  function normalizeBrowserJobId(jobId) {
    const normalized = String(jobId || '').trim();
    if (!BROWSER_JOB_ID_RE.test(normalized)) {
      throw new Error('Invalid job_id');
    }
    return normalized;
  }

  function normalizeBrowserIdempotencyKey(idempotencyKey) {
    const normalized = String(idempotencyKey || '').trim();
    if (!BROWSER_IDEMPOTENCY_KEY_RE.test(normalized)) {
      throw new Error('Invalid idempotency_key');
    }
    return normalized;
  }

  function normalizeBrowserCallbackToken(callbackToken) {
    const normalized = String(callbackToken || '').trim();
    if (!BROWSER_CALLBACK_TOKEN_RE.test(normalized)) {
      throw new Error('Invalid callback_token');
    }
    return normalized;
  }

  function normalizeBrowserChannel(channel, taskId, fallbackChannel = null) {
    const fallback = fallbackChannel && String(fallbackChannel).trim()
      ? String(fallbackChannel).trim()
      : `research:task-${taskId}`;
    if (channel === undefined || channel === null || String(channel).trim() === '') {
      return fallback;
    }
    const normalized = String(channel).trim();
    if (!BROWSER_CHANNEL_RE.test(normalized)) {
      throw new Error('Invalid browser channel');
    }
    return normalized;
  }

  function normalizeBrowserGuidance(guidance) {
    if (typeof guidance !== 'string') {
      throw new Error('Invalid guidance: must be a string');
    }
    const normalized = guidance.trim();
    if (!normalized) {
      throw new Error('Invalid guidance: cannot be empty');
    }
    if (utf8ByteLength(normalized) > BROWSER_MAX_GUIDANCE_BYTES) {
      throw new Error('Guidance exceeds size limit');
    }
    return normalized;
  }

  function normalizeBrowserWorkflowUrl(workflowUrl) {
    if (typeof workflowUrl !== 'string') {
      throw new Error('Invalid workflow_url: must be a string');
    }
    const trimmed = workflowUrl.trim();
    if (!trimmed) {
      throw new Error('Invalid workflow_url: cannot be empty');
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Invalid workflow_url');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Invalid workflow_url: only https is allowed');
    }
    const normalizedHost = String(parsed.hostname || '').toLowerCase();
    if (!BROWSER_RESEARCH_ALLOWED_WORKFLOW_HOST_RE.test(normalizedHost)) {
      throw new Error('workflow_domain_not_allowed');
    }
    return {
      url: parsed.toString(),
      host: normalizedHost,
    };
  }

  function stableSerialize(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
    if (typeof value === 'object') {
      const keys = Object.keys(value).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(String(value));
  }

  function cloneJsonValue(value, fallback = null) {
    if (value === undefined || value === null) return fallback;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function hashBrowserCallbackToken(callbackToken) {
    return crypto.createHash('sha256').update(String(callbackToken || '')).digest('hex');
  }

  function compareConstantTime(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  function normalizeBrowserOffloadStatus(task) {
    return String(task && task.browser_offload_status || 'not_requested').trim().toLowerCase() || 'not_requested';
  }

  function normalizeBrowserChunkIndex(rawChunkIndex) {
    const chunkIndex = Number.parseInt(rawChunkIndex, 10);
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      throw new Error('Invalid chunk_index');
    }
    return chunkIndex;
  }

  function normalizeBrowserChunk(chunk) {
    if (typeof chunk !== 'string') {
      throw new Error('Invalid chunk payload');
    }
    if (!chunk.length) {
      throw new Error('Invalid chunk payload: cannot be empty');
    }
    const chunkBytes = utf8ByteLength(chunk);
    if (chunkBytes > BROWSER_MAX_CALLBACK_CHUNK_BYTES) {
      throw new Error('Chunk exceeds size limit');
    }
    return { value: chunk, bytes: chunkBytes };
  }

  function normalizeBrowserError(errorValue) {
    if (typeof errorValue !== 'string') {
      throw new Error('Invalid browser job error');
    }
    const normalized = errorValue.trim();
    if (!normalized) {
      throw new Error('Invalid browser job error');
    }
    if (utf8ByteLength(normalized) > BROWSER_MAX_ERROR_BYTES) {
      throw new Error('Browser job error exceeds size limit');
    }
    return normalized;
  }

  function normalizeBrowserCompletionResult(resultValue) {
    if (resultValue === undefined || resultValue === null) return null;
    if (typeof resultValue === 'string') {
      const trimmed = resultValue.trim();
      if (!trimmed) return null;
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    if (typeof resultValue === 'object' || typeof resultValue === 'number' || typeof resultValue === 'boolean') {
      return cloneJsonValue(resultValue, null);
    }
    throw new Error('Invalid result payload');
  }

  function parseBrowserResultPayload(resultText) {
    if (resultText === undefined || resultText === null) return null;
    if (typeof resultText !== 'string') return resultText;
    const trimmed = resultText.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  function normalizeBrowserOffloadState(task) {
    let parsedPayload = {};
    if (task && typeof task.browser_offload_payload === 'string' && task.browser_offload_payload.trim()) {
      try {
        parsedPayload = JSON.parse(task.browser_offload_payload);
      } catch {
        parsedPayload = {};
      }
    }

    const state = isPlainObject(parsedPayload) ? { ...parsedPayload } : {};
    state.version = 1;
    state.session = isPlainObject(state.session) ? { ...state.session } : null;
    state.job = isPlainObject(state.job) ? { ...state.job } : null;
    state.idempotency = isPlainObject(state.idempotency) ? { ...state.idempotency } : {};
    state.idempotency_order = Array.isArray(state.idempotency_order)
      ? state.idempotency_order
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      : [];

    if (state.job) {
      const chunkMap = isPlainObject(state.job.callback_chunk_map)
        ? { ...state.job.callback_chunk_map }
        : {};
      let callbackBytes = 0;
      let callbackCount = 0;
      const normalizedChunkMap = {};
      for (const [rawKey, rawValue] of Object.entries(chunkMap)) {
        const key = String(rawKey).trim();
        if (!/^\d+$/.test(key)) continue;
        if (typeof rawValue !== 'string') continue;
        normalizedChunkMap[key] = rawValue;
        callbackCount += 1;
        callbackBytes += utf8ByteLength(rawValue);
      }
      state.job.callback_chunk_map = normalizedChunkMap;
      state.job.callback_count = callbackCount;
      state.job.callback_bytes = callbackBytes;
    }

    return state;
  }

  function serializeBrowserOffloadState(state) {
    const serialized = JSON.stringify(state);
    if (utf8ByteLength(serialized) > BROWSER_MAX_OFFLOAD_PAYLOAD_BYTES) {
      throw new Error('Browser offload payload exceeds size limit');
    }
    return serialized;
  }

  function buildBrowserIdempotencyFingerprint(command, payload) {
    return crypto.createHash('sha256').update(stableSerialize({ command, payload })).digest('hex');
  }

  function getBrowserIdempotencyReplay(state, command, idempotencyKey, fingerprint) {
    const entry = state.idempotency[idempotencyKey];
    if (!entry) return null;
    if (!isPlainObject(entry) || !entry.command || !entry.fingerprint) {
      throw new Error('Corrupted idempotency entry');
    }
    if (entry.command !== command || entry.fingerprint !== fingerprint) {
      throw new Error('idempotency_key_reuse_mismatch');
    }
    const response = cloneJsonValue(entry.response, null);
    if (!isPlainObject(response)) {
      throw new Error('Corrupted idempotency response');
    }
    return response;
  }

  function setBrowserIdempotencyEntry(state, idempotencyKey, command, fingerprint, response) {
    state.idempotency[idempotencyKey] = {
      command,
      fingerprint,
      response: cloneJsonValue(response, {}),
      recorded_at: new Date().toISOString(),
    };
    state.idempotency_order = state.idempotency_order.filter((key) => key !== idempotencyKey);
    state.idempotency_order.push(idempotencyKey);
    while (state.idempotency_order.length > BROWSER_MAX_IDEMPOTENCY_ENTRIES) {
      const oldestKey = state.idempotency_order.shift();
      if (!oldestKey || oldestKey === idempotencyKey) continue;
      delete state.idempotency[oldestKey];
    }
  }

  function ensureBrowserMutableTask(taskId) {
    const normalizedTaskId = normalizePositiveInteger(taskId, 'task_id');
    const task = db.getTask(normalizedTaskId);
    if (!task) {
      throw new Error(`Task ${normalizedTaskId} not found`);
    }
    if (task.status === 'completed' || task.status === 'failed') {
      throw new Error(`Task ${normalizedTaskId} is terminal`);
    }
    return { taskId: normalizedTaskId, task };
  }

  function ensureBrowserTask(taskId) {
    const normalizedTaskId = normalizePositiveInteger(taskId, 'task_id');
    const task = db.getTask(normalizedTaskId);
    if (!task) {
      throw new Error(`Task ${normalizedTaskId} not found`);
    }
    return { taskId: normalizedTaskId, task };
  }

  function ensureBrowserSessionMatch(state, task, sessionId) {
    const normalizedSessionId = normalizeBrowserSessionId(sessionId);
    const expectedSessionId = state.session && state.session.id
      ? String(state.session.id).trim()
      : String(task.browser_session_id || '').trim();
    if (!expectedSessionId) {
      throw new Error('browser_session_missing');
    }
    if (normalizedSessionId !== expectedSessionId) {
      throw new Error('browser_session_mismatch');
    }
    return normalizedSessionId;
  }

  function ensureBrowserJobMatch(state, jobId) {
    const normalizedJobId = normalizeBrowserJobId(jobId);
    const expectedJobId = state.job && state.job.id ? String(state.job.id).trim() : '';
    if (!expectedJobId) {
      throw new Error('browser_job_missing');
    }
    if (normalizedJobId !== expectedJobId) {
      throw new Error('browser_job_mismatch');
    }
    return normalizedJobId;
  }

  function ensureBrowserCallbackAuthorization(state, callbackToken) {
    const normalizedToken = normalizeBrowserCallbackToken(callbackToken);
    if (!state.job || typeof state.job.callback_token_hash !== 'string' || !state.job.callback_token_hash) {
      throw new Error('callback_auth_failed');
    }
    const candidateHash = hashBrowserCallbackToken(normalizedToken);
    if (!compareConstantTime(state.job.callback_token_hash, candidateHash)) {
      throw new Error('callback_auth_failed');
    }
    return normalizedToken;
  }

  function buildBrowserCallbackText(jobState) {
    if (!jobState || !isPlainObject(jobState.callback_chunk_map)) return '';
    const keys = Object.keys(jobState.callback_chunk_map)
      .map((raw) => Number.parseInt(raw, 10))
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((left, right) => left - right);
    return keys.map((key) => jobState.callback_chunk_map[String(key)]).join('');
  }

  return {
    normalizeBrowserSessionId,
    normalizeBrowserJobId,
    normalizeBrowserIdempotencyKey,
    normalizeBrowserChannel,
    normalizeBrowserGuidance,
    normalizeBrowserWorkflowUrl,
    hashBrowserCallbackToken,
    normalizeBrowserOffloadStatus,
    normalizeBrowserChunkIndex,
    normalizeBrowserChunk,
    normalizeBrowserError,
    normalizeBrowserCompletionResult,
    parseBrowserResultPayload,
    normalizeBrowserOffloadState,
    serializeBrowserOffloadState,
    buildBrowserIdempotencyFingerprint,
    getBrowserIdempotencyReplay,
    setBrowserIdempotencyEntry,
    ensureBrowserMutableTask,
    ensureBrowserTask,
    ensureBrowserSessionMatch,
    ensureBrowserJobMatch,
    ensureBrowserCallbackAuthorization,
    buildBrowserCallbackText,
  };
}

function handleBrowserOffloadCommand(command, args, deps) {
  const { db, utf8ByteLength } = deps;
  const h = createBrowserOffloadHelpers(deps);

  switch (command) {
    case 'browser-create-session': {
      const browserTx = db.getDb().transaction(() => {
        const { taskId, task } = h.ensureBrowserMutableTask(args.task_id);
        const workflow = h.normalizeBrowserWorkflowUrl(args.workflow_url);
        const idempotencyKey = h.normalizeBrowserIdempotencyKey(args.idempotency_key);
        const channel = h.normalizeBrowserChannel(args.channel, taskId, task.browser_channel);
        const state = h.normalizeBrowserOffloadState(task);
        const fingerprint = h.buildBrowserIdempotencyFingerprint('browser-create-session', {
          task_id: taskId,
          workflow_url: workflow.url,
          channel,
        });
        const replay = h.getBrowserIdempotencyReplay(state, 'browser-create-session', idempotencyKey, fingerprint);
        if (replay) return { response: replay, idempotent: true };

        const currentStatus = h.normalizeBrowserOffloadStatus(task);
        if (currentStatus !== 'not_requested') {
          throw new Error(`browser_session_already_initialized:${currentStatus}`);
        }

        const sessionId = `session-${crypto.randomBytes(8).toString('hex')}`;
        const now = new Date().toISOString();
        state.session = {
          id: sessionId,
          channel,
          workflow_url: workflow.url,
          workflow_host: workflow.host,
          created_at: now,
          attached_at: null,
        };
        state.job = null;

        const response = {
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          browser_channel: channel,
          workflow_url: workflow.url,
          browser_offload_status: 'requested',
        };
        h.setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-create-session', fingerprint, response);
        const payloadText = h.serializeBrowserOffloadState(state);
        db.transitionTaskBrowserOffload(taskId, 'requested', {
          browser_session_id: sessionId,
          browser_channel: channel,
          browser_offload_payload: payloadText,
          browser_offload_result: null,
          browser_offload_error: null,
        });
        return { response, idempotent: false };
      });

      const created = browserTx();
      db.log('coordinator', 'browser_research_session_created', {
        task_id: created.response.task_id,
        request_id: created.response.request_id,
        session_id: created.response.session_id,
        browser_channel: created.response.browser_channel,
        workflow_url: created.response.workflow_url,
        idempotent: created.idempotent,
      });
      return { ok: true, ...created.response, idempotent: created.idempotent };
    }

    case 'browser-attach-session': {
      const browserTx = db.getDb().transaction(() => {
        const { taskId, task } = h.ensureBrowserMutableTask(args.task_id);
        const state = h.normalizeBrowserOffloadState(task);
        const sessionId = h.ensureBrowserSessionMatch(state, task, args.session_id);
        const idempotencyKey = h.normalizeBrowserIdempotencyKey(args.idempotency_key);
        const channel = h.normalizeBrowserChannel(
          args.channel,
          taskId,
          (state.session && state.session.channel) || task.browser_channel
        );
        const fingerprint = h.buildBrowserIdempotencyFingerprint('browser-attach-session', {
          task_id: taskId,
          session_id: sessionId,
          channel,
        });
        const replay = h.getBrowserIdempotencyReplay(state, 'browser-attach-session', idempotencyKey, fingerprint);
        if (replay) return { response: replay, idempotent: true };

        const currentStatus = h.normalizeBrowserOffloadStatus(task);
        if (currentStatus !== 'requested') {
          throw new Error(`browser_session_not_attachable:${currentStatus}`);
        }

        const now = new Date().toISOString();
        state.session = {
          ...(state.session || {}),
          id: sessionId,
          channel,
          attached_at: now,
        };
        const response = {
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          browser_channel: channel,
          browser_offload_status: 'attached',
        };
        h.setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-attach-session', fingerprint, response);
        const payloadText = h.serializeBrowserOffloadState(state);
        db.transitionTaskBrowserOffload(taskId, 'queued', {
          browser_session_id: sessionId,
          browser_channel: channel,
          browser_offload_payload: payloadText,
        });
        db.transitionTaskBrowserOffload(taskId, 'launching', {
          browser_session_id: sessionId,
          browser_channel: channel,
          browser_offload_payload: payloadText,
        });
        db.transitionTaskBrowserOffload(taskId, 'attached', {
          browser_session_id: sessionId,
          browser_channel: channel,
          browser_offload_payload: payloadText,
        });
        return { response, idempotent: false };
      });

      const attached = browserTx();
      db.log('coordinator', 'browser_research_session_attached', {
        task_id: attached.response.task_id,
        request_id: attached.response.request_id,
        session_id: attached.response.session_id,
        browser_channel: attached.response.browser_channel,
        idempotent: attached.idempotent,
      });
      return { ok: true, ...attached.response, idempotent: attached.idempotent };
    }

    case 'browser-start-job': {
      const browserTx = db.getDb().transaction(() => {
        const { taskId, task } = h.ensureBrowserMutableTask(args.task_id);
        const workflow = h.normalizeBrowserWorkflowUrl(args.workflow_url);
        const guidance = h.normalizeBrowserGuidance(args.guidance);
        const state = h.normalizeBrowserOffloadState(task);
        const sessionId = h.ensureBrowserSessionMatch(state, task, args.session_id);
        const idempotencyKey = h.normalizeBrowserIdempotencyKey(args.idempotency_key);
        const fingerprint = h.buildBrowserIdempotencyFingerprint('browser-start-job', {
          task_id: taskId,
          session_id: sessionId,
          workflow_url: workflow.url,
          guidance,
        });
        const replay = h.getBrowserIdempotencyReplay(state, 'browser-start-job', idempotencyKey, fingerprint);
        if (replay) return { response: replay, idempotent: true };

        const currentStatus = h.normalizeBrowserOffloadStatus(task);
        if (currentStatus !== 'attached') {
          throw new Error(`browser_job_not_startable:${currentStatus}`);
        }

        const callbackToken = crypto.randomBytes(24).toString('base64url');
        const jobId = `job-${crypto.randomBytes(8).toString('hex')}`;
        const now = new Date().toISOString();
        state.session = {
          ...(state.session || {}),
          id: sessionId,
          workflow_url: workflow.url,
          workflow_host: workflow.host,
        };
        state.job = {
          id: jobId,
          status: 'awaiting_callback',
          workflow_url: workflow.url,
          workflow_host: workflow.host,
          guidance,
          callback_token_hash: h.hashBrowserCallbackToken(callbackToken),
          callback_chunk_map: {},
          callback_count: 0,
          callback_bytes: 0,
          started_at: now,
          updated_at: now,
          completed_at: null,
          failed_at: null,
          result: null,
          error: null,
        };

        const response = {
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          job_id: jobId,
          callback_token: callbackToken,
          browser_offload_status: 'awaiting_callback',
          workflow_url: workflow.url,
        };
        h.setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-start-job', fingerprint, response);
        const payloadText = h.serializeBrowserOffloadState(state);
        db.transitionTaskBrowserOffload(taskId, 'running', {
          browser_offload_payload: payloadText,
          browser_offload_error: null,
        });
        db.transitionTaskBrowserOffload(taskId, 'awaiting_callback', {
          browser_offload_payload: payloadText,
          browser_offload_error: null,
        });
        return { response, idempotent: false };
      });

      const started = browserTx();
      db.log('coordinator', 'browser_research_job_started', {
        task_id: started.response.task_id,
        request_id: started.response.request_id,
        session_id: started.response.session_id,
        job_id: started.response.job_id,
        workflow_url: started.response.workflow_url,
        idempotent: started.idempotent,
      });
      return { ok: true, ...started.response, idempotent: started.idempotent };
    }

    case 'browser-callback-chunk': {
      const { isPlainObject } = deps;
      const browserTx = db.getDb().transaction(() => {
        const { taskId, task } = h.ensureBrowserMutableTask(args.task_id);
        const state = h.normalizeBrowserOffloadState(task);
        const sessionId = h.ensureBrowserSessionMatch(state, task, args.session_id);
        const jobId = h.ensureBrowserJobMatch(state, args.job_id);
        h.ensureBrowserCallbackAuthorization(state, args.callback_token);
        const idempotencyKey = h.normalizeBrowserIdempotencyKey(args.idempotency_key);
        const chunkIndex = h.normalizeBrowserChunkIndex(args.chunk_index);
        const normalizedChunk = h.normalizeBrowserChunk(args.chunk);
        const fingerprint = h.buildBrowserIdempotencyFingerprint('browser-callback-chunk', {
          task_id: taskId,
          session_id: sessionId,
          job_id: jobId,
          chunk_index: chunkIndex,
          chunk: normalizedChunk.value,
        });
        const replay = h.getBrowserIdempotencyReplay(state, 'browser-callback-chunk', idempotencyKey, fingerprint);
        if (replay) return { response: replay, idempotent: true };

        const currentStatus = h.normalizeBrowserOffloadStatus(task);
        if (currentStatus !== 'awaiting_callback') {
          throw new Error(`browser_callback_not_accepting_chunks:${currentStatus}`);
        }

        if (!isPlainObject(state.job.callback_chunk_map)) {
          state.job.callback_chunk_map = {};
        }
        const chunkKey = String(chunkIndex);
        const existingChunk = state.job.callback_chunk_map[chunkKey];
        if (existingChunk !== undefined && existingChunk !== normalizedChunk.value) {
          throw new Error('browser_callback_chunk_index_conflict');
        }

        if (existingChunk === undefined) {
          const nextBytes = Number(state.job.callback_bytes || 0) + normalizedChunk.bytes;
          if (nextBytes > BROWSER_MAX_CALLBACK_TOTAL_BYTES) {
            throw new Error('Browser callback payload exceeds size limit');
          }
          state.job.callback_chunk_map[chunkKey] = normalizedChunk.value;
          state.job.callback_bytes = nextBytes;
          state.job.callback_count = Number(state.job.callback_count || 0) + 1;
        }
        state.job.updated_at = new Date().toISOString();

        const response = {
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          job_id: jobId,
          browser_offload_status: currentStatus,
          callback_count: Number(state.job.callback_count || 0),
          callback_bytes: Number(state.job.callback_bytes || 0),
        };
        h.setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-callback-chunk', fingerprint, response);
        const payloadText = h.serializeBrowserOffloadState(state);
        db.transitionTaskBrowserOffload(taskId, 'awaiting_callback', {
          browser_offload_payload: payloadText,
        });
        return { response, idempotent: false };
      });

      const callbackChunk = browserTx();
      db.log('coordinator', 'browser_research_callback_chunk_received', {
        task_id: callbackChunk.response.task_id,
        request_id: callbackChunk.response.request_id,
        session_id: callbackChunk.response.session_id,
        job_id: callbackChunk.response.job_id,
        callback_count: callbackChunk.response.callback_count,
        callback_bytes: callbackChunk.response.callback_bytes,
        idempotent: callbackChunk.idempotent,
      });
      return { ok: true, ...callbackChunk.response, idempotent: callbackChunk.idempotent };
    }

    case 'browser-complete-job': {
      const browserTx = db.getDb().transaction(() => {
        const { taskId, task } = h.ensureBrowserMutableTask(args.task_id);
        const state = h.normalizeBrowserOffloadState(task);
        const sessionId = h.ensureBrowserSessionMatch(state, task, args.session_id);
        const jobId = h.ensureBrowserJobMatch(state, args.job_id);
        h.ensureBrowserCallbackAuthorization(state, args.callback_token);
        const idempotencyKey = h.normalizeBrowserIdempotencyKey(args.idempotency_key);
        const normalizedResult = h.normalizeBrowserCompletionResult(args.result);
        const fingerprint = h.buildBrowserIdempotencyFingerprint('browser-complete-job', {
          task_id: taskId,
          session_id: sessionId,
          job_id: jobId,
          result: normalizedResult,
        });
        const replay = h.getBrowserIdempotencyReplay(state, 'browser-complete-job', idempotencyKey, fingerprint);
        if (replay) return { response: replay, idempotent: true };

        const currentStatus = h.normalizeBrowserOffloadStatus(task);
        if (currentStatus !== 'awaiting_callback') {
          throw new Error(`browser_job_not_completable:${currentStatus}`);
        }

        const now = new Date().toISOString();
        const callbackText = h.buildBrowserCallbackText(state.job);
        const resultEnvelope = {
          version: 1,
          session_id: sessionId,
          job_id: jobId,
          workflow_url: state.job && state.job.workflow_url ? state.job.workflow_url : null,
          guidance: state.job && state.job.guidance ? state.job.guidance : null,
          callback_text: callbackText,
          callback_count: Number(state.job && state.job.callback_count || 0),
          callback_bytes: Number(state.job && state.job.callback_bytes || 0),
          result: normalizedResult,
          completed_at: now,
        };
        const resultText = JSON.stringify(resultEnvelope);
        if (utf8ByteLength(resultText) > BROWSER_MAX_RESULT_BYTES) {
          throw new Error('Browser completion result exceeds size limit');
        }

        state.job.status = 'completed';
        state.job.completed_at = now;
        state.job.updated_at = now;
        state.job.result = normalizedResult;
        state.job.error = null;
        const response = {
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          job_id: jobId,
          browser_offload_status: 'completed',
          result_bytes: utf8ByteLength(resultText),
        };
        h.setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-complete-job', fingerprint, response);
        const payloadText = h.serializeBrowserOffloadState(state);
        db.transitionTaskBrowserOffload(taskId, 'completed', {
          browser_offload_payload: payloadText,
          browser_offload_result: resultText,
          browser_offload_error: null,
        });
        return { response, idempotent: false };
      });

      const completed = browserTx();
      db.log('coordinator', 'browser_research_job_completed', {
        task_id: completed.response.task_id,
        request_id: completed.response.request_id,
        session_id: completed.response.session_id,
        job_id: completed.response.job_id,
        result_bytes: completed.response.result_bytes,
        idempotent: completed.idempotent,
      });
      return { ok: true, ...completed.response, idempotent: completed.idempotent };
    }

    case 'browser-fail-job': {
      const browserTx = db.getDb().transaction(() => {
        const { taskId, task } = h.ensureBrowserMutableTask(args.task_id);
        const state = h.normalizeBrowserOffloadState(task);
        const sessionId = h.ensureBrowserSessionMatch(state, task, args.session_id);
        const jobId = h.ensureBrowserJobMatch(state, args.job_id);
        h.ensureBrowserCallbackAuthorization(state, args.callback_token);
        const idempotencyKey = h.normalizeBrowserIdempotencyKey(args.idempotency_key);
        const normalizedError = h.normalizeBrowserError(args.error);
        const fingerprint = h.buildBrowserIdempotencyFingerprint('browser-fail-job', {
          task_id: taskId,
          session_id: sessionId,
          job_id: jobId,
          error: normalizedError,
        });
        const replay = h.getBrowserIdempotencyReplay(state, 'browser-fail-job', idempotencyKey, fingerprint);
        if (replay) return { response: replay, idempotent: true };

        const currentStatus = h.normalizeBrowserOffloadStatus(task);
        if (currentStatus !== 'awaiting_callback') {
          throw new Error(`browser_job_not_failable:${currentStatus}`);
        }

        const now = new Date().toISOString();
        state.job.status = 'failed';
        state.job.failed_at = now;
        state.job.updated_at = now;
        state.job.error = normalizedError;
        const response = {
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          job_id: jobId,
          browser_offload_status: 'failed',
          error: normalizedError,
        };
        h.setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-fail-job', fingerprint, response);
        const payloadText = h.serializeBrowserOffloadState(state);
        db.transitionTaskBrowserOffload(taskId, 'failed', {
          browser_offload_payload: payloadText,
          browser_offload_error: normalizedError,
        });
        return { response, idempotent: false };
      });

      const failed = browserTx();
      db.log('coordinator', 'browser_research_job_failed', {
        task_id: failed.response.task_id,
        request_id: failed.response.request_id,
        session_id: failed.response.session_id,
        job_id: failed.response.job_id,
        error: failed.response.error,
        idempotent: failed.idempotent,
      });
      return { ok: true, ...failed.response, idempotent: failed.idempotent };
    }

    case 'browser-job-status': {
      const { taskId, task } = h.ensureBrowserTask(args.task_id);
      const state = h.normalizeBrowserOffloadState(task);
      const sessionId = h.ensureBrowserSessionMatch(state, task, args.session_id);
      const jobId = h.ensureBrowserJobMatch(state, args.job_id);
      const resultPayload = h.parseBrowserResultPayload(task.browser_offload_result);
      const response = {
        ok: true,
        task_id: taskId,
        request_id: task.request_id,
        session_id: sessionId,
        job_id: jobId,
        browser_channel: task.browser_channel || (state.session && state.session.channel) || null,
        browser_offload_status: h.normalizeBrowserOffloadStatus(task),
        workflow_url: state.session && state.session.workflow_url ? state.session.workflow_url : null,
        callback_count: Number(state.job && state.job.callback_count || 0),
        callback_bytes: Number(state.job && state.job.callback_bytes || 0),
        result: resultPayload,
        error: task.browser_offload_error || (state.job && state.job.error) || null,
      };
      db.log('coordinator', 'browser_research_job_status_fetched', {
        task_id: taskId,
        request_id: task.request_id,
        session_id: sessionId,
        job_id: jobId,
        browser_offload_status: response.browser_offload_status,
      });
      return response;
    }

    default:
      throw new Error(`Unknown browser-offload command: ${command}`);
  }
}

module.exports = {
  handleBrowserOffloadCommand,
};
