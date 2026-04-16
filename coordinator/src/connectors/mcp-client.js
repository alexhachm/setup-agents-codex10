'use strict';

/**
 * MCP (Model Context Protocol) Client — connect to MCP servers, discover tools, call tools.
 * Based on the MCP specification for tool interoperability.
 * Gateway + registry pattern for enterprise scalability.
 */

const { spawn } = require('child_process');

const PROTOCOL_VERSION = '2024-11-05';

class MCPClient {
  constructor(name, opts = {}) {
    this.name = name;
    this.command = opts.command || null;
    this.args = opts.args || [];
    this.env = opts.env || {};
    this.url = opts.url || null;
    this.transport = opts.transport || 'stdio'; // stdio or sse
    this.tools = [];
    this.resources = [];
    this.connected = false;
    this._process = null;
    this._pendingRequests = new Map();
    this._requestId = 0;
    this._buffer = '';
  }

  async connect() {
    if (this.transport === 'stdio') {
      return this._connectStdio();
    }
    throw new Error(`Transport ${this.transport} not yet implemented`);
  }

  _connectStdio() {
    return new Promise((resolve, reject) => {
      if (!this.command) {
        reject(new Error('No command specified for stdio transport'));
        return;
      }

      this._process = spawn(this.command, this.args, {
        env: { ...process.env, ...this.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this._process.stdout.on('data', (data) => {
        this._buffer += data.toString();
        this._processBuffer();
      });

      this._process.on('error', (err) => {
        this.connected = false;
        reject(err);
      });

      this._process.on('close', () => {
        this.connected = false;
      });

      // Send initialize request
      this._sendRequest('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        clientInfo: { name: 'mac10-coordinator', version: '1.0.0' },
      }).then((result) => {
        this.connected = true;
        // Send initialized notification
        this._sendNotification('notifications/initialized', {});
        resolve(result);
      }).catch(reject);
    });
  }

  _processBuffer() {
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && this._pendingRequests.has(msg.id)) {
          const { resolve, reject } = this._pendingRequests.get(msg.id);
          this._pendingRequests.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || 'MCP error'));
          else resolve(msg.result);
        }
      } catch {
        // Not JSON — ignore
      }
    }
  }

  _sendRequest(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this._requestId;
      const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this._pendingRequests.set(id, { resolve, reject });

      if (this._process && this._process.stdin.writable) {
        this._process.stdin.write(message);
      } else {
        reject(new Error('MCP process not available'));
      }

      setTimeout(() => {
        if (this._pendingRequests.has(id)) {
          this._pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  _sendNotification(method, params = {}) {
    const message = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    if (this._process && this._process.stdin.writable) {
      this._process.stdin.write(message);
    }
  }

  async listTools() {
    const result = await this._sendRequest('tools/list', {});
    this.tools = result.tools || [];
    return this.tools;
  }

  async callTool(name, args = {}) {
    return this._sendRequest('tools/call', { name, arguments: args });
  }

  async listResources() {
    const result = await this._sendRequest('resources/list', {});
    this.resources = result.resources || [];
    return this.resources;
  }

  async readResource(uri) {
    return this._sendRequest('resources/read', { uri });
  }

  disconnect() {
    if (this._process) {
      this._process.kill();
      this._process = null;
    }
    this.connected = false;
    this.tools = [];
    this.resources = [];
    this._pendingRequests.clear();
  }

  getStatus() {
    return {
      name: this.name,
      transport: this.transport,
      connected: this.connected,
      toolCount: this.tools.length,
      resourceCount: this.resources.length,
    };
  }
}

// MCP server registry
const _servers = new Map();

function registerServer(name, opts) {
  const client = new MCPClient(name, opts);
  _servers.set(name, client);
  return client;
}

function getServer(name) {
  return _servers.get(name) || null;
}

function listServers() {
  return Array.from(_servers.values()).map(s => s.getStatus());
}

function disconnectAll() {
  for (const server of _servers.values()) {
    server.disconnect();
  }
}

module.exports = {
  PROTOCOL_VERSION,
  MCPClient,
  registerServer,
  getServer,
  listServers,
  disconnectAll,
};
