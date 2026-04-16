'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const apiBackend = require('../src/api-backend');
const settingsManager = require('../src/settings-manager');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-api-'));
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
});

afterEach(() => {
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ApiBackend', () => {
  describe('normalizeResponse', () => {
    it('should normalize Anthropic response', () => {
      const data = {
        content: [{ type: 'text', text: 'Hello world' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      };
      const result = apiBackend.normalizeResponse('anthropic', data);
      assert.strictEqual(result.content, 'Hello world');
      assert.strictEqual(result.role, 'assistant');
      assert.strictEqual(result.usage.input_tokens, 10);
      assert.strictEqual(result.usage.output_tokens, 5);
    });

    it('should normalize OpenAI response', () => {
      const data = {
        choices: [{ message: { content: 'Hi there', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      };
      const result = apiBackend.normalizeResponse('openai', data);
      assert.strictEqual(result.content, 'Hi there');
      assert.strictEqual(result.usage.input_tokens, 10);
    });

    it('should normalize Google response', () => {
      const data = {
        candidates: [{ content: { parts: [{ text: 'Gemini says hi' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 4 },
      };
      const result = apiBackend.normalizeResponse('google', data);
      assert.strictEqual(result.content, 'Gemini says hi');
      assert.strictEqual(result.usage.input_tokens, 8);
    });

    it('should normalize DeepSeek response', () => {
      const data = {
        choices: [{ message: { content: 'Deep thought', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 6 },
      };
      const result = apiBackend.normalizeResponse('deepseek', data);
      assert.strictEqual(result.content, 'Deep thought');
      assert.strictEqual(result.usage.input_tokens, 12);
    });

    it('should handle empty/missing data gracefully', () => {
      const result = apiBackend.normalizeResponse('anthropic', {});
      assert.strictEqual(result.content, '');
      assert.strictEqual(result.role, 'assistant');
    });

    it('should return empty for unknown provider', () => {
      const result = apiBackend.normalizeResponse('unknown', { foo: 'bar' });
      assert.strictEqual(result.content, '');
    });
  });

  describe('isProviderAvailable', () => {
    it('should detect provider with env var', () => {
      const orig = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key';
      assert.strictEqual(apiBackend.isProviderAvailable('anthropic'), true);
      if (orig) process.env.ANTHROPIC_API_KEY = orig;
      else delete process.env.ANTHROPIC_API_KEY;
    });

    it('should return false without key', () => {
      const orig = process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      settingsManager.reset();
      settingsManager.load(tmpDir);
      assert.strictEqual(apiBackend.isProviderAvailable('google'), false);
      if (orig) process.env.GOOGLE_API_KEY = orig;
    });
  });

  describe('listAvailableProviders', () => {
    it('should list providers with keys', () => {
      const origA = process.env.ANTHROPIC_API_KEY;
      const origO = process.env.OPENAI_API_KEY;
      const origG = process.env.GOOGLE_API_KEY;
      const origD = process.env.DEEPSEEK_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test';
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      settingsManager.reset();
      settingsManager.load(tmpDir);

      const available = apiBackend.listAvailableProviders();
      assert.ok(available.includes('anthropic'));
      assert.ok(!available.includes('google'));

      if (origA) process.env.ANTHROPIC_API_KEY = origA; else delete process.env.ANTHROPIC_API_KEY;
      if (origO) process.env.OPENAI_API_KEY = origO; else delete process.env.OPENAI_API_KEY;
      if (origG) process.env.GOOGLE_API_KEY = origG; else delete process.env.GOOGLE_API_KEY;
      if (origD) process.env.DEEPSEEK_API_KEY = origD; else delete process.env.DEEPSEEK_API_KEY;
    });
  });

  describe('ENDPOINTS', () => {
    it('should have config for all supported providers', () => {
      assert.ok(apiBackend.ENDPOINTS.anthropic);
      assert.ok(apiBackend.ENDPOINTS.openai);
      assert.ok(apiBackend.ENDPOINTS.google);
      assert.ok(apiBackend.ENDPOINTS.deepseek);
    });
  });

  describe('call', () => {
    it('should reject unsupported provider', async () => {
      await assert.rejects(
        () => apiBackend.call('unknown', 'model', []),
        /Unsupported provider/
      );
    });

    it('should reject missing API key', async () => {
      const orig = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      settingsManager.reset();
      settingsManager.load(tmpDir);

      await assert.rejects(
        () => apiBackend.call('anthropic', 'test', [{ role: 'user', content: 'hi' }]),
        /No API key configured/
      );

      if (orig) process.env.ANTHROPIC_API_KEY = orig;
    });
  });
});
