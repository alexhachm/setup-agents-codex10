'use strict';

/**
 * People search vertical — find information about individuals.
 */

const engine = require('../engine');

async function search(query, opts = {}) {
  const peopleQuery = `${query} (profile OR biography OR linkedin OR about)`;
  return engine.search(peopleQuery, { ...opts, vertical: 'people' });
}

function extractProfile(results) {
  return results.map(r => ({
    name: r.title,
    url: r.url,
    summary: r.snippet,
    source: new URL(r.url).hostname,
  }));
}

module.exports = { name: 'people', search, extractProfile };
