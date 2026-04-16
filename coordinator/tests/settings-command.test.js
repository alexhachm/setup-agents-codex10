'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsCommand = require('../src/commands/settings');
const settingsManager = require('../src/settings-manager');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-cmd-'));
  fs.mkdirSync(path.join(tmpDir, '.mac10'), { recursive: true });
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
});

afterEach(() => {
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Settings Command', () => {
  describe('show', () => {
    it('should return settings with redacted keys', () => {
      const result = settingsCommand.run(['show'], tmpDir);
      assert.strictEqual(result.type, 'settings');
      assert.strictEqual(result.mode, 'dev');
    });
  });

  describe('get', () => {
    it('should get a setting by key path', () => {
      const result = settingsCommand.run(['get', 'mode'], tmpDir);
      assert.strictEqual(result.key, 'mode');
      assert.strictEqual(result.value, 'dev');
    });

    it('should return error without key', () => {
      const result = settingsCommand.run(['get'], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('set', () => {
    it('should set a global setting', () => {
      const result = settingsCommand.run(['set', 'mode', 'live'], tmpDir);
      assert.strictEqual(result.key, 'mode');
      assert.strictEqual(result.value, 'live');
      assert.strictEqual(result.scope, 'global');
    });

    it('should set a project setting', () => {
      const result = settingsCommand.run(['set', 'mode', 'live', '--project'], tmpDir);
      assert.strictEqual(result.scope, 'project');
      // Verify file was written
      const persisted = JSON.parse(
        fs.readFileSync(path.join(tmpDir, '.mac10', 'settings.json'), 'utf-8')
      );
      assert.strictEqual(persisted.mode, 'live');
    });

    it('should parse JSON values', () => {
      const result = settingsCommand.run(['set', 'browser.headless', 'false'], tmpDir);
      assert.strictEqual(result.value, false);
    });
  });

  describe('mode', () => {
    it('should return current mode without args', () => {
      const result = settingsCommand.run(['mode'], tmpDir);
      assert.strictEqual(result.mode, 'dev');
    });

    it('should switch mode', () => {
      const result = settingsCommand.run(['mode', 'live'], tmpDir);
      assert.strictEqual(result.mode, 'live');
    });

    it('should reject invalid mode', () => {
      const result = settingsCommand.run(['mode', 'invalid'], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('provider', () => {
    it('should show provider config', () => {
      const result = settingsCommand.run(['provider', 'anthropic'], tmpDir);
      assert.strictEqual(result.provider, 'anthropic');
      assert.ok(result.config);
    });

    it('should error on missing provider', () => {
      const result = settingsCommand.run(['provider'], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('api-key', () => {
    it('should set API key for provider', () => {
      const result = settingsCommand.run(['api-key', 'anthropic', 'sk-test-key'], tmpDir);
      assert.strictEqual(result.provider, 'anthropic');
      assert.ok(result.message);
    });

    it('should error on missing args', () => {
      const result = settingsCommand.run(['api-key'], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('reset', () => {
    it('should reset settings', () => {
      const result = settingsCommand.run(['reset'], tmpDir);
      assert.ok(result.message.includes('reset'));
    });
  });

  describe('providers', () => {
    it('should list all providers', () => {
      const result = settingsCommand.run(['providers'], tmpDir);
      assert.ok(result.providers);
      assert.ok(result.providers.length >= 4);
    });
  });

  describe('unknown subcommand', () => {
    it('should return error', () => {
      const result = settingsCommand.run(['garbage'], tmpDir);
      assert.ok(result.error);
    });
  });

  describe('default subcommand', () => {
    it('should default to show', () => {
      const result = settingsCommand.run([], tmpDir);
      assert.strictEqual(result.type, 'settings');
    });
  });
});
