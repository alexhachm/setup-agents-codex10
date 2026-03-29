# Codebase Insights

## Tech Stack
- Node.js 18+ (coordinator), SQLite WAL (better-sqlite3 v12), Express v4.21, WebSocket (ws v8.18)
- Bash scripts for worker lifecycle, tmux for process orchestration
- No build step — pure JS runtime

## Build & Test
- Test: `cd coordinator && npm test` (node --test tests/*.test.js, 6 test files, ~1332 LOC)
- Start: `mac10 start [project_dir]`
- Setup: `bash setup.sh /path/to/project [num_workers]`
- Dashboard: http://localhost:3100

## Directory Structure
- `coordinator/src/` — Core server (12 modules, ~4960 LOC total)
- `coordinator/bin/mac10` — CLI entry point (692L)
- `coordinator/tests/` — 6 test files (security, state-machine, cli, allocator, watchdog, merger)
- `gui/public/` — Web dashboard (app.js 869L, styles.css 695L, index.html 164L, popout.js 165L)
- `scripts/` — worker-sentinel.sh (46L), launch-agent.sh (22L)
- `.claude/commands/` — Agent loop templates (architect, worker, allocator, master, scan)
- `.claude/agents/` — Specialized agents (code-architect, build-validator, verify-app)
- `.claude/knowledge/` — Shared knowledge base (synced to worktrees before tasks)
- `.worktrees/wt-{1..N}/` — Worker git worktrees
- `templates/` — Template files for project setup

## Domain Map
- **coordinator**: cli-server.js (739L), web-server.js (736L), db.js (482L), watchdog.js (324L), merger.js (317L), index.js (148L), schema.sql (140L), overlay.js (137L), tmux.js (135L), instance-registry.js (122L), allocator.js (51L), hub.js (44L)
- **gui**: gui/public/ — WebSocket dashboard, static HTML/CSS/JS, popout support
- **cli**: coordinator/bin/mac10 (692L)
- **infra**: scripts/, setup.sh (416L), .claude/scripts/
- **agent-config**: .claude/commands/, .claude/agents/, templates/

## DB Schema (7+ tables)
- `requests` — user requests with status workflow (pending→triaging→decomposed→completed)
- `tasks` — decomposed work items with dependencies and assignment tracking
- `workers` — worker state, heartbeat, tmux info, claim tracking
- `mail` — IPC messages (replaces signal files)
- `merge_queue` — PR merge pipeline
- `activity_log` — audit trail
- `config` — coordinator settings
- `changes` — tracked improvements (description, domain, file, function, tooltip, enabled toggle, status)

## Key Patterns
- All state via SQLite — no JSON files for state management
- `mac10` CLI is the only interface — no direct file/DB manipulation
- Worker commands expect `worker_id` as string; allocator commands expect number
- Allocator runs every 2s, notifies Master-3 agent when tasks+workers available
- Watchdog runs every 10s, escalates: warn(60s)→nudge(90s)→triage(120s)→terminate(180s)
- Merger triggered on task completion + periodic 5s checks, dedup on PR URL
- Merger checks actual GitHub PR state before marking conflict (worktree branch deletion fix)
- Knowledge files synced from project root to worktrees before each task
- Sentinel uses `-p` (print mode) to ensure Claude exits after processing
- Coordinator requires Node v22 via nvm (better-sqlite3 compatibility)
- Changes tab: GUI panel with toggleable items, tooltips, domain filter, pending_user_action badges
- CLI commands: `mac10 log-change` and `mac10 list-changes` for tracking improvements
- Multi-instance support via instance-registry.js and hub.js
- Command schema validation in cli-server.js (COMMAND_SCHEMAS)

## Entry Points
- `coordinator/src/index.js` — main coordinator (inits db, cli-server, allocator, watchdog, merger, web-server)
- `coordinator/bin/mac10` — CLI client (sends JSON over Unix socket or TCP bridge)
- `gui/public/app.js` — dashboard frontend (WebSocket, multi-tab)
- `scripts/worker-sentinel.sh` — worker lifecycle loop in tmux

## Coupling Hotspots
- `architect-loop.md` + `allocate-loop.md` + `setup.sh` (change together 9x)
- `gui/public/app.js` + `styles.css` + `index.html` (7-9x)
- `scripts/worker-sentinel.sh` + `coordinator/src/index.js` (5x)

## Large Files (>300L)
- gui/public/app.js (869L)
- coordinator/src/cli-server.js (739L)
- coordinator/src/web-server.js (736L)
- gui/public/styles.css (695L)
- coordinator/bin/mac10 (692L)
- coordinator/tests/security.test.js (543L)
- coordinator/src/db.js (482L)
- setup.sh (416L)
- coordinator/src/watchdog.js (324L)
- coordinator/src/merger.js (317L)

Last scanned: 2026-03-07
