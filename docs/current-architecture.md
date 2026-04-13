# Current Architecture

Purpose: describe the active mac10 system after GUI and first-class Codex removal.

## Active Runtime Shape

`start.sh` is the top-level operator entrypoint. It resolves the configured provider, then delegates to `scripts/start-provider.sh <provider>`, which calls `scripts/start-common.sh`. `start-claude.sh` remains as a compatibility shim only.

The startup path performs three high-level phases:

- run `setup.sh` for coordinator CLI wrappers, worker worktrees, trusted directories, and runtime assets
- ensure the research sentinel/driver is running and healthy
- leave coordinator, sentinels, masters, workers, and loops controlled through `mac10`

Claude is the current built-in provider and now has the first enabled provider manifest at `plugins/agents/claude/plugin.json`. Provider identity, CLI command, health/auth check, role model defaults, launch argv, provider environment, and task usage output schema are resolved through the provider interface. Codex, DeepSeek, and Gemini exist only as disabled provider scaffold manifests until their local CLI/auth, launch, and output-schema smokes pass.

## Coordinator

The coordinator owns durable state and command contracts:

- `coordinator/bin/mac10` is the CLI entrypoint
- `coordinator/src/cli-server.js` handles RPC commands and command validation
- `coordinator/src/commands/sandbox.js` handles sandbox and task-sandbox command execution behind the existing RPC contract
- `coordinator/src/commands/memory.js` handles memory retrieval command execution behind the existing RPC contract
- `coordinator/src/db.js` and `coordinator/src/schema.sql` own persistent state
- `coordinator/src/allocator.js` handles task availability and assignment signaling
- `coordinator/src/watchdog.js` handles stale assignment, loop, and integration recovery
- `coordinator/src/merger.js` handles merge queue processing and merge recovery
- `coordinator/src/overlay.js` writes task-specific worker context
- `coordinator/src/context-bundle.js` serves bounded task context through `mac10 task-context <task_id>`

Large files remain in `cli-server.js` and `db.js`. Sandbox and memory command execution are the first extracted command domains; remaining domains should move one at a time only after focused coverage is identified.

## Agent Roles

Human communication goes through Master 1. Workers should not bypass the coordinator for task state.

Current role boundaries:

- Master 1: user-facing intake and operator communication
- Architect/allocator flow: decompose requests, assign tasks, and route work
- Worker: take one assigned task, edit only scoped source files, validate, commit locally, report through `mac10`
- Sentinels: launch/relaunch agents, send heartbeats, preserve namespace, and avoid destructive recovery
- Watchdog: recover stale coordinator state and reroute where existing product rules allow it

Worker startup context is generated from source/config files only. Runtime state such as `.claude/state/`, `.claude/logs/`, `.claude/signals/`, DB files, live E2E outputs, and bytecode must not be copied into worker worktrees.

## Research Queue

The external research queue is core infrastructure, not a fallback. Agents should not use native web browsing. They should check `.claude/knowledge/research/topics/` first, then queue research with `mac10 queue-research` when codebase-local knowledge is insufficient.

Research runtime state is local and ignored. Startup now treats a missing research sentinel as a startup failure.

## Context And Worktrees

Use `mac10 task-context <task_id>` for the coordinator-served task bundle before worker edits. It returns task assignment, safe edit scope, validation commands, relevant knowledge/research excerpts, known pitfalls, related failures, sandbox state, and runtime health.

Use `docs/agent-context-map.md` before broad edits. It separates generated/runtime paths from source-of-truth files and gives source-area guidance by task domain.

Use `docs/worktree-lifecycle.md` for current worktree rules. Root worker worktrees live under `.worktrees/`; live E2E workspaces under `.live-e2e-workspaces/` are generated artifacts, not normal source context.

## Removed Active Paths

The GUI path has been removed from the active system. GUI server code, routes, static assets, tests, docs, setup references, and `mac10 gui` assumptions were removed or replaced with coordinator health/status behavior.

Codex-specific root runtime paths were removed from active startup and instructions. Codex remains only a future provider-plugin concept under `plugins/agents/<provider>/`.

## Validation Baseline

Use `scripts/preflight.sh` for a full baseline. It reports branch/upstream, ahead/behind, dirty paths, tracked generated artifacts, worktree counts, stale worktree registrations, and coordinator tests.

Provider checks in preflight resolve the selected/default provider through the provider interface, verify its manifest is installed, check the provider CLI/auth command, and confirm noninteractive launch args render from the manifest.

Provider launch coverage lives in `coordinator/tests/provider-interface.test.js`. It verifies dry-run and manifest-rendered launch args for Master 1, worker, loop, research-discovery, live-audit, and live-repair prompts without invoking the provider CLI.

Docker worker provider coverage lives in `mac10 sandbox-provider-smoke [provider]`. It runs inside the worker image, loads the selected provider manifest, checks the provider CLI/auth command, and renders the noninteractive worker launch path. Passing `--run` additionally executes a tiny noninteractive provider prompt when credentials are available inside the container.

Latest local Docker provider evidence from 2026-04-13: rebuilding `mac10-worker:latest` succeeded, and direct Claude `providerSmoke(..., { build: false })` passed with CLI availability, auth check, noninteractive dry-run launch, and provider smoke all green.

Current expected source baseline:

- tracked generated artifacts: 0
- registered worktrees observed: 30
- stale prunable worktrees observed by dry-run: 0
- coordinator tests: passing

## Remaining Architecture Decisions

The next-loop route is now recorded in `docs/next-loop-decisions.md`.

Selected defaults:

- make a local checkpoint commit before implementation; do not push automatically
- keep `10.1` isolated; do not rebase, merge, or reset in the next manual pass
- live validation has passed at coordinator-smoke depth; full Master-1/provider-agent live audit remains heavier validation
- use `plugins/agents/<provider>/plugin.json` for provider plugins, with Claude first/default
- use root worker homes plus disposable per-task sandboxes
- use explicit task states for blocking, non-blocking, superseded, failed-needs-reroute, and failed-final work

Still deferred after the provider-interface slice:

- non-Claude provider implementations
- non-Claude local launch smokes, provider-specific local auth checks, and validated output schemas before enablement
- sandbox cleanup implementation
- task-state schema migration
- ~~coordinator-served task context bundles~~ (done)
- ~~canonical knowledge layout and health checks~~ (done)
- remaining module boundaries for splitting `cli-server.js` and `db.js`
