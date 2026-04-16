'use strict';

/**
 * Database connector framework — Snowflake, PostgreSQL, MySQL.
 * Provides a unified interface for querying external databases.
 */

const settingsManager = require('../settings-manager');

// ── Adapters ──────────────────────────────────────────────────────────────────

const ADAPTERS = {
  snowflake: {
    name: 'snowflake',
    defaultPort: 443,
    buildConnectionString(cfg) {
      return `snowflake://${cfg.user}@${cfg.account}/${cfg.database}/${cfg.schema || 'public'}?warehouse=${cfg.warehouse || 'COMPUTE_WH'}`;
    },
    async connect(cfg) {
      // In live mode this would use the snowflake-sdk
      // For now, return a scaffold connection object
      return {
        adapter: 'snowflake',
        account: cfg.account,
        database: cfg.database,
        warehouse: cfg.warehouse || 'COMPUTE_WH',
        schema: cfg.schema || 'public',
        connected: false,
        scaffold: true,
      };
    },
    async query(conn, sql, params) {
      if (conn.scaffold) {
        return { scaffold: true, sql, params, adapter: 'snowflake', note: 'Scaffold mode — install snowflake-sdk for live queries' };
      }
      throw new Error('Not connected');
    },
    async close(conn) {
      conn.connected = false;
    },
  },

  postgresql: {
    name: 'postgresql',
    defaultPort: 5432,
    buildConnectionString(cfg) {
      return `postgresql://${cfg.user}:****@${cfg.host}:${cfg.port || 5432}/${cfg.database}`;
    },
    async connect(cfg) {
      return {
        adapter: 'postgresql',
        host: cfg.host,
        port: cfg.port || 5432,
        database: cfg.database,
        connected: false,
        scaffold: true,
      };
    },
    async query(conn, sql, params) {
      if (conn.scaffold) {
        return { scaffold: true, sql, params, adapter: 'postgresql', note: 'Scaffold mode — install pg for live queries' };
      }
      throw new Error('Not connected');
    },
    async close(conn) {
      conn.connected = false;
    },
  },

  mysql: {
    name: 'mysql',
    defaultPort: 3306,
    buildConnectionString(cfg) {
      return `mysql://${cfg.user}:****@${cfg.host}:${cfg.port || 3306}/${cfg.database}`;
    },
    async connect(cfg) {
      return {
        adapter: 'mysql',
        host: cfg.host,
        port: cfg.port || 3306,
        database: cfg.database,
        connected: false,
        scaffold: true,
      };
    },
    async query(conn, sql, params) {
      if (conn.scaffold) {
        return { scaffold: true, sql, params, adapter: 'mysql', note: 'Scaffold mode — install mysql2 for live queries' };
      }
      throw new Error('Not connected');
    },
    async close(conn) {
      conn.connected = false;
    },
  },
};

// ── Connection Registry ───────────────────────────────────────────────────────

const _connections = new Map();

function getAdapter(type) {
  const adapter = ADAPTERS[type];
  if (!adapter) throw new Error(`Unsupported database type: ${type}. Available: ${Object.keys(ADAPTERS).join(', ')}`);
  return adapter;
}

function getConfig(name) {
  return settingsManager.get(`connectors.database.${name}`) || null;
}

async function connect(name, config) {
  const cfg = config || getConfig(name);
  if (!cfg) throw new Error(`No configuration found for database connection: ${name}`);
  if (!cfg.type) throw new Error(`Database type is required (snowflake, postgresql, mysql)`);

  const adapter = getAdapter(cfg.type);
  const conn = await adapter.connect(cfg);
  conn._name = name;
  conn._type = cfg.type;
  _connections.set(name, conn);
  return conn;
}

async function query(name, sql, params = []) {
  const conn = _connections.get(name);
  if (!conn) throw new Error(`No active connection: ${name}. Call connect() first.`);
  const adapter = getAdapter(conn._type);
  return adapter.query(conn, sql, params);
}

async function disconnect(name) {
  const conn = _connections.get(name);
  if (!conn) return false;
  const adapter = getAdapter(conn._type);
  await adapter.close(conn);
  _connections.delete(name);
  return true;
}

function listConnections() {
  return Array.from(_connections.entries()).map(([name, conn]) => ({
    name,
    type: conn._type,
    adapter: conn.adapter,
    connected: conn.connected,
    scaffold: conn.scaffold || false,
  }));
}

function listAdapters() {
  return Object.keys(ADAPTERS).map(name => ({
    name,
    defaultPort: ADAPTERS[name].defaultPort,
  }));
}

function reset() {
  _connections.clear();
}

module.exports = {
  connect,
  query,
  disconnect,
  listConnections,
  listAdapters,
  getAdapter,
  getConfig,
  reset,
  ADAPTERS,
};
