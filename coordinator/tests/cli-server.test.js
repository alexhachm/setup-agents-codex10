'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');

const db = require('../src/db');
const cliServer = require('../src/cli-server');

let tmpDir;
let socketPath;

function waitForCliServerReady() {
  return new Promise((resolve) => {
    const check = () => {
      const conn = net.createConnection(socketPath, () => {
        conn.end();
        resolve();
      });
      conn.on('error', () => setTimeout(check, 50));
    };
    setTimeout(check, 50);
  });
}

function sendCommand(command, args) {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath, () => {
      conn.write(JSON.stringify({ command, args }) + '\n');
    });
    let data = '';
    conn.on('data', (chunk) => {
      data += chunk.toString();
      const idx = data.indexOf('\n');
      if (idx >= 0) {
        resolve(JSON.parse(data.slice(0, idx)));
        conn.end();
      }
    });
    conn.on('error', reject);
    conn.setTimeout(5000, () => { conn.end(); reject(new Error('Timeout')); });
  });
}

function getTriageLogDetails(requestId) {
  return db.getLog(500, 'architect')
    .filter((entry) => entry.action === 'triage')
    .map((entry) => {
      try {
        return JSON.parse(entry.details || '{}');
      } catch {
        return {};
      }
    })
    .filter((details) => details.request_id === requestId);
}

describe('CLI server triage behavior', () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac10-cli-server-'));
    fs.mkdirSync(path.join(tmpDir, '.claude', 'state'), { recursive: true });
    db.init(tmpDir);
    socketPath = cliServer.getSocketPath(tmpDir);
    cliServer.start(tmpDir, {
      onTaskCompleted: () => {},
      onLoopCreated: () => {},
    });
    await waitForCliServerReady();
  });

  afterEach(() => {
    cliServer.stop();
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should reject triage for unknown request IDs and avoid triage logging', async () => {
    const missingRequestId = 'req-missing-triage';

    const result = await sendCommand('triage', {
      request_id: missingRequestId,
      tier: 2,
      reasoning: 'Unknown request should fail',
    });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.message, 'Request not found');
    assert.strictEqual(result.error, 'Request not found');
    assert.strictEqual(db.getRequest(missingRequestId), undefined);
    assert.strictEqual(getTriageLogDetails(missingRequestId).length, 0);
  });

  it('should triage known request IDs and emit a triage audit log', async () => {
    const requestId = db.createRequest('Known request for triage coverage');

    const result = await sendCommand('triage', {
      request_id: requestId,
      tier: 1,
      reasoning: 'Known request should pass',
    });

    assert.strictEqual(result.ok, true);
    const updatedRequest = db.getRequest(requestId);
    assert.strictEqual(updatedRequest.tier, 1);
    assert.strictEqual(updatedRequest.status, 'executing_tier1');

    const triageLogs = getTriageLogDetails(requestId);
    assert.strictEqual(triageLogs.length, 1);
    assert.strictEqual(triageLogs[0].tier, 1);
    assert.strictEqual(triageLogs[0].reasoning, 'Known request should pass');
  });
});
