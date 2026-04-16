'use strict';

/**
 * Error Classifier — categorize API errors as retryable vs permanent.
 * Feeds classification data into the circuit breaker.
 */

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 405, 410, 422]);

const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
  'EHOSTUNREACH', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT',
]);

function classify(error) {
  const statusCode = error.statusCode || error.status || null;
  const code = error.code || null;
  const message = String(error.message || '');

  // Status code based classification
  if (statusCode) {
    if (RETRYABLE_STATUS_CODES.has(statusCode)) {
      return {
        retryable: true,
        category: 'server_error',
        statusCode,
        reason: `HTTP ${statusCode} is retryable`,
      };
    }
    if (PERMANENT_STATUS_CODES.has(statusCode)) {
      return {
        retryable: false,
        category: statusCode === 401 || statusCode === 403 ? 'auth_error' : 'client_error',
        statusCode,
        reason: `HTTP ${statusCode} is permanent`,
      };
    }
  }

  // Node.js error code based classification
  if (code && RETRYABLE_ERROR_CODES.has(code)) {
    return {
      retryable: true,
      category: 'network_error',
      code,
      reason: `Network error ${code} is retryable`,
    };
  }

  // Timeout detection from message
  if (/timeout/i.test(message)) {
    return {
      retryable: true,
      category: 'timeout',
      reason: 'Timeout errors are retryable',
    };
  }

  // Rate limit detection from message
  if (/rate.?limit/i.test(message) || /too many requests/i.test(message)) {
    return {
      retryable: true,
      category: 'rate_limit',
      reason: 'Rate limit errors are retryable',
    };
  }

  // Default: unknown errors are retryable (conservative)
  return {
    retryable: true,
    category: 'unknown',
    reason: 'Unknown errors default to retryable',
  };
}

function isRetryable(error) {
  return classify(error).retryable;
}

function isPermanent(error) {
  return !classify(error).retryable;
}

module.exports = {
  classify,
  isRetryable,
  isPermanent,
  RETRYABLE_STATUS_CODES,
  PERMANENT_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
};
