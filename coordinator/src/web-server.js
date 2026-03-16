'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('./db');
const instanceRegistry = require('./instance-registry');
const { parseBudgetStateConfig } = require('./cli-server');

const REPO_RE = /^(https?:\/\/github\.com\/)?[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/;
const SAFE_PATH_RE = /^(?:\/|[A-Za-z]:[\\/])[a-zA-Z0-9._\\/: -]+$/;
const ROUTING_BUDGET_STATE_KEY = 'routing_budget_state';
const BROWSER_SESSION_ID_RE = /^[a-zA-Z0-9._:-]{10,128}$/;
const BROWSER_OFFLOAD_STATUS_ORDER = Object.freeze([
  'not_requested',
  'requested',
  'queued',
  'launching',
  'attached',
  'running',
  'awaiting_callback',
  'completed',
  'failed',
  'cancelled',
]);
const BROWSER_ACTIVE_STATUSES = new Set([
  'requested',
  'queued',
  'launching',
  'attached',
  'running',
  'awaiting_callback',
]);
const BROWSER_TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const BROWSER_BRIDGE_DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const BROWSER_BRIDGE_MIN_TIMEOUT_MS = 5000;
const BROWSER_BRIDGE_MAX_TIMEOUT_MS = 30 * 60 * 1000;
const BROWSER_BRIDGE_ALLOWED_ORIGINS_DEFAULT = Object.freeze([
  'https://chatgpt.com',
  'https://chat.openai.com',
]);
const USAGE_COST_BURN_RATE_DEFAULTS = Object.freeze({
  usd_15m: 0,
  usd_60m: 0,
  usd_24h: 0,
  request_id: null,
  request_total_usd: 0,
});

let server = null;
let wss = null;
let setupProcess = null;
let broadcastIntervalId = null;
let pingIntervalId = null;
let browserBridgeEnabled = true;
let browserSessions = new Map();
let browserSessionsByTaskId = new Map();
let browserSessionTimeouts = new Map();
let browserAllowedOrigins = new Set(BROWSER_BRIDGE_ALLOWED_ORIGINS_DEFAULT);
let browserSessionCounter = 0;
let browserSessionTimeoutMs = BROWSER_BRIDGE_DEFAULT_TIMEOUT_MS;
let browserAllowMissingOrigin = false;
let browserEventHook = null;
const LAUNCH_READINESS_MAX_ATTEMPTS = 20;
const LAUNCH_READINESS_RETRY_MS = 500;
const LAUNCH_HTTP_TIMEOUT_MS = 1500;

function parseStrictPositiveIntegerParam(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function requestLocalApi({ port, path: reqPath, method = 'GET', body = null, headers = {}, timeoutMs = LAUNCH_HTTP_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers,
      timeout: timeoutMs,
    }, (apiRes) => {
      let responseBody = '';
      apiRes.on('data', (chunk) => {
        responseBody += chunk.toString();
      });
      apiRes.on('end', () => {
        resolve({ statusCode: apiRes.statusCode || 0, body: responseBody });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForCoordinatorReady(port, pid) {
  let lastError = 'No response from coordinator';
  for (let attempt = 1; attempt <= LAUNCH_READINESS_MAX_ATTEMPTS; attempt++) {
    if (!isPidAlive(pid)) {
      return { ok: false, error: 'Coordinator process exited before becoming ready' };
    }
    try {
      const statusRes = await requestLocalApi({ port, path: '/api/status' });
      if (statusRes.statusCode >= 200 && statusRes.statusCode < 300) {
        return { ok: true };
      }
      lastError = `Readiness probe returned HTTP ${statusRes.statusCode}`;
    } catch (e) {
      lastError = e.message;
    }
    if (attempt < LAUNCH_READINESS_MAX_ATTEMPTS) {
      await sleep(LAUNCH_READINESS_RETRY_MS);
    }
  }
  return {
    ok: false,
    error: `Coordinator did not become ready after ${LAUNCH_READINESS_MAX_ATTEMPTS} attempts (${lastError})`,
  };
}

async function seedCoordinatorConfig(port, payload) {
  const body = JSON.stringify(payload);
  const response = await requestLocalApi({
    port,
    path: '/api/config',
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  });
  const trimmedBody = (response.body || '').trim();
  if (response.statusCode >= 200 && response.statusCode < 300) {
    return { ok: true };
  }
  return {
    ok: false,
    statusCode: response.statusCode,
    error: trimmedBody ? `HTTP ${response.statusCode}: ${trimmedBody}` : `HTTP ${response.statusCode}`,
  };
}

function cleanupFailedLaunch(pid, port) {
  if (isPidAlive(pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  try { instanceRegistry.deregister(port); } catch {}
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeBrowserOffloadStatus(value) {
  if (value === null || value === undefined) return 'not_requested';
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return 'not_requested';
  return BROWSER_OFFLOAD_STATUS_ORDER.includes(normalized) ? normalized : 'not_requested';
}

function statusOrderIndex(status) {
  return BROWSER_OFFLOAD_STATUS_ORDER.indexOf(status);
}

function buildBrowserSessionId() {
  browserSessionCounter += 1;
  const seq = String(browserSessionCounter).padStart(4, '0');
  return `browser-${Date.now()}-${seq}-${crypto.randomBytes(3).toString('hex')}`;
}

function buildBrowserToken() {
  return crypto.randomBytes(24).toString('hex');
}

function normalizeBrowserSessionId(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return BROWSER_SESSION_ID_RE.test(normalized) ? normalized : null;
}

function timingSafeTokenMatches(expected, provided) {
  const expectedBuf = Buffer.from(String(expected || ''), 'utf8');
  const providedBuf = Buffer.from(String(provided || ''), 'utf8');
  if (!expectedBuf.length || expectedBuf.length !== providedBuf.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

function clampBrowserTimeoutMs(value, fallback = BROWSER_BRIDGE_DEFAULT_TIMEOUT_MS) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < BROWSER_BRIDGE_MIN_TIMEOUT_MS) return BROWSER_BRIDGE_MIN_TIMEOUT_MS;
  if (parsed > BROWSER_BRIDGE_MAX_TIMEOUT_MS) return BROWSER_BRIDGE_MAX_TIMEOUT_MS;
  return parsed;
}

function parseBooleanConfig(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function parseAllowedOriginsConfig(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return new Set(BROWSER_BRIDGE_ALLOWED_ORIGINS_DEFAULT);
  }
  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return new Set(BROWSER_BRIDGE_ALLOWED_ORIGINS_DEFAULT);
  }
  let values = null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) values = parsed;
  } catch {}
  if (!values) values = trimmed.split(',');
  const origins = new Set();
  for (const value of values) {
    const normalized = normalizeOrigin(value);
    if (normalized) origins.add(normalized);
  }
  if (!origins.size) {
    return new Set(BROWSER_BRIDGE_ALLOWED_ORIGINS_DEFAULT);
  }
  return origins;
}

function normalizeOrigin(originValue) {
  if (!originValue) return null;
  const trimmed = String(originValue).trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function refreshBrowserBridgeConfig() {
  try {
    browserSessionTimeoutMs = clampBrowserTimeoutMs(
      db.getConfig('browser_bridge_callback_timeout_ms'),
      BROWSER_BRIDGE_DEFAULT_TIMEOUT_MS
    );
    browserAllowedOrigins = parseAllowedOriginsConfig(
      db.getConfig('browser_bridge_allowed_origins')
    );
    browserAllowMissingOrigin = parseBooleanConfig(
      db.getConfig('browser_bridge_allow_missing_origin'),
      false
    );
  } catch {
    browserSessionTimeoutMs = BROWSER_BRIDGE_DEFAULT_TIMEOUT_MS;
    browserAllowedOrigins = new Set(BROWSER_BRIDGE_ALLOWED_ORIGINS_DEFAULT);
    browserAllowMissingOrigin = false;
  }
}

function hasAllowedBrowserOrigin(origin) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return browserAllowedOrigins.has(normalized);
}

function readBearerToken(req) {
  const auth = String(req.headers.authorization || '').trim();
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = String(match[1] || '').trim();
  return token || null;
}

function isJsonLikeContentType(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  return !contentType || contentType.includes('application/json');
}

function safeJsonStringify(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}

function summarizeBrowserError(error) {
  if (error instanceof Error) return error.message;
  if (error === null || error === undefined) return 'unknown error';
  const text = String(error).trim();
  return text ? text : 'unknown error';
}

function buildBrowserBridgeAccess(session, includeSecrets = false) {
  const payload = {
    session_id: session.id,
    task_id: session.taskId,
    request_id: session.requestId,
    channel: session.channel,
    status: session.status,
    callback_timeout_ms: session.timeoutMs,
    launch_url: `https://chatgpt.com/?mac10_bridge_session=${encodeURIComponent(session.id)}&mac10_bridge_token=${encodeURIComponent(session.bridgeToken)}`,
    attach_endpoint: '/api/browser/attach',
    callback_endpoint: `/api/browser/callback/${encodeURIComponent(session.id)}`,
  };
  if (includeSecrets) {
    payload.bridge_token = session.bridgeToken;
    payload.callback_token = session.callbackToken;
  }
  return payload;
}

function buildBrowserSessionPublic(session, { includeSecrets = false } = {}) {
  const payload = {
    session_id: session.id,
    task_id: session.taskId,
    request_id: session.requestId,
    channel: session.channel,
    status: session.status,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    launched_at: session.launchedAt,
    attached_at: session.attachedAt,
    completed_at: session.completedAt,
    last_callback_at: session.lastCallbackAt,
    deadline_at: session.deadlineAt,
    timeout_ms: session.timeoutMs,
    last_error: session.lastError,
    progress_count: session.progress.length,
    latest_progress: session.progress.length ? session.progress[session.progress.length - 1] : null,
    result: session.result,
    bridge: buildBrowserBridgeAccess(session, includeSecrets),
  };
  return payload;
}

function listBrowserSessionsPublic() {
  return Array.from(browserSessions.values())
    .map((session) => buildBrowserSessionPublic(session))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function clearBrowserSessionTimeout(sessionId) {
  const timeout = browserSessionTimeouts.get(sessionId);
  if (timeout) clearTimeout(timeout);
  browserSessionTimeouts.delete(sessionId);
}

function scheduleBrowserSessionTimeout(sessionId) {
  clearBrowserSessionTimeout(sessionId);
  const session = browserSessions.get(sessionId);
  if (!session || BROWSER_TERMINAL_STATUSES.has(session.status)) return;
  const deadlineMs = Date.parse(session.deadlineAt || '');
  if (!Number.isFinite(deadlineMs)) return;
  const delayMs = Math.max(0, deadlineMs - Date.now());
  const timeout = setTimeout(() => {
    handleBrowserSessionTimeout(sessionId);
  }, delayMs);
  if (typeof timeout.unref === 'function') timeout.unref();
  browserSessionTimeouts.set(sessionId, timeout);
}

function upsertBrowserSession(session) {
  browserSessions.set(session.id, session);
  browserSessionsByTaskId.set(session.taskId, session.id);
  scheduleBrowserSessionTimeout(session.id);
}

function terminateBrowserSession(session) {
  if (!session) return;
  clearBrowserSessionTimeout(session.id);
}

function getSessionByTaskId(taskId) {
  const key = Number.parseInt(taskId, 10);
  if (!Number.isInteger(key) || key <= 0) return null;
  const sessionId = browserSessionsByTaskId.get(key);
  return sessionId ? browserSessions.get(sessionId) || null : null;
}

function notifyBrowserEvent(event, session, details = {}) {
  const payload = {
    type: 'browser_offload_event',
    event,
    task_id: session ? session.taskId : null,
    request_id: session ? session.requestId : null,
    session_id: session ? session.id : null,
    status: session ? session.status : null,
    timestamp: nowIso(),
    session: session ? buildBrowserSessionPublic(session) : null,
    ...details,
  };
  broadcast(payload);
  if (typeof browserEventHook === 'function') {
    try {
      browserEventHook(payload);
    } catch {}
  }
}

function getTaskStrict(taskId) {
  const parsedTaskId = Number.parseInt(taskId, 10);
  if (!Number.isInteger(parsedTaskId) || parsedTaskId <= 0) {
    throw new Error('task_id must be a positive integer');
  }
  const task = db.getTask(parsedTaskId);
  if (!task) {
    throw new Error(`Task ${parsedTaskId} not found`);
  }
  return task;
}

function applyTaskStatusTarget(taskId, targetStatus, updates = {}) {
  const target = normalizeBrowserOffloadStatus(targetStatus);
  const task = getTaskStrict(taskId);
  const current = normalizeBrowserOffloadStatus(task.browser_offload_status);
  const currentIndex = statusOrderIndex(current);
  const targetIndex = statusOrderIndex(target);
  if (targetIndex < 0) throw new Error(`Invalid browser offload status: ${targetStatus}`);
  if (currentIndex < 0) throw new Error(`Task ${taskId} has invalid browser offload status: ${current}`);
  if (currentIndex > targetIndex) {
    throw new Error(`Cannot move browser offload status backward from "${current}" to "${target}"`);
  }
  if (currentIndex === targetIndex) {
    if (updates && Object.keys(updates).length > 0) {
      db.updateTask(taskId, updates);
    }
    return db.getTask(taskId);
  }
  let nextTask = task;
  for (let i = currentIndex + 1; i <= targetIndex; i++) {
    const status = BROWSER_OFFLOAD_STATUS_ORDER[i];
    const statusUpdates = i === targetIndex ? updates : {};
    nextTask = db.transitionTaskBrowserOffload(taskId, status, statusUpdates);
  }
  return nextTask;
}

function recordTaskBrowserFailure(taskId, errorMessage, fallbackUpdates = {}) {
  const normalizedError = String(errorMessage || 'Browser offload failed').trim() || 'Browser offload failed';
  const task = db.getTask(taskId);
  if (!task) return null;
  const status = normalizeBrowserOffloadStatus(task.browser_offload_status);
  const failureUpdates = {
    browser_offload_error: normalizedError,
    ...fallbackUpdates,
  };
  try {
    if (status === 'failed') {
      db.updateTask(taskId, failureUpdates);
      return db.getTask(taskId);
    }
    if (status === 'completed' || status === 'cancelled') {
      db.updateTask(taskId, failureUpdates);
      return db.getTask(taskId);
    }
    return applyTaskStatusTarget(taskId, 'failed', failureUpdates);
  } catch {
    try {
      db.updateTask(taskId, failureUpdates);
    } catch {}
    return db.getTask(taskId);
  }
}

function failBrowserSession(session, errorMessage, { reason = 'failed', updateTask = true } = {}) {
  if (!session) return;
  session.status = 'failed';
  session.lastError = String(errorMessage || 'Browser offload failed').trim() || 'Browser offload failed';
  session.updatedAt = nowIso();
  session.completedAt = session.completedAt || session.updatedAt;
  session.deadlineAt = session.updatedAt;
  upsertBrowserSession(session);
  terminateBrowserSession(session);
  if (updateTask) {
    recordTaskBrowserFailure(session.taskId, session.lastError, {
      browser_session_id: session.id,
      browser_channel: session.channel,
    });
  }
  notifyBrowserEvent(reason, session, { error: session.lastError });
}

function handleBrowserSessionTimeout(sessionId) {
  const session = browserSessions.get(sessionId);
  if (!session || BROWSER_TERMINAL_STATUSES.has(session.status)) return;
  const deadlineMs = Date.parse(session.deadlineAt || '');
  if (Number.isFinite(deadlineMs) && deadlineMs > Date.now()) {
    scheduleBrowserSessionTimeout(session.id);
    return;
  }
  failBrowserSession(
    session,
    `No browser callback received before timeout (${session.timeoutMs}ms)`,
    { reason: 'timeout', updateTask: true }
  );
}

function requireBrowserBridgeRoute(req, res) {
  if (!browserBridgeEnabled) {
    res.status(404).json({ ok: false, error: 'Browser bridge APIs are disabled' });
    return false;
  }
  if (!isJsonLikeContentType(req)) {
    res.status(415).json({ ok: false, error: 'application/json content type is required' });
    return false;
  }
  return true;
}

function requireBrowserOrigin(req, res) {
  const originHeader = req.headers.origin;
  if (!originHeader && browserAllowMissingOrigin) {
    return { ok: true, origin: null };
  }
  const normalizedOrigin = normalizeOrigin(originHeader);
  if (!normalizedOrigin) {
    res.status(403).json({
      ok: false,
      error: 'Origin is required for browser bridge routes',
      allowed_origins: Array.from(browserAllowedOrigins),
    });
    return { ok: false, origin: null };
  }
  if (!hasAllowedBrowserOrigin(normalizedOrigin)) {
    res.status(403).json({
      ok: false,
      error: 'Origin is not allowed for browser bridge routes',
      origin: normalizedOrigin,
      allowed_origins: Array.from(browserAllowedOrigins),
    });
    return { ok: false, origin: normalizedOrigin };
  }
  return { ok: true, origin: normalizedOrigin };
}

function resolveSessionForStatus({ sessionId = null, taskId = null } = {}) {
  const normalizedSessionId = normalizeBrowserSessionId(sessionId);
  if (normalizedSessionId) {
    return browserSessions.get(normalizedSessionId) || null;
  }
  const parsedTaskId = Number.parseInt(taskId, 10);
  if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
    return getSessionByTaskId(parsedTaskId);
  }
  return null;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue === 'object') return isPlainObject(rawValue) ? rawValue : null;
  const trimmed = String(rawValue).trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRoutingField(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function parseUsagePayloadJson(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    return isPlainObject(value) ? value : null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeUsdNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRequestId(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeUsageCostBurnRate(rawSnapshot, requestedRequestId = null) {
  const normalizedRequestId = normalizeRequestId(
    rawSnapshot && Object.prototype.hasOwnProperty.call(rawSnapshot, 'request_id')
      ? rawSnapshot.request_id
      : requestedRequestId
  );
  return {
    usd_15m: normalizeUsdNumber(rawSnapshot && rawSnapshot.usd_15m),
    usd_60m: normalizeUsdNumber(rawSnapshot && rawSnapshot.usd_60m),
    usd_24h: normalizeUsdNumber(rawSnapshot && rawSnapshot.usd_24h),
    request_id: normalizedRequestId,
    request_total_usd: normalizeUsdNumber(rawSnapshot && rawSnapshot.request_total_usd),
  };
}

function getUsageCostBurnRateSnapshot(requestId = null) {
  if (typeof db.getUsageCostBurnRate !== 'function') {
    return normalizeUsageCostBurnRate(USAGE_COST_BURN_RATE_DEFAULTS, requestId);
  }
  try {
    return normalizeUsageCostBurnRate(db.getUsageCostBurnRate(requestId), requestId);
  } catch {
    return normalizeUsageCostBurnRate(USAGE_COST_BURN_RATE_DEFAULTS, requestId);
  }
}

function normalizeBudgetState(value) {
  return parseJsonObject(value);
}

function buildBudgetSnapshotFromConfig() {
  const rawState = db.getConfig(ROUTING_BUDGET_STATE_KEY);
  const parsedConfigState = parseBudgetStateConfig(rawState);
  const mergedState = parseBudgetStateConfig(rawState, db.getConfig);
  const parsed = isPlainObject(mergedState.parsed) ? mergedState.parsed : null;
  if (!parsed) return null;
  const source = isPlainObject(parsedConfigState.parsed)
    ? 'config:routing_budget_state'
    : 'config:budget_thresholds';
  return {
    state: {
      source,
      parsed,
      remaining: mergedState.remaining,
      threshold: mergedState.threshold,
    },
    source,
  };
}

function parseTaskAssignedTelemetry(detailsRaw) {
  const details = parseJsonObject(detailsRaw);
  if (!details) return null;

  const taskId = Number.parseInt(details.task_id, 10);
  if (!Number.isInteger(taskId) || taskId <= 0) return null;

  const budgetState = normalizeBudgetState(details.budget_state);
  return {
    task_id: taskId,
    routing_class: normalizeRoutingField(details.routing_class),
    routed_model: normalizeRoutingField(details.model ?? details.routed_model),
    model_source: normalizeRoutingField(details.model_source),
    reasoning_effort: normalizeRoutingField(details.reasoning_effort),
    budget_state: budgetState,
    budget_source: normalizeRoutingField(details.budget_source) || normalizeRoutingField(budgetState && budgetState.source),
  };
}

function buildTaskTelemetryMap(tasks) {
  const taskIds = new Set();
  for (const task of tasks) {
    const taskId = Number.parseInt(task && task.id, 10);
    if (Number.isInteger(taskId) && taskId > 0) taskIds.add(taskId);
  }

  const byTaskId = new Map();
  let latestBudget = null;
  const taskAssignedLogs = db.getDb().prepare(
    "SELECT details FROM activity_log WHERE actor = 'allocator' AND action = 'task_assigned' ORDER BY id DESC"
  );
  for (const row of taskAssignedLogs.iterate()) {
    const telemetry = parseTaskAssignedTelemetry(row.details);
    if (!telemetry) continue;

    if (!latestBudget && (telemetry.budget_state || telemetry.budget_source)) {
      latestBudget = {
        state: telemetry.budget_state || null,
        source: telemetry.budget_source || 'activity_log:allocator.task_assigned',
      };
    }

    if (!taskIds.has(telemetry.task_id) || byTaskId.has(telemetry.task_id)) {
      if (taskIds.size > 0 && byTaskId.size === taskIds.size && latestBudget) break;
      continue;
    }
    byTaskId.set(telemetry.task_id, telemetry);

    if (taskIds.size > 0 && byTaskId.size === taskIds.size && latestBudget) break;
  }

  return { byTaskId, latestBudget };
}

function pickRoutingField(taskValue, fallbackValue) {
  return normalizeRoutingField(taskValue) || normalizeRoutingField(fallbackValue);
}

function hydrateTasks(tasks, telemetry = null) {
  const taskTelemetry = telemetry || buildTaskTelemetryMap(tasks);
  const hydratedTasks = tasks.map((task) => {
    const taskId = Number.parseInt(task && task.id, 10);
    const fallback = taskTelemetry.byTaskId.get(taskId) || null;
    const usagePayload = parseUsagePayloadJson(task && task.usage_payload_json);
    const usageObject = isPlainObject(task && task.usage) ? task.usage : usagePayload;
    return {
      ...task,
      routing_class: pickRoutingField(task.routing_class, fallback && fallback.routing_class),
      routed_model: pickRoutingField(task.routed_model, fallback && fallback.routed_model),
      model_source: pickRoutingField(task.model_source, fallback && fallback.model_source),
      reasoning_effort: pickRoutingField(task.reasoning_effort, fallback && fallback.reasoning_effort),
      ...(usageObject ? { usage: usageObject } : {}),
      ...(usagePayload ? { usage_payload: usagePayload, usagePayload } : {}),
    };
  });
  return { tasks: hydratedTasks, telemetry: taskTelemetry };
}

function listHydratedTasks(taskFilter = undefined, telemetry = null) {
  const tasks = db.listTasks(taskFilter);
  return hydrateTasks(tasks, telemetry);
}

function buildStatePayload({ includeLogs = false, includeLoops = false } = {}) {
  const requests = db.listRequests();
  const workers = db.getAllWorkers();
  const { tasks: hydratedTasks, telemetry } = listHydratedTasks();
  const usageCostBurnRate = getUsageCostBurnRateSnapshot();
  const usageCostRequestTotalsUsd = {};
  for (const request of requests) {
    const requestId = normalizeRequestId(request && request.id);
    if (!requestId) continue;
    const requestSnapshot = getUsageCostBurnRateSnapshot(requestId);
    usageCostRequestTotalsUsd[requestId] = requestSnapshot.request_total_usd;
  }

  const configBudget = buildBudgetSnapshotFromConfig();
  const routingBudgetState = configBudget
    ? configBudget.state
    : (telemetry.latestBudget && telemetry.latestBudget.state) || null;
  const routingBudgetSource = configBudget
    ? configBudget.source
    : (telemetry.latestBudget && telemetry.latestBudget.source) || 'none';

  const payload = {
    requests,
    workers,
    tasks: hydratedTasks,
    browser_offload_sessions: listBrowserSessionsPublic(),
    routing_budget_state: routingBudgetState,
    routing_budget_source: routingBudgetSource,
    usage_cost_burn_rate: usageCostBurnRate,
    usage_cost_request_totals_usd: usageCostRequestTotalsUsd,
    usage_cost_usd_15m: usageCostBurnRate.usd_15m,
    usage_cost_usd_60m: usageCostBurnRate.usd_60m,
    usage_cost_usd_24h: usageCostBurnRate.usd_24h,
    usage_cost_request_id: usageCostBurnRate.request_id,
    usage_cost_request_total_usd: usageCostBurnRate.request_total_usd,
  };
  if (includeLogs) payload.logs = db.getLog(20);
  if (includeLoops) payload.loops = db.listLoops();
  return payload;
}

function start(projectDir, port = 3100, scriptDir = null, handlers = {}) {
  const app = express();
  const namespace = process.env.MAC10_NAMESPACE || 'mac10';
  browserBridgeEnabled = handlers.browserBridgeEnabled !== false;
  browserEventHook = typeof handlers.onBrowserSessionEvent === 'function'
    ? handlers.onBrowserSessionEvent
    : null;
  browserSessions = new Map();
  browserSessionsByTaskId = new Map();
  browserSessionTimeouts = new Map();
  browserSessionCounter = 0;
  refreshBrowserBridgeConfig();
  server = http.createServer(app);
  wss = new WebSocket.Server({ server });
  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Handled by server.on('error') — suppress duplicate
    } else {
      console.error(`WebSocket server error: ${err.message}`);
    }
  });

  // Resolve scriptDir (mac10 repo root containing setup.sh)
  const resolvedScriptDir = scriptDir || path.join(__dirname, '..', '..');

  // Detect if running on Windows and need wsl.exe to reach WSL.
  // When Node.js is already running inside WSL, just use bash directly.
  const isWSL = process.platform === 'win32';

  // CORS -- allow cross-port requests from other mac10 GUI tabs
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Serve static files
  const guiDir = process.env.MAC10_GUI_DIR || path.join(__dirname, '..', '..', 'gui', 'public');
  app.use(express.static(guiDir));
  app.use(express.json());

  // API endpoints
  app.get('/api/status', (req, res) => {
    try {
      res.json(buildStatePayload({ includeLogs: true }));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/requests', (req, res) => {
    try {
      res.json(db.listRequests(req.query.status));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/requests/:id', (req, res) => {
    try {
      const request = db.getRequest(req.params.id);
      if (!request) return res.status(404).json({ error: 'Not found' });
      const { tasks: hydratedTasks } = listHydratedTasks({ request_id: req.params.id });
      res.json({ ...request, tasks: hydratedTasks });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/workers', (req, res) => {
    try {
      res.json(db.getAllWorkers());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/tasks', (req, res) => {
    try {
      const { tasks: hydratedTasks } = listHydratedTasks(req.query);
      res.json(hydratedTasks);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/log', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
      res.json(db.getLog(limit, req.query.actor));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/request', (req, res) => {
    try {
      const { description } = req.body;
      if (!description || typeof description !== 'string') {
        return res.status(400).json({ ok: false, error: 'description is required and must be a string' });
      }
      const id = db.createRequest(description);
      res.json({ ok: true, request_id: id });
      broadcast({ type: 'request_created', request_id: id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Setup endpoints ---

  app.get('/api/config', (req, res) => {
    try {
      const storedDir = db.getConfig('project_dir');
      const storedWorkers = db.getConfig('num_workers');
      const storedRepo = db.getConfig('github_repo');
      const setupDone = db.getConfig('setup_complete');
      res.json({
        projectDir: storedDir || projectDir || '',
        numWorkers: storedWorkers ? parseInt(storedWorkers) : 4,
        githubRepo: storedRepo || '',
        setupComplete: setupDone === '1',
        scriptDir: resolvedScriptDir,
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save config without running full setup
  app.post('/api/config', (req, res) => {
    try {
      const { projectDir: newDir, githubRepo, numWorkers } = req.body;
      if (newDir) {
        if (!SAFE_PATH_RE.test(newDir)) {
          return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
        }
        db.setConfig('project_dir', newDir);
      }
      if (githubRepo !== undefined) {
        if (githubRepo && !REPO_RE.test(githubRepo)) {
          return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format. Expected owner/repo.' });
        }
        db.setConfig('github_repo', githubRepo);
      }
      if (numWorkers !== undefined) {
        db.setConfig('num_workers', String(Math.min(Math.max(parseInt(numWorkers) || 4, 1), 8)));
      }
      // Auto-save as preset when both project dir and repo are set
      const dir = newDir || db.getConfig('project_dir');
      const repo = githubRepo !== undefined ? githubRepo : db.getConfig('github_repo');
      const workers = numWorkers !== undefined ? Math.min(Math.max(parseInt(numWorkers) || 4, 1), 8) : parseInt(db.getConfig('num_workers') || '4');
      if (dir && repo) {
        const presetName = repo || path.basename(dir);
        db.savePreset(presetName, dir, repo, workers);
      }
      db.log('gui', 'config_updated', { projectDir: newDir, githubRepo, numWorkers });
      res.json({ ok: true, message: 'Config saved. Relaunch masters to apply.' });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- Preset endpoints ---

  app.get('/api/presets', (req, res) => {
    try {
      res.json(db.listPresets());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/presets', (req, res) => {
    try {
      const { name, projectDir: dir, githubRepo, numWorkers } = req.body;
      if (!name || !dir) {
        return res.status(400).json({ ok: false, error: 'name and projectDir are required' });
      }
      if (!SAFE_PATH_RE.test(dir)) {
        return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
      }
      if (githubRepo && !REPO_RE.test(githubRepo)) {
        return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format' });
      }
      db.savePreset(name, dir, githubRepo || '', parseInt(numWorkers) || 4);
      db.log('gui', 'preset_saved', { name, projectDir: dir, githubRepo });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.delete('/api/presets/:id', (req, res) => {
    try {
      const id = parseStrictPositiveIntegerParam(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid preset id' });
      const deleted = db.deletePreset(id);
      if (!deleted) return res.status(404).json({ ok: false, error: 'Preset not found' });
      db.log('gui', 'preset_deleted', { id });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/setup', (req, res) => {
    const { projectDir: reqProjectDir, githubRepo, numWorkers } = req.body;
    if (!reqProjectDir) {
      return res.status(400).json({ ok: false, error: 'projectDir is required' });
    }
    if (!SAFE_PATH_RE.test(reqProjectDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }
    if (githubRepo && !REPO_RE.test(githubRepo)) {
      return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format. Expected owner/repo.' });
    }
    if (setupProcess) {
      return res.status(409).json({ ok: false, error: 'Setup is already running' });
    }

    const workers = Math.min(Math.max(parseInt(numWorkers) || 4, 1), 8);
    const setupScript = path.join(resolvedScriptDir, 'setup.sh');

    // Save config
    try {
      db.setConfig('project_dir', reqProjectDir);
      db.setConfig('num_workers', String(workers));
      db.setConfig('setup_complete', '0');
      if (githubRepo) {
        db.setConfig('github_repo', githubRepo);
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: 'Failed to save config: ' + e.message });
    }

    db.log('gui', 'setup_started', { projectDir: reqProjectDir, numWorkers: workers });
    broadcast({ type: 'setup_log', line: `Starting setup: ${setupScript} ${reqProjectDir} ${workers}` });

    // Spawn setup.sh
    const env = Object.assign({}, process.env, {
      MAC10_GUI_DIR: path.join(resolvedScriptDir, 'gui', 'public'),
    });

    if (isWSL) {
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
      setupProcess = spawn('wsl.exe', ['-d', distro, '--', 'bash', setupScript, reqProjectDir, String(workers)], {
        cwd: resolvedScriptDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      setupProcess = spawn('bash', [setupScript, reqProjectDir, String(workers)], {
        cwd: resolvedScriptDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    // Stream stdout
    let buffer = '';
    setupProcess.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        broadcast({ type: 'setup_log', line });
      }
    });

    // Stream stderr
    let errBuffer = '';
    setupProcess.stderr.on('data', (chunk) => {
      errBuffer += chunk.toString();
      const lines = errBuffer.split('\n');
      errBuffer = lines.pop();
      for (const line of lines) {
        broadcast({ type: 'setup_log', line: '[stderr] ' + line });
      }
    });

    setupProcess.on('close', (code) => {
      // Flush remaining buffers
      if (buffer) broadcast({ type: 'setup_log', line: buffer });
      if (errBuffer) broadcast({ type: 'setup_log', line: '[stderr] ' + errBuffer });

      if (code === 0) {
        try {
          db.setConfig('setup_complete', '1');
          // Auto-save as preset on successful setup
          const dir = db.getConfig('project_dir');
          const repo = db.getConfig('github_repo');
          const w = parseInt(db.getConfig('num_workers') || '4');
          if (dir && repo) {
            db.savePreset(repo || path.basename(dir), dir, repo, w);
          }
        } catch {}
      }
      db.log('gui', 'setup_finished', { code });
      broadcast({ type: 'setup_complete', code: code || 0 });
      setupProcess = null;
    });

    setupProcess.on('error', (err) => {
      broadcast({ type: 'setup_log', line: '[error] ' + err.message });
      broadcast({ type: 'setup_complete', code: 1 });
      db.log('gui', 'setup_error', { error: err.message });
      setupProcess = null;
    });

    res.json({ ok: true, message: 'Setup started' });
  });

  // --- Agent launch helper ---
  // Uses launch-agent.sh wrapper to avoid semicolons in WT command line
  // (Windows Terminal treats `;` as its own command separator)

  const launchScript = path.join(resolvedScriptDir, 'scripts', 'launch-agent.sh');

  function launchAgent(title, windowName, modelAlias, slashCmd, logTag, res) {
    const repoDir = db.getConfig('project_dir') || projectDir;
    if (!repoDir) {
      return res.status(400).json({ ok: false, error: 'No project directory configured' });
    }
    if (!SAFE_PATH_RE.test(repoDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }
    if (!fs.existsSync(repoDir)) {
      return res.status(400).json({ ok: false, error: 'Project directory does not exist' });
    }

    if (isWSL) {
      const user = process.env.USER || process.env.LOGNAME || 'owner';
      const wt = `/mnt/c/Users/${user}/AppData/Local/Microsoft/WindowsApps/wt.exe`;
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';

      const proc = spawn(wt, [
        '-w', '0', 'new-tab', '--title', title, '--',
        'wsl.exe', '-d', distro, '--',
        'bash', launchScript, repoDir, modelAlias, slashCmd
      ], {
        stdio: 'ignore',
        detached: true,
      });
      proc.unref();

      db.log('gui', logTag, { projectDir: repoDir });
      return res.json({ ok: true, message: `${title} terminal opened` });
    }

    // macOS / Linux: open in tmux
    const tmux = require('./tmux');
    try {
      tmux.createWindow(windowName, `bash "${launchScript}" "${repoDir}" ${modelAlias} ${slashCmd}`, repoDir);
      db.log('gui', logTag, { projectDir: repoDir, method: 'tmux' });
      return res.json({ ok: true, message: `${title} launched in tmux window "${windowName}"` });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // --- Architect (Master-2) launch endpoint ---

  app.post('/api/architect/launch', (req, res) => {
    launchAgent('Master-2 (Architect)', 'architect', 'deep', '/architect-loop', 'architect_launched', res);
  });

  // --- Master-1 (Interface) launch endpoint ---

  app.post('/api/master1/launch', (req, res) => {
    launchAgent('Master-1 (Interface)', 'master-1', 'fast', '/master-loop', 'master1_launched', res);
  });

  // --- Master-3 (Allocator) launch endpoint ---

  app.post('/api/master3/launch', (req, res) => {
    launchAgent('Master-3 (Allocator)', 'master-3', 'fast', '/allocate-loop', 'master3_launched', res);
  });

  // --- Git push endpoint ---

  app.post('/api/git/push', (req, res) => {
    const repoDir = db.getConfig('project_dir') || projectDir;
    const repo = db.getConfig('github_repo');
    if (!repoDir) {
      return res.status(400).json({ ok: false, error: 'No project directory configured' });
    }
    if (!SAFE_PATH_RE.test(repoDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }
    if (!repo) {
      return res.status(400).json({ ok: false, error: 'No GitHub repo configured. Set it in the Setup panel.' });
    }
    if (!REPO_RE.test(repo)) {
      return res.status(400).json({ ok: false, error: 'Invalid GitHub repo format. Expected owner/repo.' });
    }

    db.log('gui', 'git_push_started', { repo, projectDir: repoDir });

    // Ensure remote is set, then push
    // Uses env vars (MAC10_REPO, MAC10_REPO_DIR) to avoid shell interpolation
    const script = [
      'set -e',
      'CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")',
      'TARGET="https://github.com/${MAC10_REPO}.git"',
      'SSH_TARGET="git@github.com:${MAC10_REPO}.git"',
      'if [ "$CURRENT_REMOTE" != "$TARGET" ] && [ "$CURRENT_REMOTE" != "$SSH_TARGET" ]; then',
      '  if [ -z "$CURRENT_REMOTE" ]; then',
      '    git remote add origin "$TARGET"',
      '    echo "Added remote origin: $TARGET"',
      '  else',
      '    git remote set-url origin "$TARGET"',
      '    echo "Updated remote origin: $TARGET"',
      '  fi',
      'fi',
      'echo "Remote: $(git remote get-url origin)"',
      'echo "Branch: $(git branch --show-current)"',
      'echo ""',
      'git push -u origin "$(git branch --show-current)" 2>&1',
    ].join('\n');

    const pushEnv = { ...process.env, MAC10_REPO: repo, MAC10_REPO_DIR: repoDir };
    let pushProc;
    if (isWSL) {
      const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
      pushProc = spawn('wsl.exe', ['-d', distro, '--', 'bash', '-c', script], {
        cwd: repoDir,
        env: pushEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      pushProc = spawn('bash', ['-c', script], {
        cwd: repoDir,
        env: pushEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    }

    let buf = '';
    pushProc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        broadcast({ type: 'git_push_log', line });
      }
    });

    let errBuf = '';
    pushProc.stderr.on('data', (chunk) => {
      errBuf += chunk.toString();
      const lines = errBuf.split('\n');
      errBuf = lines.pop();
      for (const line of lines) {
        broadcast({ type: 'git_push_log', line });
      }
    });

    pushProc.on('close', (code) => {
      if (buf) broadcast({ type: 'git_push_log', line: buf });
      if (errBuf) broadcast({ type: 'git_push_log', line: errBuf });
      db.log('gui', 'git_push_finished', { code, repo });
      broadcast({ type: 'git_push_complete', code: code || 0 });
    });

    pushProc.on('error', (err) => {
      broadcast({ type: 'git_push_log', line: 'Error: ' + err.message });
      broadcast({ type: 'git_push_complete', code: 1 });
      db.log('gui', 'git_push_error', { error: err.message });
    });

    res.json({ ok: true, message: 'Push started' });
  });

  // --- Instance management endpoints ---

  app.get('/api/instances', (req, res) => {
    try {
      const instances = instanceRegistry.list();
      res.json(instances.map(inst => ({
        ...inst,
        isSelf: inst.port === port,
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/instances/launch', async (req, res) => {
    const { projectDir: reqDir, githubRepo, numWorkers } = req.body;
    if (!reqDir) {
      return res.status(400).json({ ok: false, error: 'projectDir is required' });
    }
    if (!SAFE_PATH_RE.test(reqDir)) {
      return res.status(400).json({ ok: false, error: 'Invalid project directory path' });
    }

    // Check for duplicate
    const existing = instanceRegistry.findByProject(reqDir, namespace);
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: `A coordinator is already running for this project in namespace "${namespace}"`,
        port: existing.port,
      });
    }

    try {
      // Validate project directory exists (do not create arbitrary directories)
      if (!fs.existsSync(reqDir)) {
        return res.status(400).json({ ok: false, error: 'Project directory does not exist' });
      }

      const newPort = await instanceRegistry.acquirePort(3100);
      const env = { ...process.env, MAC10_PORT: String(newPort), MAC10_NAMESPACE: namespace };

      const indexPath = path.join(__dirname, 'index.js');
      let child;
      if (isWSL) {
        const distro = process.env.WSL_DISTRO_NAME || 'Ubuntu';
        child = spawn('wsl.exe', ['-d', distro, '--', 'node', indexPath, reqDir], {
          env,
          stdio: 'ignore',
          detached: true,
        });
      } else {
        child = spawn('node', [indexPath, reqDir], {
          env,
          stdio: 'ignore',
          detached: true,
        });
      }
      child.unref();

      const childPid = child.pid;
      const readiness = await waitForCoordinatorReady(newPort, childPid);
      if (!readiness.ok) {
        cleanupFailedLaunch(childPid, newPort);
        return res.status(502).json({
          ok: false,
          stage: 'startup',
          port: newPort,
          error: 'Launched coordinator failed readiness verification',
          details: readiness.error,
        });
      }

      const seedConfig = await seedCoordinatorConfig(newPort, {
        projectDir: reqDir,
        githubRepo: githubRepo || '',
        numWorkers: parseInt(numWorkers) || 4,
      });
      if (!seedConfig.ok) {
        cleanupFailedLaunch(childPid, newPort);
        return res.status(502).json({
          ok: false,
          stage: 'config_seed',
          port: newPort,
          error: 'Launched coordinator failed config seeding',
          details: seedConfig.error,
          statusCode: seedConfig.statusCode,
        });
      }

      const name = path.basename(reqDir);
      db.log('gui', 'instance_launched', { projectDir: reqDir, port: newPort, githubRepo });
      res.json({ ok: true, port: newPort, name });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/instances/stop', (req, res) => {
    const { port: targetPort } = req.body;
    if (!targetPort || targetPort === port) {
      return res.status(400).json({ ok: false, error: 'Cannot stop self or missing port' });
    }
    try {
      const instances = instanceRegistry.list();
      const target = instances.find(i => i.port === targetPort);
      if (!target) {
        return res.status(404).json({ ok: false, error: 'Instance not found' });
      }
      if (!Number.isInteger(target.pid) || target.pid <= 0) {
        return res.status(400).json({ ok: false, error: 'Invalid PID for target instance' });
      }
      try {
        process.kill(target.pid, 'SIGTERM');
      } catch {}
      instanceRegistry.deregister(targetPort);
      db.log('gui', 'instance_stopped', { port: targetPort, pid: target.pid });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- Browser offload bridge endpoints ---

  app.post('/api/browser/launch', (req, res) => {
    if (!requireBrowserBridgeRoute(req, res)) return;
    refreshBrowserBridgeConfig();

    try {
      const taskId = Number.parseInt(req.body.task_id ?? req.body.taskId, 10);
      if (!Number.isInteger(taskId) || taskId <= 0) {
        return res.status(400).json({ ok: false, error: 'task_id must be a positive integer' });
      }
      const existingSession = getSessionByTaskId(taskId);
      if (existingSession && BROWSER_ACTIVE_STATUSES.has(existingSession.status)) {
        notifyBrowserEvent('launch_reused', existingSession, { reused: true });
        return res.json({
          ok: true,
          reused: true,
          session: buildBrowserSessionPublic(existingSession),
          bridge_credentials: {
            session_id: existingSession.id,
            bridge_token: existingSession.bridgeToken,
            launch_url: buildBrowserBridgeAccess(existingSession, true).launch_url,
            attach_endpoint: '/api/browser/attach',
          },
        });
      }

      const task = getTaskStrict(taskId);
      const payloadValue = Object.prototype.hasOwnProperty.call(req.body, 'payload')
        ? req.body.payload
        : req.body.browser_offload_payload;
      const payloadText = payloadValue === undefined
        ? null
        : (typeof payloadValue === 'string' ? payloadValue : safeJsonStringify(payloadValue));
      const timeoutMs = clampBrowserTimeoutMs(
        req.body.callback_timeout_ms ?? req.body.timeout_ms,
        browserSessionTimeoutMs
      );
      const now = nowIso();
      const sessionId = buildBrowserSessionId();
      const channel = String(req.body.channel || `browser:task-${taskId}:${sessionId}`).trim();

      try {
        applyTaskStatusTarget(taskId, 'launching', {
          browser_session_id: sessionId,
          browser_channel: channel,
          browser_offload_payload: payloadText,
          browser_offload_result: null,
          browser_offload_error: null,
        });
      } catch (error) {
        const message = summarizeBrowserError(error);
        recordTaskBrowserFailure(taskId, `Launch failed: ${message}`);
        return res.status(409).json({
          ok: false,
          stage: 'launch_transition',
          error: message,
        });
      }

      const session = {
        id: sessionId,
        taskId,
        requestId: task.request_id || null,
        channel,
        status: 'launching',
        createdAt: now,
        updatedAt: now,
        launchedAt: now,
        attachedAt: null,
        completedAt: null,
        lastCallbackAt: null,
        deadlineAt: new Date(Date.now() + timeoutMs).toISOString(),
        timeoutMs,
        lastError: null,
        result: null,
        progress: [],
        attachedOrigin: null,
        bridgeToken: buildBrowserToken(),
        callbackToken: buildBrowserToken(),
      };
      upsertBrowserSession(session);
      notifyBrowserEvent('launched', session, {
        bridge_credentials: {
          session_id: session.id,
          launch_url: buildBrowserBridgeAccess(session, true).launch_url,
          attach_endpoint: '/api/browser/attach',
        },
      });

      res.json({
        ok: true,
        session: buildBrowserSessionPublic(session),
        bridge_credentials: {
          session_id: session.id,
          bridge_token: session.bridgeToken,
          launch_url: buildBrowserBridgeAccess(session, true).launch_url,
          attach_endpoint: '/api/browser/attach',
          callback_timeout_ms: session.timeoutMs,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: summarizeBrowserError(e) });
    }
  });

  app.post('/api/browser/attach', (req, res) => {
    if (!requireBrowserBridgeRoute(req, res)) return;
    refreshBrowserBridgeConfig();
    const originCheck = requireBrowserOrigin(req, res);
    if (!originCheck.ok) return;

    try {
      const sessionId = normalizeBrowserSessionId(req.body.session_id ?? req.body.sessionId);
      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'session_id is required' });
      }
      const session = browserSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ ok: false, error: `Unknown browser session: ${sessionId}` });
      }
      if (BROWSER_TERMINAL_STATUSES.has(session.status)) {
        return res.status(409).json({
          ok: false,
          error: `Session is already terminal (${session.status})`,
          session: buildBrowserSessionPublic(session),
        });
      }

      const providedBridgeToken = String(
        req.body.bridge_token || req.headers['x-mac10-bridge-token'] || ''
      ).trim();
      if (!timingSafeTokenMatches(session.bridgeToken, providedBridgeToken)) {
        notifyBrowserEvent('attach_rejected', session, { reason: 'invalid_bridge_token' });
        return res.status(401).json({ ok: false, error: 'Invalid bridge token' });
      }

      const requestedTaskId = Number.parseInt(req.body.task_id ?? req.body.taskId, 10);
      if (Number.isInteger(requestedTaskId) && requestedTaskId > 0 && requestedTaskId !== session.taskId) {
        notifyBrowserEvent('attach_rejected', session, {
          reason: 'task_mismatch',
          provided_task_id: requestedTaskId,
        });
        return res.status(409).json({ ok: false, error: 'task_id does not match session task' });
      }

      try {
        applyTaskStatusTarget(session.taskId, 'attached', {
          browser_session_id: session.id,
          browser_channel: session.channel,
          browser_offload_error: null,
        });
        applyTaskStatusTarget(session.taskId, 'running');
        applyTaskStatusTarget(session.taskId, 'awaiting_callback');
      } catch (error) {
        failBrowserSession(
          session,
          `Attach transition failed: ${summarizeBrowserError(error)}`,
          { reason: 'attach_failed', updateTask: true }
        );
        return res.status(409).json({
          ok: false,
          stage: 'attach_transition',
          error: summarizeBrowserError(error),
        });
      }

      const now = nowIso();
      session.status = 'awaiting_callback';
      session.attachedAt = now;
      session.updatedAt = now;
      session.deadlineAt = new Date(Date.now() + session.timeoutMs).toISOString();
      session.attachedOrigin = originCheck.origin;
      session.callbackToken = buildBrowserToken();
      upsertBrowserSession(session);
      notifyBrowserEvent('attached', session, { origin: originCheck.origin });

      res.json({
        ok: true,
        session: buildBrowserSessionPublic(session),
        callback_credentials: {
          session_id: session.id,
          callback_token: session.callbackToken,
          callback_endpoint: `/api/browser/callback/${encodeURIComponent(session.id)}`,
          authorization: `Bearer ${session.callbackToken}`,
          callback_timeout_ms: session.timeoutMs,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: summarizeBrowserError(e) });
    }
  });

  app.get('/api/browser/status', (req, res) => {
    if (!requireBrowserBridgeRoute(req, res)) return;
    refreshBrowserBridgeConfig();
    try {
      const session = resolveSessionForStatus({
        sessionId: req.query.session_id || req.query.sessionId,
        taskId: req.query.task_id || req.query.taskId,
      });
      const parsedTaskId = Number.parseInt(req.query.task_id ?? req.query.taskId, 10);

      if (!session) {
        if (Number.isInteger(parsedTaskId) && parsedTaskId > 0) {
          const task = db.getTask(parsedTaskId);
          if (!task) {
            return res.status(404).json({ ok: false, error: `Task ${parsedTaskId} not found` });
          }
          return res.json({
            ok: true,
            session: null,
            task_id: parsedTaskId,
            browser_offload_status: normalizeBrowserOffloadStatus(task.browser_offload_status),
            browser_session_id: task.browser_session_id || null,
            browser_channel: task.browser_channel || null,
            browser_offload_error: task.browser_offload_error || null,
          });
        }
        return res.status(404).json({ ok: false, error: 'Browser session not found' });
      }

      const task = db.getTask(session.taskId);
      res.json({
        ok: true,
        session: buildBrowserSessionPublic(session),
        task: task || null,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: summarizeBrowserError(e) });
    }
  });

  app.get('/api/browser/sessions/:sessionId', (req, res) => {
    if (!requireBrowserBridgeRoute(req, res)) return;
    const sessionId = normalizeBrowserSessionId(req.params.sessionId);
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'Invalid session id' });
    }
    const session = browserSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Browser session not found' });
    }
    const task = db.getTask(session.taskId);
    return res.json({
      ok: true,
      session: buildBrowserSessionPublic(session),
      task: task || null,
    });
  });

  app.post('/api/browser/callback/:sessionId', (req, res) => {
    if (!requireBrowserBridgeRoute(req, res)) return;
    refreshBrowserBridgeConfig();
    const originCheck = requireBrowserOrigin(req, res);
    if (!originCheck.ok) return;

    try {
      const sessionId = normalizeBrowserSessionId(req.params.sessionId);
      if (!sessionId) {
        return res.status(400).json({ ok: false, error: 'Invalid session id' });
      }
      const session = browserSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ ok: false, error: 'Browser session not found' });
      }
      const tokenFromRequest = readBearerToken(req) || String(req.body.callback_token || '').trim();
      if (!timingSafeTokenMatches(session.callbackToken, tokenFromRequest)) {
        notifyBrowserEvent('callback_rejected', session, { reason: 'invalid_callback_token' });
        return res.status(401).json({ ok: false, error: 'Invalid callback token' });
      }
      if (session.attachedOrigin && originCheck.origin && session.attachedOrigin !== originCheck.origin) {
        notifyBrowserEvent('callback_rejected', session, {
          reason: 'origin_mismatch',
          expected_origin: session.attachedOrigin,
          origin: originCheck.origin,
        });
        return res.status(403).json({
          ok: false,
          error: 'Callback origin does not match attached origin',
        });
      }
      if (BROWSER_TERMINAL_STATUSES.has(session.status)) {
        notifyBrowserEvent('callback_ignored', session, { reason: 'terminal_session' });
        return res.status(409).json({
          ok: false,
          error: `Session is already terminal (${session.status})`,
          session: buildBrowserSessionPublic(session),
        });
      }
      const callbackTaskId = Number.parseInt(req.body.task_id ?? req.body.taskId, 10);
      if (Number.isInteger(callbackTaskId) && callbackTaskId > 0 && callbackTaskId !== session.taskId) {
        notifyBrowserEvent('callback_rejected', session, {
          reason: 'task_mismatch',
          provided_task_id: callbackTaskId,
        });
        return res.status(409).json({ ok: false, error: 'task_id does not match session task' });
      }

      const event = String(req.body.event || req.body.status || '').trim().toLowerCase();
      if (!event) {
        return res.status(400).json({ ok: false, error: 'event is required' });
      }

      const now = nowIso();
      const updateDeadline = () => {
        session.updatedAt = now;
        session.lastCallbackAt = now;
        session.deadlineAt = new Date(Date.now() + session.timeoutMs).toISOString();
      };

      if (event === 'progress' || event === 'partial' || event === 'heartbeat') {
        try {
          applyTaskStatusTarget(session.taskId, 'awaiting_callback', {
            browser_session_id: session.id,
            browser_channel: session.channel,
          });
        } catch (error) {
          failBrowserSession(
            session,
            `Progress callback transition failed: ${summarizeBrowserError(error)}`,
            { reason: 'callback_failed', updateTask: true }
          );
          return res.status(409).json({ ok: false, error: summarizeBrowserError(error) });
        }

        updateDeadline();
        session.status = 'awaiting_callback';
        const progressPayload = Object.prototype.hasOwnProperty.call(req.body, 'progress')
          ? req.body.progress
          : (Object.prototype.hasOwnProperty.call(req.body, 'message') ? req.body.message : req.body.data);
        const progressEntry = {
          at: now,
          event,
          payload: progressPayload === undefined ? null : progressPayload,
        };
        session.progress.push(progressEntry);
        if (session.progress.length > 100) session.progress.shift();
        upsertBrowserSession(session);
        notifyBrowserEvent('progress', session, { progress: progressEntry });
        return res.json({
          ok: true,
          status: session.status,
          session: buildBrowserSessionPublic(session),
        });
      }

      if (event === 'completed' || event === 'complete' || event === 'result') {
        const resultPayload = Object.prototype.hasOwnProperty.call(req.body, 'result')
          ? req.body.result
          : (Object.prototype.hasOwnProperty.call(req.body, 'data') ? req.body.data : null);
        try {
          applyTaskStatusTarget(session.taskId, 'completed', {
            browser_session_id: session.id,
            browser_channel: session.channel,
            browser_offload_result: safeJsonStringify(resultPayload),
            browser_offload_error: null,
          });
        } catch (error) {
          failBrowserSession(
            session,
            `Completion callback transition failed: ${summarizeBrowserError(error)}`,
            { reason: 'callback_failed', updateTask: true }
          );
          return res.status(409).json({ ok: false, error: summarizeBrowserError(error) });
        }
        session.status = 'completed';
        session.result = resultPayload === undefined ? null : resultPayload;
        session.lastError = null;
        session.updatedAt = now;
        session.lastCallbackAt = now;
        session.completedAt = now;
        session.deadlineAt = now;
        upsertBrowserSession(session);
        terminateBrowserSession(session);
        notifyBrowserEvent('completed', session, { result: session.result });
        return res.json({
          ok: true,
          status: session.status,
          session: buildBrowserSessionPublic(session),
        });
      }

      if (event === 'failed' || event === 'error') {
        const errorMessage = String(req.body.error || req.body.message || 'Browser callback reported failure').trim();
        session.lastCallbackAt = now;
        failBrowserSession(session, errorMessage || 'Browser callback reported failure', {
          reason: 'callback_failed',
          updateTask: true,
        });
        return res.json({
          ok: true,
          status: 'failed',
          session: buildBrowserSessionPublic(session),
        });
      }

      notifyBrowserEvent('callback_rejected', session, { reason: 'unsupported_event', event });
      return res.status(400).json({
        ok: false,
        error: `Unsupported callback event: ${event}`,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: summarizeBrowserError(e) });
    }
  });

  // --- Changes endpoints ---

  app.get('/api/changes', (req, res) => {
    try {
      const filters = {};
      if (req.query.domain) filters.domain = req.query.domain;
      if (req.query.status) filters.status = req.query.status;
      res.json(db.listChanges(filters));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/changes', (req, res) => {
    try {
      const { description, domain, file_path, function_name, tooltip, status } = req.body;
      if (!description) {
        return res.status(400).json({ ok: false, error: 'description is required' });
      }
      const id = db.createChange({ description, domain, file_path, function_name, tooltip, status });
      const change = db.getChange(id);
      db.log('gui', 'change_created', { change_id: id, description });
      broadcast({ type: 'change_created', change });
      res.json({ ok: true, change_id: id, change });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.patch('/api/changes/:id', (req, res) => {
    try {
      const id = parseStrictPositiveIntegerParam(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'Invalid change id' });
      const existing = db.getChange(id);
      if (!existing) return res.status(404).json({ ok: false, error: 'Change not found' });
      const allowed = ['enabled', 'status', 'description', 'tooltip'];
      const fields = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) fields[k] = req.body[k];
      }
      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ ok: false, error: 'No valid fields to update' });
      }
      db.updateChange(id, fields);
      const updated = db.getChange(id);
      broadcast({ type: 'change_updated', change: updated });
      res.json({ ok: true, change: updated });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // --- Loop endpoints ---

  app.get('/api/loops', (req, res) => {
    try {
      const status = req.query.status || undefined;
      res.json(db.listLoops(status));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/loops/:id', (req, res) => {
    try {
      const loop = db.getLoop(parseInt(req.params.id));
      if (!loop) return res.status(404).json({ error: 'Loop not found' });
      res.json(loop);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/loops', (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ ok: false, error: 'prompt is required and must be a string' });
      }
      const id = db.createLoop(prompt);
      if (handlers.onLoopCreated) handlers.onLoopCreated(id, prompt);
      broadcast({ type: 'loop_created', loop_id: id });
      res.json({ ok: true, loop_id: id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/api/loops/:id/stop', (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const loop = db.getLoop(id);
      if (!loop) return res.status(404).json({ ok: false, error: 'Loop not found' });
      db.stopLoop(id);
      broadcast({ type: 'loop_stopped', loop_id: id });
      res.json({ ok: true, loop_id: id });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // WebSocket for live updates
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {}); // prevent unhandled error crashes

    // Send initial state
    try {
      ws.send(JSON.stringify({
        type: 'init',
        data: buildStatePayload({ includeLoops: true }),
      }));
    } catch {}
  });

  // Periodic broadcast of state
  broadcastIntervalId = setInterval(() => {
    broadcast({
      type: 'state',
      data: buildStatePayload({ includeLoops: true }),
    });
  }, 2000);

  // Ping/pong to detect and terminate stale WebSocket connections
  pingIntervalId = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) { ws.terminate(); return; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 30000);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`WARNING: Port ${port} already in use — web dashboard not started. Coordinator continues without GUI.`);
      db.log('coordinator', 'web_server_port_conflict', { port, error: err.message });
    } else {
      console.error(`Web server error: ${err.message}`);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    db.log('coordinator', 'web_server_started', { port, host: '127.0.0.1' });
  });

  return server;
}

function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  });
}

function stop() {
  if (broadcastIntervalId) { clearInterval(broadcastIntervalId); broadcastIntervalId = null; }
  if (pingIntervalId) { clearInterval(pingIntervalId); pingIntervalId = null; }
  for (const timeout of browserSessionTimeouts.values()) {
    clearTimeout(timeout);
  }
  browserSessionTimeouts.clear();
  browserSessions.clear();
  browserSessionsByTaskId.clear();
  browserBridgeEnabled = true;
  browserEventHook = null;
  if (setupProcess) {
    try { setupProcess.kill(); } catch {}
    setupProcess = null;
  }
  if (wss) { wss.close(); wss = null; }
  if (server) { server.close(); server = null; }
}

module.exports = { start, stop, broadcast };
