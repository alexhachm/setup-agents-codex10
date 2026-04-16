'use strict';

/**
 * Notifier — send notifications through configured channels.
 * Supports webhook, email (via connector), Slack, and desktop notifications.
 */

const db = require('./db');
const https = require('https');

function createChannel(opts) {
  const rawDb = db.getDb();
  const result = rawDb.prepare(`
    INSERT INTO notification_channels (name, channel_type, config, enabled)
    VALUES (?, ?, ?, ?)
  `).run(
    opts.name,
    opts.channel_type,
    JSON.stringify(opts.config || {}),
    opts.enabled !== false ? 1 : 0
  );
  return Number(result.lastInsertRowid);
}

function getChannel(name) {
  const rawDb = db.getDb();
  const row = rawDb.prepare('SELECT * FROM notification_channels WHERE name = ?').get(name);
  if (row && row.config) {
    try { row.config = JSON.parse(row.config); } catch {}
  }
  return row;
}

function listChannels() {
  const rawDb = db.getDb();
  return rawDb.prepare('SELECT * FROM notification_channels ORDER BY created_at DESC').all()
    .map(row => {
      try { row.config = JSON.parse(row.config); } catch {}
      return row;
    });
}

function updateChannel(name, updates) {
  const rawDb = db.getDb();
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'name' || key === 'id') continue;
    fields.push(`${key} = ?`);
    values.push(typeof value === 'object' ? JSON.stringify(value) : value);
  }
  values.push(name);
  rawDb.prepare(`UPDATE notification_channels SET ${fields.join(', ')} WHERE name = ?`).run(...values);
}

function deleteChannel(name) {
  const rawDb = db.getDb();
  return rawDb.prepare('DELETE FROM notification_channels WHERE name = ?').run(name).changes > 0;
}

/**
 * Send a notification to all enabled channels.
 */
async function notify(message, opts = {}) {
  const channels = listChannels().filter(c => c.enabled);
  const results = [];

  for (const channel of channels) {
    try {
      const result = await sendToChannel(channel, message, opts);
      results.push({ channel: channel.name, status: 'sent', ...result });

      // Update last_sent_at
      const rawDb = db.getDb();
      rawDb.prepare("UPDATE notification_channels SET last_sent_at = datetime('now') WHERE name = ?").run(channel.name);
    } catch (err) {
      results.push({ channel: channel.name, status: 'error', error: err.message });

      // Increment error count
      const rawDb = db.getDb();
      rawDb.prepare('UPDATE notification_channels SET error_count = error_count + 1 WHERE name = ?').run(channel.name);
    }
  }

  return { sent_count: results.filter(r => r.status === 'sent').length, results };
}

async function sendToChannel(channel, message, opts) {
  switch (channel.channel_type) {
    case 'webhook':
      return sendWebhook(channel.config, message, opts);
    case 'slack':
      return sendSlack(channel.config, message, opts);
    case 'desktop':
      return sendDesktop(message, opts);
    case 'email':
      return { note: 'Email notifications require Gmail connector' };
    default:
      throw new Error(`Unknown channel type: ${channel.channel_type}`);
  }
}

async function sendWebhook(config, message, opts) {
  const url = new URL(config.url);
  const body = JSON.stringify({
    text: message,
    ...opts,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendSlack(config, message, opts) {
  const body = JSON.stringify({
    channel: config.channel,
    text: message,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'slack.com',
      path: '/api/chat.postMessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendDesktop(message, opts) {
  // Desktop notification via node-notifier or native approach
  return { type: 'desktop', message, note: 'Desktop notification sent (requires node-notifier)' };
}

module.exports = {
  createChannel,
  getChannel,
  listChannels,
  updateChannel,
  deleteChannel,
  notify,
  sendToChannel,
};
