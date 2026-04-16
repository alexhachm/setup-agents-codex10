'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const loopDetector = require('../src/loop-detector');

beforeEach(() => {
  loopDetector.resetAll();
});

describe('Loop Detector', () => {
  it('should return ok for normal tool call counts', () => {
    const result = loopDetector.recordToolCall('task-1');
    assert.strictEqual(result.action, 'ok');
    assert.strictEqual(result.count, 1);
  });

  it('should warn at 150 tool calls', () => {
    for (let i = 0; i < 149; i++) {
      loopDetector.recordToolCall('task-1');
    }
    const result = loopDetector.recordToolCall('task-1');
    assert.strictEqual(result.action, 'warn');
    assert.strictEqual(result.count, 150);
  });

  it('should stop at 200 tool calls', () => {
    for (let i = 0; i < 199; i++) {
      loopDetector.recordToolCall('task-1');
    }
    const result = loopDetector.recordToolCall('task-1');
    assert.strictEqual(result.action, 'stop');
    assert.strictEqual(result.count, 200);
  });

  it('should track counts per task independently', () => {
    loopDetector.recordToolCall('task-1');
    loopDetector.recordToolCall('task-1');
    loopDetector.recordToolCall('task-2');
    assert.strictEqual(loopDetector.getCount('task-1'), 2);
    assert.strictEqual(loopDetector.getCount('task-2'), 1);
  });

  it('should detect warning state', () => {
    for (let i = 0; i < 150; i++) {
      loopDetector.recordToolCall('task-1');
    }
    assert.strictEqual(loopDetector.isWarning('task-1'), true);
    assert.strictEqual(loopDetector.isOverLimit('task-1'), false);
  });

  it('should detect over limit state', () => {
    for (let i = 0; i < 200; i++) {
      loopDetector.recordToolCall('task-1');
    }
    assert.strictEqual(loopDetector.isOverLimit('task-1'), true);
  });

  it('should reset individual task', () => {
    loopDetector.recordToolCall('task-1');
    loopDetector.resetTask('task-1');
    assert.strictEqual(loopDetector.getCount('task-1'), 0);
  });

  it('should reset all tasks', () => {
    loopDetector.recordToolCall('task-1');
    loopDetector.recordToolCall('task-2');
    loopDetector.resetAll();
    assert.strictEqual(loopDetector.getCount('task-1'), 0);
    assert.strictEqual(loopDetector.getCount('task-2'), 0);
  });

  it('should get all counts', () => {
    loopDetector.recordToolCall('task-1');
    loopDetector.recordToolCall('task-2');
    loopDetector.recordToolCall('task-2');
    const counts = loopDetector.getAllCounts();
    assert.strictEqual(counts['task-1'], 1);
    assert.strictEqual(counts['task-2'], 2);
  });

  it('should export constants', () => {
    assert.strictEqual(loopDetector.MAX_TOOL_CALLS_PER_TASK, 200);
    assert.strictEqual(loopDetector.WARNING_THRESHOLD, 150);
  });
});
