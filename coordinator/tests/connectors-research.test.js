'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { ConnectorFramework, registerConnector, getConnector, listConnectors } = require('../src/connectors/framework');
const GmailConnector = require('../src/connectors/gmail');
const SlackConnector = require('../src/connectors/slack');
const deepResearch = require('../src/deep-research');
const batchResearch = require('../src/batch-research');
const contextBundle = require('../src/context-bundle');
const connectCmd = require('../src/commands/connect');
const searchEngine = require('../src/search/engine');
const settingsManager = require('../src/settings-manager');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-conn-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  db.init(tmpDir);
  searchEngine.reset();
});

afterEach(() => {
  settingsManager.reset();
  searchEngine.reset();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ConnectorFramework', () => {
  describe('constructor', () => {
    it('should create connector with options', () => {
      const conn = new ConnectorFramework('test', {
        scopes: ['read', 'write'],
        authUrl: 'https://auth.example.com',
      });
      assert.strictEqual(conn.name, 'test');
      assert.deepStrictEqual(conn.scopes, ['read', 'write']);
    });
  });

  describe('credentials', () => {
    it('should store and retrieve credentials', () => {
      const conn = new ConnectorFramework('test-cred');
      conn.storeCredentials({
        access_token: 'test-token',
        refresh_token: 'refresh-token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      const creds = conn.getCredentials();
      assert.strictEqual(creds.access_token, 'test-token');
      assert.strictEqual(creds.refresh_token, 'refresh-token');
    });

    it('should detect authenticated state', () => {
      const conn = new ConnectorFramework('test-auth');
      assert.strictEqual(conn.isAuthenticated(), false);
      conn.storeCredentials({
        access_token: 'token',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });
      assert.strictEqual(conn.isAuthenticated(), true);
    });

    it('should detect expired credentials', () => {
      const conn = new ConnectorFramework('test-expired');
      conn.storeCredentials({
        access_token: 'token',
        expires_at: new Date(Date.now() - 1000).toISOString(),
      });
      assert.strictEqual(conn.isAuthenticated(), false);
    });
  });

  describe('config', () => {
    it('should set and get config values', () => {
      const conn = new ConnectorFramework('test-config');
      conn.setConfig('key1', 'value1');
      assert.strictEqual(conn.getConfig('key1'), 'value1');
      assert.strictEqual(conn.getConfig('nonexistent'), null);
    });
  });

  describe('disconnect', () => {
    it('should remove credentials and config', () => {
      const conn = new ConnectorFramework('test-disc');
      conn.storeCredentials({ access_token: 'token' });
      conn.setConfig('key', 'val');
      conn.disconnect();
      assert.strictEqual(conn.isAuthenticated(), false);
      assert.strictEqual(conn.getConfig('key'), null);
    });
  });

  describe('getAuthUrl', () => {
    it('should build auth URL with params', () => {
      const conn = new ConnectorFramework('test-url', {
        clientId: 'client123',
        authUrl: 'https://auth.example.com/authorize',
        scopes: ['read'],
      });
      const url = conn.getAuthUrl('test-state');
      assert.ok(url.includes('client123'));
      assert.ok(url.includes('test-state'));
      assert.ok(url.includes('read'));
    });
  });

  describe('getStatus', () => {
    it('should return connector status', () => {
      const conn = new ConnectorFramework('test-status', { scopes: ['read'] });
      const status = conn.getStatus();
      assert.strictEqual(status.name, 'test-status');
      assert.strictEqual(status.authenticated, false);
    });
  });

  describe('registry', () => {
    it('should register and list connectors', () => {
      const conn = new ConnectorFramework('registry-test');
      registerConnector(conn);
      assert.ok(getConnector('registry-test'));
      const all = listConnectors();
      assert.ok(all.some(c => c.name === 'registry-test'));
    });
  });
});

describe('Gmail Connector', () => {
  it('should create with defaults', () => {
    const gmail = new GmailConnector();
    assert.strictEqual(gmail.name, 'gmail');
    assert.ok(gmail.scopes.length > 0);
  });
});

describe('Slack Connector', () => {
  it('should create with defaults', () => {
    const slack = new SlackConnector();
    assert.strictEqual(slack.name, 'slack');
  });

  it('should detect bot token availability', () => {
    const slack = new SlackConnector({ botToken: 'xoxb-test' });
    assert.strictEqual(slack.isAvailable(), true);
  });
});

describe('Deep Research', () => {
  it('should execute single-round research in dev mode', async () => {
    searchEngine.registerAdapter('mock', {
      isAvailable: () => true,
      search: async (query) => ({
        items: [{ title: 'Result', url: 'https://example.com', snippet: 'A finding' }],
      }),
    });
    settingsManager.set('search.default_provider', 'mock');

    const result = await deepResearch.research('test topic');
    assert.strictEqual(result.topic, 'test topic');
    assert.ok(result.rounds.length >= 1);
    assert.ok(result.citations.length >= 1);
  });

  it('should deduplicate citations', () => {
    const citations = [
      { url: 'https://a.com', title: 'A' },
      { url: 'https://b.com', title: 'B' },
      { url: 'https://a.com', title: 'A duplicate' },
    ];
    const deduped = deepResearch.deduplicateCitations(citations);
    assert.strictEqual(deduped.length, 2);
  });

  it('should handle search errors', async () => {
    // No adapters registered — should fail gracefully
    const result = await deepResearch.research('failing topic');
    assert.ok(result.rounds[0].error);
  });
});

describe('Batch Research', () => {
  beforeEach(() => {
    searchEngine.registerAdapter('mock', {
      isAvailable: () => true,
      search: async (query) => ({
        items: [{ title: query, url: `https://example.com/${query}`, snippet: 'result' }],
      }),
    });
    settingsManager.set('search.default_provider', 'mock');
  });

  it('should batch search multiple queries', async () => {
    const result = await batchResearch.batchSearch(['query1', 'query2', 'query3']);
    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.success_count, 3);
  });

  it('should batch deep research', async () => {
    const result = await batchResearch.batchDeepResearch(['topic1', 'topic2']);
    assert.strictEqual(result.total, 2);
  });
});

describe('Context Bundle', () => {
  describe('estimateTokens', () => {
    it('should estimate token count', () => {
      assert.strictEqual(contextBundle.estimateTokens('hello'), 2); // 5 chars / 4
      assert.strictEqual(contextBundle.estimateTokens(''), 0);
    });
  });

  describe('compact', () => {
    it('should not compact small conversations', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const compacted = await contextBundle.compact(messages);
      assert.strictEqual(compacted.length, 2);
    });

    it('should compact large conversations', async () => {
      const messages = [];
      // Create many messages to exceed threshold
      for (let i = 0; i < 100; i++) {
        messages.push({ role: 'user', content: 'A'.repeat(5000) });
        messages.push({ role: 'assistant', content: 'B'.repeat(5000) });
      }
      const compacted = await contextBundle.compact(messages, { maxTokens: 1000, keepLast: 5 });
      assert.ok(compacted.length < messages.length);
      assert.ok(compacted.length <= 6); // 1 summary + 5 recent
    });
  });

  describe('simpleCompact', () => {
    it('should truncate older messages', () => {
      const messages = [
        { role: 'user', content: 'Old message 1\nWith\nMultiple\nLines' },
        { role: 'assistant', content: 'Old response' },
        { role: 'user', content: 'Recent 1' },
        { role: 'assistant', content: 'Recent 2' },
      ];
      const compacted = contextBundle.simpleCompact(messages, 100, 2);
      assert.strictEqual(compacted.length, 3); // 1 summary + 2 recent
      assert.strictEqual(compacted[0].role, 'system');
    });
  });

  describe('buildBundle', () => {
    it('should build context from task and project', () => {
      const bundle = contextBundle.buildBundle(
        { subject: 'Fix bug', description: 'Fix the login bug', domain: 'auth' },
        'A web application project'
      );
      assert.ok(bundle.includes('Fix bug'));
      assert.ok(bundle.includes('auth'));
      assert.ok(bundle.includes('web application'));
    });
  });
});

