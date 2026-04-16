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

  // --- Inbound support (Bolt app pattern) ---

  /**
   * Create a Bolt-compatible event handler configuration.
   * Receives @mentions and slash commands.
   * @param {Object} opts - { signingSecret, onMention, onSlashCommand }
   * @returns {Object} - { handleEvent, verifySignature }
   */
  createInboundHandler(opts = {}) {
    const signingSecret = opts.signingSecret || process.env.SLACK_SIGNING_SECRET || '';
    const onMention = opts.onMention || (() => {});
    const onSlashCommand = opts.onSlashCommand || (() => {});

    function verifySignature(timestamp, body, signature) {
      if (!signingSecret) return false;
      const crypto = require('crypto');
      const sigBasestring = `v0:${timestamp}:${body}`;
      const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret)
        .update(sigBasestring)
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
    }

    function handleEvent(event) {
      if (!event) return { ok: false, error: 'Missing event' };

      // Slash command (comes as form data, pre-parsed — no type field)
      if (event.command) {
        onSlashCommand({
          command: event.command,
          text: event.text || '',
          user_id: event.user_id,
          channel_id: event.channel_id,
          response_url: event.response_url,
        });
        return { ok: true, handled: 'slash_command' };
      }

      if (!event.type) return { ok: false, error: 'Missing event type' };

      // URL verification challenge
      if (event.type === 'url_verification') {
        return { ok: true, challenge: event.challenge };
      }

      if (event.type === 'event_callback') {
        const innerEvent = event.event || {};

        // App mention
        if (innerEvent.type === 'app_mention') {
          onMention({
            text: innerEvent.text,
            user: innerEvent.user,
            channel: innerEvent.channel,
            ts: innerEvent.ts,
          });
          return { ok: true, handled: 'app_mention' };
        }
      }

      return { ok: true, handled: false };
    }

    return { handleEvent, verifySignature };
  }
}

module.exports = SlackConnector;
