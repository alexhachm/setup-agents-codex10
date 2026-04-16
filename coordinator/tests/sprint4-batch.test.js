'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-s4-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Sprint 4: Batch & Connectors', () => {
  describe('Rate Limiting', () => {
    it('should enforce max concurrent in batch-browse', () => {
      const { MAX_CONCURRENT, Semaphore } = require('../src/batch-browse');
      assert.strictEqual(MAX_CONCURRENT, 5);

      const sem = new Semaphore(3);
      assert.strictEqual(sem.max, 3);
      assert.strictEqual(sem.current, 0);
    });

    it('should enforce max concurrent in batch-research', () => {
      const { MAX_CONCURRENT } = require('../src/batch-research');
      assert.strictEqual(MAX_CONCURRENT, 5);
    });

    it('should limit semaphore acquisitions', async () => {
      const { Semaphore } = require('../src/batch-browse');
      const sem = new Semaphore(2);

      await sem.acquire();
      assert.strictEqual(sem.current, 1);
      await sem.acquire();
      assert.strictEqual(sem.current, 2);

      // Third acquire should queue
      let thirdAcquired = false;
      const thirdPromise = sem.acquire().then(() => { thirdAcquired = true; });
      // Give a tick
      await new Promise(r => setTimeout(r, 10));
      assert.strictEqual(thirdAcquired, false);

      // Release one — third should now proceed
      sem.release();
      await thirdPromise;
      assert.strictEqual(thirdAcquired, true);
      sem.release();
      sem.release();
    });
  });

  describe('Slack Inbound', () => {
    it('should create inbound handler', () => {
      const SlackConnector = require('../src/connectors/slack');
      const slack = new SlackConnector({ botToken: 'test-token' });
      const handler = slack.createInboundHandler({
        signingSecret: 'test-secret',
      });
      assert.strictEqual(typeof handler.handleEvent, 'function');
      assert.strictEqual(typeof handler.verifySignature, 'function');
    });

    it('should handle URL verification challenge', () => {
      const SlackConnector = require('../src/connectors/slack');
      const slack = new SlackConnector();
      const handler = slack.createInboundHandler({});
      const result = handler.handleEvent({ type: 'url_verification', challenge: 'test-challenge' });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.challenge, 'test-challenge');
    });

    it('should handle app_mention events', () => {
      const SlackConnector = require('../src/connectors/slack');
      const slack = new SlackConnector();
      let mentionReceived = null;
      const handler = slack.createInboundHandler({
        onMention: (mention) => { mentionReceived = mention; },
      });
      const result = handler.handleEvent({
        type: 'event_callback',
        event: {
          type: 'app_mention',
          text: 'Hey @mac10, research this',
          user: 'U123',
          channel: 'C456',
          ts: '1234567890.123456',
        },
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.handled, 'app_mention');
      assert.ok(mentionReceived);
      assert.strictEqual(mentionReceived.text, 'Hey @mac10, research this');
    });

    it('should handle slash commands', () => {
      const SlackConnector = require('../src/connectors/slack');
      const slack = new SlackConnector();
      let commandReceived = null;
      const handler = slack.createInboundHandler({
        onSlashCommand: (cmd) => { commandReceived = cmd; },
      });
      const result = handler.handleEvent({
        command: '/mac10',
        text: 'status',
        user_id: 'U123',
        channel_id: 'C456',
        response_url: 'https://hooks.slack.com/response/test',
      });
      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.handled, 'slash_command');
      assert.ok(commandReceived);
      assert.strictEqual(commandReceived.command, '/mac10');
    });
  });

  describe('API Key Auth', () => {
    it('should support API key authentication alongside OAuth', () => {
      const { ConnectorFramework } = require('../src/connectors/framework');
      const connector = new ConnectorFramework('test-apikey');
      connector.authenticateWithApiKey('sk-test-key-123');
      assert.strictEqual(connector.isAuthenticated(), true);
      assert.strictEqual(connector.getAuthMethod(), 'api_key');
    });

    it('should include auth_method in status', () => {
      const { ConnectorFramework } = require('../src/connectors/framework');
      const connector = new ConnectorFramework('status-test');
      const status = connector.getStatus();
      assert.ok('auth_method' in status);
    });
  });

  describe('JSONL Entity Format', () => {
    it('should write and read JSONL entity format', () => {
      const entities = [
        { id: 1, type: 'research', query: 'test', url: 'https://example.com', metadata: { source: 'google' } },
        { id: 2, type: 'browse', query: 'test2', url: 'https://example2.com' },
      ];

      // Write JSONL
      const jsonlPath = path.join(tmpDir, 'entities.jsonl');
      const lines = entities.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(jsonlPath, lines);

      // Read JSONL
      const content = fs.readFileSync(jsonlPath, 'utf8');
      const parsed = content.trim().split('\n').map(line => JSON.parse(line));
      assert.strictEqual(parsed.length, 2);
      assert.strictEqual(parsed[0].type, 'research');
      assert.strictEqual(parsed[1].type, 'browse');
      assert.ok(parsed[0].metadata);
    });
  });
});
