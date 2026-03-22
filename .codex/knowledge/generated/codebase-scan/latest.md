# Codebase Insights

## Tech Stack
- Runtime: Node.js (CommonJS, `node >= 18`)
- Coordinator backend: `express`, `ws`, `better-sqlite3`
- Persistence: SQLite in `.codex/state/codex10.db`
- Frontend: vanilla JS/HTML/CSS in `gui/public/`

## Build & Test
- Start: `cd coordinator && npm start`
- Test: `cd coordinator && npm test`
- Build: none defined
- Lint: none defined

## Directory Structure
- `.codex/` — runtime prompts/docs/knowledge/scripts/state
- `coordinator/src/` — coordinator runtime (CLI server, web API, DB, allocator, merger, watchdog)
- `coordinator/tests/` — node:test suite (allocator, cli, merger, state-machine, security, watchdog)
- `coordinator/bin/mac10` — CLI transport client
- `gui/public/` — dashboard + popout UI
- `scripts/` — bootstrap + sentinel utilities
- `templates/` — canonical docs/prompts copied into runtime paths

## Domain Map
- coordinator-core: `coordinator/src/index.js`, `coordinator/src/db.js`, `coordinator/src/schema.sql`
- coordinator-routing: `coordinator/src/cli-server.js`, `coordinator/src/allocator.js`, `coordinator/src/merger.js`, `coordinator/src/watchdog.js`
- coordinator-surface: `coordinator/src/web-server.js`, `coordinator/src/hub.js`, `coordinator/bin/mac10`
- coordinator-runtime: `coordinator/src/tmux.js`, `coordinator/src/instance-registry.js`, `coordinator/src/overlay.js`, `coordinator/src/recovery.js`
- coordinator-research: `coordinator/src/research-queue.js`
- dashboard-ui: `gui/public/index.html`, `gui/public/app.js`, `gui/public/popout.html`, `gui/public/popout.js`, `gui/public/styles.css`
- orchestration-scripts: `.codex/scripts/`, `scripts/`
- coordinator-tests: `coordinator/tests/`

## Key Patterns
- DB-first orchestration: requests/tasks/workers/loops/mail/merges live in SQLite via `db.js`.
- Command bus: `coordinator/bin/mac10` sends JSON commands into `cli-server.js` over socket/TCP fallback.
- Daemon ticks: allocator/watchdog/merger are periodic loops over shared DB state.
- Worktree isolation: workers execute in `.worktrees/wt-N` with overlayed task context.
- Dashboard transport: REST bootstrap (`/api/status`) plus websocket state streaming.

## Entry Points
- `coordinator/src/index.js` (main coordinator)
- `coordinator/src/hub.js` (hub process)
- `coordinator/bin/mac10` (CLI)
- `gui/public/index.html` + `gui/public/app.js` (dashboard)

## Coupling Hotspots
- `coordinator/src/cli-server.js`
- `coordinator/src/db.js`
- `coordinator/src/watchdog.js`
- `coordinator/src/web-server.js`
- `coordinator/src/merger.js`

## Large Files (potential split candidates)
- `coordinator/src/cli-server.js` (~2390 LOC)
- `coordinator/src/web-server.js` (~1009 LOC)
- `coordinator/src/db.js` (~965 LOC)
- `gui/public/app.js` (~964 LOC)
- `coordinator/src/watchdog.js` (~621 LOC)
- `scripts/start-common.sh` (~831 LOC)

Last scanned baseline: 2026-03-21T01:16:57Z
