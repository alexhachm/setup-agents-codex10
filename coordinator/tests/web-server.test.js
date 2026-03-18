'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const db = require('../src/db');
const webServer = require('../src/web-server');

let tmpDir;
let server;
let port;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-web-'));
  fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
  db.init(tmpDir);

  server = await webServer.start(tmpDir, 0);
  port = server.address().port;
});

afterEach(() => {
  webServer.stop();
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function requestJson(reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: reqPath,
      method: 'GET',
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : {},
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function postJson(reqPath, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: reqPath,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : {},
        });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function requestStatus() {
  return requestJson('/api/status');
}

function findTask(payload, taskId) {
  return payload.tasks.find((task) => task.id === taskId);
}

describe('Web status telemetry contract', () => {
  it('returns routing budget contract fields and enriched task telemetry', async () => {
    const reqId = db.createRequest('Telemetry contract request');

    const taskWithRowTelemetry = db.createTask({
      request_id: reqId,
      subject: 'Task with row telemetry',
      description: 'Row telemetry fields set',
      domain: 'coordinator-tests',
      tier: 3,
    });
    db.updateTask(taskWithRowTelemetry, {
      routing_class: 'high',
      routed_model: 'gpt-5.3-codex',
      reasoning_effort: 'high',
    });

    const taskWithLogFallback = db.createTask({
      request_id: reqId,
      subject: 'Task with log fallback',
      description: 'Telemetry only in allocator log',
      domain: 'coordinator-tests',
      tier: 3,
    });

    db.log('allocator', 'task_assigned', {
      task_id: taskWithRowTelemetry,
      routing_class: 'high',
      model: 'gpt-5.3-codex',
      model_source: 'config-fallback',
      reasoning_effort: 'high',
      budget_state: { flagship: { remaining: 18, threshold: 10 } },
      budget_source: 'allocator:runtime',
    });

    db.log('allocator', 'task_assigned', {
      task_id: taskWithLogFallback,
      routing_class: 'mini',
      model: 'gpt-5.3-mini',
      model_source: 'fallback-default',
      reasoning_effort: 'low',
      budget_state: { flagship: { remaining: 3, threshold: 10 } },
      budget_source: 'activity_log:allocator.task_assigned',
    });

    db.setConfig('routing_budget_state', JSON.stringify({
      flagship: { remaining: 42, threshold: 12 },
    }));

    const result = await requestStatus();
    assert.strictEqual(result.status, 200);

    assert.strictEqual(result.body.routing_budget_source, 'config:routing_budget_state');
    assert.deepStrictEqual(result.body.routing_budget_state, {
      source: 'config:routing_budget_state',
      parsed: { flagship: { remaining: 42, threshold: 12 } },
      remaining: 42,
      threshold: 12,
    });

    const rowTelemetryTask = findTask(result.body, taskWithRowTelemetry);
    assert.ok(rowTelemetryTask);
    assert.strictEqual(rowTelemetryTask.routing_class, 'high');
    assert.strictEqual(rowTelemetryTask.routed_model, 'gpt-5.3-codex');
    assert.strictEqual(rowTelemetryTask.model_source, 'config-fallback');
    assert.strictEqual(rowTelemetryTask.reasoning_effort, 'high');

    const fallbackTask = findTask(result.body, taskWithLogFallback);
    assert.ok(fallbackTask);
    assert.strictEqual(fallbackTask.routing_class, 'mini');
    assert.strictEqual(fallbackTask.routed_model, 'gpt-5.3-mini');
    assert.strictEqual(fallbackTask.model_source, 'fallback-default');
    assert.strictEqual(fallbackTask.reasoning_effort, 'low');
  });

  it('returns null/none telemetry defaults when no budget or routing telemetry exists', async () => {
    const reqId = db.createRequest('Null telemetry request');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Task without telemetry',
      description: 'No row telemetry and no allocator telemetry',
      domain: 'coordinator-tests',
      tier: 3,
    });

    const result = await requestStatus();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.routing_budget_state, null);
    assert.strictEqual(result.body.routing_budget_source, 'none');

    const task = findTask(result.body, taskId);
    assert.ok(task);
    assert.strictEqual(task.routing_class, null);
    assert.strictEqual(task.routed_model, null);
    assert.strictEqual(task.model_source, null);
    assert.strictEqual(task.reasoning_effort, null);
  });

  it('returns hydrated model_source parity for /api/tasks and /api/requests/:id', async () => {
    const reqId = db.createRequest('Model source parity request');

    const taskWithRowModelSource = db.createTask({
      request_id: reqId,
      subject: 'Task with row model_source',
      description: 'Task row model_source should win',
      domain: 'coordinator-tests',
      tier: 3,
    });
    db.updateTask(taskWithRowModelSource, {
      model_source: 'row-model-source',
    });

    const taskWithFallbackModelSource = db.createTask({
      request_id: reqId,
      subject: 'Task with fallback model_source',
      description: 'Allocator log fallback should hydrate model_source',
      domain: 'coordinator-tests',
      tier: 2,
    });

    db.log('allocator', 'task_assigned', {
      task_id: taskWithFallbackModelSource,
      routing_class: 'mid',
      model: 'gpt-5.3',
      model_source: 'log-model-source',
      reasoning_effort: 'medium',
    });

    const tasksResult = await requestJson('/api/tasks');
    assert.strictEqual(tasksResult.status, 200);
    const tasksMap = new Map(tasksResult.body.map((task) => [task.id, task]));
    assert.strictEqual(tasksMap.get(taskWithRowModelSource).model_source, 'row-model-source');
    assert.strictEqual(tasksMap.get(taskWithFallbackModelSource).model_source, 'log-model-source');

    const requestResult = await requestJson(`/api/requests/${reqId}`);
    assert.strictEqual(requestResult.status, 200);
    const requestTasksMap = new Map(requestResult.body.tasks.map((task) => [task.id, task]));
    assert.strictEqual(requestTasksMap.get(taskWithRowModelSource).model_source, 'row-model-source');
    assert.strictEqual(requestTasksMap.get(taskWithFallbackModelSource).model_source, 'log-model-source');

    assert.strictEqual(
      requestTasksMap.get(taskWithRowModelSource).model_source,
      tasksMap.get(taskWithRowModelSource).model_source
    );
    assert.strictEqual(
      requestTasksMap.get(taskWithFallbackModelSource).model_source,
      tasksMap.get(taskWithFallbackModelSource).model_source
    );
  });

  it('rejects autonomous command-template payloads for /api/request', async () => {
    const autonomousPromptPayload = [
      'You are **Master-2: Architect** running on **Deep**.',
      '',
      'Follow this protocol exactly.',
      '',
      '## Internal Counters (Track These)',
      '```',
      'tier1_count = 0',
      'decomposition_count = 0',
      '```',
      '',
      '## Step 1: Startup',
      './.claude/scripts/codex10 inbox architect',
      '',
      '## Phase: Follow-Up Check',
      'sleep 15',
      '',
      '## Phase: Budget/Reset Exit',
      './.claude/scripts/codex10 distill 2 "orchestration" "Full distillation"',
    ].join('\n');

    const result = await postJson('/api/request', {
      description: autonomousPromptPayload,
    });
    assert.strictEqual(result.status, 500);
    assert.match(String(result.body.error || ''), /autonomous command-template payload/i);
    assert.strictEqual(db.listRequests().length, 0);
  });

  it('exposes persisted usage_payload_json and parsed usage payload in status/task APIs', async () => {
    const reqId = db.createRequest('Usage payload exposure request');
    const taskId = db.createTask({
      request_id: reqId,
      subject: 'Task with raw usage payload',
      description: 'Usage payload should round-trip through API surfaces',
      domain: 'coordinator-telemetry',
      tier: 2,
    });
    const usagePayload = {
      model: 'gpt-5-codex',
      input_tokens: 123,
      output_tokens: 45,
      total_tokens: 168,
      cost_usd: 0.0168,
      service_tier: 'priority',
      thoughts_token_count: 4,
    };
    db.updateTask(taskId, {
      usage_payload_json: JSON.stringify(usagePayload),
    });

    const statusResult = await requestStatus();
    assert.strictEqual(statusResult.status, 200);
    const statusTask = findTask(statusResult.body, taskId);
    assert.ok(statusTask);
    assert.strictEqual(statusTask.usage_payload_json, JSON.stringify(usagePayload));
    assert.deepStrictEqual(statusTask.usage, usagePayload);
    assert.deepStrictEqual(statusTask.usage_payload, usagePayload);
    assert.deepStrictEqual(statusTask.usagePayload, usagePayload);

    const tasksResult = await requestJson('/api/tasks');
    assert.strictEqual(tasksResult.status, 200);
    const tasksTask = tasksResult.body.find((task) => task.id === taskId);
    assert.ok(tasksTask);
    assert.strictEqual(tasksTask.usage_payload_json, JSON.stringify(usagePayload));
    assert.deepStrictEqual(tasksTask.usage, usagePayload);

    const requestResult = await requestJson(`/api/requests/${reqId}`);
    assert.strictEqual(requestResult.status, 200);
    const requestTask = requestResult.body.tasks.find((task) => task.id === taskId);
    assert.ok(requestTask);
    assert.strictEqual(requestTask.usage_payload_json, JSON.stringify(usagePayload));
    assert.deepStrictEqual(requestTask.usage, usagePayload);
  });
});
