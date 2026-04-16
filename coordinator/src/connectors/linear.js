'use strict';

/**
 * Linear Connector — query and manage issues, projects, cycles in Linear.
 */

const settingsManager = require('../settings-manager');
const apiBackend = require('../api-backend');

const BASE_URL = 'api.linear.app';

function getHeaders() {
  const token = settingsManager.get('connectors.linear.api_key') ||
    process.env.LINEAR_API_KEY || '';
  if (!token) throw new Error('Linear API key not configured');
  return {
    'Authorization': token,
    'Content-Type': 'application/json',
  };
}

async function graphql(query, variables = {}) {
  const response = await apiBackend.httpRequest({
    hostname: BASE_URL,
    path: '/graphql',
    method: 'POST',
    headers: getHeaders(),
  }, { query, variables });

  if (response.data.errors) {
    throw new Error(response.data.errors.map(e => e.message).join(', '));
  }
  return response.data.data;
}

async function listIssues(opts = {}) {
  const query = `
    query Issues($first: Int, $filter: IssueFilter) {
      issues(first: $first, filter: $filter) {
        nodes {
          id identifier title state { name } priority assignee { name }
          createdAt updatedAt
        }
      }
    }
  `;
  const variables = { first: opts.limit || 50 };
  if (opts.filter) variables.filter = opts.filter;
  const data = await graphql(query, variables);
  return data.issues.nodes;
}

async function getIssue(identifier) {
  const query = `
    query Issue($id: String!) {
      issue(id: $id) {
        id identifier title description state { name }
        priority assignee { name } labels { nodes { name } }
        createdAt updatedAt
      }
    }
  `;
  const data = await graphql(query, { id: identifier });
  return data.issue;
}

async function createIssue(opts) {
  const query = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier title url }
      }
    }
  `;
  const data = await graphql(query, { input: opts });
  return data.issueCreate;
}

async function updateIssue(issueId, updates) {
  const query = `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { id identifier title state { name } }
      }
    }
  `;
  const data = await graphql(query, { id: issueId, input: updates });
  return data.issueUpdate;
}

async function listProjects(opts = {}) {
  const query = `
    query Projects($first: Int) {
      projects(first: $first) {
        nodes {
          id name state startDate targetDate
          progress
        }
      }
    }
  `;
  const data = await graphql(query, { first: opts.limit || 25 });
  return data.projects.nodes;
}

async function searchIssues(term) {
  const query = `
    query SearchIssues($term: String!) {
      searchIssues(term: $term, first: 20) {
        nodes {
          id identifier title state { name }
          priority assignee { name }
        }
      }
    }
  `;
  const data = await graphql(query, { term });
  return data.searchIssues.nodes;
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
  name: 'linear',
  graphql,
  listIssues,
  getIssue,
  createIssue,
  updateIssue,
  listProjects,
  searchIssues,
  isConfigured,
};
