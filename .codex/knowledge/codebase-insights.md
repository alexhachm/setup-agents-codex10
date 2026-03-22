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
- Test suite at 536+ tests (MAX_REASSIGNMENTS cap test added PR #292)
- Ownership validation added to complete-task (PR #286), start-task (PR #287), fail-task (PR #289) handlers
- Watchdog output freshness guard fixed (PR #288): hash seeded at Level 3
- Watchdog conflict merge auto-retry added (PR #293): Case 3 now retries up to 3 times via activity_log tracking
- String() wrapper bug in watchdog handleDeath fixed (commit b879754): INTEGER/TEXT type mismatch prevented MAX_REASSIGNMENTS cap from firing
- Research pipeline verified working end-to-end (PR #54): thinking mode, 11.6K char response
- App.js pollInstances resource leak fixed (PR #291): disconnectTab + switchTab
- Merger functional_conflict recovery already applied (commit 5a1de9c)
- Dependency promotion bug: tasks with string depends_on IDs may not auto-promote
- Idle-loop staleness gate can still force a full reset when change breadth spans >=50% of domains, even with zero pending requests.

Last scanned: 2026-03-21
