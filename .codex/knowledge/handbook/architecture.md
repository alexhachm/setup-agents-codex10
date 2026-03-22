---
doc_kind: reference
scope: project
owner: handbook
last_verified: 2026-03-16
rot_risk: low
related_paths:
  - coordinator/src/
  - gui/public/
  - .codex/scripts/
---

# Architecture

## Executive Summary

- Multi-agent coding system: Architect (Master-2) decomposes requests, Allocator (Master-3) routes tasks to Workers, Interface (Master-1) faces the user.
- Coordinator backend: Node.js + Express + better-sqlite3. SQLite is the single source of truth for all state (requests, tasks, workers, loops, mail, merges).
- Thin daemon loops: allocator, watchdog, merger run periodic ticks against the same DB.
- CLI transport: `coordinator/bin/mac10` sends structured commands to `cli-server.js` over Unix socket / TCP / pipe fallback.
- Frontend: vanilla JS/HTML/CSS dashboard served from `gui/public/`, websocket-driven with REST bootstrap.

## Tech Stack

- Runtime: Node.js (CommonJS, `node >= 18`)
- Dependencies: `express`, `ws`, `better-sqlite3`
- Persistence: SQLite under `.codex/state/codex10.db`
- Build: none (interpreted JS). Tests: `cd coordinator && npm test`

## Directory Structure

- `.codex/` — runtime docs, knowledge, scripts, state, agent definitions
- `coordinator/src/` — orchestration core (cli-server, web-server, db, allocator, merger, watchdog, tmux, recovery)
- `coordinator/tests/` — node test suite
- `coordinator/bin/mac10` — CLI entrypoint
- `gui/public/` — dashboard + popout UI
- `scripts/` — launcher, sentinel, locking helpers
- `templates/` — role docs, command prompts, seed knowledge

## Domain Map

| Domain | Key files |
|---|---|
| coordinator-core | `src/index.js`, `src/db.js`, `src/schema.sql` |
| coordinator-routing | `src/cli-server.js`, `src/allocator.js`, `src/merger.js`, `src/watchdog.js` |
| coordinator-surface | `src/web-server.js`, `src/hub.js`, `bin/mac10` |
| coordinator-runtime | `src/tmux.js`, `src/instance-registry.js`, `src/overlay.js`, `src/recovery.js` |
| dashboard-ui | `gui/public/index.html`, `gui/public/app.js`, `gui/public/popout.html`, `gui/public/popout.js` |
| orchestration-scripts | `.codex/scripts/`, `scripts/` |

## Key Patterns

- **DB-first state machine:** all entity state (requests, tasks, workers, loops) persisted and queried via `db.js`.
- **Socket command bus:** CLI sends structured commands; `cli-server.js` handles routing and validation.
- **Security posture:** URL/branch/domain/path sanitization and injection tests in `cli-server.js`, `merger.js`, `overlay.js`.
- **Worktree isolation:** each worker gets its own git worktree under `.worktrees/wt-N`.

## Coupling Hotspots

- `cli-server.js` (~2074 LOC) — highest churn, most coupling
- `db.js` (~962 LOC) — everything depends on it
- `watchdog.js` (~585 LOC) — death/recovery logic
- `web-server.js` (~1009 LOC) — dashboard API
- `merger.js` (~430 LOC) — merge pipeline

## Invariants

- Request and task queues are independent: `pending_count=0` for requests does not mean `ready_count=0` for tasks.
- Staleness gate values can cross reset thresholds even in low-commit windows due to domain-breadth calculation.
- `.codex/state/codebase-map.json` must exist for staleness checks; if missing, all checks default to "stale."

## Changelog (last 5)

- 2026-03-16: Promoted from codebase-insights.md to living handbook doc
