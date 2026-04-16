'use strict';

/**
 * Slack connector — send messages, read channels, search.
 */

const { ConnectorFramework } = require('./framework');
const https = require('https');

class SlackConnector extends ConnectorFramework {
  constructor(opts = {}) {
    super('slack', {
      clientId: opts.clientId || process.env.SLACK_CLIENT_ID || '',
      clientSecret: opts.clientSecret || process.env.SLACK_CLIENT_SECRET || '',
      scopes: ['channels:read', 'chat:write', 'search:read'],
      authUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
    });
    this.botToken = opts.botToken || process.env.SLACK_BOT_TOKEN || '';
  }

  async _apiCall(method, endpoint, body) {
    const token = this.botToken || await this.getAccessToken();
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'slack.com',
        path: `/api/${endpoint}`,
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
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  isAvailable() {
    return !!(this.botToken || this.isAuthenticated());
  }

  async sendMessage(channel, text, opts = {}) {
    return this._apiCall('POST', 'chat.postMessage', {
      channel,
      text,
      ...opts,
    });
  }

  async listChannels(limit = 100) {
    return this._apiCall('GET', `conversations.list?limit=${limit}`);
  }

  async searchMessages(query) {
    return this._apiCall('GET', `search.messages?query=${encodeURIComponent(query)}`);
  }

  async getChannelHistory(channel, limit = 50) {
    return this._apiCall('GET', `conversations.history?channel=${channel}&limit=${limit}`);
  }
}

module.exports = SlackConnector;
