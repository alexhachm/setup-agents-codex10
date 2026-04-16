'use strict';

/**
 * Perplexity search adapter — uses Perplexity API for AI-powered search.
 */

const https = require('https');
const settingsManager = require('../../settings-manager');

const ENDPOINT = {
  host: 'api.perplexity.ai',
  path: '/chat/completions',
};

function getApiKey() {
  return settingsManager.getSearchApiKey('perplexity') || process.env.PERPLEXITY_API_KEY || '';
}

function isAvailable() {
  return !!getApiKey();
}

function httpPost(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function search(query, opts = {}) {
  const apiKey = getApiKey();
  const response = await httpPost(
    {
      hostname: ENDPOINT.host,
      path: ENDPOINT.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    },
    {
      model: 'sonar',
      messages: [{ role: 'user', content: query }],
      max_tokens: opts.maxResults ? opts.maxResults * 200 : 2000,
    }
  );

  if (response.status >= 400) {
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const content = response.data?.choices?.[0]?.message?.content || '';
  const citations = response.data?.citations || [];

  return {
    items: citations.map((url, i) => ({
      title: `Source ${i + 1}`,
      url,
      snippet: '',
    })),
    answer: content,
    total: citations.length,
    raw: response.data,
  };
}

module.exports = { name: 'perplexity', isAvailable, search };
