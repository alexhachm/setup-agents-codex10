'use strict';

const NO_MERGE_RESULT_PATTERNS = [
  /\bno\s+prs?\s+to\s+merge\b/i,
  /\bno\s+pr\s+merges?\s+required\b/i,
];
const PLACEHOLDER_PR_TOKENS = new Set([
  'n/a',
  'na',
  'pending',
  'no-pr',
  'no_pr',
  'no pr',
  'not-created',
  'not_created',
  'not created',
]);

function resultIndicatesNoPrMerges(result) {
  if (typeof result !== 'string') return false;
  const normalized = result.trim();
  if (!normalized) return false;
  return NO_MERGE_RESULT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function normalizePrToken(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function isPlaceholderPrToken(prUrl) {
  const normalized = normalizePrToken(prUrl);
  if (!normalized) return false;
  if (PLACEHOLDER_PR_TOKENS.has(normalized)) return true;
  // Backward-compatibility for values like "N / A".
  return normalized.replace(/[-/]+/g, '') === 'na';
}

function requestMetadataIndicatesNoPrCompletion(request) {
  if (!request) return false;
  return resultIndicatesNoPrMerges(request.result);
}

function isNoMergeTerminalIntegratingRequest(request) {
  if (!request || !request.completed_at) return false;
  return resultIndicatesNoPrMerges(request.result);
}

module.exports = {
  isPlaceholderPrToken,
  resultIndicatesNoPrMerges,
  requestMetadataIndicatesNoPrCompletion,
  isNoMergeTerminalIntegratingRequest,
};
