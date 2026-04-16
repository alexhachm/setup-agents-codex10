'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const settingsManager = require('../src/settings-manager');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-sprint6-'));
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
});

afterEach(() => {
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Database Connector ────────────────────────────────────────────────────────

describe('Database Connector', () => {
  const dbConnector = require('../src/connectors/database');

  afterEach(() => {
    dbConnector.reset();
  });

  describe('listAdapters', () => {
    it('should list all database adapters', () => {
      const adapters = dbConnector.listAdapters();
      assert.ok(Array.isArray(adapters));
      assert.ok(adapters.length >= 3);
      const names = adapters.map(a => a.name);
      assert.ok(names.includes('snowflake'));
      assert.ok(names.includes('postgresql'));
      assert.ok(names.includes('mysql'));
    });

    it('should include default ports', () => {
      const adapters = dbConnector.listAdapters();
      const pg = adapters.find(a => a.name === 'postgresql');
      assert.strictEqual(pg.defaultPort, 5432);
      const mysql = adapters.find(a => a.name === 'mysql');
      assert.strictEqual(mysql.defaultPort, 3306);
    });
  });

  describe('getAdapter', () => {
    it('should return adapter for known type', () => {
      const adapter = dbConnector.getAdapter('postgresql');
      assert.ok(adapter);
      assert.strictEqual(adapter.name, 'postgresql');
    });

    it('should throw for unknown type', () => {
      assert.throws(() => dbConnector.getAdapter('oracle'), /Unsupported database type/);
    });
  });

  describe('connect', () => {
    it('should connect with scaffold mode', async () => {
      const conn = await dbConnector.connect('test-pg', {
        type: 'postgresql',
        host: 'localhost',
        database: 'testdb',
        user: 'testuser',
      });
      assert.strictEqual(conn.adapter, 'postgresql');
      assert.strictEqual(conn.scaffold, true);
    });

    it('should connect snowflake with scaffold', async () => {
      const conn = await dbConnector.connect('test-sf', {
        type: 'snowflake',
        account: 'test-account',
        database: 'TESTDB',
        user: 'testuser',
        warehouse: 'TEST_WH',
      });
      assert.strictEqual(conn.adapter, 'snowflake');
      assert.strictEqual(conn.scaffold, true);
    });

    it('should connect mysql with scaffold', async () => {
      const conn = await dbConnector.connect('test-my', {
        type: 'mysql',
        host: 'localhost',
        database: 'testdb',
        user: 'root',
      });
      assert.strictEqual(conn.adapter, 'mysql');
      assert.strictEqual(conn.scaffold, true);
    });

    it('should reject missing config', async () => {
      await assert.rejects(
        () => dbConnector.connect('nope'),
        /No configuration found/
      );
    });

    it('should reject missing type', async () => {
      await assert.rejects(
        () => dbConnector.connect('bad', { host: 'localhost' }),
        /Database type is required/
      );
    });
  });

  describe('query', () => {
    it('should return scaffold result', async () => {
      await dbConnector.connect('qtest', { type: 'postgresql', host: 'localhost', database: 'db', user: 'u' });
      const result = await dbConnector.query('qtest', 'SELECT 1');
      assert.strictEqual(result.scaffold, true);
      assert.strictEqual(result.sql, 'SELECT 1');
    });

    it('should reject query on unknown connection', async () => {
      await assert.rejects(
        () => dbConnector.query('unknown', 'SELECT 1'),
        /No active connection/
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect existing connection', async () => {
      await dbConnector.connect('disc', { type: 'mysql', host: 'localhost', database: 'db', user: 'u' });
      const result = await dbConnector.disconnect('disc');
      assert.strictEqual(result, true);
    });

    it('should return false for unknown connection', async () => {
      const result = await dbConnector.disconnect('nope');
      assert.strictEqual(result, false);
    });
  });

  describe('listConnections', () => {
    it('should list active connections', async () => {
      await dbConnector.connect('a', { type: 'postgresql', host: 'h', database: 'd', user: 'u' });
      await dbConnector.connect('b', { type: 'mysql', host: 'h', database: 'd', user: 'u' });
      const conns = dbConnector.listConnections();
      assert.strictEqual(conns.length, 2);
    });

    it('should return empty when none connected', () => {
      const conns = dbConnector.listConnections();
      assert.deepStrictEqual(conns, []);
    });
  });

  describe('ADAPTERS', () => {
    it('should build connection strings', () => {
      const pg = dbConnector.ADAPTERS.postgresql;
      const str = pg.buildConnectionString({ user: 'u', host: 'h', port: 5432, database: 'd' });
      assert.ok(str.startsWith('postgresql://'));

      const sf = dbConnector.ADAPTERS.snowflake;
      const sfStr = sf.buildConnectionString({ user: 'u', account: 'a', database: 'd' });
      assert.ok(sfStr.startsWith('snowflake://'));

      const my = dbConnector.ADAPTERS.mysql;
      const myStr = my.buildConnectionString({ user: 'u', host: 'h', database: 'd' });
      assert.ok(myStr.startsWith('mysql://'));
    });
  });
});

// ── Plaid Connector ───────────────────────────────────────────────────────────

describe('Plaid Connector', () => {
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

  it('should have PLAID_ENVIRONMENTS', () => {
    assert.ok(plaid.PLAID_ENVIRONMENTS.sandbox);
    assert.ok(plaid.PLAID_ENVIRONMENTS.production);
  });

  it('should report not configured without credentials', () => {
    assert.strictEqual(plaid.isConfigured(), false);
  });

  it('should reject operations without credentials', async () => {
    await assert.rejects(
      () => plaid.createLinkToken('user1'),
      /not configured/
    );
  });
});

// ── Isolation Evaluation ──────────────────────────────────────────────────────

describe('Isolation', () => {
  const isolation = require('../src/isolation');

  describe('listBackends', () => {
    it('should list available backends', () => {
      const backends = isolation.listBackends();
      assert.ok(backends.includes('firecracker'));
      assert.ok(backends.includes('docker'));
      assert.ok(backends.includes('none'));
    });
  });

  describe('evaluate', () => {
    it('should evaluate all backends', () => {
      const results = isolation.evaluate();
      assert.ok(results.firecracker);
      assert.ok(results.docker);
      assert.ok(results.none);
      assert.strictEqual(results.none.available, true);
    });

    it('should include pros and cons', () => {
      const results = isolation.evaluate();
      assert.ok(results.docker.pros.length > 0);
      assert.ok(results.docker.cons.length > 0);
    });
  });

  describe('recommend', () => {
    it('should return a valid backend', () => {
      const rec = isolation.recommend();
      assert.ok(isolation.listBackends().includes(rec));
    });
  });

  describe('getBackendInfo', () => {
    it('should return info for known backend', () => {
      const info = isolation.getBackendInfo('none');
      assert.strictEqual(info.name, 'none');
      assert.strictEqual(info.available, true);
    });

    it('should return null for unknown', () => {
      const info = isolation.getBackendInfo('hypervisor');
      assert.strictEqual(info, null);
    });
  });
});

// ── Format Converter ──────────────────────────────────────────────────────────

describe('Format Converter', () => {
  const converter = require('../src/format-converter');

  describe('listFormats', () => {
    it('should list all conversion formats', () => {
      const formats = converter.listFormats();
      assert.ok(formats.includes('json-to-csv'));
      assert.ok(formats.includes('csv-to-json'));
      assert.ok(formats.includes('markdown-to-html'));
      assert.ok(formats.includes('yaml-to-json'));
      assert.ok(formats.includes('json-to-yaml'));
      assert.ok(formats.includes('xml-to-json'));
    });
  });

  describe('json-to-csv', () => {
    it('should convert JSON array to CSV', () => {
      const input = JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
      ]);
      const result = converter.convert('json-to-csv', input);
      assert.ok(result.output.includes('name,age'));
      assert.ok(result.output.includes('Alice,30'));
      assert.strictEqual(result.rows, 2);
    });

    it('should handle commas in values', () => {
      const input = JSON.stringify([{ name: 'Last, First', age: 30 }]);
      const result = converter.convert('json-to-csv', input);
      assert.ok(result.output.includes('"Last, First"'));
    });

    it('should handle empty array', () => {
      const result = converter.convert('json-to-csv', '[]');
      assert.strictEqual(result.output, '');
      assert.strictEqual(result.rows, 0);
    });

    it('should reject non-array JSON', () => {
      assert.throws(() => converter.convert('json-to-csv', '{}'), /must be an array/);
    });
  });

  describe('csv-to-json', () => {
    it('should convert CSV to JSON', () => {
      const csv = 'name,age\nAlice,30\nBob,25';
      const result = converter.convert('csv-to-json', csv);
      const data = JSON.parse(result.output);
      assert.strictEqual(data.length, 2);
      assert.strictEqual(data[0].name, 'Alice');
    });

    it('should handle quoted fields', () => {
      const csv = 'name,desc\nAlice,"Has a, comma"';
      const result = converter.convert('csv-to-json', csv);
      const data = JSON.parse(result.output);
      assert.strictEqual(data[0].desc, 'Has a, comma');
    });
  });

  describe('markdown-to-html', () => {
    it('should convert headers', () => {
      const result = converter.convert('markdown-to-html', '# Hello\n\n## World');
      assert.ok(result.output.includes('<h1>Hello</h1>'));
      assert.ok(result.output.includes('<h2>World</h2>'));
    });

    it('should convert bold and italic', () => {
      const result = converter.convert('markdown-to-html', '**bold** and *italic*');
      assert.ok(result.output.includes('<strong>bold</strong>'));
      assert.ok(result.output.includes('<em>italic</em>'));
    });

    it('should convert links', () => {
      const result = converter.convert('markdown-to-html', '[click](http://example.com)');
      assert.ok(result.output.includes('<a href="http://example.com">click</a>'));
    });
  });

  describe('yaml-to-json', () => {
    it('should convert simple YAML', () => {
      const yaml = 'name: Alice\nage: 30\nactive: true';
      const result = converter.convert('yaml-to-json', yaml);
      const data = JSON.parse(result.output);
      assert.strictEqual(data.name, 'Alice');
      assert.strictEqual(data.age, 30);
      assert.strictEqual(data.active, true);
    });
  });

  describe('json-to-yaml', () => {
    it('should convert JSON to YAML', () => {
      const input = JSON.stringify({ name: 'Alice', age: 30 });
      const result = converter.convert('json-to-yaml', input);
      assert.ok(result.output.includes('name: Alice'));
      assert.ok(result.output.includes('age: 30'));
    });
  });

  describe('xml-to-json', () => {
    it('should convert simple XML', () => {
      const xml = '<root><name>Alice</name><age>30</age></root>';
      const result = converter.convert('xml-to-json', xml);
      const data = JSON.parse(result.output);
      assert.ok(data.root || data.name);
    });
  });

  describe('convertFile', () => {
    it('should convert a file', () => {
      const inputPath = path.join(tmpDir, 'data.json');
      const outputPath = path.join(tmpDir, 'data.csv');
      fs.writeFileSync(inputPath, JSON.stringify([{ a: 1, b: 2 }]));
      const result = converter.convertFile('json-to-csv', inputPath, outputPath);
      assert.ok(fs.existsSync(outputPath));
      assert.ok(result.outputPath);
    });

    it('should reject missing file', () => {
      assert.throws(
        () => converter.convertFile('json-to-csv', '/nonexistent'),
        /not found/
      );
    });
  });

  describe('convert unknown', () => {
    it('should reject unsupported format', () => {
      assert.throws(() => converter.convert('pdf-to-docx', ''), /Unsupported/);
    });
  });

  describe('parseCsvLine', () => {
    it('should parse quoted CSV values', () => {
      const result = converter.parseCsvLine('a,"b,c",d');
      assert.deepStrictEqual(result, ['a', 'b,c', 'd']);
    });

    it('should handle escaped quotes', () => {
      const result = converter.parseCsvLine('a,"say ""hi""",c');
      assert.deepStrictEqual(result, ['a', 'say "hi"', 'c']);
    });
  });
});

// ── Notion Connector ──────────────────────────────────────────────────────────

describe('Notion Connector', () => {
  const notion = require('../src/connectors/notion');

  it('should export correct interface', () => {
    assert.strictEqual(notion.name, 'notion');
    assert.strictEqual(typeof notion.search, 'function');
    assert.strictEqual(typeof notion.getPage, 'function');
    assert.strictEqual(typeof notion.createPage, 'function');
    assert.strictEqual(typeof notion.updatePage, 'function');
    assert.strictEqual(typeof notion.queryDatabase, 'function');
    assert.strictEqual(typeof notion.isConfigured, 'function');
  });

  it('should report not configured without token', () => {
    assert.strictEqual(notion.isConfigured(), false);
  });
});

// ── Linear Connector ──────────────────────────────────────────────────────────

describe('Linear Connector', () => {
  const linear = require('../src/connectors/linear');

  it('should export correct interface', () => {
    assert.strictEqual(linear.name, 'linear');
    assert.strictEqual(typeof linear.graphql, 'function');
    assert.strictEqual(typeof linear.listIssues, 'function');
    assert.strictEqual(typeof linear.getIssue, 'function');
    assert.strictEqual(typeof linear.createIssue, 'function');
    assert.strictEqual(typeof linear.updateIssue, 'function');
    assert.strictEqual(typeof linear.listProjects, 'function');
    assert.strictEqual(typeof linear.searchIssues, 'function');
    assert.strictEqual(typeof linear.isConfigured, 'function');
  });

  it('should report not configured without API key', () => {
    assert.strictEqual(linear.isConfigured(), false);
  });
});

// ── Email Assistant Template ──────────────────────────────────────────────────

describe('Email Assistant Template', () => {
  it('should exist and have valid frontmatter', () => {
    const templatePath = path.join(__dirname, '..', 'templates', 'agents', 'email-assistant.md');
    // Note: templates are checked via alternate path from project root
    const altPath = path.resolve(__dirname, '../../templates/agents/email-assistant.md');
    assert.ok(fs.existsSync(altPath), 'email-assistant.md template should exist');

    const content = fs.readFileSync(altPath, 'utf-8');
    assert.ok(content.includes('name: email-assistant'));
    assert.ok(content.includes('email_draft'));
    assert.ok(content.includes('email_summarize'));
    assert.ok(content.includes('email_triage'));
  });
});
