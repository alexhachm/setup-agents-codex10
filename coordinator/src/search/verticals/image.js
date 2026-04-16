'use strict';

/**
 * Image search vertical.
 */

const engine = require('../engine');

async function search(query, opts = {}) {
  const imageQuery = `${query} image`;
  return engine.search(imageQuery, { ...opts, vertical: 'image' });
}

function filterByType(results, types = ['jpg', 'png', 'webp']) {
  return results.filter(r => {
    const url = (r.url || '').toLowerCase();
    return types.some(t => url.includes(`.${t}`));
  });
}

module.exports = { name: 'image', search, filterByType };
