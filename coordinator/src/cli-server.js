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

function getExplicitConfigValue(getConfig, key) {
  if (typeof getConfig !== 'function') return null;
  const value = getConfig(key);
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

const SPARK_MODEL_KEYS = Object.freeze(['model_codex_spark', 'model_spark']);

function getExplicitSparkModelSelection(getConfig) {
  for (const key of SPARK_MODEL_KEYS) {
    const value = getExplicitConfigValue(getConfig, key);
    if (value) return { key, value };
  }
  return { key: null, value: null };
}

function getSparkModelConfigValue(getConfig, fallback) {
  return getExplicitSparkModelSelection(getConfig).value || fallback;
}

function getFallbackDefaultModel(getConfig, routingClass) {
  const sparkModel = getSparkModelConfigValue(getConfig, 'gpt-5.3-codex-spark');
  if (routingClass === 'spark') return sparkModel;
  if (routingClass === 'mini') return getConfigValue(getConfig, 'model_mini', sparkModel);
  return getConfigValue(getConfig, 'model_flagship', 'gpt-5.3-codex');
}

function parseTaskMetadataValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectTaskMetadataSignals(value, signals = []) {
  if (value === null || value === undefined) return signals;
  if (Array.isArray(value)) {
    for (const item of value) collectTaskMetadataSignals(item, signals);
    return signals;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      if (key) signals.push(String(key));
      collectTaskMetadataSignals(nested, signals);
    }
    return signals;
  }
  const normalized = String(value).trim();
  if (normalized) signals.push(normalized);
  return signals;
}

function normalizeTaskFiles(filesValue) {
  const parsed = parseTaskMetadataValue(filesValue);
  if (Array.isArray(parsed)) {
    return parsed
      .map((file) => String(file).trim())
      .filter(Boolean)
      .map((file) => file.replace(/\\/g, '/').toLowerCase());
  }
  if (typeof parsed === 'string') {
    const normalized = parsed.trim();
    return normalized ? [normalized.replace(/\\/g, '/').toLowerCase()] : [];
  }
  return [];
}

function hasCodeHeavyMetadataSignals(task) {
  const domain = String(task && task.domain || '').trim().toLowerCase();
  const files = normalizeTaskFiles(task && task.files);
  const parsedValidation = parseTaskMetadataValue(task && task.validation);
  const validationSignals = collectTaskMetadataSignals(parsedValidation).join(' ').toLowerCase();
  const hasDocsOnlyFiles = files.length > 0 && files.every((file) => /\.(md|mdx|txt|rst|adoc)$/i.test(file));
  if (hasDocsOnlyFiles) return false;

  const hasCodeFileSignal = files.some((file) => (
    /\.(c|cc|cpp|cs|go|java|js|jsx|mjs|cjs|ts|tsx|py|rb|php|rs|swift|kt|kts|scala|sh|ps1|sql|yaml|yml|toml|json)$/i.test(file)
    || /(^|\/)(src|lib|app|server|coordinator|tests?|spec)\//i.test(file)
  ));
  const hasCodeDomainSignal = Boolean(domain) && !/(^|[-_])(docs?|documentation|content)([-_]|$)/i.test(domain);
  const hasNonTrivialValidationSignal = (
    /(tier[\s_-]*2|tier[\s_-]*3|build-validator|verify-app|npm\s+test|node\s+--test|jest|vitest|mocha|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test)/i
  ).test(validationSignals);

  if (hasCodeFileSignal && (hasCodeDomainSignal || hasNonTrivialValidationSignal)) return true;
  if (!hasCodeFileSignal && hasCodeDomainSignal && hasNonTrivialValidationSignal) return true;
  return false;
}

function hasKeywordToken(value, keywords) {
  const tokens = String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((token) => keywords.has(token));
}

function resolveFallbackRoutingClass(task) {
  const tier = Number(task && task.tier) || 0;
  const priority = String(task && task.priority || '').toLowerCase();
  const subject = String(task && task.subject || '').toLowerCase();
  const description = String(task && task.description || '').toLowerCase();
  const mergeConflictKeywords = new Set(['merge', 'conflict']);
  const refactorKeywords = new Set(['refactor']);
  const typoKeywords = new Set(['typo']);
  const hasMergeOrConflictSignal = (
    hasKeywordToken(subject, mergeConflictKeywords)
    || hasKeywordToken(description, mergeConflictKeywords)
  );
  const hasRefactorSignal = (
    hasKeywordToken(subject, refactorKeywords)
    || hasKeywordToken(description, refactorKeywords)
  );
  const hasDocsSignal = subject.includes('docs') || description.includes('docs');
  const hasTypoSignal = (
    hasKeywordToken(subject, typoKeywords)
    || hasKeywordToken(description, typoKeywords)
  );
  const hasCodeHeavyMetadataSignal = hasCodeHeavyMetadataSignals(task);
  if (tier >= 4) return 'xhigh';
  if (tier >= 3) return 'high';
  if (priority === 'urgent') return 'xhigh';
  if (priority === 'high') return 'high';
  if (hasMergeOrConflictSignal || hasRefactorSignal) return 'mid';
  if (priority === 'low' && (hasDocsSignal || hasTypoSignal)) return 'mini';
  if (hasCodeHeavyMetadataSignal) return 'mid';
  return 'spark';
}

const FALLBACK_ROUTING_SCALE = Object.freeze(['mini', 'spark', 'mid', 'high', 'xhigh']);
const FALLBACK_REASONING_DEFAULTS = Object.freeze({
  xhigh: 'high',
  high: 'high',
  mid: 'low',
  spark: 'low',
  mini: 'low',
});

function resolveFallbackEffectiveClass(routingClass, { budgetConstrained, budgetHealthy }) {
  if (budgetConstrained) {
    if (routingClass === 'high') return 'mini';
    if (routingClass === 'mid') return 'spark';
  }
  if (budgetHealthy && routingClass === 'high') return 'xhigh';
  return routingClass;
}

function getFallbackRoutingShift(routingClass, effectiveClass) {
  if (routingClass === effectiveClass) return 'none';
  const routingIndex = FALLBACK_ROUTING_SCALE.indexOf(routingClass);
  const effectiveIndex = FALLBACK_ROUTING_SCALE.indexOf(effectiveClass);
  if (routingIndex < 0 || effectiveIndex < 0) return 'none';
  return effectiveIndex > routingIndex ? 'upscale' : 'downscale';
}

function getFallbackReasoningEffort(getConfig, effectiveClass) {
  const defaultEffort = FALLBACK_REASONING_DEFAULTS[effectiveClass] || 'low';
  return getConfigValue(getConfig, `reasoning_${effectiveClass}`, defaultEffort);
}

function parseBudgetScalarFallback(getConfig) {
  if (typeof getConfig !== 'function') {
    return { parsed: null, remaining: null, threshold: null };
  }
  const routingRemaining = parseBudgetNumber(getConfig(ROUTING_BUDGET_REMAINING_KEY));
  const routingThreshold = parseBudgetNumber(getConfig(ROUTING_BUDGET_THRESHOLD_KEY));
  const remaining = routingRemaining !== null
    ? routingRemaining
    : parseBudgetNumber(getConfig(LEGACY_BUDGET_REMAINING_KEY));
  const threshold = routingThreshold !== null
    ? routingThreshold
    : parseBudgetNumber(getConfig(LEGACY_BUDGET_THRESHOLD_KEY));
  if (remaining === null && threshold === null) {
    return { parsed: null, remaining: null, threshold: null };
  }
  const parsed = { flagship: {} };
  if (remaining !== null) parsed.flagship.remaining = remaining;
  if (threshold !== null) parsed.flagship.threshold = threshold;
  return { parsed, remaining, threshold };
}

