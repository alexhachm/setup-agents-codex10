'use strict';

const NO_MERGE_RESULT_PATTERNS = [
  /\bno\s+prs?\s+to\s+merge\b/i,
  /\bno\s+pr\s+merges?\s+required\b/i,
];

const MERGE_FAILURE_CATEGORIES = Object.freeze({
  PREFLIGHT_PATH: 'preflight_path',
  PREFLIGHT_TOOLING: 'preflight_tooling',
  PREFLIGHT_AUTH: 'preflight_auth',
  PREFLIGHT_NETWORK: 'preflight_network',
  INFRA_TOOLING: 'infra_tooling',
  INFRA_AUTH: 'infra_auth',
  INFRA_NETWORK: 'infra_network',
  INFRA_TIMEOUT: 'infra_timeout',
  MERGE_CONFLICT: 'merge_conflict',
  FUNCTIONAL_CONFLICT: 'functional_conflict',
  UNKNOWN: 'unknown',
});

const MERGE_FAILURE_POLICY = Object.freeze({
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_PATH]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_TOOLING]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_AUTH]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_NETWORK]: {
    retryable: true,
    max_retries: 2,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.INFRA_TOOLING]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.INFRA_AUTH]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.INFRA_NETWORK]: {
    retryable: true,
    max_retries: 2,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.INFRA_TIMEOUT]: {
    retryable: true,
    max_retries: 2,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.MERGE_CONFLICT]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'conflict',
  },
  [MERGE_FAILURE_CATEGORIES.FUNCTIONAL_CONFLICT]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
  [MERGE_FAILURE_CATEGORIES.UNKNOWN]: {
    retryable: false,
    max_retries: 0,
    escalate: true,
    final_status: 'failed',
  },
});

const ROOT_CAUSE_BY_CATEGORY = Object.freeze({
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_PATH]: 'infra.path_unavailable',
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_TOOLING]: 'infra.tooling_unavailable',
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_AUTH]: 'infra.auth_unavailable',
  [MERGE_FAILURE_CATEGORIES.PREFLIGHT_NETWORK]: 'infra.network_preflight_unavailable',
  [MERGE_FAILURE_CATEGORIES.INFRA_TOOLING]: 'infra.tooling_failure',
  [MERGE_FAILURE_CATEGORIES.INFRA_AUTH]: 'infra.auth_failure',
  [MERGE_FAILURE_CATEGORIES.INFRA_NETWORK]: 'infra.network_failure',
  [MERGE_FAILURE_CATEGORIES.INFRA_TIMEOUT]: 'infra.timeout',
  [MERGE_FAILURE_CATEGORIES.MERGE_CONFLICT]: 'merge.conflict',
  [MERGE_FAILURE_CATEGORIES.FUNCTIONAL_CONFLICT]: 'merge.functional_conflict',
  [MERGE_FAILURE_CATEGORIES.UNKNOWN]: 'merge.unknown',
});

const TOOLING_PATTERNS = [
  /\benoent\b/i,
  /\bnot found\b/i,
  /\bcommand not found\b/i,
  /\bspawn\b/i,
];
const AUTH_PATTERNS = [
  /\bauth(?:entication)?\b/i,
  /\bnot logged in\b/i,
  /\bunauthorized\b/i,
  /\bforbidden\b/i,
  /\b401\b/i,
  /\b403\b/i,
];
const NETWORK_PATTERNS = [
  /\benotfound\b/i,
  /\beconnreset\b/i,
  /\beai_again\b/i,
  /\bnetwork\b/i,
  /\brate limit\b/i,
];
const TIMEOUT_PATTERNS = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\betimedout\b/i,
];

function resultIndicatesNoPrMerges(result) {
  if (typeof result !== 'string') return false;
  const normalized = result.trim();
  if (!normalized) return false;
  return NO_MERGE_RESULT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isNoMergeTerminalIntegratingRequest(request) {
  if (!request || !request.completed_at) return false;
  return resultIndicatesNoPrMerges(request.result);
}

function normalizeErrorMessage(error) {
  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed || 'unknown_error';
  }
  if (error && typeof error.message === 'string') {
    const trimmed = error.message.trim();
    return trimmed || 'unknown_error';
  }
  return String(error || 'unknown_error');
}

function inferCategoryFromError(error) {
  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(error))) {
    return MERGE_FAILURE_CATEGORIES.INFRA_TIMEOUT;
  }
  if (AUTH_PATTERNS.some((pattern) => pattern.test(error))) {
    return MERGE_FAILURE_CATEGORIES.INFRA_AUTH;
  }
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(error))) {
    return MERGE_FAILURE_CATEGORIES.INFRA_NETWORK;
  }
  if (TOOLING_PATTERNS.some((pattern) => pattern.test(error))) {
    return MERGE_FAILURE_CATEGORIES.INFRA_TOOLING;
  }
  return MERGE_FAILURE_CATEGORIES.UNKNOWN;
}

function classifyMergeFailure(result = {}) {
  const errorMessage = normalizeErrorMessage(result.error);
  const normalizedCategory = typeof result.category === 'string'
    ? result.category.trim().toLowerCase()
    : '';
  const categoryValues = new Set(Object.values(MERGE_FAILURE_CATEGORIES));

  let category = MERGE_FAILURE_CATEGORIES.UNKNOWN;
  if (result.functional_conflict === true) {
    category = MERGE_FAILURE_CATEGORIES.FUNCTIONAL_CONFLICT;
  } else if (result.conflict === true) {
    category = MERGE_FAILURE_CATEGORIES.MERGE_CONFLICT;
  } else if (categoryValues.has(normalizedCategory)) {
    category = normalizedCategory;
  } else {
    category = inferCategoryFromError(errorMessage);
  }

  return {
    category,
    root_cause: ROOT_CAUSE_BY_CATEGORY[category] || ROOT_CAUSE_BY_CATEGORY[MERGE_FAILURE_CATEGORIES.UNKNOWN],
    error: errorMessage,
  };
}

function getMergeFailurePolicy(category) {
  return MERGE_FAILURE_POLICY[category] || MERGE_FAILURE_POLICY[MERGE_FAILURE_CATEGORIES.UNKNOWN];
}

module.exports = {
  resultIndicatesNoPrMerges,
  isNoMergeTerminalIntegratingRequest,
  MERGE_FAILURE_CATEGORIES,
  classifyMergeFailure,
  getMergeFailurePolicy,
  normalizeErrorMessage,
};
