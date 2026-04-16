'use strict';

/**
 * RBAC — Role-Based Access Control foundation.
 * Manages roles, permissions, and user-role assignments.
 */

const db = require('../db');

const BUILT_IN_ROLES = {
  admin: {
    description: 'Full access to all features',
    permissions: ['*'],
  },
  operator: {
    description: 'Can manage workers, tasks, and deployments',
    permissions: [
      'workers:read', 'workers:write',
      'tasks:read', 'tasks:write',
      'deploy:read', 'deploy:write',
      'settings:read',
      'connectors:read',
    ],
  },
  viewer: {
    description: 'Read-only access',
    permissions: [
      'workers:read', 'tasks:read', 'requests:read',
      'settings:read', 'connectors:read',
      'activity_log:read', 'deploy:read',
    ],
  },
};

function ensureBuiltInRoles() {
  const rawDb = db.getDb();
  for (const [name, role] of Object.entries(BUILT_IN_ROLES)) {
    const existing = rawDb.prepare('SELECT id FROM rbac_roles WHERE name = ?').get(name);
    if (!existing) {
      rawDb.prepare(
        'INSERT INTO rbac_roles (name, description, permissions) VALUES (?, ?, ?)'
      ).run(name, role.description, JSON.stringify(role.permissions));
    }
  }
}

function createRole(name, description, permissions) {
  const rawDb = db.getDb();
  const result = rawDb.prepare(
    'INSERT INTO rbac_roles (name, description, permissions) VALUES (?, ?, ?)'
  ).run(name, description, JSON.stringify(permissions || []));
  return Number(result.lastInsertRowid);
}

function getRole(name) {
  const rawDb = db.getDb();
  const row = rawDb.prepare('SELECT * FROM rbac_roles WHERE name = ?').get(name);
  if (row) {
    try { row.permissions = JSON.parse(row.permissions); } catch { row.permissions = []; }
  }
  return row;
}

function listRoles() {
  const rawDb = db.getDb();
  return rawDb.prepare('SELECT * FROM rbac_roles ORDER BY name').all().map(row => {
    try { row.permissions = JSON.parse(row.permissions); } catch { row.permissions = []; }
    return row;
  });
}

function updateRole(name, updates) {
  const rawDb = db.getDb();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'name' || key === 'id') continue;
    fields.push(`${key} = ?`);
    values.push(key === 'permissions' ? JSON.stringify(value) : value);
  }
  if (fields.length === 0) return false;
  values.push(name);
  return rawDb.prepare(`UPDATE rbac_roles SET ${fields.join(', ')} WHERE name = ?`).run(...values).changes > 0;
}

function deleteRole(name) {
  if (BUILT_IN_ROLES[name]) {
    throw new Error(`Cannot delete built-in role: ${name}`);
  }
  const rawDb = db.getDb();
  rawDb.prepare('DELETE FROM rbac_user_roles WHERE role_id IN (SELECT id FROM rbac_roles WHERE name = ?)').run(name);
  return rawDb.prepare('DELETE FROM rbac_roles WHERE name = ?').run(name).changes > 0;
}

function assignRole(userId, roleName) {
  const rawDb = db.getDb();
  const role = rawDb.prepare('SELECT id FROM rbac_roles WHERE name = ?').get(roleName);
  if (!role) throw new Error(`Role not found: ${roleName}`);
  rawDb.prepare(
    'INSERT OR IGNORE INTO rbac_user_roles (user_id, role_id) VALUES (?, ?)'
  ).run(userId, role.id);
  return true;
}

function revokeRole(userId, roleName) {
  const rawDb = db.getDb();
  const role = rawDb.prepare('SELECT id FROM rbac_roles WHERE name = ?').get(roleName);
  if (!role) return false;
  return rawDb.prepare(
    'DELETE FROM rbac_user_roles WHERE user_id = ? AND role_id = ?'
  ).run(userId, role.id).changes > 0;
}

function getUserRoles(userId) {
  const rawDb = db.getDb();
  return rawDb.prepare(`
    SELECT r.name, r.description, r.permissions
    FROM rbac_roles r
    JOIN rbac_user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
    ORDER BY r.name
  `).all(userId).map(row => {
    try { row.permissions = JSON.parse(row.permissions); } catch { row.permissions = []; }
    return row;
  });
}

function getUserPermissions(userId) {
  const roles = getUserRoles(userId);
  const permissions = new Set();
  for (const role of roles) {
    for (const perm of role.permissions) {
      permissions.add(perm);
    }
  }
  return [...permissions];
}

function hasPermission(userId, permission) {
  const perms = getUserPermissions(userId);
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  // Check wildcard: "workers:*" matches "workers:read"
  const [resource] = permission.split(':');
  return perms.includes(`${resource}:*`);
}

function checkPermission(userId, permission) {
  if (!hasPermission(userId, permission)) {
    throw new Error(`Access denied: ${userId} lacks permission ${permission}`);
  }
}

module.exports = {
  BUILT_IN_ROLES,
  ensureBuiltInRoles,
  createRole,
  getRole,
  listRoles,
  updateRole,
  deleteRole,
  assignRole,
  revokeRole,
  getUserRoles,
  getUserPermissions,
  hasPermission,
  checkPermission,
};
