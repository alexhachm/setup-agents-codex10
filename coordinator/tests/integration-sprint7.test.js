'use strict';

/**
 * Sprint 7 integration tests — RBAC, API server, audit export,
 * cross-module interactions across all sprints.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const settingsManager = require('../src/settings-manager');
const modelRouter = require('../src/model-router');
const rbac = require('../src/auth/rbac');
const notifier = require('../src/notifier');
const auditExport = require('../src/audit-export');
const dbFramework = require('../src/connectors/databases/framework');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-integ7-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  modelRouter.reset();
  db.init(tmpDir);
  for (const key of Object.keys(dbFramework.ADAPTERS)) {
    delete dbFramework.ADAPTERS[key];
  }
});

afterEach(() => {
  modelRouter.reset();
  settingsManager.reset();
  for (const key of Object.keys(dbFramework.ADAPTERS)) {
    delete dbFramework.ADAPTERS[key];
  }
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Integration: Settings + Model Router', () => {
  it('should resolve models through settings in dev mode', () => {
    assert.strictEqual(settingsManager.getMode(), 'dev');
    const result = modelRouter.resolve('fast');
    assert.strictEqual(result.provider, 'cli');
    assert.strictEqual(result.source, 'dev_mode');
  });

  it('should resolve models through settings in live mode', () => {
    settingsManager.set('mode', 'live');
    const result = modelRouter.resolve('deep');
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(result.model, 'claude-opus-4-6');
  });

  it('should switch providers when default changes', () => {
    settingsManager.set('mode', 'live');
    settingsManager.set('default_provider', 'openai');
    const result = modelRouter.resolve('fast');
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.model, 'gpt-4.1');
  });
});

describe('Integration: Model Router + DB Rules', () => {
  it('should load and use DB routing rules', () => {
    modelRouter.init(db);
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO model_routing_rules (routing_class, provider, model, priority, enabled)
      VALUES ('fast', 'google', 'gemini-2.5-flash', 10, 1)
    `).run();
    modelRouter.init(db);

    settingsManager.set('mode', 'live');
    const result = modelRouter.resolve('fast');
    assert.strictEqual(result.provider, 'google');
    assert.strictEqual(result.source, 'db_rule');
  });
});

describe('Integration: RBAC lifecycle', () => {
  it('should manage full RBAC lifecycle', () => {
    rbac.ensureBuiltInRoles();
    rbac.createRole('deployer', 'Deployment role', ['deploy:read', 'deploy:write']);
    rbac.assignRole('user-1', 'admin');
    rbac.assignRole('user-2', 'deployer');
    rbac.assignRole('user-2', 'viewer');

    assert.strictEqual(rbac.hasPermission('user-1', 'anything'), true);
    assert.strictEqual(rbac.hasPermission('user-2', 'deploy:write'), true);
    assert.strictEqual(rbac.hasPermission('user-2', 'workers:read'), true);
    assert.strictEqual(rbac.hasPermission('user-2', 'admin:all'), false);

    rbac.revokeRole('user-2', 'deployer');
    assert.strictEqual(rbac.hasPermission('user-2', 'deploy:write'), false);
  });
});

describe('Integration: Notifier + DB', () => {
  it('should manage channels and send notifications', async () => {
    notifier.createChannel({ name: 'desk', channel_type: 'desktop', config: {} });
    const result = await notifier.notify('Task completed');
    assert.strictEqual(result.sent_count, 1);
    const channel = notifier.getChannel('desk');
    assert.ok(channel.last_sent_at);
  });
});

describe('Integration: Audit Export', () => {
  it('should export coordinator activity logs', () => {
    db.log('coordinator', 'started', { version: '10.2' });
    db.log('worker-1', 'task_completed', { task_id: 1 });

    const jsonPath = path.join(tmpDir, 'export.json');
    const result = auditExport.exportJson(jsonPath);
    assert.strictEqual(result.record_count, 2);

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    assert.strictEqual(data.length, 2);

    const exports = auditExport.listExports();
    assert.strictEqual(exports.length, 1);
  });
});

describe('Integration: Task Lifecycle', () => {
  it('should create request → task → worker assignment flow', () => {
    const reqId = db.createRequest('Build search feature');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Implement search engine',
      description: 'Build the search engine module',
      domain: 'backend',
      priority: 'high',
    });

    db.registerWorker(1, path.join(tmpDir, 'wt-1'), 'agent-1');
    db.updateTask(taskId, { status: 'ready' });
    db.updateTask(taskId, { status: 'assigned', assigned_to: 1 });
    db.updateWorker(1, { status: 'running', current_task_id: taskId });
    db.updateTask(taskId, { status: 'completed', result: 'Search engine built' });
    db.updateWorker(1, { status: 'idle', current_task_id: null });

    assert.strictEqual(db.getTask(taskId).status, 'completed');
    assert.strictEqual(db.getWorker(1).status, 'idle');
  });
});

describe('Integration: Database Connector Framework', () => {
  it('should execute query through mock adapter', async () => {
    settingsManager.set('connectors.databases.mock', { host: 'localhost' });
    dbFramework.registerAdapter('mock', {
      connect: async () => ({ connected: true }),
      query: async () => ({ rows: [{ id: 1 }], columns: ['id'], execution_time_ms: 2 }),
      disconnect: async () => {},
    });

    const result = await dbFramework.executeQuery('mock', 'SELECT 1');
    assert.strictEqual(result.row_count, 1);
  });
});

describe('Integration: Multi-Provider Settings', () => {
  it('should switch between providers', () => {
    settingsManager.set('mode', 'live');
    settingsManager.set('default_provider', 'anthropic');
    assert.strictEqual(modelRouter.resolve('fast').model, 'claude-sonnet-4-6');

    settingsManager.set('default_provider', 'google');
    assert.strictEqual(modelRouter.resolve('fast').model, 'gemini-2.5-flash');

    settingsManager.set('default_provider', 'deepseek');
    assert.strictEqual(modelRouter.resolve('deep').model, 'deepseek-reasoner');
  });
});

describe('Integration: Schema Tables', () => {
  it('should access scheduled_tasks table', () => {
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO scheduled_tasks (name, cron_expression, command, enabled)
      VALUES ('daily-sync', '0 9 * * *', 'sync', 1)
    `).run();
    const tasks = rawDb.prepare('SELECT * FROM scheduled_tasks WHERE enabled = 1').all();
    assert.strictEqual(tasks.length, 1);
  });

  it('should access confirmations table', () => {
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO confirmations (action_type, action_description, requester, status)
      VALUES ('deploy', 'Deploy to prod', 'worker-1', 'pending')
    `).run();
    const pending = rawDb.prepare("SELECT * FROM confirmations WHERE status = 'pending'").all();
    assert.strictEqual(pending.length, 1);
  });

  it('should access oauth_credentials table', () => {
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO oauth_credentials (connector_name, provider, access_token)
      VALUES ('gmail', 'google', 'access-123')
    `).run();
    const cred = rawDb.prepare("SELECT * FROM oauth_credentials WHERE connector_name = 'gmail'").get();
    assert.strictEqual(cred.access_token, 'access-123');
  });

  it('should access notification_channels table', () => {
    const id = notifier.createChannel({
      name: 'ops-webhook', channel_type: 'webhook',
      config: { url: 'https://hooks.example.com' },
    });
    assert.ok(id > 0);
    notifier.deleteChannel('ops-webhook');
    assert.strictEqual(notifier.getChannel('ops-webhook'), undefined);
  });

  it('should access rbac tables', () => {
    rbac.ensureBuiltInRoles();
    rbac.assignRole('test-user', 'admin');
    assert.strictEqual(rbac.hasPermission('test-user', 'anything'), true);
  });

  it('should access audit_exports table', () => {
    db.log('test', 'action', {});
    const jsonPath = path.join(tmpDir, 'test-export.json');
    auditExport.exportJson(jsonPath);
    const exports = auditExport.listExports();
    assert.ok(exports.length > 0);
  });
});