function fallbackModelRouter() {
  const fallbackStateSource = 'coordinator-fallback-model-router';
  return {
    getBudgetState(getConfig) {
      const rawState = parseBudgetStateConfig(
        typeof getConfig === 'function' ? getConfig(ROUTING_BUDGET_STATE_KEY) : null,
        getConfig
      );
      const parsedState = isPlainObject(rawState.parsed) ? rawState.parsed : null;
      if (!parsedState) return null;
      return {
        source: fallbackStateSource,
        parsed: parsedState,
        remaining: rawState.remaining,
        threshold: rawState.threshold,
      };
    },
    routeTask(task = {}, opts = {}) {
      const getConfig = opts.getConfig;
      const routingClass = resolveFallbackRoutingClass(task);
      const budget = this.getBudgetState(getConfig);
      const parsedState = budget && isPlainObject(budget.parsed) ? budget.parsed : null;
      const flagshipState = parsedState && isPlainObject(parsedState.flagship)
        ? parsedState.flagship
        : null;
      const remaining = parseBudgetNumber(flagshipState ? flagshipState.remaining : budget && budget.remaining);
      const threshold = parseBudgetNumber(flagshipState ? flagshipState.threshold : budget && budget.threshold);
      const hasBudgetSignal = remaining !== null && threshold !== null;
      const budgetConstrained = hasBudgetSignal && remaining <= threshold;
      const budgetHealthy = hasBudgetSignal && remaining > threshold;

      const effectiveClass = resolveFallbackEffectiveClass(routingClass, { budgetConstrained, budgetHealthy });
      const routingShift = getFallbackRoutingShift(routingClass, effectiveClass);

      const defaultModel = getFallbackDefaultModel(getConfig, effectiveClass);
      const explicitSparkModelSelection = effectiveClass === 'spark'
        ? getExplicitSparkModelSelection(getConfig)
        : null;
      const explicitModelOverride = effectiveClass === 'spark'
        ? explicitSparkModelSelection.value
        : getExplicitConfigValue(getConfig, `model_${effectiveClass}`);
      const configuredModel = explicitModelOverride || defaultModel;
      const routingReason = routingShift === 'downscale'
        ? `fallback-budget-downgrade:${routingClass}->${effectiveClass}`
        : routingShift === 'upscale'
          ? `fallback-budget-upgrade:${routingClass}->${effectiveClass}`
          : 'fallback-routing:class-default';
      const downgradeModelSourceKey = effectiveClass === 'spark'
        ? (explicitSparkModelSelection && explicitSparkModelSelection.key
          ? explicitSparkModelSelection.key
          : 'model_spark')
        : `model_${effectiveClass}`;
      const modelSource = routingShift === 'downscale'
        ? `budget-downgrade:${downgradeModelSourceKey}`
        : routingShift === 'upscale'
          ? `budget-upgrade:model_${effectiveClass}`
          : explicitModelOverride
            ? 'config-fallback'
            : 'fallback-default';
      return {
        routing_class: routingClass,
        model: configuredModel,
        model_source: modelSource,
        reasoning_effort: getFallbackReasoningEffort(getConfig, effectiveClass),
        routing_reason: routingReason,
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
const PR_REFERENCE_RE = /^(pull request|pull|pr)\s*#?(\d+)$/i;
const WORKER_BRANCH_RE = /^agent-\d+$/;
const ROUTING_BUDGET_STATE_KEY = 'routing_budget_state';
const ROUTING_BUDGET_REMAINING_KEY = 'routing_budget_flagship_remaining';
const ROUTING_BUDGET_THRESHOLD_KEY = 'routing_budget_flagship_threshold';
const LEGACY_BUDGET_REMAINING_KEY = 'flagship_budget_remaining';
const LEGACY_BUDGET_THRESHOLD_KEY = 'flagship_budget_threshold';
const ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP = Object.freeze({
  [ROUTING_BUDGET_REMAINING_KEY]: LEGACY_BUDGET_REMAINING_KEY,
  [ROUTING_BUDGET_THRESHOLD_KEY]: LEGACY_BUDGET_THRESHOLD_KEY,
});
const LOOP_REQUEST_SET_CONFIG_SPECS = Object.freeze({
  loop_request_quality_gate: Object.freeze({ type: 'boolean' }),
  loop_request_min_description_chars: Object.freeze({ type: 'int', min: 80, max: 5000 }),
  loop_request_min_interval_sec: Object.freeze({ type: 'int', min: 0, max: 86400 }),
  loop_request_max_per_hour: Object.freeze({ type: 'int', min: 1, max: 1000 }),
  loop_request_similarity_threshold: Object.freeze({ type: 'float', min: 0.5, max: 0.99 }),
});
const PR_RESOLVE_ERROR_RE = /Could not resolve to a PullRequest/i;

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
    // Record queueing in coordinator activity log; request creation already emits architect new_request mail.
    db.log('coordinator', 'request_queued', { request_id: requestId });
  } catch (e) {
    // Non-fatal — log but don't crash coordinator
    console.error('[coordinator] handoff bridge error:', e.message);
  }
}

const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1MB
const INBOX_RECIPIENT_ALIASES = Object.freeze({
  'master-3': 'allocator',
});

function normalizeInboxRecipient(recipient) {
  if (typeof recipient !== 'string') return recipient;
  return INBOX_RECIPIENT_ALIASES[recipient] || recipient;
}

function extractInboxMailFilters(args = {}) {
  const filters = {};
  if (typeof args.type === 'string') filters.type = args.type;
  if (typeof args.request_id === 'string') filters.request_id = args.request_id;
  return filters;
}

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
  'complete-task':     { required: ['worker_id', 'task_id'], types: { worker_id: 'string', usage: 'object' } },
  'fail-task':         { required: ['worker_id', 'task_id', 'error'], types: { worker_id: 'string', error: 'string', usage: 'object' } },
  'browser-create-session': {
    required: ['task_id', 'workflow_url', 'idempotency_key'],
    types: { task_id: 'number', workflow_url: 'string', idempotency_key: 'string', channel: 'string' },
  },
  'browser-attach-session': {
    required: ['task_id', 'session_id', 'idempotency_key'],
    types: { task_id: 'number', session_id: 'string', idempotency_key: 'string', channel: 'string' },
  },
  'browser-start-job': {
    required: ['task_id', 'session_id', 'workflow_url', 'guidance', 'idempotency_key'],
    types: {
      task_id: 'number',
      session_id: 'string',
      workflow_url: 'string',
      guidance: 'string',
      idempotency_key: 'string',
    },
  },
  'browser-callback-chunk': {
    required: ['task_id', 'session_id', 'job_id', 'callback_token', 'idempotency_key', 'chunk_index', 'chunk'],
    types: {
      task_id: 'number',
      session_id: 'string',
      job_id: 'string',
      callback_token: 'string',
      idempotency_key: 'string',
      chunk_index: 'number',
      chunk: 'string',
    },
  },
  'browser-complete-job': {
    required: ['task_id', 'session_id', 'job_id', 'callback_token', 'idempotency_key'],
    types: {
      task_id: 'number',
      session_id: 'string',
      job_id: 'string',
      callback_token: 'string',
      idempotency_key: 'string',
    },
  },
  'browser-fail-job': {
    required: ['task_id', 'session_id', 'job_id', 'callback_token', 'idempotency_key', 'error'],
    types: {
      task_id: 'number',
      session_id: 'string',
      job_id: 'string',
      callback_token: 'string',
      idempotency_key: 'string',
      error: 'string',
    },
  },
  'browser-job-status': {
    required: ['task_id', 'session_id', 'job_id'],
    types: { task_id: 'number', session_id: 'string', job_id: 'string' },
  },
  'distill':           { required: ['worker_id'], types: { worker_id: 'string' } },
  'inbox':             { required: ['recipient'], types: { recipient: 'string', peek: 'boolean', type: 'string', request_id: 'string' } },
  'inbox-block':       { required: ['recipient'], types: { recipient: 'string', timeout: 'number', peek: 'boolean', type: 'string', request_id: 'string' } },
  'ready-tasks':       { required: [], types: {} },
  'assign-task':       { required: ['task_id', 'worker_id'], types: { task_id: 'number', worker_id: 'number' } },
  'claim-worker':      { required: ['worker_id', 'claimer'], types: { worker_id: 'number', claimer: 'string' } },
  'release-worker':    { required: ['worker_id'], types: { worker_id: 'number' } },
  'worker-status':     { required: [], types: {} },
  'check-completion':  { required: ['request_id'], types: { request_id: 'string' } },
  'replan-dependency': { required: ['from_task_id', 'to_task_id'], types: { from_task_id: 'number', to_task_id: 'number', request_id: 'string' } },
  'register-worker':   { required: ['worker_id'], types: { worker_id: 'string', worktree_path: 'string', branch: 'string' } },
  'repair':            { required: [], types: {} },
  'purge-tasks':       { required: [], types: { status: 'string' } },
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
  'loop-refresh-prompt': { required: ['loop_id', 'prompt'], types: { loop_id: 'number', prompt: 'string' } },
  'loop-set-prompt':   { required: ['loop_id', 'prompt'], types: { loop_id: 'number', prompt: 'string' } },
  'loop-request':      { required: ['loop_id', 'description'], types: { loop_id: 'number', description: 'string' } },
  'loop-requests':     { required: ['loop_id'], types: { loop_id: 'number' } },
  'queue-research':      {
    required: ['topic', 'question'],
    types: { topic: 'string', question: 'string', mode: 'string', priority: 'string', context: 'string', source_agent: 'string', source_task_id: 'number' },
  },
  'research-status':     { required: [], types: { topic: 'string', status: 'string', limit: 'number' } },
  'research-requeue-stale': { required: [], types: { max_age_minutes: 'number' } },
  'research-start':      { required: ['id'], types: { id: 'number' } },
  'research-complete':   { required: ['intent_id'], types: { intent_id: 'number', note_path: 'string' } },
  'research-fail':       { required: ['intent_id'], types: { intent_id: 'number', error: 'string' } },
  'research-next':       { required: [], types: {} },
  'research-gaps':       { required: [], types: {} },
  'memory-snapshots': {
    required: [],
    types: {
      project_context_key: 'string',
      request_id: 'string',
      task_id: 'number',
      run_id: 'string',
      validation_status: 'string',
      min_relevance_score: 'number',
      limit: 'number',
      offset: 'number',
    },
  },
  'memory-snapshot': {
    required: ['id'],
    types: { id: 'number', include_lineage: 'boolean' },
  },
  'memory-insights': {
    required: [],
    types: {
      project_context_key: 'string',
      snapshot_id: 'number',
      artifact_type: 'string',
      request_id: 'string',
      task_id: 'number',
      run_id: 'string',
      validation_status: 'string',
      min_relevance_score: 'number',
      limit: 'number',
      offset: 'number',
    },
  },
  'memory-insight': {
    required: ['id'],
    types: { id: 'number', include_lineage: 'boolean' },
  },
  'memory-lineage': {
    required: [],
    types: {
      snapshot_id: 'number',
      insight_artifact_id: 'number',
      request_id: 'string',
      task_id: 'number',
      run_id: 'string',
      lineage_type: 'string',
      limit: 'number',
      offset: 'number',
    },
  },
};

const COMPLETE_TASK_USAGE_FIELD_TYPES = Object.freeze({
  model: 'string',
  input_tokens: 'number',
  output_tokens: 'number',
  input_audio_tokens: 'number',
  output_audio_tokens: 'number',
  reasoning_tokens: 'number',
  accepted_prediction_tokens: 'number',
  rejected_prediction_tokens: 'number',
  cached_tokens: 'number',
  cache_creation_tokens: 'number',
  ephemeral_5m_input_tokens: 'number',
  ephemeral_1h_input_tokens: 'number',
  total_tokens: 'number',
  cost_usd: 'number',
});
const COMPLETE_TASK_USAGE_FIELD_ALIASES = Object.freeze({
  prompt_tokens: 'input_tokens',
  completion_tokens: 'output_tokens',
  cache_creation_input_tokens: 'cache_creation_tokens',
  cache_read_input_tokens: 'cached_tokens',
});
const COMPLETE_TASK_USAGE_CACHE_CREATION_OBJECT_ALIASES = Object.freeze([
  'ephemeral_5m_input_tokens',
  'ephemeral_1h_input_tokens',
]);
const COMPLETE_TASK_USAGE_DETAIL_ALIASES = Object.freeze({
  input_tokens_details: Object.freeze([
    { canonicalField: 'cached_tokens', detailField: 'cached_tokens' },
    { canonicalField: 'input_audio_tokens', detailField: 'audio_tokens' },
  ]),
  prompt_tokens_details: Object.freeze([
    { canonicalField: 'cached_tokens', detailField: 'cached_tokens' },
    { canonicalField: 'input_audio_tokens', detailField: 'audio_tokens' },
  ]),
  completion_tokens_details: Object.freeze([
    { canonicalField: 'reasoning_tokens', detailField: 'reasoning_tokens' },
    { canonicalField: 'output_audio_tokens', detailField: 'audio_tokens' },
    { canonicalField: 'accepted_prediction_tokens', detailField: 'accepted_prediction_tokens' },
    { canonicalField: 'rejected_prediction_tokens', detailField: 'rejected_prediction_tokens' },
  ]),
  output_tokens_details: Object.freeze([
    { canonicalField: 'reasoning_tokens', detailField: 'reasoning_tokens' },
    { canonicalField: 'output_audio_tokens', detailField: 'audio_tokens' },
  ]),
});

const COMPLETE_TASK_USAGE_COLUMN_MAP = Object.freeze({
  model: 'usage_model',
  input_tokens: 'usage_input_tokens',
  output_tokens: 'usage_output_tokens',
  input_audio_tokens: 'usage_input_audio_tokens',
  output_audio_tokens: 'usage_output_audio_tokens',
  reasoning_tokens: 'usage_reasoning_tokens',
  accepted_prediction_tokens: 'usage_accepted_prediction_tokens',
  rejected_prediction_tokens: 'usage_rejected_prediction_tokens',
  cached_tokens: 'usage_cached_tokens',
  cache_creation_tokens: 'usage_cache_creation_tokens',
  ephemeral_5m_input_tokens: 'usage_cache_creation_ephemeral_5m_input_tokens',
  ephemeral_1h_input_tokens: 'usage_cache_creation_ephemeral_1h_input_tokens',
  total_tokens: 'usage_total_tokens',
  cost_usd: 'usage_cost_usd',
});

function parseBudgetNumber(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeBudgetStateWithScalarFallback(parsedState, scalarState) {
  if (!isPlainObject(parsedState)) return parsedState;
  if (!scalarState || (scalarState.remaining === null && scalarState.threshold === null)) {
    return parsedState;
  }
  const mergedState = { ...parsedState };
  if (isPlainObject(parsedState.flagship)) {
    mergedState.flagship = { ...parsedState.flagship };
  }
  const flagship = isPlainObject(mergedState.flagship) ? mergedState.flagship : mergedState;
  if (parseBudgetNumber(flagship.remaining) === null && scalarState.remaining !== null) {
    flagship.remaining = scalarState.remaining;
  }
  if (parseBudgetNumber(flagship.threshold) === null && scalarState.threshold !== null) {
    flagship.threshold = scalarState.threshold;
  }
  return mergedState;
}

function parseBudgetStateConfig(raw, getConfig = null) {
  let parsed = null;
  if (raw !== undefined && raw !== null) {
    if (typeof raw === 'object') {
      parsed = isPlainObject(raw) ? raw : null;
    } else {
      const trimmed = String(raw).trim();
      if (trimmed) {
        try {
          const jsonParsed = JSON.parse(trimmed);
          parsed = isPlainObject(jsonParsed) ? jsonParsed : null;
        } catch {
          parsed = null;
        }
      }
    }
  }

  const scalarState = typeof getConfig === 'function' ? parseBudgetScalarFallback(getConfig) : null;
  if (isPlainObject(parsed)) {
    const mergedParsed = mergeBudgetStateWithScalarFallback(parsed, scalarState);
    const flagship = isPlainObject(mergedParsed.flagship) ? mergedParsed.flagship : mergedParsed;
    return {
      parsed: mergedParsed,
      remaining: parseBudgetNumber(flagship.remaining),
      threshold: parseBudgetNumber(flagship.threshold),
    };
  }
  if (scalarState && isPlainObject(scalarState.parsed)) {
    return {
      parsed: scalarState.parsed,
      remaining: scalarState.remaining,
      threshold: scalarState.threshold,
    };
  }
  return { parsed: null, remaining: null, threshold: null };
}

function syncBudgetStateFromScalarFallback(raw, getConfig) {
  const current = parseBudgetStateConfig(raw).parsed;
  const state = isPlainObject(current) ? { ...current } : {};
  const flagship = isPlainObject(state.flagship) ? { ...state.flagship } : {};
  const scalarState = parseBudgetScalarFallback(getConfig);
  if (scalarState.remaining !== null) {
    flagship.remaining = scalarState.remaining;
  } else {
    delete flagship.remaining;
  }
  if (scalarState.threshold !== null) {
    flagship.threshold = scalarState.threshold;
  } else {
    delete flagship.threshold;
  }
  if (Object.keys(flagship).length) {
    state.flagship = flagship;
  } else {
    delete state.flagship;
  }
  return state;
}

function validateCompleteTaskUsageIntegerField(fieldPath, value) {
  if (typeof value !== 'number') {
    throw new Error(`Field "${fieldPath}" must be of type number`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`Field "${fieldPath}" must be a finite number`);
  }
  if (value < 0) {
    throw new Error(`Field "${fieldPath}" must be >= 0`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`Field "${fieldPath}" must be an integer`);
  }
}

function normalizeLoopRequestSetConfigValue(key, rawValue) {
  const spec = LOOP_REQUEST_SET_CONFIG_SPECS[key];
  if (!spec) return { ok: true, value: String(rawValue) };

  const trimmed = String(rawValue).trim();
  if (!trimmed) {
    return { ok: false, error: `Invalid value for '${key}': value cannot be blank` };
  }

  if (spec.type === 'boolean') {
    const lowered = trimmed.toLowerCase();
    if (lowered !== 'true' && lowered !== 'false') {
      return { ok: false, error: `Invalid value for '${key}': expected true or false` };
    }
    return { ok: true, value: lowered };
  }

  if (spec.type === 'int') {
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: `Invalid value for '${key}': expected integer between ${spec.min} and ${spec.max}`,
      };
    }
    if (parsed < spec.min || parsed > spec.max) {
      return {
        ok: false,
        error: `Invalid value for '${key}': expected integer between ${spec.min} and ${spec.max}, received ${parsed}`,
      };
    }
    return { ok: true, value: String(parsed) };
  }

  if (spec.type === 'float') {
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      return {
        ok: false,
        error: `Invalid value for '${key}': expected number between ${spec.min} and ${spec.max}`,
      };
    }
    if (parsed < spec.min || parsed > spec.max) {
      return {
        ok: false,
        error: `Invalid value for '${key}': expected number between ${spec.min} and ${spec.max}, received ${parsed}`,
      };
    }
    return { ok: true, value: String(parsed) };
  }

  return { ok: true, value: String(rawValue) };
}

