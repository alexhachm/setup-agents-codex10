'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsManager = require('../src/settings-manager');
const dbFramework = require('../src/connectors/databases/framework');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-dbconn-'));
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  // Clear registered adapters
  for (const key of Object.keys(dbFramework.ADAPTERS)) {
    delete dbFramework.ADAPTERS[key];
  }
});

afterEach(() => {
  settingsManager.reset();
  for (const key of Object.keys(dbFramework.ADAPTERS)) {
    delete dbFramework.ADAPTERS[key];
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Database Connector Framework', () => {
  describe('registerAdapter', () => {
    it('should register a valid adapter', () => {
      const adapter = {
        connect: async () => ({}),
        query: async () => ({ rows: [], columns: [] }),
      };
      dbFramework.registerAdapter('test', adapter);
      assert.ok(dbFramework.getAdapter('test'));
    });

    it('should reject adapter without connect', () => {
      assert.throws(
        () => dbFramework.registerAdapter('bad', { query: async () => {} }),
        /must implement connect/
      );
    });

    it('should reject null adapter', () => {
      assert.throws(
        () => dbFramework.registerAdapter('null', null),
        /must implement connect/
      );
    });
  });

  describe('getAdapter', () => {
    it('should return null for unknown adapter', () => {
      assert.strictEqual(dbFramework.getAdapter('nonexistent'), null);
    });
  });

  describe('listAdapters', () => {
    it('should list registered adapters', () => {
      dbFramework.registerAdapter('pg', {
        connect: async () => ({}),
        query: async () => ({ rows: [] }),
      });
      const list = dbFramework.listAdapters();
      assert.strictEqual(list.length, 1);
      assert.strictEqual(list[0].name, 'pg');
    });

    it('should return empty when no adapters registered', () => {
      const list = dbFramework.listAdapters();
      assert.deepStrictEqual(list, []);
    });
  });

  describe('isConfigured', () => {
    it('should return false for unconfigured adapter', () => {
      assert.strictEqual(dbFramework.isConfigured('postgresql'), false);
    });

    it('should return true when host is configured', () => {
      settingsManager.set('connectors.databases.postgresql', { host: 'localhost' });
      assert.strictEqual(dbFramework.isConfigured('postgresql'), true);
    });

    it('should return true when account is configured', () => {
      settingsManager.set('connectors.databases.snowflake', { account: 'myaccount' });
      assert.strictEqual(dbFramework.isConfigured('snowflake'), true);
    });
  });

  describe('executeQuery', () => {
    it('should reject unregistered adapter', async () => {
      await assert.rejects(
        () => dbFramework.executeQuery('nonexistent', 'SELECT 1'),
        /not registered/
      );
    });

    it('should reject unconfigured adapter', async () => {
      dbFramework.registerAdapter('test', {
        connect: async () => ({}),
        query: async () => ({ rows: [] }),
      });
      await assert.rejects(
        () => dbFramework.executeQuery('test', 'SELECT 1'),
        /not configured/
      );
    });

    it('should execute query on configured adapter', async () => {
      settingsManager.set('connectors.databases.mock', { host: 'localhost' });
      let disconnected = false;
      dbFramework.registerAdapter('mock', {
        connect: async () => ({ id: 'mock-conn' }),
        query: async (conn, sql, opts) => ({
          rows: [{ id: 1, name: 'test' }],
          columns: ['id', 'name'],
          execution_time_ms: 5,
        }),
        disconnect: async () => { disconnected = true; },
      });

      const result = await dbFramework.executeQuery('mock', 'SELECT * FROM test');
      assert.strictEqual(result.adapter, 'mock');
      assert.strictEqual(result.row_count, 1);
      assert.deepStrictEqual(result.columns, ['id', 'name']);
      assert.ok(disconnected);
    });
  });

  describe('listTables', () => {
    it('should reject adapter without listTables', async () => {
      dbFramework.registerAdapter('basic', {
        connect: async () => ({}),
        query: async () => ({ rows: [] }),
      });
      await assert.rejects(
        () => dbFramework.listTables('basic'),
        /does not support listTables/
      );
    });
  });

  describe('describeTable', () => {
    it('should reject adapter without describeTable', async () => {
      dbFramework.registerAdapter('basic', {
        connect: async () => ({}),
        query: async () => ({ rows: [] }),
      });
      await assert.rejects(
        () => dbFramework.describeTable('basic', 'users'),
        /does not support describeTable/
      );
    });
  });
});

describe('Snowflake adapter', () => {
  const snowflake = require('../src/connectors/databases/snowflake');

  it('should export correct interface', () => {
    assert.strictEqual(snowflake.name, 'snowflake');
    assert.strictEqual(typeof snowflake.connect, 'function');
    assert.strictEqual(typeof snowflake.query, 'function');
    assert.strictEqual(typeof snowflake.listTables, 'function');
    assert.strictEqual(typeof snowflake.describeTable, 'function');
    assert.strictEqual(typeof snowflake.disconnect, 'function');
  });

  it('should report availability based on sdk', () => {
    const available = snowflake.isAvailable();
    assert.strictEqual(typeof available, 'boolean');
  });
});

describe('PostgreSQL adapter', () => {
  const postgresql = require('../src/connectors/databases/postgresql');

  it('should export correct interface', () => {
    assert.strictEqual(postgresql.name, 'postgresql');
    assert.strictEqual(typeof postgresql.connect, 'function');
    assert.strictEqual(typeof postgresql.query, 'function');
    assert.strictEqual(typeof postgresql.listTables, 'function');
    assert.strictEqual(typeof postgresql.describeTable, 'function');
    assert.strictEqual(typeof postgresql.disconnect, 'function');
  });

  it('should report availability based on pg module', () => {
    const available = postgresql.isAvailable();
    assert.strictEqual(typeof available, 'boolean');
  });
});

describe('MySQL adapter', () => {
  const mysql = require('../src/connectors/databases/mysql');

  it('should export correct interface', () => {
    assert.strictEqual(mysql.name, 'mysql');
    assert.strictEqual(typeof mysql.connect, 'function');
    assert.strictEqual(typeof mysql.query, 'function');
    assert.strictEqual(typeof mysql.listTables, 'function');
    assert.strictEqual(typeof mysql.describeTable, 'function');
    assert.strictEqual(typeof mysql.disconnect, 'function');
  });

  it('should report availability based on mysql2 module', () => {
    const available = mysql.isAvailable();
    assert.strictEqual(typeof available, 'boolean');
  });
});

describe('Plaid connector scaffold', () => {
  const plaid = require('../src/connectors/plaid');

  it('should export correct interface', () => {
    assert.strictEqual(plaid.name, 'plaid');
    assert.strictEqual(typeof plaid.isConfigured, 'function');
    assert.strictEqual(typeof plaid.createLinkToken, 'function');
    assert.strictEqual(typeof plaid.exchangePublicToken, 'function');
    assert.strictEqual(typeof plaid.getAccounts, 'function');
    assert.strictEqual(typeof plaid.getTransactions, 'function');
    assert.strictEqual(typeof plaid.getBalance, 'function');
  });

  it('should not be configured by default', () => {
    assert.strictEqual(plaid.isConfigured(), false);
  });

  it('should have Plaid environments', () => {
    assert.ok(plaid.PLAID_ENVIRONMENTS.sandbox);
    assert.ok(plaid.PLAID_ENVIRONMENTS.production);
  });

  it('should reject createLinkToken when not configured', async () => {
    await assert.rejects(
      () => plaid.createLinkToken('user-1'),
      /not configured/
    );
  });

  it('should reject getAccounts when not configured', async () => {
    await assert.rejects(
      () => plaid.getAccounts('token'),
      /not configured/
    );
  });

  it('should reject getTransactions when not configured', async () => {
    await assert.rejects(
      () => plaid.getTransactions('token', '2024-01-01', '2024-12-31'),
      /not configured/
    );
  });
});

describe('Notion connector', () => {
  const notion = require('../src/connectors/notion');

  it('should export correct interface', () => {
    assert.strictEqual(notion.name, 'notion');
    assert.strictEqual(typeof notion.search, 'function');
    assert.strictEqual(typeof notion.getPage, 'function');
    assert.strictEqual(typeof notion.createPage, 'function');
    assert.strictEqual(typeof notion.isConfigured, 'function');
  });

  it('should not be configured without token', () => {
    const orig = process.env.NOTION_API_KEY;
    delete process.env.NOTION_API_KEY;
    assert.strictEqual(notion.isConfigured(), false);
    if (orig) process.env.NOTION_API_KEY = orig;
  });
});

describe('Linear connector', () => {
  const linear = require('../src/connectors/linear');

  it('should export correct interface', () => {
    assert.strictEqual(linear.name, 'linear');
    assert.strictEqual(typeof linear.listIssues, 'function');
    assert.strictEqual(typeof linear.getIssue, 'function');
    assert.strictEqual(typeof linear.createIssue, 'function');
    assert.strictEqual(typeof linear.searchIssues, 'function');
    assert.strictEqual(typeof linear.isConfigured, 'function');
  });

  it('should not be configured without API key', () => {
    const orig = process.env.LINEAR_API_KEY;
    delete process.env.LINEAR_API_KEY;
    assert.strictEqual(linear.isConfigured(), false);
    if (orig) process.env.LINEAR_API_KEY = orig;
  });
});
