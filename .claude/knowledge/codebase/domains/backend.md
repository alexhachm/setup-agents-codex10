# Backend Domain Knowledge

## Stack
- Node.js (>=18) with better-sqlite3
- No build step — plain CommonJS modules
- Tests: `node --test tests/*.test.js` (Node.js built-in test runner)

## Key Files
- `coordinator/src/index.js` — Main coordinator startup
- `coordinator/src/cli-server.js` — Unix socket CLI server
- `coordinator/src/db.js` — SQLite database helpers
- `coordinator/src/schema.sql` — Database schema

## Patterns
- All modules use `'use strict'` and CommonJS exports
- DB access via `db.getDb()` (better-sqlite3 instance)
- Schema auto-migration on first use (CREATE TABLE IF NOT EXISTS)

## Notes
- better-sqlite3 native binding may need rebuilding if Node.js version changes
- `gh pr create` must run from main repo dir, not worktree
