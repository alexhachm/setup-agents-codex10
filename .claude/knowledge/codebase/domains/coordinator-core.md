
### 2026-03-31 — stale integration gate condition
`recoverStaleIntegrations` in watchdog.js uses `checkRequestCompletion()` to guard completion when all merges are merged. The gate should use `!all_done || completed === 0` (not `failed > 0`) so requests with failed retry tasks still complete when at least one task succeeded and all tasks are terminal. The `all_done` flag is true when every task is in a terminal state (completed or failed).

## Legacy Domain Knowledge

## Session: 2026-03-18

### web-server.start() API change
- `start()` now returns a `Promise<server>` instead of a synchronous `server`
- On successful bind: resolves with the server object
- On failed bind (EADDRINUSE, etc.): rejects with the raw error; cleans up intervals, wss, server internally
- **All callers must `await webServer.start()`** — any test using the old `server.once('listening', resolve)` pattern needs updating

### index.js startup pattern
- `webServerBound` flag guards `instanceRegistry.register()` and `instanceRegistry.deregister()`
- If port bind fails: coordinator continues without GUI; no registry entry created
