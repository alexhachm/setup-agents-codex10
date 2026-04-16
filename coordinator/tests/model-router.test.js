'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const modelRouter = require('../src/model-router');
const settingsManager = require('../src/settings-manager');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-router-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  settingsManager.reset();
  modelRouter.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
});

afterEach(() => {
  modelRouter.reset();
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ModelRouter', () => {
  describe('resolve (dev mode)', () => {
    it('should return cli provider in dev mode', () => {
      const result = modelRouter.resolve('fast');
      assert.strictEqual(result.provider, 'cli');
      assert.strictEqual(result.model, 'fast');
      assert.strictEqual(result.source, 'dev_mode');
    });

    it('should default to fast for unknown routing class', () => {
      const result = modelRouter.resolve('unknown');
      assert.strictEqual(result.model, 'fast');
    });

    it('should use task override when provided', () => {
      const result = modelRouter.resolve('fast', {
        routed_model: 'custom-model',
        model_source: 'openai',
      });
      assert.strictEqual(result.provider, 'openai');
      assert.strictEqual(result.model, 'custom-model');
      assert.strictEqual(result.source, 'task_override');
    });
  });

  describe('resolve (live mode)', () => {
    it('should resolve from settings in live mode', () => {
      settingsManager.set('mode', 'live');
      const result = modelRouter.resolve('fast');
      assert.strictEqual(result.provider, 'anthropic');
      assert.strictEqual(result.model, 'claude-sonnet-4-6');
      assert.strictEqual(result.source, 'settings');
    });

    it('should resolve deep routing class', () => {
      settingsManager.set('mode', 'live');
      const result = modelRouter.resolve('deep');
      assert.strictEqual(result.model, 'claude-opus-4-6');
    });

    it('should resolve economy routing class', () => {
      settingsManager.set('mode', 'live');
      const result = modelRouter.resolve('economy');
      assert.strictEqual(result.model, 'claude-haiku-4-5-20251001');
    });

    it('should resolve code to deep tier', () => {
      settingsManager.set('mode', 'live');
      const result = modelRouter.resolve('code');
      assert.strictEqual(result.model, 'claude-opus-4-6');
    });
  });

  describe('resolveWithFallback', () => {
    it('should include empty fallbacks in dev mode', () => {
      const result = modelRouter.resolveWithFallback('fast');
      assert.deepStrictEqual(result.fallbacks, []);
    });

    it('should include fallbacks for providers with API keys in live mode', () => {
      settingsManager.set('mode', 'live');
      // Set API keys for multiple providers
      const origAnthropic = process.env.ANTHROPIC_API_KEY;
      const origOpenai = process.env.OPENAI_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'test-key-2';

      const result = modelRouter.resolveWithFallback('fast');
      assert.strictEqual(result.provider, 'anthropic');
      assert.ok(result.fallbacks.length > 0);
      assert.strictEqual(result.fallbacks[0].provider, 'openai');

      if (origAnthropic) process.env.ANTHROPIC_API_KEY = origAnthropic;
      else delete process.env.ANTHROPIC_API_KEY;
      if (origOpenai) process.env.OPENAI_API_KEY = origOpenai;
      else delete process.env.OPENAI_API_KEY;
    });
  });

  describe('rules (in-memory)', () => {
    it('should add and list rules', () => {
      modelRouter.addRule({
        routing_class: 'fast',
        provider: 'openai',
        model: 'gpt-4.1',
        priority: 10,
        enabled: 1,
      });
      const rules = modelRouter.listRules();
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].routing_class, 'fast');
    });

    it('should resolve from rules before settings', () => {
      settingsManager.set('mode', 'live');
      modelRouter.addRule({
        routing_class: 'fast',
        provider: 'openai',
        model: 'gpt-4.1',
        priority: 10,
        enabled: 1,
      });
      const result = modelRouter.resolve('fast');
      assert.strictEqual(result.provider, 'openai');
      assert.strictEqual(result.model, 'gpt-4.1');
      assert.strictEqual(result.source, 'db_rule');
    });

    it('should skip disabled rules', () => {
      settingsManager.set('mode', 'live');
      modelRouter.addRule({
        routing_class: 'fast',
        provider: 'openai',
        model: 'gpt-4.1',
        priority: 10,
        enabled: 0,
      });
      const result = modelRouter.resolve('fast');
      assert.strictEqual(result.source, 'settings');
    });

    it('should remove rules', () => {
      modelRouter.addRule({
        routing_class: 'fast',
        provider: 'openai',
        model: 'gpt-4.1',
      });
      assert.strictEqual(modelRouter.listRules().length, 1);
      modelRouter.removeRule(1);
      assert.strictEqual(modelRouter.listRules().length, 0);
    });
  });

  describe('init with DB', () => {
    it('should load rules from database', () => {
      db.init(tmpDir);
      try {
        const rawDb = db.getDb();
        rawDb.prepare(`
          INSERT INTO model_routing_rules (routing_class, provider, model, priority, enabled)
          VALUES ('deep', 'google', 'gemini-2.5-pro', 5, 1)
        `).run();
        modelRouter.init(db);
        const rules = modelRouter.listRules();
        assert.strictEqual(rules.length, 1);
        assert.strictEqual(rules[0].provider, 'google');
      } finally {
        db.close();
      }
    });
  });

  describe('ROUTING_CLASSES', () => {
    it('should include all expected classes', () => {
      assert.ok(modelRouter.ROUTING_CLASSES.includes('fast'));
      assert.ok(modelRouter.ROUTING_CLASSES.includes('deep'));
      assert.ok(modelRouter.ROUTING_CLASSES.includes('economy'));
      assert.ok(modelRouter.ROUTING_CLASSES.includes('code'));
      assert.ok(modelRouter.ROUTING_CLASSES.includes('research'));
      assert.ok(modelRouter.ROUTING_CLASSES.includes('browser'));
    });
  });

  describe('CLASS_TO_TIER', () => {
    it('should map code to deep', () => {
      assert.strictEqual(modelRouter.CLASS_TO_TIER.code, 'deep');
    });

    it('should map research to fast', () => {
      assert.strictEqual(modelRouter.CLASS_TO_TIER.research, 'fast');
    });
  });
});
