'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const modelRouter = require('../src/model-router');

function makeConfig(values) {
  return (key) => values[key];
}

describe('model-router small-model selection', () => {
  it('includes codex-spark in small-model path when token budget favors spark-level depth', () => {
    const route = modelRouter.routeTask({
      subject: 'Update docs index',
      description: 'Copy edit docs. TOKEN_BUDGET: medium',
      domain: 'docs',
      tier: 1,
      priority: 'normal',
      files: ['README.md'],
    });

    assert.strictEqual(route.routing_class, 'mini');
    assert.strictEqual(route.model, 'codex-spark');
  });

  it('prefers mini for tiny token budgets on clearly mechanical work', () => {
    const route = modelRouter.routeTask({
      subject: 'Fix typo',
      description: 'Mechanical typo cleanup. TOKEN_BUDGET: tiny',
      domain: 'documentation',
      tier: 1,
      priority: 'normal',
      files: ['docs/guide.md'],
    });

    assert.strictEqual(route.routing_class, 'mini');
    assert.strictEqual(route.model, 'gpt-5.1-codex-mini');
  });

  it('selects codex-spark before spark/mini for spark-routed tasks with deterministic order', () => {
    const getConfig = makeConfig({
      model_codex_spark: 'codex-spark-override',
      model_spark: 'spark-override',
      model_mini: 'mini-override',
    });
    const task = {
      subject: 'Moderate coordinator follow-up',
      description: 'TOKEN_BUDGET: medium',
      domain: 'tooling',
      tier: 2,
      priority: 'normal',
      files: ['src/a.js', 'src/b.js'],
    };
    const classification = { file_count: 2 };

    const first = modelRouter.resolveModel('spark', getConfig, task, classification);
    const second = modelRouter.resolveModel('spark', getConfig, task, classification);

    assert.strictEqual(first, 'codex-spark-override');
    assert.strictEqual(second, first);
  });
});

describe('model-router flagship path stability', () => {
  it('keeps non-small routing model resolution unchanged', () => {
    const getConfig = makeConfig({
      model_high: 'high-specialist',
      model_flagship: 'flagship-default',
    });

    assert.strictEqual(modelRouter.resolveModel('high', getConfig), 'high-specialist');
    assert.strictEqual(modelRouter.resolveModel('mid', getConfig), 'flagship-default');
  });
});
