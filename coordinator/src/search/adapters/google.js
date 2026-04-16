'use strict';

/**
 * Google Custom Search adapter — uses Google Custom Search JSON API.
 */

const https = require('https');
const settingsManager = require('../../settings-manager');

function getApiKey() {
  return settingsManager.getSearchApiKey('google') || process.env.GOOGLE_SEARCH_API_KEY || '';
}

function getCx() {
  return settingsManager.get('search.providers.google.cx') || process.env.GOOGLE_SEARCH_CX || '';
}

function isAvailable() {
  return !!(getApiKey() && getCx());
}

async function search(query, opts = {}) {
  const apiKey = getApiKey();
  const cx = getCx();
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(opts.maxResults || 10, 10)),
  });

  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: 'www.googleapis.com',
        path: `/customsearch/v1?${params}`,
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const items = parsed.items || [];
            resolve({
              items: items.map(r => ({
                title: r.title,
                url: r.link,
                snippet: r.snippet || '',
                displayLink: r.displayLink,
              })),
              total: parseInt(parsed.searchInformation?.totalResults || '0', 10),
              raw: parsed,
            });
          } catch (e) {
            reject(new Error(`Google search parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = { name: 'google', isAvailable, search };
