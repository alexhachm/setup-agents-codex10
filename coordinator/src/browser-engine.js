'use strict';

/**
 * Browser Engine — Playwright browser executor.
 * Manages browser instances and page operations.
 */

const settingsManager = require('./settings-manager');

let _browser = null;
let _playwright = null;

function isPlaywrightAvailable() {
  try {
    require.resolve('playwright');
    return true;
  } catch {
    return false;
  }
}

async function launch(opts = {}) {
  if (_browser) return _browser;

  if (!isPlaywrightAvailable()) {
    throw new Error('Playwright is not installed. Run: npm install playwright');
  }

  _playwright = require('playwright');
  const browserSettings = settingsManager.get('browser') || {};

  _browser = await _playwright.chromium.launch({
    headless: opts.headless !== undefined ? opts.headless : (browserSettings.headless !== false),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  return _browser;
}

async function newPage(opts = {}) {
  const browser = await launch(opts);
  const context = await browser.newContext({
    userAgent: opts.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    viewport: opts.viewport || { width: 1280, height: 720 },
  });
  return context.newPage();
}

async function navigate(page, url, opts = {}) {
  const timeout = opts.timeout || settingsManager.get('browser.timeout_ms') || 30000;
  await page.goto(url, { waitUntil: opts.waitUntil || 'domcontentloaded', timeout });
  return {
    url: page.url(),
    title: await page.title(),
  };
}

async function screenshot(page, opts = {}) {
  return page.screenshot({
    type: opts.type || 'png',
    fullPage: opts.fullPage || false,
    path: opts.path,
  });
}

async function extractContent(page, selector) {
  if (selector) {
    return page.textContent(selector);
  }
  return page.evaluate(() => document.body.innerText);
}

async function extractLinks(page) {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]')).map(a => ({
      text: a.textContent.trim(),
      href: a.href,
    }));
  });
}

async function click(page, selector, opts = {}) {
  await page.click(selector, { timeout: opts.timeout || 5000 });
}

async function type(page, selector, text, opts = {}) {
  await page.fill(selector, text);
}

async function waitForSelector(page, selector, opts = {}) {
  return page.waitForSelector(selector, {
    timeout: opts.timeout || 10000,
    state: opts.state || 'visible',
  });
}

async function evaluate(page, fn, ...args) {
  return page.evaluate(fn, ...args);
}

async function close() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

function getActiveBrowser() {
  return _browser;
}

module.exports = {
  isPlaywrightAvailable,
  launch,
  newPage,
  navigate,
  screenshot,
  extractContent,
  extractLinks,
  click,
  type,
  waitForSelector,
  evaluate,
  close,
  getActiveBrowser,
};
