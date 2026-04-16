'use strict';

/**
 * PostgreSQL database adapter.
 * Requires pg npm package (optional dependency).
 */

let pg;
try {
  pg = require('pg');
} catch {
  pg = null;
}

const ADAPTER_NAME = 'postgresql';

function isAvailable() {
  return pg !== null;
}

async function connect(config) {
  if (!pg) {
    throw new Error('pg not installed. Run: npm install pg');
  }
  const client = new pg.Client({
    host: config.host,
    port: config.port || 5432,
    user: config.username || config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    connectionTimeoutMillis: config.timeout || 10000,
  });
  await client.connect();
  return client;
}

async function query(connection, sql, opts = {}) {
  const start = Date.now();
  const limitedSql = opts.limit
    ? `SELECT * FROM (${sql}) _q LIMIT ${opts.limit}`
    : sql;

  const result = await connection.query(limitedSql, opts.params);
  return {
    rows: result.rows || [],
    columns: result.fields ? result.fields.map(f => f.name) : [],
    execution_time_ms: Date.now() - start,
  };
}

async function listTables(connection, schema) {
  const schemaFilter = schema || 'public';
  const result = await query(connection, `
    SELECT table_name, table_schema, table_type
    FROM information_schema.tables
    WHERE table_schema = $1
    ORDER BY table_name
  `, { params: [schemaFilter] });

  return result.rows.map(r => ({
    name: r.table_name,
    schema: r.table_schema,
    type: r.table_type,
  }));
}

async function describeTable(connection, tableName, schema) {
  const schemaFilter = schema || 'public';
  const result = await query(connection, `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `, { params: [schemaFilter, tableName] });

  return result.rows.map(r => ({
    name: r.column_name,
    type: r.data_type,
    nullable: r.is_nullable === 'YES',
    default: r.column_default,
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
