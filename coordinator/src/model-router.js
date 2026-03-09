'use strict';

const FLAGSHIP_CLASSES = new Set(['xhigh', 'high', 'mid']);
const DOC_DOMAINS = new Set([
  'documentation',
  'reporting',
  'docs',
  'changelog',
  'readme',
]);
const HIGH_RISK_DOMAINS = new Set([
  'trade-execution',
  'trade',
  'ws-infra',
  'coordinator',
  'integration',
  'security',
  'auth',
  'shell-state',
  'shell-windows',
  'hotkeys',
]);

const HIGH_COMPLEXITY_PATTERNS = [
  'architecture',
  'architect',
  'decompose',
  'integration',
  'merge conflict',
  'conflict',
  'refactor',
  'migration',
  'trading',
  'execution',
  'risk',
  'calibration',
  'algorithm',
  'concurrency',
  'state machine',
  'websocket',
  'safety',
  'high-value',
  'creative',
];

const LOW_COMPLEXITY_PATTERNS = [
  'typo',
  'spelling',
  'rename',
  'copy edit',
  'docs',
  'readme',
  'format',
  'comment',
  'label',
  'wording',
  'report',
  'backlog',
  'finalize',
  'publish',
];

const MONOTONOUS_PATTERNS = [
  'mechanical',
  'boilerplate',
  'monot',
  'bulk replace',
  'string replace',
];

const DEFAULT_MODELS = Object.freeze({
  flagship: 'gpt-5.3-codex',
  codexSpark: 'gpt-5.3-codex-spark',
  spark: 'gpt-5.3-codex-spark',
  mini: 'gpt-5.1-codex-mini',
});

const DEFAULT_REASONING = Object.freeze({
  xhigh: 'xhigh',
  high: 'high',
  mid: 'mid',
  spark: 'low',
  mini: 'low',
});

const BUDGET_STATE_KEY = 'routing_budget_state';
const FLAGSHIP_BUDGET_REMAINING_KEYS = ['routing_budget_flagship_remaining', 'flagship_budget_remaining'];
const FLAGSHIP_BUDGET_THRESHOLD_KEYS = ['routing_budget_flagship_threshold', 'flagship_budget_threshold'];
const SMALL_MODEL_ORDER = Object.freeze(['codex-spark', 'spark', 'mini']);
const TOKEN_BUDGET_LEVELS = Object.freeze({
  tiny: 0,
  small: 1,
  medium: 2,
  large: 3,
});