function normalizeCompleteTaskUsageAliasEntries(rawUsage) {
  const aliasNormalized = {};
  const unknownFields = {};
  for (const [rawField, rawValue] of Object.entries(rawUsage)) {
    if (rawField === 'cache_creation') {
      if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
        throw new Error('Field "usage.cache_creation" must be an object');
      }
      const passthroughNestedFields = {};
      for (const [nestedField, nestedValue] of Object.entries(rawValue)) {
        if (!COMPLETE_TASK_USAGE_CACHE_CREATION_OBJECT_ALIASES.includes(nestedField)) {
          passthroughNestedFields[nestedField] = nestedValue;
        }
      }
      const cacheCreationEntries = [];
      let cacheCreationTokens = 0;
      for (const nestedField of COMPLETE_TASK_USAGE_CACHE_CREATION_OBJECT_ALIASES) {
        if (!Object.prototype.hasOwnProperty.call(rawValue, nestedField)) continue;
        const nestedValue = rawValue[nestedField];
        validateCompleteTaskUsageIntegerField(`usage.cache_creation.${nestedField}`, nestedValue);
        cacheCreationTokens += nestedValue;
        cacheCreationEntries.push({
          canonicalField: nestedField,
          canonicalValue: nestedValue,
        });
      }
      if (cacheCreationEntries.length) {
        cacheCreationEntries.push({
          canonicalField: 'cache_creation_tokens',
          canonicalValue: cacheCreationTokens,
        });
        for (const { canonicalField, canonicalValue } of cacheCreationEntries) {
          if (
            Object.prototype.hasOwnProperty.call(aliasNormalized, canonicalField)
            && aliasNormalized[canonicalField] !== canonicalValue
          ) {
            throw new Error(`Field "usage" contains conflicting values for key "${canonicalField}"`);
          }
          aliasNormalized[canonicalField] = canonicalValue;
        }
      }
      if (Object.keys(passthroughNestedFields).length) {
        unknownFields[rawField] = passthroughNestedFields;
      }
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(COMPLETE_TASK_USAGE_DETAIL_ALIASES, rawField)) {
      const detailAliases = COMPLETE_TASK_USAGE_DETAIL_ALIASES[rawField];
      const detailEntries = [];
      const detailAliasFields = new Set(detailAliases.map((detailAlias) => detailAlias.detailField));
      const passthroughNestedFields = {};
      if (rawValue === null) {
        for (const detailAlias of detailAliases) {
          detailEntries.push({ canonicalField: detailAlias.canonicalField, canonicalValue: null });
        }
      } else {
        if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
          throw new Error(`Field "usage.${rawField}" must be an object`);
        }
        for (const [nestedField, nestedValue] of Object.entries(rawValue)) {
          if (!detailAliasFields.has(nestedField)) {
            passthroughNestedFields[nestedField] = nestedValue;
          }
        }
        for (const detailAlias of detailAliases) {
          if (!Object.prototype.hasOwnProperty.call(rawValue, detailAlias.detailField)) {
            continue;
          }
          detailEntries.push({
            canonicalField: detailAlias.canonicalField,
            canonicalValue: rawValue[detailAlias.detailField],
          });
        }
      }
      for (const { canonicalField, canonicalValue } of detailEntries) {
        if (
          Object.prototype.hasOwnProperty.call(aliasNormalized, canonicalField)
          && aliasNormalized[canonicalField] !== canonicalValue
        ) {
          throw new Error(`Field "usage" contains conflicting values for key "${canonicalField}"`);
        }
        aliasNormalized[canonicalField] = canonicalValue;
      }
      if (Object.keys(passthroughNestedFields).length) {
        unknownFields[rawField] = passthroughNestedFields;
      }
      continue;
    }

    const canonicalField = COMPLETE_TASK_USAGE_FIELD_ALIASES[rawField] || rawField;
    const canonicalValue = rawValue;
    if (!Object.prototype.hasOwnProperty.call(COMPLETE_TASK_USAGE_FIELD_TYPES, canonicalField)) {
      unknownFields[canonicalField] = canonicalValue;
      continue;
    }
    if (
      Object.prototype.hasOwnProperty.call(aliasNormalized, canonicalField)
      && aliasNormalized[canonicalField] !== canonicalValue
    ) {
      throw new Error(`Field "usage" contains conflicting values for key "${canonicalField}"`);
    }
    aliasNormalized[canonicalField] = canonicalValue;
  }
  return { aliasNormalized, unknownFields };
}

function normalizeCompleteTaskUsagePayload(rawUsage) {
  if (rawUsage === undefined || rawUsage === null) return null;
  if (!rawUsage || typeof rawUsage !== 'object' || Array.isArray(rawUsage)) {
    throw new Error('Field "usage" must be an object');
  }

  const { aliasNormalized, unknownFields } = normalizeCompleteTaskUsageAliasEntries(rawUsage);

  const normalized = {};
  for (const [field, expectedType] of Object.entries(COMPLETE_TASK_USAGE_FIELD_TYPES)) {
    if (!Object.prototype.hasOwnProperty.call(aliasNormalized, field)) continue;
    const value = aliasNormalized[field];
    if (value === null) {
      normalized[field] = null;
      continue;
    }
    if (typeof value !== expectedType) {
      throw new Error(`Field "usage.${field}" must be of type ${expectedType}`);
    }
    if (expectedType === 'string') {
      const trimmed = value.trim();
      if (!trimmed) throw new Error('Field "usage.model" cannot be empty');
      normalized[field] = trimmed;
      continue;
    }
    if (field !== 'cost_usd') {
      validateCompleteTaskUsageIntegerField(`usage.${field}`, value);
      normalized[field] = value;
      continue;
    }
    if (!Number.isFinite(value)) {
      throw new Error('Field "usage.cost_usd" must be a finite number');
    }
    if (value < 0) {
      throw new Error('Field "usage.cost_usd" must be >= 0');
    }
    normalized[field] = value;
  }

  if (!Object.keys(unknownFields).length) return normalized;
  return { ...normalized, ...unknownFields };
}

