'use strict';

/**
 * Shopping search vertical.
 */

const engine = require('../engine');

async function search(query, opts = {}) {
  const shoppingQuery = `${query} (buy OR price OR shop OR review)`;
  return engine.search(shoppingQuery, { ...opts, vertical: 'shopping' });
}

function extractProducts(results) {
  return results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    store: (() => {
      try { return new URL(r.url).hostname; } catch { return ''; }
    })(),
  }));
}

module.exports = { name: 'shopping', search, extractProducts };
