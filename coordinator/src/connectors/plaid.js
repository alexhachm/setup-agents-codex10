'use strict';

/**
 * Plaid Connector Scaffold — financial data access via Plaid API.
 *
 * NOTE: This is a scaffold. Full implementation requires:
 * 1. Plaid developer account and API keys
 * 2. plaid-node npm package
 * 3. Link token flow for account connection
 * 4. Webhook handling for async updates
 */

const settingsManager = require('../settings-manager');

const PLAID_ENVIRONMENTS = {
  sandbox: 'sandbox.plaid.com',
  development: 'development.plaid.com',
  production: 'production.plaid.com',
};

function isConfigured() {
  const config = settingsManager.get('connectors.plaid');
  return !!(config && config.client_id && config.secret);
}

function getConfig() {
  const config = settingsManager.get('connectors.plaid') || {};
  return {
    client_id: config.client_id || process.env.PLAID_CLIENT_ID || '',
    secret: config.secret || process.env.PLAID_SECRET || '',
    environment: config.environment || 'sandbox',
    base_url: PLAID_ENVIRONMENTS[config.environment || 'sandbox'],
  };
}

async function createLinkToken(userId) {
  if (!isConfigured()) throw new Error('Plaid not configured');
  // Scaffold — actual implementation would call /link/token/create
  return {
    link_token: 'link-sandbox-scaffold',
    expiration: new Date(Date.now() + 3600000).toISOString(),
    user_id: userId,
    scaffold: true,
  };
}

async function exchangePublicToken(publicToken) {
  if (!isConfigured()) throw new Error('Plaid not configured');
  // Scaffold — actual implementation would call /item/public_token/exchange
  return {
    access_token: 'access-sandbox-scaffold',
    item_id: 'item-sandbox-scaffold',
    scaffold: true,
  };
}

async function getAccounts(accessToken) {
  if (!isConfigured()) throw new Error('Plaid not configured');
  return {
    accounts: [],
    scaffold: true,
    note: 'Plaid accounts endpoint — implement with plaid-node SDK',
  };
}

async function getTransactions(accessToken, startDate, endDate) {
  if (!isConfigured()) throw new Error('Plaid not configured');
  return {
    transactions: [],
    total_transactions: 0,
    scaffold: true,
    note: 'Plaid transactions endpoint — implement with plaid-node SDK',
  };
}

async function getBalance(accessToken) {
  if (!isConfigured()) throw new Error('Plaid not configured');
  return {
    accounts: [],
    scaffold: true,
    note: 'Plaid balance endpoint — implement with plaid-node SDK',
  };
}

module.exports = {
  name: 'plaid',
  isConfigured,
  getConfig,
  createLinkToken,
  exchangePublicToken,
  getAccounts,
  getTransactions,
  getBalance,
  PLAID_ENVIRONMENTS,
};
