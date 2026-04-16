'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../src/db');
const costTracker = require('../src/cost-tracker');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-cost-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Cost Tracker', () => {
  it('should calculate cost for known models', () => {
    const cost = costTracker.calculateCost('claude-opus-4-6', 1000, 500);
    assert.ok(cost > 0);
  });

  it('should return 0 cost for unknown models', () => {
    const cost = costTracker.calculateCost('unknown-model', 1000, 500);
    assert.strictEqual(cost, 0);
  });

  it('should get pricing for known models', () => {
    const pricing = costTracker.getPricing('claude-sonnet-4-6');
    assert.ok(pricing.input > 0);
    assert.ok(pricing.output > 0);
  });

  it('should record task usage', () => {
    const reqId = db.createRequest('Test cost tracking');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Test task',
      description: 'For cost testing',
    });
    const result = costTracker.recordTaskUsage(taskId, {
      model: 'claude-opus-4-6',
      input_tokens: 5000,
      output_tokens: 2000,
    });
    assert.ok(result.cost > 0);
    assert.strictEqual(result.inputTokens, 5000);
    assert.strictEqual(result.outputTokens, 2000);

    const task = db.getTask(taskId);
    assert.strictEqual(task.usage_input_tokens, 5000);
    assert.strictEqual(task.usage_output_tokens, 2000);
    assert.ok(task.usage_cost_usd > 0);
  });

  it('should estimate task cost by tier', () => {
    const estimate = costTracker.estimateTaskCost({ tier: 3, routed_model: 'claude-opus-4-6' });
    assert.ok(estimate.estimated_cost_usd > 0);
    assert.ok(estimate.estimatedInputTokens > 0);
  });

  it('should get task cost summary for a request', () => {
    const reqId = db.createRequest('Test summary');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Task 1',
      description: 'For summary testing',
    });
    costTracker.recordTaskUsage(taskId, {
      model: 'claude-sonnet-4-6',
      input_tokens: 3000,
      output_tokens: 1000,
    });
    const summary = costTracker.getTaskCostSummary(reqId);
    assert.strictEqual(summary.request_id, reqId);
    assert.strictEqual(summary.task_count, 1);
    assert.ok(summary.total_cost_usd > 0);
  });

  it('should get global cost summary', () => {
    const summary = costTracker.getGlobalCostSummary();
    assert.ok(typeof summary.task_count === 'number');
    assert.ok(typeof summary.total_cost_usd === 'number');
  });
});
