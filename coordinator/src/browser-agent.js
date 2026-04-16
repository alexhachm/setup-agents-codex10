'use strict';

/**
 * Browser Agent — LLM-driven DOM observation → action selection.
 * Observes a page, sends DOM state to LLM, and executes the selected action.
 */

const browserEngine = require('./browser-engine');
const apiBackend = require('./api-backend');
const modelRouter = require('./model-router');
const settingsManager = require('./settings-manager');

const MAX_STEPS = 20;

const ACTION_TYPES = [
  'click',       // Click an element
  'type',        // Type text into an element
  'navigate',    // Go to URL
  'scroll',      // Scroll page
  'extract',     // Extract content
  'screenshot',  // Take screenshot
  'wait',        // Wait for element
  'done',        // Task complete
  'error',       // Unable to continue
];

/**
 * Observe the current page state and build a description for the LLM.
 */
async function observePage(page) {
  const url = page.url();
  const title = await page.title();

  // Get interactive elements
  const elements = await page.evaluate(() => {
    const interactives = document.querySelectorAll(
      'a, button, input, textarea, select, [role="button"], [onclick]'
    );
    return Array.from(interactives).slice(0, 50).map((el, i) => ({
      index: i,
      tag: el.tagName.toLowerCase(),
      type: el.type || '',
      text: (el.textContent || '').trim().substring(0, 100),
      placeholder: el.placeholder || '',
      href: el.href || '',
      id: el.id || '',
      name: el.name || '',
      value: (el.value || '').substring(0, 50),
      ariaLabel: el.getAttribute('aria-label') || '',
    }));
  });

  // Get visible text summary
  const bodyText = await page.evaluate(() => {
    return document.body.innerText.substring(0, 2000);
  });

  return { url, title, elements, bodyText };
}

/**
 * Ask the LLM to choose the next action based on page state.
 */
async function selectAction(task, observation, history) {
  if (settingsManager.isDevMode()) {
    return { action: 'done', reason: 'Dev mode — browser agent requires live mode' };
  }

  const resolution = modelRouter.resolve('browser');
  const messages = [
    {
      role: 'user',
      content: `You are a browser automation agent. Your task: ${task}

Current page:
URL: ${observation.url}
Title: ${observation.title}

Interactive elements:
${observation.elements.map(e => `[${e.index}] <${e.tag}> ${e.text || e.placeholder || e.ariaLabel || e.href}`).join('\n')}

Page text (excerpt):
${observation.bodyText.substring(0, 1000)}

Previous actions: ${history.map(h => `${h.action}(${h.target || ''})`).join(' → ') || 'none'}

Choose the next action. Respond with JSON: {"action":"type","selector":"#search","value":"query"} or {"action":"click","selector":"[index]"} or {"action":"done","result":"summary"} or {"action":"navigate","url":"..."}`,
    },
  ];

  try {
    const response = await apiBackend.call(resolution.provider, resolution.model, messages, {
      max_tokens: 500,
      temperature: 0,
    });

    // Parse JSON from response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { action: 'error', reason: 'Could not parse LLM response' };
  } catch (err) {
    return { action: 'error', reason: err.message };
  }
}

/**
 * Execute a single action on the page.
 */
async function executeAction(page, action) {
  switch (action.action) {
    case 'click':
      await browserEngine.click(page, action.selector);
      return { success: true };

    case 'type':
      await browserEngine.type(page, action.selector, action.value || '');
      return { success: true };

    case 'navigate':
      await browserEngine.navigate(page, action.url);
      return { success: true };

    case 'scroll':
      await page.evaluate((dir) => {
        window.scrollBy(0, dir === 'up' ? -500 : 500);
      }, action.direction || 'down');
      return { success: true };

    case 'extract':
      const content = await browserEngine.extractContent(page, action.selector);
      return { success: true, content };

    case 'screenshot':
      const buffer = await browserEngine.screenshot(page, { path: action.path });
      return { success: true, size: buffer.length };

    case 'wait':
      await browserEngine.waitForSelector(page, action.selector);
      return { success: true };

    case 'done':
      return { success: true, done: true, result: action.result };

    case 'error':
      return { success: false, error: action.reason };

    default:
      return { success: false, error: `Unknown action: ${action.action}` };
  }
}

/**
 * Run the browser agent loop for a task.
 * @param {string} task - Natural language task description
 * @param {Object} opts - { url, maxSteps }
 * @returns {Promise<Object>} - { result, steps, success }
 */
async function run(task, opts = {}) {
  const maxSteps = opts.maxSteps || MAX_STEPS;
  const page = await browserEngine.newPage();
  const history = [];

  try {
    if (opts.url) {
      await browserEngine.navigate(page, opts.url);
    }

    for (let step = 0; step < maxSteps; step++) {
      const observation = await observePage(page);
      const action = await selectAction(task, observation, history);

      history.push(action);
      const result = await executeAction(page, action);

      if (result.done) {
        return { result: result.result, steps: history, success: true };
      }
      if (!result.success) {
        return { error: result.error, steps: history, success: false };
      }
    }

    return { error: 'Max steps reached', steps: history, success: false };
  } finally {
    await page.close();
  }
}

module.exports = {
  observePage,
  selectAction,
  executeAction,
  run,
  ACTION_TYPES,
  MAX_STEPS,
};
