'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const db = require('./db');
const allocatorCommands = require('./commands/allocator');
const architectCommands = require('./commands/architect');
const browserOffloadCommands = require('./commands/browser-offload');
const changeCommands = require('./commands/changes');
const cliProtocol = require('./cli-protocol');
const contextBundle = require('./context-bundle');
const domainAnalysisCommands = require('./commands/domain-analysis');
const extendedResearchCommands = require('./commands/extended-research');
const integrationCommands = require('./commands/integration');
const knowledgeCommands = require('./commands/knowledge');
const loopCommands = require('./commands/loop');
const memoryCommands = require('./commands/memory');
const mergeObservabilityCommands = require('./commands/merge-observability');
const mergeQueueService = require('./merge-queue-service');
const microvmCommands = require('./commands/microvm');
const researchQueueCommands = require('./commands/research-queue');
const sandboxCommands = require('./commands/sandbox');
const systemCommands = require('./commands/system');
const userCommands = require('./commands/user');
const workerCompletionCommands = require('./commands/worker-completion');
const workerFailureCommands = require('./commands/worker-failure');
const workerLifecycleCommands = require('./commands/worker-lifecycle');
const providerOutput = require('./provider-output');
const runtimeHealth = require('./runtime-health');
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

function parseBooleanConfig(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return fallback;
}

function getLoopSyncWithOriginConfig() {
  const envFallback = parseBooleanConfig(
    process.env.MAC10_LOOP_SYNC_WITH_ORIGIN ?? process.env.MAC10_LOOP_SYNC,
    true
  );
  return parseBooleanConfig(db.getConfig(LOOP_SYNC_WITH_ORIGIN_KEY), envFallback);
}

const SPARK_MODEL_KEYS = Object.freeze(['model_spark']);

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
  const sparkModel = getSparkModelConfigValue(getConfig, 'haiku');
  if (routingClass === 'spark') return sparkModel;
  if (routingClass === 'mini') return getConfigValue(getConfig, 'model_mini', sparkModel);
  return getConfigValue(getConfig, 'model_flagship', 'sonnet');
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
    /(tier[\s_-]*2|tier[\s_-]*3|build|lint|integration|e2e|npm\s+test|node\s+--test|jest|vitest|mocha|pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test)/i
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
let _serverStartedAt = null; // Set on start(), used by health-check

const NAMESPACE = process.env.MAC10_NAMESPACE || 'mac10';
const WORKER_LIMIT_MIN = 1;
const WORKER_LIMIT_MAX = 8;
const DEFAULT_WORKERS = 4;
const LEGACY_MAX_WORKERS_DEFAULT = 8;
const ROUTING_BUDGET_STATE_KEY = 'routing_budget_state';
const ROUTING_BUDGET_REMAINING_KEY = 'routing_budget_flagship_remaining';
const ROUTING_BUDGET_THRESHOLD_KEY = 'routing_budget_flagship_threshold';
const LEGACY_BUDGET_REMAINING_KEY = 'flagship_budget_remaining';
const LEGACY_BUDGET_THRESHOLD_KEY = 'flagship_budget_threshold';
const LOOP_SYNC_WITH_ORIGIN_KEY = 'loop_sync_with_origin';
const ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP = Object.freeze({
  [ROUTING_BUDGET_REMAINING_KEY]: LEGACY_BUDGET_REMAINING_KEY,
  [ROUTING_BUDGET_THRESHOLD_KEY]: LEGACY_BUDGET_THRESHOLD_KEY,
});
const LOOP_REQUEST_SET_CONFIG_SPECS = Object.freeze({
  [LOOP_SYNC_WITH_ORIGIN_KEY]: Object.freeze({ type: 'boolean' }),
  loop_request_quality_gate: Object.freeze({ type: 'boolean' }),
  loop_request_min_description_chars: Object.freeze({ type: 'int', min: 80, max: 5000 }),
  loop_request_min_interval_sec: Object.freeze({ type: 'int', min: 0, max: 86400 }),
  loop_request_max_per_hour: Object.freeze({ type: 'int', min: 1, max: 1000 }),
  loop_request_similarity_threshold: Object.freeze({ type: 'float', min: 0.5, max: 0.99 }),
});

