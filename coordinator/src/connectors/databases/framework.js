'use strict';

/**
 * Database Connector Framework — unified interface for querying external databases.
 * Supports Snowflake, PostgreSQL, MySQL via adapter pattern.
 */

const settingsManager = require('../../settings-manager');

const ADAPTERS = {};

function registerAdapter(name, adapter) {
  if (!adapter || typeof adapter.connect !== 'function') {
    throw new Error(`Adapter "${name}" must implement connect()`);
  }
  ADAPTERS[name] = adapter;
}

function getAdapter(name) {
  return ADAPTERS[name] || null;
}

function listAdapters() {
  return Object.keys(ADAPTERS).map(name => ({
    name,
    configured: isConfigured(name),
  }));
}

function isConfigured(adapterName) {
  const config = settingsManager.get(`connectors.databases.${adapterName}`);
  return !!(config && (config.host || config.account || config.connection_string));
}

function getConfig(adapterName) {
  return settingsManager.get(`connectors.databases.${adapterName}`) || {};
}

/**
 * Execute a query through the named adapter.
 * @param {string} adapterName - 'snowflake', 'postgresql', 'mysql'
 * @param {string} query - SQL query
 * @param {Object} opts - { params, timeout, limit }
 */
async function executeQuery(adapterName, query, opts = {}) {
  const adapter = getAdapter(adapterName);
  if (!adapter) throw new Error(`Database adapter "${adapterName}" not registered`);
  if (!isConfigured(adapterName)) {
    throw new Error(`Database "${adapterName}" not configured. Use mac10 settings to configure.`);
  }

  const config = getConfig(adapterName);
  const connection = await adapter.connect(config);

  try {
    const result = await adapter.query(connection, query, {
      params: opts.params,
      timeout: opts.timeout || 30000,
      limit: opts.limit || 1000,
    });
    return {
      adapter: adapterName,
      rows: result.rows || [],
      columns: result.columns || [],
      row_count: result.rows ? result.rows.length : 0,
      execution_time_ms: result.execution_time_ms,
    };
  } finally {
    if (adapter.disconnect) {
      await adapter.disconnect(connection);
    }
  }
}

/**
 * List tables/schemas for a database adapter.
 */
async function listTables(adapterName, schema) {
  const adapter = getAdapter(adapterName);
  if (!adapter) throw new Error(`Database adapter "${adapterName}" not registered`);
  if (!adapter.listTables) throw new Error(`Adapter "${adapterName}" does not support listTables`);

  const config = getConfig(adapterName);
  const connection = await adapter.connect(config);

  try {
    return await adapter.listTables(connection, schema);
  } finally {
    if (adapter.disconnect) {
      await adapter.disconnect(connection);
    }
  }
}

/**
 * Describe a table's columns.
 */
async function describeTable(adapterName, tableName, schema) {
  const adapter = getAdapter(adapterName);
  if (!adapter) throw new Error(`Database adapter "${adapterName}" not registered`);
  if (!adapter.describeTable) throw new Error(`Adapter "${adapterName}" does not support describeTable`);

  const config = getConfig(adapterName);
  const connection = await adapter.connect(config);

  try {
    return await adapter.describeTable(connection, tableName, schema);
  } finally {
    if (adapter.disconnect) {
      await adapter.disconnect(connection);
    }
  }
}

module.exports = {
  registerAdapter,
  getAdapter,
  listAdapters,
  isConfigured,
  getConfig,
  executeQuery,
  listTables,
  describeTable,
  ADAPTERS,
};
