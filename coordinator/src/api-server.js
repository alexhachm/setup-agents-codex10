'use strict';

/**
 * API Server — REST + WebSocket interface for mac10.
 * Provides programmatic access to coordinator functions.
 */

const http = require('http');
const url = require('url');
const db = require('./db');
const settingsManager = require('./settings-manager');

let _server = null;
let _wss = null;
let _wsClients = new Set();

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Route handlers
const routes = {
  // Health check
  'GET /api/health': (req, res) => {
    jsonResponse(res, 200, { status: 'ok', version: '10.2', timestamp: new Date().toISOString() });
  },

  // Requests
  'GET /api/requests': (req, res) => {
    const requests = db.listRequests();
    jsonResponse(res, 200, { requests });
  },
  'POST /api/requests': async (req, res) => {
    const body = await parseBody(req);
    if (!body.description) return jsonResponse(res, 400, { error: 'description required' });
    const id = db.createRequest(body.description);
    jsonResponse(res, 201, { id, status: 'pending' });
  },
  'GET /api/requests/:id': (req, res, params) => {
    const request = db.getRequest(params.id);
    if (!request) return jsonResponse(res, 404, { error: 'Not found' });
    jsonResponse(res, 200, request);
  },

  // Tasks
  'GET /api/tasks': (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const tasks = db.listTasks(parsedUrl.query);
    jsonResponse(res, 200, { tasks });
  },
  'GET /api/tasks/:id': (req, res, params) => {
    const task = db.getTask(Number(params.id));
    if (!task) return jsonResponse(res, 404, { error: 'Not found' });
    jsonResponse(res, 200, task);
  },

  // Workers
  'GET /api/workers': (req, res) => {
    const workers = db.getAllWorkers();
    jsonResponse(res, 200, { workers });
  },
  'GET /api/workers/:id': (req, res, params) => {
    const worker = db.getWorker(Number(params.id));
    if (!worker) return jsonResponse(res, 404, { error: 'Not found' });
    jsonResponse(res, 200, worker);
  },

  // Settings
  'GET /api/settings': (req, res) => {
    const settings = settingsManager.getAll();
    // Redact API keys
    const redacted = JSON.parse(JSON.stringify(settings));
    if (redacted.providers) {
      for (const config of Object.values(redacted.providers)) {
        if (config.api_key) config.api_key = '***';
      }
    }
    jsonResponse(res, 200, { settings: redacted });
  },
  'PUT /api/settings': async (req, res) => {
    const body = await parseBody(req);
    if (body.key && body.value !== undefined) {
      settingsManager.set(body.key, body.value, body.scope || 'global');
      jsonResponse(res, 200, { key: body.key, value: body.value });
    } else {
      jsonResponse(res, 400, { error: 'key and value required' });
    }
  },

  // Activity log
  'GET /api/activity': (req, res) => {
    const rawDb = db.getDb();
    const parsedUrl = url.parse(req.url, true);
    const limit = parseInt(parsedUrl.query.limit) || 50;
    const logs = rawDb.prepare(
      'SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    jsonResponse(res, 200, { logs });
  },

  // Metrics
  'GET /api/metrics': (req, res) => {
    const metrics = db.getMetrics();
    jsonResponse(res, 200, { metrics });
  },

  // Mail
  'POST /api/mail': async (req, res) => {
    const body = await parseBody(req);
    if (!body.recipient || !body.type) {
      return jsonResponse(res, 400, { error: 'recipient and type required' });
    }
    db.sendMail(body.recipient, body.type, body.payload || {});
    jsonResponse(res, 201, { sent: true });
  },
};

function matchRoute(method, pathname) {
  const key = `${method} ${pathname}`;
  if (routes[key]) return { handler: routes[key], params: {} };

  // Try parameterized routes
  for (const [routeKey, handler] of Object.entries(routes)) {
    const [routeMethod, routePattern] = routeKey.split(' ');
    if (routeMethod !== method) continue;

    const routeParts = routePattern.split('/');
    const pathParts = pathname.split('/');
    if (routeParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i];
      } else if (routeParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { handler, params };
  }
  return null;
}

async function handleRequest(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = url.parse(req.url);
  const pathname = parsedUrl.pathname;

  const matched = matchRoute(req.method, pathname);
  if (!matched) {
    return jsonResponse(res, 404, { error: 'Not found', path: pathname });
  }

  try {
    await matched.handler(req, res, matched.params);
  } catch (err) {
    jsonResponse(res, 500, { error: err.message });
  }
}

function broadcast(event) {
  const data = JSON.stringify(event);
  for (const client of _wsClients) {
    try {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    } catch {}
  }
}

function start(port, opts = {}) {
  port = port || 3210;

  _server = http.createServer(handleRequest);

  // WebSocket support
  try {
    const { WebSocketServer } = require('ws');
    _wss = new WebSocketServer({ server: _server });

    _wss.on('connection', (ws) => {
      _wsClients.add(ws);
      ws.on('close', () => _wsClients.delete(ws));
      ws.on('error', () => _wsClients.delete(ws));
      ws.send(JSON.stringify({ type: 'connected', version: '10.2' }));
    });
  } catch {
    // ws module not available
  }

  _server.listen(port, () => {
    if (!opts.silent) {
      console.log(`API server listening on port ${port}`);
    }
  });

  return _server;
}

function stop() {
  if (_wss) {
    for (const client of _wsClients) {
      try { client.close(); } catch {}
    }
    _wsClients.clear();
    _wss.close();
    _wss = null;
  }
  if (_server) {
    _server.close();
    _server = null;
  }
}

function getServer() {
  return _server;
}

module.exports = {
  start,
  stop,
  getServer,
  broadcast,
  routes,
  matchRoute,
  handleRequest,
};
