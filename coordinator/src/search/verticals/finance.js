'use strict';

/**
 * Finance search vertical — FREE finance APIs.
 * SEC EDGAR (company filings), FRED (economic data), Alpha Vantage (stock quotes).
 */

const https = require('https');

const PROVIDERS = {
  sec_edgar: {
    name: 'SEC EDGAR',
    baseUrl: 'https://efts.sec.gov/LATEST/search-index',
    searchUrl: 'https://efts.sec.gov/LATEST/search-index?q=',
    fullTextUrl: 'https://efts.sec.gov/LATEST/search-index?q=',
  },
  fred: {
    name: 'FRED (Federal Reserve)',
    baseUrl: 'https://api.stlouisfed.org/fred',
    searchUrl: 'https://api.stlouisfed.org/fred/series/search',
  },
  alpha_vantage: {
    name: 'Alpha Vantage',
    baseUrl: 'https://www.alphavantage.co/query',
  },
};

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'mac10-coordinator/1.0' } }, (res) => {
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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function searchEdgar(query, opts = {}) {
  const limit = opts.limit || 10;
  const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(query)}&dateRange=custom&startdt=${opts.startDate || '2020-01-01'}&enddt=${opts.endDate || new Date().toISOString().slice(0, 10)}&forms=${opts.formType || ''}&from=0&size=${limit}`;
  try {
    const response = await httpGet(url);
    if (response.status !== 200) return { results: [], provider: 'sec_edgar', error: `HTTP ${response.status}` };
    const hits = response.data.hits?.hits || [];
    return {
      results: hits.map(hit => ({
        title: hit._source?.file_description || hit._source?.display_names?.join(', ') || query,
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(query)}&type=&dateb=&owner=include&count=40`,
        snippet: hit._source?.file_description || '',
        form_type: hit._source?.form_type,
        filed_at: hit._source?.file_date,
        source: 'sec_edgar',
      })),
      provider: 'sec_edgar',
    };
  } catch (err) {
    return { results: [], provider: 'sec_edgar', error: err.message };
  }
}

async function searchFred(query, opts = {}) {
  const apiKey = opts.apiKey || process.env.FRED_API_KEY;
  if (!apiKey) {
    return { results: [], provider: 'fred', error: 'FRED_API_KEY not set (free at https://fred.stlouisfed.org/docs/api/api_key.html)' };
  }
  const limit = opts.limit || 10;
  const url = `https://api.stlouisfed.org/fred/series/search?search_text=${encodeURIComponent(query)}&api_key=${apiKey}&file_type=json&limit=${limit}`;
  try {
    const response = await httpGet(url);
    if (response.status !== 200) return { results: [], provider: 'fred', error: `HTTP ${response.status}` };
    const series = response.data.seriess || [];
    return {
      results: series.map(s => ({
        title: s.title,
        url: `https://fred.stlouisfed.org/series/${s.id}`,
        snippet: `${s.notes || ''} Frequency: ${s.frequency}. Units: ${s.units}.`.trim(),
        series_id: s.id,
        frequency: s.frequency,
        units: s.units,
        last_updated: s.last_updated,
        source: 'fred',
      })),
      provider: 'fred',
    };
  } catch (err) {
    return { results: [], provider: 'fred', error: err.message };
  }
}

async function searchAlphaVantage(symbol, opts = {}) {
  const apiKey = opts.apiKey || process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return { results: [], provider: 'alpha_vantage', error: 'ALPHA_VANTAGE_API_KEY not set (free at https://www.alphavantage.co/support/#api-key)' };
  }
  const func = opts.function || 'GLOBAL_QUOTE';
  const url = `https://www.alphavantage.co/query?function=${func}&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  try {
    const response = await httpGet(url);
    if (response.status !== 200) return { results: [], provider: 'alpha_vantage', error: `HTTP ${response.status}` };
    const quote = response.data['Global Quote'] || {};
    return {
      results: [{
        title: `${symbol} Stock Quote`,
        url: `https://www.alphavantage.co/query?function=${func}&symbol=${symbol}`,
        snippet: quote['05. price'] ? `Price: $${quote['05. price']}, Change: ${quote['10. change percent']}` : 'No data available',
        price: quote['05. price'],
        change_percent: quote['10. change percent'],
        volume: quote['06. volume'],
        source: 'alpha_vantage',
      }],
      provider: 'alpha_vantage',
    };
  } catch (err) {
    return { results: [], provider: 'alpha_vantage', error: err.message };
  }
}

async function search(query, opts = {}) {
  const provider = opts.provider || 'all';
  const results = [];

  if (provider === 'all' || provider === 'sec_edgar') {
    const edgar = await searchEdgar(query, opts);
    results.push(...edgar.results);
  }
  if (provider === 'all' || provider === 'fred') {
    const fred = await searchFred(query, opts);
    results.push(...fred.results);
  }
  if (provider === 'all' || provider === 'alpha_vantage') {
    const av = await searchAlphaVantage(query, opts);
    results.push(...av.results);
  }

  return { results, vertical: 'finance' };
}

module.exports = {
  name: 'finance',
  PROVIDERS,
  search,
  searchEdgar,
  searchFred,
  searchAlphaVantage,
};