describe('Connect Command', () => {
  it('should list connectors', () => {
    const result = connectCmd.runConnectors([], tmpDir);
    assert.ok(result.connectors);
    assert.ok(result.connectors.length >= 2);
  });

  it('should error on missing service name', () => {
    const result = connectCmd.runConnect([], tmpDir);
    assert.ok(result.error);
  });

  it('should return auth URL for known service', () => {
    const result = connectCmd.runConnect(['gmail'], tmpDir);
    assert.strictEqual(result.status, 'auth_required');
    assert.ok(result.auth_url);
  });

  it('should connect with direct token', () => {
    const result = connectCmd.runConnect(['gmail', '--token', 'test-token-123'], tmpDir);
    assert.strictEqual(result.status, 'connected');
  });

  it('should disconnect service', () => {
    connectCmd.runConnect(['slack', '--token', 'test'], tmpDir);
    const result = connectCmd.runConnectors(['disconnect', 'slack'], tmpDir);
    assert.strictEqual(result.status, 'disconnected');
  });

  it('should error on unknown service', () => {
    const result = connectCmd.runConnect(['unknown-service'], tmpDir);
    assert.ok(result.error);
  });
});

describe('Egress Proxy', () => {
  const egressProxy = require('../src/egress-proxy');

  it('should throw for unknown connector', async () => {
    await assert.rejects(
      () => egressProxy.injectCredentials('nonexistent', {}),
      /not found/
    );
  });

  it('should create proxied client', () => {
    const client = egressProxy.createProxiedClient('gmail');
    assert.strictEqual(typeof client, 'function');
  });
});
