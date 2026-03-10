'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('./db');
let modelRouter = null;
try {
  modelRouter = require('./model-router');
} catch (err) {
  if (err && err.code !== 'MODULE_NOT_FOUND') throw err;
}

function getConfigValue(getConfig, key, fallback) {
  if (typeof getConfig !== 'function') return fallback;
  const value = getConfig(key);
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  return trimmed === '' ? fallback : trimmed;
}

function resolveFallbackRoutingClass(task) {
  const tier = Number(task && task.tier) || 0;
  const priority = String(task && task.priority || '').toLowerCase();
  const subject = String(task && task.subject || '').toLowerCase();
  const description = String(task && task.description || '').toLowerCase();
  if (tier >= 3) return 'high';
  if (priority === 'urgent' || priority === 'high') return 'high';
  if (subject.includes('merge') || subject.includes('conflict') || description.includes('refactor')) return 'mid';
  return 'spark';
}

function fallbackModelRouter() {
  const fallbackStateSource = 'coordinator-fallback-model-router';
  return {
    getBudgetState(getConfig) {
      const rawState = parseBudgetStateConfig(typeof getConfig === 'function' ? getConfig(ROUTING_BUDGET_STATE_KEY) : null);
      if (!rawState.parsed) return null;
      return {
        source: fallbackStateSource,
        parsed: rawState.parsed,
        remaining: rawState.remaining,
        threshold: rawState.threshold,
      };
    },
    routeTask(task = {}, opts = {}) {
      const getConfig = opts.getConfig;
      const routingClass = resolveFallbackRoutingClass(task);
      const defaultModel = routingClass === 'spark'
        ? getConfigValue(getConfig, 'model_spark', 'gpt-5.3-codex-spark')
        : getConfigValue(getConfig, 'model_flagship', 'gpt-5.3-codex');
      const configuredModel = getConfigValue(getConfig, `model_${routingClass}`, defaultModel);
      const budget = this.getBudgetState(getConfig);
      const routingReason = 'Fell back to CLI routing shim (model-router unavailable)';
      return {
        routing_class: routingClass,
        model: configuredModel,
        model_source: configuredModel === defaultModel ? 'config-fallback' : 'fallback-default',
        reasoning_effort: routingClass === 'high' ? 'high' : 'low',
        reason: routingReason,
        budget_state: budget || null,
        budget_source: budget && budget.source ? budget.source : 'none',
        routing_precedence: [fallbackStateSource],
      };
    },
  };
}

if (!modelRouter) {
  modelRouter = fallbackModelRouter();
}

let server = null;
let tcpServer = null;
let _projectDir = null; // Set on start()
const NAMESPACE = process.env.MAC10_NAMESPACE || 'mac10';
const WORKER_LIMIT_MIN = 1;
const WORKER_LIMIT_MAX = 8;
const DEFAULT_WORKERS = 4;
const LEGACY_MAX_WORKERS_DEFAULT = 8;
const BRANCH_RE = /^[a-zA-Z0-9._\/-]+$/;
const PR_URL_RE = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/pull\/\d+$/;
const PR_NUMBER_RE = /^#?(\d+)$/;
const WORKER_BRANCH_RE = /^agent-\d+$/;
const ROUTING_BUDGET_STATE_KEY = 'routing_budget_state';
const ROUTING_BUDGET_REMAINING_KEY = 'routing_budget_flagship_remaining';
const ROUTING_BUDGET_THRESHOLD_KEY = 'routing_budget_flagship_threshold';
const LEGACY_BUDGET_REMAINING_KEY = 'flagship_budget_remaining';
const LEGACY_BUDGET_THRESHOLD_KEY = 'flagship_budget_threshold';

function namespacedFile(defaultName, namespacedName) {
  return NAMESPACE === 'mac10' ? defaultName : namespacedName;
}

function hintFromRoutingClass(routingClass) {
  if (routingClass === 'xhigh' || routingClass === 'high') return 'complex';
  if (routingClass === 'mid') return 'moderate';
  return 'simple';
}

// Write a request entry to handoff.json so the architect (which reads that file) can triage it.
function bridgeToHandoff(requestId, description, type = 'bug-fix') {
  if (!_projectDir) return;
  const handoffPath = path.join(
    _projectDir,
    '.claude',
    'state',
    namespacedFile('handoff.json', `${NAMESPACE}.handoff.json`)
  );
  const signalPath = path.join(
    _projectDir,
    '.claude',
    'signals',
    namespacedFile('.handoff-signal', `.${NAMESPACE}.handoff-signal`)
  );
  try {
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.mkdirSync(path.dirname(signalPath), { recursive: true });
    let arr = [];
    try { arr = JSON.parse(fs.readFileSync(handoffPath, 'utf8')); } catch {}
    if (!Array.isArray(arr)) arr = [];
    // Skip if already present
    if (arr.some(e => e.request_id === requestId)) return;
    const route = modelRouter.routeTask({
      subject: description,
      description,
      tier: 2,
      priority: type === 'fix' ? 'high' : 'normal',
    }, { getConfig: db.getConfig });
    arr.push({
      request_id: requestId,
      timestamp: new Date().toISOString(),
      type,
      description,
      complexity_hint: hintFromRoutingClass(route.routing_class),
      routing_class: route.routing_class,
      routing_model: route.model,
      routing_model_source: route.model_source || null,
      routing_reasoning_effort: route.reasoning_effort,
      routing_reason: route.reason,
      routing_precedence: route.routing_precedence || [],
      budget_state: route.budget_state || null,
      budget_source: route.budget_source || 'none',
      routing_updated_at: new Date().toISOString(),
      status: 'pending_decomposition',
    });
    fs.writeFileSync(handoffPath, JSON.stringify(arr, null, 2));
    // Touch signal file to wake architect (signal-wait.sh approach)
    fs.closeSync(fs.openSync(signalPath, 'a'));
    fs.utimesSync(signalPath, new Date(), new Date());
    // Also send to architect inbox (mac10 inbox architect --block approach)
    try { db.sendMail('architect', 'request_queued', { request_id: requestId }); } catch {}
  } catch (e) {
    // Non-fatal — log but don't crash coordinator
    console.error('[coordinator] handoff bridge error:', e.message);
  }
}

const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB

const COMMAND_SCHEMAS = {
  'request':           { required: ['description'], types: { description: 'string' } },
  'fix':               { required: ['description'], types: { description: 'string' } },
  'status':            { required: [], types: {} },
  'clarify':           { required: ['request_id', 'message'], types: { request_id: 'string', message: 'string' } },
  'log':               { required: [], types: { limit: 'number', actor: 'string' } },
  'request-history':   { required: ['request_id'], types: { request_id: 'string', limit: 'number' } },
  'triage':            { required: ['request_id', 'tier'], types: { request_id: 'string', tier: 'number', reasoning: 'string' } },
  'create-task':       {
    required: ['request_id', 'subject', 'description'],
    types: { request_id: 'string', subject: 'string', description: 'string', domain: 'string', priority: 'string', tier: 'number' },
    allowed: ['request_id', 'subject', 'description', 'domain', 'files', 'priority', 'tier', 'depends_on', 'validation'],
  },
  'tier1-complete':    { required: ['request_id', 'result'], types: { request_id: 'string', result: 'string' } },
  'ask-clarification': { required: ['request_id', 'question'], types: { request_id: 'string', question: 'string' } },
  'my-task':           { required: ['worker_id'], types: { worker_id: 'string' } },
  'start-task':        { required: ['worker_id', 'task_id'], types: { worker_id: 'string' } },
  'heartbeat':         { required: ['worker_id'], types: { worker_id: 'string' } },
  'complete-task':     { required: ['worker_id', 'task_id'], types: { worker_id: 'string' } },
  'fail-task':         { required: ['worker_id', 'task_id', 'error'], types: { worker_id: 'string', error: 'string' } },
  'distill':           { required: ['worker_id'], types: { worker_id: 'string' } },
  'inbox':             { required: ['recipient'], types: { recipient: 'string' } },
  'inbox-block':       { required: ['recipient'], types: { recipient: 'string', timeout: 'number', peek: 'boolean' } },
  'ready-tasks':       { required: [], types: {} },
  'assign-task':       { required: ['task_id', 'worker_id'], types: { task_id: 'number', worker_id: 'number' } },
  'claim-worker':      { required: ['worker_id', 'claimer'], types: { worker_id: 'number', claimer: 'string' } },
  'release-worker':    { required: ['worker_id'], types: { worker_id: 'number' } },
  'worker-status':     { required: [], types: {} },
  'check-completion':  { required: ['request_id'], types: { request_id: 'string' } },
  'register-worker':   { required: ['worker_id'], types: { worker_id: 'string', worktree_path: 'string', branch: 'string' } },
  'repair':            { required: [], types: {} },
  'ping':              { required: [], types: {} },
  'add-worker':        { required: [], types: {} },
  'merge-status':      { required: [], types: { request_id: 'string' } },
  'reset-worker':      { required: ['worker_id'], types: { worker_id: 'string' } },
  'check-overlaps':    { required: ['request_id'], types: { request_id: 'string' } },
  'log-change':        {
    required: ['description'],
    types: { description: 'string', domain: 'string', file_path: 'string', function_name: 'string', tooltip: 'string', status: 'string' },
    allowed: ['description', 'domain', 'file_path', 'function_name', 'tooltip', 'status'],
  },
  'list-changes':      { required: [], types: { domain: 'string', status: 'string' } },
  'update-change':     { required: ['id'], types: { id: 'number' } },
  'integrate':         { required: ['request_id'], types: { request_id: 'string', retry_terminal: 'boolean', force_retry: 'boolean' } },
  'loop':              { required: ['prompt'], types: { prompt: 'string' } },
  'stop-loop':         { required: ['loop_id'], types: { loop_id: 'number' } },
  'loop-status':       { required: [], types: {} },
  'loop-checkpoint':   { required: ['loop_id', 'summary'], types: { loop_id: 'number', summary: 'string' } },
  'loop-heartbeat':    { required: ['loop_id'], types: { loop_id: 'number' } },
  'set-config':        { required: ['key', 'value'], types: { key: 'string', value: 'string' } },
  'loop-prompt':       { required: ['loop_id'], types: { loop_id: 'number' } },
  'loop-request':      { required: ['loop_id', 'description'], types: { loop_id: 'number', description: 'string' } },
  'loop-requests':     { required: ['loop_id'], types: { loop_id: 'number' } },
};

function parseBudgetNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBudgetStateConfig(raw) {
  if (raw === undefined || raw === null) {
    return { parsed: null, remaining: null, threshold: null };
  }
  const trimmed = String(raw).trim();
  if (!trimmed) {
    return { parsed: null, remaining: null, threshold: null };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') {
      return { parsed: null, remaining: null, threshold: null };
    }
    const flagship = parsed.flagship && typeof parsed.flagship === 'object' ? parsed.flagship : parsed;
    return {
      parsed,
      remaining: parseBudgetNumber(flagship.remaining),
      threshold: parseBudgetNumber(flagship.threshold),
    };
  } catch {
    return { parsed: null, remaining: null, threshold: null };
  }
}

function mergeBudgetState(raw, overrides = {}) {
  const current = parseBudgetStateConfig(raw).parsed;
  const state = current && typeof current === 'object' ? { ...current } : {};
  const flagship = state.flagship && typeof state.flagship === 'object' ? { ...state.flagship } : {};
  for (const [field, incoming] of Object.entries(overrides)) {
    if (incoming === undefined || incoming === null) continue;
    flagship[field] = incoming;
  }
  state.flagship = flagship;
  return state;
}

/** Parse a files field into an array. Handles arrays, JSON strings, and comma-separated strings. */
function parseFilesField(files) {
  if (files === null || files === undefined) return null;
  if (Array.isArray(files)) {
    return typeof db.normalizeTaskFiles === 'function'
      ? db.normalizeTaskFiles(files)
      : fallbackNormalizeTaskFiles(files);
  }
  if (typeof files === 'string') {
    const trimmed = files.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return typeof db.normalizeTaskFiles === 'function'
          ? db.normalizeTaskFiles(parsed)
          : fallbackNormalizeTaskFiles(parsed);
      }
    } catch {}
    const splitFiles = trimmed.split(',');
    return typeof db.normalizeTaskFiles === 'function'
      ? db.normalizeTaskFiles(splitFiles)
      : fallbackNormalizeTaskFiles(splitFiles);
  }
  return null;
}