function safeLower(value) {
  return String(value || '').toLowerCase();
}

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function parseFiles(filesField) {
  if (!filesField) return [];
  if (Array.isArray(filesField)) return filesField.filter(Boolean);
  if (typeof filesField === 'string') {
    try {
      const parsed = JSON.parse(filesField);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {}
    return filesField
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
  }
  return [];
}

function parseManualClass(description) {
  const text = String(description || '');
  const match = text.match(/\bMODEL(?:_CLASS)?\s*:\s*(xhigh|high|mid|spark|mini)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function normalizeTokenBudget(rawValue) {
  if (rawValue === undefined || rawValue === null) return null;
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    if (rawValue <= 8000) return 'tiny';
    if (rawValue <= 24000) return 'small';
    if (rawValue <= 64000) return 'medium';
    return 'large';
  }
  const value = String(rawValue).trim().toLowerCase();
  if (!value) return null;
  if (/^\d+$/.test(value)) return normalizeTokenBudget(Number(value));
  if (value === 'tiny' || value === 'micro') return 'tiny';
  if (value === 'small' || value === 'low') return 'small';
  if (value === 'medium' || value === 'mid' || value === 'moderate') return 'medium';
  if (value === 'large' || value === 'high' || value === 'xl') return 'large';
  return null;
}

function parseTokenBudget(task) {
  const structuredCandidates = [
    task && task.token_budget,
    task && task.tokenBudget,
    task && task.context_budget,
    task && task.contextBudget,
    task && task.max_context_tokens,
  ];
  for (const candidate of structuredCandidates) {
    const normalized = normalizeTokenBudget(candidate);
    if (normalized) return normalized;
  }
  const text = `${task && task.subject ? task.subject : ''}\n${task && task.description ? task.description : ''}`;
  const taggedBudget = text.match(/\bTOKEN(?:_BUDGET| BUDGET)?\s*[:=]\s*([a-zA-Z0-9_-]+)\b/i);
  if (taggedBudget) {
    const normalized = normalizeTokenBudget(taggedBudget[1]);
    if (normalized) return normalized;
  }
  return null;
}

function parseTaskProfile(task, classification) {
  const subject = String(task.subject || '');
  const description = String(task.description || '');
  const text = `${subject}\n${description}`.toLowerCase();
  const domain = safeLower(task.domain);
  const tier = Number(task.tier || 0);
  const fallbackFileCount = parseFiles(task.files).length;
  const fileCount = Number.isInteger(classification && classification.file_count)
    ? classification.file_count
    : fallbackFileCount;
  const hasHighComplexity = includesAny(text, HIGH_COMPLEXITY_PATTERNS);
  const hasLowComplexity = includesAny(text, LOW_COMPLEXITY_PATTERNS);
  const likelyMonotonous =
    includesAny(text, MONOTONOUS_PATTERNS) ||
    ((domain && DOC_DOMAINS.has(domain)) && tier <= 2 && fileCount <= 2);
  return {
    tier,
    fileCount,
    hasHighComplexity,
    hasLowComplexity,
    likelyMonotonous,
  };
}

function stableUnique(values) {
  const seen = new Set();
  const ordered = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

function resolveSmallModelOrder(routingClass, tokenBudget, profile) {
  const budgetRank = tokenBudget ? TOKEN_BUDGET_LEVELS[tokenBudget] : null;
  const tinyBudget = budgetRank !== null && budgetRank <= TOKEN_BUDGET_LEVELS.tiny;
  const sparkBudget = budgetRank !== null && budgetRank >= TOKEN_BUDGET_LEVELS.medium;
  const sparkProfile =
    profile.hasHighComplexity ||
    (profile.tier >= 2 && !profile.hasLowComplexity) ||
    (!profile.likelyMonotonous && profile.fileCount >= 2);
  const miniProfile = profile.likelyMonotonous && profile.hasLowComplexity && !profile.hasHighComplexity;
  const preferMini = routingClass === 'mini' && (tinyBudget || (miniProfile && !sparkBudget));
  const preferCodexSpark = routingClass === 'spark' || (!preferMini && (sparkBudget || sparkProfile));

  const preferred = [];
  if (preferCodexSpark) preferred.push('codex-spark');
  if (preferMini) preferred.push('mini');

  // Deterministic tie-break: use fixed fallback order after profile-specific preferences.
  return stableUnique([...preferred, ...SMALL_MODEL_ORDER]);
}

function classifyTask(task) {
  const subject = String(task.subject || '');
  const description = String(task.description || '');
  const domain = safeLower(task.domain);
  const text = `${subject}\n${description}`.toLowerCase();
  const files = parseFiles(task.files);
  const fileCount = files.length;
  const tier = Number(task.tier || 0);
  const priority = safeLower(task.priority || 'normal');
  const manualClass = parseManualClass(description);
  const reasons = [];
  let sawHighComplexity = false;
  let sawLowComplexity = false;

  if (manualClass) {
    reasons.push(`manual override MODEL_CLASS:${manualClass}`);
    return {
      routing_class: manualClass,
      score: null,
      reasons,
      file_count: fileCount,
    };
  }

  let score = 0;

  if (tier >= 3) {
    score += 3;
    reasons.push('tier 3 task');
  } else if (tier === 2) {
    score += 1;
    reasons.push('tier 2 task');
  }

  if (priority === 'urgent') {
    score += 3;
    reasons.push('urgent priority');
  } else if (priority === 'high') {
    score += 1;
    reasons.push('high priority');
  } else if (priority === 'low') {
    score -= 1;
    reasons.push('low priority');
  }

  if (fileCount >= 8) {
    score += 2;
    reasons.push(`large file surface (${fileCount})`);
  } else if (fileCount >= 4) {
    score += 1;
    reasons.push(`multi-file change (${fileCount})`);
  } else if (fileCount > 0 && fileCount <= 2) {
    score -= 1;
    reasons.push(`small file surface (${fileCount})`);
  }

  if (domain && HIGH_RISK_DOMAINS.has(domain)) {
    score += 2;
    reasons.push(`high-risk domain (${domain})`);
  }

  if (domain && DOC_DOMAINS.has(domain)) {
    score -= 2;
    reasons.push(`documentation/reporting domain (${domain})`);
  }

  if (includesAny(text, HIGH_COMPLEXITY_PATTERNS)) {
    score += 2;
    sawHighComplexity = true;
    reasons.push('high-complexity language detected');
  }

  if (includesAny(text, LOW_COMPLEXITY_PATTERNS)) {
    score -= 1;
    sawLowComplexity = true;
    reasons.push('low-complexity language detected');
  }

  const likelyMonotonous =
    includesAny(text, MONOTONOUS_PATTERNS) ||
    ((domain && DOC_DOMAINS.has(domain)) && tier <= 2 && fileCount <= 2);

  const safeMiniCandidate =
    !sawHighComplexity &&
    (sawLowComplexity || likelyMonotonous) &&
    domain &&
    DOC_DOMAINS.has(domain) &&
    !HIGH_RISK_DOMAINS.has(domain) &&
    priority !== 'high' &&
    priority !== 'urgent' &&
    tier <= 2 &&
    fileCount <= 2;

  let routingClass;
  if (safeMiniCandidate && score <= 0) {
    routingClass = 'mini';
    reasons.push('safe mini candidate (docs-only + low-risk + low-complexity)');
  } else if (score >= 7) {
    routingClass = 'xhigh';
  } else if (score >= 4) {
    routingClass = 'high';
  } else if (score >= 2) {
    routingClass = 'mid';
  } else if (score >= 0) {
    routingClass = 'spark';
  } else {
    routingClass = 'spark';
  }

  // Guardrails: never drop risky tier-3 work below mid.
  if (tier >= 3 && routingClass === 'spark') {
    routingClass = 'mid';
    reasons.push('tier-3 floor to mid');
  }
  if (tier >= 3 && routingClass === 'mini') {
    routingClass = 'mid';
    reasons.push('tier-3 floor to mid');
  }
  if (HIGH_RISK_DOMAINS.has(domain) && routingClass === 'mini') {
    routingClass = 'spark';
    reasons.push(`high-risk domain floor to spark (${domain})`);
  }

  return {
    routing_class: routingClass,
    score,
    reasons,
    file_count: fileCount,
  };
}

function getConfigValue(getConfig, key, fallback) {
  if (typeof getConfig !== 'function') return fallback;
  const value = getConfig(key);
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return String(value).trim();
}

function resolveModel(routingClass, getConfig, task = {}, classification = null) {
  if (routingClass === 'mini' || routingClass === 'spark') {
    const tokenBudget = parseTokenBudget(task || {});
    const profile = parseTaskProfile(task || {}, classification);
    const order = resolveSmallModelOrder(routingClass, tokenBudget, profile);
    const smallModels = {
      'codex-spark': getConfigValue(getConfig, 'model_codex_spark', DEFAULT_MODELS.codexSpark),
      spark: getConfigValue(getConfig, 'model_spark', DEFAULT_MODELS.spark),
      mini: getConfigValue(getConfig, 'model_mini', DEFAULT_MODELS.mini),
    };
    for (const candidate of order) {
      const model = smallModels[candidate];
      if (model) return model;
    }
    return DEFAULT_MODELS.codexSpark;
  }
  // xhigh/high/mid all default to flagship model.
  const classSpecific = getConfigValue(getConfig, `model_${routingClass}`, '');
  if (classSpecific) return classSpecific;
  return getConfigValue(getConfig, 'model_flagship', DEFAULT_MODELS.flagship);
}

function resolveReasoningEffort(routingClass, getConfig) {
  return getConfigValue(
    getConfig,
    `reasoning_${routingClass}`,
    DEFAULT_REASONING[routingClass] || DEFAULT_REASONING.mid
  );
}

function routeTask(task, opts = {}) {
  const { getConfig } = opts;
  const classification = classifyTask(task || {});
  const model = resolveModel(classification.routing_class, getConfig, task || {}, classification);
  const reasoning_effort = resolveReasoningEffort(classification.routing_class, getConfig);
  return {
    ...classification,
    model,
    reasoning_effort,
    reason: classification.reasons.join('; ').slice(0, 400),
  };
}

module.exports = {
  routeTask,
  classifyTask,
  resolveModel,
  resolveReasoningEffort,
  FLAGSHIP_CLASSES,
};