function mapUsagePayloadToTaskFields(usage, taskRow = null) {
  const normalizedUsage = normalizeCompleteTaskUsagePayload(usage);
  if (!normalizedUsage || typeof normalizedUsage !== 'object') return {};
  const mapped = {};
  for (const [usageKey, columnName] of Object.entries(COMPLETE_TASK_USAGE_COLUMN_MAP)) {
    if (!Object.prototype.hasOwnProperty.call(normalizedUsage, usageKey)) continue;
    if (taskRow && !Object.prototype.hasOwnProperty.call(taskRow, columnName)) continue;
    mapped[columnName] = normalizedUsage[usageKey];
  }
  if (!taskRow || Object.prototype.hasOwnProperty.call(taskRow, 'usage_payload_json')) {
    mapped.usage_payload_json = JSON.stringify(normalizedUsage);
  }
  return mapped;
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

function backfillSupersededLoopRequestsSafe() {
  if (typeof db.backfillSupersededLoopRequests !== 'function') return { inspected: 0, repaired: 0 };
  return db.backfillSupersededLoopRequests();
}

const SAFE_TASK_DOMAIN_RE = /^[A-Za-z0-9_-]+$/;
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

function utf8ByteLength(value) {
  return Buffer.byteLength(String(value === undefined || value === null ? '' : value), 'utf8');
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer`);
  }
  return parsed;
}

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

function getWorkerActiveAssignment(workerId) {
  if (!workerId) return null;
  return db.getDb().prepare(`
    SELECT id, status
    FROM tasks
    WHERE assigned_to = ?
      AND status IN ('assigned', 'in_progress')
    ORDER BY datetime(updated_at) DESC, id DESC
    LIMIT 1
  `).get(workerId) || null;
}

function isWorkerClaimedAssignmentError(err) {
  if (!err) return false;
  const fields = [
    err.code,
    err.error,
    err.reason,
    err.message,
  ];
  return fields.some((value) => (
    typeof value === 'string'
    && /\bworker[_\s-]?claimed\b/i.test(value.trim())
  ));
}

/** Validate that every element in a depends_on array is a positive integer task ID. */
function validateDependsOnElements(arr) {
  for (const el of arr) {
    if (typeof el !== 'number' || !Number.isInteger(el) || el <= 0) {
      throw new Error(
        `depends_on elements must be positive integers; got ${JSON.stringify(el)}`
      );
    }
  }
}

/** Parse depends_on into an array of task ids. Accepts arrays or JSON-array strings. */
function parseDependsOnField(dependsOn) {
  if (dependsOn === null || dependsOn === undefined) return null;
  if (Array.isArray(dependsOn)) {
    validateDependsOnElements(dependsOn);
    return dependsOn;
  }
  if (typeof dependsOn === 'string') {
    try {
      const parsed = JSON.parse(dependsOn);
      if (!Array.isArray(parsed)) {
        throw new Error('depends_on JSON must be an array');
      }
      validateDependsOnElements(parsed);
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

function createUnknownSourceRevision() {
  return {
    current_branch: null,
    head_commit: null,
    origin_main_commit: null,
    ahead_count: null,
    behind_count: null,
    dirty_worktree: null,
  };
}

function runGitCommand(args, cwd) {
  try {
    const output = execFileSync('git', args, {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output || '').trim();
  } catch {
    return null;
  }
}

function parseGitCount(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function getSourceRevision(cwd = _projectDir || process.cwd()) {
  const sourceRevision = createUnknownSourceRevision();
  const currentBranch = runGitCommand(['branch', '--show-current'], cwd);
  if (currentBranch) sourceRevision.current_branch = sanitizeBranchName(currentBranch) || currentBranch;

  const headCommit = runGitCommand(['rev-parse', 'HEAD'], cwd);
  if (headCommit) sourceRevision.head_commit = headCommit;

  const originMainCommit = runGitCommand(['rev-parse', 'origin/main'], cwd);
  if (originMainCommit) sourceRevision.origin_main_commit = originMainCommit;

  const revisionCounts = runGitCommand(['rev-list', '--left-right', '--count', 'HEAD...origin/main'], cwd);
  if (revisionCounts) {
    const [aheadRaw, behindRaw] = revisionCounts.split(/\s+/).filter(Boolean);
    sourceRevision.ahead_count = parseGitCount(aheadRaw);
    sourceRevision.behind_count = parseGitCount(behindRaw);
  }

  const statusPorcelain = runGitCommand(['status', '--porcelain'], cwd);
  if (statusPorcelain !== null) sourceRevision.dirty_worktree = statusPorcelain.length > 0;

  return sourceRevision;
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

function extractPrNumber(rawPrUrl) {
  if (typeof rawPrUrl !== 'string') return '';
  const trimmed = rawPrUrl.trim();
  if (!trimmed) return '';
  const match = trimmed.match(PR_NUMBER_RE);
  if (match) return match[1];
  const refMatch = trimmed.match(PR_REFERENCE_RE);
  if (refMatch) return refMatch[2];
  return '';
}

function normalizePrUrl(rawPrUrl, cwd = _projectDir || process.cwd()) {
  if (typeof rawPrUrl !== 'string') return '';
  const trimmed = rawPrUrl.trim();
  if (!trimmed) return '';
  if (PR_URL_RE.test(trimmed)) return trimmed;

  const normalizedMatch = extractPrNumber(trimmed);
  if (!normalizedMatch) return trimmed;

  const repoPath = getProjectGitHubRepoPath(cwd);
  if (!repoPath) return trimmed;
  return `https://github.com/${repoPath}/pull/${normalizedMatch}`;
}

function isValidGitHubPrUrl(value) {
  return typeof value === 'string' && PR_URL_RE.test(value);
}

function isResolvableGitHubPrUrl(prUrl, cwd = _projectDir || process.cwd()) {
  if (!isValidGitHubPrUrl(prUrl)) return false;
  try {
    execFileSync('gh', ['pr', 'view', prUrl, '--json', 'state'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      timeout: 12000,
    });
    return true;
  } catch (e) {
    const errorText = String(e.message || '') + String(e.stderr || '') + String(e.stdout || '');
    if (PR_RESOLVE_ERROR_RE.test(errorText)) return false;
    return true;
  }
}

function findOpenPrUrlForBranch(rawBranch, cwd = _projectDir || process.cwd()) {
  const branch = sanitizeBranchName(rawBranch);
  if (!branch) return '';
  try {
    const prUrl = execFileSync('gh', ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'url', '--jq', '.[0].url'], {
      encoding: 'utf8',
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 12000,
    }).trim();
    if (!isValidGitHubPrUrl(prUrl)) return '';
    return prUrl;
  } catch {
    return '';
  }
}

function resolveQueuePrTarget(prUrl, branch, cwd = _projectDir || process.cwd()) {
  const normalizedPrUrl = normalizePrUrl(prUrl, cwd);
  if (isValidGitHubPrUrl(normalizedPrUrl) && isResolvableGitHubPrUrl(normalizedPrUrl, cwd)) {
    const original = typeof prUrl === 'string' ? prUrl.trim() : '';
    return {
      pr_url: normalizedPrUrl,
      source: normalizedPrUrl === original ? 'provided' : 'normalized',
      resolvable: true,
    };
  }

  const branchPrUrl = findOpenPrUrlForBranch(branch, cwd);
  if (branchPrUrl) {
    return {
      pr_url: branchPrUrl,
      source: 'branch_fallback',
      resolvable: true,
    };
  }

  return {
    pr_url: normalizedPrUrl,
    source: 'unresolved',
    resolvable: false,
  };
}

