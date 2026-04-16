'use strict';

/**
 * Egress Proxy Minimal — passthrough logging proxy.
 * Logs all outbound HTTP with destination, size, timestamp.
 * Must exist BEFORE browser engine runs.
 */

const http = require('http');
const https = require('https');

const _log = [];
const MAX_LOG_ENTRIES = 10000;

let _server = null;

function logRequest(entry) {
  _log.push(entry);
  if (_log.length > MAX_LOG_ENTRIES) {
    _log.splice(0, _log.length - MAX_LOG_ENTRIES);
  }
}

function createProxy(opts = {}) {
  const port = opts.port || 0;
  const onRequest = opts.onRequest || (() => {});

  const server = http.createServer((req, res) => {
    const entry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      destination: req.headers.host || 'unknown',
      headers: { ...req.headers },
      requestSize: 0,
      responseSize: 0,
      statusCode: null,
      duration_ms: null,
    };
    const startTime = Date.now();

    let requestBody = '';
    req.on('data', chunk => {
      requestBody += chunk;
      entry.requestSize += chunk.length;
    });

    req.on('end', () => {
      const targetUrl = new URL(req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`);
      const isHttps = targetUrl.protocol === 'https:';
      const transport = isHttps ? https : http;

      const proxyReq = transport.request({
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: { ...req.headers, host: targetUrl.hostname },
      }, (proxyRes) => {
        entry.statusCode = proxyRes.statusCode;
        res.writeHead(proxyRes.statusCode, proxyRes.headers);

        proxyRes.on('data', chunk => {
          entry.responseSize += chunk.length;
          res.write(chunk);
        });

        proxyRes.on('end', () => {
          entry.duration_ms = Date.now() - startTime;
          logRequest(entry);
          onRequest(entry);
          res.end();
        });
      });

      proxyReq.on('error', (err) => {
        entry.duration_ms = Date.now() - startTime;
        entry.error = err.message;
        logRequest(entry);
        onRequest(entry);
        res.writeHead(502);
        res.end(`Proxy error: ${err.message}`);
      });

      if (requestBody) proxyReq.write(requestBody);
      proxyReq.end();
    });
  });

  return server;
}

function start(opts = {}) {
  if (_server) return _server;
  _server = createProxy(opts);
  const port = opts.port || 0;
  _server.listen(port);
  return _server;
}

function stop() {
  if (_server) {
    _server.close();
    _server = null;
  }
}

function getLog(limit) {
  if (limit) return _log.slice(-limit);
  return [..._log];
}

function clearLog() {
  _log.length = 0;
}

function getStats() {
  return {
    total_requests: _log.length,
    total_request_bytes: _log.reduce((sum, e) => sum + (e.requestSize || 0), 0),
    total_response_bytes: _log.reduce((sum, e) => sum + (e.responseSize || 0), 0),
    unique_destinations: [...new Set(_log.map(e => e.destination))],
    error_count: _log.filter(e => e.error).length,
  };
}

module.exports = {
  createProxy,
  start,
  stop,
  getLog,
  clearLog,
  getStats,
  MAX_LOG_ENTRIES,
};
