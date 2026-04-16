'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsManager = require('../src/settings-manager');

let tmpDir;
let globalDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-settings-'));
  globalDir = path.join(tmpDir, 'global');
  fs.mkdirSync(globalDir, { recursive: true });
  settingsManager.reset();
  // Override global settings file to isolate from host environment
  settingsManager.setGlobalSettingsFileOverride(path.join(globalDir, 'settings.json'));
});

afterEach(() => {
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SettingsManager', () => {
  describe('load', () => {
    it('should return defaults when no settings files exist', () => {
      const settings = settingsManager.load(tmpDir);
      assert.strictEqual(settings.mode, 'dev');
      assert.strictEqual(settings.default_provider, 'anthropic');
      assert.ok(settings.providers.anthropic);
      assert.ok(settings.providers.openai);
    });

    it('should merge global settings over defaults', () => {
      // Write a global settings file at the override location
      const globalFile = path.join(globalDir, 'settings.json');
      fs.writeFileSync(globalFile, JSON.stringify({ mode: 'live' }));

      const settings = settingsManager.load(tmpDir);
      assert.strictEqual(settings.mode, 'live');
      // Defaults should still be present
      assert.strictEqual(settings.default_provider, 'anthropic');
    });

    it('should merge project settings over global', () => {
      const projectDir = path.join(tmpDir, 'project');
      fs.mkdirSync(path.join(projectDir, '.mac10'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, '.mac10', 'settings.json'),
        JSON.stringify({ mode: 'live', default_provider: 'openai' })
      );

      const settings = settingsManager.load(projectDir);
      assert.strictEqual(settings.mode, 'live');
      assert.strictEqual(settings.default_provider, 'openai');
    });
  });

  describe('get', () => {
    it('should get nested values by dot path', () => {
      settingsManager.load(tmpDir);
      const mode = settingsManager.get('mode');
      assert.strictEqual(mode, 'dev');

      const anthropicModels = settingsManager.get('providers.anthropic.models');
      assert.ok(anthropicModels);
      assert.strictEqual(anthropicModels.fast, 'claude-sonnet-4-6');
    });

    it('should return undefined for missing keys', () => {
      settingsManager.load(tmpDir);
      assert.strictEqual(settingsManager.get('nonexistent.key'), undefined);
    });
  });

  describe('set', () => {
    it('should set and persist global settings', () => {
      settingsManager.load(tmpDir);
      settingsManager.set('mode', 'live');
      assert.strictEqual(settingsManager.get('mode'), 'live');
    });

    it('should set project-level settings', () => {
      const projectDir = path.join(tmpDir, 'project');
      fs.mkdirSync(path.join(projectDir, '.mac10'), { recursive: true });
      settingsManager.load(projectDir);

      settingsManager.set('mode', 'live', 'project');
      assert.strictEqual(settingsManager.get('mode'), 'live');

      // Verify persisted
      const persisted = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.mac10', 'settings.json'), 'utf-8')
      );
      assert.strictEqual(persisted.mode, 'live');
    });

    it('should set nested values', () => {
      settingsManager.load(tmpDir);
      settingsManager.set('providers.anthropic.models.fast', 'claude-test');
      assert.strictEqual(settingsManager.get('providers.anthropic.models.fast'), 'claude-test');
    });
  });

  describe('mode helpers', () => {
    it('should default to dev mode', () => {
      settingsManager.load(tmpDir);
      assert.strictEqual(settingsManager.isDevMode(), true);
      assert.strictEqual(settingsManager.isLiveMode(), false);
    });

    it('should detect live mode', () => {
      settingsManager.load(tmpDir);
      settingsManager.set('mode', 'live');
      assert.strictEqual(settingsManager.isDevMode(), false);
      assert.strictEqual(settingsManager.isLiveMode(), true);
    });
  });

  describe('getApiKey', () => {
    it('should prefer environment variable', () => {
      settingsManager.load(tmpDir);
      const original = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      assert.strictEqual(settingsManager.getApiKey('anthropic'), 'test-key-123');
      if (original) {
        process.env.ANTHROPIC_API_KEY = original;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('should fall back to settings', () => {
      settingsManager.load(tmpDir);
      settingsManager.set('providers.openai.api_key', 'sk-test');
      // Clear env var if set
      const original = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      assert.strictEqual(settingsManager.getApiKey('openai'), 'sk-test');
      if (original) process.env.OPENAI_API_KEY = original;
    });
  });

  describe('getSearchApiKey', () => {
    it('should get search provider API key', () => {
      settingsManager.load(tmpDir);
      settingsManager.set('search.providers.brave.api_key', 'brave-key');
      const original = process.env.BRAVE_API_KEY;
      delete process.env.BRAVE_API_KEY;
      assert.strictEqual(settingsManager.getSearchApiKey('brave'), 'brave-key');
      if (original) process.env.BRAVE_API_KEY = original;
    });
  });

  describe('deepMerge', () => {
    it('should merge objects recursively', () => {
      const base = { a: { b: 1, c: 2 }, d: 3 };
      const override = { a: { b: 10 }, e: 5 };
      const result = settingsManager.deepMerge(base, override);
      assert.strictEqual(result.a.b, 10);
      assert.strictEqual(result.a.c, 2);
      assert.strictEqual(result.d, 3);
      assert.strictEqual(result.e, 5);
    });

    it('should not merge arrays', () => {
      const base = { arr: [1, 2] };
      const override = { arr: [3, 4] };
      const result = settingsManager.deepMerge(base, override);
      assert.deepStrictEqual(result.arr, [3, 4]);
    });
  });

  describe('getAll', () => {
    it('should return copy of merged settings', () => {
      settingsManager.load(tmpDir);
      const all = settingsManager.getAll();
      assert.strictEqual(all.mode, 'dev');
      // Modify should not affect internal state
      all.mode = 'live';
      assert.strictEqual(settingsManager.get('mode'), 'dev');
    });
  });

  describe('reset', () => {
    it('should clear all cached settings', () => {
      settingsManager.load(tmpDir);
      assert.strictEqual(settingsManager.get('mode'), 'dev');
      settingsManager.set('mode', 'live');
      assert.strictEqual(settingsManager.get('mode'), 'live');
      settingsManager.reset();
      // After reset, use fresh isolated global path (no persisted state)
      const freshGlobal = path.join(tmpDir, 'fresh-global-settings.json');
      settingsManager.setGlobalSettingsFileOverride(freshGlobal);
      const freshProject = path.join(tmpDir, 'fresh-project');
      fs.mkdirSync(freshProject, { recursive: true });
      settingsManager.load(freshProject);
      assert.strictEqual(settingsManager.get('mode'), 'dev');
    });
  });
});