function parseWorkerId(rawWorkerId) {
  const parsed = parseInt(rawWorkerId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseTaskId(rawTaskId) {
  const parsed = parseInt(rawTaskId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function getRequestReopenState(requestId) {
  if (requestId === undefined || requestId === null) {
    return { status: 'in_progress', merge_queue_entries: 0 };
  }
  const row = db.getDb().prepare(
    'SELECT COUNT(*) as count FROM merge_queue WHERE request_id = ?'
  ).get(requestId);
  const mergeQueueEntries = Number(row && row.count) || 0;
  return {
    status: mergeQueueEntries > 0 ? 'integrating' : 'in_progress',
    merge_queue_entries: mergeQueueEntries,
  };
}

function reopenFailedRequestForActiveRemediation({ requestId, taskId = null, workerId = null, trigger = 'unknown' }) {
  if (!requestId) return null;
  const request = db.getRequest(requestId);
  if (!request || request.status !== 'failed') return null;

  const reopen = getRequestReopenState(requestId);
  db.updateRequest(requestId, { status: reopen.status });
  db.log('coordinator', 'request_reopened_for_active_remediation', {
    request_id: requestId,
    task_id: taskId,
    worker_id: workerId,
    trigger,
    previous_status: request.status,
    reopened_status: reopen.status,
    merge_queue_entries: reopen.merge_queue_entries,
  });
  return reopen;
}

function validateWorkerTaskOwnership(command, rawWorkerId, rawTaskId, options = {}) {
  const { logic = 'and', softFail = false } = options;
  const worker = db.getWorker(rawWorkerId);
  const task = db.getTask(rawTaskId);
  const parsedWorkerId = parseWorkerId(rawWorkerId);
  const parsedTaskId = parseTaskId(rawTaskId);

  let reason = null;
  if (!worker) {
    reason = 'worker_not_found';
  } else if (!task) {
    reason = 'task_not_found';
  } else {
    const parsedAssignedWorkerId = parseWorkerId(task.assigned_to);
    const parsedCurrentTaskId = parseTaskId(worker.current_task_id);
    if (logic === 'or') {
      // OR logic: ownership is valid if EITHER task.assigned_to matches worker_id
      // OR worker.current_task_id matches task_id. Both must fail to be a mismatch.
      const assignmentMatch = parsedWorkerId !== null && parsedAssignedWorkerId !== null && parsedAssignedWorkerId === parsedWorkerId;
      const currentTaskMatch = parsedTaskId !== null && parsedCurrentTaskId !== null && parsedCurrentTaskId === parsedTaskId;
      if (!assignmentMatch && !currentTaskMatch) {
        reason = parsedAssignedWorkerId !== parsedWorkerId ? 'task_assignment_mismatch' : 'worker_current_task_mismatch';
      }
    } else {
      // AND logic (default): both checks must pass
      if (parsedWorkerId === null || parsedAssignedWorkerId === null || parsedAssignedWorkerId !== parsedWorkerId) {
        reason = 'task_assignment_mismatch';
      } else if (parsedTaskId === null || parsedCurrentTaskId === null || parsedCurrentTaskId !== parsedTaskId) {
        reason = 'worker_current_task_mismatch';
      }
    }
  }

  if (reason) {
    db.log('coordinator', 'ownership_mismatch', {
      command,
      worker_id: rawWorkerId || null,
      task_id: rawTaskId || null,
      reason,
      task_assigned_to: task ? task.assigned_to : null,
      worker_current_task_id: worker ? worker.current_task_id : null,
    });
    const response = softFail
      ? { ok: true, skipped: true, reason }
      : { ok: false, error: 'ownership_mismatch', reason };
    return {
      ok: false,
      response,
      worker: null,
      task: null,
    };
  }

  return {
    ok: true,
    worker,
    task,
    worker_id: parsedWorkerId,
    task_id: parsedTaskId,
  };
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

function isMergeOwnershipCollisionReason(reason) {
  return reason === 'existing_pr_owned_by_other_request' || reason === 'duplicate_pr_owned_by_other_request';
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
  const queueCwd = _projectDir || process.cwd();
  const resolvedPr = resolveQueuePrTarget(pr_url, branch, queueCwd);
  const resolvedPrUrl = resolvedPr.pr_url;

  if (resolvedPr.source === 'branch_fallback' && isValidGitHubPrUrl(resolvedPrUrl)) {
    db.updateTask(task_id, { pr_url: resolvedPrUrl });
    db.log('coordinator', 'merge_queue_pr_url_recovered_from_branch', {
      request_id,
      task_id,
      branch,
      original_pr_url: typeof pr_url === 'string' ? pr_url : null,
      resolved_pr_url: resolvedPrUrl,
    });
  }

  if (!resolvedPr.resolvable) {
    const staleEntries = db.getDb().prepare(`
      SELECT id, status
      FROM merge_queue
      WHERE request_id = ?
        AND task_id = ?
        AND status NOT IN ('merged', 'merging')
    `).all(request_id, task_id);
    for (const entry of staleEntries) {
      if (entry.status === 'pending') {
        db.updateMerge(entry.id, { status: 'failed', error: 'invalid_or_missing_pr' });
      }
    }
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: 'invalid_or_missing_pr',
      resolved_pr_url: isValidGitHubPrUrl(resolvedPrUrl) ? resolvedPrUrl : null,
      pr_resolution_source: resolvedPr.source,
    };
  }

  db.getDb().prepare(`
    DELETE FROM merge_queue
    WHERE request_id = ?
      AND branch = ?
      AND pr_url <> ?
      AND status NOT IN ('merged', 'merging')
  `).run(request_id, branch, resolvedPrUrl);

  const getLatestCheckpoint = () => {
    if (latest_completion_timestamp !== undefined) return latest_completion_timestamp;
    return db.getRequestLatestCompletedTaskCursor(request_id);
  };
  const latestCheckpoint = getLatestCheckpoint();

  const enqueueResult = db.enqueueMerge({
    request_id,
    task_id,
    pr_url: resolvedPrUrl,
    branch,
    priority: normalizedPriority,
    completion_checkpoint: latestCheckpoint,
  });
  if (enqueueResult.inserted) {
    const existingDuplicatePrOwner = db.getDb().prepare(`
      SELECT id, request_id, task_id, branch, status
      FROM merge_queue
      WHERE pr_url = ?
        AND id != ?
        AND (
          request_id != ?
          OR branch != ?
        )
      ORDER BY id DESC
      LIMIT 1
    `).get(resolvedPrUrl, enqueueResult.lastInsertRowid, request_id, branch);
    if (existingDuplicatePrOwner) {
      db.getDb().prepare('DELETE FROM merge_queue WHERE id = ?').run(enqueueResult.lastInsertRowid);
      db.log('coordinator', 'merge_queue_duplicate_pr_ownership_rejected', {
        request_id,
        task_id,
        pr_url: resolvedPrUrl,
        branch,
        duplicate_merge_id: enqueueResult.lastInsertRowid,
        existing_merge_id: existingDuplicatePrOwner.id,
        existing_request_id: existingDuplicatePrOwner.request_id,
        existing_task_id: existingDuplicatePrOwner.task_id,
        existing_branch: existingDuplicatePrOwner.branch,
        existing_status: existingDuplicatePrOwner.status,
      });
      return {
        queued: false,
        inserted: false,
        refreshed: false,
        retried: false,
        reason: 'duplicate_pr_owned_by_other_request',
        merge_id: existingDuplicatePrOwner.id,
        duplicate_merge_id: enqueueResult.lastInsertRowid,
        existing_request_id: existingDuplicatePrOwner.request_id,
        existing_task_id: existingDuplicatePrOwner.task_id,
        existing_branch: existingDuplicatePrOwner.branch,
        existing_status: existingDuplicatePrOwner.status,
        resolved_pr_url: resolvedPrUrl,
        pr_resolution_source: resolvedPr.source,
      };
    }
    return {
      queued: true,
      inserted: true,
      refreshed: false,
      retried: false,
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }

  const existing = db.getDb().prepare(`
    SELECT id, request_id, task_id, branch, status, priority, pr_url, updated_at, completion_checkpoint
    FROM merge_queue
    WHERE request_id = ?
      AND pr_url = ?
      AND branch = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(request_id, resolvedPrUrl, branch);

  if (!existing) {
    const existingByPr = db.getDb().prepare(`
      SELECT id, request_id, task_id, branch, status
      FROM merge_queue
      WHERE pr_url = ?
        AND (
          request_id != ?
          OR branch != ?
        )
      ORDER BY id DESC
      LIMIT 1
    `).get(resolvedPrUrl, request_id, branch);
    if (existingByPr) {
      return {
        queued: false,
        inserted: false,
        refreshed: false,
        retried: false,
        reason: 'existing_pr_owned_by_other_request',
        merge_id: existingByPr.id,
        existing_request_id: existingByPr.request_id,
        existing_task_id: existingByPr.task_id,
        existing_branch: existingByPr.branch,
        existing_status: existingByPr.status,
        resolved_pr_url: resolvedPrUrl,
        pr_resolution_source: resolvedPr.source,
      };
    }
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: 'missing_existing_entry',
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }
  if (existing.status === 'merged' || existing.status === 'merging') {
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: `status_${existing.status}`,
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }

  const ownerTaskChanged = Number(existing.task_id) !== Number(task_id);
  const currentPriority = Number.isInteger(existing.priority) ? existing.priority : 0;
  const desiredPriority = Math.max(currentPriority, normalizedPriority);
  const isTerminalRetryStatus = existing.status === 'failed' || existing.status === 'conflict';
  const mergeIdentityChanged =
    existing.branch !== branch ||
    existing.pr_url !== resolvedPrUrl;
  const hasFreshCompletionProgress = isTerminalRetryStatus && db.hasRequestCompletedTaskProgressSince(
    request_id,
    existing.completion_checkpoint,
    latestCheckpoint
  );
  const shouldRetry = isTerminalRetryStatus && (force_retry || hasFreshCompletionProgress || mergeIdentityChanged || ownerTaskChanged);
  const desiredStatus = shouldRetry ? 'pending' : existing.status;
  const needsRefresh =
    mergeIdentityChanged ||
    ownerTaskChanged ||
    currentPriority !== desiredPriority ||
    existing.status !== desiredStatus;

  if (!needsRefresh) {
    if (isTerminalRetryStatus && !shouldRetry) {
      return {
        queued: false,
        inserted: false,
        refreshed: false,
        retried: false,
        reason: 'terminal_without_fresh_progress',
        resolved_pr_url: resolvedPrUrl,
        pr_resolution_source: resolvedPr.source,
      };
    }
    return {
      queued: false,
      inserted: false,
      refreshed: false,
      retried: false,
      reason: 'already_current',
      resolved_pr_url: resolvedPrUrl,
      pr_resolution_source: resolvedPr.source,
    };
  }

  db.getDb().prepare(`
    UPDATE merge_queue
    SET task_id = ?,
        branch = ?,
        pr_url = ?,
        priority = ?,
        status = ?,
        error = CASE WHEN ? = 1 THEN NULL ELSE error END,
        completion_checkpoint = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(
    task_id,
    branch,
    resolvedPrUrl,
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
    resolved_pr_url: resolvedPrUrl,
    pr_resolution_source: resolvedPr.source,
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
  if ((command === 'complete-task' || command === 'fail-task') && Object.prototype.hasOwnProperty.call(a, 'usage')) {
    a.usage = normalizeCompleteTaskUsagePayload(a.usage);
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
  if (typeof process.env.npm_config_if_present === 'undefined') {
    process.env.npm_config_if_present = 'true';
  }

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
        const source_revision = getSourceRevision(project_dir || _projectDir || process.cwd());
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
          source_revision,
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
        const request = db.getRequest(args.request_id);
        const totalTaskRow = db.getDb().prepare(
          'SELECT COUNT(*) AS count FROM tasks WHERE request_id = ?'
        ).get(args.request_id);
        const totalTasks = Number(totalTaskRow && totalTaskRow.count) || 0;
        if (request && Number(request.tier) >= 3 && totalTasks === 1) {
          if (request.status === 'pending') {
            db.updateRequest(args.request_id, { status: 'decomposed' });
          }
          db.sendMail('allocator', 'tasks_ready', {
            request_id: args.request_id,
            task_id: taskId,
            trigger: 'first_task_created',
          });
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
        respond(conn, {
          ok: true,
          task: task
            ? {
              ...task,
              assignment_token: worker.launched_at || null,
            }
            : null,
        });
        break;
      }
      case 'start-task': {
        const { worker_id, task_id } = args;
        const ownership = validateWorkerTaskOwnership('start-task', worker_id, task_id);
        if (!ownership.ok) {
          // Stale agents whose current_task assignment changed (e.g. after watchdog
          // sentinel_reset) should be silently skipped — same pattern as the
          // reset-worker stale-sentinel guards.
          if (ownership.response.reason === 'worker_current_task_mismatch') {
            respond(conn, { ok: true, skipped: true, reason: 'worker_current_task_mismatch' });
          } else {
            respond(conn, ownership.response);
          }
          break;
        }
        const { task } = ownership;

        if (task.status === 'completed' || task.status === 'failed') {
          respond(conn, { ok: false, error: 'task_not_startable' });
          break;
        }

        if (task.status === 'in_progress') {
          respond(conn, { ok: true, idempotent: true });
          break;
        }

        if (task.status !== 'assigned') {
          respond(conn, { ok: false, error: 'task_not_startable' });
          break;
        }

        const now = new Date().toISOString();
        db.updateTask(task_id, { status: 'in_progress', started_at: now });
        db.updateWorker(worker_id, { status: 'busy', last_heartbeat: now });
        reopenFailedRequestForActiveRemediation({
          requestId: task.request_id,
          taskId: task_id,
          workerId: parseWorkerId(worker_id),
          trigger: 'start-task',
        });
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
        const ownership = validateWorkerTaskOwnership('complete-task', worker_id, task_id, { logic: 'or', softFail: true });
        if (!ownership.ok) {
          respond(conn, ownership.response);
          break;
        }
        const task = ownership.task;
        const worker = ownership.worker;
        const usage = normalizeCompleteTaskUsagePayload(args.usage);
        const usageTaskFields = mapUsagePayloadToTaskFields(usage, task);
        const completionPrNormalizationCwd = worker && worker.worktree_path
          ? worker.worktree_path
          : (_projectDir || process.cwd());
        const normalizedPrUrl = normalizePrUrl(pr_url, completionPrNormalizationCwd);
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
          ...usageTaskFields,
        });
        const completedTask = db.getTask(task_id);
        // Enqueue merge if PR exists (must be a valid URL, not a status string like "already_merged")
        const queueBranch = sanitizeBranchName(resolvedBranch.branch || completedTask.branch || (worker && worker.branch) || '');
        let completionPrUrl = normalizedPrUrl;
        let queueResult = null;
        if (completedTask && queueBranch) {
          queueResult = queueMergeWithRecovery({
            request_id: completedTask.request_id,
            task_id,
            pr_url: normalizedPrUrl,
            branch: queueBranch,
            priority: completedTask.priority === 'urgent' ? 10 : 0,
          });
          if (queueResult.resolved_pr_url && queueResult.resolved_pr_url !== completionPrUrl) {
            completionPrUrl = queueResult.resolved_pr_url;
            db.updateTask(task_id, { pr_url: completionPrUrl });
          }
          if (queueResult.refreshed) {
            db.log('coordinator', 'merge_queue_entry_refreshed', {
              request_id: completedTask.request_id,
              task_id,
              pr_url: queueResult.resolved_pr_url || completionPrUrl || normalizedPrUrl,
              branch: queueBranch,
              retried: queueResult.retried,
              previous_status: queueResult.previous_status || null,
              merge_id: queueResult.merge_id || null,
            });
          }
        }
        if (queueResult && isMergeOwnershipCollisionReason(queueResult.reason)) {
          const failureReason = queueResult.reason;
          const failureError = `merge_queue:${failureReason}`;
          const failureTimestamp = new Date().toISOString();
          db.updateTask(task_id, {
            status: 'failed',
            pr_url: completionPrUrl || null,
            branch: queueBranch || resolvedBranch.branch || null,
            result: failureError,
            completed_at: failureTimestamp,
          });
          db.updateWorker(worker_id, { status: 'idle', current_task_id: null });
          const failedTask = db.getTask(task_id);
          const routingMeta = failedTask ? {
            subject: failedTask.subject,
            description: failedTask.description,
            domain: failedTask.domain,
            files: failedTask.files,
            tier: failedTask.tier,
            assigned_to: failedTask.assigned_to,
          } : null;
          db.sendMail('allocator', 'task_failed', {
            worker_id,
            task_id,
            request_id: failedTask ? failedTask.request_id : null,
            error: failureError,
            subject: routingMeta ? routingMeta.subject : null,
            domain: routingMeta ? routingMeta.domain : null,
            files: routingMeta ? routingMeta.files : null,
            tier: routingMeta ? routingMeta.tier : null,
            assigned_to: routingMeta ? routingMeta.assigned_to : null,
            original_task: routingMeta,
          });
          db.sendMail('architect', 'task_failed', {
            worker_id,
            task_id,
            request_id: failedTask ? failedTask.request_id : null,
            error: failureError,
            original_task: routingMeta,
          });
          db.log('coordinator', 'merge_queue_ownership_collision_rejected', {
            request_id: failedTask ? failedTask.request_id : null,
            worker_id,
            task_id,
            reason: failureReason,
            pr_url: queueResult.resolved_pr_url || completionPrUrl || normalizedPrUrl || null,
            branch: queueBranch || null,
            merge_id: queueResult.merge_id || null,
            duplicate_merge_id: queueResult.duplicate_merge_id || null,
            existing_request_id: queueResult.existing_request_id || null,
            existing_task_id: queueResult.existing_task_id || null,
            existing_branch: queueResult.existing_branch || null,
            existing_status: queueResult.existing_status || null,
          });
          db.log(`worker-${worker_id}`, 'task_failed', { task_id, error: failureError });
          respond(conn, {
            ok: false,
            error: 'merge_queue_rejected',
            reason: failureReason,
            merge_id: queueResult.merge_id || null,
            duplicate_merge_id: queueResult.duplicate_merge_id || null,
            existing_request_id: queueResult.existing_request_id || null,
            existing_task_id: queueResult.existing_task_id || null,
            existing_branch: queueResult.existing_branch || null,
            existing_status: queueResult.existing_status || null,
          });
          break;
        }
        // Increment tasks_completed counter on worker
        const workerRow = db.getWorker(worker_id);
        const tasksCompleted = (workerRow ? workerRow.tasks_completed : 0) + 1;
        db.updateWorker(worker_id, {
          status: 'completed_task',
          current_task_id: null,
          tasks_completed: tasksCompleted,
        });
        // Auto-increment knowledge staleness counter on task completion
        try {
          const knowledgeMeta = require('./knowledge-metadata');
          knowledgeMeta.incrementChanges(_projectDir || process.cwd(), completedTask.domain);
        } catch (kmErr) {
          db.log('coordinator', 'knowledge_metadata_increment_error', {
            task_id, error: kmErr.message,
          });
        }
        if (completionPrUrl && completionPrUrl !== (pr_url || '')) {
          db.log('coordinator', 'complete_task_pr_url_normalized', {
            task_id,
            worker_id,
            original_pr_url: pr_url,
            normalized_pr_url: completionPrUrl,
          });
        }
        db.sendMail('allocator', 'task_completed', {
          worker_id, task_id,
          request_id: completedTask ? completedTask.request_id : null,
          pr_url: completionPrUrl,
          tasks_completed: tasksCompleted,
          usage,
        });
        // Notify architect so it has visibility into Tier 2 outcomes
        db.sendMail('architect', 'task_completed', {
          worker_id, task_id,
          request_id: completedTask ? completedTask.request_id : null,
          pr_url: completionPrUrl,
          result,
          usage,
        });
        db.log(`worker-${worker_id}`, 'task_completed', {
          task_id,
          pr_url: completionPrUrl,
          result,
          usage,
          tasks_completed: tasksCompleted,
        });
        // Notify handlers for merge check
        if (handlers.onTaskCompleted) handlers.onTaskCompleted(task_id);
        respond(conn, { ok: true });
        break;
      }
      case 'fail-task': {
        const { worker_id: wid, task_id: tid, error } = args;
        const ownership = validateWorkerTaskOwnership('fail-task', wid, tid);
        if (!ownership.ok) {
          respond(conn, ownership.response);
          break;
        }
        const failedTask = ownership.task;
        if (failedTask.status !== 'assigned' && failedTask.status !== 'in_progress') {
          db.log('coordinator', 'ownership_mismatch', {
            command: 'fail-task',
            worker_id: wid || null,
            task_id: tid || null,
            reason: 'task_not_active',
            task_status: failedTask.status,
          });
          respond(conn, { ok: false, error: 'ownership_mismatch', reason: 'task_not_active' });
          break;
        }
        const usage = normalizeCompleteTaskUsagePayload(args.usage);
        const usageTaskFields = mapUsagePayloadToTaskFields(usage, failedTask);
        const routingMeta = failedTask ? {
          subject: failedTask.subject,
          description: failedTask.description,
          domain: failedTask.domain,
          files: failedTask.files,
          tier: failedTask.tier,
          assigned_to: failedTask.assigned_to,
        } : null;
        db.updateTask(tid, {
          status: 'failed',
          result: error,
          completed_at: new Date().toISOString(),
          ...usageTaskFields,
        });
        db.updateWorker(wid, { status: 'idle', current_task_id: null });
        db.sendMail('allocator', 'task_failed', {
          worker_id: wid,
          task_id: tid,
          request_id: failedTask ? failedTask.request_id : null,
          error,
          usage,
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
          usage,
          original_task: routingMeta,
        });
        db.log(`worker-${wid}`, 'task_failed', { task_id: tid, error, usage });
        respond(conn, { ok: true });
        break;
      }
      case 'browser-create-session': {
        const browserTx = db.getDb().transaction(() => {
          const { taskId, task } = ensureBrowserMutableTask(args.task_id);
          const workflow = normalizeBrowserWorkflowUrl(args.workflow_url);
          const idempotencyKey = normalizeBrowserIdempotencyKey(args.idempotency_key);
          const channel = normalizeBrowserChannel(args.channel, taskId, task.browser_channel);
          const state = normalizeBrowserOffloadState(task);
          const fingerprint = buildBrowserIdempotencyFingerprint('browser-create-session', {
            task_id: taskId,
            workflow_url: workflow.url,
            channel,
          });
          const replay = getBrowserIdempotencyReplay(state, 'browser-create-session', idempotencyKey, fingerprint);
          if (replay) return { response: replay, idempotent: true };

          const currentStatus = normalizeBrowserOffloadStatus(task);
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
          setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-create-session', fingerprint, response);
          const payloadText = serializeBrowserOffloadState(state);
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
        respond(conn, { ok: true, ...created.response, idempotent: created.idempotent });
        break;
      }
      case 'browser-attach-session': {
        const browserTx = db.getDb().transaction(() => {
          const { taskId, task } = ensureBrowserMutableTask(args.task_id);
          const state = normalizeBrowserOffloadState(task);
          const sessionId = ensureBrowserSessionMatch(state, task, args.session_id);
          const idempotencyKey = normalizeBrowserIdempotencyKey(args.idempotency_key);
          const channel = normalizeBrowserChannel(
            args.channel,
            taskId,
            (state.session && state.session.channel) || task.browser_channel
          );
          const fingerprint = buildBrowserIdempotencyFingerprint('browser-attach-session', {
            task_id: taskId,
            session_id: sessionId,
            channel,
          });
          const replay = getBrowserIdempotencyReplay(state, 'browser-attach-session', idempotencyKey, fingerprint);
          if (replay) return { response: replay, idempotent: true };

          const currentStatus = normalizeBrowserOffloadStatus(task);
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
          setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-attach-session', fingerprint, response);
          const payloadText = serializeBrowserOffloadState(state);
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
        respond(conn, { ok: true, ...attached.response, idempotent: attached.idempotent });
        break;
      }
      case 'browser-start-job': {
        const browserTx = db.getDb().transaction(() => {
          const { taskId, task } = ensureBrowserMutableTask(args.task_id);
          const workflow = normalizeBrowserWorkflowUrl(args.workflow_url);
          const guidance = normalizeBrowserGuidance(args.guidance);
          const state = normalizeBrowserOffloadState(task);
          const sessionId = ensureBrowserSessionMatch(state, task, args.session_id);
          const idempotencyKey = normalizeBrowserIdempotencyKey(args.idempotency_key);
          const fingerprint = buildBrowserIdempotencyFingerprint('browser-start-job', {
            task_id: taskId,
            session_id: sessionId,
            workflow_url: workflow.url,
            guidance,
          });
          const replay = getBrowserIdempotencyReplay(state, 'browser-start-job', idempotencyKey, fingerprint);
          if (replay) return { response: replay, idempotent: true };

          const currentStatus = normalizeBrowserOffloadStatus(task);
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
            callback_token_hash: hashBrowserCallbackToken(callbackToken),
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
          setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-start-job', fingerprint, response);
          const payloadText = serializeBrowserOffloadState(state);
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
        respond(conn, { ok: true, ...started.response, idempotent: started.idempotent });
        break;
      }
      case 'browser-callback-chunk': {
        const browserTx = db.getDb().transaction(() => {
          const { taskId, task } = ensureBrowserMutableTask(args.task_id);
          const state = normalizeBrowserOffloadState(task);
          const sessionId = ensureBrowserSessionMatch(state, task, args.session_id);
          const jobId = ensureBrowserJobMatch(state, args.job_id);
          ensureBrowserCallbackAuthorization(state, args.callback_token);
          const idempotencyKey = normalizeBrowserIdempotencyKey(args.idempotency_key);
          const chunkIndex = normalizeBrowserChunkIndex(args.chunk_index);
          const normalizedChunk = normalizeBrowserChunk(args.chunk);
          const fingerprint = buildBrowserIdempotencyFingerprint('browser-callback-chunk', {
            task_id: taskId,
            session_id: sessionId,
            job_id: jobId,
            chunk_index: chunkIndex,
            chunk: normalizedChunk.value,
          });
          const replay = getBrowserIdempotencyReplay(state, 'browser-callback-chunk', idempotencyKey, fingerprint);
          if (replay) return { response: replay, idempotent: true };

          const currentStatus = normalizeBrowserOffloadStatus(task);
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
          setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-callback-chunk', fingerprint, response);
          const payloadText = serializeBrowserOffloadState(state);
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
        respond(conn, { ok: true, ...callbackChunk.response, idempotent: callbackChunk.idempotent });
        break;
      }
      case 'browser-complete-job': {
        const browserTx = db.getDb().transaction(() => {
          const { taskId, task } = ensureBrowserMutableTask(args.task_id);
          const state = normalizeBrowserOffloadState(task);
          const sessionId = ensureBrowserSessionMatch(state, task, args.session_id);
          const jobId = ensureBrowserJobMatch(state, args.job_id);
          ensureBrowserCallbackAuthorization(state, args.callback_token);
          const idempotencyKey = normalizeBrowserIdempotencyKey(args.idempotency_key);
          const normalizedResult = normalizeBrowserCompletionResult(args.result);
          const fingerprint = buildBrowserIdempotencyFingerprint('browser-complete-job', {
            task_id: taskId,
            session_id: sessionId,
            job_id: jobId,
            result: normalizedResult,
          });
          const replay = getBrowserIdempotencyReplay(state, 'browser-complete-job', idempotencyKey, fingerprint);
          if (replay) return { response: replay, idempotent: true };

          const currentStatus = normalizeBrowserOffloadStatus(task);
          if (currentStatus !== 'awaiting_callback') {
            throw new Error(`browser_job_not_completable:${currentStatus}`);
          }

          const now = new Date().toISOString();
          const callbackText = buildBrowserCallbackText(state.job);
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
          setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-complete-job', fingerprint, response);
          const payloadText = serializeBrowserOffloadState(state);
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
        respond(conn, { ok: true, ...completed.response, idempotent: completed.idempotent });
        break;
      }
      case 'browser-fail-job': {
        const browserTx = db.getDb().transaction(() => {
          const { taskId, task } = ensureBrowserMutableTask(args.task_id);
          const state = normalizeBrowserOffloadState(task);
          const sessionId = ensureBrowserSessionMatch(state, task, args.session_id);
          const jobId = ensureBrowserJobMatch(state, args.job_id);
          ensureBrowserCallbackAuthorization(state, args.callback_token);
          const idempotencyKey = normalizeBrowserIdempotencyKey(args.idempotency_key);
          const normalizedError = normalizeBrowserError(args.error);
          const fingerprint = buildBrowserIdempotencyFingerprint('browser-fail-job', {
            task_id: taskId,
            session_id: sessionId,
            job_id: jobId,
            error: normalizedError,
          });
          const replay = getBrowserIdempotencyReplay(state, 'browser-fail-job', idempotencyKey, fingerprint);
          if (replay) return { response: replay, idempotent: true };

          const currentStatus = normalizeBrowserOffloadStatus(task);
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
          setBrowserIdempotencyEntry(state, idempotencyKey, 'browser-fail-job', fingerprint, response);
          const payloadText = serializeBrowserOffloadState(state);
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
        respond(conn, { ok: true, ...failed.response, idempotent: failed.idempotent });
        break;
      }
      case 'browser-job-status': {
        const { taskId, task } = ensureBrowserTask(args.task_id);
        const state = normalizeBrowserOffloadState(task);
        const sessionId = ensureBrowserSessionMatch(state, task, args.session_id);
        const jobId = ensureBrowserJobMatch(state, args.job_id);
        const resultPayload = parseBrowserResultPayload(task.browser_offload_result);
        const response = {
          ok: true,
          task_id: taskId,
          request_id: task.request_id,
          session_id: sessionId,
          job_id: jobId,
          browser_channel: task.browser_channel || (state.session && state.session.channel) || null,
          browser_offload_status: normalizeBrowserOffloadStatus(task),
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
        respond(conn, response);
        break;
      }
      case 'distill': {
        db.log(`worker-${args.worker_id}`, 'distill', { domain: args.domain, content: args.content });
        respond(conn, { ok: true });
        break;
      }

      // === SHARED commands ===
      case 'inbox': {
        const recipient = normalizeInboxRecipient(args.recipient);
        const filters = extractInboxMailFilters(args);
        const msgs = db.checkMail(recipient, !args.peek, filters);
        respond(conn, { ok: true, messages: msgs });
        break;
      }
      case 'inbox-block': {
        // Async blocking inbox check — polls without freezing the event loop
        const recipient = normalizeInboxRecipient(args.recipient);
        const filters = extractInboxMailFilters(args);
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
            const msgs = db.checkMail(recipient, consume, filters);
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
          if (!freshWorker) return { ok: false, reason: 'worker_not_idle' };
          if (freshWorker.claimed_by !== null && freshWorker.claimed_by !== undefined) {
            return { ok: false, reason: 'worker_claimed', claimed_by: freshWorker.claimed_by };
          }
          if (freshWorker.status !== 'idle') return { ok: false, reason: 'worker_not_idle' };

          db.updateTask(assignTaskId, { status: 'assigned', assigned_to: assignWorkerId });
          db.updateWorker(assignWorkerId, {
            status: 'assigned',
            current_task_id: assignTaskId,
            domain: freshTask.domain || freshWorker.domain,
            launched_at: new Date().toISOString(),
          });
          return { ok: true, task: freshTask, worker: freshWorker };
        })();

        if (!assignResult.ok) {
          const errPayload = { ok: false, error: assignResult.reason };
          if (assignResult.claimed_by != null) errPayload.claimed_by = assignResult.claimed_by;
          respond(conn, errPayload);
          break;
        }

        const assignedTask = db.getTask(assignTaskId);
        const assignedWorker = db.getWorker(assignWorkerId);
        const routingDecision = modelRouter.routeTask(assignedTask, { getConfig: db.getConfig });
        const modelSource = routingDecision.model_source || 'router:unspecified';
        db.updateTask(assignTaskId, {
          routing_class: routingDecision.routing_class || null,
          routed_model: routingDecision.model || null,
          model_source: modelSource,
          reasoning_effort: routingDecision.reasoning_effort || null,
        });
        const routingReason = routingDecision.routing_reason || routingDecision.reason || 'router:unspecified';
        const routingTelemetry = {
          budget_state: routingDecision.budget_state || null,
          budget_source: routingDecision.budget_source || 'none',
          model_source: modelSource,
          routing_reason: routingReason,
          routing_precedence: routingDecision.routing_precedence || [],
        };

        // Trigger tmux spawn via handler — revert assignment on failure
        if (handlers.onAssignTask) {
          try {
            handlers.onAssignTask(assignedTask, assignedWorker, routingDecision);
          } catch (spawnErr) {
            const rollbackAsWorkerClaimed = isWorkerClaimedAssignmentError(spawnErr);
            db.getDb().transaction(() => {
              const rollbackWorker = rollbackAsWorkerClaimed ? db.getWorker(assignWorkerId) : null;
              const claimedBy = rollbackAsWorkerClaimed
                ? (rollbackWorker ? rollbackWorker.claimed_by : assignResult.worker.claimed_by)
                : assignResult.worker.claimed_by;
              const claimedAt = rollbackAsWorkerClaimed
                ? (rollbackWorker ? rollbackWorker.claimed_at : assignResult.worker.claimed_at)
                : assignResult.worker.claimed_at;
              db.updateTask(assignTaskId, {
                status: assignResult.task.status,
                assigned_to: assignResult.task.assigned_to,
                routing_class: assignResult.task.routing_class ?? null,
                routed_model: assignResult.task.routed_model ?? null,
                model_source: assignResult.task.model_source ?? null,
                reasoning_effort: assignResult.task.reasoning_effort ?? null,
              });
              db.updateWorker(assignWorkerId, {
                status: assignResult.worker.status,
                current_task_id: assignResult.worker.current_task_id,
                domain: assignResult.worker.domain,
                claimed_by: claimedBy,
                claimed_at: claimedAt,
                launched_at: assignResult.worker.launched_at,
              });
            })();
            db.log('coordinator', 'assign_handler_failed', { task_id: assignTaskId, worker_id: assignWorkerId, error: spawnErr.message });
            if (rollbackAsWorkerClaimed) {
              respond(conn, { ok: false, error: 'worker_claimed' });
              break;
            }
            respond(conn, { ok: false, error: `Failed to spawn worker: ${spawnErr.message}` });
            break;
          }
        }

        reopenFailedRequestForActiveRemediation({
          requestId: assignedTask.request_id,
          taskId: assignTaskId,
          workerId: assignWorkerId,
          trigger: 'assign-task',
        });

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
          routing_reason: routingTelemetry.routing_reason,
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
          routing_reason: routingTelemetry.routing_reason,
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
            routing_reason: routingTelemetry.routing_reason,
            reason: routingTelemetry.routing_reason,
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
        const completion = db.checkRequestCompletion(args.request_id, {
          source: 'check_completion_command',
        });
        respond(conn, { ok: true, ...completion });
        break;
      }

      case 'check-overlaps': {
        const overlapPairs = db.getOverlapsForRequest(args.request_id);
        respond(conn, { ok: true, request_id: args.request_id, overlaps: overlapPairs });
        break;
      }

      case 'replan-dependency': {
        const replanned = db.replanTaskDependency({
          fromTaskId: args.from_task_id,
          toTaskId: args.to_task_id,
          requestId: args.request_id,
        });
        respond(conn, { ok: true, ...replanned });
        break;
      }

      case 'integrate': {
        // Master-3 triggers integration when all tasks for a request complete
        const reqId = args.request_id;
        const forceRetry = args.retry_terminal === true || args.force_retry === true;
        const completion = db.checkRequestCompletion(reqId, { source: 'integrate_guard' });
        const canIntegrate = completion.all_completed === true && completion.failed === 0;
        if (!canIntegrate) {
          const error = completion.failed > 0
            ? 'Request has failed tasks'
            : 'Not all tasks completed';
          respond(conn, { ok: false, error, ...completion });
          break;
        }
        // Queue merges for each completed task's branch/PR
        const tasks = db.listTasks({ request_id: reqId, status: 'completed' });
        const latestCompletedTaskState = db.getRequestLatestCompletedTaskCursor(reqId);
        let queued = 0;
        const queueFailures = [];
        for (const task of tasks) {
          const worker = task.assigned_to ? db.getWorker(task.assigned_to) : null;
          const taskPrNormalizationCwd = worker && worker.worktree_path
            ? worker.worktree_path
            : (_projectDir || process.cwd());
          const normalizedPrUrl = normalizePrUrl(task.pr_url, taskPrNormalizationCwd);
          const resolvedBranch = resolveCompletionBranch(worker, task.branch, task.assigned_to);
          if (task.pr_url !== normalizedPrUrl) {
            db.updateTask(task.id, { pr_url: normalizedPrUrl || task.pr_url });
          }
          const mergeBranch = sanitizeBranchName(resolvedBranch.branch || task.branch || (worker && worker.branch) || '');
          if (mergeBranch) {
            if (resolvedBranch.mismatch || task.branch !== mergeBranch) {
              db.updateTask(task.id, { branch: mergeBranch });
            }
            const queueResult = queueMergeWithRecovery({
              request_id: reqId,
              task_id: task.id,
              branch: mergeBranch,
              pr_url: normalizedPrUrl,
              priority: task.priority === 'urgent' ? 10 : 0,
              force_retry: forceRetry,
              latest_completion_timestamp: latestCompletedTaskState,
            });
            const queuedPrUrl = queueResult.resolved_pr_url || normalizedPrUrl;
            if (queuedPrUrl && queuedPrUrl !== task.pr_url) {
              db.updateTask(task.id, { pr_url: queuedPrUrl });
            }
            if (isMergeOwnershipCollisionReason(queueResult.reason)) {
              const failureReason = queueResult.reason;
              const failureError = `merge_queue:${failureReason}`;
              const failureTimestamp = new Date().toISOString();
              db.updateTask(task.id, {
                status: 'failed',
                pr_url: queuedPrUrl || null,
                branch: mergeBranch,
                result: failureError,
                completed_at: failureTimestamp,
              });
              const failedTask = db.getTask(task.id);
              const routingMeta = failedTask ? {
                subject: failedTask.subject,
                description: failedTask.description,
                domain: failedTask.domain,
                files: failedTask.files,
                tier: failedTask.tier,
                assigned_to: failedTask.assigned_to,
              } : null;
              db.sendMail('allocator', 'task_failed', {
                worker_id: task.assigned_to || null,
                task_id: task.id,
                request_id: failedTask ? failedTask.request_id : reqId,
                error: failureError,
                subject: routingMeta ? routingMeta.subject : null,
                domain: routingMeta ? routingMeta.domain : null,
                files: routingMeta ? routingMeta.files : null,
                tier: routingMeta ? routingMeta.tier : null,
                assigned_to: routingMeta ? routingMeta.assigned_to : null,
                original_task: routingMeta,
              });
              db.sendMail('architect', 'task_failed', {
                worker_id: task.assigned_to || null,
                task_id: task.id,
                request_id: failedTask ? failedTask.request_id : reqId,
                error: failureError,
                original_task: routingMeta,
              });
              db.log('coordinator', 'integrate_merge_queue_ownership_collision_rejected', {
                request_id: reqId,
                task_id: task.id,
                reason: failureReason,
                pr_url: queuedPrUrl || null,
                branch: mergeBranch,
                merge_id: queueResult.merge_id || null,
                duplicate_merge_id: queueResult.duplicate_merge_id || null,
                existing_request_id: queueResult.existing_request_id || null,
                existing_task_id: queueResult.existing_task_id || null,
                existing_branch: queueResult.existing_branch || null,
                existing_status: queueResult.existing_status || null,
              });
              queueFailures.push({
                task_id: task.id,
                reason: failureReason,
                merge_id: queueResult.merge_id || null,
                duplicate_merge_id: queueResult.duplicate_merge_id || null,
                existing_request_id: queueResult.existing_request_id || null,
                existing_task_id: queueResult.existing_task_id || null,
                existing_branch: queueResult.existing_branch || null,
                existing_status: queueResult.existing_status || null,
              });
              continue;
            }
            if (queueResult.queued) queued++;
            if (queueResult.refreshed) {
              db.log('coordinator', 'merge_queue_entry_refreshed', {
                request_id: reqId,
                task_id: task.id,
                pr_url: queuedPrUrl,
                branch: mergeBranch,
                retried: queueResult.retried,
                previous_status: queueResult.previous_status || null,
                merge_id: queueResult.merge_id || null,
              });
            }
          }
        }
        if (queueFailures.length > 0) {
          respond(conn, {
            ok: false,
            error: 'merge_queue_rejected',
            request_id: reqId,
            merges_queued: queued,
            failures: queueFailures,
          });
          break;
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
                claimed_by = NULL,
                claimed_at = NULL
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
      case 'purge-tasks': {
        const purgeStatus = args.status || 'failed';
        const dbConn = db.getDb();
        const deleteMerges = dbConn.prepare(`
          DELETE FROM merge_queue
          WHERE task_id IN (SELECT id FROM tasks WHERE status = ?)
            AND status IN ('failed', 'conflict')
        `);
        const deleteTasks = dbConn.prepare(`
          DELETE FROM tasks WHERE status = ?
        `);
        const tx = dbConn.transaction((s) => {
          const mergesResult = deleteMerges.run(s);
          const tasksResult = deleteTasks.run(s);
          return { purged_merges: mergesResult.changes, purged_tasks: tasksResult.changes };
        });
        const result = tx(purgeStatus);
        db.log('coordinator', 'purge-tasks', { status: purgeStatus, ...result });
        respond(conn, { ok: true, ...result });
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
        const activeAssignment = getWorkerActiveAssignment(resetWid);
        const observedTaskId = resetWorker.current_task_id || (activeAssignment ? activeAssignment.id : null);
        const hasOwnershipContext = expectedTaskId !== null || Boolean(expectedToken);

        if (!hasOwnershipContext && (observedTaskId !== null || resetWorker.status !== 'idle')) {
          db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
            reason: 'missing_ownership_context',
            worker_status: resetWorker.status,
            current_task_id: resetWorker.current_task_id,
            active_task_id: activeAssignment ? activeAssignment.id : null,
          });
          respond(conn, { ok: true, skipped: true, reason: 'missing_ownership_context' });
          break;
        }

        if (
          expectedTaskId !== null &&
          observedTaskId !== null &&
          observedTaskId !== expectedTaskId
        ) {
          db.log(`worker-${resetWid}`, 'sentinel_reset_skipped', {
            reason: 'task_mismatch',
            expected_task_id: expectedTaskId,
            current_task_id: resetWorker.current_task_id,
            active_task_id: activeAssignment ? activeAssignment.id : null,
            observed_task_id: observedTaskId,
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
            claimed_by: null,
            claimed_at: null,
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
        if (cpLoop.status !== 'active') {
          respond(conn, { ok: false, error: `Loop is ${cpLoop.status}, not active` });
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
        if (hbLoop.status !== 'active') {
          respond(conn, { ok: false, error: `Loop is ${hbLoop.status}, not active` });
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
          'loop_request_quality_gate',
          'loop_request_min_description_chars',
          'loop_request_min_interval_sec',
          'loop_request_max_per_hour',
          'loop_request_similarity_threshold',
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
        const normalizedLoopConfigValue = normalizeLoopRequestSetConfigValue(key, value);
        if (!normalizedLoopConfigValue.ok) {
          respond(conn, { error: normalizedLoopConfigValue.error });
          break;
        }

        let storedValue = normalizedLoopConfigValue.value;
        const isSparkModelKey = SPARK_MODEL_KEYS.includes(key);
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
          if (isSparkModelKey) {
            for (const sparkModelKey of SPARK_MODEL_KEYS) {
              upsertConfig.run(sparkModelKey, storedValue);
            }
          } else {
            upsertConfig.run(key, storedValue);
          }
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
        } else if (Object.prototype.hasOwnProperty.call(ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP, key)) {
          const legacyKey = ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP[key];
          db.setConfig(legacyKey, storedValue);
          const synchronizedState = syncBudgetStateFromScalarFallback(
            db.getConfig(ROUTING_BUDGET_STATE_KEY),
            db.getConfig
          );
          db.setConfig(ROUTING_BUDGET_STATE_KEY, JSON.stringify(synchronizedState));
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
      case 'loop-refresh-prompt': {
        const refreshed = db.refreshLoopPrompt(args.loop_id, args.prompt);
        if (!refreshed.ok) {
          respond(conn, { ok: false, error: refreshed.error });
          break;
        }
        db.log('coordinator', 'loop_prompt_refreshed', {
          loop_id: args.loop_id,
          result: 'updated',
          status: refreshed.loop.status,
          prompt_preview: refreshed.loop.prompt.slice(0, 200),
        });
        respond(conn, {
          ok: true,
          loop_id: refreshed.loop.id,
          prompt: refreshed.loop.prompt,
          status: refreshed.loop.status,
          last_checkpoint: refreshed.loop.last_checkpoint,
          iteration_count: refreshed.loop.iteration_count,
        });
        break;
      }
      case 'loop-set-prompt': {
        const updated = db.setLoopPrompt(args.loop_id, args.prompt, ['active', 'paused']);
        if (!updated.ok) {
          respond(conn, { ok: false, error: updated.error });
          break;
        }
        db.log('coordinator', 'loop_prompt_updated', {
          loop_id: args.loop_id,
          status: updated.loop.status,
          prompt_preview: updated.loop.prompt.slice(0, 200),
        });
        respond(conn, {
          ok: true,
          loop_id: updated.loop.id,
          prompt: updated.loop.prompt,
          status: updated.loop.status,
          last_checkpoint: updated.loop.last_checkpoint,
          iteration_count: updated.loop.iteration_count,
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

      case 'queue-research': {
        const queued = db.queueResearch({
          topic: args.topic,
          question: args.question,
          mode: args.mode || 'standard',
          priority: args.priority || 'normal',
          context: args.context || null,
          source_agent: args.source_agent || null,
          source_task_id: args.source_task_id || null,
        });
        db.log('coordinator', 'research_queued', { id: queued.id, topic: queued.topic });
        respond(conn, { ok: true, ...queued });
        break;
      }

      case 'research-status': {
        const items = db.getResearchQueueItems({
          topic: args.topic || null,
          status: args.status || null,
          limit: args.limit || 50,
        });
        respond(conn, { ok: true, items, count: items.length });
        break;
      }

      case 'research-requeue-stale': {
        const requeued = db.requeueStaleResearch({
          max_age_minutes: args.max_age_minutes || 60,
        });
        db.log('coordinator', 'research_requeued_stale', requeued);
        respond(conn, { ok: true, ...requeued });
        break;
      }

      case 'research-next': {
        const nextItems = db.getResearchQueueItems({ status: 'queued', limit: 1 });
        if (nextItems.length === 0) {
          respond(conn, { ok: true, item: null });
        } else {
          respond(conn, { ok: true, item: nextItems[0] });
        }
        break;
      }

      case 'research-start': {
        const started = db.startResearchItem(args.id);
        if (!started) {
          respond(conn, { ok: false, error: 'research item not in queued state' });
          break;
        }
        db.log('coordinator', 'research_started', { id: args.id });
        respond(conn, { ok: true });
        break;
      }

      case 'research-complete': {
        let resultText = null;
        if (args.note_path) {
          const fs = require('fs');
          const path = require('path');
          const projectDir = db.getConfig('project_dir') || process.cwd();
          // Try: absolute, relative to cwd, then under .codex/knowledge/
          const candidates = [
            args.note_path,
            path.resolve(projectDir, args.note_path),
            path.resolve(projectDir, '.codex', 'knowledge', args.note_path),
          ];
          let found = false;
          for (const p of candidates) {
            try { resultText = fs.readFileSync(p, 'utf8'); found = true; break; } catch {}
          }
          if (!found) {
            respond(conn, { ok: false, error: `Cannot read note_path: ${args.note_path} (tried ${candidates.length} locations)` });
            break;
          }
        }
        const completed = db.completeResearchItem(args.intent_id, resultText);
        if (!completed) {
          respond(conn, { ok: false, error: 'research item not in in_progress state' });
          break;
        }
        db.log('coordinator', 'research_completed', { id: args.intent_id });
        respond(conn, { ok: true });
        break;
      }

      case 'research-fail': {
        const failed = db.failResearchItem(args.intent_id, args.error || null);
        if (!failed) {
          respond(conn, { ok: false, error: 'research item not in in_progress state' });
          break;
        }
        db.log('coordinator', 'research_failed', { id: args.intent_id, error: args.error });
        respond(conn, { ok: true });
        break;
      }

      case 'research-gaps': {
        const items = db.getResearchQueueItems({ status: 'queued' });
        const topics = [...new Set(items.map(i => i.topic))];
        respond(conn, { ok: true, queued_count: items.length, topics });
        break;
      }

      case 'memory-snapshots': {
        const snapshots = db.listProjectMemorySnapshots({
          project_context_key: args.project_context_key || null,
          request_id: args.request_id || null,
          task_id: args.task_id || null,
          run_id: args.run_id || null,
          validation_status: args.validation_status || null,
          min_relevance_score: args.min_relevance_score != null ? args.min_relevance_score : null,
          limit: args.limit || 100,
          offset: args.offset || 0,
        });
        respond(conn, { ok: true, snapshots });
        break;
      }

      case 'memory-snapshot': {
        const snap = db.getProjectMemorySnapshot(args.id);
        if (!snap) {
          respond(conn, { ok: false, error: `Snapshot ${args.id} not found` });
          break;
        }
        let lineage = null;
        if (args.include_lineage) {
          lineage = db.listProjectMemoryLineageLinks({ snapshot_id: args.id });
        }
        respond(conn, { ok: true, snapshot: snap, lineage });
        break;
      }

      case 'memory-insights': {
        const artifacts = db.listInsightArtifacts({
          project_context_key: args.project_context_key || null,
          snapshot_id: args.snapshot_id || null,
          artifact_type: args.artifact_type || null,
          request_id: args.request_id || null,
          task_id: args.task_id || null,
          run_id: args.run_id || null,
          validation_status: args.validation_status || null,
          min_relevance_score: args.min_relevance_score != null ? args.min_relevance_score : null,
          limit: args.limit || 100,
          offset: args.offset || 0,
        });
        respond(conn, { ok: true, artifacts });
        break;
      }

      case 'memory-insight': {
        const artifact = db.getInsightArtifact(args.id);
        if (!artifact) {
          respond(conn, { ok: false, error: `Insight artifact ${args.id} not found` });
          break;
        }
        let insightLineage = null;
        if (args.include_lineage) {
          insightLineage = db.listProjectMemoryLineageLinks({ insight_artifact_id: args.id });
        }
        respond(conn, { ok: true, artifact, lineage: insightLineage });
        break;
      }

      case 'memory-lineage': {
        const links = db.listProjectMemoryLineageLinks({
          snapshot_id: args.snapshot_id || null,
          insight_artifact_id: args.insight_artifact_id || null,
          request_id: args.request_id || null,
          task_id: args.task_id || null,
          run_id: args.run_id || null,
          lineage_type: args.lineage_type || null,
          limit: args.limit || 200,
          offset: args.offset || 0,
        });
        respond(conn, { ok: true, links });
        break;
      }

      // === KNOWLEDGE LAYER commands ===
      case 'knowledge-status': {
        const knowledgeMeta = require('./knowledge-metadata');
        const status = knowledgeMeta.getKnowledgeStatus(_projectDir || process.cwd());
        respond(conn, { ok: true, ...status });
        break;
      }
      case 'knowledge-increment': {
        const knowledgeMeta = require('./knowledge-metadata');
        const domain = args.domain || null;
        const workerPatch = args.worker_patch || args['worker-patch'] || false;
        const projDir = _projectDir || process.cwd();
        knowledgeMeta.incrementChanges(projDir, domain);
        if (workerPatch) {
          knowledgeMeta.incrementWorkerPatches(projDir, domain);
        }
        const meta = knowledgeMeta.getMetadata(projDir);
        respond(conn, { ok: true, changes_since_index: meta.changes_since_index, domain });
        break;
      }
      case 'knowledge-update-index-timestamp': {
        const knowledgeMeta = require('./knowledge-metadata');
        const meta = knowledgeMeta.updateIndexTimestamp(_projectDir || process.cwd());
        respond(conn, { ok: true, last_indexed: meta.last_indexed });
        break;
      }

      default:
        respond(conn, { error: `Unknown command: ${command}` });
    }
  } catch (e) {
    respond(conn, { error: e.message });
  }
}

module.exports = { start, stop, getSocketPath, parseBudgetStateConfig };
