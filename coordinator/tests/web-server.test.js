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

describe('Provider/model config endpoints', () => {
  it('GET /api/config returns null provider/model fields by default', async () => {
    const result = await requestJson('/api/config');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.provider, null);
    assert.strictEqual(result.body.fast_model, null);
    assert.strictEqual(result.body.deep_model, null);
    assert.strictEqual(result.body.economy_model, null);
  });

  it('POST /api/config accepts and stores provider/model fields', async () => {
    const postResult = await postJson('/api/config', {
      provider: 'anthropic',
      fast_model: 'claude-haiku-4-5',
      deep_model: 'claude-opus-4-6',
      economy_model: 'claude-haiku-4-5',
    });
    assert.strictEqual(postResult.status, 200);
    assert.strictEqual(postResult.body.ok, true);

    const getResult = await requestJson('/api/config');
    assert.strictEqual(getResult.status, 200);
    assert.strictEqual(getResult.body.provider, 'anthropic');
    assert.strictEqual(getResult.body.fast_model, 'claude-haiku-4-5');
    assert.strictEqual(getResult.body.deep_model, 'claude-opus-4-6');
    assert.strictEqual(getResult.body.economy_model, 'claude-haiku-4-5');
  });

  it('POST /api/config rejects invalid provider value', async () => {
    const result = await postJson('/api/config', { provider: 'bad provider!@#' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
    assert.match(String(result.body.error || ''), /invalid provider/i);
  });

  it('POST /api/config rejects invalid fast_model value', async () => {
    const result = await postJson('/api/config', { fast_model: 'bad model name with spaces' });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
    assert.match(String(result.body.error || ''), /invalid fast_model/i);
  });

  it('POST /api/presets accepts and stores provider/model fields', async () => {
    const postResult = await postJson('/api/presets', {
      name: 'test-preset',
      projectDir: tmpDir,
      githubRepo: 'owner/repo',
      numWorkers: 2,
      provider: 'anthropic',
      fast_model: 'claude-haiku-4-5',
      deep_model: 'claude-opus-4-6',
      economy_model: 'claude-haiku-4-5',
    });
    assert.strictEqual(postResult.status, 200);
    assert.strictEqual(postResult.body.ok, true);

    const getResult = await requestJson('/api/presets');
    assert.strictEqual(getResult.status, 200);
    assert.ok(Array.isArray(getResult.body));
    const preset = getResult.body.find((p) => p.name === 'test-preset');
    assert.ok(preset);
    assert.strictEqual(preset.provider, 'anthropic');
    assert.strictEqual(preset.fast_model, 'claude-haiku-4-5');
    assert.strictEqual(preset.deep_model, 'claude-opus-4-6');
    assert.strictEqual(preset.economy_model, 'claude-haiku-4-5');
  });

  it('POST /api/presets rejects invalid provider value', async () => {
    const result = await postJson('/api/presets', {
      name: 'bad-preset',
      projectDir: tmpDir,
      provider: 'bad provider!@#',
    });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
    assert.match(String(result.body.error || ''), /invalid provider/i);
  });

  it('POST /api/presets rejects invalid deep_model value', async () => {
    const result = await postJson('/api/presets', {
      name: 'bad-preset',
      projectDir: tmpDir,
      deep_model: 'model with spaces',
    });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
    assert.match(String(result.body.error || ''), /invalid deep_model/i);
  });
});

describe('Batch orchestration endpoints', () => {
  it('GET /api/batch/config returns default batch config', async () => {
    const result = await requestJson('/api/batch/config');
    assert.strictEqual(result.status, 200);
    assert.ok(typeof result.body.max_size === 'number' && result.body.max_size > 0);
    assert.ok(typeof result.body.timeout_ms === 'number' && result.body.timeout_ms > 0);
    assert.ok(typeof result.body.candidate_limit === 'number' && result.body.candidate_limit > 0);
    assert.ok(typeof result.body.planner_interval_ms === 'number' && result.body.planner_interval_ms > 0);
  });

  it('POST /api/batch/config saves and reflects new values', async () => {
    const postResult = await postJson('/api/batch/config', { max_size: 8, timeout_ms: 60000, candidate_limit: 50 });
    assert.strictEqual(postResult.status, 200);
    assert.strictEqual(postResult.body.ok, true);

    const getResult = await requestJson('/api/batch/config');
    assert.strictEqual(getResult.status, 200);
    assert.strictEqual(getResult.body.max_size, 8);
    assert.strictEqual(getResult.body.timeout_ms, 60000);
    assert.strictEqual(getResult.body.candidate_limit, 50);
  });

  it('POST /api/batch/config rejects invalid max_size', async () => {
    const result = await postJson('/api/batch/config', { max_size: 0 });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
    assert.ok(typeof result.body.error === 'string');
  });

  it('POST /api/batch/config rejects invalid timeout_ms', async () => {
    const result = await postJson('/api/batch/config', { timeout_ms: 999 });
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
  });

  it('GET /api/batch/status returns observability fields', async () => {
    const result = await requestJson('/api/batch/status');
    assert.strictEqual(result.status, 200);
    assert.ok(typeof result.body.queue_depth === 'number');
    assert.ok(typeof result.body.in_flight_batches === 'number');
    assert.ok(typeof result.body.in_flight_stages === 'number');
    assert.ok(typeof result.body.partial_failure_count === 'number');
    assert.ok(typeof result.body.completed_count === 'number');
    assert.ok(typeof result.body.dedupe_hit_rate_pct === 'number');
    assert.ok(Array.isArray(result.body.recent_batches));
    assert.ok(Array.isArray(result.body.fanout_by_request));
  });

  it('GET /api/status includes batch_status in state payload', async () => {
    const result = await requestJson('/api/status');
    assert.strictEqual(result.status, 200);
    assert.ok(result.body.batch_status && typeof result.body.batch_status === 'object');
    assert.ok(typeof result.body.batch_status.queue_depth === 'number');
  });

  it('GET /api/memory/snapshots returns empty list when no snapshots exist', async () => {
    const result = await requestJson('/api/memory/snapshots');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.ok(Array.isArray(result.body.snapshots));
    assert.strictEqual(result.body.snapshots.length, 0);
  });

  it('GET /api/memory/snapshots filters by context key', async () => {
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-alpha',
      snapshot_payload: { data: 'alpha' },
      relevance_score: 0.8,
    });
    db.createProjectMemorySnapshot({
      project_context_key: 'ctx-beta',
      snapshot_payload: { data: 'beta' },
      relevance_score: 0.5,
    });
    const result = await requestJson('/api/memory/snapshots?project_context_key=ctx-alpha');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.snapshots.length, 1);
    assert.strictEqual(result.body.snapshots[0].project_context_key, 'ctx-alpha');
  });

  it('GET /api/memory/snapshots/:id returns 404 for missing snapshot', async () => {
    const result = await requestJson('/api/memory/snapshots/99999');
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.body.ok, false);
  });

  it('GET /api/memory/snapshots/:id returns snapshot and lineage', async () => {
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'ctx-lineage-test',
      snapshot_payload: { data: 'lineage-test' },
    });
    const result = await requestJson(`/api/memory/snapshots/${snap.id}?include_lineage=true`);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.snapshot.id, snap.id);
    assert.ok(Array.isArray(result.body.lineage));
  });

  it('GET /api/memory/insights returns empty list when no artifacts exist', async () => {
    const result = await requestJson('/api/memory/insights');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.ok(Array.isArray(result.body.artifacts));
    assert.strictEqual(result.body.artifacts.length, 0);
  });

  it('GET /api/memory/insights filters by validation_status', async () => {
    db.createInsightArtifact({
      project_context_key: 'ctx-insights',
      artifact_payload: { content: 'validated insight' },
      validation_status: 'validated',
    });
    db.createInsightArtifact({
      project_context_key: 'ctx-insights',
      artifact_payload: { content: 'unvalidated insight' },
      validation_status: 'unvalidated',
    });
    const result = await requestJson('/api/memory/insights?validation_status=validated');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.artifacts.length, 1);
    assert.strictEqual(result.body.artifacts[0].validation_status, 'validated');
  });

  it('GET /api/memory/insights/:id returns 404 for missing artifact', async () => {
    const result = await requestJson('/api/memory/insights/99999');
    assert.strictEqual(result.status, 404);
    assert.strictEqual(result.body.ok, false);
  });

  it('GET /api/memory/insights/:id returns artifact and lineage', async () => {
    const artifact = db.createInsightArtifact({
      project_context_key: 'ctx-artifact-lineage',
      artifact_payload: { insight: 'test' },
    });
    const result = await requestJson(`/api/memory/insights/${artifact.id}?include_lineage=true`);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.strictEqual(result.body.artifact.id, artifact.id);
    assert.ok(Array.isArray(result.body.lineage));
  });

  it('GET /api/memory/lineage returns empty list when no links exist', async () => {
    const result = await requestJson('/api/memory/lineage');
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.ok(Array.isArray(result.body.links));
    assert.strictEqual(result.body.links.length, 0);
  });

  it('GET /api/memory/lineage filters by request_id', async () => {
    const reqId = db.createRequest('lineage test request');
    const snap = db.createProjectMemorySnapshot({
      project_context_key: 'ctx-lineage-req',
      snapshot_payload: { data: 'req-lineage' },
      request_id: reqId,
    });
    const result = await requestJson(`/api/memory/lineage?request_id=${reqId}`);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.ok, true);
    assert.ok(result.body.links.length >= 1);
    assert.ok(result.body.links.every(l => l.request_id === reqId));
    assert.ok(result.body.links.some(l => l.snapshot_id === snap.id));
  });

  it('GET /api/memory/snapshots returns 400 for invalid task_id', async () => {
    const result = await requestJson('/api/memory/snapshots?task_id=abc');
    assert.strictEqual(result.status, 400);
    assert.strictEqual(result.body.ok, false);
  });
});
