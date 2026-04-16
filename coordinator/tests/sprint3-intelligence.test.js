'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('../src/db');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-s3-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Sprint 3: Intelligence Layer', () => {
  describe('MCP Client', () => {
    it('should export MCPClient class', () => {
      const mcp = require('../src/connectors/mcp-client');
      assert.ok(mcp.MCPClient);
      assert.strictEqual(mcp.PROTOCOL_VERSION, '2024-11-05');
    });

    it('should create MCP client instances', () => {
      const mcp = require('../src/connectors/mcp-client');
      const client = new mcp.MCPClient('test-server', {
        command: 'node',
        args: ['server.js'],
        transport: 'stdio',
      });
      assert.strictEqual(client.name, 'test-server');
      assert.strictEqual(client.transport, 'stdio');
      assert.strictEqual(client.connected, false);
    });

    it('should manage server registry', () => {
      const mcp = require('../src/connectors/mcp-client');
      mcp.registerServer('test-registry', { command: 'echo' });
      const server = mcp.getServer('test-registry');
      assert.ok(server);
      assert.strictEqual(server.name, 'test-registry');

      const list = mcp.listServers();
      assert.ok(list.some(s => s.name === 'test-registry'));

      mcp.disconnectAll();
    });

    it('should report status correctly', () => {
      const mcp = require('../src/connectors/mcp-client');
      const client = new mcp.MCPClient('status-test');
      const status = client.getStatus();
      assert.strictEqual(status.name, 'status-test');
      assert.strictEqual(status.connected, false);
      assert.strictEqual(status.toolCount, 0);
    });
  });

  describe('Council Query', () => {
    it('should export query function', () => {
      const council = require('../src/tools/council-query');
      assert.strictEqual(typeof council.query, 'function');
    });

    it('should require queryFn parameter', async () => {
      const council = require('../src/tools/council-query');
      await assert.rejects(
        () => council.query('test prompt'),
        { message: /queryFn is required/ }
      );
    });

    it('should query multiple models in parallel', async () => {
      const council = require('../src/tools/council-query');
      const result = await council.query('What is 2+2?', {
        models: [
          { provider: 'test-a', model: 'model-a' },
          { provider: 'test-b', model: 'model-b' },
        ],
        queryFn: async (provider, model, prompt) => `${provider}/${model}: 4`,
      });
      assert.strictEqual(result.total_count, 2);
      assert.strictEqual(result.successful_count, 2);
      assert.ok(result.consensus);
    });

    it('should handle partial failures gracefully', async () => {
      const council = require('../src/tools/council-query');
      const result = await council.query('test', {
        models: [
          { provider: 'good', model: 'model-a' },
          { provider: 'bad', model: 'model-b' },
        ],
        queryFn: async (provider) => {
          if (provider === 'bad') throw new Error('Provider down');
          return 'response';
        },
      });
      assert.strictEqual(result.successful_count, 1);
      assert.strictEqual(result.total_count, 2);
    });

    it('should compute Jaccard similarity', () => {
      const council = require('../src/tools/council-query');
      const sim = council.jaccardSimilarity('hello world test', 'hello world example');
      assert.ok(sim > 0 && sim < 1);
    });

    it('should find consensus types', () => {
      const council = require('../src/tools/council-query');
      // Same responses → strong consensus
      const strong = council.findConsensus([
        { response: 'The answer is 42' },
        { response: 'The answer is 42' },
      ]);
      assert.strictEqual(strong.type, 'strong_consensus');
    });
  });

  describe('Natural Language Scheduling', () => {
    it('should parse "every 5 minutes"', () => {
      const scheduler = require('../src/cron-scheduler');
      const result = scheduler.parseNaturalLanguage('every 5 minutes');
      assert.ok(result);
      assert.strictEqual(result.cron, '*/5 * * * *');
    });

    it('should parse "every Tuesday at 9am"', () => {
      const scheduler = require('../src/cron-scheduler');
      const result = scheduler.parseNaturalLanguage('every Tuesday at 9am');
      assert.ok(result);
      assert.strictEqual(result.cron, '0 9 * * 2');
    });

    it('should parse "daily at 3pm"', () => {
      const scheduler = require('../src/cron-scheduler');
      const result = scheduler.parseNaturalLanguage('daily at 3pm');
      assert.ok(result);
      assert.strictEqual(result.cron, '0 15 * * *');
    });

    it('should parse "weekdays at 9:30am"', () => {
      const scheduler = require('../src/cron-scheduler');
      const result = scheduler.parseNaturalLanguage('weekdays at 9:30am');
      assert.ok(result);
      assert.strictEqual(result.cron, '30 9 * * 1-5');
    });

    it('should parse "every 2 hours"', () => {
      const scheduler = require('../src/cron-scheduler');
      const result = scheduler.parseNaturalLanguage('every 2 hours');
      assert.ok(result);
      assert.strictEqual(result.cron, '0 */2 * * *');
    });

    it('should return null for unparseable text', () => {
      const scheduler = require('../src/cron-scheduler');
      assert.strictEqual(scheduler.parseNaturalLanguage('do something'), null);
      assert.strictEqual(scheduler.parseNaturalLanguage(null), null);
    });
  });

  describe('Built-in Skills', () => {
    it('should have 5 built-in skill files', () => {
      const skillDir = path.resolve(__dirname, '..', '..', 'templates', 'skills', 'built-in');
      assert.ok(fs.existsSync(skillDir), 'built-in skills directory should exist');
      const files = fs.readdirSync(skillDir).filter(f => f.endsWith('.md'));
      assert.ok(files.length >= 5, `Expected at least 5 skill files, got ${files.length}`);
      assert.ok(files.includes('research.md'));
      assert.ok(files.includes('coding.md'));
      assert.ok(files.includes('asset-creation.md'));
      assert.ok(files.includes('browser-automation.md'));
      assert.ok(files.includes('deep-research.md'));
    });

    it('should have YAML frontmatter with required fields', () => {
      const skillDir = path.resolve(__dirname, '..', '..', 'templates', 'skills', 'built-in');
      const content = fs.readFileSync(path.join(skillDir, 'research.md'), 'utf8');
      assert.ok(content.startsWith('---'));
      assert.ok(content.includes('name:'));
      assert.ok(content.includes('description:'));
      assert.ok(content.includes('triggers:'));
      assert.ok(content.includes('agent_type:'));
      assert.ok(content.includes('model_preference:'));
    });
  });

  describe('Chart Generator', () => {
    it('should export generate function', () => {
      const chart = require('../src/asset-generators/chart');
      assert.strictEqual(typeof chart.generate, 'function');
      assert.ok(chart.CHART_TYPES.includes('bar'));
      assert.ok(chart.CHART_TYPES.includes('line'));
      assert.ok(chart.CHART_TYPES.includes('pie'));
    });

    it('should generate SVG bar chart', async () => {
      const chart = require('../src/asset-generators/chart');
      const result = await chart.generate({
        type: 'bar',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{ data: [10, 20, 30] }],
        },
      });
      assert.ok(result.svg);
      assert.strictEqual(result.format, 'svg');
      assert.ok(result.svg.includes('<svg'));
      assert.ok(result.svg.includes('<rect'));
    });

    it('should generate SVG line chart', async () => {
      const chart = require('../src/asset-generators/chart');
      const result = await chart.generate({
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar'],
          datasets: [{ data: [5, 15, 10], borderColor: '#ff0000' }],
        },
      });
      assert.ok(result.svg);
      assert.ok(result.svg.includes('<polyline'));
    });

    it('should generate SVG pie chart', async () => {
      const chart = require('../src/asset-generators/chart');
      const result = await chart.generate({
        type: 'pie',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [{ data: [30, 50, 20] }],
        },
      });
      assert.ok(result.svg);
      assert.ok(result.svg.includes('<path'));
    });

    it('should write chart to file', async () => {
      const chart = require('../src/asset-generators/chart');
      const outputPath = path.join(tmpDir, 'test-chart.svg');
      const result = await chart.generate(
        { type: 'bar', data: { labels: ['X'], datasets: [{ data: [42] }] } },
        { outputPath }
      );
      assert.strictEqual(result.path, outputPath);
      assert.ok(fs.existsSync(outputPath));
    });
  });
});
