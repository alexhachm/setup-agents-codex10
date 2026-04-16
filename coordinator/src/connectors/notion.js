'use strict';

/**
 * Notion Connector — search, read, create, and update Notion pages/databases.
 */

const settingsManager = require('../settings-manager');
const apiBackend = require('../api-backend');

const NOTION_API_VERSION = '2022-06-28';
const BASE_URL = 'api.notion.com';

function getHeaders() {
  const token = settingsManager.get('connectors.notion.token') ||
    process.env.NOTION_API_KEY || '';
  if (!token) throw new Error('Notion API token not configured');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_API_VERSION,
  };
}

async function search(query, opts = {}) {
  const body = { query };
  if (opts.filter) body.filter = opts.filter;
  if (opts.page_size) body.page_size = opts.page_size;

  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: '/v1/search',
    method: 'POST',
    headers: getHeaders(),
  }, body);

  return {
    results: (response.data.results || []).map(formatResult),
    has_more: response.data.has_more,
    next_cursor: response.data.next_cursor,
  };
}

async function getPage(pageId) {
  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: `/v1/pages/${pageId}`,
    method: 'GET',
    headers: getHeaders(),
  });
  return formatResult(response.data);
}

async function getPageContent(blockId) {
  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: `/v1/blocks/${blockId}/children?page_size=100`,
    method: 'GET',
    headers: getHeaders(),
  });
  return {
    blocks: response.data.results || [],
    has_more: response.data.has_more,
  };
}

async function createPage(opts) {
  const body = {
    parent: opts.parent,
    properties: opts.properties || {},
  };
  if (opts.children) body.children = opts.children;

  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: '/v1/pages',
    method: 'POST',
    headers: getHeaders(),
  }, body);

  return formatResult(response.data);
}

async function updatePage(pageId, properties) {
  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: `/v1/pages/${pageId}`,
    method: 'PATCH',
    headers: getHeaders(),
  }, { properties });

  return formatResult(response.data);
}

async function queryDatabase(databaseId, filter, sorts, pageSize) {
  const body = {};
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  if (pageSize) body.page_size = pageSize;

  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: `/v1/databases/${databaseId}/query`,
    method: 'POST',
    headers: getHeaders(),
  }, body);

  return {
    results: (response.data.results || []).map(formatResult),
    has_more: response.data.has_more,
    next_cursor: response.data.next_cursor,
  };
}

function formatResult(item) {
  if (!item) return null;
  return {
    id: item.id,
    object: item.object,
    url: item.url,
    title: extractTitle(item),
    created_time: item.created_time,
    last_edited_time: item.last_edited_time,
    properties: item.properties,
  };
}

function extractTitle(item) {
  if (!item.properties) return '';
  for (const [, value] of Object.entries(item.properties)) {
    if (value.type === 'title' && value.title) {
      return value.title.map(t => t.plain_text).join('');
    }
  }
  return '';
}

function isConfigured() {
  try {
    getHeaders();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  name: 'notion',
  search,
  getPage,
  getPageContent,
  createPage,
  updatePage,
  queryDatabase,
  isConfigured,
};
