'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const notifier = require('../src/notifier');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-notifier-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Notifier', () => {
  describe('createChannel', () => {
    it('should create a webhook channel', () => {
      const id = notifier.createChannel({
        name: 'test-webhook',
        channel_type: 'webhook',
        config: { url: 'https://example.com/hook' },
      });
      assert.ok(id > 0);
    });

    it('should create a slack channel', () => {
      const id = notifier.createChannel({
        name: 'test-slack',
        channel_type: 'slack',
        config: { channel: '#alerts', token: 'xoxb-test' },
      });
      assert.ok(id > 0);
    });

    it('should create a desktop channel', () => {
      const id = notifier.createChannel({
        name: 'test-desktop',
        channel_type: 'desktop',
        config: {},
      });
      assert.ok(id > 0);
    });
  });

  describe('getChannel', () => {
    it('should retrieve channel by name', () => {
      notifier.createChannel({
        name: 'my-hook',
        channel_type: 'webhook',
        config: { url: 'https://example.com' },
      });
      const channel = notifier.getChannel('my-hook');
      assert.ok(channel);
      assert.strictEqual(channel.name, 'my-hook');
      assert.strictEqual(channel.channel_type, 'webhook');
      assert.strictEqual(channel.config.url, 'https://example.com');
    });

    it('should return undefined for nonexistent channel', () => {
      const channel = notifier.getChannel('nonexistent');
      assert.strictEqual(channel, undefined);
    });
  });

  describe('listChannels', () => {
    it('should list all channels', () => {
      notifier.createChannel({ name: 'ch1', channel_type: 'webhook', config: {} });
      notifier.createChannel({ name: 'ch2', channel_type: 'slack', config: {} });
      const channels = notifier.listChannels();
      assert.strictEqual(channels.length, 2);
    });

    it('should return empty array when none exist', () => {
      const channels = notifier.listChannels();
      assert.deepStrictEqual(channels, []);
    });
  });

  describe('updateChannel', () => {
    it('should update channel config', () => {
      notifier.createChannel({
        name: 'test-up',
        channel_type: 'webhook',
        config: { url: 'https://old.com' },
      });
      notifier.updateChannel('test-up', { config: { url: 'https://new.com' } });
      const channel = notifier.getChannel('test-up');
      assert.strictEqual(channel.config.url, 'https://new.com');
    });

    it('should update enabled flag', () => {
      notifier.createChannel({ name: 'test-flag', channel_type: 'desktop', config: {} });
      notifier.updateChannel('test-flag', { enabled: 0 });
      const channel = notifier.getChannel('test-flag');
      assert.strictEqual(channel.enabled, 0);
    });
  });

  describe('deleteChannel', () => {
    it('should delete channel', () => {
      notifier.createChannel({ name: 'del-me', channel_type: 'webhook', config: {} });
      assert.ok(notifier.getChannel('del-me'));
      const deleted = notifier.deleteChannel('del-me');
      assert.strictEqual(deleted, true);
      assert.strictEqual(notifier.getChannel('del-me'), undefined);
    });

    it('should return false for nonexistent', () => {
      const deleted = notifier.deleteChannel('nope');
      assert.strictEqual(deleted, false);
    });
  });

  describe('sendToChannel', () => {
    it('should handle desktop notifications', async () => {
      const channel = { channel_type: 'desktop', config: {} };
      const result = await notifier.sendToChannel(channel, 'hello');
      assert.strictEqual(result.type, 'desktop');
    });

    it('should handle email with note', async () => {
      const channel = { channel_type: 'email', config: {} };
      const result = await notifier.sendToChannel(channel, 'hello');
      assert.ok(result.note);
    });

    it('should reject unknown type', async () => {
      const channel = { channel_type: 'carrier_pigeon', config: {} };
      await assert.rejects(
        () => notifier.sendToChannel(channel, 'coo'),
        /Unknown channel type/
      );
    });
  });

  describe('notify', () => {
    it('should send to all enabled channels', async () => {
      notifier.createChannel({ name: 'desk1', channel_type: 'desktop', config: {} });
      notifier.createChannel({ name: 'desk2', channel_type: 'desktop', config: {} });
      const result = await notifier.notify('hello');
      assert.strictEqual(result.sent_count, 2);
      assert.strictEqual(result.results.length, 2);
    });

    it('should skip disabled channels', async () => {
      notifier.createChannel({ name: 'enabled', channel_type: 'desktop', config: {} });
      notifier.createChannel({ name: 'disabled', channel_type: 'desktop', config: {}, enabled: false });
      const result = await notifier.notify('test');
      assert.strictEqual(result.sent_count, 1);
    });

    it('should handle no channels gracefully', async () => {
      const result = await notifier.notify('hello');
      assert.strictEqual(result.sent_count, 0);
    });
  });
});
