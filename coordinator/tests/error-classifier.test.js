'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { classify, isRetryable, isPermanent } = require('../src/error-classifier');

describe('Error Classifier', () => {
  it('should classify 429 as retryable rate_limit', () => {
    const result = classify({ statusCode: 429 });
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.category, 'server_error');
  });

  it('should classify 500 as retryable server error', () => {
    const result = classify({ statusCode: 500 });
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.category, 'server_error');
  });

  it('should classify 503 as retryable', () => {
    assert.strictEqual(isRetryable({ statusCode: 503 }), true);
  });

  it('should classify 502 as retryable', () => {
    assert.strictEqual(isRetryable({ statusCode: 502 }), true);
  });

  it('should classify 504 as retryable', () => {
    assert.strictEqual(isRetryable({ statusCode: 504 }), true);
  });

  it('should classify 400 as permanent client error', () => {
    const result = classify({ statusCode: 400 });
    assert.strictEqual(result.retryable, false);
    assert.strictEqual(result.category, 'client_error');
  });

  it('should classify 401 as permanent auth error', () => {
    const result = classify({ statusCode: 401 });
    assert.strictEqual(result.retryable, false);
    assert.strictEqual(result.category, 'auth_error');
  });

  it('should classify 403 as permanent auth error', () => {
    assert.strictEqual(isPermanent({ statusCode: 403 }), true);
  });

  it('should classify 404 as permanent', () => {
    assert.strictEqual(isPermanent({ statusCode: 404 }), true);
  });

  it('should classify ECONNRESET as retryable network error', () => {
    const result = classify({ code: 'ECONNRESET' });
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.category, 'network_error');
  });

  it('should classify ETIMEDOUT as retryable network error', () => {
    const result = classify({ code: 'ETIMEDOUT' });
    assert.strictEqual(result.retryable, true);
  });

  it('should classify timeout messages as retryable', () => {
    const result = classify({ message: 'Request timeout after 30000ms' });
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.category, 'timeout');
  });

  it('should classify rate limit messages as retryable', () => {
    const result = classify({ message: 'Rate limit exceeded' });
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.category, 'rate_limit');
  });

  it('should default unknown errors to retryable', () => {
    const result = classify({ message: 'Something unexpected happened' });
    assert.strictEqual(result.retryable, true);
    assert.strictEqual(result.category, 'unknown');
  });

  it('should handle empty errors', () => {
    const result = classify({});
    assert.strictEqual(result.retryable, true);
  });
});
