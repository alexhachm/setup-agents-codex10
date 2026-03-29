
## Session: 2026-03-18

### web-server.start() API change
- `start()` now returns a `Promise<server>` instead of a synchronous `server`
- On successful bind: resolves with the server object
- On failed bind (EADDRINUSE, etc.): rejects with the raw error; cleans up intervals, wss, server internally
- **All callers must `await webServer.start()`** — any test using the old `server.once('listening', resolve)` pattern needs updating

### index.js startup pattern
- `webServerBound` flag guards `instanceRegistry.register()` and `instanceRegistry.deregister()`
- If port bind fails: coordinator continues without GUI; no registry entry created
