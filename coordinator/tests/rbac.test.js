'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const db = require('../src/db');
const rbac = require('../src/auth/rbac');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-rbac-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('RBAC', () => {
  describe('ensureBuiltInRoles', () => {
    it('should create admin, operator, viewer roles', () => {
      rbac.ensureBuiltInRoles();
      const roles = rbac.listRoles();
      const names = roles.map(r => r.name);
      assert.ok(names.includes('admin'));
      assert.ok(names.includes('operator'));
      assert.ok(names.includes('viewer'));
    });

    it('should be idempotent', () => {
      rbac.ensureBuiltInRoles();
      rbac.ensureBuiltInRoles();
      const roles = rbac.listRoles();
      const adminCount = roles.filter(r => r.name === 'admin').length;
      assert.strictEqual(adminCount, 1);
    });
  });

  describe('createRole', () => {
    it('should create a custom role', () => {
      const id = rbac.createRole('deployer', 'Can deploy', ['deploy:read', 'deploy:write']);
      assert.ok(id > 0);
    });
  });

  describe('getRole', () => {
    it('should get role with parsed permissions', () => {
      rbac.createRole('test-role', 'test', ['a:read', 'b:write']);
      const role = rbac.getRole('test-role');
      assert.ok(role);
      assert.strictEqual(role.name, 'test-role');
      assert.deepStrictEqual(role.permissions, ['a:read', 'b:write']);
    });

    it('should return undefined for missing role', () => {
      assert.strictEqual(rbac.getRole('ghost'), undefined);
    });
  });

  describe('listRoles', () => {
    it('should list all roles', () => {
      rbac.createRole('r1', 'd1', ['a']);
      rbac.createRole('r2', 'd2', ['b']);
      const roles = rbac.listRoles();
      assert.ok(roles.length >= 2);
    });
  });

  describe('updateRole', () => {
    it('should update role description', () => {
      rbac.createRole('updatable', 'old', ['read']);
      rbac.updateRole('updatable', { description: 'new' });
      const role = rbac.getRole('updatable');
      assert.strictEqual(role.description, 'new');
    });

    it('should update permissions', () => {
      rbac.createRole('perm-update', 'test', ['a']);
      rbac.updateRole('perm-update', { permissions: ['a', 'b', 'c'] });
      const role = rbac.getRole('perm-update');
      assert.deepStrictEqual(role.permissions, ['a', 'b', 'c']);
    });

    it('should return false for empty updates', () => {
      rbac.createRole('no-change', 'test', []);
      const result = rbac.updateRole('no-change', {});
      assert.strictEqual(result, false);
    });
  });

  describe('deleteRole', () => {
    it('should delete custom role', () => {
      rbac.createRole('deletable', 'temp', []);
      assert.ok(rbac.getRole('deletable'));
      rbac.deleteRole('deletable');
      assert.strictEqual(rbac.getRole('deletable'), undefined);
    });

    it('should reject deletion of built-in roles', () => {
      rbac.ensureBuiltInRoles();
      assert.throws(
        () => rbac.deleteRole('admin'),
        /Cannot delete built-in/
      );
    });
  });

  describe('assignRole / revokeRole', () => {
    it('should assign role to user', () => {
      rbac.createRole('tester', 'test role', ['test:read']);
      rbac.assignRole('user-1', 'tester');
      const roles = rbac.getUserRoles('user-1');
      assert.strictEqual(roles.length, 1);
      assert.strictEqual(roles[0].name, 'tester');
    });

    it('should be idempotent (INSERT OR IGNORE)', () => {
      rbac.createRole('repeat', 'test', ['a']);
      rbac.assignRole('user-2', 'repeat');
      rbac.assignRole('user-2', 'repeat');
      const roles = rbac.getUserRoles('user-2');
      assert.strictEqual(roles.length, 1);
    });

    it('should revoke role', () => {
      rbac.createRole('revokable', 'test', ['a']);
      rbac.assignRole('user-3', 'revokable');
      assert.strictEqual(rbac.getUserRoles('user-3').length, 1);
      rbac.revokeRole('user-3', 'revokable');
      assert.strictEqual(rbac.getUserRoles('user-3').length, 0);
    });

    it('should reject assigning nonexistent role', () => {
      assert.throws(
        () => rbac.assignRole('user-4', 'nonexistent'),
        /Role not found/
      );
    });
  });

  describe('getUserPermissions', () => {
    it('should aggregate permissions from multiple roles', () => {
      rbac.createRole('r-a', '', ['x:read']);
      rbac.createRole('r-b', '', ['y:write']);
      rbac.assignRole('user-5', 'r-a');
      rbac.assignRole('user-5', 'r-b');
      const perms = rbac.getUserPermissions('user-5');
      assert.ok(perms.includes('x:read'));
      assert.ok(perms.includes('y:write'));
    });

    it('should deduplicate permissions', () => {
      rbac.createRole('r-c', '', ['common:read']);
      rbac.createRole('r-d', '', ['common:read', 'extra:write']);
      rbac.assignRole('user-6', 'r-c');
      rbac.assignRole('user-6', 'r-d');
      const perms = rbac.getUserPermissions('user-6');
      const commonCount = perms.filter(p => p === 'common:read').length;
      assert.strictEqual(commonCount, 1);
    });
  });

  describe('hasPermission', () => {
    it('should grant admin wildcard access', () => {
      rbac.ensureBuiltInRoles();
      rbac.assignRole('admin-user', 'admin');
      assert.strictEqual(rbac.hasPermission('admin-user', 'anything:whatever'), true);
    });

    it('should check specific permission', () => {
      rbac.createRole('specific', '', ['workers:read']);
      rbac.assignRole('spec-user', 'specific');
      assert.strictEqual(rbac.hasPermission('spec-user', 'workers:read'), true);
      assert.strictEqual(rbac.hasPermission('spec-user', 'workers:write'), false);
    });

    it('should deny users with no roles', () => {
      assert.strictEqual(rbac.hasPermission('nobody', 'workers:read'), false);
    });
  });

  describe('checkPermission', () => {
    it('should throw on denied access', () => {
      assert.throws(
        () => rbac.checkPermission('nobody', 'admin:all'),
        /Access denied/
      );
    });

    it('should not throw on granted access', () => {
      rbac.ensureBuiltInRoles();
      rbac.assignRole('ok-user', 'admin');
      assert.doesNotThrow(() => rbac.checkPermission('ok-user', 'anything'));
    });
  });
});
