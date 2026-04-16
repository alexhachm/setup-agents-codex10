'use strict';

/**
 * Snowflake database adapter.
 * Requires snowflake-sdk npm package (optional dependency).
 */

let snowflake;
try {
  snowflake = require('snowflake-sdk');
} catch {
  snowflake = null;
}

const ADAPTER_NAME = 'snowflake';

function isAvailable() {
  return snowflake !== null;
}

async function connect(config) {
  if (!snowflake) {
    throw new Error('snowflake-sdk not installed. Run: npm install snowflake-sdk');
  }
  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    password: config.password,
    warehouse: config.warehouse,
    database: config.database,
    schema: config.schema,
    role: config.role,
  });

  return new Promise((resolve, reject) => {
    connection.connect((err, conn) => {
      if (err) reject(err);
      else resolve(conn);
    });
  });
}

async function query(connection, sql, opts = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: sql,
      binds: opts.params,
      complete: (err, stmt, rows) => {
        if (err) return reject(err);
        const columns = stmt.getColumns ? stmt.getColumns().map(c => c.getName()) : [];
        resolve({
          rows: (rows || []).slice(0, opts.limit || 1000),
          columns,
          execution_time_ms: Date.now() - start,
        });
      },
    });
  });
}

async function listTables(connection, schema) {
  const sql = schema
    ? `SHOW TABLES IN SCHEMA ${schema}`
    : 'SHOW TABLES';
  const result = await query(connection, sql);
  return result.rows.map(r => ({
    name: r.name || r.TABLE_NAME,
    schema: r.schema_name || r.TABLE_SCHEMA,
    database: r.database_name || r.TABLE_CATALOG,
  }));
}

async function describeTable(connection, tableName, schema) {
  const qualifiedName = schema ? `${schema}.${tableName}` : tableName;
  const sql = `DESCRIBE TABLE ${qualifiedName}`;
  const result = await query(connection, sql);
  return result.rows.map(r => ({
    name: r.name || r.COLUMN_NAME,
    type: r.type || r.DATA_TYPE,
    nullable: r.null !== 'NOT NULL',
    default: r.default,
  }));
}

async function disconnect(connection) {
  return new Promise((resolve) => {
    connection.destroy((err) => resolve());
  });
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
