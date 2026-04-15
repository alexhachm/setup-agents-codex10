
### 2026-03-31 — stale integration gate condition
`recoverStaleIntegrations` in watchdog.js uses `checkRequestCompletion()` to guard completion when all merges are merged. The gate should use `!all_done || completed === 0` (not `failed > 0`) so requests with failed retry tasks still complete when at least one task succeeded and all tasks are terminal. The `all_done` flag is true when every task is in a terminal state (completed or failed).

## Legacy Domain Knowledge

The previous GUI/web-server startup notes are obsolete. The active coordinator path is headless: `index.js` starts the CLI server, allocator, watchdog, and merger.
