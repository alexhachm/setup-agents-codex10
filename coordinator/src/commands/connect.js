'use strict';

/**
 * CLI commands: mac10 connect, mac10 connectors
 *
 * mac10 connect <service>              — start OAuth flow for a service
 * mac10 connect <service> --token <t>  — set a token directly
 * mac10 connectors                     — list connected services
 * mac10 connectors disconnect <name>   — disconnect a service
 */

const { registerConnector, getConnector, listConnectors } = require('../connectors/framework');
const GmailConnector = require('../connectors/gmail');
const SlackConnector = require('../connectors/slack');

// Auto-register known connectors
function ensureConnectorsRegistered() {
  if (!getConnector('gmail')) {
    registerConnector(new GmailConnector());
  }
  if (!getConnector('slack')) {
    registerConnector(new SlackConnector());
  }
}

function runConnect(args, projectDir) {
  ensureConnectorsRegistered();
  const service = args[0];
  if (!service) {
    return { error: 'Usage: mac10 connect <service> [--token <token>]' };
  }

  const connector = getConnector(service);
  if (!connector) {
    return { error: `Unknown service: ${service}. Available: gmail, slack` };
  }

  // Direct token mode
  const tokenIdx = args.indexOf('--token');
  if (tokenIdx >= 0 && args[tokenIdx + 1]) {
    connector.storeCredentials({ access_token: args[tokenIdx + 1] });
    return { service, status: 'connected', method: 'token' };
  }

  // OAuth flow
  const authUrl = connector.getAuthUrl();
  return {
    service,
    status: 'auth_required',
    auth_url: authUrl,
    instructions: `Visit this URL to authorize: ${authUrl}`,
  };
}

function runConnectors(args, projectDir) {
  ensureConnectorsRegistered();
  const subcommand = args[0];

  if (subcommand === 'disconnect') {
    const service = args[1];
    if (!service) return { error: 'Usage: mac10 connectors disconnect <service>' };
    const connector = getConnector(service);
    if (!connector) return { error: `Unknown service: ${service}` };
    connector.disconnect();
    return { service, status: 'disconnected' };
  }

  return { connectors: listConnectors() };
}

module.exports = { runConnect, runConnectors };
