'use strict';

/**
 * Browser Workflow — multi-step workflow orchestrator.
 * Manages sequences of browser automation steps with checkpointing.
 */

const browserEngine = require('./browser-engine');
const browserAgent = require('./browser-agent');
const db = require('./db');

const WORKFLOW_STATUS = ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];

class BrowserWorkflow {
  constructor(opts = {}) {
    this.id = opts.id || `wf-${Date.now()}`;
    this.steps = opts.steps || [];
    this.currentStep = 0;
    this.status = 'pending';
    this.results = [];
    this.sessionId = opts.sessionId;
    this.taskId = opts.taskId;
    this.requestId = opts.requestId;
  }

  addStep(step) {
    this.steps.push({
      name: step.name || `Step ${this.steps.length + 1}`,
      type: step.type || 'navigate', // navigate, agent, extract, screenshot, script
      config: step.config || {},
      status: 'pending',
    });
    return this;
  }

  async execute(opts = {}) {
    this.status = 'running';
    const page = await browserEngine.newPage();

    try {
      for (let i = this.currentStep; i < this.steps.length; i++) {
        this.currentStep = i;
        const step = this.steps[i];
        step.status = 'running';

        try {
          const result = await this._executeStep(page, step, opts);
          step.status = 'completed';
          step.result = result;
          this.results.push({ step: step.name, ...result });

          // Log to DB if available
          if (this.sessionId) {
            try {
              db.appendBrowserCallbackEvent(this.sessionId, null, 'progress', {
                workflow_id: this.id,
                step: step.name,
                step_index: i,
                status: 'completed',
              });
            } catch {}
          }
        } catch (err) {
          step.status = 'failed';
          step.error = err.message;
          this.results.push({ step: step.name, error: err.message });

          if (!opts.continueOnError) {
            this.status = 'failed';
            return { success: false, results: this.results, failedAt: step.name };
          }
        }
      }

      this.status = 'completed';
      return { success: true, results: this.results };
    } finally {
      await page.close();
    }
  }

  async _executeStep(page, step, opts) {
    switch (step.type) {
      case 'navigate':
        return browserEngine.navigate(page, step.config.url, step.config);

      case 'agent':
        return browserAgent.run(step.config.task, {
          url: step.config.url,
          maxSteps: step.config.maxSteps || 10,
        });

      case 'extract':
        const content = await browserEngine.extractContent(page, step.config.selector);
        return { content };

      case 'screenshot':
        const buffer = await browserEngine.screenshot(page, step.config);
        return { size: buffer.length, path: step.config.path };

      case 'script':
        const result = await browserEngine.evaluate(page, new Function(step.config.code));
        return { result };

      case 'click':
        await browserEngine.click(page, step.config.selector);
        return { clicked: step.config.selector };

      case 'type':
        await browserEngine.type(page, step.config.selector, step.config.value);
        return { typed: step.config.value };

      case 'wait':
        await browserEngine.waitForSelector(page, step.config.selector, step.config);
        return { waited: step.config.selector };

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  getStatus() {
    return {
      id: this.id,
      status: this.status,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      steps: this.steps.map(s => ({ name: s.name, type: s.type, status: s.status })),
      results: this.results,
    };
  }
}

// Active workflow registry
const _workflows = new Map();

function createWorkflow(opts) {
  const wf = new BrowserWorkflow(opts);
  _workflows.set(wf.id, wf);
  return wf;
}

function getWorkflow(id) {
  return _workflows.get(id) || null;
}

function listWorkflows() {
  return Array.from(_workflows.values()).map(wf => wf.getStatus());
}

function removeWorkflow(id) {
  return _workflows.delete(id);
}

module.exports = {
  BrowserWorkflow,
  createWorkflow,
  getWorkflow,
  listWorkflows,
  removeWorkflow,
  WORKFLOW_STATUS,
};
