'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Sprint 0: Resilience Layer Integration', () => {
  it('should wire circuit breaker into provider fallback', () => {
    const circuitBreaker = require('../src/circuit-breaker');
    const errorClassifier = require('../src/error-classifier');

    // Simulate provider failure chain
    const breaker = circuitBreaker.getBreaker('test-provider-integration');
    const error = { statusCode: 500, message: 'Internal Server Error' };
    const classification = errorClassifier.classify(error);
    assert.strictEqual(classification.retryable, true);

    // Record failures until circuit opens
    breaker.recordFailure(error);
    breaker.recordFailure(error);
    breaker.recordFailure(error);
    assert.strictEqual(breaker.canExecute(), false);

    circuitBreaker.clear();
  });

  it('should track loop detection across tasks', () => {
    const loopDetector = require('../src/loop-detector');
    loopDetector.resetAll();

    // Simulate 160 tool calls (warning zone)
    for (let i = 0; i < 160; i++) {
      loopDetector.recordToolCall('integration-task');
    }
    assert.strictEqual(loopDetector.isWarning('integration-task'), true);

    // Simulate reaching limit
    for (let i = 0; i < 40; i++) {
      loopDetector.recordToolCall('integration-task');
    }
    assert.strictEqual(loopDetector.isOverLimit('integration-task'), true);
    loopDetector.resetAll();
  });

  it('should classify errors and feed to circuit breaker', () => {
    const circuitBreaker = require('../src/circuit-breaker');
    const errorClassifier = require('../src/error-classifier');
    circuitBreaker.clear();

    const breaker = circuitBreaker.getBreaker('classifier-test');

    // Permanent errors should not trip the circuit
    const perm = errorClassifier.classify({ statusCode: 404 });
    assert.strictEqual(perm.retryable, false);
    breaker.recordFailure({ statusCode: 404 });
    breaker.recordFailure({ statusCode: 401 });
    breaker.recordFailure({ statusCode: 403 });
    assert.strictEqual(breaker.state, 'CLOSED'); // permanent errors don't count

    // Retryable errors should trip the circuit
    breaker.recordFailure({ statusCode: 500 });
    breaker.recordFailure({ statusCode: 502 });
    breaker.recordFailure({ statusCode: 503 });
    assert.strictEqual(breaker.state, 'OPEN');

    circuitBreaker.clear();
  });
});
