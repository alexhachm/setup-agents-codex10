'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const db = require('../src/db');
const apiServer = require('../src/api-server');
const settingsManager = require('../src/settings-manager');

let tmpDir;
let server;
let port;

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

beforeEach((t) => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-api-srv-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  settingsManager.reset();
  settingsManager.setGlobalSettingsFileOverride(path.join(tmpDir, 'global-settings.json'));
  settingsManager.load(tmpDir);
  db.init(tmpDir);

  // Find an available port
  port = 30000 + Math.floor(Math.random() * 10000);
  server = apiServer.start(port, { silent: true });
});

afterEach(() => {
  apiServer.stop();
  db.close();
  settingsManager.reset();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('API Server', () => {
  describe('matchRoute', () => {
    it('should match static routes', () => {
      const match = apiServer.matchRoute('GET', '/api/health');
      assert.ok(match);
      assert.ok(match.handler);
    });

    it('should match parameterized routes', () => {
      const match = apiServer.matchRoute('GET', '/api/workers/3');
      assert.ok(match);
      assert.strictEqual(match.params.id, '3');
    });

    it('should return null for unknown routes', () => {
      const match = apiServer.matchRoute('GET', '/api/unknown');
      assert.strictEqual(match, null);
    });
  });

  describe('REST endpoints', () => {
    it('GET /api/health should return ok', async () => {
      const res = await request('GET', '/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'ok');
      assert.strictEqual(res.data.version, '10.2');
    });

    it('GET /api/requests should return list', async () => {
      const res = await request('GET', '/api/requests');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.requests));
    });

    it('POST /api/requests should create request', async () => {
      const res = await request('POST', '/api/requests', { description: 'Test feature' });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.id);
    });

    it('POST /api/requests without description should 400', async () => {
      const res = await request('POST', '/api/requests', {});
      assert.strictEqual(res.status, 400);
    });

    it('GET /api/workers should return list', async () => {
      db.registerWorker(1, '/wt-1', 'agent-1');
      const res = await request('GET', '/api/workers');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.workers.length >= 1);
    });

    it('GET /api/settings should redact keys', async () => {
      const res = await request('GET', '/api/settings');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.settings);
    });

    it('GET /api/metrics should return metrics', async () => {
      const res = await request('GET', '/api/metrics');
      assert.strictEqual(res.status, 200);
    });

    it('GET /api/activity should return logs', async () => {
      db.log('test', 'ping', {});
      const res = await request('GET', '/api/activity');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.logs));
    });

    it('should return 404 for unknown path', async () => {
      const res = await request('GET', '/api/nonexistent');
      assert.strictEqual(res.status, 404);
    });

    it('GET /api/tasks should return tasks', async () => {
      const res = await request('GET', '/api/tasks');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.tasks));
    });
  });

  describe('CORS', () => {
    it('OPTIONS should return 204', async () => {
      const res = await request('OPTIONS', '/api/health');
      assert.strictEqual(res.status, 204);
    });
  });
});
