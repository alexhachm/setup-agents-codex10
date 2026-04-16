'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const finance = require('../src/search/verticals/finance');

describe('Finance Vertical', () => {
  it('should export name as finance', () => {
    assert.strictEqual(finance.name, 'finance');
  });

  it('should have PROVIDERS with correct structure', () => {
    assert.ok(finance.PROVIDERS.sec_edgar);
    assert.ok(finance.PROVIDERS.fred);
    assert.ok(finance.PROVIDERS.alpha_vantage);
    assert.strictEqual(finance.PROVIDERS.sec_edgar.name, 'SEC EDGAR');
    assert.strictEqual(finance.PROVIDERS.fred.name, 'FRED (Federal Reserve)');
    assert.strictEqual(finance.PROVIDERS.alpha_vantage.name, 'Alpha Vantage');
  });

  it('should export search functions', () => {
    assert.strictEqual(typeof finance.search, 'function');
    assert.strictEqual(typeof finance.searchEdgar, 'function');
    assert.strictEqual(typeof finance.searchFred, 'function');
    assert.strictEqual(typeof finance.searchAlphaVantage, 'function');
  });

  it('should return graceful error when FRED API key is missing', async () => {
    const origKey = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      const result = await finance.searchFred('GDP');
      assert.ok(result.error);
      assert.ok(result.error.includes('FRED_API_KEY'));
      assert.deepStrictEqual(result.results, []);
    } finally {
      if (origKey) process.env.FRED_API_KEY = origKey;
    }
  });

  it('should return graceful error when Alpha Vantage API key is missing', async () => {
    const origKey = process.env.ALPHA_VANTAGE_API_KEY;
    delete process.env.ALPHA_VANTAGE_API_KEY;
    try {
      const result = await finance.searchAlphaVantage('AAPL');
      assert.ok(result.error);
      assert.ok(result.error.includes('ALPHA_VANTAGE_API_KEY'));
      assert.deepStrictEqual(result.results, []);
    } finally {
      if (origKey) process.env.ALPHA_VANTAGE_API_KEY = origKey;
    }
  });
});
