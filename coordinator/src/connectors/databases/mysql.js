'use strict';

/**
 * MySQL database adapter.
 * Requires mysql2 npm package (optional dependency).
 */

let mysql;
try {
  mysql = require('mysql2/promise');
} catch {
  mysql = null;
}

const ADAPTER_NAME = 'mysql';

function isAvailable() {
  return mysql !== null;
}

async function connect(config) {
  if (!mysql) {
    throw new Error('mysql2 not installed. Run: npm install mysql2');
  }
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port || 3306,
    user: config.username || config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    connectTimeout: config.timeout || 10000,
  });
  return connection;
}

async function query(connection, sql, opts = {}) {
  const start = Date.now();
  const limitedSql = opts.limit
    ? `SELECT * FROM (${sql}) _q LIMIT ${opts.limit}`
    : sql;

  const [rows, fields] = await connection.execute(limitedSql, opts.params);
  return {
    rows: rows || [],
    columns: fields ? fields.map(f => f.name) : [],
    execution_time_ms: Date.now() - start,
  };
}

async function listTables(connection, schema) {
  const database = schema || connection.config?.database;
  const [rows] = await connection.execute(
    'SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_TYPE FROM information_schema.tables WHERE TABLE_SCHEMA = ?',
    [database]
  );
  return (rows || []).map(r => ({
    name: r.TABLE_NAME,
    schema: r.TABLE_SCHEMA,
    type: r.TABLE_TYPE,
  }));
}

async function describeTable(connection, tableName, schema) {
  const database = schema || connection.config?.database;
  const [rows] = await connection.execute(
    'SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM information_schema.columns WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [database, tableName]
  );
  return (rows || []).map(r => ({
    name: r.COLUMN_NAME,
    type: r.DATA_TYPE,
    nullable: r.IS_NULLABLE === 'YES',
    default: r.COLUMN_DEFAULT,
  }));
}

async function disconnect(connection) {
  await connection.end();
}

module.exports = {
  name: ADAPTER_NAME,
  isAvailable,
  connect,
  query,
  listTables,
  describeTable,
  disconnect,
};