function fallbackNormalizeTaskFiles(files) {
  if (!Array.isArray(files)) return [];
  const seen = new Set();
  const out = [];
  for (const file of files) {
    const normalized = String(file || '').trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function getSafeRequestHistory(request_id, limit) {
  if (typeof db.getRequestHistory === 'function') {
    return db.getRequestHistory(request_id, limit);
  }
  if (!db.getLog) return [];
  return db.getLog(2000).filter((entry) => entry && entry.request_id === request_id).slice(0, limit);
}

function getSafeLatestCompletedTaskCursor(request_id) {
  if (typeof db.getRequestLatestCompletedTaskCursor !== 'function') return null;
  return db.getRequestLatestCompletedTaskCursor(request_id);
}

function hasSafeCompletedTaskProgressSince(request_id, cursor) {
  if (typeof db.hasRequestCompletedTaskProgressSince !== 'function') return false;
  return db.hasRequestCompletedTaskProgressSince(request_id, cursor.before, cursor.after);
}

function backfillSupersededLoopRequestsSafe() {
  if (typeof db.backfillSupersededLoopRequests !== 'function') return { inspected: 0, repaired: 0 };
  return db.backfillSupersededLoopRequests();
}

const SAFE_TASK_DOMAIN_RE = /^[A-Za-z0-9_-]+$/;

function normalizeTaskDomain(domain) {
  if (domain === undefined || domain === null) return null;
  if (typeof domain !== 'string') {
    throw new Error('Invalid domain: must be a string');
  }

  const trimmed = domain.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    throw new Error('Invalid domain: path separators and traversal tokens are not allowed');
  }
  if (!SAFE_TASK_DOMAIN_RE.test(trimmed)) {
    throw new Error('Invalid domain: only letters, numbers, "-" and "_" are allowed');
  }
  return trimmed;
}

/**
 * Parse reset-worker ownership context from args.
 * Backward compatible formats:
 * - worker_id="7"
 * - worker_id="7|123|2026-03-09T01:23:45.678Z"
 */
function parseResetOwnership(args) {
  const rawWorker = String(args.worker_id || '');
  const [rawWorkerId, rawTaskId = '', rawAssignmentToken = ''] = rawWorker.split('|', 3);
  const worker_id = rawWorkerId.trim();

  const candidateTaskId = args.expected_task_id !== undefined
    ? args.expected_task_id
    : rawTaskId.trim();
  const parsedTaskId = parseInt(candidateTaskId, 10);
  const expected_task_id = Number.isInteger(parsedTaskId) ? parsedTaskId : null;

  const expected_assignment_token = (typeof args.assignment_token === 'string' && args.assignment_token.trim())
    ? args.assignment_token.trim()
    : (rawAssignmentToken.trim() || null);

  return { worker_id, expected_task_id, expected_assignment_token };
}

/** Parse depends_on into an array of task ids. Accepts arrays or JSON-array strings. */
function parseDependsOnField(dependsOn) {
  if (dependsOn === null || dependsOn === undefined) return null;
  if (Array.isArray(dependsOn)) return dependsOn;
  if (typeof dependsOn === 'string') {
    try {
      const parsed = JSON.parse(dependsOn);
      if (!Array.isArray(parsed)) {
        throw new Error('depends_on JSON must be an array');
      }
      return parsed;
    } catch (e) {
      throw new Error(`Invalid depends_on: ${e.message}`);
    }
  }
  throw new Error('Invalid depends_on: expected an array of task ids');
}

function normalizeOverlapIdsField(overlapWith, selfId = null) {
  if (!overlapWith) return [];
  let ids = overlapWith;
  if (typeof ids === 'string') {
    try { ids = JSON.parse(ids); } catch { return []; }
  }
  if (!Array.isArray(ids)) return [];
  const parsedSelfId = Number(selfId);
  const hasSelfId = Number.isInteger(parsedSelfId) && parsedSelfId > 0;

  const normalized = [];
  const seen = new Set();
  for (const rawId of ids) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (hasSelfId && id === parsedSelfId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

function sanitizeBranchName(rawBranch) {
  if (typeof rawBranch !== 'string') return '';
  const trimmed = rawBranch.trim();
  if (!trimmed || !BRANCH_RE.test(trimmed)) return '';
  return trimmed;
}

function parseGitHubRepoFromRemoteUrl(remoteUrl) {
  const trimmed = String(remoteUrl || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const host = (parsed.hostname || '').toLowerCase();
    if (!host.endsWith('github.com')) return '';
    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length < 2) return '';
    return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`;
  } catch {
    const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  return '';
}

function getProjectGitHubRepoPath(cwd = _projectDir || process.cwd()) {
  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return parseGitHubRepoFromRemoteUrl(remoteUrl);
  } catch {
    return '';
  }
}

function normalizePrUrl(rawPrUrl) {
  if (typeof rawPrUrl !== 'string') return '';
  const trimmed = rawPrUrl.trim();
  if (!trimmed) return '';
  if (PR_URL_RE.test(trimmed)) return trimmed;

  const match = trimmed.match(PR_NUMBER_RE);
  if (!match) return trimmed;

  const repoPath = getProjectGitHubRepoPath();
  if (!repoPath) return trimmed;
  return `https://github.com/${repoPath}/pull/${match[1]}`;
}

function isValidGitHubPrUrl(value) {
  return typeof value === 'string' && PR_URL_RE.test(value);
}

function parseWorkerId(rawWorkerId) {
  const parsed = parseInt(rawWorkerId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function canonicalBranchForWorkerId(rawWorkerId) {
  const workerId = parseWorkerId(rawWorkerId);
  if (workerId === null) return '';
  return `agent-${workerId}`;
}

function readWorkerBranchFromWorktree(worker) {
  const worktreePath = worker && worker.worktree_path ? String(worker.worktree_path).trim() : '';
  if (!worktreePath) return '';
  try {
    const branch = sanitizeBranchName(execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      cwd: worktreePath,
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
    return WORKER_BRANCH_RE.test(branch) ? branch : '';
  } catch {
    return '';
  }
}

function branchExists(rawBranch, repositoryDir = process.cwd()) {
  const branch = sanitizeBranchName(rawBranch);
  if (!branch) return false;
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      encoding: 'utf8',
      cwd: repositoryDir,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function resolveWorkerBranch(worker, fallbackWorkerId = null) {
  const workerId = worker && worker.id !== undefined && worker.id !== null
    ? worker.id
    : fallbackWorkerId;
  const canonicalBranch = canonicalBranchForWorkerId(workerId);
  const workerBranch = sanitizeBranchName(worker && worker.branch ? String(worker.branch) : '');
  const worktreeBranch = readWorkerBranchFromWorktree(worker);
  const worktreePath = worker && worker.worktree_path ? String(worker.worktree_path).trim() : '';

  // Worker ID is the source of truth for branch identity.
  // Keep canonical as a recovery-safe fallback when local refs are unavailable.
  if (canonicalBranch && branchExists(canonicalBranch, worktreePath || process.cwd())) {
    return canonicalBranch;
  }

  if (WORKER_BRANCH_RE.test(workerBranch) && branchExists(workerBranch, worktreePath || process.cwd())) return workerBranch;
  if (worktreeBranch && branchExists(worktreeBranch, worktreePath || process.cwd())) return worktreeBranch;
  if (canonicalBranch) return canonicalBranch;
  if (WORKER_BRANCH_RE.test(workerBranch)) return workerBranch;
  if (worktreeBranch) return worktreeBranch;
  return '';
}

function resolveCompletionBranch(worker, reportedBranch, fallbackWorkerId = null) {
  const workerBranch = resolveWorkerBranch(worker, fallbackWorkerId);
  const requestedBranch = sanitizeBranchName(reportedBranch);

  if (!requestedBranch) return { branch: workerBranch || null, mismatch: false, requestedBranch: null, workerBranch };
  if (!workerBranch) {
    // Fail closed when worker identity is unavailable. This prevents stale or
    // caller-provided feature branches from entering merge_queue.
    return { branch: null, mismatch: true, requestedBranch, workerBranch: null };
  }

  if (requestedBranch !== workerBranch) {
    return { branch: workerBranch, mismatch: true, requestedBranch, workerBranch };
  }

  return { branch: requestedBranch, mismatch: false, requestedBranch, workerBranch };
}

function queueMergeWithRecovery({
  request_id,
  task_id,
  pr_url,
  branch,
  priority = 0,
  force_retry = false,
  latest_completion_timestamp = undefined,
}) {
  const normalizedPriority = Number.isInteger(priority) ? priority : 0;
  const getLatestCheckpoint = () => {
    if (latest_completion_timestamp !== undefined) return latest_completion_timestamp;
    return getSafeLatestCompletedTaskCursor(request_id);
  };
  const latestCheckpoint = getLatestCheckpoint();

  const enqueueResult = db.enqueueMerge({
    request_id,
    task_id,
    pr_url,
    branch,
    priority: normalizedPriority,
    completion_checkpoint: latestCheckpoint,
  });
  if (enqueueResult.inserted) {
    return { queued: true, inserted: true, refreshed: false, retried: false };
  }

  const existing = db.getDb().prepare(`
    SELECT id, request_id, task_id, branch, status, priority, updated_at, completion_checkpoint
    FROM merge_queue
    WHERE pr_url = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(pr_url);

  if (!existing) {
    return { queued: false, inserted: false, refreshed: false, retried: false, reason: 'missing_existing_entry' };
  }
  if (existing.status === 'merged' || existing.status === 'merging') {
    return { queued: false, inserted: false, refreshed: false, retried: false, reason: `status_${existing.status}` };
  }

  const currentPriority = Number.isInteger(existing.priority) ? existing.priority : 0;
  const desiredPriority = Math.max(currentPriority, normalizedPriority);
  const isTerminalRetryStatus = existing.status === 'failed' || existing.status === 'conflict';
  const mergeIdentityChanged =
    String(existing.request_id) !== String(request_id) ||
    Number(existing.task_id) !== Number(task_id) ||
    existing.branch !== branch;
  const hasFreshCompletionProgress = isTerminalRetryStatus && hasSafeCompletedTaskProgressSince(request_id, {
    before: existing.completion_checkpoint,
    after: latestCheckpoint,
  });
  const shouldRetry = isTerminalRetryStatus && (force_retry || hasFreshCompletionProgress);
  const desiredStatus = shouldRetry ? 'pending' : existing.status;
  const needsRefresh =
    mergeIdentityChanged ||
    currentPriority !== desiredPriority ||
    existing.status !== desiredStatus;

  if (!needsRefresh) {
    if (isTerminalRetryStatus && !shouldRetry) {
      return { queued: false, inserted: false, refreshed: false, retried: false, reason: 'terminal_without_fresh_progress' };
    }
    return { queued: false, inserted: false, refreshed: false, retried: false, reason: 'already_current' };
  }

  db.getDb().prepare(`
    UPDATE merge_queue
    SET request_id = ?,
        task_id = ?,
        branch = ?,
        priority = ?,
        status = ?,
        error = CASE WHEN ? = 1 THEN NULL ELSE error END,
        completion_checkpoint = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(
    request_id,
    task_id,
    branch,
    desiredPriority,
    desiredStatus,
    shouldRetry ? 1 : 0,
    shouldRetry ? (latestCheckpoint || null) : existing.completion_checkpoint,
    existing.id
  );

  return {
    queued: shouldRetry,
    inserted: false,
    refreshed: true,
    retried: shouldRetry,
    previous_status: existing.status,
    merge_id: existing.id,
  };
}

function validateCommand(cmd) {
  const { command, args } = cmd;
  if (typeof command !== 'string') {
    throw new Error('Missing or invalid "command" field');
  }
  const schema = COMMAND_SCHEMAS[command];
  if (!schema) return; // unknown commands handled by switch default

  const a = args || {};
  for (const field of schema.required) {
    if (a[field] === undefined || a[field] === null) {
      throw new Error(`Missing required field "${field}" for command "${command}"`);
    }
  }
  for (const [field, expectedType] of Object.entries(schema.types)) {
    if (a[field] !== undefined && a[field] !== null && typeof a[field] !== expectedType) {
      throw new Error(`Field "${field}" must be of type ${expectedType}`);
    }
  }
  // Strip unknown keys for create-task
  if (schema.allowed && args) {
    for (const key of Object.keys(args)) {
      if (!schema.allowed.includes(key)) {
        delete args[key];
      }
    }
  }

  if (command === 'create-task' && Object.prototype.hasOwnProperty.call(a, 'domain')) {
    const normalizedDomain = normalizeTaskDomain(a.domain);
    if (normalizedDomain) a.domain = normalizedDomain;
    else delete a.domain;
  }
}

function getSocketPath(projectDir) {
  const dir = path.join(projectDir, '.claude', 'state');
  fs.mkdirSync(dir, { recursive: true });
  const hashInput = `${NAMESPACE}:${projectDir}`;
  if (process.platform === 'win32') {
    // Windows: use named pipes (Unix sockets have limited support)
    const hash = crypto.createHash('md5').update(hashInput).digest('hex').slice(0, 12);
    const pipePath = `\\\\.\\pipe\\${NAMESPACE}-${hash}`;
    fs.writeFileSync(path.join(dir, namespacedFile('mac10.pipe', `${NAMESPACE}.pipe`)), pipePath, 'utf8');
    return pipePath;
  }
  // On WSL2, /mnt/c/ (NTFS) doesn't support Unix sockets — use /tmp/ instead
  const hash = crypto.createHash('md5').update(hashInput).digest('hex').slice(0, 12);
  const sockPath = `/tmp/${NAMESPACE}-${hash}.sock`;
  // Write the socket path so the CLI can find it
  fs.writeFileSync(path.join(dir, namespacedFile('mac10.sock.path', `${NAMESPACE}.sock.path`)), sockPath, 'utf8');
  return sockPath;
}

function createConnectionHandler(handlers) {
  return (conn) => {
    let data = '';
    conn.on('data', (chunk) => {
      data += chunk.toString();
      if (data.length > MAX_PAYLOAD_SIZE) {
        respond(conn, { error: 'Payload too large' });
        conn.destroy();
        return;
      }
      // Protocol: newline-delimited JSON
      const lines = data.split('\n');
      data = lines.pop(); // keep incomplete line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const cmd = JSON.parse(line);
          validateCommand(cmd);
          handleCommand(cmd, conn, handlers);
        } catch (e) {
          respond(conn, { error: e.message });
        }
      }
    });
    conn.on('end', () => {
      // Process any remaining complete line in the buffer
      if (data.trim()) {
        try {
          const cmd = JSON.parse(data);
          validateCommand(cmd);
          handleCommand(cmd, conn, handlers);
        } catch {} // connection closing — best effort
      }
    });
    conn.on('error', () => {}); // ignore broken pipe
  };
}

function start(projectDir, handlers) {
  _projectDir = projectDir;
  const socketPath = getSocketPath(projectDir);
  const connHandler = createConnectionHandler(handlers);

  // Clean up stale socket (not needed for Windows named pipes)
  if (process.platform !== 'win32') {
    try { fs.unlinkSync(socketPath); } catch {}
  }

  // Primary listener: Unix socket (WSL/macOS) or named pipe (Windows)
  server = net.createServer(connHandler);
  server.listen(socketPath, () => {
    if (process.platform !== 'win32') {
      try { fs.chmodSync(socketPath, 0o600); } catch {}
    }
  });

  // TCP bridge: allows cross-environment access (Git Bash ↔ WSL, remote agents)
  // Derive a stable per-project port from the same hash used for sockets (range 31000-31999)
  const portHash = crypto.createHash('md5').update(`${NAMESPACE}:${projectDir}`).digest('hex');
  const derivedPort = 31000 + (parseInt(portHash.slice(0, 4), 16) % 1000);
  const tcpPort = parseInt(process.env.MAC10_CLI_PORT) || derivedPort;
  const stateDir = path.join(projectDir, '.claude', 'state');
  tcpServer = net.createServer(connHandler);
  tcpServer.listen(tcpPort, '127.0.0.1', () => {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, namespacedFile('mac10.tcp.port', `${NAMESPACE}.tcp.port`)),
      String(tcpPort),
      'utf8'
    );
    console.log(`CLI TCP bridge listening on localhost:${tcpPort}`);
  });
  tcpServer.on('error', (e) => {
    // Port in use — not fatal, Unix socket still works
    console.warn(`TCP bridge failed (port ${tcpPort}): ${e.message}`);
  });

  return server;
}

function stop() {
  if (server) { server.close(); server = null; }
  if (tcpServer) { tcpServer.close(); tcpServer = null; }
}

function respond(conn, data) {
  try {
    conn.write(JSON.stringify(data) + '\n');
  } catch {}
}

function handleCommand(cmd, conn, handlers) {
  const { command, args } = cmd;

  try {
    switch (command) {
      // === USER commands ===
      case 'request': {
        const id = db.createRequest(args.description);
        bridgeToHandoff(id, args.description);
        respond(conn, { ok: true, request_id: id });
        break;
      }
      case 'fix': {
        const fixResult = db.getDb().transaction(() => {
          const id = db.createRequest(args.description);
          db.updateRequest(id, { tier: 2, status: 'decomposed' });
          const taskId = db.createTask({
            request_id: id,
            subject: `Fix: ${args.description}`,
            description: args.description,
            priority: 'urgent',
            tier: 2,
          });
          db.updateTask(taskId, { status: 'ready' });
          return { request_id: id, task_id: taskId };
        })();
        respond(conn, { ok: true, ...fixResult });
        break;
      }
      case 'status': {
        const requests = db.listRequests();
        const workers = db.getAllWorkers();
        const tasks = db.listTasks();
        const project_dir = db.getConfig('project_dir') || '';
        const merges = db.getDb().prepare(
          "SELECT * FROM merge_queue WHERE status != 'merged' ORDER BY id DESC"
        ).all();
        const routingBudget = modelRouter.getBudgetState(db.getConfig);
        respond(conn, {
          ok: true,
          requests,
          workers,
          tasks,
          project_dir,
          merges,
          budget_state: routingBudget,
          budget_source: routingBudget ? (routingBudget.source || 'none') : 'none',
        });
        break;
      }
      case 'clarify': {
        db.sendMail('architect', 'clarification_reply', {
          request_id: args.request_id,
          message: args.message,
        });
        respond(conn, { ok: true });
        break;
      }
      case 'log': {
        const logs = db.getLog(args.limit || 50, args.actor);
        respond(conn, { ok: true, logs });
        break;
      }
      case 'request-history': {
        const requestId = args.request_id;
        const rawLimit = args.limit || 500;
        const limit = Math.max(1, Math.min(rawLimit, 10000));
        const logs = getSafeRequestHistory(requestId, limit);
        respond(conn, { ok: true, request_id: requestId, logs });
        break;
      }

      // === ARCHITECT commands ===
      case 'triage': {
        const { request_id, tier, reasoning } = args;
        db.updateRequest(request_id, { tier, status: tier === 1 ? 'executing_tier1' : 'decomposed' });
        db.log('architect', 'triage', { request_id, tier, reasoning });
        if (tier === 3) {
          db.sendMail('allocator', 'tasks_ready', { request_id });
        }
        respond(conn, { ok: true });
        break;
      }
      case 'create-task': {
        // Normalize files to an array before persisting (handles strings, JSON strings, arrays)
        args.files = parseFilesField(args.files);
        args.depends_on = parseDependsOnField(args.depends_on);
        const taskId = db.createTask(args);
        // If no dependencies, mark ready immediately
        if (!args.depends_on || args.depends_on.length === 0) {
          db.updateTask(taskId, { status: 'ready' });
        }
        // Detect file overlaps with other tasks in the same request
        let overlaps = [];
        const taskFiles = Array.isArray(args.files) ? args.files : [];
        if (taskFiles.length > 0) {
          overlaps = db.findOverlappingTasks(args.request_id, taskFiles, taskId)
            .filter((o) => Number(o.task_id) !== taskId);
          const overlapIds = normalizeOverlapIdsField(overlaps.map((o) => o.task_id), taskId);
          if (overlapIds.length > 0) {
            // Set overlap_with on the new task
            db.updateTask(taskId, { overlap_with: JSON.stringify(overlapIds) });
            // Update existing overlapping tasks to include the new task
            for (const overlapId of overlapIds) {
              const existing = db.getTask(overlapId);
              const existingOverlaps = normalizeOverlapIdsField(existing && existing.overlap_with, overlapId);
              let shouldUpdate = !!existing;
              if (!existingOverlaps.includes(taskId)) {
                existingOverlaps.push(taskId);
                shouldUpdate = true;
              }
              if (shouldUpdate) {
                db.updateTask(overlapId, { overlap_with: JSON.stringify(existingOverlaps) });
              }
            }
            db.log('coordinator', 'overlap_detected', {
              task_id: taskId,
              request_id: args.request_id,
              overlaps: overlaps.map(o => ({ task_id: o.task_id, shared_files: o.shared_files })),
            });
          }
        }
        respond(conn, { ok: true, task_id: taskId, overlaps });
        break;
      }
      case 'tier1-complete': {
        const { request_id, result } = args;
        db.updateRequest(request_id, { status: 'completed', result, completed_at: new Date().toISOString() });
        db.sendMail('master-1', 'request_completed', { request_id, result });
        db.log('architect', 'tier1_complete', { request_id, result });
        respond(conn, { ok: true });
        break;
      }
      case 'ask-clarification': {
        db.sendMail('master-1', 'clarification_ask', {
          request_id: args.request_id,
          question: args.question,
        });
        db.log('architect', 'clarification_ask', { request_id: args.request_id, question: args.question });
        respond(conn, { ok: true });
        break;
      }

      // === WORKER commands ===
      case 'my-task': {
        const worker = db.getWorker(args.worker_id);
        if (!worker) {
          respond(conn, { ok: false, error: 'Worker not found' });
          break;
        }
        if (!worker.current_task_id) {
          respond(conn, { ok: true, task: null });
          break;
        }
        const task = db.getTask(worker.current_task_id);
        respond(conn, { ok: true, task });
        break;
      }
      case 'start-task': {
        const { worker_id, task_id } = args;
        db.updateTask(task_id, { status: 'in_progress', started_at: new Date().toISOString() });
        db.updateWorker(worker_id, { status: 'busy', last_heartbeat: new Date().toISOString() });
        db.log(`worker-${worker_id}`, 'task_started', { task_id });
        respond(conn, { ok: true });
        break;
      }
      case 'heartbeat': {
        const worker = db.getWorker(args.worker_id);
        if (!worker) {
          respond(conn, { ok: false, error: 'Worker not found' });
          break;
        }

        const heartbeatTs = new Date().toISOString();
        const updateResult = db.getDb().prepare(`
          UPDATE workers
          SET last_heartbeat = ?
          WHERE id = ?
        `).run(heartbeatTs, args.worker_id);
        if (updateResult.changes !== 1) {
          respond(conn, { ok: false, error: 'Worker not found' });
          break;
        }

        respond(conn, { ok: true });
        break;
      }
      case 'complete-task': {
        const { worker_id, task_id, pr_url, result, branch } = args;
        const normalizedPrUrl = normalizePrUrl(pr_url);
        const worker = db.getWorker(worker_id);
        const resolvedBranch = resolveCompletionBranch(worker, branch, worker_id);
        if (resolvedBranch.mismatch) {
          db.log('coordinator', 'complete_task_branch_overridden', {
            worker_id,
            task_id,
            requested_branch: resolvedBranch.requestedBranch,
            worker_branch: resolvedBranch.workerBranch,
          });
        }
        db.updateTask(task_id, {
          status: 'completed',
          pr_url: normalizedPrUrl || null,
          branch: resolvedBranch.branch,
          result: result || null,
          completed_at: new Date().toISOString(),
        });
        // Increment tasks_completed counter on worker
        const workerRow = db.getWorker(worker_id);
        const tasksCompleted = (workerRow ? workerRow.tasks_completed : 0) + 1;
        db.updateWorker(worker_id, {
          status: 'completed_task',
          current_task_id: null,
          tasks_completed: tasksCompleted,
        });
        const completedTask = db.getTask(task_id);
        // Enqueue merge if PR exists (must be a valid URL, not a status string like "already_merged")
        const queueBranch = sanitizeBranchName(resolvedBranch.branch || completedTask.branch || (worker && worker.branch) || '');
        if (isValidGitHubPrUrl(normalizedPrUrl) && completedTask && queueBranch) {
          const queueResult = queueMergeWithRecovery({
            request_id: completedTask.request_id,
            task_id,
            pr_url: normalizedPrUrl,
            branch: queueBranch,
            priority: completedTask.priority === 'urgent' ? 10 : 0,
          });
          if (queueResult.refreshed) {
            db.log('coordinator', 'merge_queue_entry_refreshed', {
              request_id: completedTask.request_id,
              task_id,
              pr_url: normalizedPrUrl,
              branch: queueBranch,
              retried: queueResult.retried,
              previous_status: queueResult.previous_status || null,
              merge_id: queueResult.merge_id || null,
            });
          }
        }
        if (normalizedPrUrl && normalizedPrUrl !== (pr_url || '')) {
          db.log('coordinator', 'complete_task_pr_url_normalized', {
            task_id,
            worker_id,
            original_pr_url: pr_url,
            normalized_pr_url: normalizedPrUrl,
          });
        }
        db.sendMail('allocator', 'task_completed', {
          worker_id, task_id,
          request_id: completedTask ? completedTask.request_id : null,
          pr_url: normalizedPrUrl,
          tasks_completed: tasksCompleted,
        });
        // Notify architect so it has visibility into Tier 2 outcomes
        db.sendMail('architect', 'task_completed', {
          worker_id, task_id,
          request_id: completedTask ? completedTask.request_id : null,
          pr_url: normalizedPrUrl,
          result,
        });
        db.log(`worker-${worker_id}`, 'task_completed', {
          task_id,
          pr_url: normalizedPrUrl,
          result,
          tasks_completed: tasksCompleted,
        });
        // Notify handlers for merge check
        if (handlers.onTaskCompleted) handlers.onTaskCompleted(task_id);
        respond(conn, { ok: true });
        break;
      }
      case 'fail-task': {
        const { worker_id: wid, task_id: tid, error } = args;
        const failedTask = db.getTask(tid);
        const routingMeta = failedTask ? {
          subject: failedTask.subject,
          description: failedTask.description,
          domain: failedTask.domain,
          files: failedTask.files,
          tier: failedTask.tier,
          assigned_to: failedTask.assigned_to,
        } : null;
        db.updateTask(tid, { status: 'failed', result: error, completed_at: new Date().toISOString() });
        db.updateWorker(wid, { status: 'idle', current_task_id: null });
        db.sendMail('allocator', 'task_failed', {
          worker_id: wid,
          task_id: tid,
          request_id: failedTask ? failedTask.request_id : null,
          error,
          subject: routingMeta ? routingMeta.subject : null,
          domain: routingMeta ? routingMeta.domain : null,
          files: routingMeta ? routingMeta.files : null,
          tier: routingMeta ? routingMeta.tier : null,
          assigned_to: routingMeta ? routingMeta.assigned_to : null,
          original_task: routingMeta,
        });
        // Also notify architect so it has visibility into failures
        db.sendMail('architect', 'task_failed', {
          worker_id: wid,
          task_id: tid,
          request_id: failedTask ? failedTask.request_id : null,
          error,
          original_task: routingMeta,
        });
        db.log(`worker-${wid}`, 'task_failed', { task_id: tid, error });
        respond(conn, { ok: true });
        break;
      }
      case 'distill': {
        db.log(`worker-${args.worker_id}`, 'distill', { domain: args.domain, content: args.content });
        respond(conn, { ok: true });
        break;
      }

      // === SHARED commands ===
      case 'inbox': {
        const msgs = db.checkMail(args.recipient, !args.peek);
        respond(conn, { ok: true, messages: msgs });
        break;
      }
      case 'inbox-block': {
        // Async blocking inbox check — polls without freezing the event loop
        const recipient = args.recipient;
        const timeoutMs = args.timeout || 300000;
        const consume = !args.peek;
        const pollMs = 1000;
        const deadline = Date.now() + timeoutMs;
        let cancelled = false;

        conn.on('close', () => { cancelled = true; });
        conn.on('end', () => { cancelled = true; });
        conn.on('error', () => { cancelled = true; });

        const poll = () => {
          if (cancelled) return;
          try {
            const msgs = db.checkMail(recipient, consume);
            if (msgs.length > 0) {
              respond(conn, { ok: true, messages: msgs });
              return;
            }
            if (Date.now() >= deadline) {
              respond(conn, { ok: true, messages: [] });
              return;
            }
            setTimeout(poll, pollMs);
          } catch (e) {
            respond(conn, { error: e.message });
          }
        };
        poll();
        break;
      }

      // === ALLOCATOR commands ===
      case 'ready-tasks': {
        const tasks = db.getReadyTasks();
        respond(conn, { ok: true, tasks });
        break;
      }
      case 'assign-task': {
        const { task_id: assignTaskId, worker_id: assignWorkerId } = args;
        // Atomic assignment: same pattern as allocator.js assignTaskToWorker
        const assignResult = db.getDb().transaction(() => {
          const freshTask = db.getTask(assignTaskId);
          const freshWorker = db.getWorker(assignWorkerId);
          if (!freshTask || freshTask.status !== 'ready' || freshTask.assigned_to) return { ok: false, reason: 'task_not_ready' };
          if (!freshWorker || freshWorker.status !== 'idle') return { ok: false, reason: 'worker_not_idle' };

          db.updateTask(assignTaskId, { status: 'assigned', assigned_to: assignWorkerId });
          db.updateWorker(assignWorkerId, {
            status: 'assigned',
            current_task_id: assignTaskId,
            domain: freshTask.domain || freshWorker.domain,
            claimed_by: null,
            launched_at: new Date().toISOString(),
          });
          return { ok: true, task: freshTask, worker: freshWorker };
        })();

        if (!assignResult.ok) {
          respond(conn, { ok: false, error: assignResult.reason });
          break;
        }

        const assignedTask = db.getTask(assignTaskId);
        const assignedWorker = db.getWorker(assignWorkerId);
        const routingDecision = modelRouter.routeTask(assignedTask, { getConfig: db.getConfig });
        const routingTelemetry = {
          budget_state: routingDecision.budget_state || null,
          budget_source: routingDecision.budget_source || 'none',
          model_source: routingDecision.model_source || null,
          routing_precedence: routingDecision.routing_precedence || [],
        };

        // Trigger tmux spawn via handler — revert assignment on failure
        if (handlers.onAssignTask) {
          try {
            handlers.onAssignTask(assignedTask, assignedWorker, routingDecision);
          } catch (spawnErr) {
            db.getDb().transaction(() => {
              db.updateTask(assignTaskId, {
                status: assignResult.task.status,
                assigned_to: assignResult.task.assigned_to,
              });
              db.updateWorker(assignWorkerId, {
                status: assignResult.worker.status,
                current_task_id: assignResult.worker.current_task_id,
                domain: assignResult.worker.domain,
                claimed_by: assignResult.worker.claimed_by,
                launched_at: assignResult.worker.launched_at,
              });
            })();
            db.log('coordinator', 'assign_handler_failed', { task_id: assignTaskId, worker_id: assignWorkerId, error: spawnErr.message });
            respond(conn, { ok: false, error: `Failed to spawn worker: ${spawnErr.message}` });
            break;
          }
        }

        db.sendMail(`worker-${assignWorkerId}`, 'task_assigned', {
          task_id: assignTaskId,
          subject: assignedTask.subject,
          description: assignedTask.description,
          domain: assignedTask.domain,
          files: assignedTask.files,
          tier: assignedTask.tier,
          request_id: assignedTask.request_id,
          validation: assignedTask.validation,
          assignment_token: assignedWorker ? assignedWorker.launched_at : null,
          routing_class: routingDecision.routing_class,
          model: routingDecision.model,
          model_source: routingTelemetry.model_source,
          reasoning_effort: routingDecision.reasoning_effort,
          routing_reason: routingDecision.reason,
          routing_precedence: routingTelemetry.routing_precedence,
          budget_state: routingTelemetry.budget_state,
          budget_source: routingTelemetry.budget_source,
        });
        db.log('allocator', 'task_assigned', {
          task_id: assignTaskId,
          worker_id: assignWorkerId,
          domain: assignedTask.domain,
          assignment_token: assignedWorker ? assignedWorker.launched_at : null,
          routing_class: routingDecision.routing_class,
          model: routingDecision.model,
          model_source: routingTelemetry.model_source,
          reasoning_effort: routingDecision.reasoning_effort,
          routing_reason: routingDecision.reason,
          routing_precedence: routingTelemetry.routing_precedence,
          budget_state: routingTelemetry.budget_state,
          budget_source: routingTelemetry.budget_source,
        });

        respond(conn, {
          ok: true,
          task_id: assignTaskId,
          worker_id: assignWorkerId,
          routing: {
            class: routingDecision.routing_class,
            model: routingDecision.model,
            model_source: routingTelemetry.model_source,
            reasoning_effort: routingDecision.reasoning_effort,
            reason: routingDecision.reason,
            precedence: routingTelemetry.routing_precedence,
          },
          assignment_token: assignedWorker ? assignedWorker.launched_at : null,
          budget_state: routingTelemetry.budget_state,
          budget_source: routingTelemetry.budget_source,
        });
        break;
      }
      case 'claim-worker': {
        const success = db.claimWorker(args.worker_id, args.claimer);
        respond(conn, { ok: true, claimed: success });
        break;
      }
      case 'release-worker': {
        db.releaseWorker(args.worker_id);
        respond(conn, { ok: true });
        break;
      }
      case 'worker-status': {
        const workers = db.getAllWorkers();
        respond(conn, { ok: true, workers });
        break;
      }
      case 'check-completion': {
        const completion = db.checkRequestCompletion(args.request_id);
        respond(conn, { ok: true, ...completion });
        break;
      }

      case 'check-overlaps': {
        const overlapPairs = db.getOverlapsForRequest(args.request_id);
        respond(conn, { ok: true, request_id: args.request_id, overlaps: overlapPairs });
        break;
      }

      case 'integrate': {
        // Master-3 triggers integration when all tasks for a request complete
        const reqId = args.request_id;
        const forceRetry = args.retry_terminal === true || args.force_retry === true;
        const completion = db.checkRequestCompletion(reqId);
        if (!completion.all_done) {
          respond(conn, { ok: false, error: 'Not all tasks completed', ...completion });
          break;
        }
        // Queue merges for each completed task's branch/PR
        const tasks = db.listTasks({ request_id: reqId, status: 'completed' });
        const latestCompletedTaskState = getSafeLatestCompletedTaskCursor(reqId);
        let queued = 0;
        for (const task of tasks) {
          const worker = task.assigned_to ? db.getWorker(task.assigned_to) : null;
          const normalizedPrUrl = normalizePrUrl(task.pr_url);
          const resolvedBranch = resolveCompletionBranch(worker, task.branch, task.assigned_to);
          if (task.pr_url !== normalizedPrUrl) {
            db.updateTask(task.id, { pr_url: normalizedPrUrl || task.pr_url });
          }
          const mergeBranch = sanitizeBranchName(resolvedBranch.branch || task.branch || (worker && worker.branch) || '');
          if (isValidGitHubPrUrl(normalizedPrUrl) && mergeBranch) {
            if (resolvedBranch.mismatch || task.branch !== mergeBranch) {
              db.updateTask(task.id, { branch: mergeBranch });
            }
            try {
              const queueResult = queueMergeWithRecovery({
                request_id: reqId,
                task_id: task.id,
                branch: mergeBranch,
                pr_url: normalizedPrUrl,
                priority: task.priority === 'urgent' ? 10 : 0,
                force_retry: forceRetry,
                latest_completion_timestamp: latestCompletedTaskState,
              });
              if (queueResult.queued) queued++;
              if (queueResult.refreshed) {
                db.log('coordinator', 'merge_queue_entry_refreshed', {
                  request_id: reqId,
                  task_id: task.id,
                  pr_url: normalizedPrUrl,
                  branch: mergeBranch,
                  retried: queueResult.retried,
                  previous_status: queueResult.previous_status || null,
                  merge_id: queueResult.merge_id || null,
                });
              }
            } catch (e) {
              // Invalid merge metadata or transient DB error — skip this task entry
            }
          }
        }
        if (queued > 0) {
          db.updateRequest(reqId, { status: 'integrating' });
        }
        db.log('coordinator', 'integration_triggered', { request_id: reqId, merges_queued: queued });
        // Trigger merger immediately
        if (queued > 0 && handlers.onIntegrate) handlers.onIntegrate(reqId);
        respond(conn, { ok: true, request_id: reqId, merges_queued: queued });
        break;
      }

      // === SYSTEM commands ===
      case 'register-worker': {
        const { worker_id, worktree_path, branch } = args;
        db.registerWorker(worker_id, worktree_path || '', branch || '');
        db.log('coordinator', 'worker_registered', { worker_id });
        respond(conn, { ok: true, worker_id });
        break;
      }
      case 'repair': {
        // Reset stuck states using the freshest lifecycle timestamp so newly assigned workers
        // are not treated as stale when they still carry an older heartbeat value.
        const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        const dbConn = db.getDb();
        const staleWorkers = dbConn.prepare(`
          SELECT id
          FROM workers
          WHERE status IN ('assigned', 'running', 'busy')
            AND datetime(
              CASE
                WHEN last_heartbeat IS NULL AND launched_at IS NULL THEN created_at
                WHEN last_heartbeat IS NULL THEN launched_at
                WHEN launched_at IS NULL THEN last_heartbeat
                WHEN datetime(last_heartbeat) >= datetime(launched_at) THEN last_heartbeat
                ELSE launched_at
              END
            ) < datetime(?)
        `).all(cutoff);

        let stuck = { changes: 0 };
        let orphaned = { changes: 0 };

        if (staleWorkers.length > 0) {
          const staleIds = staleWorkers.map((row) => row.id);
          const placeholders = staleIds.map(() => '?').join(', ');
          const updateTasks = dbConn.prepare(`
            UPDATE tasks
            SET status = 'ready',
                assigned_to = NULL
            WHERE status IN ('assigned', 'in_progress')
              AND assigned_to IN (${placeholders})
          `);
          const updateWorkers = dbConn.prepare(`
            UPDATE workers
            SET status = 'idle',
                current_task_id = NULL,
                claimed_by = NULL
            WHERE id IN (${placeholders})
          `);
          const tx = dbConn.transaction((ids) => {
            const orphanedResult = updateTasks.run(...ids);
            const stuckResult = updateWorkers.run(...ids);
            return { stuckResult, orphanedResult };
          });
          const txResult = tx(staleIds);
          stuck = txResult.stuckResult;
          orphaned = txResult.orphanedResult;
        }

        const supersessionBackfill = backfillSupersededLoopRequestsSafe();
        db.log('coordinator', 'repair', {
          reset_workers: stuck.changes,
          orphaned_tasks: orphaned.changes,
          supersession_backfill: supersessionBackfill,
        });
        respond(conn, {
          ok: true,
          reset_workers: stuck.changes,
          orphaned_tasks: orphaned.changes,
          supersession_backfill: supersessionBackfill,
        });
        break;
      }
      case 'ping': {
        respond(conn, { ok: true, ts: Date.now() });
        break;
      }

      case 'add-worker': {
        const maxWorkers = parseInt(db.getConfig('max_workers')) || 8;
        const allWorkers = db.getAllWorkers();
        if (allWorkers.length >= maxWorkers) {
          respond(conn, { ok: false, error: `Already at max workers (${maxWorkers})` });
          break;
        }
        const nextId = allWorkers.length > 0
          ? Math.max(...allWorkers.map(w => typeof w.id === 'number' ? w.id : parseInt(w.id))) + 1
          : 1;
        if (nextId > maxWorkers) {
          respond(conn, { ok: false, error: `Next worker ID ${nextId} exceeds max_workers (${maxWorkers})` });
          break;
        }
        const projDir = db.getConfig('project_dir');
        if (!projDir) {
          respond(conn, { ok: false, error: 'project_dir not set in config' });
          break;
        }
        const wtDir = path.join(projDir, '.worktrees');
        const wtPath = path.join(wtDir, `wt-${nextId}`);
        const branchName = `agent-${nextId}`;
        try {
          fs.mkdirSync(wtDir, { recursive: true });
          // Create branch from configured/default branch (not current checked-out feature branch).
          const mainBranch = (() => {
            const configuredPrimary = (db.getConfig('primary_branch') || '').trim();
            if (configuredPrimary) return configuredPrimary;

            try {
              const remoteHead = execFileSync(
                'git',
                ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
                { cwd: projDir, encoding: 'utf8' },
              ).trim();
              if (remoteHead.startsWith('origin/')) {
                return remoteHead.slice('origin/'.length);
              }
            } catch {}

            try {
              const abbrevRemoteHead = execFileSync(
                'git',
                ['rev-parse', '--abbrev-ref', 'origin/HEAD'],
                { cwd: projDir, encoding: 'utf8' },
              ).trim();
              if (abbrevRemoteHead.startsWith('origin/')) {
                return abbrevRemoteHead.slice('origin/'.length);
              }
            } catch {}

            return 'main';
          })();
          try {
            execFileSync('git', ['branch', branchName, mainBranch], { cwd: projDir, encoding: 'utf8' });
          } catch (branchError) {
            const stderr = String(branchError?.stderr || '').trim();
            const stdout = String(branchError?.stdout || '').trim();
            const details = [stderr, stdout].filter(Boolean).join(' ').trim();
            const message = String(branchError?.message || '').trim();
            const combined = [message, details].filter(Boolean).join(' ').trim();

            if (/already exists/i.test(combined)) {
              // Existing branch is expected during retries/restarts.
            } else if (
              /not a commit/i.test(combined) ||
              /not a valid object name/i.test(combined) ||
              /unknown revision/i.test(combined) ||
              /ambiguous argument/i.test(combined) ||
              /bad revision/i.test(combined)
            ) {
              throw new Error(
                `Cannot create worker branch '${branchName}' from base '${mainBranch}': base ref is invalid or cannot be resolved. ` +
                `Set 'primary_branch' to a valid ref (for example: main) and retry.`
              );
            } else {
              throw branchError;
            }
          }
          execFileSync('git', ['worktree', 'add', wtPath, branchName], { cwd: projDir, encoding: 'utf8' });

          // Copy .claude structure to worktree
          const srcClaude = path.join(projDir, '.claude');
          const dstClaude = path.join(wtPath, '.claude');
          const copyDir = (rel) => {
            const src = path.join(srcClaude, rel);
            const dst = path.join(dstClaude, rel);
            if (!fs.existsSync(src)) return;
            fs.mkdirSync(dst, { recursive: true });
            for (const f of fs.readdirSync(src)) {
              const srcF = path.join(src, f);
              if (fs.statSync(srcF).isFile()) fs.copyFileSync(srcF, path.join(dst, f));
            }
          };
          copyDir('commands');
          copyDir('knowledge');
          copyDir('knowledge/domain');
          copyDir('scripts');
          copyDir('agents');
          copyDir('hooks');
          // Copy worker role docs for both legacy and Codex-compatible runtimes.
          const workerClaude = path.join(srcClaude, 'worker-claude.md');
          if (fs.existsSync(workerClaude)) {
            fs.copyFileSync(workerClaude, path.join(wtPath, 'CLAUDE.md'));
          }
          const workerAgents = path.join(srcClaude, 'worker-agents.md');
          if (fs.existsSync(workerAgents)) {
            fs.copyFileSync(workerAgents, path.join(wtPath, 'AGENTS.md'));
          } else if (fs.existsSync(workerClaude)) {
            fs.copyFileSync(workerClaude, path.join(wtPath, 'AGENTS.md'));
          }
          // Copy settings.json
          const settingsFile = path.join(srcClaude, 'settings.json');
          if (fs.existsSync(settingsFile)) {
            fs.copyFileSync(settingsFile, path.join(dstClaude, 'settings.json'));
          }
          // Make hook scripts executable
          try {
            const hookDir = path.join(dstClaude, 'hooks');
            if (fs.existsSync(hookDir)) {
              for (const f of fs.readdirSync(hookDir)) {
                if (f.endsWith('.sh')) fs.chmodSync(path.join(hookDir, f), 0o755);
              }
            }
          } catch {}

          db.registerWorker(nextId, wtPath, branchName);
          db.log('coordinator', 'worker_added', { worker_id: nextId, worktree_path: wtPath, branch: branchName });
          respond(conn, { ok: true, worker_id: nextId, worktree_path: wtPath, branch: branchName });
        } catch (e) {
          respond(conn, { ok: false, error: `Failed to create worker: ${e.message}` });
        }
        break;
      }

      case 'reset-worker': {
        // Called by sentinel when Claude exits — ownership checks prevent stale
        // sentinels from clearing a newer assignment.
        const { worker_id: resetWid, expected_task_id: expectedTaskId, expected_assignment_token: expectedToken } = parseResetOwnership(args);
        if (!resetWid) {
          respond(conn, { ok: false, error: 'Missing worker_id' });
          break;
        }
        const resetWorker = db.getWorker(resetWid);
        if (!resetWorker) {
          respond(conn, { ok: false, error: 'Worker not found' });
          break;
        }

        if (
          expectedTaskId !== null &&
          resetWorker.current_task_id !== null &&
          resetWorker.current_task_id !== expectedTaskId
        ) {
          db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
            reason: 'task_mismatch',
            expected_task_id: expectedTaskId,
            current_task_id: resetWorker.current_task_id,
          });
          respond(conn, { ok: true, skipped: true, reason: 'task_mismatch' });
          break;
        }

        if (
          expectedToken &&
          resetWorker.launched_at &&
          resetWorker.launched_at !== expectedToken
        ) {
          db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
            reason: 'assignment_mismatch',
            expected_assignment_token: expectedToken,
            current_assignment_token: resetWorker.launched_at,
          });
          respond(conn, { ok: true, skipped: true, reason: 'assignment_mismatch' });
          break;
        }

        // Only reset if worker isn't already idle (avoid clobbering a fresh assignment)
        if (resetWorker.status !== 'idle') {
          db.updateWorker(resetWid, {
            status: 'idle',
            current_task_id: null,
            last_heartbeat: new Date().toISOString(),
          });
          db.log(`worker-${resetWid}`, 'sentinel_reset', {
            previous_status: resetWorker.status,
            expected_task_id: expectedTaskId,
            expected_assignment_token: expectedToken,
          });
        }
        respond(conn, { ok: true });
        break;
      }

      case 'merge-status': {
        const reqFilter = args && args.request_id;
        let sql = 'SELECT * FROM merge_queue';
        const params = [];
        if (reqFilter) {
          sql += ' WHERE request_id = ?';
          params.push(reqFilter);
        }
        sql += ' ORDER BY id DESC';
        const merges = db.getDb().prepare(sql).all(...params);
        respond(conn, { ok: true, merges });
        break;
      }

      // === CHANGES commands ===
      case 'log-change': {
        const changeId = db.createChange(args);
        const change = db.getChange(changeId);
        db.log('coordinator', 'change_logged', { change_id: changeId, description: args.description });
        if (handlers.onChangeCreated) handlers.onChangeCreated(change);
        respond(conn, { ok: true, change_id: changeId });
        break;
      }
      case 'list-changes': {
        const changes = db.listChanges(args || {});
        respond(conn, { ok: true, changes });
        break;
      }
      case 'update-change': {
        const { id: changeId2, ...changeFields } = args;
        // Only allow valid change columns
        const allowed = ['enabled', 'status', 'description', 'tooltip'];
        const filtered = {};
        for (const k of allowed) {
          if (changeFields[k] !== undefined) filtered[k] = changeFields[k];
        }
        db.updateChange(changeId2, filtered);
        const updated = db.getChange(changeId2);
        if (handlers.onChangeUpdated) handlers.onChangeUpdated(updated);
        respond(conn, { ok: true });
        break;
      }

      // === LOOP commands ===
      case 'loop': {
        const prompt = args.prompt;
        if (prompt.trim().length === 0) {
          respond(conn, { ok: false, error: 'prompt must be a non-empty string' });
          break;
        }
        const loopId = db.createLoop(prompt);
        if (handlers.onLoopCreated) handlers.onLoopCreated(loopId, prompt);
        respond(conn, { ok: true, loop_id: loopId });
        break;
      }
      case 'stop-loop': {
        const loop = db.getLoop(args.loop_id);
        if (!loop) {
          respond(conn, { ok: false, error: 'Loop not found' });
          break;
        }
        db.stopLoop(args.loop_id);
        respond(conn, { ok: true, loop_id: args.loop_id });
        break;
      }
      case 'loop-status': {
        const loops = db.listLoops();
        respond(conn, { ok: true, loops });
        break;
      }
      case 'loop-checkpoint': {
        const cpLoop = db.getLoop(args.loop_id);
        if (!cpLoop) {
          respond(conn, { ok: false, error: 'Loop not found' });
          break;
        }
        db.updateLoop(args.loop_id, {
          last_checkpoint: args.summary,
          iteration_count: cpLoop.iteration_count + 1,
          last_heartbeat: new Date().toISOString(),
        });
        db.log('coordinator', 'loop_checkpoint', {
          loop_id: args.loop_id,
          iteration: cpLoop.iteration_count + 1,
          summary: args.summary.slice(0, 200),
        });
        respond(conn, { ok: true, iteration: cpLoop.iteration_count + 1 });
        break;
      }
      case 'loop-heartbeat': {
        const hbLoop = db.getLoop(args.loop_id);
        if (!hbLoop) {
          respond(conn, { ok: false, error: 'Loop not found' });
          break;
        }
        db.updateLoop(args.loop_id, { last_heartbeat: new Date().toISOString() });
        respond(conn, { ok: true, status: hbLoop.status });
        break;
      }
      case 'set-config': {
        const { key, value } = args;
        // Allowlist of configurable keys to prevent arbitrary DB manipulation
        const ALLOWED_KEYS = [
          'watchdog_warn_sec', 'watchdog_nudge_sec', 'watchdog_triage_sec', 'watchdog_terminate_sec',
          'watchdog_interval_ms', 'allocator_interval_ms', 'max_workers',
          'primary_branch',
          'model_flagship', 'model_codex_spark', 'model_spark', 'model_mini',
          'model_xhigh', 'model_high', 'model_mid',
          'reasoning_xhigh', 'reasoning_high', 'reasoning_mid', 'reasoning_spark', 'reasoning_mini',
          ROUTING_BUDGET_STATE_KEY,
          ROUTING_BUDGET_REMAINING_KEY,
          ROUTING_BUDGET_THRESHOLD_KEY,
        ];
        if (!ALLOWED_KEYS.includes(key)) {
          respond(conn, { error: `Key '${key}' is not configurable. Allowed: ${ALLOWED_KEYS.join(', ')}` });
          break;
        }
        const dbConn = db.getDb();
        const upsertConfig = dbConn.prepare('INSERT INTO config(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
        let storedValue = String(value);
        if (key === 'max_workers') {
          storedValue = String(clampWorkerLimit(value));
          upsertConfig.run('max_workers', storedValue);
          upsertConfig.run('num_workers', storedValue);
        } else {
          if (key === ROUTING_BUDGET_STATE_KEY) {
            const parsedState = parseBudgetStateConfig(value);
            if (parsedState.parsed) {
              storedValue = JSON.stringify(parsedState.parsed);
            }
          }
          upsertConfig.run(key, storedValue);
        }

        if (key === ROUTING_BUDGET_STATE_KEY) {
          const parsedState = parseBudgetStateConfig(storedValue);
          if (parsedState.remaining !== null) {
            db.setConfig(ROUTING_BUDGET_REMAINING_KEY, String(parsedState.remaining));
            db.setConfig(LEGACY_BUDGET_REMAINING_KEY, String(parsedState.remaining));
          }
          if (parsedState.threshold !== null) {
            db.setConfig(ROUTING_BUDGET_THRESHOLD_KEY, String(parsedState.threshold));
            db.setConfig(LEGACY_BUDGET_THRESHOLD_KEY, String(parsedState.threshold));
          }
        } else if (key === ROUTING_BUDGET_REMAINING_KEY) {
          const parsedValue = parseBudgetNumber(value);
          if (parsedValue !== null) {
            const updated = mergeBudgetState(db.getConfig(ROUTING_BUDGET_STATE_KEY), { remaining: parsedValue });
            db.setConfig(ROUTING_BUDGET_STATE_KEY, JSON.stringify(updated));
            db.setConfig(LEGACY_BUDGET_REMAINING_KEY, String(parsedValue));
          }
        } else if (key === ROUTING_BUDGET_THRESHOLD_KEY) {
          const parsedValue = parseBudgetNumber(value);
          if (parsedValue !== null) {
            const updated = mergeBudgetState(db.getConfig(ROUTING_BUDGET_STATE_KEY), { threshold: parsedValue });
            db.setConfig(ROUTING_BUDGET_STATE_KEY, JSON.stringify(updated));
            db.setConfig(LEGACY_BUDGET_THRESHOLD_KEY, String(parsedValue));
          }
        }

        db.log('coordinator', 'config_set', { key, value: storedValue });
        respond(conn, { ok: true, key, value: storedValue });
        break;
      }
      case 'loop-prompt': {
        const promptLoop = db.getLoop(args.loop_id);
        if (!promptLoop) {
          respond(conn, { ok: false, error: 'Loop not found' });
          break;
        }
        respond(conn, {
          ok: true,
          loop_id: promptLoop.id,
          prompt: promptLoop.prompt,
          status: promptLoop.status,
          last_checkpoint: promptLoop.last_checkpoint,
          iteration_count: promptLoop.iteration_count,
        });
        break;
      }
      case 'loop-request': {
        const lrLoop = db.getLoop(args.loop_id);
        if (!lrLoop) {
          respond(conn, { ok: false, error: 'Loop not found' });
          break;
        }
        if (lrLoop.status !== 'active') {
          respond(conn, { ok: false, error: `Loop is ${lrLoop.status}, not active` });
          break;
        }
        const lrResult = db.createLoopRequest(args.description, args.loop_id);
        if (!lrResult.deduplicated) bridgeToHandoff(lrResult.id, args.description);
        respond(conn, {
          ok: true,
          request_id: lrResult.id,
          deduplicated: lrResult.deduplicated,
          superseded_target: lrResult.superseded_target || null,
        });
        break;
      }
      case 'loop-requests': {
        const lrqLoop = db.getLoop(args.loop_id);
        if (!lrqLoop) {
          respond(conn, { ok: false, error: 'Loop not found' });
          break;
        }
        const loopReqs = db.listLoopRequests(args.loop_id);
        respond(conn, { ok: true, requests: loopReqs });
        break;
      }

      default:
        respond(conn, { error: `Unknown command: ${command}` });
    }
  } catch (e) {
    respond(conn, { error: e.message });
  }
}

module.exports = { start, stop, getSocketPath };
