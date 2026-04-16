'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

const providerFallback = require('../src/provider-fallback');

describe('ProviderFallback', () => {
  describe('execute', () => {
    it('should return result on first success', async () => {
      const resolution = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        fallbacks: [],
      };
      const result = await providerFallback.execute(resolution, async (provider, model) => {
        return { text: 'Hello', provider, model };
      });
      assert.strictEqual(result.provider, 'anthropic');
      assert.strictEqual(result.result.text, 'Hello');
      assert.strictEqual(result.attempts, 1);
    });

    it('should fall through to next provider on failure', async () => {
      const resolution = {
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        fallbacks: [{ provider: 'openai', model: 'gpt-4.1' }],
      };
      let callCount = 0;
      const result = await providerFallback.execute(
        resolution,
        async (provider, model) => {
          callCount++;
          if (provider === 'anthropic') {
            const err = new Error('Rate limited');
            err.statusCode = 401;
            throw err;
          }
          return { text: 'Fallback', provider, model };
        },
        { maxRetries: 1 }
      );
      assert.strictEqual(result.provider, 'openai');
      assert.strictEqual(result.result.text, 'Fallback');
    });

    it('should retry on server errors', async () => {
      const resolution = {
        provider: 'anthropic',
        model: 'test',
        fallbacks: [],
      };
      let attempt = 0;
      const result = await providerFallback.execute(
        resolution,
        async () => {
          attempt++;
          if (attempt < 2) {
            const err = new Error('Server error');
            err.statusCode = 500;
            throw err;
          }
          return { success: true };
        },
        { maxRetries: 2, retryDelayMs: 10 }
      );
      assert.strictEqual(result.result.success, true);
      assert.strictEqual(result.attempts, 2);
    });

    it('should throw ProviderError when all providers fail', async () => {
      const resolution = {
        provider: 'anthropic',
        model: 'test',
        fallbacks: [{ provider: 'openai', model: 'test' }],
      };
      await assert.rejects(
        () => providerFallback.execute(
          resolution,
          async () => { throw new Error('fail'); },
          { maxRetries: 1 }
        ),
        (err) => {
          assert.ok(err instanceof providerFallback.ProviderError);
          assert.ok(err.message.includes('All providers exhausted'));
          return true;
        }
      );
    });

    it('should not retry on 4xx client errors (except 429)', async () => {
      const resolution = {
        provider: 'anthropic',
        model: 'test',
        fallbacks: [{ provider: 'openai', model: 'test' }],
      };
      let anthropicAttempts = 0;
      const result = await providerFallback.execute(
        resolution,
        async (provider) => {
          if (provider === 'anthropic') {
            anthropicAttempts++;
            const err = new Error('Bad request');
            err.statusCode = 400;
            throw err;
          }
          return { ok: true };
        },
        { maxRetries: 3 }
      );
      assert.strictEqual(anthropicAttempts, 1); // Should not retry
      assert.strictEqual(result.provider, 'openai');
    });
  });

  describe('executeSync', () => {
    it('should execute synchronously', () => {
      const resolution = {
        provider: 'cli',
        model: 'fast',
      };
      const result = providerFallback.executeSync(resolution, (provider, model) => {
        return { provider, model };
      });
      assert.strictEqual(result.provider, 'cli');
      assert.strictEqual(result.model, 'fast');
    });
  });

  describe('ProviderError', () => {
    it('should include provider and status code', () => {
      const err = new providerFallback.ProviderError('test', 'anthropic', 503);
      assert.strictEqual(err.provider, 'anthropic');
      assert.strictEqual(err.statusCode, 503);
      assert.strictEqual(err.name, 'ProviderError');
    });
  });
});