function clampWorkerLimit(rawValue) {
  const parsed = parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_WORKERS;
  return Math.max(WORKER_LIMIT_MIN, Math.min(WORKER_LIMIT_MAX, parsed));
}

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

function normalizeCompleteTaskUsagePayload(rawUsage) {
  return providerOutput.normalizeUsagePayload(rawUsage, {
    projectDir: _projectDir || process.cwd(),
    provider: process.env.MAC10_AGENT_PROVIDER,
    errorStyle: 'server',
  });
}

function mapUsagePayloadToTaskFields(usage, taskRow = null) {
  return providerOutput.mapUsagePayloadToTaskFields(usage, taskRow, {
    projectDir: _projectDir || process.cwd(),
    provider: process.env.MAC10_AGENT_PROVIDER,
    errorStyle: 'server',
  });
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
  if (currentBranch) sourceRevision.current_branch = mergeQueueService.sanitizeBranchName(currentBranch) || currentBranch;

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
          cliProtocol.validateCommand(cmd, {
            normalizeTaskDomain,
            normalizeCompleteTaskUsagePayload,
          });
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
          cliProtocol.validateCommand(cmd, {
            normalizeTaskDomain,
            normalizeCompleteTaskUsagePayload,
          });
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
  _serverStartedAt = Date.now();
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
  const baseTcpPort = parseInt(process.env.MAC10_CLI_PORT) || derivedPort;
  const stateDir = path.join(projectDir, '.claude', 'state');
  const tcpHost = process.env.MAC10_CLI_HOST || '127.0.0.1';

  // Retry with port offset if the derived port is already in use (multi-project collision)
  function tryListenTcp(port, retries) {
    tcpServer = net.createServer(connHandler);
    tcpServer.listen(port, tcpHost, () => {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(stateDir, namespacedFile('mac10.tcp.port', `${NAMESPACE}.tcp.port`)),
        String(port),
        'utf8'
      );
      console.log(`CLI TCP bridge listening on ${tcpHost}:${port}`);
    });
    tcpServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && retries > 0) {
        console.warn(`TCP port ${port} in use, trying ${port + 1}...`);
        tcpServer = null;
        tryListenTcp(port + 1, retries - 1);
      } else {
        // Not fatal — Unix socket still works
        console.warn(`TCP bridge failed (port ${port}): ${e.message}`);
      }
    });
  }
  tryListenTcp(baseTcpPort, 10);

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
      case 'request':
      case 'fix':
      case 'status':
      case 'clarify':
      case 'log':
      case 'request-history': {
        const result = userCommands.handleUserCommand(command, args, {
          db,
          bridgeToHandoff,
          getSourceRevision,
          getSafeRequestHistory,
          modelRouter,
          projectDir: _projectDir,
        });
        respond(conn, result);
        break;
      }

      // === ARCHITECT commands ===
      case 'triage':
      case 'create-task':
      case 'tier1-complete':
      case 'ask-clarification': {
        const result = architectCommands.handleArchitectCommand(command, args, {
          db,
          parseFilesField,
          parseDependsOnField,
          normalizeOverlapIdsField,
        });
        respond(conn, result);
        break;
      }

      // === WORKER commands ===
      case 'my-task':
      case 'task-context':
      case 'context-bundle':
      case 'start-task':
      case 'heartbeat':
      case 'distill': {
        const result = workerLifecycleCommands.handleWorkerLifecycleCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
          contextBundle,
          collectCoordinatorHealth: (projectDir) => runtimeHealth.collectCoordinatorHealth({
            db,
            projectDir,
            namespace: NAMESPACE,
            serverStartedAt: _serverStartedAt,
          }),
          validateWorkerTaskOwnership,
          reopenFailedRequestForActiveRemediation,
          parseWorkerId,
        });
        respond(conn, result);
        break;
      }

      case 'complete-task': {
        const result = workerCompletionCommands.handleWorkerCompletionCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
          handlers,
          validateWorkerTaskOwnership,
          normalizeCompleteTaskUsagePayload,
          mapUsagePayloadToTaskFields,
          normalizePrUrl: mergeQueueService.normalizePrUrl,
          isValidGitHubPrUrl: mergeQueueService.isValidGitHubPrUrl,
          sanitizeBranchName: mergeQueueService.sanitizeBranchName,
          resolveCompletionBranch: mergeQueueService.resolveCompletionBranch,
          preQueueOverlapCheck: (taskId, changedFiles) => mergeQueueService.preQueueOverlapCheck({ db, taskId, changedFiles }),
          queueMergeWithRecovery: (options) => mergeQueueService.queueMergeWithRecovery({
            db,
            projectDir: _projectDir || process.cwd(),
            ...options,
          }),
          isMergeOwnershipCollisionReason: mergeQueueService.isMergeOwnershipCollisionReason,
        });
        respond(conn, result);
        break;
      }

      case 'fail-task': {
        const result = workerFailureCommands.handleWorkerFailureCommand(command, args, {
          db,
          validateWorkerTaskOwnership,
          normalizeCompleteTaskUsagePayload,
          mapUsagePayloadToTaskFields,
        });
        respond(conn, result);
        break;
      }

      case 'browser-create-session':
      case 'browser-attach-session':
      case 'browser-start-job':
      case 'browser-callback-chunk':
      case 'browser-complete-job':
      case 'browser-fail-job':
      case 'browser-job-status': {
        const result = browserOffloadCommands.handleBrowserOffloadCommand(command, args, {
          db,
          isPlainObject,
          utf8ByteLength,
          normalizePositiveInteger,
        });
        respond(conn, result);
        break;
      }

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
      case 'ready-tasks':
      case 'assign-task':
      case 'claim-worker':
      case 'release-worker':
      case 'worker-status':
      case 'check-completion':
      case 'check-overlaps':
      case 'replan-dependency': {
        const result = allocatorCommands.handleAllocatorCommand(command, args, {
          db,
          handlers,
          modelRouter,
          isWorkerClaimedAssignmentError,
          reopenFailedRequestForActiveRemediation,
        });
        respond(conn, result);
        break;
      }

      case 'task-sandbox-create':
      case 'task-sandbox-status':
      case 'task-sandbox-ready':
      case 'task-sandbox-start':
      case 'task-sandbox-stop':
      case 'task-sandbox-fail':
      case 'task-sandbox-clean':
      case 'task-sandbox-cleanup': {
        const result = sandboxCommands.handleTaskSandboxCommand(command, args, { db });
        respond(conn, result);
        break;
      }

      case 'integrate': {
        const result = integrationCommands.handleIntegrationCommand(command, args, {
          db,
          handlers,
          projectDir: _projectDir || process.cwd(),
          normalizePrUrl: mergeQueueService.normalizePrUrl,
          isValidGitHubPrUrl: mergeQueueService.isValidGitHubPrUrl,
          sanitizeBranchName: mergeQueueService.sanitizeBranchName,
          resolveCompletionBranch: mergeQueueService.resolveCompletionBranch,
          queueMergeWithRecovery: (options) => mergeQueueService.queueMergeWithRecovery({
            db,
            projectDir: _projectDir || process.cwd(),
            ...options,
          }),
          isMergeOwnershipCollisionReason: mergeQueueService.isMergeOwnershipCollisionReason,
        });
        respond(conn, result);
        break;
      }

      // === SYSTEM commands ===
      case 'register-worker':
      case 'repair':
      case 'purge-tasks':
      case 'ping':
      case 'health-check':
      case 'add-worker':
      case 'reset-worker': {
        const result = systemCommands.handleSystemCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
          collectCoordinatorHealth: () => runtimeHealth.collectCoordinatorHealth({
            db,
            projectDir: _projectDir || process.cwd(),
            namespace: NAMESPACE,
            serverStartedAt: _serverStartedAt,
          }),
          backfillSupersededLoopRequestsSafe,
          parseResetOwnership,
          getWorkerActiveAssignment,
        });
        respond(conn, result);
        break;
      }

      case 'merge-status': {
        const result = integrationCommands.handleIntegrationCommand(command, args, { db });
        respond(conn, result);
        break;
      }

      case 'log-change':
      case 'list-changes':
      case 'update-change': {
        const result = changeCommands.handleChangeCommand(command, args, { db, handlers });
        respond(conn, result);
        break;
      }

      // === LOOP commands ===
      case 'loop':
      case 'stop-loop':
      case 'loop-status':
      case 'loop-checkpoint':
      case 'loop-heartbeat':
      case 'set-config':
      case 'loop-prompt':
      case 'loop-refresh-prompt':
      case 'loop-set-prompt':
      case 'loop-request':
      case 'loop-requests': {
        const result = loopCommands.handleLoopCommand(command, args, {
          db,
          handlers,
          bridgeToHandoff,
          getLoopSyncWithOriginConfig,
          normalizeLoopRequestSetConfigValue,
          parseBudgetStateConfig,
          syncBudgetStateFromScalarFallback,
          clampWorkerLimit,
          constants: {
            LOOP_SYNC_WITH_ORIGIN_KEY,
            ROUTING_BUDGET_STATE_KEY,
            ROUTING_BUDGET_REMAINING_KEY,
            ROUTING_BUDGET_THRESHOLD_KEY,
            LEGACY_BUDGET_REMAINING_KEY,
            LEGACY_BUDGET_THRESHOLD_KEY,
            ROUTING_BUDGET_SCALAR_LEGACY_KEY_MAP,
            SPARK_MODEL_KEYS,
          },
        });
        respond(conn, result);
        break;
      }

      case 'queue-research':
      case 'research-status':
      case 'research-requeue-stale':
      case 'research-next':
      case 'research-start':
      case 'research-complete':
      case 'research-fail':
      case 'research-gaps':
      case 'research-retry-failed': {
        const result = researchQueueCommands.handleResearchQueueCommand(command, args, {
          db,
          projectDir: db.getConfig('project_dir') || process.cwd(),
        });
        respond(conn, result);
        break;
      }

      case 'memory-snapshots':
      case 'memory-snapshot':
      case 'memory-insights':
      case 'memory-insight':
      case 'memory-lineage': {
        const result = memoryCommands.handleMemoryCommand(command, args, { db });
        respond(conn, result);
        break;
      }

      // === MERGE OBSERVABILITY commands ===
      case 'merge-metrics':
      case 'merge-health': {
        const result = mergeObservabilityCommands.handleMergeObservabilityCommand(command, args, { db });
        respond(conn, result);
        break;
      }

      // === SANDBOX commands ===
      case 'sandbox-status':
      case 'sandbox-build':
      case 'sandbox-provider-smoke':
      case 'sandbox-cleanup':
      case 'sandbox-toggle': {
        const result = sandboxCommands.handleSandboxCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
        });
        respond(conn, result);
        break;
      }

      // === MICROVM (msb) commands ===
      case 'msb-status':
      case 'msb-setup':
      case 'msb-cleanup': {
        const result = microvmCommands.handleMicrovmCommand(command, args);
        respond(conn, result);
        break;
      }

      // === KNOWLEDGE LAYER commands ===
      case 'knowledge-status':
      case 'knowledge-health':
      case 'knowledge-increment':
      case 'knowledge-update-index-timestamp': {
        const result = knowledgeCommands.handleKnowledgeCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
        });
        respond(conn, result);
        break;
      }

      // === DOMAIN ANALYSIS commands ===

      case 'analyze-domain':
      case 'domain-analysis':
      case 'domain-analyses':
      case 'submit-domain-draft':
      case 'approve-domain':
      case 'reject-domain': {
        const result = domainAnalysisCommands.handleDomainAnalysisCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
        });
        respond(conn, result);
        break;
      }

      // === EXTENDED RESEARCH TOPIC commands ===

      case 'create-research-topic':
      case 'research-topic':
      case 'research-topics':
      case 'review-research-topic':
      case 'pending-reviews':
      case 'fill-knowledge': {
        const result = extendedResearchCommands.handleExtendedResearchCommand(command, args, {
          db,
          projectDir: _projectDir || process.cwd(),
        });
        respond(conn, result);
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
