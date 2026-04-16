'use strict';

/**
 * Tavily search adapter — uses Tavily AI Search API.
 */

const https = require('https');
const settingsManager = require('../../settings-manager');

const ENDPOINT = {
  host: 'api.tavily.com',
  path: '/search',
};

function getApiKey() {
  return settingsManager.getSearchApiKey('tavily') || process.env.TAVILY_API_KEY || '';
}

function isAvailable() {
  return !!getApiKey();
}

async function search(query, opts = {}) {
  const apiKey = getApiKey();

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      api_key: apiKey,
      query,
      max_results: opts.maxResults || 10,
      search_depth: opts.vertical === 'academic' ? 'advanced' : 'basic',
      include_answer: true,
    });

    const req = https.request(
      {
        hostname: ENDPOINT.host,
        path: ENDPOINT.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const results = parsed.results || [];
            resolve({
              items: results.map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.content || '',
                score: r.score,
              })),
              answer: parsed.answer || '',
              total: results.length,
              raw: parsed,
            });
          } catch (e) {
            reject(new Error(`Tavily search parse error: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = { name: 'tavily', isAvailable, search };
