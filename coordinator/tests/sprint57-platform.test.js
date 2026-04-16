'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-s57-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Sprint 5-7: Platform', () => {
  describe('Daemon Mode', () => {
    it('should export daemon commands', () => {
      const daemon = require('../src/commands/daemon');
      assert.strictEqual(typeof daemon.daemonStart, 'function');
      assert.strictEqual(typeof daemon.daemonStop, 'function');
      assert.strictEqual(typeof daemon.daemonStatus, 'function');
    });

    it('should report daemon status', () => {
      const daemon = require('../src/commands/daemon');
      const status = daemon.daemonStatus({ projectDir: tmpDir });
      assert.strictEqual(typeof status.running, 'boolean');
      assert.ok(status.platform);
    });

    it('should have service files', () => {
      const daemon = require('../src/commands/daemon');
      const files = daemon.getServiceFiles();
      assert.ok(files.systemd);
      assert.ok(files.launchd);
    });

    it('should have correct service name', () => {
      const daemon = require('../src/commands/daemon');
      assert.strictEqual(daemon.SERVICE_NAME, 'mac10-coordinator');
    });
  });

  describe('RBAC Action-Level Permissions', () => {
    it('should support resource:action:sub_action format', () => {
      const rbac = require('../src/auth/rbac');
      rbac.ensureBuiltInRoles();

      // Create role with granular permissions
      rbac.createRole('task-manager', 'Can assign and manage tasks', [
        'tasks:read',
        'tasks:write:assign',
        'tasks:write:update',
        'workers:read',
      ]);

      rbac.assignRole('user-1', 'task-manager');
      assert.strictEqual(rbac.hasPermission('user-1', 'tasks:read'), true);
      assert.strictEqual(rbac.hasActionPermission('user-1', 'tasks', 'write', 'assign'), true);
      assert.strictEqual(rbac.hasActionPermission('user-1', 'tasks', 'write', 'delete'), false);
    });

    it('should parse permission strings', () => {
      const rbac = require('../src/auth/rbac');
      const parsed = rbac.parsePermission('tasks:write:assign');
      assert.strictEqual(parsed.resource, 'tasks');
      assert.strictEqual(parsed.action, 'write');
      assert.strictEqual(parsed.subAction, 'assign');
    });

    it('should support wildcard at action level', () => {
      const rbac = require('../src/auth/rbac');
      rbac.ensureBuiltInRoles();
      rbac.assignRole('admin-user', 'admin');
      assert.strictEqual(rbac.hasActionPermission('admin-user', 'tasks', 'write', 'anything'), true);
    });

    it('should export hasActionPermission function', () => {
      const rbac = require('../src/auth/rbac');
      assert.strictEqual(typeof rbac.hasActionPermission, 'function');
      assert.strictEqual(typeof rbac.parsePermission, 'function');
    });
  });

  describe('WebSocket Task Progress Events', () => {
    it('should export event emission functions', () => {
      const apiServer = require('../src/api-server');
      assert.strictEqual(typeof apiServer.emitTaskProgress, 'function');
      assert.strictEqual(typeof apiServer.emitTaskStatusChange, 'function');
      assert.strictEqual(typeof apiServer.emitRequestStatusChange, 'function');
      assert.strictEqual(typeof apiServer.emitWorkerEvent, 'function');
    });

    it('should broadcast events without error when no clients connected', () => {
      const apiServer = require('../src/api-server');
      // Should not throw even with no WebSocket clients
      assert.doesNotThrow(() => {
        apiServer.emitTaskProgress(1, { type: 'heartbeat', progress: 50 });
        apiServer.emitTaskStatusChange(1, 'assigned', 'in_progress', {});
        apiServer.emitRequestStatusChange('req-123', 'pending', 'in_progress');
        apiServer.emitWorkerEvent(1, { type: 'task_started' });
      });
    });

    it('should include broadcast in exports', () => {
      const apiServer = require('../src/api-server');
      assert.strictEqual(typeof apiServer.broadcast, 'function');
    });
  });

  describe('Schema Updates', () => {
    it('should have cost_per_1k columns in model_routing_rules', () => {
      const rawDb = db.getDb();
      const info = rawDb.prepare("PRAGMA table_info(model_routing_rules)").all();
      const columns = info.map(c => c.name);
      assert.ok(columns.includes('cost_per_1k_input'));
      assert.ok(columns.includes('cost_per_1k_output'));
    });

    it('should have expires_at in confirmations table', () => {
      const rawDb = db.getDb();
      const info = rawDb.prepare("PRAGMA table_info(confirmations)").all();
      const columns = info.map(c => c.name);
      assert.ok(columns.includes('expires_at'));
    });

    it('should have usage columns on tasks table', () => {
      const rawDb = db.getDb();
      const info = rawDb.prepare("PRAGMA table_info(tasks)").all();
      const columns = info.map(c => c.name);
      assert.ok(columns.includes('usage_cost_usd'));
      assert.ok(columns.includes('usage_input_tokens'));
      assert.ok(columns.includes('usage_output_tokens'));
    });
  });
});
