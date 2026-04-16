'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsManager = require('../src/settings-manager');
const videoGen = require('../src/connectors/video-gen');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-vgen-'));
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
});

afterEach(() => {
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Video Generation Scaffold', () => {
  it('should export correct interface', () => {
    assert.strictEqual(videoGen.name, 'video-gen');
    assert.strictEqual(typeof videoGen.isConfigured, 'function');
    assert.strictEqual(typeof videoGen.listProviders, 'function');
    assert.strictEqual(typeof videoGen.generateFromText, 'function');
    assert.strictEqual(typeof videoGen.generateFromImage, 'function');
    assert.strictEqual(typeof videoGen.getStatus, 'function');
  });

  it('should list available providers', () => {
    const providers = videoGen.listProviders();
    assert.ok(providers.length >= 3);
    const names = providers.map(p => p.key);
    assert.ok(names.includes('runway'));
    assert.ok(names.includes('pika'));
    assert.ok(names.includes('luma'));
  });

  it('should not be configured by default', () => {
    assert.strictEqual(videoGen.isConfigured(), false);
    assert.strictEqual(videoGen.isConfigured('runway'), false);
  });

  it('should reject text generation when not configured', async () => {
    await assert.rejects(
      () => videoGen.generateFromText('a sunset over mountains'),
      /not configured/
    );
  });

  it('should reject image generation when not configured', async () => {
    await assert.rejects(
      () => videoGen.generateFromImage('/tmp/image.png', 'animate this'),
      /not configured/
    );
  });

  it('should return scaffold status', async () => {
    const result = await videoGen.getStatus('gen-123');
    assert.strictEqual(result.status, 'scaffold');
    assert.strictEqual(result.id, 'gen-123');
  });

  it('should have PROVIDERS with correct structure', () => {
    assert.ok(videoGen.PROVIDERS.runway);
    assert.ok(videoGen.PROVIDERS.runway.models);
    assert.ok(videoGen.PROVIDERS.runway.max_duration_s);
    assert.strictEqual(typeof videoGen.PROVIDERS.runway.host, 'string');
  });
});
