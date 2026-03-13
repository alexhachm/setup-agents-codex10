'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_JS_PATH = path.join(__dirname, '..', '..', 'gui', 'public', 'app.js');
const POPOUT_JS_PATH = path.join(__dirname, '..', '..', 'gui', 'public', 'popout.js');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createElement() {
  const classSet = new Set();
  return {
    innerHTML: '',
    textContent: '',
    className: '',
    value: '',
    checked: false,
    disabled: false,
    style: {},
    dataset: {},
    scrollTop: 0,
    scrollHeight: 0,
    classList: {
      add(name) { classSet.add(name); },
      remove(name) { classSet.delete(name); },
      toggle(name) {
        if (classSet.has(name)) {
          classSet.delete(name);
          return false;
        }
        classSet.add(name);
        return true;
      },
      contains(name) { return classSet.has(name); },
    },
    addEventListener() {},
    appendChild() {},
    setAttribute() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
  };
}

function createEscapeDiv() {
  let value = '';
  return {
    set textContent(next) {
      value = next === null || next === undefined ? '' : String(next);
    },
    get textContent() {
      return value;
    },
    get innerHTML() {
      return escapeHtml(value);
    },
  };
}

function loadDashboardRenderHarness() {
  const source = fs.readFileSync(APP_JS_PATH, 'utf8');
  const startMarker = 'function renderTasks(tasks, state) {';
  const endMarker = 'function fetchTabStatus(tab) {';

  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, 'renderTasks marker not found in app.js');
  assert.ok(end > start, 'fetchTabStatus marker not found after renderTasks in app.js');

  const snippet = source.slice(start, end);
  const elements = new Map();

  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement(tag) {
      if (tag === 'div') return createEscapeDiv();
      return createElement();
    },
  };

  const context = {
    document,
    URL,
    _escapeDiv: createEscapeDiv(),
  };

  vm.runInNewContext(`'use strict';\n${snippet}`, context, { filename: APP_JS_PATH });
  assert.strictEqual(typeof context.renderTasks, 'function', 'renderTasks should be available in harness');

  return {
    renderTasks: context.renderTasks,
    tasksList: document.getElementById('tasks-list'),
  };
}

function loadPopoutRenderHarness() {
  const source = fs.readFileSync(POPOUT_JS_PATH, 'utf8');
  const startMarker = 'function renderTasks(data) {';
  const endMarker = 'function renderLog(data) {';

  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0, 'renderTasks marker not found in popout.js');
  assert.ok(end > start, 'renderLog marker not found after renderTasks in popout.js');

  const snippet = source.slice(start, end);
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement(tag) {
      if (tag === 'div') return createEscapeDiv();
      return createElement();
    },
  };
  const context = {
    document,
    escapeHtml(value) {
      return escapeHtml(value === null || value === undefined ? '' : String(value));
    },
    renderPrLink() {
      return '';
    },
  };

  vm.runInNewContext(`'use strict';\n${snippet}`, context, { filename: POPOUT_JS_PATH });
  assert.strictEqual(typeof context.renderTasks, 'function', 'renderTasks should be available in popout harness');

  return {
    renderTasks: context.renderTasks,
    panel: document.getElementById('popout-panel'),
  };
}

