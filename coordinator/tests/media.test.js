'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsManager = require('../src/settings-manager');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-media-'));
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
});

afterEach(() => {
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Media — image-gen', () => {
  const imageGen = require('../src/media/image-gen');

  it('should export generate function', () => {
    assert.strictEqual(typeof imageGen.generate, 'function');
  });

  it('should have PROVIDERS with openai', () => {
    assert.ok(imageGen.PROVIDERS.openai);
    assert.strictEqual(imageGen.PROVIDERS.openai.model, 'dall-e-3');
  });

  it('should reject unsupported provider', async () => {
    await assert.rejects(
      () => imageGen.generate('cat', { provider: 'nonexistent' }),
      /not supported/
    );
  });

  it('should reject without API key', async () => {
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    settingsManager.reset();
    settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
    settingsManager.load(tmpDir);

    await assert.rejects(
      () => imageGen.generate('cat'),
      /No API key/
    );
    if (orig) process.env.OPENAI_API_KEY = orig;
  });
});

describe('Media — vision', () => {
  const vision = require('../src/media/vision');

  it('should export analyzeImage function', () => {
    assert.strictEqual(typeof vision.analyzeImage, 'function');
  });

  it('should return dev_mode response in dev mode', async () => {
    const result = await vision.analyzeImage('/tmp/test.png', 'describe');
    assert.strictEqual(result.dev_mode, true);
  });
});

describe('Media — tts', () => {
  const tts = require('../src/media/tts');

  it('should export synthesize function', () => {
    assert.strictEqual(typeof tts.synthesize, 'function');
  });

  it('should export VOICES list', () => {
    assert.ok(Array.isArray(tts.VOICES));
    assert.ok(tts.VOICES.includes('alloy'));
    assert.ok(tts.VOICES.includes('nova'));
  });

  it('should reject without API key', async () => {
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    settingsManager.reset();
    settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
    settingsManager.load(tmpDir);

    await assert.rejects(
      () => tts.synthesize('hello'),
      /requires OpenAI/
    );
    if (orig) process.env.OPENAI_API_KEY = orig;
  });
});

describe('Media — transcribe', () => {
  const transcribe = require('../src/media/transcribe');

  it('should export transcribe function', () => {
    assert.strictEqual(typeof transcribe.transcribe, 'function');
  });

  it('should reject missing audio file', async () => {
    const orig = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';

    await assert.rejects(
      () => transcribe.transcribe('/nonexistent/audio.mp3'),
      /not found/
    );

    if (orig) process.env.OPENAI_API_KEY = orig;
    else delete process.env.OPENAI_API_KEY;
  });

  it('should reject without API key', async () => {
    const orig = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    settingsManager.reset();
    settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
    settingsManager.load(tmpDir);

    await assert.rejects(
      () => transcribe.transcribe('/tmp/audio.mp3'),
      /requires OpenAI/
    );
    if (orig) process.env.OPENAI_API_KEY = orig;
  });

  it('should return scaffold result for existing file', async () => {
    const orig = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-key';
    const audioFile = path.join(tmpDir, 'test.mp3');
    fs.writeFileSync(audioFile, 'fake audio');

    const result = await transcribe.transcribe(audioFile);
    assert.strictEqual(result.scaffold, true);
    assert.strictEqual(result.model, 'whisper-1');

    if (orig) process.env.OPENAI_API_KEY = orig;
    else delete process.env.OPENAI_API_KEY;
  });
});

describe('Media command', () => {
  const mediaCmd = require('../src/commands/media');

  it('should export run function', () => {
    assert.strictEqual(typeof mediaCmd.run, 'function');
  });

  it('should return error without subcommand', async () => {
    const result = await mediaCmd.run([], tmpDir);
    assert.ok(result.error);
  });

  it('should return error for unknown subcommand', async () => {
    const result = await mediaCmd.run(['unknown'], tmpDir);
    assert.ok(result.error);
  });

  it('should return error for image without prompt', async () => {
    const result = await mediaCmd.run(['image'], tmpDir);
    assert.ok(result.error);
  });

  it('should return error for vision without image path', async () => {
    const result = await mediaCmd.run(['vision'], tmpDir);
    assert.ok(result.error);
  });

  it('should return error for tts without text', async () => {
    const result = await mediaCmd.run(['tts'], tmpDir);
    assert.ok(result.error);
  });

  it('should return error for transcribe without path', async () => {
    const result = await mediaCmd.run(['transcribe'], tmpDir);
    assert.ok(result.error);
  });
});
