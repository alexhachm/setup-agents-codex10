'use strict';

/**
 * Provider Fallback — executes a function against a provider chain.
 * On failure, falls through to the next provider in the chain.
 */

const settingsManager = require('./settings-manager');

const MAX_RETRIES_PER_PROVIDER = 2;
const RETRY_DELAY_MS = 1000;

class ProviderError extends Error {
  constructor(message, provider, statusCode) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with provider fallback.
 * @param {Object} resolution - Output from modelRouter.resolveWithFallback()
 * @param {Function} fn - async (provider, model) => result
 * @param {Object} opts - { maxRetries, retryDelayMs, onFallback }
 * @returns {Promise<Object>} - { result, provider, model, attempts }
 */
async function execute(resolution, fn, opts = {}) {
  const maxRetries = opts.maxRetries || MAX_RETRIES_PER_PROVIDER;
  const retryDelayMs = opts.retryDelayMs || RETRY_DELAY_MS;
  const onFallback = opts.onFallback || (() => {});

  const chain = [
    { provider: resolution.provider, model: resolution.model },
    ...(resolution.fallbacks || []),
  ];

  const errors = [];
  let totalAttempts = 0;

  for (const { provider, model } of chain) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      totalAttempts++;
      try {
        const result = await fn(provider, model);
        return { result, provider, model, attempts: totalAttempts };
      } catch (err) {
        errors.push({ provider, model, attempt, error: err.message || String(err) });

        // Rate limit or server error — retry with delay
        const statusCode = err.statusCode || err.status;
        if (statusCode === 429 || (statusCode >= 500 && statusCode < 600)) {
          if (attempt < maxRetries) {
            await sleep(retryDelayMs * attempt);
            continue;
          }
        }

        // Client error (4xx except 429) — don't retry, go to next provider
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          break;
        }

        // Unknown error — retry
        if (attempt < maxRetries) {
          await sleep(retryDelayMs);
          continue;
        }
      }
    }

    // Notify about fallback
    if (chain.indexOf({ provider, model }) < chain.length - 1) {
      onFallback(provider, model, errors[errors.length - 1]);
    }
  }

  // All providers exhausted
  const lastError = errors[errors.length - 1];
  throw new ProviderError(
    `All providers exhausted after ${totalAttempts} attempts. Last error: ${lastError ? lastError.error : 'unknown'}`,
    lastError ? lastError.provider : 'unknown',
    503
  );
}

/**
 * Synchronous version for dev-mode (no fallback needed).
 */
function executeSync(resolution, fn) {
  return fn(resolution.provider, resolution.model);
}

module.exports = {
  execute,
  executeSync,
  ProviderError,
  MAX_RETRIES_PER_PROVIDER,
  RETRY_DELAY_MS,
};
