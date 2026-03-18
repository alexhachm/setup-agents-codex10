# Codebase Insights

## Tech Stack
- Runtime: Node.js (CommonJS, node >= 18)
- Dependencies: express, ws, better-sqlite3
- Persistence: SQLite under .codex/state/codex10.db (WAL mode, foreign keys)
- No TypeScript, no bundler — interpreted JS throughout

## Build & Test
- Test: `cd coordinator && npm test` (node --test tests/*.test.js)
- No build script exists — validation must use `npm test`
- No lint script configured

## Directory Structure
- `coordinator/src/` — orchestration core (13 JS files, ~6.5K LOC total)
- `coordinator/tests/` — node:test suite (5 test files, ~1.5K LOC)
- `coordinator/bin/mac10` — CLI entrypoint
- `gui/public/` — vanilla JS/HTML/CSS dashboard (5 files)
- `scripts/` — launcher, sentinel, locking helpers (bash)
- `.codex/scripts/` — codex10 wrapper, sentinels, research scripts
- `.codex/knowledge/` — curated knowledge files + domain READMEs
- `templates/` — seed role docs, command prompts, knowledge

## Domain Map
- **coordinator-core**: src/index.js (286), src/db.js (962), src/schema.sql (189)
- **coordinator-routing**: src/cli-server.js (2257), src/allocator.js (65), src/merger.js (413), src/watchdog.js (621)
- **coordinator-surface**: src/web-server.js (1009), src/hub.js (46), bin/mac10
- **coordinator-runtime**: src/tmux.js (153), src/instance-registry.js (149), src/overlay.js (171), src/recovery.js (20)
- **dashboard-ui**: gui/public/index.html, app.js, popout.html, popout.js, styles.css
- **orchestration-scripts**: .codex/scripts/, scripts/

## Key Patterns
- DB-first state machine: all entity state (requests, tasks, workers, loops, mail, merges) persisted via db.js
- Socket command bus: CLI sends structured commands to cli-server.js over Unix socket / TCP / pipe fallback
- Worktree isolation: each worker gets its own git worktree under .worktrees/wt-N
- Mail-based IPC: replaces all signal files; recipients are architect/allocator/worker-N
- Security: URL/branch/domain/path sanitization + injection tests in cli-server, merger, overlay

## Coupling Hotspots
- cli-server.js (2257 LOC) — highest churn, 40+ command cases, most coupling
- db.js (962 LOC) — everything depends on it
- watchdog.js (621 LOC) — death/recovery/stale-claim/loop monitoring
- web-server.js (1009 LOC) — dashboard API + agent launch

## Large Files
- coordinator/src/cli-server.js: 2257 lines
- coordinator/src/web-server.js: 1009 lines
- coordinator/src/db.js: 962 lines
- coordinator/src/watchdog.js: 621 lines
- coordinator/tests/security.test.js: 606 lines

## Active Session Notes
- All pending requests triaged (0 remaining) — 28 tasks created across 2 sessions
- Ready buffer: 20+ tasks queued for workers
- Provider-switching cluster: 4 related requests partially decomposed, umbrella (req-ee319572) needs further work
- Key dependency chains: merger.js tasks (#103→#105→#106), db.js tasks (#100→#104), sentinel tasks (#93→#95)
- Merge queue has legacy failures from old "npm run build" validation
- gh CLI not available in this environment (no PR creation via gh)

Last scanned: 2026-03-18
