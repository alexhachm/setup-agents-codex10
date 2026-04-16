'use strict';

/**
 * Gmail connector — send, read, and search emails via Gmail API.
 */

const { ConnectorFramework } = require('./framework');
const https = require('https');

class GmailConnector extends ConnectorFramework {
  constructor(opts = {}) {
    super('gmail', {
      clientId: opts.clientId || process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: opts.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    });
  }

  async _apiCall(method, path, body) {
    const token = await this.getAccessToken();
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'gmail.googleapis.com',
        path: `/gmail/v1/users/me${path}`,
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

  async listMessages(query, maxResults = 10) {
    const params = new URLSearchParams({ q: query || '', maxResults: String(maxResults) });
    return this._apiCall('GET', `/messages?${params}`);
  }

  async getMessage(messageId) {
    return this._apiCall('GET', `/messages/${messageId}`);
  }

  async sendMessage(to, subject, body) {
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString('base64url');
    return this._apiCall('POST', '/messages/send', { raw });
  }

  async searchMessages(query, maxResults = 10) {
    return this.listMessages(query, maxResults);
  }
}

module.exports = GmailConnector;
