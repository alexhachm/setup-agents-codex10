'use strict';

/**
 * Connector Framework — OAuth flow, token storage, refresh.
 * Base class for all external service connectors.
 */

const db = require('../db');
const settingsManager = require('../settings-manager');

class ConnectorFramework {
  constructor(name, opts = {}) {
    this.name = name;
    this.clientId = opts.clientId || '';
    this.clientSecret = opts.clientSecret || '';
    this.scopes = opts.scopes || [];
    this.authUrl = opts.authUrl || '';
    this.tokenUrl = opts.tokenUrl || '';
    this.redirectUri = opts.redirectUri || 'http://localhost:3847/callback';
  }

  /**
   * Get stored credentials for this connector.
   */
  getCredentials() {
    const rawDb = db.getDb();
    return rawDb.prepare(
      'SELECT * FROM oauth_credentials WHERE connector_name = ?'
    ).get(this.name) || null;
  }

  /**
   * Store credentials.
   */
  storeCredentials(tokens) {
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO oauth_credentials (connector_name, provider, access_token, refresh_token, token_type, expires_at, scope)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(connector_name) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, oauth_credentials.refresh_token),
        token_type = excluded.token_type,
        expires_at = excluded.expires_at,
        scope = excluded.scope,
        updated_at = datetime('now')
    `).run(
      this.name,
      this.name,
      tokens.access_token,
      tokens.refresh_token || null,
      tokens.token_type || 'Bearer',
      tokens.expires_at || null,
      tokens.scope || this.scopes.join(' ')
    );
  }

  /**
   * Check if credentials are valid (not expired).
   */
  isAuthenticated() {
    const creds = this.getCredentials();
    if (!creds || !creds.access_token) return false;
    if (creds.expires_at) {
      return new Date(creds.expires_at) > new Date();
    }
    return true;
  }

  /**
   * Get the OAuth authorization URL.
   */
  getAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state: state || `${this.name}-${Date.now()}`,
    });
    return `${this.authUrl}?${params}`;
  }

  /**
   * Exchange authorization code for tokens.
   */
  async exchangeCode(code) {
    const https = require('https');
    const url = new URL(this.tokenUrl);

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    }).toString();

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const tokens = JSON.parse(data);
            if (tokens.access_token) {
              if (tokens.expires_in) {
                tokens.expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
              }
              this.storeCredentials(tokens);
            }
            resolve(tokens);
          } catch (e) {
            reject(new Error(`Token exchange failed: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Refresh the access token.
   */
  async refreshToken() {
    const creds = this.getCredentials();
    if (!creds || !creds.refresh_token) {
      throw new Error(`No refresh token for ${this.name}`);
    }

    const https = require('https');
    const url = new URL(this.tokenUrl);

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refresh_token,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    }).toString();

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const tokens = JSON.parse(data);
            if (tokens.access_token) {
              if (tokens.expires_in) {
                tokens.expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
              }
              this.storeCredentials(tokens);
            }
            resolve(tokens);
          } catch (e) {
            reject(new Error(`Token refresh failed: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  /**
   * Get a valid access token (refreshing if needed).
   */
  async getAccessToken() {
    const creds = this.getCredentials();
    if (!creds) throw new Error(`Not authenticated with ${this.name}`);

    if (creds.expires_at && new Date(creds.expires_at) <= new Date()) {
      await this.refreshToken();
      return this.getCredentials().access_token;
    }

    return creds.access_token;
  }

  /**
   * Get/set connector config.
   */
  getConfig(key) {
    const rawDb = db.getDb();
    const row = rawDb.prepare(
      'SELECT config_value FROM connector_configs WHERE connector_name = ? AND config_key = ?'
    ).get(this.name, key);
    return row ? row.config_value : null;
  }

  setConfig(key, value) {
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO connector_configs (connector_name, config_key, config_value)
      VALUES (?, ?, ?)
      ON CONFLICT(connector_name, config_key) DO UPDATE SET
        config_value = excluded.config_value,
        updated_at = datetime('now')
    `).run(this.name, key, value);
  }

  /**
   * Disconnect (remove credentials).
   */
  disconnect() {
    const rawDb = db.getDb();
    rawDb.prepare('DELETE FROM oauth_credentials WHERE connector_name = ?').run(this.name);
    rawDb.prepare('DELETE FROM connector_configs WHERE connector_name = ?').run(this.name);
  }

  getStatus() {
    return {
      name: this.name,
      authenticated: this.isAuthenticated(),
      scopes: this.scopes,
    };
  }
}

// Connector registry
const _connectors = new Map();

function registerConnector(connector) {
  _connectors.set(connector.name, connector);
}

function getConnector(name) {
  return _connectors.get(name) || null;
}

function listConnectors() {
  return Array.from(_connectors.values()).map(c => c.getStatus());
}

module.exports = {
  ConnectorFramework,
  registerConnector,
  getConnector,
  listConnectors,
};
