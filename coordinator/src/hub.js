#!/usr/bin/env node
'use strict';

// --- GUI disabled (outdated) ---
// Hub dashboard has been disabled. The web server and instance registry
// are no longer started. To re-enable, uncomment the code below.

console.log('Hub dashboard is disabled (outdated). Exiting.');
process.exit(0);

/*
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('./db');
const webServer = require('./web-server');
const instanceRegistry = require('./instance-registry');

const HUB_DIR = path.join(os.homedir(), '.mac10');
const PORT = parseInt(process.env.MAC10_HUB_PORT, 10) || 3100;
const scriptDir = process.env.MAC10_SCRIPT_DIR || path.resolve(__dirname, '..', '..');
const namespace = process.env.MAC10_NAMESPACE || 'hub';

fs.mkdirSync(path.join(HUB_DIR, '.claude', 'state'), { recursive: true });

db.init(HUB_DIR);
console.log(`Hub DB initialized at ${HUB_DIR}`);

webServer.start(HUB_DIR, PORT, scriptDir, {
  browserBridgeEnabled: false,
});
console.log(`Hub dashboard: http://localhost:${PORT}`);

instanceRegistry.register({
  projectDir: HUB_DIR,
  port: PORT,
  pid: process.pid,
  name: '__hub__',
  namespace,
});

function shutdown() {
  console.log('Hub shutting down...');
  instanceRegistry.deregister(PORT);
  webServer.stop();
  db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
*/
