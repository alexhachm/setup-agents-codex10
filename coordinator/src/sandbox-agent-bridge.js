'use strict';

/**
 * Sandbox-Agent Bridge
 *
 * Connects the coordinator to sandbox-agent HTTP/SSE API instances running
 * inside worker containers or microVMs.  Provides an agent-agnostic interface
 * for starting tasks, streaming events, and auto-resolving permission prompts.
 *
 * Each worker exposes sandbox-agent on port 2468.  The bridge talks to it via
 * plain HTTP — no SDK dependency at runtime (sandbox-agent is installed inside
 * the worker image, not in the coordinator).
 */

const http = require('http');
const db = require('./db');

const SANDBOX_AGENT_PORT = parseInt(process.env.SANDBOX_AGENT_PORT, 10) || 2468;
const DEFAULT_AGENT = 'claude-code';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function request(host, port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: host,
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Bridge API
// ---------------------------------------------------------------------------

/**
 * Connect to a worker's sandbox-agent instance.
 * @param {number} workerId
 * @param {string} host  — container/VM hostname (e.g. "worker-1" in Docker network)
 * @param {number} [port]
 * @returns {{ host: string, port: number, workerId: number }}
 */
function connectToWorker(workerId, host, port = SANDBOX_AGENT_PORT) {
  return { host, port, workerId };
}

/**
 * Start a task on a worker via sandbox-agent.
 * Creates a new session, sends the task prompt, and returns the session ID.
 *
 * @param {object} conn — connection from connectToWorker
 * @param {number} taskId
 * @param {string} prompt — the full task prompt
 * @param {string} [agent] — agent binary to use (default: "claude-code")
 * @returns {Promise<{ sessionId: string }>}
 */
async function startTask(conn, taskId, prompt, agent = DEFAULT_AGENT) {
  const { status, data } = await request(conn.host, conn.port, 'POST', '/sessions', {
    agent,
    prompt,
    metadata: { taskId, workerId: conn.workerId },
  });
  if (status >= 400) {
    throw new Error(`sandbox-agent startTask failed (${status}): ${JSON.stringify(data)}`);
  }
  const sessionId = data.id || data.sessionId || data.session_id;
  db.log('coordinator', 'sandbox_agent_session_created', {
    worker_id: conn.workerId,
    task_id: taskId,
    session_id: sessionId,
    agent,
  });
  return { sessionId };
}

/**
 * Stream task events from sandbox-agent via SSE.
 *
 * @param {object} conn
 * @param {string} sessionId
 * @param {function} callback — called with each event: { type, data }
 * @returns {function} cancel — call to stop streaming
 */
function streamTaskEvents(conn, sessionId, callback) {
  const req = http.get({
    hostname: conn.host,
    port: conn.port,
    path: `/sessions/${sessionId}/events`,
    headers: { Accept: 'text/event-stream' },
    timeout: 0,
  }, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      let currentEvent = {};
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent.type = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          try {
            currentEvent.data = JSON.parse(line.slice(5).trim());
          } catch {
            currentEvent.data = line.slice(5).trim();
          }
        } else if (line === '' && currentEvent.type) {
          callback(currentEvent);
          currentEvent = {};
        }
      }
    });
    res.on('error', (err) => {
      callback({ type: 'error', data: { message: err.message } });
    });
  });
  req.on('error', (err) => {
    callback({ type: 'error', data: { message: err.message } });
  });
  return () => { req.destroy(); };
}

/**
 * Auto-resolve a permission question from sandbox-agent.
 *
 * @param {object} conn
 * @param {string} sessionId
 * @param {string} questionId
 * @param {string} answer — typically "yes" or the approved action
 * @returns {Promise<void>}
 */
async function resolvePermission(conn, sessionId, questionId, answer) {
  const { status, data } = await request(
    conn.host, conn.port,
    'POST', `/sessions/${sessionId}/questions/${questionId}`,
    { answer }
  );
  if (status >= 400) {
    db.log('coordinator', 'sandbox_agent_permission_error', {
      worker_id: conn.workerId,
      session_id: sessionId,
      question_id: questionId,
      status,
      error: JSON.stringify(data),
    });
  }
}

/**
 * Post a message to an existing session.
 *
 * @param {object} conn
 * @param {string} sessionId
 * @param {string} message
 * @returns {Promise<void>}
 */
async function postMessage(conn, sessionId, message) {
  await request(conn.host, conn.port, 'POST', `/sessions/${sessionId}/messages`, {
    content: message,
  });
}

module.exports = {
  connectToWorker,
  startTask,
  streamTaskEvents,
  resolvePermission,
  postMessage,
  SANDBOX_AGENT_PORT,
};
