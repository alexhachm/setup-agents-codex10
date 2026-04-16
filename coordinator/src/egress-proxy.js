'use strict';

/**
 * Egress Proxy — credential injection for outbound API calls.
 * Workers route API calls through the proxy to get credentials injected.
 */

const { getConnector } = require('./connectors/framework');
const settingsManager = require('./settings-manager');

/**
 * Inject credentials into an HTTP request options object.
 * @param {string} connectorName - Connector to use for credentials
 * @param {Object} requestOpts - HTTP request options (hostname, path, headers)
 * @returns {Promise<Object>} - Modified request options with credentials
 */
async function injectCredentials(connectorName, requestOpts) {
  const connector = getConnector(connectorName);
  if (!connector) {
    throw new Error(`Connector "${connectorName}" not found`);
  }

  if (!connector.isAuthenticated()) {
    throw new Error(`Connector "${connectorName}" is not authenticated`);
  }

  const token = await connector.getAccessToken();
  const headers = { ...requestOpts.headers };
  headers['Authorization'] = `Bearer ${token}`;

  return { ...requestOpts, headers };
}

/**
 * Build a proxied request function for a connector.
 * @param {string} connectorName
 * @returns {Function} - (method, path, body) => Promise<response>
 */
function createProxiedClient(connectorName) {
  return async function (method, path, body) {
    const https = require('https');
    const connector = getConnector(connectorName);
    if (!connector) throw new Error(`Connector "${connectorName}" not found`);

    const token = await connector.getAccessToken();

    return new Promise((resolve, reject) => {
      const url = new URL(path.startsWith('http') ? path : `https://api.example.com${path}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', reject);
      if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  };
}

module.exports = {
  injectCredentials,
  createProxiedClient,
};
