'use strict';

/**
 * Brave Search adapter — uses Brave Search API.
 */

const https = require('https');
const settingsManager = require('../../settings-manager');

const ENDPOINT = {
  host: 'api.search.brave.com',
  basePath: '/res/v1/web/search',
};

function getApiKey() {
  return settingsManager.getSearchApiKey('brave') || process.env.BRAVE_API_KEY || '';
}

function isAvailable() {
  return !!getApiKey();
}

async function search(query, opts = {}) {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    q: query,
    count: String(opts.maxResults || 10),
  });
  if (opts.freshness) params.set('freshness', opts.freshness);

  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: ENDPOINT.host,
        path: `${ENDPOINT.basePath}?${params}`,
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const webResults = parsed.web?.results || [];
            resolve({
              items: webResults.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.description || '',
                age: r.age,
              })),
              total: parsed.web?.totalResults || webResults.length,
              raw: parsed,
            });
          } catch (e) {
            reject(new Error(`Brave search parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = { name: 'brave', isAvailable, search };
