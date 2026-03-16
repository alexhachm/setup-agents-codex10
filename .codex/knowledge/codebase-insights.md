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

## Session Learnings (2026-03-13)
- Architect inbox can contain `task_completed` signals while request queue has zero `[pending]` entries; triage should remain request-driven.
- Backlog pressure for requests was low (`pending_count=0`) while urgent remediation tasks still existed in ready-task queue, confirming request triage and task dispatch are decoupled flows.
- Staleness baseline file `.codex/state/codebase-map.json` was missing, so staleness checks defaulted to repository-wide change breadth and triggered reset thresholds immediately.
- For Tier 2 flows, creating and assigning a task did not automatically clear request `[pending]` state in status output; issuing explicit `./.codex/scripts/codex10 triage <request_id> 2 "<reason>"` immediately aligned request state to `[decomposed]`.
- Fresh reset-gate run measured `commits_since=69` and `changed_file_count=167`, which satisfies full-reset criteria; `/scan-codebase` must be re-run before additional decomposition.
- Scan pass refreshed baseline with `pending_count=0` and `ready_count=4`, reinforcing that request backlog and ready-task backlog must be tracked independently.
- `./.codex/scripts/codex10 add-worker` can fail when stale `.worktrees/wt-N` directories already exist; failed provisioning does not auto-repair registry state.
- Rapid allocator reassignment can race Tier 2 worker claims after a `completed_task` reset, so task creation may need to proceed as queued-ready when no idle worker remains.

Last scanned baseline: 2026-03-13T11:48:18Z (`.codex/state/codebase-map.json` rebuilt).
