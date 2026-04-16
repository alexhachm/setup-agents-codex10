'use strict';

/**
 * CLI command: mac10 fetch-url <url>
 *
 * Options:
 *   --extract    — extract main content (strip HTML)
 *   --screenshot — take screenshot (requires browser engine)
 *   --timeout <ms>
 */

const searchEngine = require('../search/engine');

async function run(args, projectDir) {
  const url = args.find(a => a.startsWith('http'));
  if (!url) {
    return { error: 'Usage: mac10 fetch-url <url> [--extract] [--timeout ms]' };
  }

  const extract = args.includes('--extract');
  const screenshot = args.includes('--screenshot');
  const timeoutIdx = args.indexOf('--timeout');
  const timeout = timeoutIdx >= 0 && args[timeoutIdx + 1]
    ? parseInt(args[timeoutIdx + 1], 10)
    : 30000;

  try {
    const result = await searchEngine.fetchUrl(url, { timeout });

    if (extract && result.content) {
      result.content = extractMainContent(result.content);
    }

    if (screenshot) {
      result.screenshot_note = 'Screenshot requires browser engine (Sprint 2)';
    }

    return result;
  } catch (err) {
    return { error: err.message, url };
  }
}

function extractMainContent(html) {
  // Simple HTML tag stripping
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

module.exports = { run, extractMainContent };
