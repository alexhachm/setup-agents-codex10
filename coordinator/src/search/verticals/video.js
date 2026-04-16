'use strict';

/**
 * Video search vertical.
 */

const engine = require('../engine');

async function search(query, opts = {}) {
  const videoQuery = `${query} (site:youtube.com OR site:vimeo.com OR video)`;
  return engine.search(videoQuery, { ...opts, vertical: 'video' });
}

function extractVideoInfo(results) {
  return results.map(r => ({
    title: r.title,
    url: r.url,
    platform: r.url.includes('youtube') ? 'youtube' : r.url.includes('vimeo') ? 'vimeo' : 'other',
    snippet: r.snippet,
  }));
}

module.exports = { name: 'video', search, extractVideoInfo };
