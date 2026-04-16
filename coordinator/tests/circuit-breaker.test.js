'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { CircuitBreaker, STATES, getBreaker, getAllStatus, resetAll, clear } = require('../src/circuit-breaker');

beforeEach(() => {
  clear();
});

describe('CircuitBreaker', () => {
  it('should start in CLOSED state', () => {
    const cb = new CircuitBreaker('test-provider');
    assert.strictEqual(cb.state, STATES.CLOSED);
    assert.strictEqual(cb.canExecute(), true);
  });

  it('should stay CLOSED below failure threshold', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 503 });
    assert.strictEqual(cb.state, STATES.CLOSED);
    assert.strictEqual(cb.canExecute(), true);
  });

  it('should transition to OPEN after 3 failures in 60s', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 503 });
    cb.recordFailure({ statusCode: 429 });
    assert.strictEqual(cb.state, STATES.OPEN);
    assert.strictEqual(cb.canExecute(), false);
  });

  it('should not count permanent errors toward circuit breaking', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordFailure({ statusCode: 400 });
    cb.recordFailure({ statusCode: 401 });
    cb.recordFailure({ statusCode: 403 });
    cb.recordFailure({ statusCode: 404 });
    assert.strictEqual(cb.state, STATES.CLOSED);
  });

  it('should transition to HALF_OPEN after reset timeout', () => {
    const cb = new CircuitBreaker('test-provider', { resetTimeoutMs: 0 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    assert.strictEqual(cb.state, STATES.OPEN);
    // With resetTimeoutMs: 0, should immediately transition
    assert.strictEqual(cb.canExecute(), true);
    assert.strictEqual(cb.state, STATES.HALF_OPEN);
  });

  it('should recover from HALF_OPEN on success', () => {
    const cb = new CircuitBreaker('test-provider', { resetTimeoutMs: 0 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    cb.canExecute(); // transitions to HALF_OPEN
    cb.recordSuccess(100);
    assert.strictEqual(cb.state, STATES.CLOSED);
  });

  it('should revert to OPEN from HALF_OPEN on failure', () => {
    const cb = new CircuitBreaker('test-provider', { resetTimeoutMs: 0 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    cb.canExecute(); // transitions to HALF_OPEN
    cb.recordFailure({ statusCode: 500 });
    assert.strictEqual(cb.state, STATES.OPEN);
  });

  it('should track EMA latency', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordSuccess(100);
    assert.strictEqual(cb.ema.latency, 100);
    cb.recordSuccess(200);
    assert.ok(cb.ema.latency > 100 && cb.ema.latency < 200);
  });

  it('should track EMA error rate', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordSuccess(100);
    assert.strictEqual(cb.ema.errorRate, 0);
    cb.recordFailure({ statusCode: 500 });
    assert.ok(cb.ema.errorRate > 0);
  });

  it('should return status', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordSuccess(100);
    const status = cb.getStatus();
    assert.strictEqual(status.name, 'test-provider');
    assert.strictEqual(status.state, STATES.CLOSED);
    assert.strictEqual(status.totalCount, 1);
    assert.strictEqual(status.successCount, 1);
  });

  it('should reset to CLOSED', () => {
    const cb = new CircuitBreaker('test-provider');
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    cb.recordFailure({ statusCode: 500 });
    assert.strictEqual(cb.state, STATES.OPEN);
    cb.reset();
    assert.strictEqual(cb.state, STATES.CLOSED);
    assert.strictEqual(cb.failures.length, 0);
  });
});

describe('CircuitBreaker Registry', () => {
  it('should create and retrieve breakers by name', () => {
    const b = getBreaker('anthropic');
    assert.strictEqual(b.name, 'anthropic');
    const b2 = getBreaker('anthropic');
    assert.strictEqual(b, b2); // same instance
  });

  it('should return all statuses', () => {
    getBreaker('openai');
    getBreaker('anthropic');
    const statuses = getAllStatus();
    assert.ok('openai' in statuses);
    assert.ok('anthropic' in statuses);
  });

  it('should reset all breakers', () => {
    const b = getBreaker('test');
    b.recordFailure({ statusCode: 500 });
    b.recordFailure({ statusCode: 500 });
    b.recordFailure({ statusCode: 500 });
    assert.strictEqual(b.state, STATES.OPEN);
    resetAll();
    assert.strictEqual(b.state, STATES.CLOSED);
  });
});
