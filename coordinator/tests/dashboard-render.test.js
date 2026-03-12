'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_JS_PATH = path.join(__dirname, '..', '..', 'gui', 'public', 'app.js');

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

function loadRenderHarness() {
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

describe('Dashboard telemetry rendering', () => {
  it('renders routing and budget chips from populated telemetry payloads', () => {
    const { renderTasks, tasksList } = loadRenderHarness();

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

    assert.match(html, /task-budget-indicator/);
    assert.match(html, /task-chip-label">source<\/span>activity_log:allocator\.task_assigned/);
    assert.match(html, /task-chip-label">state<\/span>constrained \(4\/10\)/);
  });

  it('omits routing and budget chips when telemetry fields are absent or null', () => {
    const { renderTasks, tasksList } = loadRenderHarness();

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
        },
      ],
      routing_budget_source: '',
      routing_budget_state: null,
    };

    renderTasks(state.tasks, state);
    const html = tasksList.innerHTML;

    assert.match(html, /No telemetry task/);
    assert.doesNotMatch(html, /task-chip-row/);
    assert.doesNotMatch(html, /task-budget-indicator/);
  });
});
