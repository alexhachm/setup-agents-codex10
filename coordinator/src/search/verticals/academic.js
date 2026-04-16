'use strict';

/**
 * Academic search vertical — specialized for scholarly/research content.
 */

const engine = require('../engine');

const ACADEMIC_PREFIXES = ['site:scholar.google.com', 'site:arxiv.org', 'site:pubmed.ncbi.nlm.nih.gov'];

async function search(query, opts = {}) {
  // Enhance query for academic results
  const academicQuery = `${query} (research OR paper OR study OR journal)`;
  return engine.search(academicQuery, {
    ...opts,
    vertical: 'academic',
  });
}

function formatCitation(result, style = 'apa') {
  const { title, url, snippet } = result;
  if (style === 'apa') {
    return `${title}. Retrieved from ${url}`;
  }
  if (style === 'mla') {
    return `"${title}." Web. <${url}>.`;
  }
  return `[${title}](${url})`;
}

module.exports = { name: 'academic', search, formatCitation };
