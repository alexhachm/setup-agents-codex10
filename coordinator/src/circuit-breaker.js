'use strict';

/**
 * Circuit Breaker — per-provider circuit breaker with EMA-guided routing.
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 * 3 failures in 60s → OPEN, probe after 30s.
 */

const errorClassifier = require('./error-classifier');

const STATES = Object.freeze({
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

const DEFAULT_OPTIONS = {
  failureThreshold: 3,
  failureWindowMs: 60000,
  resetTimeoutMs: 30000,
  halfOpenMaxAttempts: 1,
  emaAlpha: 0.3,
};

class CircuitBreaker {
  constructor(name, opts = {}) {
    this.name = name;
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.state = STATES.CLOSED;
    this.failures = [];
    this.lastFailureAt = null;
    this.openedAt = null;
    this.halfOpenAttempts = 0;
    this.successCount = 0;
    this.totalCount = 0;
    // EMA signals for quality routing
    this.ema = {
      latency: null,
      errorRate: null,
    };
  }

  _pruneOldFailures() {
    const cutoff = Date.now() - this.opts.failureWindowMs;
    this.failures = this.failures.filter(ts => ts > cutoff);
  }

  _updateEma(field, value) {
    const alpha = this.opts.emaAlpha;
    if (this.ema[field] === null) {
      this.ema[field] = value;
    } else {
      this.ema[field] = alpha * value + (1 - alpha) * this.ema[field];
    }
  }

  canExecute() {
    if (this.state === STATES.CLOSED) return true;
    if (this.state === STATES.OPEN) {
      if (Date.now() - this.openedAt >= this.opts.resetTimeoutMs) {
        this.state = STATES.HALF_OPEN;
        this.halfOpenAttempts = 0;
        return true;
      }
      return false;
    }
    if (this.state === STATES.HALF_OPEN) {
      return this.halfOpenAttempts < this.opts.halfOpenMaxAttempts;
    }
    return false;
  }

  recordSuccess(latencyMs) {
    this.totalCount++;
    this.successCount++;
    if (latencyMs != null) this._updateEma('latency', latencyMs);
    this._updateEma('errorRate', 0);

    if (this.state === STATES.HALF_OPEN) {
      this.state = STATES.CLOSED;
      this.failures = [];
    }
  }

  recordFailure(error) {
    this.totalCount++;
    const classification = errorClassifier.classify(error || {});
    this._updateEma('errorRate', 1);

    // Only count retryable errors toward circuit breaking
    if (!classification.retryable) return classification;

    const now = Date.now();
    this.failures.push(now);
    this.lastFailureAt = now;
    this._pruneOldFailures();

    if (this.state === STATES.HALF_OPEN) {
      this.halfOpenAttempts++;
      this.state = STATES.OPEN;
      this.openedAt = now;
      return classification;
    }

    if (this.state === STATES.CLOSED && this.failures.length >= this.opts.failureThreshold) {
      this.state = STATES.OPEN;
      this.openedAt = now;
    }

    return classification;
  }

  getStatus() {
    this._pruneOldFailures();
    return {
      name: this.name,
      state: this.state,
      recentFailures: this.failures.length,
      totalCount: this.totalCount,
      successCount: this.successCount,
      ema: { ...this.ema },
      lastFailureAt: this.lastFailureAt,
      openedAt: this.openedAt,
    };
  }

  reset() {
    this.state = STATES.CLOSED;
    this.failures = [];
    this.lastFailureAt = null;
    this.openedAt = null;
    this.halfOpenAttempts = 0;
  }
}

// Registry of per-provider circuit breakers
const _breakers = new Map();

function getBreaker(providerName, opts) {
  if (!_breakers.has(providerName)) {
    _breakers.set(providerName, new CircuitBreaker(providerName, opts));
  }
  return _breakers.get(providerName);
}

function getAllStatus() {
  const result = {};
  for (const [name, breaker] of _breakers) {
    result[name] = breaker.getStatus();
  }
  return result;
}

function resetAll() {
  for (const breaker of _breakers.values()) {
    breaker.reset();
  }
}

function clear() {
  _breakers.clear();
}

module.exports = {
  STATES,
  DEFAULT_OPTIONS,
  CircuitBreaker,
  getBreaker,
  getAllStatus,
  resetAll,
  clear,
};
