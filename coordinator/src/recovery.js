'use strict';

const NO_MERGE_RESULT_PATTERNS = [
  /\bno\s+prs?\s+to\s+merge\b/i,
  /\bno\s+pr\s+merges?\s+required\b/i,
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

module.exports = {
  resultIndicatesNoPrMerges,
  isNoMergeTerminalIntegratingRequest,
};
