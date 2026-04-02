# Codebase Insights

## Tech Stack
- Node.js 22+ (coordinator, better-sqlite3 compat), SQLite WAL (better-sqlite3 v12), Express v4.21, WebSocket (ws v8.18)
- Python 3.12 (research pipeline: chatgpt-driver, ingest-research, compose-research-prompt)
- Bash scripts for worker lifecycle, tmux for process orchestration
- Docker/sandbox support for isolated worker execution (sandbox-agent-bridge)
- Microsandbox (msb) support for hardware-isolated microVM workers
- No build step — pure JS runtime

## Build & Test
- Test: `cd coordinator && npm test` (node --test tests/*.test.js, 19 test files)
- Start: `mac10 start [project_dir]`
- Setup: `bash setup.sh /path/to/project [num_workers]` (max 8 workers, default 4, namespace=codex10)
- Dashboard: disabled (hub.js gutted, web-server.js unused)

## Directory Structure
- `coordinator/src/` — Core server (21 modules)
- `coordinator/bin/mac10` — CLI entry point
- `coordinator/tests/` — 19 test files
- `gui/public/` — Web dashboard (disabled)
- `scripts/` — worker-sentinel.sh, research-sentinel.sh, chatgpt-driver.py, loop-sentinel.sh, provider scripts
- `sandbox/` — Docker-based worker sandboxing (Dockerfile.worker, Sandboxfile, docker-compose)
- `.claude/commands-codex10/` — Agent loop templates (codex10 namespace)
- `.claude/scripts/` — codex10 wrapper, worker-sentinel.sh, launch-worker.sh, signal-wait.sh, state-lock.sh, loop-sentinel.sh
- `.claude/knowledge/` — Shared knowledge base (synced to worktrees before tasks)
- `.worktrees/wt-{1..N}/` — Worker git worktrees
- `templates/` — Template files for project setup

## Domain Map
- **coordinator-core**: index.js (293L), db.js (~4400L), schema.sql (510L+)
- **coordinator-routing**: cli-server.js (~4500L), allocator.js, merger.js (~963L), watchdog.js (~1112L)
- **coordinator-extensions**: overlay.js (358L), knowledge-metadata.js (191L), insight-ingestion.js (279L), sandbox-agent-bridge.js (194L), worker-backend.js (280L), sandbox-manager.js (152L), microvm-manager.js (156L)
- **coordinator-runtime**: tmux.js (160L), instance-registry.js, recovery.js (23L)
- **coordinator-surface**: web-server.js (~2493L, disabled), hub.js (52L, gutted)
- **coordinator-test-files**: greet.js (7L), hello-test.js (7L), test-hello.js (7L) — E2E test artifacts
- **gui**: gui/public/ — disabled
- **cli**: coordinator/bin/mac10
- **infra**: scripts/, setup.sh (752L), .claude/scripts/
- **sandbox**: sandbox/ — Docker worker isolation + microsandbox (Sandboxfile)
- **research**: scripts/chatgpt-driver.py (2795L), scripts/ingest-research.py (267L), scripts/compose-research-prompt.py (328L)
- **agent-config**: .claude/commands-codex10/, .claude/agents/, templates/

## DB Schema (15+ tables)
- `requests` — user requests with status workflow (pending->triaging->decomposed->completed)
- `tasks` — decomposed work items with dependencies, assignment, browser offload, usage metrics
- `workers` — worker state, heartbeat, tmux info, claim tracking
- `mail` — IPC messages (replaces signal files)
- `merge_queue` — PR merge pipeline
- `activity_log` — audit trail
- `config` — coordinator settings
- `changes` — tracked improvements
- `research_intents` / `research_batches` / `research_batch_stages` / `research_intent_fanout` — research queue pipeline
- `browser_sessions` / `browser_research_jobs` / `browser_callback_events` — browser offload
- `project_memory_snapshots` / `project_memory_snapshot_index` — project memory
- `insight_artifacts` / `project_memory_lineage_links` — insight tracking & lineage
- `loops` — persistent autonomous loops

## Key Patterns
- All state via SQLite — no JSON files for state management
- `mac10` CLI is the only interface — no direct file/DB manipulation
- Worker commands expect `worker_id` as string; allocator commands expect number
- Allocator runs every 2s, notifies Master-3 agent when tasks+workers available
- Watchdog runs every 10s, escalates: warn(60s)->nudge(90s)->triage(120s)->terminate(180s)
- Merger checks actual GitHub PR state before marking conflict
- Knowledge files synced from project root to worktrees before each task
- Sentinel uses `-p` (print mode) to ensure Claude exits after processing
- Worker backend abstraction: tmux/docker/sandbox via MAC10_WORKER_BACKEND env var
- Backend priority: msb (sandbox) -> Docker -> tmux fallback
- Research pipeline: ChatGPT-driven external search via queue -> driver -> ingest -> insight ingestion
- codex10 namespace: wrapper in .claude/scripts/codex10 routes to mac10 with MAC10_NAMESPACE=codex10
- Loop system: persistent autonomous loops with sentinels, checkpoints, and heartbeats
- Insight ingestion: lifecycle events auto-captured as project memory snapshots/artifacts
- Model routing: configurable model selection (spark/mini/flagship) with routing classes

## Entry Points
- `coordinator/src/index.js` — main coordinator (inits db, cli-server, allocator, watchdog, merger, overlay, sandbox-manager, microvm-manager)
- `coordinator/bin/mac10` — CLI client (sends JSON over Unix socket or TCP bridge)
- `scripts/worker-sentinel.sh` — worker lifecycle loop in tmux
- `scripts/loop-sentinel.sh` — loop lifecycle wrapper
- `scripts/research-sentinel.sh` — research driver restart wrapper

## Coupling Hotspots
- `cli-server.js` + `db.js` (tightest coupling — CLI routes call db functions directly)
- `watchdog.js` + `db.js` + `tmux.js` (escalation reads DB, kills via tmux)
- `merger.js` + `db.js` + `insight-ingestion.js` (merge events trigger insight capture)
- `allocator.js` + `db.js` + `insight-ingestion.js` (allocation triggers insights)
- `scripts/start-common.sh` + `.claude/scripts/codex10` (startup coupling)
- `setup.sh` + agent loop templates (change together frequently)
- `worker-backend.js` + `sandbox-manager.js` + `microvm-manager.js` (backend selection coupling)

## Large Files (potential split candidates)
- coordinator/tests/cli.test.js (4952L)
- coordinator/src/cli-server.js (4519L)
- coordinator/src/db.js (4419L)
- scripts/chatgpt-driver.py (2795L)
- coordinator/src/web-server.js (2493L, disabled)

Last scanned: 2026-03-31
