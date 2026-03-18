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

## Architecture Insights (from research distillation, 2026-03-18)

### Coordinator-Core Architecture
- Our DB-first state machine matches production needs: durable, replay-safe, auditable
- cli-server.js is correctly the "transport adapter" layer — its high churn is expected
- Security: every IPC/socket handler should validate sender origin; existing sanitization is good but should be extended to all new commands

### Merger Gap (critical)
- Current merger.js merges based on PR CI alone — this misses "merge skew" (two individually-green PRs that break main when combined)
- Production pattern: validate the **speculative integrated commit** (PR + queued PRs applied to latest main), not just PR head
- Merger state machine should have explicit states: `queued → checks_running → checks_passed → ready → merged` plus failure branches (`conflict_detected`, `timed_out`, `needs_human`)
- `runOverlapValidation` calling `npm run build` is the current deadlock root cause; must use script-aware validation

### Worker Isolation (dual-provider patterns)
- Workers must have `CLAUDE_CONFIG_DIR` scoped per worktree (e.g., `.worktrees/wt-N/.claude`) to prevent cross-worker session collisions
- Each subprocess must have explicit `cwd` set at spawn time — Claude session lookup is keyed by encoded `cwd`; mismatch causes fresh session
- Workers should run with minimal explicit env (avoid inheriting broad shell env that may expose secrets to LLM)

### Loop Progress Gating (missing)
- Current watchdog detects stale heartbeats but lacks semantic progress checks
- Production pattern: at iteration 25, require a checkpoint diff summary + net failing tests; stop if no net progress
- Circuit breaker: if iteration count grows while diff stays small (repeated edits), stop early and fail the task

### Checkpointing (two-plane model)
- Provider-native checkpoints (Claude) track file-tool edits only — bash-driven changes are NOT tracked
- VCS checkpoints (git stash/commit per worktree) are the portable rollback mechanism; should be recorded in run ledger
- For any task that enables shell execution, git checkpoint before/after each major operation

Last scanned: 2026-03-18
