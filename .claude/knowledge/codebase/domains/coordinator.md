# Coordinator Domain
- SQLite-backed state machine
- CLI socket for IPC
- Workers spawned in tmux sessions

## Legacy Domain Knowledge
# Coordinator Domain Knowledge

## Architecture
- **cli-server.js**: TCP/Unix socket server handling all agent CLI commands. Newline-delimited JSON protocol.
- **db.js**: SQLite (better-sqlite3) with WAL mode, column whitelisting, and parameterized queries.

## Key Patterns
- All CLI commands validated via COMMAND_SCHEMAS before reaching handleCommand switch
- Atomic task assignment uses SQLite transactions to prevent double-assign
- TCP bridge on port 31000-31999 for cross-environment access (Git Bash <-> WSL)

## Testing
- Tests in `coordinator/tests/` using Node.js built-in test runner (`node --test`)
- Run with `cd coordinator && npm test`
- Run the current suite instead of relying on historical counts.

## Common Issues
- `gh pr create` fails from worktree dirs — must run from main repo dir
- `mac10 distill` CLI has a type coercion issue (passes number instead of string for worker_id)
- `mac10 log-change` is not exposed in the CLI binary despite being a server command