describe('Dashboard telemetry rendering', () => {
  it('renders routing, usage, and budget chips from populated telemetry payloads', () => {
    const { renderTasks, tasksList } = loadDashboardRenderHarness();

    const state = {
      tasks: [
        {
          id: 41,
          status: 'assigned',
          subject: 'Telemetry task',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
          routingClass: 'xhigh',
          routingModel: 'gpt-5.3-codex',
          routingModelSource: 'config-fallback',
          routingReasoningEffort: 'medium',
          usage_model: 'gpt-5-codex',
          usage_input_tokens: 1234,
          usage_output_tokens: 345,
          usage_cached_tokens: 99,
          usage_cache_creation_tokens: 77,
          usage_cache_creation_ephemeral_5m_input_tokens: 55,
          usage_reasoning_tokens: 222,
          usageAcceptedPredictionTokens: 11,
          usage_total_tokens: 1678,
          usage_cost_usd: 0.0456,
          usage: {
            rejected_prediction_tokens: 4,
            cache_creation: {
              ephemeral_1h_input_tokens: 66,
            },
          },
        },
        {
          id: 42,
          status: 'assigned',
          subject: 'Telemetry nested cache tokens',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
          usage: {
            cache_creation_tokens: 88,
          },
        },
        {
          id: 43,
          status: 'assigned',
          subject: 'Telemetry nested cache input tokens',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
          usage: {
            cache_creation_input_tokens: 99,
          },
        },
        {
          id: 44,
          status: 'assigned',
          subject: 'Zero input guard task',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
          usage_input_tokens: 0,
          usage_cached_tokens: 10,
        },
        {
          id: 45,
          status: 'assigned',
          subject: 'Raw usage payload JSON task',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
          usage_payload_json: JSON.stringify({
            model: 'gpt-5-codex',
            input_tokens: 321,
            output_tokens: 123,
            cache_creation_tokens: 22,
            cached_tokens: 11,
            total_tokens: 444,
            cost_usd: 0.0444,
            service_tier: 'priority',
          }),
        },
      ],
      routing_budget_source: 'activity_log:allocator.task_assigned',
      routing_budget_state: {
        flagship: { remaining: 4, threshold: 10 },
      },
    };

    renderTasks(state.tasks, state);
    const html = tasksList.innerHTML;

    assert.match(html, /task-chip-label">route<\/span>xhigh/);
    assert.match(html, /task-chip-label">model<\/span>gpt-5\.3-codex/);
    assert.match(html, /task-chip-label">source<\/span>config-fallback/);
    assert.match(html, /task-chip-label">effort<\/span>medium/);
    assert.match(html, /task-chip-label">usage<\/span>gpt-5-codex/);
    assert.match(html, /task-chip-label">in<\/span>1234/);
    assert.match(html, /task-chip-label">out<\/span>345/);
    assert.match(html, /task-chip-label">cached<\/span>99/);
    assert.match(html, /task-chip-label">cache-hit<\/span>8\.0%/);
    assert.match(html, /task-chip-label">cache-create<\/span>77/);
    assert.match(html, /task-chip-label">cache-create-5m<\/span>55/);
    assert.match(html, /task-chip-label">cache-create-1h<\/span>66/);
    assert.match(html, /task-chip-label">cache-create<\/span>88/);
    assert.match(html, /task-chip-label">cache-create<\/span>99/);
    assert.match(html, /task-chip-label">reasoning<\/span>222/);
    assert.match(html, /task-chip-label">pred-hit<\/span>11/);
    assert.match(html, /task-chip-label">pred-miss<\/span>4/);
    assert.match(html, /task-chip-label">total<\/span>1678/);
    assert.match(html, /task-chip-label">cost<\/span>0\.0456/);
    const zeroInputTask = html.split('<div class="task-item">').find((item) => item.includes('Zero input guard task'));
    assert.ok(zeroInputTask, 'Expected zero-input dashboard task to render');
    assert.match(zeroInputTask, /task-chip-label">in<\/span>0/);
    assert.match(zeroInputTask, /task-chip-label">cached<\/span>10/);
    assert.doesNotMatch(zeroInputTask, /task-chip-label">cache-hit<\/span>/);
    const rawUsagePayloadTask = html.split('<div class="task-item">').find((item) => item.includes('Raw usage payload JSON task'));
    assert.ok(rawUsagePayloadTask, 'Expected raw usage payload dashboard task to render');
    assert.match(rawUsagePayloadTask, /task-chip-label">usage<\/span>gpt-5-codex/);
    assert.match(rawUsagePayloadTask, /task-chip-label">in<\/span>321/);
    assert.match(rawUsagePayloadTask, /task-chip-label">out<\/span>123/);
    assert.match(rawUsagePayloadTask, /task-chip-label">cache-create<\/span>22/);
    assert.match(rawUsagePayloadTask, /task-chip-label">cached<\/span>11/);
    assert.match(rawUsagePayloadTask, /task-chip-label">total<\/span>444/);
    assert.match(rawUsagePayloadTask, /task-chip-label">cost<\/span>0\.0444/);

    assert.match(html, /task-budget-indicator/);
    assert.match(html, /task-chip-label">source<\/span>activity_log:allocator\.task_assigned/);
    assert.match(html, /task-chip-label">state<\/span>constrained \(4\/10\)/);
  });

  it('renders constrained and healthy budget summaries from wrapped routing_budget_state payloads', () => {
    const { renderTasks, tasksList } = loadDashboardRenderHarness();

    const constrainedState = {
      tasks: [
        {
          id: 44,
          status: 'assigned',
          subject: 'Wrapped constrained budget telemetry',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
        },
      ],
      routing_budget_state: {
        source: 'activity_log:allocator.task_assigned',
        parsed: {
          flagship: { remaining: 3, threshold: 10 },
        },
        remaining: 3,
        threshold: 10,
      },
    };

    renderTasks(constrainedState.tasks, constrainedState);
    let html = tasksList.innerHTML;
    assert.match(html, /task-budget-indicator/);
    assert.match(html, /task-chip-label">source<\/span>activity_log:allocator\.task_assigned/);
    assert.match(html, /task-chip-label">state<\/span>constrained \(3\/10\)/);
    assert.doesNotMatch(html, /task-chip-label">state<\/span>keys: source, parsed, remaining/);

    const healthyState = {
      tasks: constrainedState.tasks,
      routing_budget_state: {
        source: 'activity_log:allocator.task_assigned',
        parsed: {
          flagship: { remaining: 21, threshold: 10 },
        },
        remaining: 21,
        threshold: 10,
      },
    };

    renderTasks(healthyState.tasks, healthyState);
    html = tasksList.innerHTML;
    assert.match(html, /task-chip-label">state<\/span>healthy \(21\/10\)/);
  });

  it('omits routing, usage, and budget chips when telemetry fields are absent or null', () => {
    const { renderTasks, tasksList } = loadDashboardRenderHarness();

    const state = {
      tasks: [
        {
          id: 52,
          status: 'assigned',
          subject: 'No telemetry task',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
          routing_class: null,
          routed_model: null,
          model_source: null,
          reasoning_effort: null,
          usage_model: null,
          usage_input_tokens: null,
          usage_output_tokens: null,
          usage_cached_tokens: null,
          usage_cache_creation_tokens: null,
          usage_cache_creation_ephemeral_5m_input_tokens: null,
          usage_cache_creation_ephemeral_1h_input_tokens: null,
          usage_reasoning_tokens: null,
          usageAcceptedPredictionTokens: null,
          usage_rejected_prediction_tokens: null,
          usage_total_tokens: null,
          usage_cost_usd: null,
          usage: {
            reasoning_tokens: null,
            acceptedPredictionTokens: null,
            rejected_prediction_tokens: null,
            cache_creation_tokens: null,
            cache_creation_input_tokens: null,
            cache_creation: {
              ephemeral_5m_input_tokens: null,
              ephemeral_1h_input_tokens: null,
            },
          },
        },
        {
          id: 53,
          status: 'assigned',
          subject: 'No usage object task',
          domain: 'coordinator-tests',
          tier: 3,
          assigned_to: 3,
        },
      ],
      routing_budget_source: '',
      routing_budget_state: null,
    };

    renderTasks(state.tasks, state);
    const html = tasksList.innerHTML;

    assert.match(html, /No telemetry task/);
    assert.match(html, /No usage object task/);
    assert.doesNotMatch(html, /task-chip-row/);
    assert.doesNotMatch(html, /task-chip-label">cache-hit<\/span>/);
    assert.doesNotMatch(html, /NaN%|Infinity%/);
    assert.doesNotMatch(html, /task-chip-label">cache-create<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">cache-create-5m<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">cache-create-1h<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">reasoning<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">pred-hit<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">pred-miss<\/span>/);
    assert.doesNotMatch(html, /task-budget-indicator/);
  });
});

describe('Popout telemetry rendering', () => {
  it('renders usage chips from populated telemetry payloads', () => {
    const { renderTasks, panel } = loadPopoutRenderHarness();

    renderTasks({
      tasks: [
        {
          id: 71,
          status: 'completed',
          subject: 'Popout telemetry task',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
          usage: {
            model: 'gpt-5-codex',
            input_tokens: 210,
            output_tokens: 45,
            cached_tokens: 12,
            cache_creation_input_tokens: 8,
            cache_creation: {
              ephemeral_1h_input_tokens: 21,
            },
            reasoningTokens: 33,
            accepted_prediction_tokens: 6,
            total_tokens: 267,
            cost_usd: 0.0123,
          },
          usage_cache_creation_ephemeral_5m_input_tokens: 14,
          usage_rejected_prediction_tokens: 2,
        },
        {
          id: 73,
          status: 'completed',
          subject: 'Popout nested cache tokens task',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
          usage: {
            cache_creation_tokens: 9,
          },
        },
        {
          id: 74,
          status: 'completed',
          subject: 'Popout top-level cache tokens task',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
          usage_cache_creation_tokens: 10,
        },
        {
          id: 75,
          status: 'completed',
          subject: 'Popout zero input guard task',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
          usage_input_tokens: 0,
          usage_cached_tokens: 11,
        },
      ],
    });

    const html = panel.innerHTML;
    assert.match(html, /Popout telemetry task/);
    assert.match(html, /task-chip-label">usage<\/span>gpt-5-codex/);
    assert.match(html, /task-chip-label">in<\/span>210/);
    assert.match(html, /task-chip-label">out<\/span>45/);
    assert.match(html, /task-chip-label">cached<\/span>12/);
    assert.match(html, /task-chip-label">cache-hit<\/span>5\.7%/);
    assert.match(html, /task-chip-label">cache-create<\/span>8/);
    assert.match(html, /task-chip-label">cache-create-5m<\/span>14/);
    assert.match(html, /task-chip-label">cache-create-1h<\/span>21/);
    assert.match(html, /task-chip-label">cache-create<\/span>9/);
    assert.match(html, /task-chip-label">cache-create<\/span>10/);
    assert.match(html, /task-chip-label">reasoning<\/span>33/);
    assert.match(html, /task-chip-label">pred-hit<\/span>6/);
    assert.match(html, /task-chip-label">pred-miss<\/span>2/);
    assert.match(html, /task-chip-label">total<\/span>267/);
    assert.match(html, /task-chip-label">cost<\/span>0\.0123/);
    const zeroInputTask = html.split('<div class="task-item">').find((item) => item.includes('Popout zero input guard task'));
    assert.ok(zeroInputTask, 'Expected zero-input popout task to render');
    assert.match(zeroInputTask, /task-chip-label">in<\/span>0/);
    assert.match(zeroInputTask, /task-chip-label">cached<\/span>11/);
    assert.doesNotMatch(zeroInputTask, /task-chip-label">cache-hit<\/span>/);
  });

  it('renders constrained and healthy budget summaries from wrapped routing_budget_state payloads', () => {
    const { renderTasks, panel } = loadPopoutRenderHarness();

    const tasks = [
      {
        id: 77,
        status: 'assigned',
        subject: 'Popout wrapped budget telemetry',
        domain: 'dashboard-ui',
        tier: 2,
        assigned_to: 4,
      },
    ];

    renderTasks({
      tasks,
      routing_budget_state: {
        source: 'activity_log:allocator.task_assigned',
        parsed: {
          flagship: { remaining: 2, threshold: 10 },
        },
        remaining: 2,
        threshold: 10,
      },
    });

    let html = panel.innerHTML;
    assert.match(html, /task-budget-indicator/);
    assert.match(html, /task-chip-label">source<\/span>activity_log:allocator\.task_assigned/);
    assert.match(html, /task-chip-label">state<\/span>constrained \(2\/10\)/);
    assert.doesNotMatch(html, /task-chip-label">state<\/span>keys: source, parsed, remaining/);

    renderTasks({
      tasks,
      routing_budget_source: 'config:routing-budget',
      routing_budget_state: {
        source: 'activity_log:allocator.task_assigned',
        parsed: {
          flagship: { remaining: 25, threshold: 10 },
        },
        remaining: 25,
        threshold: 10,
      },
    });

    html = panel.innerHTML;
    assert.match(html, /task-chip-label">source<\/span>config:routing-budget/);
    assert.match(html, /task-chip-label">state<\/span>healthy \(25\/10\)/);
  });

  it('omits usage chips when usage telemetry fields are absent or null', () => {
    const { renderTasks, panel } = loadPopoutRenderHarness();

    renderTasks({
      tasks: [
        {
          id: 72,
          status: 'assigned',
          subject: 'Popout no telemetry task',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
          usage_model: null,
          usage_input_tokens: null,
          usage_output_tokens: null,
          usage_cached_tokens: null,
          usage_cache_creation_tokens: null,
          usage_cache_creation_ephemeral_5m_input_tokens: null,
          usage_cache_creation_ephemeral_1h_input_tokens: null,
          usage_reasoning_tokens: null,
          usageAcceptedPredictionTokens: null,
          usage_rejected_prediction_tokens: null,
          usage_total_tokens: null,
          usage_cost_usd: null,
          usage: {
            reasoning_tokens: null,
            accepted_prediction_tokens: null,
            rejectedPredictionTokens: null,
            cache_creation_tokens: null,
            cache_creation_input_tokens: null,
            cache_creation: {
              ephemeral_5m_input_tokens: null,
              ephemeral_1h_input_tokens: null,
            },
          },
        },
        {
          id: 76,
          status: 'assigned',
          subject: 'Popout absent usage task',
          domain: 'dashboard-ui',
          tier: 2,
          assigned_to: 4,
        },
      ],
    });

    const html = panel.innerHTML;
    assert.match(html, /Popout no telemetry task/);
    assert.match(html, /Popout absent usage task/);
    assert.doesNotMatch(html, /task-chip-row/);
    assert.doesNotMatch(html, /task-chip-label">cache-hit<\/span>/);
    assert.doesNotMatch(html, /NaN%|Infinity%/);
    assert.doesNotMatch(html, /task-chip-label">cache-create<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">cache-create-5m<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">cache-create-1h<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">reasoning<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">pred-hit<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">pred-miss<\/span>/);
    assert.doesNotMatch(html, /task-chip-label">usage<\/span>/);
  });
});
