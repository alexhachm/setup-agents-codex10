# Codebase Insights

## Tech Stack
- Runtime: Node.js (CommonJS modules, `node >= 18`)
- Coordinator backend: `express`, `ws`, `better-sqlite3`
- Persistence: SQLite under `.codex/state/`
- Frontend: vanilla JS/HTML/CSS served from `gui/public/`

## Build & Test
- Install deps: `cd coordinator && npm install`
- Run coordinator: `cd coordinator && npm start`
- Run tests: `cd coordinator && npm test`
- Build: none defined (interpreted JS)
- Lint: none defined in `coordinator/package.json`

## Directory Structure
- `.codex/` — runtime docs, knowledge, scripts, logs, signals, state
- `coordinator/src/` — orchestration core (CLI server, web server, DB, allocator, merger, watchdog)
- `coordinator/tests/` — node test suite for state machine, CLI, merger, security, watchdog
- `coordinator/bin/mac10` — CLI entrypoint to coordinator transport
- `gui/public/` — dashboard + popout UI assets
- `scripts/` — launcher/sentinel/locking helper scripts
- `templates/` — role docs, command prompts, seed knowledge files

## Domain Map
- coordinator-core: `coordinator/src/index.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`
- coordinator-routing: `coordinator/src/cli-server.js`, `coordinator/src/allocator.js`, `coordinator/src/merger.js`, `coordinator/src/watchdog.js`
- coordinator-surface: `coordinator/src/web-server.js`, `coordinator/src/hub.js`, `coordinator/bin/mac10`
- coordinator-runtime: `coordinator/src/tmux.js`, `coordinator/src/instance-registry.js`, `coordinator/src/overlay.js`, `coordinator/src/recovery.js`
- dashboard-ui: `gui/public/index.html`, `gui/public/app.js`, `gui/public/popout.html`, `gui/public/popout.js`, `gui/public/styles.css`
- orchestration-scripts: `.codex/scripts/`, `scripts/`

## Key Patterns
- DB-first state machine: requests/tasks/workers/loops are persisted and queried via `coordinator/src/db.js`.
- Thin daemon loops: allocator/watchdog/merger run periodic `tick` loops and log to the same DB.
- Socket command bus: CLI (`coordinator/bin/mac10`) sends structured commands to `cli-server.js` over Unix socket/TCP/pipe fallback.
- Security posture: URL/branch/domain/path sanitization and injection tests are concentrated in `cli-server.js`, `merger.js`, and `overlay.js`.
- UI is websocket-driven with REST bootstrap (`/api/status`) and reconnection backoff.

## Entry Points
- `coordinator/src/index.js` — main coordinator process
- `coordinator/src/hub.js` — hub/dashboard instance bootstrap
- `coordinator/bin/mac10` — CLI command client
- `gui/public/index.html` + `gui/public/app.js` — browser dashboard

## Coupling Hotspots
- `coordinator/src/cli-server.js` (highest churn surface in recent history)
- `coordinator/src/db.js`
- `coordinator/src/watchdog.js`
- `coordinator/src/web-server.js`
- `coordinator/src/merger.js`
- `coordinator/src/schema.sql`

## Large Files (potential split candidates)
- `coordinator/src/cli-server.js` (~2074 LOC)
- `coordinator/src/web-server.js` (~1009 LOC)
- `coordinator/src/db.js` (~962 LOC)
- `gui/public/app.js` (~964 LOC)
- `coordinator/src/watchdog.js` (~585 LOC)
- `coordinator/src/merger.js` (~430 LOC)

Last scanned: 2026-03-12T20:20:27Z
