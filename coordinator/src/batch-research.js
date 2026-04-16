'use strict';

/**
 * Batch Research — execute multiple research queries in parallel.
 * Rate limiting semaphore: max 5 concurrent operations.
 */

const deepResearch = require('./deep-research');
const searchEngine = require('./search/engine');

const MAX_CONCURRENT = 5;

/**
 * Execute batch search queries.
 * @param {Array<string>} queries - Search queries
 * @param {Object} opts - { concurrency, provider, maxResults }
 * @returns {Promise<Object>} - { results, total }
 */
async function batchSearch(queries, opts = {}) {
  const concurrency = Math.min(opts.concurrency || 3, MAX_CONCURRENT);
  const results = [];

  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = queries.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (query) => {
        try {
          const result = await searchEngine.search(query, {
            provider: opts.provider,
            maxResults: opts.maxResults || 5,
          });
          return { query, ...result, status: 'success' };
        } catch (err) {
          return { query, error: err.message, status: 'error' };
        }
      })
    );
    results.push(...batchResults);
  }

  return {
    results,
    total: queries.length,
    success_count: results.filter(r => r.status === 'success').length,
  };
}

/**
 * Execute batch deep research.
 */
async function batchDeepResearch(topics, opts = {}) {
  const results = [];

  // Deep research is heavier, run sequentially
  for (const topic of topics) {
    try {
      const result = await deepResearch.research(topic, opts);
      results.push({ topic, ...result, status: 'success' });
    } catch (err) {
      results.push({ topic, error: err.message, status: 'error' });
    }
  }

  return {
    results,
    total: topics.length,
    success_count: results.filter(r => r.status === 'success').length,
  };
}

module.exports = { batchSearch, batchDeepResearch, MAX_CONCURRENT };
