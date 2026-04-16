'use strict';

/**
 * Batch Browse — execute multiple browser operations in parallel.
 */

const browserEngine = require('./browser-engine');

/**
 * Browse multiple URLs and extract content.
 * @param {Array<string>} urls - URLs to browse
 * @param {Object} opts - { concurrency, timeout, extract }
 * @returns {Promise<Array>} - Results for each URL
 */
async function batchBrowse(urls, opts = {}) {
  const concurrency = opts.concurrency || 3;
  const results = [];
  const queue = [...urls];

  async function processUrl(url) {
    try {
      const page = await browserEngine.newPage();
      try {
        const nav = await browserEngine.navigate(page, url, { timeout: opts.timeout });
        const content = opts.extract
          ? await browserEngine.extractContent(page, opts.extract)
          : await browserEngine.extractContent(page);
        const links = await browserEngine.extractLinks(page);

        return {
          url,
          title: nav.title,
          content: content ? content.substring(0, opts.maxContentLength || 5000) : '',
          links: links.slice(0, 20),
          status: 'success',
        };
      } finally {
        await page.close();
      }
    } catch (err) {
      return { url, error: err.message, status: 'error' };
    }
  }

  // Process in batches
  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = queue.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processUrl));
    results.push(...batchResults);
  }

  return {
    results,
    total: urls.length,
    success_count: results.filter(r => r.status === 'success').length,
    error_count: results.filter(r => r.status === 'error').length,
  };
}

module.exports = { batchBrowse };
