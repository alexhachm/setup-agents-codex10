# Codebase Insights

## Tech Stack
- Runtime: Node.js (CommonJS, node >= 18)
- Dependencies: express, ws, better-sqlite3
- Persistence: SQLite under .codex/state/codex10.db (WAL mode, foreign keys)
- No TypeScript, no bundler — interpreted JS throughout
- Dual-provider support: Claude (claude) or Codex (codex) via MAC10_AGENT_PROVIDER

## Build & Test
- Test: `cd coordinator && npm test` (node --test tests/*.test.js)
- No build script — validation must use `npm test`
- No lint script configured

## Directory Structure
- `coordinator/src/` — orchestration core (14 JS files, ~8.3K LOC)
- `coordinator/tests/` — node:test suite (6 test files, ~1.5K LOC)
- `coordinator/bin/mac10` — CLI entrypoint (1624 lines)
- `gui/public/` — vanilla JS/HTML/CSS dashboard (5 files)
- `scripts/` — launcher, sentinel, provider-utils, locking helpers (bash)
- `.codex/scripts/` — codex10 wrapper, sentinels, research pipeline scripts
- `.codex/knowledge/` — curated knowledge files + domain READMEs
- `templates/` — seed role docs, command prompts, knowledge

## Domain Map
- **coordinator-core**: src/index.js (313), src/db.js (965), src/schema.sql (189)
- **coordinator-routing**: src/cli-server.js (2390), src/allocator.js (65), src/merger.js (545), src/watchdog.js (621)
- **coordinator-surface**: src/web-server.js (1009), src/hub.js (46), bin/mac10
- **coordinator-runtime**: src/tmux.js (153), src/instance-registry.js (149), src/overlay.js (171), src/recovery.js (23)
- **coordinator-research**: src/research-queue.js (296)
- **dashboard-ui**: gui/public/index.html, app.js, popout.html, popout.js, styles.css
- **orchestration-scripts**: .codex/scripts/, scripts/
- **research-pipeline**: .codex/scripts/chatgpt-driver.py (2767), compose-research-prompt.py, ingest-research.py, research-gaps.sh, research-sentinel.sh

## Key Patterns
- DB-first state machine: all entity state (requests, tasks, workers, loops, mail, merges, research) persisted via db.js
- Socket command bus: CLI sends structured commands to cli-server.js over Unix socket / TCP / pipe fallback
- 55+ CLI command cases in cli-server.js
- Worktree isolation: each worker gets its own git worktree under .worktrees/wt-N
- Mail-based IPC: DB mail table replaces all signal files; recipients are architect/allocator/worker-N
- Security: URL/branch/domain/path sanitization + injection tests in cli-server, merger, overlay
- Model routing: optional model-router.js for budget-aware model selection per task tier
- Research pipeline: ChatGPT-backed external search via Selenium/browser automation

## Coupling Hotspots
- cli-server.js (2390 LOC) — highest churn, 55+ command cases, most coupling
- db.js (965 LOC) — everything depends on it
- watchdog.js (621 LOC) — death/recovery/stale-claim/loop monitoring
- merger.js (545 LOC) — merge pipeline with conflict recovery
- web-server.js (1009 LOC) — dashboard API + agent launch

## Large Files
- coordinator/src/cli-server.js: 2390 lines
- coordinator/src/web-server.js: 1009 lines
- coordinator/src/db.js: 965 lines
- coordinator/src/watchdog.js: 621 lines
- coordinator/src/merger.js: 545 lines
- coordinator/tests/security.test.js: 606 lines
- .codex/scripts/chatgpt-driver.py: 2767 lines

## Schema (10 tables)
- requests: id(TEXT PK), description, tier, status, loop_id
- tasks: id(INT PK), request_id(FK), subject, description, domain, files, priority, tier, depends_on, assigned_to(FK), status, validation, routing_class, routed_model
- workers: id(INT PK 1-8), status, domain, worktree_path, branch, claimed_by, current_task_id(FK)
- mail: id, recipient, type, payload(JSON), consumed
- merge_queue: id, request_id(FK), task_id(FK), pr_url, branch, status, priority
- activity_log: id, actor, action, details(JSON)
- config: key/value pairs
- loops: id, prompt, status, iteration_count, last_heartbeat
- changes: id, description, domain, file_path, enabled, status
- presets: id, name, project_dir, github_repo, num_workers

Last scanned: 2026-03-23
