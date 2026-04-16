'use strict';

/**
 * Search Engine — multi-provider search coordinator.
 * Routes queries through adapters based on settings and availability.
 */

const settingsManager = require('../settings-manager');

let _adapters = {};

function registerAdapter(name, adapter) {
  _adapters[name] = adapter;
}

function getAvailableAdapters() {
  return Object.entries(_adapters)
    .filter(([name, adapter]) => adapter.isAvailable())
    .map(([name]) => name);
}

function getDefaultAdapter() {
  const preferred = settingsManager.get('search.default_provider') || 'perplexity';
  if (_adapters[preferred] && _adapters[preferred].isAvailable()) {
    return preferred;
  }
  // Fall back to first available
  const available = getAvailableAdapters();
  return available.length > 0 ? available[0] : null;
}

/**
 * Perform a web search.
 * @param {string} query - Search query
 * @param {Object} opts - { provider, maxResults, vertical, freshness }
 * @returns {Promise<Object>} - { results, citations, provider, query }
 */
async function search(query, opts = {}) {
  const adapterName = opts.provider || getDefaultAdapter();
  if (!adapterName || !_adapters[adapterName]) {
    throw new Error(`No search adapter available. Configure a search provider API key.`);
  }

  const adapter = _adapters[adapterName];
  if (!adapter.isAvailable()) {
    throw new Error(`Search provider "${adapterName}" is not available. Check API key.`);
  }

  const results = await adapter.search(query, {
    maxResults: opts.maxResults || 10,
    freshness: opts.freshness,
    vertical: opts.vertical,
  });

  return {
    results: results.items || [],
    citations: (results.items || []).map((item, i) => ({
      index: i + 1,
      title: item.title,
      url: item.url,
      snippet: item.snippet,
    })),
    provider: adapterName,
    query,
    total: results.total || (results.items || []).length,
  };
}

/**
 * Perform a search and return only citations.
 */
async function searchWithCitations(query, opts = {}) {
  const result = await search(query, opts);
  return {
    answer: result.results[0]?.snippet || '',
    citations: result.citations,
    provider: result.provider,
  };
}

/**
 * Fetch and extract content from a URL.
 */
async function fetchUrl(url, opts = {}) {
  // Use perplexity or dedicated adapter if available
  const adapterName = opts.provider || getDefaultAdapter();
  if (adapterName && _adapters[adapterName] && _adapters[adapterName].fetchUrl) {
    return _adapters[adapterName].fetchUrl(url, opts);
  }

  // Fallback: use Node.js https
  const https = require('https');
  const http = require('http');
  const client = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.get(url, { timeout: opts.timeout || 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          contentType: res.headers['content-type'] || '',
          content: data,
          length: data.length,
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Fetch timeout'));
    });
  });
}

function reset() {
  _adapters = {};
}

module.exports = {
  registerAdapter,
  getAvailableAdapters,
  getDefaultAdapter,
  search,
  searchWithCitations,
  fetchUrl,
  reset,
};
